import { query, getConnection } from '../config/database.js';
import { convertToBase, normalizeRateToBase } from '../utils/uomUtils.js';

const num = v => v === null || v === undefined || v === '' ? 0 : Number(v);
const fmt = n => Math.round((num(n) + Number.EPSILON) * 1e6) / 1e6;

const REASONS = [
  'Damaged Material','Quality Issue','Wrong Material Supplied','Excess Supply',
  'Packaging Damage','Batch Recall','Supplier Rejection','Short Shelf Life',
  'Expired - Supplier Accepted Return','Other'
];

const TRANSITIONS = {
  submit: { from: 'Draft', to: 'Submitted' },
  verify: { from: 'Submitted', to: 'Verified' },
  approve: { from: 'Verified', to: 'Approved' },
  reject: { from: ['Submitted','Verified'], to: 'Rejected' },
  post: { from: 'Approved', to: 'Posted' },
  lock: { from: 'Posted', to: 'Locked' }
};

const nextReturnNo = async () => {
  const y = new Date().getFullYear();
  const rows = await query(`SELECT return_no FROM purchase_returns WHERE return_no LIKE ? ORDER BY id DESC LIMIT 1`, [`PR-${y}-%`]);
  const n = rows.length ? (parseInt(rows[0].return_no.split('-').pop()) || 0) + 1 : 1;
  return `PR-${y}-${String(n).padStart(5, '0')}`;
};

const getWAC = async (locationId, materialId) => {
  const rows = await query(`
    SELECT SUM(qty_in - qty_out) as qty, SUM(value_in - value_out) as val
    FROM stock_ledger
    WHERE location_id = ? AND raw_material_id = ?
  `, [locationId, materialId]);
  const q = num(rows[0]?.qty), v = num(rows[0]?.val);
  return q > 0 ? v / q : 0;
};

const getBatchWAC = async (locationId, materialId, batchNo, expiryDate) => {
  const rows = await query(`
    SELECT SUM(qty_in - qty_out) as qty, SUM(value_in - value_out) as val
    FROM stock_ledger
    WHERE location_id = ? AND raw_material_id = ? AND batch_no = ? AND (expiry_date = ? OR (expiry_date IS NULL AND ? IS NULL))
  `, [locationId, materialId, batchNo, expiryDate, expiryDate]);
  const q = num(rows[0]?.qty), v = num(rows[0]?.val);
  return q > 0 ? v / q : 0;
};

const previouslyReturnedQty = async (grnItemId) => {
  if (!grnItemId) return 0;
  const rows = await query(`
    SELECT COALESCE(SUM(i.base_qty),0) as total
    FROM purchase_return_items i
    JOIN purchase_returns r ON r.id = i.purchase_return_id
    WHERE i.grn_item_id = ? AND r.status IN ('Posted','Locked')
  `, [grnItemId]);
  return num(rows[0]?.total);
};

const getReturnableQty = async (grnItemId) => {
  const [item] = await query('SELECT accepted_qty, raw_material_id, unit_id, rate, batch_no, expiry_date, grn_id FROM grn_items WHERE id = ?', [grnItemId]);
  if (!item) return 0;
  const baseAccepted = await convertToBase(num(item.accepted_qty), item.unit_id, (await query('SELECT unit_id FROM raw_materials WHERE id = ?', [item.raw_material_id]))[0].unit_id);
  const returned = await previouslyReturnedQty(grnItemId);
  return Math.max(0, num(baseAccepted) - returned);
};

const getBatchAvailable = async (locationId, materialId, batchNo, expiryDate) => {
  const rows = await query(`
    SELECT SUM(qty_in - qty_out) as qty
    FROM stock_ledger
    WHERE location_id = ? AND raw_material_id = ? AND batch_no = ? AND (expiry_date = ? OR (expiry_date IS NULL AND ? IS NULL))
  `, [locationId, materialId, batchNo, expiryDate, expiryDate]);
  return num(rows[0]?.qty);
};

const getCurrentAvailable = async (locationId, materialId) => {
  const rows = await query(`
    SELECT SUM(qty_in - qty_out) as qty
    FROM stock_ledger
    WHERE location_id = ? AND raw_material_id = ?
  `, [locationId, materialId]);
  return num(rows[0]?.qty);
};

export const getReturns = async (filters = {}) => {
  let sql = `
    SELECT r.*,
      s.supplier_name, g.grn_no, l.location_name,
      u1.full_name as created_by_name, u2.full_name as submitted_by_name,
      u3.full_name as verified_by_name, u4.full_name as approved_by_name,
      u5.full_name as posted_by_name,
      sc.credit_amount as credit_amount, sc.status as credit_status
    FROM purchase_returns r
    LEFT JOIN suppliers s ON s.id = r.supplier_id
    LEFT JOIN grn g ON g.id = r.grn_id
    LEFT JOIN locations l ON l.id = r.warehouse_location_id
    LEFT JOIN users u1 ON u1.id = r.created_by
    LEFT JOIN users u2 ON u2.id = r.submitted_by
    LEFT JOIN users u3 ON u3.id = r.verified_by
    LEFT JOIN users u4 ON u4.id = r.approved_by
    LEFT JOIN users u5 ON u5.id = r.posted_by
    LEFT JOIN supplier_credits sc ON sc.purchase_return_id = r.id
    WHERE 1=1`;
  const params = [];
  if (filters.location_id) { sql += ' AND r.warehouse_location_id = ?'; params.push(filters.location_id); }
  if (filters.supplier_id) { sql += ' AND r.supplier_id = ?'; params.push(filters.supplier_id); }
  if (filters.status) { sql += ' AND r.status = ?'; params.push(filters.status); }
  if (filters.search) { sql += ` AND (r.return_no LIKE ? OR g.grn_no LIKE ? OR s.supplier_name LIKE ?)`; params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`); }
  if (filters.from_date && filters.to_date) { sql += ' AND r.return_date BETWEEN ? AND ?'; params.push(filters.from_date, filters.to_date); }
  // Confines a location-scoped caller to returns at a location they're
  // allowed to see - see resolveScopedLocationIds in warehouseMiddleware.js.
  if (filters.allowedLocationIds) {
    sql += filters.allowedLocationIds.length ? ' AND r.warehouse_location_id IN (?)' : ' AND 1=0';
    if (filters.allowedLocationIds.length) params.push(filters.allowedLocationIds);
  }
  sql += ' ORDER BY r.id DESC';
  return await query(sql, params);
};

export const getReturnById = async (id) => {
  const [header] = await query(`
    SELECT r.*, s.supplier_name, g.grn_no, l.location_name,
      sc.credit_amount, sc.status as credit_status, sc.id as supplier_credit_id
    FROM purchase_returns r
    LEFT JOIN suppliers s ON s.id = r.supplier_id
    LEFT JOIN grn g ON g.id = r.grn_id
    LEFT JOIN locations l ON l.id = r.warehouse_location_id
    LEFT JOIN supplier_credits sc ON sc.purchase_return_id = r.id
    WHERE r.id = ?
  `, [id]);
  if (!header) return null;
  const items = await query(`
    SELECT i.*, rm.material_name, rm.material_code, u.unit_name as input_unit_name, bu.unit_name as base_unit_name
    FROM purchase_return_items i
    JOIN raw_materials rm ON rm.id = i.raw_material_id
    LEFT JOIN units u ON u.id = i.input_unit_id
    LEFT JOIN units bu ON bu.id = i.base_unit_id
    WHERE i.purchase_return_id = ?
  `, [id]);
  const credits = await query('SELECT * FROM supplier_credits WHERE purchase_return_id = ?', [id]);
  return { ...header, items, credits };
};

export const getGRNsForReturn = async (supplierId, locationId) => {
  return await query(`
    SELECT g.*, l.location_name
    FROM grn g
    LEFT JOIN locations l ON l.id = g.warehouse_location_id
    WHERE g.supplier_id = ? AND g.warehouse_location_id = ?
      AND g.status = 'Posted'
    ORDER BY g.grn_date DESC
  `, [supplierId, locationId]);
};

export const getGRNItems = async (grnId) => {
  const items = await query(`
    SELECT gi.*, rm.material_name, rm.material_code, rm.is_batch_tracked, rm.unit_id as base_unit_id,
      u.unit_name, u.unit_symbol, bu.unit_name as base_unit_name
    FROM grn_items gi
    JOIN raw_materials rm ON rm.id = gi.raw_material_id
    LEFT JOIN units u ON u.id = gi.unit_id
    LEFT JOIN units bu ON bu.id = rm.unit_id
    WHERE gi.grn_id = ?
  `, [grnId]);
  for (const it of items) {
    const baseAccepted = await convertToBase(num(it.accepted_qty), it.unit_id, it.base_unit_id);
    it.returnable_qty = Math.max(0, baseAccepted - await previouslyReturnedQty(it.id));
    it.base_unit_name = (await query('SELECT unit_name FROM units WHERE id = ?', [it.base_unit_id]))[0]?.unit_name;
  }
  return items;
};

const computeItem = async (it, locationId) => {
  const mat = (await query('SELECT unit_id, is_batch_tracked FROM raw_materials WHERE id = ?', [it.raw_material_id]))[0];
  const baseQty = await convertToBase(num(it.return_qty), it.input_unit_id, mat.unit_id);
  const wac = await getWAC(locationId, it.raw_material_id);
  const invValue = fmt(baseQty * wac);
  const grnRate = num(it.original_purchase_rate) || 0;
  const supRate = await normalizeRateToBase(grnRate, it.input_unit_id, mat.unit_id);
  const supCredit = fmt(baseQty * supRate);
  return {
    ...it,
    base_qty: baseQty,
    base_unit_id: mat.unit_id,
    inventory_unit_cost: wac,
    inventory_value: invValue,
    supplier_credit_value: supCredit
  };
};

export const createReturn = async (data, userId) => {
  const return_no = await nextReturnNo();
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [h] = await conn.execute(`
      INSERT INTO purchase_returns (return_no, return_date, supplier_id, grn_id, warehouse_location_id, supplier_invoice_reference,
        supplier_credit_note_no, supplier_credit_note_date, return_reason, remarks, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)
    `, [return_no, data.return_date, data.supplier_id, data.grn_id, data.warehouse_location_id, data.supplier_invoice_reference || null,
        data.supplier_credit_note_no || null, data.supplier_credit_note_date || null, data.return_reason, data.remarks, userId]);
    const returnId = h.insertId;
    let totalQty = 0, totalValue = 0;
    for (const it of data.items) {
      const comp = await computeItem(it, data.warehouse_location_id);
      await conn.execute(`
        INSERT INTO purchase_return_items (purchase_return_id, grn_item_id, raw_material_id, batch_no, expiry_date, return_qty,
          input_unit_id, base_qty, base_unit_id, original_purchase_rate, supplier_credit_value, inventory_unit_cost, inventory_value, reason, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [returnId, it.grn_item_id, it.raw_material_id, it.batch_no || null, it.expiry_date || null, it.return_qty, it.input_unit_id,
          comp.base_qty, comp.base_unit_id, comp.original_purchase_rate, comp.supplier_credit_value, comp.inventory_unit_cost, comp.inventory_value, it.reason, it.remarks || null]);
      totalQty += comp.base_qty;
      totalValue += comp.inventory_value;
    }
    await conn.execute('UPDATE purchase_returns SET total_return_qty = ?, total_return_value = ? WHERE id = ?', [totalQty, totalValue, returnId]);
    await conn.commit();
    return getReturnById(returnId);
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
};

export const updateReturn = async (id, data, userId) => {
  const existing = await getReturnById(id);
  if (!existing || existing.status !== 'Draft') throw new Error('Only Draft returns can be updated');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`
      UPDATE purchase_returns SET return_date=?, supplier_id=?, grn_id=?, warehouse_location_id=?, supplier_invoice_reference=?,
        supplier_credit_note_no=?, supplier_credit_note_date=?, return_reason=?, remarks=? WHERE id=?
    `, [data.return_date, data.supplier_id, data.grn_id, data.warehouse_location_id, data.supplier_invoice_reference || null,
        data.supplier_credit_note_no || null, data.supplier_credit_note_date || null, data.return_reason, data.remarks, id]);
    await conn.execute('DELETE FROM purchase_return_items WHERE purchase_return_id = ?', [id]);
    let totalQty = 0, totalValue = 0;
    for (const it of data.items) {
      const comp = await computeItem(it, data.warehouse_location_id);
      await conn.execute(`
        INSERT INTO purchase_return_items (purchase_return_id, grn_item_id, raw_material_id, batch_no, expiry_date, return_qty,
          input_unit_id, base_qty, base_unit_id, original_purchase_rate, supplier_credit_value, inventory_unit_cost, inventory_value, reason, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, it.grn_item_id, it.raw_material_id, it.batch_no || null, it.expiry_date || null, it.return_qty, it.input_unit_id,
          comp.base_qty, comp.base_unit_id, comp.original_purchase_rate, comp.supplier_credit_value, comp.inventory_unit_cost, comp.inventory_value, it.reason, it.remarks || null]);
      totalQty += comp.base_qty;
      totalValue += comp.inventory_value;
    }
    await conn.execute('UPDATE purchase_returns SET total_return_qty = ?, total_return_value = ? WHERE id = ?', [totalQty, totalValue, id]);
    await conn.commit();
    return getReturnById(id);
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
};

export const deleteReturn = async (id, userId) => {
  const existing = await getReturnById(id);
  if (!existing || !['Draft','Rejected'].includes(existing.status)) throw new Error('Only Draft/Rejected returns can be deleted');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM purchase_return_items WHERE purchase_return_id = ?', [id]);
    await conn.execute('DELETE FROM supplier_credits WHERE purchase_return_id = ?', [id]);
    await conn.execute('DELETE FROM purchase_returns WHERE id = ?', [id]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
};

const transition = async (id, action, userId, extra = {}) => {
  const cfg = TRANSITIONS[action];
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT status, created_by, verified_by FROM purchase_returns WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await conn.rollback(); throw new Error('Return not found'); }
    const row = rows[0];
    if (Array.isArray(cfg.from) ? !cfg.from.includes(row.status) : row.status !== cfg.from) { await conn.rollback(); throw new Error(`Invalid status transition from ${row.status}`); }
    if (action === 'verify' && row.created_by === userId) { await conn.rollback(); throw new Error('Creator cannot verify own return'); }
    const sets = { status: cfg.to };
    if (action === 'submit') { sets.submitted_by = userId; sets.submitted_at = new Date(); }
    if (action === 'verify') { sets.verified_by = userId; sets.verified_at = new Date(); }
    if (action === 'approve') { sets.approved_by = userId; sets.approved_at = new Date(); }
    if (action === 'reject') { sets.rejected_by = userId; sets.rejected_at = new Date(); sets.rejection_reason = extra.rejection_reason; }
    const keys = Object.keys(sets).map(k => `${k} = ?`).join(', ');
    await conn.execute(`UPDATE purchase_returns SET ${keys} WHERE id = ?`, [...Object.values(sets), id]);
    await conn.commit();
    return getReturnById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
};

export const submitReturn = (id, userId) => transition(id, 'submit', userId);
export const verifyReturn = (id, userId) => transition(id, 'verify', userId);
export const approveReturn = (id, userId) => transition(id, 'approve', userId);
export const rejectReturn = (id, userId, reason) => transition(id, 'reject', userId, { rejection_reason: reason });
export const lockReturn = (id, userId) => transition(id, 'lock', userId);

export const postReturn = async (id, userId) => {
  const existing = await getReturnById(id);
  if (!existing || existing.status !== 'Approved') throw new Error('Only Approved returns can be posted');
  const posted = await query(`SELECT id FROM stock_ledger WHERE transaction_type = 'PURCHASE_RETURN' AND reference_id = ? LIMIT 1`, [id]);
  if (posted.length) throw new Error('Purchase return already posted');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [lockRows] = await conn.execute('SELECT status FROM purchase_returns WHERE id = ? FOR UPDATE', [id]);
    if (!lockRows[0] || lockRows[0].status !== 'Approved') {
      await conn.rollback();
      throw new Error('Only Approved returns can be posted');
    }
    const [itemRows] = await conn.execute('SELECT * FROM purchase_return_items WHERE purchase_return_id = ?', [id]);
    for (const it of itemRows) {
      const grn = it.grn_item_id ? (await conn.execute('SELECT * FROM grn_items WHERE id = ?', [it.grn_item_id]))[0][0] : null;
      if (it.grn_item_id) {
        const returnable = await getReturnableQty(it.grn_item_id);
        if (num(it.base_qty) > returnable) throw new Error(`Returnable qty exceeded for material ${it.raw_material_id}`);
      }
      const current = await getCurrentAvailable(existing.warehouse_location_id, it.raw_material_id);
      if (num(it.base_qty) > current) throw new Error(`Insufficient warehouse stock for material ${it.raw_material_id}`);
      if (it.batch_no) {
        const batchAvail = await getBatchAvailable(existing.warehouse_location_id, it.raw_material_id, it.batch_no, it.expiry_date);
        if (num(it.base_qty) > batchAvail) throw new Error(`Insufficient batch stock for material ${it.raw_material_id}`);
      }
    }
    let totalInv = 0;
    for (const it of itemRows) {
      const wac = it.batch_no ? await getBatchWAC(existing.warehouse_location_id, it.raw_material_id, it.batch_no, it.expiry_date) : it.inventory_unit_cost;
      const value = fmt(num(it.base_qty) * wac);
      totalInv += value;
      await conn.execute(`
        INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id,
          qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
        VALUES (?, ?, ?, 'PURCHASE_RETURN', 'PURCHASE_RETURN', ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?)
      `, [existing.warehouse_location_id, it.raw_material_id, existing.return_date, id, it.id, it.base_qty, it.base_unit_id, wac, value, it.batch_no, it.expiry_date, userId]);
    }
    await conn.execute('UPDATE purchase_returns SET total_return_value = ?, posted_by = ?, posted_at = NOW(), status = ? WHERE id = ?', [totalInv, userId, 'Posted', id]);
    const totalCredit = itemRows.reduce((s, it) => s + num(it.supplier_credit_value), 0);
    await conn.execute(`
      INSERT INTO supplier_credits (supplier_id, purchase_return_id, credit_note_no, credit_note_date, credit_amount, status, remarks)
      VALUES (?, ?, ?, ?, ?, 'Pending', ?)
    `, [existing.supplier_id, id, existing.supplier_credit_note_no, existing.supplier_credit_note_date, totalCredit, 'Purchase return supplier credit']);
    await conn.commit();
    return getReturnById(id);
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
};

export const getCreditsSummary = async () => {
  const rows = await query(`
    SELECT status, COUNT(*) as cnt, COALESCE(SUM(credit_amount), 0) as total
    FROM supplier_credits
    GROUP BY status
  `);
  const summary = { pending: 0, received: 0, reconciled: 0 };
  for (const r of rows) {
    const key = String(r.status).toLowerCase();
    if (key in summary) summary[key] = num(r.total);
  }
  return summary;
};

export const updateCreditStatus = async (creditId, status, userId) => {
  if (!['Pending', 'Received', 'Reconciled'].includes(status)) throw new Error('Invalid credit status');
  const conn = await getConnection();
  try {
    await conn.execute('UPDATE supplier_credits SET status = ? WHERE id = ?', [status, creditId]);
    const [rows] = await conn.execute('SELECT purchase_return_id FROM supplier_credits WHERE id = ?', [creditId]);
    return getReturnById(rows[0].purchase_return_id);
  } finally { conn.release(); }
};
