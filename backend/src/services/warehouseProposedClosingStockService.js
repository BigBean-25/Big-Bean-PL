import { query } from '../config/database.js';
import { findConversionFactor } from '../utils/uomUtils.js';

const NON_STOCK_TYPES = ['TRANSIT_DAMAGE', 'TRANSIT_SHORT'];

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));
const normalizeName = (value) => String(value || '').trim().toLowerCase();

const httpError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const isValidDateString = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw;
};

const accountingPeriodFor = (asOfDate) => {
  if (!isValidDateString(asOfDate)) return null;
  const date = new Date(`${String(asOfDate).trim()}T00:00:00Z`);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
};

const loadOutlet = async (outletId) => {
  const rows = await query(
    'SELECT id, outlet_code, outlet_name, is_active FROM outlets WHERE id = ? LIMIT 1',
    [outletId]
  );
  return rows[0] || null;
};

const loadPhysicalLocationCandidates = async (outletId) => query(
  `SELECT id, location_code, location_name
   FROM locations
   WHERE outlet_id = ? AND location_type = 'Outlet' AND is_active = 1 AND is_inventory_location = 1
   ORDER BY id`,
  [outletId]
);

const loadPhysicalRows = async (locationId, asOfDate) => query(
  `SELECT sl.raw_material_id, rm.material_code, rm.material_name,
          rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name,
          COALESCE(SUM(sl.qty_in), 0) - COALESCE(SUM(sl.qty_out), 0) AS physical_qty_base,
          COALESCE(SUM(sl.value_in), 0) - COALESCE(SUM(sl.value_out), 0) AS physical_ledger_value,
          MAX(sl.transaction_date) AS latest_movement_date,
          COUNT(*) AS ledger_row_count
   FROM stock_ledger sl
   LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
   LEFT JOIN units bu ON bu.id = rm.unit_id
   WHERE sl.location_id = ? AND sl.transaction_date <= ?
     AND sl.transaction_type NOT IN ('${NON_STOCK_TYPES.join("','")}')
   GROUP BY sl.raw_material_id, rm.material_code, rm.material_name, rm.unit_id, bu.unit_name
   ORDER BY rm.material_name, rm.material_code, sl.raw_material_id`,
  [locationId, asOfDate]
);

const loadLatestCompletedClosingUpload = async ({ outletId, year, month }) => {
  const rows = await query(
    `SELECT id, batch_id, month, year, status, created_at
     FROM closing_stock_uploads
     WHERE outlet_id = ? AND month = ? AND year = ? AND status = 'Completed' AND approval_status = 'Verified'
     ORDER BY id DESC
     LIMIT 1`,
    [outletId, month, year]
  );
  return rows[0] || null;
};

const loadCompletedClosingRows = async ({ uploadId, outletId }) => query(
  `SELECT csi.id, csi.raw_material_id, csi.raw_material_code, csi.raw_material_name,
          csi.qty, csi.unit_id, u.unit_name, csi.rate, csi.value,
          rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name
   FROM closing_stock_items csi
   LEFT JOIN units u ON u.id = csi.unit_id
   LEFT JOIN raw_materials rm ON rm.id = csi.raw_material_id
   LEFT JOIN units bu ON bu.id = rm.unit_id
   WHERE csi.upload_id = ? AND csi.outlet_id = ?
   ORDER BY csi.id`,
  [uploadId, outletId]
);

const physicalKey = (row) => (
  row.raw_material_id !== null && row.raw_material_id !== undefined
    ? `id:${Number(row.raw_material_id)}`
    : `physical-name:${normalizeName(row.material_name || row.raw_material_code || row.raw_material_id)}`
);

const accountingKey = (row) => (
  row.raw_material_id !== null && row.raw_material_id !== undefined
    ? `id:${Number(row.raw_material_id)}`
    : `accounting-name:${normalizeName(row.raw_material_name || row.raw_material_code || row.material_name)}`
);

const groupAccountingRows = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const key = accountingKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        raw_material_id: row.raw_material_id ?? null,
        material_code: row.raw_material_code || row.material_code || null,
        material_name: row.raw_material_name || row.material_name || 'Unknown material',
        base_unit_id: row.base_unit_id || null,
        base_unit_name: row.base_unit_name || null,
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }

  return groups;
};

const normalizeAccountingGroup = async (group) => {
  const unitIds = new Set(group.rows.map((row) => row.unit_id).filter(Boolean));
  const unitNames = new Set(group.rows.map((row) => row.unit_name).filter(Boolean));
  const singleUnitId = unitIds.size === 1 ? [...unitIds][0] : null;
  const singleUnitName = unitNames.size === 1 ? [...unitNames][0] : null;
  let originalQty = unitIds.size <= 1 ? 0 : null;
  let baseQty = 0;
  let convertible = true;
  let reason = null;

  if (!group.base_unit_id) {
    convertible = false;
    reason = 'mapping_missing';
    originalQty = null;
  } else {
    for (const row of group.rows) {
      if (!row.unit_id) {
        convertible = false;
        reason = 'conversion_missing';
        originalQty = null;
        break;
      }
      const factor = await findConversionFactor(row.unit_id, group.base_unit_id);
      if (factor === null || Number.isNaN(factor)) {
        convertible = false;
        reason = 'conversion_missing';
        originalQty = null;
        break;
      }
      baseQty += num(row.qty) * factor;
      if (originalQty !== null) originalQty += num(row.qty);
    }
  }

  return {
    ...group,
    accounting_qty_original: originalQty === null ? null : num(originalQty.toFixed(4)),
    accounting_unit_id: singleUnitId,
    accounting_unit_name: singleUnitName,
    accounting_qty_base: convertible ? num(baseQty.toFixed(4)) : null,
    accounting_rate: group.rows.length === 1 ? num(group.rows[0].rate) : null,
    accounting_value: num(group.rows.reduce((sum, row) => sum + num(row.value), 0).toFixed(2)),
    comparable: Boolean(convertible && group.base_unit_id),
    non_comparable_reason: convertible && group.base_unit_id ? null : reason || 'conversion_missing',
  };
};

const buildComparisonRows = async ({ physicalRows, accountingGroups, accountingAllowed, physicalLocationStatus }) => {
  const rows = [];
  const matchedAccountingKeys = new Set();

  const physicalMap = new Map();
  for (const row of physicalRows || []) {
    physicalMap.set(physicalKey(row), row);
  }

  const normalizedAccountingGroups = new Map();
  for (const [key, group] of accountingGroups.entries()) {
    normalizedAccountingGroups.set(key, await normalizeAccountingGroup(group));
  }

  for (const [key, physical] of physicalMap.entries()) {
    const accounting = normalizedAccountingGroups.get(key) || null;
    if (accounting && key.startsWith('id:') && physicalLocationStatus === 'UNIQUE') {
      matchedAccountingKeys.add(key);
      const physicalQtyBase = num(physical.physical_qty_base);
      const physicalLedgerValue = num(physical.physical_ledger_value);
      const comparable = Boolean(accounting.comparable && physical.base_unit_id && accounting.accounting_qty_base !== null);
      const quantityDifference = comparable
        ? num((physicalQtyBase - num(accounting.accounting_qty_base)).toFixed(4))
        : null;
      const state = comparable
        ? (Math.abs(quantityDifference) <= 0.0005 ? 'MATCH' : 'DIFFERENCE')
        : 'N/A';
      rows.push({
        key,
        raw_material_id: physical.raw_material_id ?? null,
        material_code: physical.material_code || accounting.material_code || null,
        material_name: physical.material_name || accounting.material_name || 'Unknown material',
        base_unit_id: physical.base_unit_id || accounting.base_unit_id || null,
        base_unit_name: physical.base_unit_name || accounting.base_unit_name || null,
        physical_qty_base: num(physicalQtyBase.toFixed(4)),
        physical_ledger_value: num(physicalLedgerValue.toFixed(2)),
        latest_movement_date: physical.latest_movement_date || null,
        has_ledger_activity: Number(physical.ledger_row_count || 0) > 0,
        accounting_qty_original: accounting.accounting_qty_original,
        accounting_unit_id: accounting.accounting_unit_id,
        accounting_unit_name: accounting.accounting_unit_name,
        accounting_qty_base: accounting.accounting_qty_base,
        accounting_rate: accounting.accounting_rate,
        accounting_value: accounting.accounting_value,
        comparable,
        non_comparable_reason: comparable ? null : (!physical.base_unit_id || !accounting.base_unit_id ? 'mapping_missing' : (accounting.non_comparable_reason || 'conversion_missing')),
        state,
        quantity_difference: comparable ? quantityDifference : null,
      });
      continue;
    }

    const physicalQtyBase = num(physical.physical_qty_base);
    const physicalLedgerValue = num(physical.physical_ledger_value);
    const ledgerRowCount = num(physical.ledger_row_count);
    rows.push({
      key,
      raw_material_id: physical.raw_material_id ?? null,
      material_code: physical.material_code || null,
      material_name: physical.material_name || 'Unknown material',
      base_unit_id: physical.base_unit_id || null,
      base_unit_name: physical.base_unit_name || null,
      physical_qty_base: num(physicalQtyBase.toFixed(4)),
      physical_ledger_value: num(physicalLedgerValue.toFixed(2)),
      latest_movement_date: physical.latest_movement_date || null,
      has_ledger_activity: ledgerRowCount > 0,
      accounting_qty_original: null,
      accounting_unit_id: null,
      accounting_unit_name: null,
      accounting_qty_base: null,
      accounting_rate: null,
      accounting_value: null,
      comparable: false,
      non_comparable_reason: accountingAllowed ? 'physical_only' : 'physical_only',
      state: 'N/A',
      quantity_difference: null,
    });
  }

  for (const [key, accounting] of normalizedAccountingGroups.entries()) {
    if (matchedAccountingKeys.has(key)) continue;

    rows.push({
      key,
      raw_material_id: accounting.raw_material_id ?? null,
      material_code: accounting.material_code || null,
      material_name: accounting.material_name || 'Unknown material',
      base_unit_id: accounting.base_unit_id || null,
      base_unit_name: accounting.base_unit_name || null,
      physical_qty_base: null,
      physical_ledger_value: null,
      latest_movement_date: null,
      has_ledger_activity: false,
      accounting_qty_original: accounting.accounting_qty_original,
      accounting_unit_id: accounting.accounting_unit_id,
      accounting_unit_name: accounting.accounting_unit_name,
      accounting_qty_base: accounting.accounting_qty_base,
      accounting_rate: accounting.accounting_rate,
      accounting_value: accounting.accounting_value,
      comparable: false,
      non_comparable_reason: accounting.raw_material_id !== null && accounting.raw_material_id !== undefined ? 'accounting_only' : 'mapping_missing',
      state: 'N/A',
      quantity_difference: null,
    });
  }

  rows.sort((a, b) => String(a.material_name).localeCompare(String(b.material_name)));
  return rows;
};

const buildWarnings = ({ physical, accounting, period }) => {
  const warnings = [
    'Physical quantities are reconstructed from stock ledger as of the selected date. Back-dated postings can change historical results.',
    'Physical ledger value and accounting closing-stock value may use different cost bases and must not be interpreted as a value variance.',
  ];

  if (physical.location_status === 'NONE') {
    warnings.push('No active inventory-enabled Outlet location is mapped to this outlet.');
  } else if (physical.location_status === 'AMBIGUOUS') {
    warnings.push('Multiple active inventory-enabled Outlet locations are mapped; no single physical location was selected.');
  } else if (physical.location_status === 'UNIQUE' && !physical.has_activity) {
    warnings.push('No physical ledger activity recorded up to the selected date.');
  }

  if (!accounting.allowed) {
    warnings.push('Accounting closing-stock detail is hidden because closing_stock.can_view is not granted.');
  } else if (!accounting.completed_upload_present) {
    warnings.push(`No completed closing-stock upload exists for ${period.year}-${String(period.month).padStart(2, '0')}.`);
  }

  return warnings;
};

export const getProposedClosingStock = async ({ outletId, asOfDate, locationScope, outletScope, closingStockAllowed }) => {
  const outlet = await loadOutlet(outletId);
  if (!outlet) {
    throw httpError('Outlet not found', 404);
  }

  if (outletScope && !outletScope.all) {
    const allowedOutlets = (outletScope.outletIds || []).map(Number);
    if (!allowedOutlets.includes(Number(outletId))) {
      throw httpError('You do not have access to the requested outlet', 403);
    }
  }

  const period = accountingPeriodFor(asOfDate);
  if (!period) {
    throw httpError('as_of_date must be a valid YYYY-MM-DD date', 400);
  }

  const candidates = await loadPhysicalLocationCandidates(outletId);
  const physical = {
    location_status: 'NONE',
    location: null,
    candidate_count: candidates.length,
    candidates: [],
    has_activity: null,
    latest_movement_date: null,
    rows: null,
  };

  if (candidates.length === 1) {
    const location = candidates[0];
    if (locationScope && !locationScope.all) {
      const allowedLocations = (locationScope.locationIds || []).map(Number);
      if (!allowedLocations.includes(Number(location.id))) {
        throw httpError('You do not have access to the requested location', 403);
      }
    }

    physical.location_status = 'UNIQUE';
    physical.location = {
      id: location.id,
      location_code: location.location_code,
      location_name: location.location_name,
    };

    const rows = await loadPhysicalRows(location.id, asOfDate);
    physical.has_activity = rows.length > 0;
    physical.latest_movement_date = rows.length ? rows.reduce((latest, row) => {
      const rowTime = row.latest_movement_date ? new Date(row.latest_movement_date).getTime() : null;
      const latestTime = latest ? new Date(latest).getTime() : null;
      if (rowTime === null || Number.isNaN(rowTime)) return latest;
      if (latestTime === null || Number.isNaN(latestTime) || rowTime > latestTime) return row.latest_movement_date || null;
      return latest;
    }, null) : null;
    physical.rows = rows.map((row) => {
      const physicalQtyBase = num(row.physical_qty_base);
      const physicalLedgerValue = num(row.physical_ledger_value);
      const ledgerRowCount = num(row.ledger_row_count);
      return {
        raw_material_id: row.raw_material_id ?? null,
        material_code: row.material_code || null,
        material_name: row.material_name || 'Unknown material',
        base_unit_id: row.base_unit_id || null,
        base_unit_name: row.base_unit_name || null,
        physical_qty_base: num(physicalQtyBase.toFixed(4)),
        physical_ledger_value: num(physicalLedgerValue.toFixed(2)),
        latest_movement_date: row.latest_movement_date || null,
        has_ledger_activity: ledgerRowCount > 0,
        ledger_row_count: ledgerRowCount,
      };
    });
  } else if (candidates.length > 1) {
    physical.location_status = 'AMBIGUOUS';
    physical.candidates = (locationScope && !locationScope.all)
      ? candidates.filter((candidate) => (locationScope.locationIds || []).map(Number).includes(Number(candidate.id))).map((candidate) => ({
          id: candidate.id,
          location_code: candidate.location_code,
          location_name: candidate.location_name,
        }))
      : candidates.map((candidate) => ({
          id: candidate.id,
          location_code: candidate.location_code,
          location_name: candidate.location_name,
        }));
  }

  const accounting = {
    allowed: Boolean(closingStockAllowed),
    completed_upload_present: null,
    upload: null,
    rows: null,
  };

  let accountingRowsRaw = null;
  if (accounting.allowed) {
    const upload = await loadLatestCompletedClosingUpload({ outletId, year: period.year, month: period.month });
    accounting.completed_upload_present = Boolean(upload);
    if (upload) {
      accounting.upload = {
        id: upload.id,
        batch_id: upload.batch_id || null,
        status: upload.status,
        month: upload.month,
        year: upload.year,
        created_at: upload.created_at,
      };
      accountingRowsRaw = await loadCompletedClosingRows({ uploadId: upload.id, outletId });
      accounting.rows = accountingRowsRaw.map((row) => ({
        raw_material_id: row.raw_material_id ?? null,
        raw_material_code: row.raw_material_code || null,
        raw_material_name: row.raw_material_name || 'Unknown material',
        qty: num(row.qty),
        unit_id: row.unit_id || null,
        unit_name: row.unit_name || null,
        rate: num(row.rate),
        value: num(row.value),
      }));
    }
  }

  const comparisonRows = await buildComparisonRows({
    physicalRows: physical.rows || [],
    accountingGroups: accountingRowsRaw ? groupAccountingRows(accountingRowsRaw) : new Map(),
    accountingAllowed: accounting.allowed,
    physicalLocationStatus: physical.location_status,
  });

  const summary = {
    physical_location_status: physical.location_status,
    physical_material_count: physical.rows ? physical.rows.length : 0,
    accounting_completed_upload_present: accounting.allowed ? accounting.completed_upload_present : null,
    accounting_material_count: accounting.allowed ? (accounting.rows ? accounting.rows.length : 0) : null,
    comparable_material_count: accounting.allowed ? comparisonRows.filter((row) => row.state === 'MATCH' || row.state === 'DIFFERENCE').length : null,
    non_comparable_material_count: accounting.allowed ? comparisonRows.filter((row) => row.state === 'N/A').length : null,
    physical_only_count: accounting.allowed ? comparisonRows.filter((row) => row.non_comparable_reason === 'physical_only').length : null,
    accounting_only_count: accounting.allowed ? comparisonRows.filter((row) => row.non_comparable_reason === 'accounting_only').length : null,
    conversion_missing_count: accounting.allowed ? comparisonRows.filter((row) => row.non_comparable_reason === 'conversion_missing').length : null,
    match_count: accounting.allowed ? comparisonRows.filter((row) => row.state === 'MATCH').length : null,
    difference_count: accounting.allowed ? comparisonRows.filter((row) => row.state === 'DIFFERENCE').length : null,
  };

  return {
    outlet: {
      id: outlet.id,
      outlet_code: outlet.outlet_code,
      outlet_name: outlet.outlet_name,
      is_active: Boolean(Number(outlet.is_active)),
    },
    as_of_date: String(asOfDate).trim(),
    period,
    permissions: {
      closing_stock: accounting.allowed,
    },
    physical,
    accounting,
    summary,
    comparison_rows: comparisonRows,
    warnings: buildWarnings({ physical, accounting, period }),
  };
};