import { query, getConnection } from '../config/database.js';
import { getMaterialBaseUnit, convertToBase, normalizeRateToBase } from '../utils/uomUtils.js';
import { getSettingValue } from './warehouseSettingService.js';

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));

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

const postLedger = async (connection, { location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty, unit_cost, unit_id, batch_no, expiry_date, created_by }) => {
  const [existing] = await connection.execute(
    'SELECT id FROM stock_ledger WHERE transaction_type = ? AND reference_type = ? AND reference_id = ? AND reference_item_id = ? LIMIT 1',
    [transaction_type, reference_type, reference_id, reference_item_id]
  );
  if (existing.length > 0) return existing[0].id;
  const absQty = Math.abs(qty);
  const value = absQty * num(unit_cost);
  const isIn = qty > 0;
  const [res] = await connection.execute(
    `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, isIn ? absQty : 0, isIn ? 0 : absQty, unit_id, unit_cost, isIn ? value : 0, isIn ? 0 : value, batch_no || null, expiry_date || null, created_by]
  );
  return res.insertId;
};

const transitionDocument = async (table, id, userId, action) => {
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
    const [rows] = await conn.execute(`SELECT status, created_by FROM ${table} WHERE id = ? LIMIT 1 FOR UPDATE`, [id]);
    if (!rows.length) { await conn.rollback(); throw new Error('Document not found'); }
    if (rows[0].status !== next.from) { await conn.rollback(); throw new Error(`Cannot ${action} from ${rows[0].status}`); }
    // Submit is the creator's own natural first step, so it's exempt - but
    // verify/approve are the actual review gates (this is why the workflow
    // has separate Submitted/Verified/Approved stages instead of one flat
    // "approved" flag), and this shared helper had no check preventing the
    // creator from being the one who verifies or approves their own document,
    // for either physical_stock_counts or stock_adjustments (both call
    // through here) - unlike the rest of this codebase's approval workflows,
    // which all block self-approval on the review step.
    if ((action === 'verify' || action === 'approve') && Number(rows[0].created_by) === Number(userId)) {
      await conn.rollback();
      throw new Error(`Creator cannot ${action} their own document`);
    }
    const actionCols = {
      submit: ['submitted_by', 'submitted_at'],
      verify: ['verified_by', 'verified_at'],
      approve: ['approved_by', 'approved_at'],
      post: ['posted_by', 'posted_at'],
      lock: ['locked_by', 'locked_at'],
    }[action];
    const [userCol, timeCol] = actionCols;
    await conn.execute(`UPDATE ${table} SET status = ?, ${userCol} = ?, ${timeCol} = NOW() WHERE id = ?`, [next.to, userId, id]);
    await conn.commit();
    return { id, status: next.to };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
};

// --- Physical Stock Count ---

const getPhysicalCountWithItems = async (id) => {
  const [header] = await query('SELECT * FROM physical_stock_counts WHERE id = ? LIMIT 1', [id]);
  if (!header) return null;
  const items = await query(
    `SELECT psci.*, rm.material_name, rm.material_code, u.unit_name
     FROM physical_stock_count_items psci
     LEFT JOIN raw_materials rm ON rm.id = psci.raw_material_id
     LEFT JOIN units u ON u.id = psci.unit_id
     WHERE psci.physical_count_id = ?`,
    [id]
  );
  return { ...header, items };
};

export const getPhysicalStockCounts = async (filters = {}) => {
  const { location_id, status, allowedLocationIds } = filters;
  let sql = `SELECT psc.*, l.location_name, l.location_code, u.full_name as created_by_name
    FROM physical_stock_counts psc
    LEFT JOIN locations l ON l.id = psc.location_id
    LEFT JOIN users u ON u.id = psc.created_by
    WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND psc.location_id = ?'; params.push(location_id); }
  if (status) { sql += ' AND psc.status = ?'; params.push(status); }
  // Confines a location-scoped caller to counts at a location they're
  // allowed to see - see resolveScopedLocationIds in warehouseMiddleware.js.
  if (allowedLocationIds) {
    sql += allowedLocationIds.length ? ' AND psc.location_id IN (?)' : ' AND 1=0';
    if (allowedLocationIds.length) params.push(allowedLocationIds);
  }
  sql += ' ORDER BY psc.created_at DESC';
  return query(sql, params);
};

export const getPhysicalStockCountById = (id) => getPhysicalCountWithItems(id);

export const createPhysicalStockCount = async (data, userId) => {
  const { count_no, location_id, count_date, remarks, items } = data;
  if (!count_no || !location_id || !count_date || !items?.length) throw new Error('Count number, location, date and items are required');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT id FROM physical_stock_counts WHERE count_no = ? LIMIT 1', [count_no]);
    if (existing.length > 0) { await connection.rollback(); throw new Error('Count number already exists'); }
    const [res] = await connection.execute(
      `INSERT INTO physical_stock_counts (count_no, location_id, count_date, status, remarks, created_by)
       VALUES (?, ?, ?, 'Draft', ?, ?)`,
      [count_no, location_id, count_date, remarks || null, userId]
    );
    const countId = res.insertId;
    const totals = { system: 0, counted: 0, variance: 0 };
    for (const it of items) {
      if (!it.raw_material_id || it.counted_qty === undefined || it.counted_qty === null || !it.unit_id) { await connection.rollback(); throw new Error('Invalid count item'); }
      const system = num(it.system_qty);
      const counted = num(it.counted_qty);
      const variance = counted - system;
      const itemTotal = num(it.unit_cost || 0) * variance;
      await connection.execute(
        `INSERT INTO physical_stock_count_items (physical_count_id, raw_material_id, unit_id, batch_no, expiry_date, system_qty, counted_qty, variance_qty, unit_cost, variance_value, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [countId, it.raw_material_id, it.unit_id, it.batch_no || null, it.expiry_date || null, system, counted, variance, num(it.unit_cost || 0), itemTotal, it.reason || null]
      );
      totals.system += system;
      totals.counted += counted;
      totals.variance += variance;
    }
    await connection.execute(
      `UPDATE physical_stock_counts SET total_system_qty = ?, total_counted_qty = ?, total_variance_qty = ? WHERE id = ?`,
      [totals.system, totals.counted, totals.variance, countId]
    );
    await connection.commit();
    return getPhysicalCountWithItems(countId);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const updatePhysicalStockCount = async (id, data) => {
  const { count_no, count_date, location_id, remarks, items } = data;
  const [header] = await query('SELECT * FROM physical_stock_counts WHERE id = ? LIMIT 1', [id]);
  if (!header) throw new Error('Physical count not found');
  if (header.status !== 'Draft') throw new Error('Only Draft counts can be updated');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE physical_stock_counts SET count_no = ?, location_id = ?, count_date = ?, remarks = ? WHERE id = ?',
      [count_no || header.count_no, location_id || header.location_id, count_date || header.count_date, remarks !== undefined ? remarks : header.remarks, id]
    );
    if (items && items.length > 0) {
      await connection.execute('DELETE FROM physical_stock_count_items WHERE physical_count_id = ?', [id]);
      const totals = { system: 0, counted: 0, variance: 0 };
      for (const it of items) {
        if (!it.raw_material_id || it.counted_qty === undefined || it.counted_qty === null || !it.unit_id) { await connection.rollback(); throw new Error('Invalid count item'); }
        const system = num(it.system_qty);
        const counted = num(it.counted_qty);
        const variance = counted - system;
        const itemTotal = num(it.unit_cost || 0) * variance;
        await connection.execute(
          `INSERT INTO physical_stock_count_items (physical_count_id, raw_material_id, unit_id, batch_no, expiry_date, system_qty, counted_qty, variance_qty, unit_cost, variance_value, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, it.raw_material_id, it.unit_id, it.batch_no || null, it.expiry_date || null, system, counted, variance, num(it.unit_cost || 0), itemTotal, it.reason || null]
        );
        totals.system += system;
        totals.counted += counted;
        totals.variance += variance;
      }
      await connection.execute(
        `UPDATE physical_stock_counts SET total_system_qty = ?, total_counted_qty = ?, total_variance_qty = ? WHERE id = ?`,
        [totals.system, totals.counted, totals.variance, id]
      );
    }
    await connection.commit();
    return getPhysicalCountWithItems(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const submitPhysicalStockCount = (id, userId) => transitionDocument('physical_stock_counts', id, userId, 'submit');
export const verifyPhysicalStockCount = (id, userId) => transitionDocument('physical_stock_counts', id, userId, 'verify');
export const approvePhysicalStockCount = (id, userId) => transitionDocument('physical_stock_counts', id, userId, 'approve');

export const postPhysicalStockCount = async (id, userId) => {
  const header = await getPhysicalCountWithItems(id);
  if (!header) throw new Error('Physical count not found');
  if (header.status !== 'Approved') throw new Error('Only Approved counts can be posted');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [lockRows] = await connection.execute('SELECT status FROM physical_stock_counts WHERE id = ? FOR UPDATE', [id]);
    if (!lockRows[0] || lockRows[0].status !== 'Approved') {
      await connection.rollback();
      throw new Error('Only Approved counts can be posted');
    }
    const txDate = header.count_date;
    const locationId = header.location_id;
    let totalValue = 0;
    for (const it of header.items) {
      if (Number(it.ledger_posted)) continue;
      const variance = num(it.variance_qty);
      if (variance === 0) {
        await connection.execute('UPDATE physical_stock_count_items SET ledger_posted = 1 WHERE id = ?', [it.id]);
        continue;
      }
      const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
      const baseVariance = await convertToBase(variance, it.unit_id, baseUnit.id);
      const wac = await getMaterialWAC(locationId, it.raw_material_id);
      if (baseVariance > 0 && wac.currentQty <= 0 && wac.averageCost <= 0) {
        await connection.rollback(); throw new Error(`Cannot value positive variance for material ${it.material_name}; no WAC available`);
      }
      if (baseVariance < 0 && Math.abs(baseVariance) > wac.currentQty) {
        await connection.rollback(); throw new Error(`Insufficient stock for material ${it.material_name}`);
      }
      const unitCost = wac.averageCost;
      const value = baseVariance * unitCost;
      const transactionType = 'PHYSICAL_ADJUSTMENT';
      await postLedger(connection, {
        location_id: locationId,
        raw_material_id: it.raw_material_id,
        transaction_date: txDate,
        transaction_type: transactionType,
        reference_type: 'PHYSICAL_COUNT',
        reference_id: id,
        reference_item_id: it.id,
        qty: baseVariance,
        unit_cost: unitCost,
        unit_id: baseUnit.id,
        batch_no: it.batch_no,
        expiry_date: it.expiry_date,
        created_by: userId,
      });
      totalValue += value;
      await connection.execute(
        `UPDATE physical_stock_count_items SET unit_cost = ?, variance_value = ?, ledger_posted = 1 WHERE id = ?`,
        [unitCost, value, it.id]
      );
    }
    await connection.execute(
      `UPDATE physical_stock_counts SET status = 'Posted', total_variance_value = ?, posted_by = ?, posted_at = NOW() WHERE id = ?`,
      [totalValue, userId, id]
    );
    await connection.commit();
    return getPhysicalCountWithItems(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const lockPhysicalStockCount = (id, userId) => transitionDocument('physical_stock_counts', id, userId, 'lock');

export const deletePhysicalStockCount = async (id) => {
  const [row] = await query('SELECT status FROM physical_stock_counts WHERE id = ? LIMIT 1', [id]);
  if (!row) throw new Error('Physical count not found');
  if (row.status !== 'Draft') throw new Error('Only Draft counts can be deleted');
  await query('DELETE FROM physical_stock_counts WHERE id = ?', [id]);
  return { id, deleted: true };
};

// --- Stock Adjustments ---

const getAdjustmentWithItems = async (id) => {
  const [header] = await query('SELECT * FROM stock_adjustments WHERE id = ? LIMIT 1', [id]);
  if (!header) return null;
  const items = await query(
    `SELECT sai.*, rm.material_name, rm.material_code, u.unit_name
     FROM stock_adjustment_items sai
     LEFT JOIN raw_materials rm ON rm.id = sai.raw_material_id
     LEFT JOIN units u ON u.id = sai.unit_id
     WHERE sai.stock_adjustment_id = ?`,
    [id]
  );
  return { ...header, items };
};

export const getStockAdjustments = async (filters = {}) => {
  const { location_id, status, allowedLocationIds } = filters;
  let sql = `SELECT sa.*, l.location_name, l.location_code, u.full_name as created_by_name
    FROM stock_adjustments sa
    LEFT JOIN locations l ON l.id = sa.location_id
    LEFT JOIN users u ON u.id = sa.created_by
    WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND sa.location_id = ?'; params.push(location_id); }
  if (status) { sql += ' AND sa.status = ?'; params.push(status); }
  // Confines a location-scoped caller to adjustments at a location they're
  // allowed to see - see resolveScopedLocationIds in warehouseMiddleware.js.
  if (allowedLocationIds) {
    sql += allowedLocationIds.length ? ' AND sa.location_id IN (?)' : ' AND 1=0';
    if (allowedLocationIds.length) params.push(allowedLocationIds);
  }
  sql += ' ORDER BY sa.created_at DESC';
  return query(sql, params);
};

export const getStockAdjustmentById = (id) => getAdjustmentWithItems(id);

export const createStockAdjustment = async (data, userId) => {
  const { adjustment_no, location_id, adjustment_date, adjustment_reason, remarks, items } = data;
  if (!adjustment_no || !location_id || !adjustment_date || !items?.length) throw new Error('Adjustment number, location, date and items are required');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT id FROM stock_adjustments WHERE adjustment_no = ? LIMIT 1', [adjustment_no]);
    if (existing.length > 0) { await connection.rollback(); throw new Error('Adjustment number already exists'); }
    const [res] = await connection.execute(
      `INSERT INTO stock_adjustments (adjustment_no, location_id, adjustment_date, status, adjustment_reason, remarks, created_by)
       VALUES (?, ?, ?, 'Draft', ?, ?, ?)`,
      [adjustment_no, location_id, adjustment_date, adjustment_reason || null, remarks || null, userId]
    );
    const adjId = res.insertId;
    const totals = { qty: 0, value: 0 };
    for (const it of items) {
      if (!it.raw_material_id || !it.qty || !it.unit_id || !it.adjustment_type) { await connection.rollback(); throw new Error('Invalid adjustment item'); }
      const qty = num(it.qty);
      const itemTotal = num(it.unit_cost || 0) * qty;
      await connection.execute(
        `INSERT INTO stock_adjustment_items (stock_adjustment_id, raw_material_id, unit_id, batch_no, expiry_date, qty, unit_cost, value, adjustment_type, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [adjId, it.raw_material_id, it.unit_id, it.batch_no || null, it.expiry_date || null, qty, num(it.unit_cost || 0), itemTotal, it.adjustment_type, it.reason || null]
      );
      totals.qty += qty;
      totals.value += itemTotal;
    }
    await connection.execute(
      `UPDATE stock_adjustments SET total_qty = ?, total_value = ? WHERE id = ?`,
      [totals.qty, totals.value, adjId]
    );
    await connection.commit();
    return getAdjustmentWithItems(adjId);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const updateStockAdjustment = async (id, data) => {
  const { adjustment_no, location_id, adjustment_date, adjustment_reason, remarks, items } = data;
  const [header] = await query('SELECT * FROM stock_adjustments WHERE id = ? LIMIT 1', [id]);
  if (!header) throw new Error('Stock adjustment not found');
  if (header.status !== 'Draft') throw new Error('Only Draft adjustments can be updated');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE stock_adjustments SET adjustment_no = ?, location_id = ?, adjustment_date = ?, adjustment_reason = ?, remarks = ? WHERE id = ?',
      [adjustment_no || header.adjustment_no, location_id || header.location_id, adjustment_date || header.adjustment_date, adjustment_reason !== undefined ? adjustment_reason : header.adjustment_reason, remarks !== undefined ? remarks : header.remarks, id]
    );
    if (items && items.length > 0) {
      await connection.execute('DELETE FROM stock_adjustment_items WHERE stock_adjustment_id = ?', [id]);
      const totals = { qty: 0, value: 0 };
      for (const it of items) {
        if (!it.raw_material_id || !it.qty || !it.unit_id || !it.adjustment_type) { await connection.rollback(); throw new Error('Invalid adjustment item'); }
        const qty = num(it.qty);
        const itemTotal = num(it.unit_cost || 0) * qty;
        await connection.execute(
          `INSERT INTO stock_adjustment_items (stock_adjustment_id, raw_material_id, unit_id, batch_no, expiry_date, qty, unit_cost, value, adjustment_type, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, it.raw_material_id, it.unit_id, it.batch_no || null, it.expiry_date || null, qty, num(it.unit_cost || 0), itemTotal, it.adjustment_type, it.reason || null]
        );
        totals.qty += qty;
        totals.value += itemTotal;
      }
      await connection.execute(
        `UPDATE stock_adjustments SET total_qty = ?, total_value = ? WHERE id = ?`,
        [totals.qty, totals.value, id]
      );
    }
    await connection.commit();
    return getAdjustmentWithItems(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const submitStockAdjustment = (id, userId) => transitionDocument('stock_adjustments', id, userId, 'submit');
export const verifyStockAdjustment = (id, userId) => transitionDocument('stock_adjustments', id, userId, 'verify');
export const approveStockAdjustment = (id, userId) => transitionDocument('stock_adjustments', id, userId, 'approve');

export const postStockAdjustment = async (id, userId) => {
  const header = await getAdjustmentWithItems(id);
  if (!header) throw new Error('Stock adjustment not found');
  if (header.status !== 'Approved') throw new Error('Only Approved adjustments can be posted');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [lockRows] = await connection.execute('SELECT status FROM stock_adjustments WHERE id = ? FOR UPDATE', [id]);
    if (!lockRows[0] || lockRows[0].status !== 'Approved') {
      await connection.rollback();
      throw new Error('Only Approved adjustments can be posted');
    }
    const txDate = header.adjustment_date;
    const locationId = header.location_id;
    let totalValue = 0;
    for (const it of header.items) {
      if (Number(it.ledger_posted)) continue;
      const qty = num(it.qty);
      if (qty <= 0) { await connection.rollback(); throw new Error(`Quantity must be positive for ${it.material_name}`); }
      const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
      const baseQty = await convertToBase(qty, it.unit_id, baseUnit.id);
      const wac = await getMaterialWAC(locationId, it.raw_material_id);
      const isPositive = it.adjustment_type === 'Positive';
      const allowNegativeStock = await getSettingValue(locationId, 'allow_negative_stock');
      if (!isPositive && !allowNegativeStock && baseQty > wac.currentQty) {
        await connection.rollback(); throw new Error(`Insufficient stock for material ${it.material_name}`);
      }
      if (isPositive && wac.currentQty <= 0 && wac.averageCost <= 0) {
        await connection.rollback(); throw new Error(`Cannot value positive adjustment for material ${it.material_name}; no WAC available`);
      }
      const unitCost = wac.averageCost;
      const value = baseQty * unitCost;
      const transactionType = isPositive ? 'ADJUSTMENT_POSITIVE' : 'ADJUSTMENT_NEGATIVE';
      await postLedger(connection, {
        location_id: locationId,
        raw_material_id: it.raw_material_id,
        transaction_date: txDate,
        transaction_type: transactionType,
        reference_type: 'STOCK_ADJUSTMENT',
        reference_id: id,
        reference_item_id: it.id,
        qty: isPositive ? baseQty : -baseQty,
        unit_cost: unitCost,
        unit_id: baseUnit.id,
        batch_no: it.batch_no,
        expiry_date: it.expiry_date,
        created_by: userId,
      });
      totalValue += value;
      await connection.execute(
        `UPDATE stock_adjustment_items SET unit_cost = ?, value = ?, ledger_posted = 1 WHERE id = ?`,
        [unitCost, value, it.id]
      );
    }
    await connection.execute(
      `UPDATE stock_adjustments SET status = 'Posted', total_value = ?, posted_by = ?, posted_at = NOW() WHERE id = ?`,
      [totalValue, userId, id]
    );
    await connection.commit();
    return getAdjustmentWithItems(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const lockStockAdjustment = (id, userId) => transitionDocument('stock_adjustments', id, userId, 'lock');

export const deleteStockAdjustment = async (id) => {
  const [row] = await query('SELECT status FROM stock_adjustments WHERE id = ? LIMIT 1', [id]);
  if (!row) throw new Error('Stock adjustment not found');
  if (row.status !== 'Draft') throw new Error('Only Draft adjustments can be deleted');
  await query('DELETE FROM stock_adjustments WHERE id = ?', [id]);
  return { id, deleted: true };
};

// --- Warehouse Wastage ---

const getWastageWithItems = async (id) => {
  const [header] = await query('SELECT * FROM warehouse_wastage WHERE id = ? LIMIT 1', [id]);
  if (!header) return null;
  const items = await query(
    `SELECT wwi.*, rm.material_name, rm.material_code, u.unit_name
     FROM warehouse_wastage_items wwi
     LEFT JOIN raw_materials rm ON rm.id = wwi.raw_material_id
     LEFT JOIN units u ON u.id = wwi.unit_id
     WHERE wwi.warehouse_wastage_id = ?`,
    [id]
  );
  return { ...header, items };
};

export const getWarehouseWastages = async (filters = {}) => {
  const { location_id, status, allowedLocationIds } = filters;
  let sql = `SELECT ww.*, l.location_name, l.location_code, u.full_name as created_by_name
    FROM warehouse_wastage ww
    LEFT JOIN locations l ON l.id = ww.location_id
    LEFT JOIN users u ON u.id = ww.created_by
    WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND ww.location_id = ?'; params.push(location_id); }
  if (status) { sql += ' AND ww.status = ?'; params.push(status); }
  // Confines a location-scoped caller to wastage records at a location
  // they're allowed to see - see resolveScopedLocationIds in warehouseMiddleware.js.
  if (allowedLocationIds) {
    sql += allowedLocationIds.length ? ' AND ww.location_id IN (?)' : ' AND 1=0';
    if (allowedLocationIds.length) params.push(allowedLocationIds);
  }
  sql += ' ORDER BY ww.created_at DESC';
  return query(sql, params);
};

export const getWarehouseWastageById = (id) => getWastageWithItems(id);

export const createWarehouseWastage = async (data, userId) => {
  const { wastage_no, location_id, wastage_date, remarks, items } = data;
  if (!wastage_no || !location_id || !wastage_date || !items?.length) throw new Error('Wastage number, location, date and items are required');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT id FROM warehouse_wastage WHERE wastage_no = ? LIMIT 1', [wastage_no]);
    if (existing.length > 0) { await connection.rollback(); throw new Error('Wastage number already exists'); }
    const [res] = await connection.execute(
      `INSERT INTO warehouse_wastage (wastage_no, location_id, wastage_date, status, remarks, created_by)
       VALUES (?, ?, ?, 'Draft', ?, ?)`,
      [wastage_no, location_id, wastage_date, remarks || null, userId]
    );
    const wastageId = res.insertId;
    const totals = { qty: 0, value: 0 };
    for (const it of items) {
      if (!it.raw_material_id || !it.qty || !it.unit_id || !it.wastage_type) { await connection.rollback(); throw new Error('Invalid wastage item'); }
      const qty = num(it.qty);
      const itemTotal = num(it.unit_cost || 0) * qty;
      await connection.execute(
        `INSERT INTO warehouse_wastage_items (warehouse_wastage_id, raw_material_id, unit_id, batch_no, expiry_date, qty, unit_cost, value, wastage_type, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [wastageId, it.raw_material_id, it.unit_id, it.batch_no || null, it.expiry_date || null, qty, num(it.unit_cost || 0), itemTotal, it.wastage_type, it.reason || null]
      );
      totals.qty += qty;
      totals.value += itemTotal;
    }
    await connection.execute(
      `UPDATE warehouse_wastage SET total_qty = ?, total_value = ? WHERE id = ?`,
      [totals.qty, totals.value, wastageId]
    );
    await connection.commit();
    return getWastageWithItems(wastageId);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const updateWarehouseWastage = async (id, data) => {
  const { wastage_no, location_id, wastage_date, remarks, items } = data;
  const [header] = await query('SELECT * FROM warehouse_wastage WHERE id = ? LIMIT 1', [id]);
  if (!header) throw new Error('Wastage not found');
  if (header.status !== 'Draft') throw new Error('Only Draft wastage can be updated');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      'UPDATE warehouse_wastage SET wastage_no = ?, location_id = ?, wastage_date = ?, remarks = ? WHERE id = ?',
      [wastage_no || header.wastage_no, location_id || header.location_id, wastage_date || header.wastage_date, remarks !== undefined ? remarks : header.remarks, id]
    );
    if (items && items.length > 0) {
      await connection.execute('DELETE FROM warehouse_wastage_items WHERE warehouse_wastage_id = ?', [id]);
      const totals = { qty: 0, value: 0 };
      for (const it of items) {
        if (!it.raw_material_id || !it.qty || !it.unit_id || !it.wastage_type) { await connection.rollback(); throw new Error('Invalid wastage item'); }
        const qty = num(it.qty);
        const itemTotal = num(it.unit_cost || 0) * qty;
        await connection.execute(
          `INSERT INTO warehouse_wastage_items (warehouse_wastage_id, raw_material_id, unit_id, batch_no, expiry_date, qty, unit_cost, value, wastage_type, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, it.raw_material_id, it.unit_id, it.batch_no || null, it.expiry_date || null, qty, num(it.unit_cost || 0), itemTotal, it.wastage_type, it.reason || null]
        );
        totals.qty += qty;
        totals.value += itemTotal;
      }
      await connection.execute(
        `UPDATE warehouse_wastage SET total_qty = ?, total_value = ? WHERE id = ?`,
        [totals.qty, totals.value, id]
      );
    }
    await connection.commit();
    return getWastageWithItems(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const submitWarehouseWastage = (id, userId) => transitionDocument('warehouse_wastage', id, userId, 'submit');
export const verifyWarehouseWastage = (id, userId) => transitionDocument('warehouse_wastage', id, userId, 'verify');
export const approveWarehouseWastage = (id, userId) => transitionDocument('warehouse_wastage', id, userId, 'approve');

export const postWarehouseWastage = async (id, userId) => {
  const header = await getWastageWithItems(id);
  if (!header) throw new Error('Wastage not found');
  if (header.status !== 'Approved') throw new Error('Only Approved wastage can be posted');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [lockRows] = await connection.execute('SELECT status FROM warehouse_wastage WHERE id = ? FOR UPDATE', [id]);
    if (!lockRows[0] || lockRows[0].status !== 'Approved') {
      await connection.rollback();
      throw new Error('Only Approved wastage can be posted');
    }
    const txDate = header.wastage_date;
    const locationId = header.location_id;
    let totalValue = 0;
    for (const it of header.items) {
      if (Number(it.ledger_posted)) continue;
      const qty = num(it.qty);
      if (qty <= 0) { await connection.rollback(); throw new Error(`Quantity must be positive for ${it.material_name}`); }
      const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
      const baseQty = await convertToBase(qty, it.unit_id, baseUnit.id);
      const wac = await getMaterialWAC(locationId, it.raw_material_id);
      if (baseQty > wac.currentQty) {
        await connection.rollback(); throw new Error(`Insufficient stock for material ${it.material_name}`);
      }
      const unitCost = wac.averageCost;
      const value = baseQty * unitCost;
      await postLedger(connection, {
        location_id: locationId,
        raw_material_id: it.raw_material_id,
        transaction_date: txDate,
        transaction_type: 'WASTAGE',
        reference_type: 'WASTAGE',
        reference_id: id,
        reference_item_id: it.id,
        qty: -baseQty,
        unit_cost: unitCost,
        unit_id: baseUnit.id,
        batch_no: it.batch_no,
        expiry_date: it.expiry_date,
        created_by: userId,
      });
      totalValue += value;
      await connection.execute(
        `UPDATE warehouse_wastage_items SET unit_cost = ?, value = ?, ledger_posted = 1 WHERE id = ?`,
        [unitCost, value, it.id]
      );
    }
    await connection.execute(
      `UPDATE warehouse_wastage SET status = 'Posted', total_value = ?, posted_by = ?, posted_at = NOW() WHERE id = ?`,
      [totalValue, userId, id]
    );
    await connection.commit();
    return getWastageWithItems(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const lockWarehouseWastage = (id, userId) => transitionDocument('warehouse_wastage', id, userId, 'lock');

export const deleteWarehouseWastage = async (id) => {
  const [row] = await query('SELECT status FROM warehouse_wastage WHERE id = ? LIMIT 1', [id]);
  if (!row) throw new Error('Wastage not found');
  if (row.status !== 'Draft') throw new Error('Only Draft wastage can be deleted');
  await query('DELETE FROM warehouse_wastage WHERE id = ?', [id]);
  return { id, deleted: true };
};
