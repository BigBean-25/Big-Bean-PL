import { query } from '../config/database.js';
import { findConversionFactor } from '../utils/uomUtils.js';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

// Quantities below this are treated as equal - ledger/base-unit math carries
// 4-decimal precision, so a zero-diff check needs a small tolerance.
const QTY_EPSILON = 0.0005;

const COST_BASIS_WARNING = 'Accounting and physical values use different cost bases.';

// Ledger rows are always written in the material's base unit (see
// postOpening/postGRN/receiveTransfer in warehouseService.js), so physical
// sums are already base-unit quantities. Transit damage/short rows record
// stock that never became usable and are excluded from balances everywhere
// else too (getCurrentStock, getClosingStockReport, batch availability).
const NON_STOCK_TYPES = ['TRANSIT_DAMAGE', 'TRANSIT_SHORT'];

const httpError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Closing stock uploads are month/year buckets (closing_stock_uploads.month/
// year, same semantics plCalculator uses for monthly P&L), so the accounting
// period is the calendar month containing as_of_date.
const accountingPeriodFor = (asOfDate) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(asOfDate || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
};

export const getOutletReconciliation = async ({ outletId, asOfDate, locationScope, outletScope }) => {
  const period = accountingPeriodFor(asOfDate);
  if (!period) throw httpError('as_of_date must be a valid YYYY-MM-DD date');

  const outletRows = await query(
    'SELECT id, outlet_code, outlet_name, is_active FROM outlets WHERE id = ? LIMIT 1',
    [outletId]
  );
  const outlet = outletRows[0];
  if (!outlet) throw httpError('Outlet not found', 404);

  if (outletScope && !outletScope.all) {
    const allowedOutlets = (outletScope.outletIds || []).map(Number);
    if (!allowedOutlets.includes(Number(outletId))) {
      throw httpError('You do not have access to the requested outlet', 403);
    }
  }

  // The outlet's physical inventory location. A mapped row that is inactive
  // or not inventory-enabled doesn't count as a usable physical location -
  // surfaced as "no location" coverage rather than a server error.
  const locationRows = await query(
    `SELECT id, location_code, location_name, location_type, outlet_id, is_inventory_location, is_active
     FROM locations
     WHERE outlet_id = ? AND location_type = 'Outlet'
     ORDER BY is_active DESC, is_inventory_location DESC, id
     LIMIT 1`,
    [outletId]
  );
  const mappedLocation = locationRows[0] || null;
  const location = mappedLocation && Number(mappedLocation.is_active) === 1 && Number(mappedLocation.is_inventory_location) === 1
    ? mappedLocation
    : null;

  if (location && locationScope && !locationScope.all) {
    const allowedLocations = (locationScope.locationIds || []).map(Number);
    if (!allowedLocations.includes(Number(location.id))) {
      throw httpError('You do not have access to the requested location', 403);
    }
  }

  const ledgerActivity = location
    ? await query(
        'SELECT id FROM stock_ledger WHERE location_id = ? AND transaction_date <= ? LIMIT 1',
        [location.id, asOfDate]
      )
    : [];

  const closingUpload = await query(
    `SELECT id, batch_id, month, year, status, created_at
     FROM closing_stock_uploads
     WHERE outlet_id = ? AND month = ? AND year = ? AND status = 'Completed' AND approval_status = 'Verified'
     ORDER BY id DESC
     LIMIT 1`,
    [outletId, period.month, period.year]
  );

  const physicalLocationExists = Boolean(location);
  const ledgerActivityExists = ledgerActivity.length > 0;
  const closingUploadExists = closingUpload.length > 0;

  // --- Accounting side: completed closing-stock upload items for the period ---
  const accountingRows = closingUploadExists
    ? await query(
        `SELECT csi.raw_material_id, csi.raw_material_name, csi.qty, csi.unit_id, csi.value,
                rm.material_name, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name
         FROM closing_stock_items csi
         INNER JOIN closing_stock_uploads csu ON csi.upload_id = csu.id
         LEFT JOIN raw_materials rm ON rm.id = csi.raw_material_id
         LEFT JOIN units bu ON bu.id = rm.unit_id
         WHERE csi.outlet_id = ? AND csu.id = ?`,
        [outletId, closingUpload[0].id]
      )
    : [];

  const accountingByMaterial = new Map();
  for (const row of accountingRows) {
    const key = row.raw_material_id === null ? `name:${row.raw_material_name}` : Number(row.raw_material_id);
    if (!accountingByMaterial.has(key)) {
      accountingByMaterial.set(key, {
        raw_material_id: row.raw_material_id,
        material_name: row.material_name || row.raw_material_name,
        base_unit_id: row.base_unit_id || null,
        base_unit: row.base_unit_name || null,
        rows: [],
      });
    }
    accountingByMaterial.get(key).rows.push(row);
  }

  // --- Physical side: cumulative ledger position at the mapped location ---
  const physicalRows = location
    ? await query(
        `SELECT sl.raw_material_id, rm.material_name, rm.material_code,
                rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name,
                COALESCE(SUM(sl.qty_in), 0) - COALESCE(SUM(sl.qty_out), 0) AS physical_qty_base
         FROM stock_ledger sl
         LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
         LEFT JOIN units bu ON bu.id = rm.unit_id
         WHERE sl.location_id = ? AND sl.transaction_date <= ?
           AND sl.transaction_type NOT IN ('${NON_STOCK_TYPES.join("','")}')
         GROUP BY sl.raw_material_id, rm.material_name, rm.material_code, rm.unit_id, bu.unit_name`,
        [location.id, asOfDate]
      )
    : [];

  const physicalByMaterial = new Map();
  for (const row of physicalRows) {
    physicalByMaterial.set(Number(row.raw_material_id), {
      raw_material_id: row.raw_material_id,
      material_name: row.material_name,
      base_unit_id: row.base_unit_id || null,
      base_unit: row.base_unit_name || null,
      physical_qty_base: num(row.physical_qty_base),
    });
  }

  // --- Per-material reconciliation ---
  // Conversion factors are cached per (from,to) pair; a miss is cached as
  // null so a material with no defined conversion is non-comparable instead
  // of silently treated as zero or base-unit equal.
  const factorCache = new Map();
  const conversionFactor = async (fromUnitId, toUnitId) => {
    const cacheKey = `${fromUnitId}->${toUnitId}`;
    if (!factorCache.has(cacheKey)) {
      try {
        factorCache.set(cacheKey, await findConversionFactor(fromUnitId, toUnitId));
      } catch {
        factorCache.set(cacheKey, null);
      }
    }
    return factorCache.get(cacheKey);
  };

  // Totals are tracked independently of per-material comparability: the
  // accounting total sums every successfully normalized upload quantity (even
  // for materials with no physical counterpart) and the physical total sums
  // every ledger balance at the location (even for materials absent from the
  // upload). Missing sides contribute null, never a fake zero.
  let accountingQtyTotal = 0;
  let accountingIncomplete = false;

  const materialKeys = new Set([...accountingByMaterial.keys(), ...physicalByMaterial.keys()]);
  const materials = [];
  for (const key of materialKeys) {
    const acc = accountingByMaterial.get(key) || null;
    const phys = physicalByMaterial.get(key) || null;
    const baseUnitId = acc?.base_unit_id || phys?.base_unit_id || null;
    const baseUnit = acc?.base_unit || phys?.base_unit || null;

    let accountingQtyBase = null;
    let accountingNote = null;
    if (acc) {
      if (!baseUnitId) {
        accountingNote = 'Material has no base unit configured';
      } else {
        let total = 0;
        let failed = false;
        for (const row of acc.rows) {
          if (!row.unit_id) { failed = true; accountingNote = 'Upload row has no unit'; break; }
          const factor = await conversionFactor(row.unit_id, baseUnitId);
          if (factor === null) { failed = true; accountingNote = 'No UOM conversion to base unit'; break; }
          total += num(row.qty) * factor;
        }
        if (!failed) accountingQtyBase = total;
      }
      if (accountingQtyBase === null) accountingIncomplete = true;
      else accountingQtyTotal += accountingQtyBase;
    }

    const physicalQtyBase = phys ? phys.physical_qty_base : null;

    // Every N/A carries an explicit reason so the UI and coverage logic can
    // tell one-sided populations apart from a genuine conversion failure.
    let status;
    let note;
    let reason = null;
    if (!acc) {
      status = 'N/A';
      reason = 'physical_only';
      note = 'Physical only - material not present in the completed closing stock upload';
    } else if (accountingQtyBase === null) {
      status = 'N/A';
      reason = 'conversion_missing';
      note = accountingNote || 'Accounting quantity could not be normalized to the base unit';
    } else if (physicalQtyBase === null) {
      status = 'N/A';
      reason = 'accounting_only';
      note = 'Accounting only - no physical ledger activity for this material';
    } else {
      const diff = physicalQtyBase - accountingQtyBase;
      status = Math.abs(diff) <= QTY_EPSILON ? 'MATCH' : 'DIFFERENCE';
      note = status === 'MATCH' ? 'Quantities match' : 'Physical − Accounting';
    }

    materials.push({
      raw_material_id: acc?.raw_material_id ?? phys?.raw_material_id ?? null,
      material_name: acc?.material_name || phys?.material_name || 'Unknown material',
      base_unit: baseUnit,
      accounting_qty_base: accountingQtyBase === null ? null : num(accountingQtyBase.toFixed(4)),
      physical_qty_base: physicalQtyBase === null ? null : num(physicalQtyBase.toFixed(4)),
      qty_difference: status === 'N/A' ? null : num((physicalQtyBase - accountingQtyBase).toFixed(4)),
      status,
      reason,
      note,
    });
  }

  materials.sort((a, b) => String(a.material_name).localeCompare(String(b.material_name)));

  const comparable = materials.filter((m) => m.status !== 'N/A');
  const nonComparable = materials.filter((m) => m.status === 'N/A');

  // Coverage is evaluated only now, after material classification - both data
  // sources merely existing is not enough for GREEN. Any unresolved
  // (non-comparable) material row makes the comparison incomplete.
  const conversionFailures = materials.filter((m) => m.reason === 'conversion_missing').length;
  const oneSided = materials.filter((m) => m.reason === 'accounting_only' || m.reason === 'physical_only').length;

  const notes = [];
  if (!mappedLocation) {
    notes.push('No physical outlet location is mapped to this outlet.');
  } else if (!location) {
    notes.push('Mapped outlet location exists but is inactive or not inventory-enabled.');
  }
  if (location && !ledgerActivityExists) {
    notes.push('No physical ledger activity recorded up to the as-of date.');
  }
  if (!closingUploadExists) {
    notes.push(`No completed closing stock upload for ${period.year}-${String(period.month).padStart(2, '0')}.`);
  }
  if (conversionFailures > 0) {
    notes.push(`${conversionFailures} material(s) could not be normalized to base units (missing UOM conversion or base unit).`);
  }
  if (oneSided > 0) {
    notes.push(`${oneSided} material(s) exist on only one side (accounting upload or physical ledger) and cannot be compared.`);
  }
  if (physicalLocationExists && ledgerActivityExists && closingUploadExists && materials.length === 0) {
    notes.push('No materials found in either the closing upload or the physical ledger.');
  }

  const coverage = {
    outlet: { id: outlet.id, outlet_code: outlet.outlet_code, outlet_name: outlet.outlet_name },
    physical_location: location
      ? { id: location.id, location_code: location.location_code, location_name: location.location_name }
      : null,
    physical_location_exists: physicalLocationExists,
    ledger_activity_exists: ledgerActivityExists,
    closing_upload_exists: closingUploadExists,
    status: !physicalLocationExists
      ? 'RED'
      : (!ledgerActivityExists || !closingUploadExists || comparable.length === 0 || nonComparable.length > 0 ? 'AMBER' : 'GREEN'),
    notes,
  };

  // --- Values: side-by-side only, deliberately no difference/variance ---
  const accountingValue = closingUploadExists
    ? await query(
        `SELECT COALESCE(SUM(csi.value), 0) AS total
         FROM closing_stock_items csi
         WHERE csi.upload_id = ? AND csi.outlet_id = ?`,
        [closingUpload[0].id, outletId]
      )
    : [{ total: 0 }];

  const physicalValue = location
    ? await query(
        `SELECT COALESCE(SUM(value_in), 0) - COALESCE(SUM(value_out), 0) AS total
         FROM stock_ledger
         WHERE location_id = ? AND transaction_date <= ?
           AND transaction_type NOT IN ('${NON_STOCK_TYPES.join("','")}')`,
        [location.id, asOfDate]
      )
    : [{ total: 0 }];

  // --- Physical movement summary by transaction type (cumulative to cutoff) ---
  const movements = location
    ? await query(
        `SELECT transaction_type,
                COALESCE(SUM(qty_in), 0) AS qty_in,
                COALESCE(SUM(qty_out), 0) AS qty_out,
                COALESCE(SUM(qty_in), 0) - COALESCE(SUM(qty_out), 0) AS net_qty
         FROM stock_ledger
         WHERE location_id = ? AND transaction_date <= ?
         GROUP BY transaction_type
         ORDER BY transaction_type`,
        [location.id, asOfDate]
      )
    : [];

  // --- Opening stock: diagnostic only ---
  // The accounting opening upload and the physical OPENING ledger entries are
  // recorded by different flows at different times - shown side by side for
  // context, never classified GREEN and never compared monetarily.
  const openingAccounting = await query(
    `SELECT COUNT(*) AS item_count
     FROM opening_stock_items osi
     INNER JOIN opening_stock_uploads osu ON osi.upload_id = osu.id
     WHERE osi.outlet_id = ? AND osu.month = ? AND osu.year = ? AND osu.status = 'Completed' AND osu.approval_status = 'Verified'`,
    [outletId, period.month, period.year]
  );
  const openingPhysical = location
    ? await query(
        `SELECT COUNT(*) AS entries,
                COALESCE(SUM(qty_in), 0) - COALESCE(SUM(qty_out), 0) AS qty_base
         FROM stock_ledger
         WHERE location_id = ? AND transaction_type = 'OPENING' AND transaction_date <= ?`,
        [location.id, asOfDate]
      )
    : [{ entries: 0, qty_base: 0 }];

  return {
    outlet: coverage.outlet,
    as_of_date: asOfDate,
    period,
    coverage,
    summary: {
      accounting_materials: accountingByMaterial.size,
      physical_materials: physicalByMaterial.size,
      comparable_materials: comparable.length,
      non_comparable_materials: nonComparable.length,
      // Null when the source doesn't exist at all - a real zero is only
      // produced when the source exists and genuinely sums to zero.
      accounting_closing_qty_base: closingUploadExists ? num(accountingQtyTotal.toFixed(4)) : null,
      // Tri-state: null = no completed upload (flag meaningless), true = every
      // accounting row normalized, false = upload exists but rows failed.
      accounting_total_complete: closingUploadExists ? !accountingIncomplete : null,
      // A location with zero ledger rows is "no coverage", not "proven zero
      // stock" - only a ledger that exists and nets to zero may report 0.
      physical_closing_qty_base: ledgerActivityExists
        ? num([...physicalByMaterial.values()].reduce((s, p) => s + p.physical_qty_base, 0).toFixed(4))
        : null,
    },
    materials,
    values: {
      accounting_closing_value: closingUploadExists ? num(accountingValue[0].total) : null,
      physical_closing_value: ledgerActivityExists ? num(physicalValue[0].total) : null,
      cost_basis_warning: COST_BASIS_WARNING,
    },
    movements: movements.map((m) => ({
      transaction_type: m.transaction_type,
      qty_in: num(m.qty_in),
      qty_out: num(m.qty_out),
      net_qty: num(m.net_qty),
    })),
    opening: {
      accounting_upload_exists: num(openingAccounting[0]?.item_count) > 0,
      accounting_item_count: num(openingAccounting[0]?.item_count),
      physical_opening_entries: num(openingPhysical[0]?.entries),
      physical_opening_qty_base: location ? num(openingPhysical[0]?.qty_base) : null,
      status: 'AMBER',
      note: 'Diagnostic only: accounting opening uploads and physical OPENING ledger entries are separate events.',
    },
  };
};
