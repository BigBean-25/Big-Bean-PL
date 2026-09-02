import ExcelJS from 'exceljs';
import { query, getConnection } from '../config/database.js';
import { getMaterialBaseUnit, convertToBase } from '../utils/uomUtils.js';
import { getCurrentStock } from './warehouseService.js';
import { allocateFEFO } from './warehouseBatchService.js';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

export async function getProductionWastages(filters = {}) {
  const { central_kitchen_id, production_batch_id, status, from_date, to_date, search } = filters;
  let sql = `SELECT pw.*, ck.location_name as central_kitchen, pb.batch_no as production_batch_no, u.full_name as created_by_name
    FROM production_wastage pw
    LEFT JOIN locations ck ON ck.id = pw.central_kitchen_id
    LEFT JOIN production_batches pb ON pb.id = pw.production_batch_id
    LEFT JOIN users u ON u.id = pw.created_by
    WHERE 1=1`;
  const params = [];
  if (central_kitchen_id) { sql += ' AND pw.central_kitchen_id = ?'; params.push(central_kitchen_id); }
  if (production_batch_id) { sql += ' AND pw.production_batch_id = ?'; params.push(production_batch_id); }
  if (status) { sql += ' AND pw.status = ?'; params.push(status); }
  if (from_date && to_date) { sql += ' AND pw.wastage_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  if (search) { sql += ' AND (pw.wastage_no LIKE ? OR pw.wastage_type LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY pw.created_at DESC';
  return query(sql, params);
}

export async function getProductionWastageById(id) {
  const [rows] = await query('SELECT pw.*, ck.location_name as central_kitchen, pb.batch_no as production_batch_no FROM production_wastage pw LEFT JOIN locations ck ON ck.id = pw.central_kitchen_id LEFT JOIN production_batches pb ON pb.id = pw.production_batch_id WHERE pw.id = ?', [id]);
  if (!rows) return null;
  const items = await query(`SELECT pwi.*, rm.material_name, rm.material_code, u.unit_name, u.unit_symbol, bu.unit_name as base_unit_name
    FROM production_wastage_items pwi
    LEFT JOIN raw_materials rm ON rm.id = pwi.raw_material_id
    LEFT JOIN units u ON u.id = pwi.unit_id
    LEFT JOIN units bu ON bu.id = pwi.base_unit_id
    WHERE pwi.production_wastage_id = ?`, [id]);
  return { ...rows, items };
}

export async function createProductionWastage(data, userId) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const existing = await conn.execute('SELECT id FROM production_wastage WHERE wastage_no = ? LIMIT 1', [data.wastage_no]);
    if (existing[0].length > 0) { await conn.rollback(); throw new Error('Wastage number already exists'); }
    const [res] = await conn.execute(
      `INSERT INTO production_wastage (wastage_no, production_batch_id, central_kitchen_id, wastage_date, wastage_type, reason, remarks, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`,
      [data.wastage_no, data.production_batch_id || null, data.central_kitchen_id, data.wastage_date, data.wastage_type || null, data.reason || null, data.remarks || null, userId]
    );
    const wastageId = res.insertId;
    if (data.items?.length) {
      for (const it of data.items) {
        if (num(it.qty) <= 0) { await conn.rollback(); throw new Error('Wastage quantity must be greater than zero'); }
        const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
        const baseQty = await convertToBase(num(it.qty), it.unit_id, baseUnit.id);
        await conn.execute(
          `INSERT INTO production_wastage_items (production_wastage_id, raw_material_id, wastage_scope, qty, unit_id, base_qty, base_unit_id, batch_no, expiry_date, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [wastageId, it.raw_material_id, it.wastage_scope, num(it.qty), it.unit_id, baseQty, baseUnit.id, it.batch_no || null, it.expiry_date || null, it.remarks || null]
        );
      }
    }
    await conn.commit();
    return getProductionWastageById(wastageId);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function updateProductionWastage(id, data, userId) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [w] = await conn.execute('SELECT status FROM production_wastage WHERE id = ?', [id]);
    if (!w.length || w[0].status !== 'Draft') { await conn.rollback(); throw new Error('Only Draft wastage can be edited'); }
    await conn.execute(
      `UPDATE production_wastage SET wastage_date = ?, wastage_type = ?, reason = ?, remarks = ? WHERE id = ?`,
      [data.wastage_date, data.wastage_type || null, data.reason || null, data.remarks || null, id]
    );
    if (data.items) {
      await conn.execute('DELETE FROM production_wastage_items WHERE production_wastage_id = ?', [id]);
      for (const it of data.items) {
        if (num(it.qty) <= 0) { await conn.rollback(); throw new Error('Wastage quantity must be greater than zero'); }
        const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
        const baseQty = await convertToBase(num(it.qty), it.unit_id, baseUnit.id);
        await conn.execute(
          `INSERT INTO production_wastage_items (production_wastage_id, raw_material_id, wastage_scope, qty, unit_id, base_qty, base_unit_id, batch_no, expiry_date, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, it.raw_material_id, it.wastage_scope, num(it.qty), it.unit_id, baseQty, baseUnit.id, it.batch_no || null, it.expiry_date || null, it.remarks || null]
        );
      }
    }
    await conn.commit();
    return getProductionWastageById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

async function transitionStatus(id, userId, fromStatuses, toStatus, field) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [w] = await conn.execute('SELECT status FROM production_wastage WHERE id = ? FOR UPDATE', [id]);
    if (!w.length || !fromStatuses.includes(w[0].status)) { await conn.rollback(); throw new Error(`Wastage cannot be ${toStatus.toLowerCase()} in current status`); }
    await conn.execute(`UPDATE production_wastage SET status = ?, ${field} = ?, ${field.replace('_by', '_at')} = NOW() WHERE id = ?`, [toStatus, userId, id]);
    await conn.commit();
    return getProductionWastageById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function submitProductionWastage(id, userId) { return transitionStatus(id, userId, ['Draft'], 'Submitted', 'submitted_by'); }
export async function verifyProductionWastage(id, userId) { return transitionStatus(id, userId, ['Submitted'], 'Verified', 'verified_by'); }
export async function approveProductionWastage(id, userId) { return transitionStatus(id, userId, ['Verified'], 'Approved', 'approved_by'); }
export async function rejectProductionWastage(id, userId) { return transitionStatus(id, userId, ['Draft', 'Submitted', 'Verified'], 'Rejected', 'rejected_by'); }

export async function postProductionWastage(id, userId) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [w] = await conn.execute('SELECT * FROM production_wastage WHERE id = ? FOR UPDATE', [id]);
    if (!w.length) { await conn.rollback(); throw new Error('Wastage not found'); }
    if (w[0].status === 'Posted') { await conn.rollback(); throw new Error('Wastage already posted'); }
    if (w[0].status !== 'Approved') { await conn.rollback(); throw new Error('Wastage cannot be posted in current status'); }

    const locationId = w[0].central_kitchen_id;
    const today = new Date().toISOString().split('T')[0];
    const items = await conn.execute('SELECT * FROM production_wastage_items WHERE production_wastage_id = ?', [id]);
    let totalQty = 0;
    let totalValue = 0;

    for (const it of items[0]) {
      if (it.ledger_posted) continue;

      const current = await getCurrentStock(locationId);
      const matStock = current.find((s) => Number(s.raw_material_id) === Number(it.raw_material_id));
      const unitCost = num(matStock?.average_cost);
      const value = num(it.base_qty) * unitCost;
      totalQty += num(it.base_qty);
      totalValue += value;

      if (it.wastage_scope === 'PROCESS_LOSS') {
        // Inherent process loss (trimming, evaporation, etc.) isn't a separate stock
        // movement - it's already reflected in the batch's own planned-vs-output gap -
        // so no ledger entry here, but it still needs a cost so it isn't silently
        // excluded from the wastage total.
        await conn.execute(
          `UPDATE production_wastage_items SET unit_cost = ?, value = ?, ledger_posted = 1 WHERE id = ?`,
          [unitCost, value, it.id]
        );
        continue;
      }

      if (it.wastage_scope === 'RAW_MATERIAL') {
        const matRows = await query('SELECT is_batch_tracked FROM raw_materials WHERE id = ?', [it.raw_material_id]);
        const isBatchTracked = matRows[0]?.is_batch_tracked;
        if (isBatchTracked) {
          const allocs = await allocateFEFO(locationId, it.raw_material_id, num(it.base_qty), { manual: it.batch_no ? [{ batch_no: it.batch_no, expiry_date: it.expiry_date, qty: num(it.base_qty) }] : null });
          for (const alloc of allocs) {
            await conn.execute(
              `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
               VALUES (?, ?, ?, 'PRODUCTION_WASTAGE', 'PRODUCTION_WASTAGE', ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?)`,
              [locationId, it.raw_material_id, today, id, it.id, num(alloc.allocated_qty), it.base_unit_id, unitCost, value, alloc.batch_no, alloc.expiry_date, userId]
            );
          }
        } else {
          await conn.execute(
            `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
             VALUES (?, ?, ?, 'PRODUCTION_WASTAGE', 'PRODUCTION_WASTAGE', ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?)`,
            [locationId, it.raw_material_id, today, id, it.id, num(it.base_qty), it.base_unit_id, unitCost, value, it.batch_no, it.expiry_date, userId]
          );
        }
      } else if (it.wastage_scope === 'FINISHED_GOOD') {
        const available = num(matStock?.current_qty);
        if (num(it.base_qty) > available) { await conn.rollback(); throw new Error(`Insufficient finished stock for material ${it.raw_material_id}`); }
        await conn.execute(
          `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
           VALUES (?, ?, ?, 'PRODUCTION_WASTAGE', 'PRODUCTION_WASTAGE', ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [locationId, it.raw_material_id, today, id, it.id, num(it.base_qty), it.base_unit_id, unitCost, value, it.batch_no, it.expiry_date, userId]
        );
      }

      await conn.execute(
        `UPDATE production_wastage_items SET unit_cost = ?, value = ?, ledger_posted = 1 WHERE id = ?`,
        [unitCost, value, it.id]
      );
    }

    await conn.execute(
      `UPDATE production_wastage SET status = 'Posted', is_posted = 1, posted_at = NOW(), posted_by = ?, total_qty = ?, total_value = ? WHERE id = ?`,
      [userId, totalQty, totalValue, id]
    );
    await conn.commit();
    return getProductionWastageById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function lockProductionWastage(id, userId) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [w] = await conn.execute('SELECT status FROM production_wastage WHERE id = ?', [id]);
    if (!w.length || w[0].status !== 'Posted') { await conn.rollback(); throw new Error('Only Posted wastage can be locked'); }
    await conn.execute(`UPDATE production_wastage SET status = 'Locked', locked_by = ?, locked_at = NOW() WHERE id = ?`, [userId, id]);
    await conn.commit();
    return getProductionWastageById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function exportProductionWastageExcel(filters) {
  const rows = await query(`SELECT pw.*, pb.batch_no as production_batch_no, ck.location_name as central_kitchen,
      pwi.raw_material_id, rm.material_name, pwi.wastage_scope, pwi.qty, u.unit_name, u.unit_symbol,
      pwi.base_qty, bu.unit_name as base_unit_name, pwi.unit_cost, pwi.value, pwi.batch_no as item_batch_no, pwi.expiry_date, pwi.remarks
    FROM production_wastage pw
    LEFT JOIN locations ck ON ck.id = pw.central_kitchen_id
    LEFT JOIN production_batches pb ON pb.id = pw.production_batch_id
    LEFT JOIN production_wastage_items pwi ON pwi.production_wastage_id = pw.id
    LEFT JOIN raw_materials rm ON rm.id = pwi.raw_material_id
    LEFT JOIN units u ON u.id = pwi.unit_id
    LEFT JOIN units bu ON bu.id = pwi.base_unit_id
    WHERE (? IS NULL OR pw.central_kitchen_id = ?)
      AND (? IS NULL OR pw.production_batch_id = ?)
      AND (? IS NULL OR pw.status = ?)
      AND (? IS NULL OR pw.wastage_date >= ?)
      AND (? IS NULL OR pw.wastage_date <= ?)
    ORDER BY pw.created_at DESC`,
    [filters.central_kitchen_id || null, filters.central_kitchen_id || null,
     filters.production_batch_id || null, filters.production_batch_id || null,
     filters.status || null, filters.status || null,
     filters.from_date || null, filters.from_date || null,
     filters.to_date || null, filters.to_date || null]
  );
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Wastage');
  sheet.columns = [
    { header: 'Wastage No', key: 'wastage_no' },
    { header: 'Wastage Date', key: 'wastage_date' },
    { header: 'Central Kitchen', key: 'central_kitchen' },
    { header: 'Production Batch', key: 'production_batch_no' },
    { header: 'Wastage Type', key: 'wastage_type' },
    { header: 'Reason', key: 'reason' },
    { header: 'Status', key: 'status' },
    { header: 'Material', key: 'material_name' },
    { header: 'Scope', key: 'wastage_scope' },
    { header: 'Qty', key: 'qty' },
    { header: 'Unit', key: 'unit_symbol' },
    { header: 'Base Qty', key: 'base_qty' },
    { header: 'Base Unit', key: 'base_unit_name' },
    { header: 'Unit Cost', key: 'unit_cost' },
    { header: 'Value', key: 'value' },
    { header: 'Batch No', key: 'item_batch_no' },
    { header: 'Expiry', key: 'expiry_date' },
  ];
  for (const r of rows) sheet.addRow(r);
  return workbook.xlsx.writeBuffer();
}
