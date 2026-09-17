import { query } from '../config/database.js';

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));

const httpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isValidDateString = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw;
};

const loadOutlet = async (outletId) => {
  const rows = await query(
    'SELECT id, outlet_code, outlet_name, is_active FROM outlets WHERE id = ? LIMIT 1',
    [outletId]
  );
  return rows[0] || null;
};

const loadLocationCandidates = async (outletId) => query(
  `SELECT id, location_code, location_name
   FROM locations
   WHERE outlet_id = ?
     AND location_type = 'Outlet'
     AND is_active = 1
     AND is_inventory_location = 1
   ORDER BY id`,
  [outletId]
);

const loadWastageRows = async ({ locationId, fromDate, toDate }) => query(
  `SELECT
     ww.id AS wastage_id,
     ww.wastage_no,
     ww.wastage_date,
     ww.status,
     ww.location_id,
     wwi.id AS wastage_item_id,
     wwi.raw_material_id,
     wwi.qty,
     wwi.unit_id,
     u.unit_name,
     wwi.value,
     rm.material_name,
     rm.material_code,
     COALESCE(c.category_name, 'Uncategorized') AS category_name
   FROM warehouse_wastage ww
   INNER JOIN warehouse_wastage_items wwi ON wwi.warehouse_wastage_id = ww.id
   LEFT JOIN raw_materials rm ON rm.id = wwi.raw_material_id
   LEFT JOIN categories c ON c.id = rm.category_id
   LEFT JOIN units u ON u.id = wwi.unit_id
   WHERE ww.location_id = ?
     AND ww.status IN ('Posted', 'Approved', 'Locked')
     AND ww.wastage_date BETWEEN ? AND ?
   ORDER BY COALESCE(c.category_name, 'Uncategorized'), rm.material_name, ww.wastage_date, ww.id, wwi.id`,
  [locationId, fromDate, toDate]
);

const aggregateRows = (rows) => {
  const groups = new Map();

  for (const row of rows) {
    const key = row.category_name || 'Uncategorized';
    if (!groups.has(key)) {
      groups.set(key, {
        category_name: key,
        total_value: 0,
        wastage_ids: new Set(),
        material_ids: new Set(),
        line_count: 0,
        qty_total: 0,
        unit_ids: new Set(),
        unit_names: new Set(),
      });
    }

    const entry = groups.get(key);
    entry.total_value += num(row.value);
    entry.line_count += 1;
    if (row.wastage_id !== null && row.wastage_id !== undefined) entry.wastage_ids.add(Number(row.wastage_id));
    if (row.raw_material_id !== null && row.raw_material_id !== undefined) entry.material_ids.add(Number(row.raw_material_id));
    if (row.unit_id !== null && row.unit_id !== undefined) {
      entry.unit_ids.add(Number(row.unit_id));
      if (row.unit_name) entry.unit_names.add(row.unit_name);
    }
    entry.qty_total += num(row.qty);
  }

  return [...groups.values()]
    .map((entry) => {
      const distinctUnitCount = entry.unit_ids.size;
      const comparable = distinctUnitCount === 1;
      const unitName = comparable ? [...entry.unit_names][0] || null : null;
      return {
        category_name: entry.category_name,
        total_qty: comparable ? num(entry.qty_total.toFixed(3)) : null,
        unit_name: unitName,
        distinct_unit_count: distinctUnitCount,
        quantity_state: comparable ? 'COMPARABLE' : distinctUnitCount > 1 ? 'MIXED_UNITS' : 'MISSING_UNIT',
        total_value: num(entry.total_value.toFixed(2)),
        wastage_count: entry.wastage_ids.size,
        material_count: entry.material_ids.size,
        line_count: entry.line_count,
      };
    })
    .sort((a, b) => b.total_value - a.total_value || String(a.category_name).localeCompare(String(b.category_name)));
};

export const getOutletWastageByCategoryReport = async ({ outletId, fromDate, toDate, outletScope }) => {
  const normalizedOutletId = Number(outletId);
  if (!Number.isInteger(normalizedOutletId) || normalizedOutletId <= 0) {
    throw httpError('outlet_id is required', 400);
  }

  if (!isValidDateString(fromDate)) {
    throw httpError('from_date must be a valid YYYY-MM-DD date', 400);
  }

  if (!isValidDateString(toDate)) {
    throw httpError('to_date must be a valid YYYY-MM-DD date', 400);
  }

  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  if (from > to) {
    throw httpError('from_date must be before or equal to to_date', 400);
  }

  const outlet = await loadOutlet(normalizedOutletId);
  if (!outlet) {
    throw httpError('Outlet not found', 404);
  }

  if (outletScope && !outletScope.all) {
    const allowedOutlets = (outletScope.outletIds || []).map(Number);
    if (!allowedOutlets.includes(normalizedOutletId)) {
      throw httpError('You do not have access to the requested outlet', 403);
    }
  }

  const candidates = await loadLocationCandidates(normalizedOutletId);
  const locationState = candidates.length === 0 ? 'NONE' : candidates.length === 1 ? 'UNIQUE' : 'AMBIGUOUS';
  const warnings = [];
  let location = null;
  let rows = [];

  if (locationState === 'NONE') {
    warnings.push('No active inventory-enabled outlet location is mapped to this outlet.');
  } else if (locationState === 'AMBIGUOUS') {
    warnings.push('Multiple active inventory-enabled outlet locations are mapped to this outlet. A single physical inventory location cannot be resolved.');
  } else {
    location = candidates[0];
    rows = aggregateRows(await loadWastageRows({ locationId: location.id, fromDate, toDate }));
    if (rows.length === 0) {
      warnings.push('No posted, approved, or locked wastage entries were found for the selected date range.');
    }
  }

  const totalValue = num(rows.reduce((sum, row) => sum + num(row.total_value), 0).toFixed(2));

  return {
    outlet: {
      id: outlet.id,
      outlet_code: outlet.outlet_code,
      outlet_name: outlet.outlet_name,
      is_active: Boolean(Number(outlet.is_active)),
    },
    date_range: {
      from_date: fromDate,
      to_date: toDate,
    },
    location_state: locationState,
    resolved_location: location ? {
      id: location.id,
      location_code: location.location_code,
      location_name: location.location_name,
    } : null,
    location_candidates: locationState === 'AMBIGUOUS'
      ? candidates.map((candidate) => ({
        id: candidate.id,
        location_code: candidate.location_code,
        location_name: candidate.location_name,
      }))
      : [],
    warnings,
    rows,
    total_value: totalValue,
  };
};
