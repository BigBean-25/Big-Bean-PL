import { query } from '../config/database.js';
import { getSettingValue } from './warehouseSettingService.js';

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));

const businessDate = (d) => {
  const today = d ? new Date(d) : new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const daysDiff = (expiry, today) => {
  if (!expiry) return null;
  const e = new Date(expiry);
  e.setHours(0, 0, 0, 0);
  return Math.ceil((e - today) / (1000 * 60 * 60 * 24));
};

export const getExpiryStatus = (expiryDate, thresholdDays, asOf) => {
  const today = businessDate(asOf);
  if (!expiryDate) return 'No Expiry';
  const days = daysDiff(expiryDate, today);
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expiring Today';
  if (days <= thresholdDays) return 'Near Expiry';
  return 'Healthy';
};

export const getAvailableBatches = async (locationId, materialId, options = {}) => {
  const { asOf, excludeExpired = true, thresholdDays } = options;
  const today = businessDate(asOf);
  const materialRows = materialId
    ? await query('SELECT material_name, material_code, unit_id, is_batch_tracked, is_expiry_tracked, near_expiry_days FROM raw_materials WHERE id = ? LIMIT 1', [materialId])
    : [];
  const material = materialRows[0] || {};
  // getSettingValue() already falls back to the DEFAULTS entry (30 days) when the
  // location hasn't overridden it, so no extra hardcoded fallback is needed here.
  const locationDefault = thresholdDays ?? await getSettingValue(locationId, 'default_near_expiry_days');
  const nearDays = num(material.near_expiry_days) || num(locationDefault);

  const sql = `
    SELECT
      sl.location_id,
      sl.raw_material_id,
      sl.batch_no,
      sl.expiry_date,
      rm.material_code,
      rm.material_name,
      u.unit_name,
      u.unit_symbol,
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.qty_in ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.qty_out ELSE 0 END), 0) AS available_qty,
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.value_in ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.value_out ELSE 0 END), 0) AS batch_value,
      rm.is_batch_tracked,
      rm.is_expiry_tracked,
      rm.near_expiry_days
    FROM stock_ledger sl
    LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
    LEFT JOIN units u ON u.id = sl.unit_id
    WHERE sl.location_id = ?
      AND (? IS NULL OR sl.raw_material_id = ?)
      AND sl.batch_no IS NOT NULL
      AND sl.batch_no != ''
    GROUP BY sl.location_id, sl.raw_material_id, sl.batch_no, sl.expiry_date, sl.unit_id, u.unit_name, u.unit_symbol, rm.material_code, rm.material_name, rm.near_expiry_days
    HAVING available_qty > 0
    ORDER BY sl.expiry_date IS NULL, sl.expiry_date ASC, sl.batch_no ASC
  `;
  const rows = await query(sql, [locationId, materialId || null, materialId || null]);

  return rows.map((r) => {
    const days = daysDiff(r.expiry_date, today);
    const status = getExpiryStatus(r.expiry_date, nearDays, asOf);
    const avgCost = num(r.available_qty) > 0 ? num(r.batch_value) / num(r.available_qty) : 0;
    return {
      ...r,
      available_qty: num(r.available_qty),
      batch_value: num(r.batch_value),
      days_remaining: days,
      status,
      average_cost: avgCost,
    };
  }).filter((r) => !excludeExpired || r.status !== 'Expired');
};

export const allocateFEFO = async (locationId, materialId, requiredBaseQty, options = {}) => {
  const { asOf, manual = null, thresholdDays } = options;
  if (num(requiredBaseQty) <= 0) throw new Error('Required quantity must be positive');
  const batches = await getAvailableBatches(locationId, materialId, { asOf, excludeExpired: true, thresholdDays });
  if (!batches.length) throw new Error('No available non-expired batches for material');

  const material = await query('SELECT material_name, near_expiry_days FROM raw_materials WHERE id = ? LIMIT 1', [materialId]);
  const locationDefault = thresholdDays ?? await getSettingValue(locationId, 'default_near_expiry_days');
  const nearDays = num(material[0]?.near_expiry_days) || num(locationDefault);

  if (manual && manual.length) {
    const allocations = [];
    let remaining = num(requiredBaseQty);
    for (const m of manual) {
      const batch = batches.find(b => b.batch_no === m.batch_no && (b.expiry_date ? b.expiry_date === m.expiry_date : !m.expiry_date));
      if (!batch) throw new Error(`Invalid or expired batch ${m.batch_no}`);
      if (batch.status === 'Expired') throw new Error(`Expired batch ${m.batch_no} cannot be allocated`);
      const alloc = Math.min(remaining, num(batch.available_qty), num(m.qty || remaining));
      if (alloc <= 0) continue;
      allocations.push({ ...batch, allocated_qty: alloc });
      remaining -= alloc;
    }
    if (remaining > 0.0001) throw new Error(`Manual allocation insufficient; remaining ${remaining}`);
    return allocations;
  }

  const allocations = [];
  let remaining = num(requiredBaseQty);
  for (const batch of batches) {
    if (remaining <= 0.0001) break;
    const alloc = Math.min(remaining, num(batch.available_qty));
    allocations.push({ ...batch, allocated_qty: alloc });
    remaining -= alloc;
  }
  if (remaining > 0.0001) throw new Error(`Insufficient available stock for FEFO allocation; remaining ${remaining}`);
  return allocations;
};

export const getBatches = async (filters = {}) => {
  const { location_id, material_id, status, from_date, to_date, search } = filters;
  let sql = `
    SELECT
      sl.location_id,
      sl.raw_material_id,
      sl.batch_no,
      sl.expiry_date,
      rm.material_code,
      rm.material_name,
      u.unit_name,
      u.unit_symbol,
      rm.is_batch_tracked,
      rm.is_expiry_tracked,
      rm.near_expiry_days,
      l.location_code,
      l.location_name,
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.qty_in ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.qty_out ELSE 0 END), 0) AS available_qty,
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.value_in ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.value_out ELSE 0 END), 0) AS batch_value
    FROM stock_ledger sl
    LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
    LEFT JOIN units u ON u.id = rm.unit_id
    LEFT JOIN locations l ON l.id = sl.location_id
    WHERE sl.batch_no IS NOT NULL AND sl.batch_no != ''
  `;
  const params = [];
  if (location_id) { sql += ' AND sl.location_id = ?'; params.push(location_id); }
  if (material_id) { sql += ' AND sl.raw_material_id = ?'; params.push(material_id); }
  if (search) { sql += ' AND (rm.material_name LIKE ? OR rm.material_code LIKE ? OR sl.batch_no LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (from_date && to_date) { sql += ' AND sl.expiry_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' GROUP BY sl.location_id, sl.raw_material_id, sl.batch_no, sl.expiry_date, sl.unit_id, rm.unit_id, rm.material_code, rm.material_name, u.unit_name, u.unit_symbol, rm.is_batch_tracked, rm.is_expiry_tracked, rm.near_expiry_days, l.location_code, l.location_name HAVING available_qty > 0 ORDER BY sl.expiry_date IS NULL, sl.expiry_date ASC, sl.batch_no ASC';
  const rows = await query(sql, params);
  // Only resolvable to a single location's default when the query is scoped to one -
  // a cross-location listing has no single setting to fall back to, so it keeps the
  // historical 7-day default in that case.
  const locationDefault = location_id ? num(await getSettingValue(location_id, 'default_near_expiry_days')) : 7;

  return rows.map((r) => {
    const nearDays = num(r.near_expiry_days) || locationDefault;
    const statusText = getExpiryStatus(r.expiry_date, nearDays);
    const avgCost = num(r.available_qty) > 0 ? num(r.batch_value) / num(r.available_qty) : 0;
    return { ...r, available_qty: num(r.available_qty), batch_value: num(r.batch_value), status: statusText, days_remaining: daysDiff(r.expiry_date, businessDate()), average_cost: avgCost };
  }).filter((r) => !status || r.status === status);
};

export const getExpiryAlerts = async (filters = {}) => {
  const { location_id, threshold_days = 7 } = filters;
  const all = await getBatches({ location_id });
  const today = businessDate();
  return all
    .filter(r => r.available_qty > 0 && (r.status === 'Near Expiry' || r.status === 'Expiring Today' || r.status === 'Expired'))
    .map(r => ({ ...r, alert_type: r.status }));
};

export const getBatchLedgerHistory = async (locationId, materialId, batchNo, expiryDate) => {
  let sql = `
    SELECT sl.*, u.unit_name, us.full_name as created_by_name
    FROM stock_ledger sl
    LEFT JOIN units u ON u.id = sl.unit_id
    LEFT JOIN users us ON us.id = sl.created_by
    WHERE sl.location_id = ? AND sl.raw_material_id = ? AND sl.batch_no = ?
  `;
  const params = [locationId, materialId, batchNo];
  if (expiryDate) {
    sql += ' AND (sl.expiry_date = ? OR sl.expiry_date IS NULL)';
    params.push(expiryDate);
  }
  sql += ' ORDER BY sl.transaction_date, sl.id';
  return query(sql, params);
};
