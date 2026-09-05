import { query, getConnection } from '../config/database.js';
import { getUnit, getMaterialBaseUnit, convertToBase } from '../utils/uomUtils.js';

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));
const fmt = (v) => Math.round(num(v) * 10000) / 10000;

const VALID_STATUS = ['Draft','Submitted','Approved','Sent','Partially Received','Received','Rejected','Closed'];
const WORKFLOW_TRANSITIONS = {
  Draft: ['Submitted'],
  Submitted: ['Approved','Rejected'],
  Approved: ['Sent','Rejected'],
  Sent: ['Partially Received','Received','Closed'],
  'Partially Received': ['Received','Partially Received','Closed'],
  Received: ['Closed'],
};

export const generatePONumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const rows = await query("SELECT po_no FROM purchase_orders WHERE po_no LIKE ? ORDER BY po_no DESC LIMIT 1", [`${prefix}%`]);
  let next = 1;
  if (rows.length > 0) {
    const last = String(rows[0].po_no).split('-').pop();
    next = Number(last) + 1 || 1;
  }
  return `${prefix}${String(next).padStart(6, '0')}`;
};

const validatePOItems = (items) => {
  for (const it of items) {
    if (num(it.ordered_qty) <= 0) throw new Error('Ordered quantity must be greater than zero for every item');
    if (num(it.rate) < 0) throw new Error('Rate cannot be negative');
    if (num(it.discount) < 0) throw new Error('Discount cannot be negative');
    if (num(it.tax) < 0) throw new Error('Tax cannot be negative');
  }
};

const computeLineValue = (item) => {
  const qty = num(item.ordered_qty);
  const rate = num(item.rate);
  const gross = qty * rate;
  const discount = num(item.discount);
  const tax = num(item.tax);
  return Math.max(0, gross - discount + tax);
};

const recalcTotals = (items) => {
  const subtotal = items.reduce((s, it) => s + (num(it.ordered_qty) * num(it.rate)), 0);
  const discount = items.reduce((s, it) => s + num(it.discount), 0);
  const tax = items.reduce((s, it) => s + num(it.tax), 0);
  const total = Math.max(0, subtotal - discount + tax);
  return { subtotal: fmt(subtotal), discount_amount: fmt(discount), tax_amount: fmt(tax), total_amount: fmt(total) };
};

// Both call sites (getPOReceiptSummary, getGRNPrefill) are read-only report
// helpers outside any transaction, always called with no open connection -
// this used to unconditionally call conn.execute() on that null, throwing
// "Cannot read properties of null (reading 'execute')" on every single
// call, so both PO receipt-summary and GRN-prefill-from-PO were completely
// broken. Uses the plain query() helper instead of requiring a connection.
const getAcceptedByPOItem = async (poId, itemId) => {
  const rows = await query(`
    SELECT COALESCE(SUM(gri.accepted_qty), 0) as total
    FROM grn g
    JOIN grn_items gri ON gri.grn_id = g.id
    WHERE g.purchase_order_id = ? AND gri.raw_material_id = (
      SELECT raw_material_id FROM purchase_order_items WHERE id = ?
    ) AND g.status = 'Posted'
  `, [poId, itemId]);
  return num(rows[0]?.total);
};

export const getPOs = async (filters = {}) => {
  const { location_id, supplier_id, status, from_date, to_date, search, allowedLocationIds } = filters;
  let sql = `
    SELECT po.*, s.supplier_name, s.supplier_code, l.location_name,
      u1.full_name as created_by_name, u2.full_name as submitted_by_name,
      u3.full_name as approved_by_name, u4.full_name as sent_by_name,
      u5.full_name as closed_by_name, u6.full_name as rejected_by_name
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN locations l ON l.id = po.warehouse_location_id
    LEFT JOIN users u1 ON u1.id = po.created_by
    LEFT JOIN users u2 ON u2.id = po.submitted_by
    LEFT JOIN users u3 ON u3.id = po.approved_by
    LEFT JOIN users u4 ON u4.id = po.sent_by
    LEFT JOIN users u5 ON u5.id = po.closed_by
    LEFT JOIN users u6 ON u6.id = po.rejected_by
    WHERE 1=1
  `;
  const params = [];
  if (location_id) { sql += ' AND po.warehouse_location_id = ?'; params.push(location_id); }
  if (supplier_id) { sql += ' AND po.supplier_id = ?'; params.push(supplier_id); }
  if (status) { sql += ' AND po.status = ?'; params.push(status); }
  if (from_date && to_date) { sql += ' AND po.po_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  if (search) { sql += ` AND (po.po_no LIKE ? OR s.supplier_name LIKE ? OR po.reference LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  // Confines a location-scoped caller to POs at a location they're allowed
  // to see - see resolveScopedLocationIds in warehouseMiddleware.js.
  if (allowedLocationIds) {
    sql += allowedLocationIds.length ? ' AND po.warehouse_location_id IN (?)' : ' AND 1=0';
    if (allowedLocationIds.length) params.push(allowedLocationIds);
  }
  sql += ' ORDER BY po.id DESC';
  return query(sql, params);
};

export const getPOById = async (id) => {
  const [header] = await query(`
    SELECT po.*, s.supplier_name, s.supplier_code, s.payment_terms, s.gstin,
      s.address as supplier_address, s.city as supplier_city, s.state as supplier_state, s.pincode as supplier_pincode,
      s.phone as supplier_phone, s.email as supplier_email,
      l.location_name, l.location_code, l.gstin as location_gstin, l.address as location_address,
      l.city as location_city, l.state as location_state, l.pincode as location_pincode,
      u1.full_name as created_by_name, u2.full_name as submitted_by_name,
      u3.full_name as approved_by_name, u4.full_name as sent_by_name,
      u5.full_name as closed_by_name, u6.full_name as rejected_by_name
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN locations l ON l.id = po.warehouse_location_id
    LEFT JOIN users u1 ON u1.id = po.created_by
    LEFT JOIN users u2 ON u2.id = po.submitted_by
    LEFT JOIN users u3 ON u3.id = po.approved_by
    LEFT JOIN users u4 ON u4.id = po.sent_by
    LEFT JOIN users u5 ON u5.id = po.closed_by
    LEFT JOIN users u6 ON u6.id = po.rejected_by
    WHERE po.id = ?
  `, [id]);
  if (!header) return null;
  const items = await query(`
    SELECT poi.*, rm.material_code, rm.material_name, rm.is_batch_tracked, rm.is_expiry_tracked,
      rm.hsn_code, rm.gst_rate,
      u.unit_name, u.unit_symbol, bu.unit_name as base_unit_name
    FROM purchase_order_items poi
    LEFT JOIN raw_materials rm ON rm.id = poi.raw_material_id
    LEFT JOIN units u ON u.id = poi.unit_id
    LEFT JOIN units bu ON bu.id = rm.unit_id
    WHERE poi.purchase_order_id = ?
  `, [id]);
  const linkedGRNs = await query(`
    SELECT g.id, g.grn_no, g.grn_date, g.status, g.total_amount,
      (SELECT COUNT(*) FROM grn_items WHERE grn_id = g.id) as item_count
    FROM grn g
    WHERE g.purchase_order_id = ?
    ORDER BY g.created_at DESC
  `, [id]);
  return { ...header, items, linked_grns: linkedGRNs };
};

export const createPO = async (data, userId) => {
  const { po_date, supplier_id, warehouse_location_id, expected_delivery_date, payment_terms, reference, remarks, items } = data;
  if (!po_date || !supplier_id || !warehouse_location_id || !items?.length) throw new Error('PO date, supplier, warehouse and items are required');
  validatePOItems(items);
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const poNo = await generatePONumber();
    const totals = recalcTotals(items);
    const [res] = await conn.execute(
      `INSERT INTO purchase_orders (po_no, po_date, supplier_id, warehouse_location_id, expected_delivery_date, payment_terms, reference, remarks, subtotal, discount_amount, tax_amount, total_amount, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`,
      [poNo, po_date, supplier_id, warehouse_location_id, expected_delivery_date || null, payment_terms || null, reference || null, remarks || null,
       totals.subtotal, totals.discount_amount, totals.tax_amount, totals.total_amount, userId]
    );
    const poId = res.insertId;
    for (const it of items) {
      const material = (await conn.execute('SELECT is_batch_tracked, is_expiry_tracked FROM raw_materials WHERE id = ?', [it.raw_material_id]))[0][0];
      const lineValue = computeLineValue(it);
      await conn.execute(
        `INSERT INTO purchase_order_items (purchase_order_id, raw_material_id, ordered_qty, unit_id, rate, discount, tax, line_value, batch_required, expiry_required, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [poId, it.raw_material_id, num(it.ordered_qty), it.unit_id, num(it.rate), num(it.discount), num(it.tax), lineValue,
         it.batch_required ?? material?.is_batch_tracked ?? 0, it.expiry_required ?? material?.is_expiry_tracked ?? 0, it.remarks || null]
      );
    }
    await conn.commit();
    return getPOById(poId);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
};

export const updatePO = async (id, data, userId) => {
  const po = await getPOById(id);
  if (!po) throw new Error('PO not found');
  if (po.status !== 'Draft') throw new Error('Only Draft PO can be edited');
  const { po_date, supplier_id, warehouse_location_id, expected_delivery_date, payment_terms, reference, remarks, items } = data;
  if (!items?.length) throw new Error('PO must have at least one item');
  validatePOItems(items);
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const totals = recalcTotals(items);
    await conn.execute(
      `UPDATE purchase_orders SET po_date = ?, supplier_id = ?, warehouse_location_id = ?, expected_delivery_date = ?, payment_terms = ?, reference = ?, remarks = ?,
       subtotal = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, updated_at = NOW() WHERE id = ?`,
      [po_date, supplier_id, warehouse_location_id, expected_delivery_date || null, payment_terms || null, reference || null, remarks || null,
       totals.subtotal, totals.discount_amount, totals.tax_amount, totals.total_amount, id]
    );
    await conn.execute('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [id]);
    for (const it of items) {
      const material = (await conn.execute('SELECT is_batch_tracked, is_expiry_tracked FROM raw_materials WHERE id = ?', [it.raw_material_id]))[0][0];
      const lineValue = computeLineValue(it);
      await conn.execute(
        `INSERT INTO purchase_order_items (purchase_order_id, raw_material_id, ordered_qty, unit_id, rate, discount, tax, line_value, batch_required, expiry_required, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, it.raw_material_id, num(it.ordered_qty), it.unit_id, num(it.rate), num(it.discount), num(it.tax), lineValue,
         it.batch_required ?? material?.is_batch_tracked ?? 0, it.expiry_required ?? material?.is_expiry_tracked ?? 0, it.remarks || null]
      );
    }
    await conn.commit();
    return getPOById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
};

export const deletePO = async (id) => {
  const po = await getPOById(id);
  if (!po) throw new Error('PO not found');
  if (po.status !== 'Draft') throw new Error('Only Draft PO can be deleted');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [id]);
    await conn.execute('DELETE FROM purchase_orders WHERE id = ?', [id]);
    await conn.commit();
    return { id };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
};

const applyWorkflow = async (id, status, byField, atField, userId, reason = null) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT status FROM purchase_orders WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await conn.rollback(); throw new Error('PO not found'); }
    const currentStatus = rows[0].status;
    const allowed = WORKFLOW_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) { await conn.rollback(); throw new Error(`Cannot change status from ${currentStatus} to ${status}`); }
    const updates = [`status = ?`, `${byField} = ?`, `${atField} = NOW()`];
    const params = [status, userId];
    if (byField === 'rejected_by' && reason) { updates.push('rejection_reason = ?'); params.push(reason); }
    if (byField === 'closed_by' && reason) { updates.push('close_reason = ?'); params.push(reason); }
    await conn.execute(`UPDATE purchase_orders SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, [...params, id]);
    await conn.commit();
    return getPOById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
};

export const submitPO = (id, userId) => applyWorkflow(id, 'Submitted', 'submitted_by', 'submitted_at', userId);
export const approvePO = (id, userId) => applyWorkflow(id, 'Approved', 'approved_by', 'approved_at', userId);
export const rejectPO = (id, userId, reason) => applyWorkflow(id, 'Rejected', 'rejected_by', 'rejected_at', userId, reason);
export const sendPO = (id, userId) => applyWorkflow(id, 'Sent', 'sent_by', 'sent_at', userId);

export const closePO = async (id, userId, reason) => {
  if (!reason) throw new Error('Close reason is required');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT status FROM purchase_orders WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await conn.rollback(); throw new Error('PO not found'); }
    if (rows[0].status === 'Closed' || rows[0].status === 'Received') { await conn.rollback(); throw new Error('PO is already closed or fully received'); }
    await conn.execute(`UPDATE purchase_orders SET status = 'Closed', closed_by = ?, closed_at = NOW(), close_reason = ?, updated_at = NOW() WHERE id = ?`, [userId, reason, id]);
    await conn.commit();
    return getPOById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
};

export const getPOReceiptSummary = async (poId) => {
  const po = await getPOById(poId);
  if (!po) throw new Error('PO not found');
  const summary = [];
  for (const it of po.items) {
    const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
    const accepted = await getAcceptedByPOItem(poId, it.id);
    const acceptedBase = await convertToBase(accepted, it.unit_id, baseUnit.id);
    const orderedBase = await convertToBase(num(it.ordered_qty), it.unit_id, baseUnit.id);
    summary.push({
      ...it,
      ordered_base: orderedBase,
      accepted_qty: accepted,
      accepted_base: acceptedBase,
      remaining_qty: Math.max(0, orderedBase - acceptedBase),
    });
  }
  return { po, items: summary };
};

export const getGRNPrefill = async (poId) => {
  const po = await getPOById(poId);
  if (!po) throw new Error('PO not found');
  if (!['Approved','Sent','Partially Received'].includes(po.status)) throw new Error('PO cannot be received yet');
  const items = [];
  for (const it of po.items) {
    const accepted = await getAcceptedByPOItem(poId, it.id);
    const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
    const orderedBase = await convertToBase(num(it.ordered_qty), it.unit_id, baseUnit.id);
    const acceptedBase = await convertToBase(accepted, it.unit_id, baseUnit.id);
    const remaining = Math.max(0, orderedBase - acceptedBase);
    if (remaining > 0) {
      items.push({
        raw_material_id: it.raw_material_id,
        material_code: it.material_code,
        material_name: it.material_name,
        ordered_qty: it.ordered_qty,
        ordered_base: orderedBase,
        remaining_qty: remaining,
        unit_id: it.unit_id,
        unit_name: it.unit_name,
        base_unit_id: baseUnit.id,
        base_unit_name: baseUnit.unit_name,
        rate: it.rate,
        batch_required: it.batch_required,
        expiry_required: it.expiry_required,
        purchase_order_item_id: it.id,
      });
    }
  }
  return { po, items };
};

export const updatePOStatusAfterGRN = async (conn, poId) => {
  if (!poId) return;
  const po = (await conn.execute('SELECT status FROM purchase_orders WHERE id = ?', [poId]))[0][0];
  if (!po) return;
  const [rows] = await conn.execute(`
    SELECT poi.ordered_qty, poi.unit_id, poi.raw_material_id,
      COALESCE((SELECT SUM(gri.accepted_qty) FROM grn g JOIN grn_items gri ON gri.grn_id = g.id WHERE g.purchase_order_id = ? AND gri.raw_material_id = poi.raw_material_id AND g.status = 'Posted'), 0) as accepted
    FROM purchase_order_items poi
    WHERE poi.purchase_order_id = ?
  `, [poId, poId]);
  let allReceived = true;
  let anyReceived = false;
  for (const r of rows) {
    const baseOrdered = await convertToBase(num(r.ordered_qty), r.unit_id, (await getMaterialBaseUnit(r.raw_material_id)).id);
    const baseAccepted = await convertToBase(num(r.accepted), r.unit_id, (await getMaterialBaseUnit(r.raw_material_id)).id);
    if (baseAccepted > 0) anyReceived = true;
    if (baseAccepted < baseOrdered) allReceived = false;
  }
  const newStatus = !anyReceived ? 'Sent' : allReceived ? 'Received' : 'Partially Received';
  if (po.status !== 'Closed' && po.status !== newStatus) {
    await conn.execute(`UPDATE purchase_orders SET status = ? WHERE id = ?`, [newStatus, poId]);
  }
};
