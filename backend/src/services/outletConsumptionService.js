import { query, getConnection } from '../config/database.js';
import { getMaterialBaseUnit, convertToBase } from '../utils/uomUtils.js';
import { getSettingValue } from './warehouseSettingService.js';
import { assertNotOwnDocument } from '../utils/makerChecker.js';
import { assertDateEditable } from '../utils/periodLock.js';
import { getTheoreticalConsumption } from './consumptionService.js';

// Phase 6A7 - Outlet Consumption.
//
// The explicit, controlled physical-consumption document that closes the gap
// hybrid COGS reported as physical_consumption_model = 'INCOMPLETE': until now
// no transaction type existed for "the outlet actually consumed this material".
//
// Rules (mirroring the warehouse_wastage / stock_adjustments convention):
//   - Workflow Draft -> Submitted -> Verified -> Approved -> Posted -> Locked.
//   - Only the Post step writes stock_ledger rows
//     (transaction_type = 'OUTLET_CONSUMPTION'), atomically with the document.
//   - Valuation is the canonical WAC at posting time - client-supplied costs
//     are never authoritative, and missing valuation BLOCKS the post rather
//     than fabricating a zero cost.
//   - Insufficient stock follows the canonical controlled-document rule:
//     blocked unless the location's allow_negative_stock setting is on.
//   - Theoretical sources (Verified Item Sales + recipes) may only PRE-FILL a
//     Draft - nothing in this file posts automatically, and sales uploads
//     never deduct stock on their own.
//   - One source-linked document per outlet + source type + source period is
//     enforced by the uq_outlet_consumption_source unique key.
//
// PHYSICAL ONLY: posting never touches P&L, supplier ledgers,
// accounting_effects, or stock uploads. Official financial COGS remains the
// periodic Verified Opening + Effective Purchases - Verified Closing formula.

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));

// Same WAC rule warehousePhase2cService uses for adjustments/wastage: ledger
// balance excluding informational transit rows, average = value / qty.
const getMaterialWAC = async (locationId, materialId) => {
  const rows = await query(
    `SELECT
      COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN qty_in ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN qty_out ELSE 0 END),0) AS current_qty,
      COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN value_in ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN value_out ELSE 0 END),0) AS total_value
    FROM stock_ledger
    WHERE location_id = ? AND raw_material_id = ?`,
    [locationId, materialId]
  );
  const currentQty = num(rows[0]?.current_qty);
  const totalValue = num(rows[0]?.total_value);
  return { currentQty, totalValue, averageCost: currentQty > 0 ? totalValue / currentQty : 0 };
};

const postLedger = async (connection, { location_id, raw_material_id, transaction_date, reference_id, reference_item_id, qty_out, unit_cost, unit_id, created_by }) => {
  const [existing] = await connection.execute(
    `SELECT id FROM stock_ledger WHERE transaction_type = 'OUTLET_CONSUMPTION' AND reference_type = 'OUTLET_CONSUMPTION' AND reference_id = ? AND reference_item_id = ? LIMIT 1`,
    [reference_id, reference_item_id]
  );
  if (existing.length > 0) return existing[0].id;
  const value = Math.abs(qty_out) * num(unit_cost);
  const [res] = await connection.execute(
    `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, created_by)
     VALUES (?, ?, ?, 'OUTLET_CONSUMPTION', 'OUTLET_CONSUMPTION', ?, ?, 0, ?, ?, ?, 0, ?, ?)`,
    [location_id, raw_material_id, transaction_date, reference_id, reference_item_id, Math.abs(qty_out), unit_id, unit_cost, value, created_by]
  );
  return res.insertId;
};

const transitionDocument = async (id, userId, action) => {
  const next = {
    submit: { from: 'Draft', to: 'Submitted' },
    verify: { from: 'Submitted', to: 'Verified' },
    approve: { from: 'Verified', to: 'Approved' },
    post: { from: 'Approved', to: 'Posted' },
    lock: { from: 'Posted', to: 'Locked' },
  }[action];
  if (!next) throw new Error('Invalid workflow action');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT status, created_by FROM outlet_consumptions WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
    if (!rows.length) { await conn.rollback(); throw new Error('Outlet consumption not found'); }
    if (rows[0].status !== next.from) { await conn.rollback(); throw new Error(`Cannot ${action} from ${rows[0].status}`); }
    // Submit is the creator's own natural first step (exempt, as everywhere
    // else); verify/approve are the review gates and block self-checking.
    if (action === 'verify' || action === 'approve') assertNotOwnDocument(rows[0], userId, 'created_by', action, 'outlet consumption');
    const actionCols = {
      submit: ['submitted_by', 'submitted_at'],
      verify: ['verified_by', 'verified_at'],
      approve: ['approved_by', 'approved_at'],
      post: ['posted_by', 'posted_at'],
      lock: ['locked_by', 'locked_at'],
    }[action];
    const [userCol, timeCol] = actionCols;
    await conn.execute(`UPDATE outlet_consumptions SET status = ?, ${userCol} = ?, ${timeCol} = NOW() WHERE id = ?`, [next.to, userId, id]);
    await conn.commit();
    return { id, status: next.to };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
};

const getConsumptionWithItems = async (id) => {
  const [header] = await query('SELECT * FROM outlet_consumptions WHERE id = ? LIMIT 1', [id]);
  if (!header) return null;
  const items = await query(
    `SELECT oci.*, rm.material_name, rm.material_code, u.unit_name, bu.unit_name as base_unit_name,
            mi.item_name as source_menu_item_name
     FROM outlet_consumption_items oci
     LEFT JOIN raw_materials rm ON rm.id = oci.raw_material_id
     LEFT JOIN units u ON u.id = oci.unit_id
     LEFT JOIN units bu ON bu.id = oci.base_unit_id
     LEFT JOIN menu_items mi ON mi.id = oci.source_menu_item_id
     WHERE oci.consumption_id = ?`,
    [id]
  );
  return { ...header, items };
};

export const getOutletConsumptions = async (filters = {}) => {
  const { outlet_id, location_id, status, source_type, allowedLocationIds } = filters;
  let sql = `SELECT oc.*, l.location_name, l.location_code, o.outlet_name, u.full_name as created_by_name
    FROM outlet_consumptions oc
    LEFT JOIN locations l ON l.id = oc.location_id
    LEFT JOIN outlets o ON o.id = oc.outlet_id
    LEFT JOIN users u ON u.id = oc.created_by
    WHERE 1=1`;
  const params = [];
  if (outlet_id) { sql += ' AND oc.outlet_id = ?'; params.push(outlet_id); }
  if (location_id) { sql += ' AND oc.location_id = ?'; params.push(location_id); }
  if (status) { sql += ' AND oc.status = ?'; params.push(status); }
  if (source_type) { sql += ' AND oc.source_type = ?'; params.push(source_type); }
  // Confines a location-scoped caller to documents at locations they're
  // allowed to see - same rule as the other physical-document lists.
  if (allowedLocationIds) {
    // pool.execute does not expand `IN (?)` array bindings - join sanitized ints.
    sql += allowedLocationIds.length ? ` AND oc.location_id IN (${allowedLocationIds.map(Number).join(',')})` : ' AND 1=0';
  }
  sql += ' ORDER BY oc.created_at DESC';
  return query(sql, params);
};

export const getOutletConsumptionById = (id) => getConsumptionWithItems(id);

// Deterministic theoretical prefill from Verified generic Item Sales + the
// active recipe per menu item (consumptionService's canonical calculation,
// waste_percentage folded in). Aggregated to one proposed line per raw
// material - menu-item detail stays on the source rows, not here.
// Returns proposed items only: creates nothing, moves no stock.
export const getTheoreticalPrefill = async ({ outletId, month, year }) => {
  if (!outletId || !month || !year) throw new Error('outlet_id, month and year are required');
  const rows = await getTheoreticalConsumption({ outletId: Number(outletId), month: Number(month), year: Number(year) });
  const byMaterial = new Map();
  for (const r of rows || []) {
    const key = Number(r.raw_material_id);
    const prev = byMaterial.get(key) || { raw_material_id: key, material_name: r.material_name, material_code: r.material_code, theoretical_qty: 0 };
    prev.theoretical_qty += num(r.total_used_qty);
    byMaterial.set(key, prev);
  }
  const items = [];
  for (const m of byMaterial.values()) {
    const baseUnit = await getMaterialBaseUnit(m.raw_material_id);
    items.push({
      raw_material_id: m.raw_material_id,
      material_name: m.material_name,
      material_code: m.material_code,
      qty: m.theoretical_qty,
      unit_id: baseUnit.id,
      unit_name: baseUnit.unit_name || null,
      theoretical_qty: m.theoretical_qty,
    });
  }
  return items;
};

export const createOutletConsumption = async (data, userId) => {
  const { consumption_no, outlet_id, location_id, consumption_date, source_type, source_reference_id, source_period_month, source_period_year, remarks, items } = data;
  if (!consumption_no || !outlet_id || !location_id || !consumption_date || !items?.length) {
    throw new Error('Consumption number, outlet, location, date and items are required');
  }
  const sourceType = source_type || 'MANUAL';
  if (!['MANUAL', 'ITEM_SALES_THEORETICAL', 'PETPOOJA_THEORETICAL'].includes(sourceType)) {
    throw new Error('Invalid source_type');
  }
  if (sourceType !== 'MANUAL' && (!source_period_month || !source_period_year)) {
    throw new Error('Source-linked consumption requires source_period_month and source_period_year');
  }
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT id FROM outlet_consumptions WHERE consumption_no = ? LIMIT 1', [consumption_no]);
    if (existing.length > 0) { await connection.rollback(); throw new Error('Consumption number already exists'); }
    const [res] = await connection.execute(
      `INSERT INTO outlet_consumptions (consumption_no, outlet_id, location_id, consumption_date, source_type, source_reference_id, source_period_month, source_period_year, status, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
      [consumption_no, outlet_id, location_id, consumption_date, sourceType, source_reference_id || null,
       sourceType === 'MANUAL' ? null : source_period_month, sourceType === 'MANUAL' ? null : source_period_year,
       remarks || null, userId]
    );
    const consumptionId = res.insertId;
    const totals = { qty: 0 };
    for (const it of items) {
      if (!it.raw_material_id || !it.qty || !it.unit_id) { await connection.rollback(); throw new Error('Invalid consumption item'); }
      const qty = num(it.qty);
      if (qty <= 0) { await connection.rollback(); throw new Error('Consumption quantity must be positive'); }
      const theoretical = it.theoretical_qty !== undefined && it.theoretical_qty !== null ? num(it.theoretical_qty) : null;
      await connection.execute(
        `INSERT INTO outlet_consumption_items (consumption_id, raw_material_id, qty, unit_id, source_menu_item_id, theoretical_qty, variance_qty, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [consumptionId, it.raw_material_id, qty, it.unit_id, it.source_menu_item_id || null, theoretical,
         theoretical !== null ? qty - theoretical : null, it.remarks || null]
      );
      totals.qty += qty;
    }
    await connection.execute('UPDATE outlet_consumptions SET total_qty = ? WHERE id = ?', [totals.qty, consumptionId]);
    await connection.commit();
    return getConsumptionWithItems(consumptionId);
  } catch (error) {
    await connection.rollback();
    // Surface the source-uniqueness guard as a readable error, not a raw 1062.
    if (error.code === 'ER_DUP_ENTRY') throw new Error('A source-linked consumption document already exists for this outlet, source type and period');
    throw error;
  } finally { connection.release(); }
};

export const updateOutletConsumption = async (id, data) => {
  const { consumption_no, location_id, consumption_date, remarks, items } = data;
  const [header] = await query('SELECT * FROM outlet_consumptions WHERE id = ? LIMIT 1', [id]);
  if (!header) throw new Error('Outlet consumption not found');
  if (header.status !== 'Draft') throw new Error('Only Draft consumption can be updated');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE outlet_consumptions SET consumption_no = ?, location_id = ?, consumption_date = ?, remarks = ? WHERE id = ?',
      [consumption_no || header.consumption_no, location_id || header.location_id, consumption_date || header.consumption_date, remarks !== undefined ? remarks : header.remarks, id]
    );
    if (items && items.length > 0) {
      await connection.execute('DELETE FROM outlet_consumption_items WHERE consumption_id = ?', [id]);
      const totals = { qty: 0 };
      for (const it of items) {
        if (!it.raw_material_id || !it.qty || !it.unit_id) { await connection.rollback(); throw new Error('Invalid consumption item'); }
        const qty = num(it.qty);
        if (qty <= 0) { await connection.rollback(); throw new Error('Consumption quantity must be positive'); }
        const theoretical = it.theoretical_qty !== undefined && it.theoretical_qty !== null ? num(it.theoretical_qty) : null;
        await connection.execute(
          `INSERT INTO outlet_consumption_items (consumption_id, raw_material_id, qty, unit_id, source_menu_item_id, theoretical_qty, variance_qty, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, it.raw_material_id, qty, it.unit_id, it.source_menu_item_id || null, theoretical,
           theoretical !== null ? qty - theoretical : null, it.remarks || null]
        );
        totals.qty += qty;
      }
      await connection.execute('UPDATE outlet_consumptions SET total_qty = ? WHERE id = ?', [totals.qty, id]);
    }
    await connection.commit();
    return getConsumptionWithItems(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const submitOutletConsumption = (id, userId) => transitionDocument(id, userId, 'submit');
export const verifyOutletConsumption = (id, userId) => transitionDocument(id, userId, 'verify');
export const approveOutletConsumption = (id, userId) => transitionDocument(id, userId, 'approve');

export const postOutletConsumption = async (id, userId) => {
  const header = await getConsumptionWithItems(id);
  if (!header) throw new Error('Outlet consumption not found');
  if (header.status !== 'Approved') throw new Error('Only Approved consumption can be posted');

  // Period lock: the consumption date's month must still be editable for this
  // outlet - a Posted consumption writes real stock_ledger rows, so it must
  // never land inside a finalized accounting period.
  await assertDateEditable(header.outlet_id, header.consumption_date, 'Outlet consumption');

  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [lockRows] = await connection.execute('SELECT status FROM outlet_consumptions WHERE id = ? FOR UPDATE', [id]);
    if (!lockRows[0] || lockRows[0].status !== 'Approved') {
      await connection.rollback();
      throw new Error('Only Approved consumption can be posted');
    }
    const txDate = header.consumption_date;
    const locationId = header.location_id;
    const allowNegativeStock = await getSettingValue(locationId, 'allow_negative_stock');
    let totalValue = 0;
    let negativeStockWarning = false;

    for (const it of header.items) {
      if (Number(it.ledger_posted)) continue;
      const qty = num(it.qty);
      if (qty <= 0) { await connection.rollback(); throw new Error(`Quantity must be positive for ${it.material_name}`); }
      const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
      const baseQty = await convertToBase(qty, it.unit_id, baseUnit.id);
      if (!baseQty && qty > 0) { await connection.rollback(); throw new Error(`UOM conversion failed for material ${it.raw_material_id}`); }
      const wac = await getMaterialWAC(locationId, it.raw_material_id);
      if (baseQty > wac.currentQty) {
        if (!allowNegativeStock) {
          await connection.rollback(); throw new Error(`Insufficient stock for material ${it.material_name}: required ${baseQty}, available ${wac.currentQty}`);
        }
        negativeStockWarning = true;
      }
      // No deterministic cost -> block rather than post a fabricated zero
      // value (same rule stock adjustments apply to positive adjustments).
      if (wac.currentQty <= 0 || wac.averageCost <= 0) {
        await connection.rollback(); throw new Error(`Cannot value consumption for material ${it.material_name}; no WAC available`);
      }
      const unitCost = wac.averageCost;
      const value = baseQty * unitCost;
      await postLedger(connection, {
        location_id: locationId,
        raw_material_id: it.raw_material_id,
        transaction_date: txDate,
        reference_id: id,
        reference_item_id: it.id,
        qty_out: baseQty,
        unit_cost: unitCost,
        unit_id: baseUnit.id,
        created_by: userId,
      });
      totalValue += value;
      await connection.execute(
        `UPDATE outlet_consumption_items SET base_qty = ?, base_unit_id = ?, unit_cost = ?, consumption_value = ?, ledger_posted = 1 WHERE id = ?`,
        [baseQty, baseUnit.id, unitCost, value, it.id]
      );
    }
    await connection.execute(
      `UPDATE outlet_consumptions SET status = 'Posted', total_value = ?, posted_by = ?, posted_at = NOW(), remarks = CONCAT(COALESCE(remarks,''), ?) WHERE id = ?`,
      [totalValue, userId, negativeStockWarning ? ' [negative stock allowed by location setting]' : '', id]
    );
    await connection.commit();
    return getConsumptionWithItems(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const lockOutletConsumption = (id, userId) => transitionDocument(id, userId, 'lock');

export const deleteOutletConsumption = async (id) => {
  const [row] = await query('SELECT status FROM outlet_consumptions WHERE id = ? LIMIT 1', [id]);
  if (!row) throw new Error('Outlet consumption not found');
  if (row.status !== 'Draft') throw new Error('Only Draft consumption can be deleted');
  await query('DELETE FROM outlet_consumptions WHERE id = ?', [id]);
  return { id, deleted: true };
};

// Phase 6A7 - Physical vs Theoretical consumption reconciliation.
// Posted/Locked OUTLET_CONSUMPTION ledger rows for the outlet's mapped
// locations vs the canonical theoretical consumption (Verified Item Sales +
// recipes). Variance is diagnostic only - nothing is auto-posted.
export const getOutletConsumptionReconciliation = async ({ outletId, month, year }) => {
  if (!outletId) throw new Error('outlet_id is required');
  if (!month || !year) throw new Error('month and year are required');
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const locRows = await query('SELECT id FROM locations WHERE outlet_id = ? AND is_active = 1', [outletId]);
  const locIds = locRows.map((l) => l.id);

  const physical = locIds.length
    ? await query(
      `SELECT sl.raw_material_id, rm.material_name, rm.material_code, u.unit_name,
              COALESCE(SUM(sl.qty_out),0) AS physical_qty,
              COALESCE(SUM(sl.value_out),0) AS physical_value
       FROM stock_ledger sl
       LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
       LEFT JOIN units u ON u.id = sl.unit_id
       WHERE sl.location_id IN (${locIds.map(Number).join(',')}) AND sl.transaction_type = 'OUTLET_CONSUMPTION'
         AND sl.transaction_date BETWEEN ? AND ?
       GROUP BY sl.raw_material_id, rm.material_name, rm.material_code, u.unit_name`,
      [startDate, endDate]
    )
    : [];

  const theoreticalRows = await getTheoreticalConsumption({ outletId: Number(outletId), month: Number(month), year: Number(year) });
  const theoretical = new Map();
  for (const r of theoreticalRows || []) {
    const key = Number(r.raw_material_id);
    const prev = theoretical.get(key) || { raw_material_id: key, material_name: r.material_name, material_code: r.material_code, unit: r.unit, theoretical_qty: 0 };
    prev.theoretical_qty += num(r.total_used_qty);
    theoretical.set(key, prev);
  }

  const materialIds = new Set([...physical.map((p) => Number(p.raw_material_id)), ...theoretical.keys()]);
  const items = [...materialIds].map((id) => {
    const p = physical.find((x) => Number(x.raw_material_id) === id) || {};
    const t = theoretical.get(id) || {};
    const physicalQty = num(p.physical_qty);
    const theoreticalQty = num(t.theoretical_qty);
    return {
      raw_material_id: id,
      material_name: p.material_name || t.material_name,
      material_code: p.material_code || t.material_code,
      unit: p.unit_name || t.unit,
      physical_qty: physicalQty,
      physical_value: num(p.physical_value),
      theoretical_qty: theoreticalQty,
      variance_qty: physicalQty - theoreticalQty,
    };
  });

  return {
    read_only: true,
    disclaimer: 'PHYSICAL POSTING REQUIRES EXPLICIT REVIEW - sales do not automatically deduct stock. Variance is diagnostic only and is never posted.',
    params: { outlet_id: Number(outletId), month: Number(month), year: Number(year), from_date: startDate, to_date: endDate },
    totals: {
      physical_qty: items.reduce((s, i) => s + i.physical_qty, 0),
      physical_value: items.reduce((s, i) => s + i.physical_value, 0),
      theoretical_qty: items.reduce((s, i) => s + i.theoretical_qty, 0),
      variance_qty: items.reduce((s, i) => s + i.variance_qty, 0),
    },
    items,
  };
};
