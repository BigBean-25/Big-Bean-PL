import { query } from '../config/database.js';
import { findConversionFactor } from '../utils/uomUtils.js';

const SOURCE_KEYS = ['opening_stock', 'closing_stock', 'material_purchase', 'item_sales', 'physical_stock_counts'];

const num = (value) => Number(value || 0);
const normalizeName = (value) => String(value || '').trim().toLowerCase();

const isValidDateString = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw;
};

const buildPeriod = (asOfDate) => {
  const current = new Date(`${asOfDate}T00:00:00Z`);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth() + 1;
  const previous = new Date(Date.UTC(year, current.getUTCMonth(), 0));
  return {
    year,
    month,
    previous_year: previous.getUTCFullYear(),
    previous_month: previous.getUTCMonth() + 1,
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`,
    previousStartDate: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}-01`,
    previousEndDate: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}-${new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 0)).getUTCDate()}`,
  };
};

const getSourcePermissions = async (roleId) => {
  const placeholders = SOURCE_KEYS.map(() => '?').join(',');
  const rows = await query(
    `SELECT module_key, can_view
     FROM role_permissions
     WHERE role_id = ? AND module_key IN (${placeholders})`,
    [roleId, ...SOURCE_KEYS]
  );

  const permissions = Object.fromEntries(SOURCE_KEYS.map((key) => [key, false]));
  for (const row of rows) {
    permissions[row.module_key] = Boolean(row.can_view);
  }
  return permissions;
};

const materialKey = (row) => (
  row.raw_material_id !== null && row.raw_material_id !== undefined
    ? `id:${Number(row.raw_material_id)}`
    : `name:${normalizeName(row.raw_material_name || row.material_name || row.item_name)}`
);

const aggregateAccountingRows = async (rows) => {
  const materialMap = new Map();
  const totalDistinctMaterials = new Set();
  const mappedDistinctMaterials = new Set();
  const missingConversionMaterials = new Set();
  let mappedRows = 0;
  let unmappedRows = 0;
  let rowsWithValidBaseUnitConversion = 0;
  let rowsWithoutConversion = 0;

  for (const row of rows) {
    const key = materialKey(row);
    const mapped = row.raw_material_id !== null && row.raw_material_id !== undefined;
    totalDistinctMaterials.add(key);
    if (mapped) {
      mappedRows += 1;
      mappedDistinctMaterials.add(key);
    } else {
      unmappedRows += 1;
    }

    if (!materialMap.has(key)) {
      materialMap.set(key, {
        key,
        raw_material_id: row.raw_material_id ?? null,
        material_name: row.material_name || row.raw_material_name || row.item_name || 'Unknown material',
        base_unit: row.base_unit_name || null,
        qty_base: 0,
        value_total: 0,
        row_count: 0,
        convertible_rows: 0,
        non_convertible_rows: 0,
        mapped: mapped,
      });
    }

    const entry = materialMap.get(key);
    entry.row_count += 1;
    entry.value_total += num(row.value ?? row.total_amount ?? 0);

    if (!mapped) continue;

    const baseUnitId = row.base_unit_id || null;
    if (!baseUnitId || !row.unit_id) {
      entry.non_convertible_rows += 1;
      rowsWithoutConversion += 1;
      missingConversionMaterials.add(key);
      continue;
    }

    try {
      const factor = await findConversionFactor(row.unit_id, baseUnitId);
      entry.qty_base += num(row.qty) * factor;
      entry.convertible_rows += 1;
      rowsWithValidBaseUnitConversion += 1;
    } catch {
      entry.non_convertible_rows += 1;
      rowsWithoutConversion += 1;
      missingConversionMaterials.add(key);
    }
  }

  return {
    materialMap,
    mapping: {
      total_rows: rows.length,
      mapped_rows: mappedRows,
      unmapped_rows: unmappedRows,
      mapped_distinct_materials: mappedDistinctMaterials.size,
      total_distinct_materials: totalDistinctMaterials.size,
    },
    uom: {
      total_mapped_rows: mappedRows,
      rows_with_valid_base_unit_conversion: rowsWithValidBaseUnitConversion,
      rows_without_conversion: rowsWithoutConversion,
      distinct_affected_materials: mappedDistinctMaterials.size,
      distinct_materials_missing_conversion: missingConversionMaterials.size,
    },
  };
};

const buildContinuityRows = (previousRows, openingRows) => {
  const byKey = new Map();
  const upsert = (row, kind) => {
    const key = materialKey(row);
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        raw_material_id: row.raw_material_id ?? null,
        material_name: row.material_name || row.raw_material_name || 'Unknown material',
        base_unit: row.base_unit_name || null,
        previous_closing_qty_base: null,
        current_opening_qty_base: null,
        previous_closing_value: null,
        current_opening_value: null,
        previous_closing_comparable: false,
        current_opening_comparable: false,
        comparable: false,
      });
    }
    const entry = byKey.get(key);
    if (kind === 'previous') {
      entry.previous_closing_qty_base = row.qty_base;
      entry.previous_closing_value = row.value_total;
      entry.previous_closing_comparable = row.comparable;
    } else {
      entry.current_opening_qty_base = row.qty_base;
      entry.current_opening_value = row.value_total;
      entry.current_opening_comparable = row.comparable;
    }
    entry.comparable = Boolean(entry.previous_closing_comparable && entry.current_opening_comparable);
  };

  previousRows.forEach((row) => upsert(row, 'previous'));
  openingRows.forEach((row) => upsert(row, 'opening'));

  const materials = [...byKey.values()].sort((a, b) => String(a.material_name).localeCompare(String(b.material_name)));
  return {
    comparable_rows: materials.filter((m) => m.comparable).length,
    non_comparable_rows: materials.filter((m) => !m.comparable).length,
    materials,
  };
};

const loadOpeningRows = async ({ outletId, year, month }) => query(
  `SELECT osi.raw_material_id, osi.raw_material_name, osi.qty, osi.unit_id, osi.value,
          rm.material_name, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name
   FROM opening_stock_uploads osu
   INNER JOIN opening_stock_items osi ON osi.upload_id = osu.id
   LEFT JOIN raw_materials rm ON rm.id = osi.raw_material_id
   LEFT JOIN units bu ON bu.id = rm.unit_id
   WHERE osu.outlet_id = ? AND osu.month = ? AND osu.year = ? AND osu.status = 'Completed' AND osu.approval_status = 'Verified'`,
  [outletId, month, year]
);

const loadClosingRows = async ({ outletId, year, month }) => query(
  `SELECT csi.raw_material_id, csi.raw_material_name, csi.qty, csi.unit_id, csi.value,
          rm.material_name, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name
   FROM closing_stock_uploads csu
   INNER JOIN closing_stock_items csi ON csi.upload_id = csu.id
   LEFT JOIN raw_materials rm ON rm.id = csi.raw_material_id
   LEFT JOIN units bu ON bu.id = rm.unit_id
   WHERE csu.outlet_id = ? AND csu.month = ? AND csu.year = ? AND csu.status = 'Completed' AND csu.approval_status = 'Verified'`,
  [outletId, month, year]
);

const loadMaterialPurchaseRows = async ({ outletId, startDate, endDate }) => query(
  `SELECT mpi.raw_material_id, mpi.raw_material_name, mpi.qty, mpi.unit_id, mpi.total_amount,
          rm.material_name, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name
   FROM material_purchase_uploads mpu
   INNER JOIN material_purchase_items mpi ON mpi.upload_id = mpu.id
   LEFT JOIN raw_materials rm ON rm.id = mpi.raw_material_id
   LEFT JOIN units bu ON bu.id = rm.unit_id
   WHERE mpu.outlet_id = ? AND mpu.status = 'Completed' AND mpu.approval_status = 'Verified'
     AND mpi.date BETWEEN ? AND ?`,
  [outletId, startDate, endDate]
);

const loadApprovedSalesPresence = async ({ outletId, startDate, endDate }) => {
  const rows = await query(
    `SELECT COUNT(*) AS count_rows
     FROM petpooja_sales_uploads
     WHERE outlet_id = ? AND status = 'Approved'
       AND COALESCE(upload_date_from, upload_date) <= ?
       AND COALESCE(upload_date_to, upload_date) >= ?`,
    [outletId, endDate, startDate]
  );
  return Number(rows[0]?.count_rows || 0) > 0;
};

const loadPhysicalLocationCandidates = async (outletId) => query(
  `SELECT id, location_code, location_name
   FROM locations
   WHERE outlet_id = ? AND location_type = 'Outlet' AND is_active = 1 AND is_inventory_location = 1
   ORDER BY id`,
  [outletId]
);

const loadLedgerActivity = async (locationId, asOfDate) => {
  const rows = await query(
    `SELECT COUNT(*) AS ledger_row_count, MAX(transaction_date) AS latest_movement_date
     FROM stock_ledger
     WHERE location_id = ? AND transaction_date <= ?
       AND transaction_type NOT IN ('TRANSIT_DAMAGE', 'TRANSIT_SHORT')`,
    [locationId, asOfDate]
  );
  const row = rows[0] || {};
  const ledgerRowCount = Number(row.ledger_row_count || 0);
  return {
    has_activity: ledgerRowCount > 0,
    latest_movement_date: ledgerRowCount > 0 ? row.latest_movement_date : null,
    ledger_row_count: ledgerRowCount,
  };
};

const loadLatestPhysicalCount = async (locationId) => {
  const rows = await query(
    `SELECT id, count_date, posted_at, status
     FROM physical_stock_counts
     WHERE location_id = ? AND status IN ('Posted', 'Locked')
     ORDER BY posted_at DESC, id DESC
     LIMIT 1`,
    [locationId]
  );
  const row = rows[0];
  if (!row) {
    return { allowed: true, exists: false, id: null, count_date: null, posted_at: null, status: null };
  }
  return {
    allowed: true,
    exists: true,
    id: row.id,
    count_date: row.count_date,
    posted_at: row.posted_at,
    status: row.status,
  };
};

export const getCoverageReadiness = async ({ outletId, asOfDate, locationScope, outletScope, roleId }) => {
  const outletRows = await query(
    'SELECT id, outlet_code, outlet_name, is_active FROM outlets WHERE id = ? LIMIT 1',
    [outletId]
  );
  const outlet = outletRows[0];
  if (!outlet) {
    const err = new Error('Outlet not found');
    err.statusCode = 404;
    throw err;
  }

  if (outletScope && !outletScope.all) {
    const allowedOutlets = (outletScope.outletIds || []).map(Number);
    if (!allowedOutlets.includes(Number(outletId))) {
      const err = new Error('You do not have access to the requested outlet');
      err.statusCode = 403;
      throw err;
    }
  }

  if (!isValidDateString(asOfDate)) {
    const err = new Error('as_of_date must be a valid YYYY-MM-DD date');
    err.statusCode = 400;
    throw err;
  }

  const period = buildPeriod(asOfDate);
  const permissions = await getSourcePermissions(roleId);
  const source_presence = {
    opening_stock: { allowed: permissions.opening_stock, present: null },
    closing_stock: { allowed: permissions.closing_stock, present: null },
    material_purchase: { allowed: permissions.material_purchase, present: null },
    sales: { allowed: permissions.item_sales, present: null },
    previous_closing: { allowed: permissions.closing_stock, present: null },
    current_opening: { allowed: permissions.opening_stock, present: null },
  };

  const mapping = {
    opening_stock: { allowed: permissions.opening_stock, total_rows: null, mapped_rows: null, unmapped_rows: null, mapped_distinct_materials: null, total_distinct_materials: null },
    closing_stock: { allowed: permissions.closing_stock, total_rows: null, mapped_rows: null, unmapped_rows: null, mapped_distinct_materials: null, total_distinct_materials: null },
    material_purchase: { allowed: permissions.material_purchase, total_rows: null, mapped_rows: null, unmapped_rows: null, mapped_distinct_materials: null, total_distinct_materials: null },
  };

  const uom = {
    opening_stock: { allowed: permissions.opening_stock, total_mapped_rows: null, rows_with_valid_base_unit_conversion: null, rows_without_conversion: null, distinct_affected_materials: null, distinct_materials_missing_conversion: null },
    closing_stock: { allowed: permissions.closing_stock, total_mapped_rows: null, rows_with_valid_base_unit_conversion: null, rows_without_conversion: null, distinct_affected_materials: null, distinct_materials_missing_conversion: null },
    material_purchase: { allowed: permissions.material_purchase, total_mapped_rows: null, rows_with_valid_base_unit_conversion: null, rows_without_conversion: null, distinct_affected_materials: null, distinct_materials_missing_conversion: null },
  };

  let openingRows = [];
  let closingRows = [];
  let purchaseRows = [];
  let openingAggregate = null;
  let closingAggregate = null;
  let purchaseAggregate = null;

  if (permissions.opening_stock) {
    openingRows = await loadOpeningRows({ outletId, year: period.year, month: period.month });
    openingAggregate = await aggregateAccountingRows(openingRows);
    mapping.opening_stock = { allowed: true, ...openingAggregate.mapping };
    uom.opening_stock = { allowed: true, ...openingAggregate.uom };
    source_presence.opening_stock.present = openingRows.length > 0;
    source_presence.current_opening.present = openingRows.length > 0;
  }

  if (permissions.closing_stock) {
    closingRows = await loadClosingRows({ outletId, year: period.year, month: period.month });
    closingAggregate = await aggregateAccountingRows(closingRows);
    mapping.closing_stock = { allowed: true, ...closingAggregate.mapping };
    uom.closing_stock = { allowed: true, ...closingAggregate.uom };
    source_presence.closing_stock.present = closingRows.length > 0;
  }

  if (permissions.material_purchase) {
    purchaseRows = await loadMaterialPurchaseRows({ outletId, startDate: period.startDate, endDate: period.endDate });
    purchaseAggregate = await aggregateAccountingRows(purchaseRows);
    mapping.material_purchase = { allowed: true, ...purchaseAggregate.mapping };
    uom.material_purchase = { allowed: true, ...purchaseAggregate.uom };
    source_presence.material_purchase.present = purchaseRows.length > 0;
  }

  if (permissions.item_sales) {
    source_presence.sales.present = await loadApprovedSalesPresence({ outletId, startDate: period.startDate, endDate: period.endDate });
  }

  if (permissions.closing_stock) {
    const previousClosingRows = await loadClosingRows({ outletId, year: period.previous_year, month: period.previous_month });
    source_presence.previous_closing.present = previousClosingRows.length > 0;
  }

  if (permissions.opening_stock) {
    source_presence.current_opening.present = openingRows.length > 0;
  }

  const physical = {
    allowed: true,
    location_status: null,
    location: null,
    candidate_count: 0,
    candidates: [],
    ledger_activity: null,
    latest_physical_count: {
      allowed: Boolean(permissions.physical_stock_counts),
      exists: null,
      id: null,
      count_date: null,
      posted_at: null,
      status: null,
    },
  };

  const candidates = await loadPhysicalLocationCandidates(outletId);
  physical.candidate_count = candidates.length;
  if (candidates.length === 0) {
    physical.location_status = 'NONE';
  } else if (candidates.length === 1) {
    const location = candidates[0];
    if (locationScope && !locationScope.all) {
      const allowedLocations = (locationScope.locationIds || []).map(Number);
      if (!allowedLocations.includes(Number(location.id))) {
        const err = new Error('You do not have access to the requested location');
        err.statusCode = 403;
        throw err;
      }
    }
    physical.location_status = 'UNIQUE';
    physical.location = location;
    physical.ledger_activity = await loadLedgerActivity(location.id, asOfDate);
    if (permissions.physical_stock_counts) {
      physical.latest_physical_count = await loadLatestPhysicalCount(location.id);
    }
  } else {
    physical.location_status = 'AMBIGUOUS';
    if (locationScope && !locationScope.all) {
      const allowedLocations = (locationScope.locationIds || []).map(Number);
      physical.candidates = candidates.filter((candidate) => allowedLocations.includes(Number(candidate.id)));
    } else {
      physical.candidates = candidates;
    }
  }

  let continuity = {
    previous_closing_present: Boolean(source_presence.previous_closing.present),
    current_opening_present: Boolean(source_presence.current_opening.present),
    comparable_rows: null,
    non_comparable_rows: null,
    materials: [],
  };

  if (permissions.opening_stock && permissions.closing_stock && source_presence.previous_closing.present && source_presence.current_opening.present) {
    const previousClosingRows = await loadClosingRows({ outletId, year: period.previous_year, month: period.previous_month });
    const previousAggregate = await aggregateAccountingRows(previousClosingRows);
    const currentOpeningAggregate = await aggregateAccountingRows(openingRows);

    const mapRowToContinuity = (row) => ({
      key: row.key,
      raw_material_id: row.raw_material_id,
      material_name: row.material_name,
      base_unit: row.base_unit,
      qty_base: row.qty_base,
      value_total: row.value_total,
      comparable: row.mapped && row.convertible_rows > 0,
    });

    const previousRows = [...previousAggregate.materialMap.values()].map(mapRowToContinuity);
    const currentRows = [...currentOpeningAggregate.materialMap.values()].map(mapRowToContinuity);
    const byKey = new Map();

    for (const row of previousRows) {
      byKey.set(row.key, {
        key: row.key,
        raw_material_id: row.raw_material_id,
        material_name: row.material_name,
        base_unit: row.base_unit,
        previous_closing_qty_base: row.qty_base,
        current_opening_qty_base: null,
        previous_closing_value: row.value_total,
        current_opening_value: null,
        comparable: false,
      });
    }

    for (const row of currentRows) {
      if (!byKey.has(row.key)) {
        byKey.set(row.key, {
          key: row.key,
          raw_material_id: row.raw_material_id,
          material_name: row.material_name,
          base_unit: row.base_unit,
          previous_closing_qty_base: null,
          current_opening_qty_base: row.qty_base,
          previous_closing_value: null,
          current_opening_value: row.value_total,
          comparable: false,
        });
      } else {
        const entry = byKey.get(row.key);
        entry.current_opening_qty_base = row.qty_base;
        entry.current_opening_value = row.value_total;
        entry.comparable = Boolean(entry.previous_closing_qty_base !== null && entry.current_opening_qty_base !== null);
      }
    }

    continuity.materials = [...byKey.values()].sort((a, b) => String(a.material_name).localeCompare(String(b.material_name)));
    continuity.comparable_rows = continuity.materials.filter((m) => m.comparable).length;
    continuity.non_comparable_rows = continuity.materials.filter((m) => !m.comparable).length;
  }

  return {
    outlet: {
      id: outlet.id,
      outlet_code: outlet.outlet_code,
      outlet_name: outlet.outlet_name,
      is_active: Boolean(Number(outlet.is_active)),
    },
    as_of_date: asOfDate,
    period: {
      year: period.year,
      month: period.month,
      previous_year: period.previous_year,
      previous_month: period.previous_month,
    },
    permissions: {
      opening_stock: permissions.opening_stock,
      closing_stock: permissions.closing_stock,
      material_purchase: permissions.material_purchase,
      item_sales: permissions.item_sales,
      physical_stock_counts: permissions.physical_stock_counts,
    },
    source_presence,
    mapping,
    uom,
    physical,
    continuity,
  };
};
