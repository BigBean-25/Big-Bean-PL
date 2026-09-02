import { query, getConnection } from '../config/database.js';
import { getMaterialBaseUnit, convertToBase } from '../utils/uomUtils.js';
import { getCurrentStock } from './warehouseService.js';
import { allocateFEFO } from './warehouseBatchService.js';

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));

export async function getProductionDispatches(filters = {}) {
  const { from_location_id, to_location_id, production_request_id, status, from_date, to_date } = filters;
  let sql = `SELECT st.*, fl.location_name as from_location, tl.location_name as to_location,
      pr.request_no as production_request_no, o.outlet_name, pr.required_date
    FROM stock_transfers st
    LEFT JOIN locations fl ON fl.id = st.from_location_id
    LEFT JOIN locations tl ON tl.id = st.to_location_id
    LEFT JOIN production_requests pr ON pr.id = st.production_request_id
    LEFT JOIN outlets o ON o.id = pr.from_outlet_id
    WHERE st.production_request_id IS NOT NULL`;
  const params = [];
  if (from_location_id) { sql += ' AND st.from_location_id = ?'; params.push(from_location_id); }
  if (to_location_id) { sql += ' AND st.to_location_id = ?'; params.push(to_location_id); }
  if (production_request_id) { sql += ' AND st.production_request_id = ?'; params.push(production_request_id); }
  if (status) { sql += ' AND st.status = ?'; params.push(status); }
  if (from_date && to_date) { sql += ' AND st.dispatch_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' ORDER BY st.created_at DESC';
  return query(sql, params);
}

export async function getProductionDispatchKPIs(filters = {}) {
  const { from_location_id, to_location_id, from_date, to_date } = filters;
  let sql = `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN st.status = 'Draft' THEN 1 ELSE 0 END) as ready_for_dispatch,
      SUM(CASE WHEN st.status = 'In Transit' THEN 1 ELSE 0 END) as in_transit,
      SUM(CASE WHEN st.status = 'Partially Received' THEN 1 ELSE 0 END) as partially_received,
      SUM(CASE WHEN st.status = 'Received' AND DATE(st.received_at) = CURDATE() THEN 1 ELSE 0 END) as completed_today
    FROM stock_transfers st
    WHERE st.production_request_id IS NOT NULL`;
  const params = [];
  if (from_location_id) { sql += ' AND st.from_location_id = ?'; params.push(from_location_id); }
  if (to_location_id) { sql += ' AND st.to_location_id = ?'; params.push(to_location_id); }
  if (from_date && to_date) { sql += ' AND st.dispatch_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  const [res] = await query(sql, params);

  let pendingSql = `SELECT COUNT(DISTINCT pr.id) as c
    FROM production_requests pr
    JOIN production_request_items pri ON pri.production_request_id = pr.id
    WHERE pr.status IN ('Approved','Partially Fulfilled','In Transit')`;
  const pendingParams = [];
  if (from_location_id) { pendingSql += ' AND pr.to_central_kitchen_id = ?'; pendingParams.push(from_location_id); }
  if (to_location_id) { pendingSql += ' AND pr.from_outlet_id = (SELECT o.id FROM locations l JOIN outlets o ON o.id = l.outlet_id WHERE l.id = ? LIMIT 1)'; pendingParams.push(to_location_id); }
  const [pending] = await query(pendingSql, pendingParams);

  return {
    total: Number(res?.total || 0),
    ready_for_dispatch: Number(res?.ready_for_dispatch || 0),
    in_transit: Number(res?.in_transit || 0),
    partially_received: Number(res?.partially_received || 0),
    completed_today: Number(res?.completed_today || 0),
    pending_fulfilment: Number(pending?.c || 0),
  };
}

// Bakehouse "sale" price to outlets vs. its own production cost. Mirrors
// getWarehouseProfitReport's approach: profit is computed against what was
// actually dispatched in the period (sale_value - cost), not against a
// separate production-cost figure for the period, since the two aren't the
// same units of finished goods.
export async function getProductionProfitReport(filters) {
  const { from_location_id, from_date, to_date } = filters;
  if (!from_date || !to_date) throw new Error('from_date and to_date are required');

  let sql = `SELECT rm.id as raw_material_id, rm.material_name, rm.material_code,
      SUM(sti.dispatched_qty) as total_qty,
      SUM(sti.dispatched_qty * sti.unit_cost) as total_cost,
      SUM(sti.sale_value) as total_sale_value,
      SUM(CASE WHEN sti.sale_value IS NULL THEN sti.dispatched_qty ELSE 0 END) as unpriced_qty
    FROM stock_transfer_items sti
    INNER JOIN stock_transfers st ON st.id = sti.transfer_id
    LEFT JOIN raw_materials rm ON rm.id = sti.raw_material_id
    WHERE st.production_request_id IS NOT NULL AND st.dispatch_date BETWEEN ? AND ?`;
  const params = [from_date, to_date];
  if (from_location_id) { sql += ' AND st.from_location_id = ?'; params.push(from_location_id); }
  sql += ' GROUP BY rm.id, rm.material_name, rm.material_code ORDER BY rm.material_name';
  const byMaterial = await query(sql, params);

  const totals = byMaterial.reduce((acc, r) => {
    acc.totalCost += num(r.total_cost);
    acc.totalSaleValue += num(r.total_sale_value);
    acc.unpricedQty += num(r.unpriced_qty);
    return acc;
  }, { totalCost: 0, totalSaleValue: 0, unpricedQty: 0 });

  return {
    from_date,
    to_date,
    total_dispatch_cost: totals.totalCost,
    total_dispatch_sale_value: totals.totalSaleValue,
    gross_profit: totals.totalSaleValue - totals.totalCost,
    unpriced_dispatch_qty: totals.unpricedQty,
    by_material: byMaterial.map((r) => ({
      raw_material_id: r.raw_material_id,
      material_name: r.material_name,
      material_code: r.material_code,
      qty: num(r.total_qty),
      cost_value: num(r.total_cost),
      sale_value: num(r.total_sale_value),
      profit: num(r.total_sale_value) - num(r.total_cost),
      unpriced_qty: num(r.unpriced_qty),
    })),
  };
}

export async function getProductionDispatchById(id) {
  const [transfer] = await query(`SELECT st.*, fl.location_name as from_location, tl.location_name as to_location,
      fl.address as from_location_address, fl.city as from_location_city, fl.state as from_location_state, fl.pincode as from_location_pincode, fl.gstin as from_location_gstin,
      tl.address as to_location_address, tl.city as to_location_city, tl.state as to_location_state, tl.pincode as to_location_pincode, tl.gstin as to_location_gstin,
      pr.request_no as production_request_no, o.outlet_name, pr.required_date,
      u1.full_name as dispatched_by_name, u2.full_name as received_by_name
    FROM stock_transfers st
    LEFT JOIN locations fl ON fl.id = st.from_location_id
    LEFT JOIN locations tl ON tl.id = st.to_location_id
    LEFT JOIN production_requests pr ON pr.id = st.production_request_id
    LEFT JOIN outlets o ON o.id = pr.from_outlet_id
    LEFT JOIN users u1 ON u1.id = st.dispatched_by
    LEFT JOIN users u2 ON u2.id = st.received_by
    WHERE st.id = ?`, [id]);
  if (!transfer) return null;
  const items = await query(`SELECT sti.*, rm.material_name, rm.material_code, rm.hsn_code, rm.gst_rate, u.unit_name,
      pri.requested_qty, pri.planned_qty, pri.received_qty as request_item_received
    FROM stock_transfer_items sti
    LEFT JOIN raw_materials rm ON rm.id = sti.raw_material_id
    LEFT JOIN units u ON u.id = sti.unit_id
    LEFT JOIN production_request_items pri ON pri.id = sti.production_request_item_id
    WHERE sti.transfer_id = ?`, [id]);
  return { ...transfer, items };
}

export async function getPendingRequestItems(requestId) {
  const req = await query(`SELECT pr.*, o.outlet_name, l.location_name as central_kitchen_name
    FROM production_requests pr
    LEFT JOIN outlets o ON o.id = pr.from_outlet_id
    LEFT JOIN locations l ON l.id = pr.to_central_kitchen_id
    WHERE pr.id = ?`, [requestId]);
  if (!req.length) throw new Error('Request not found');
  const items = await query(`SELECT pri.*, rm.material_name, rm.material_code, rm.is_batch_tracked, rm.is_expiry_tracked, u.unit_name,
      l.location_type as kitchen_location_type
    FROM production_request_items pri
    LEFT JOIN raw_materials rm ON rm.id = pri.raw_material_id
    LEFT JOIN units u ON u.id = pri.unit_id
    LEFT JOIN production_requests pr ON pr.id = pri.production_request_id
    LEFT JOIN locations l ON l.id = pr.to_central_kitchen_id
    WHERE pri.production_request_id = ?`, [requestId]);

  const kitchenId = req[0].to_central_kitchen_id;
  const stock = await getCurrentStock(kitchenId, { materialRole: 'Finished Good' });

  const result = [];
  for (const it of items) {
    const approved = num(it.planned_qty) || num(it.requested_qty);
    const already = num(it.dispatched_qty);
    const pending = Math.max(0, approved - already);
    const matStock = stock.find((s) => Number(s.raw_material_id) === Number(it.raw_material_id));
    const available = num(matStock?.current_qty) - num(it.allocated_qty);
    result.push({
      ...it,
      approved_qty: approved,
      dispatched_so_far: already,
      pending_qty: pending,
      available_finished_stock: Math.max(0, available),
      unit_cost: num(matStock?.average_cost) || 0,
    });
  }
  return result;
}

export async function createProductionDispatch(data, userId) {
  const { transfer_no, production_request_id, from_location_id, to_location_id, dispatch_date, vehicle_no, driver_name, dispatch_reference, remarks, items } = data;

  const [req] = await query(`SELECT * FROM production_requests WHERE id = ?`, [production_request_id]);
  if (!req) throw new Error('Production request not found');
  if (!['Approved', 'Partially Fulfilled'].includes(req.status)) {
    throw new Error('Request must be Approved to create a dispatch');
  }

  const [fromLoc] = await query(`SELECT * FROM locations WHERE id = ?`, [from_location_id]);
  if (!fromLoc || fromLoc.location_type !== 'Central Kitchen') throw new Error('Source must be a Central Kitchen');
  const [toLoc] = await query(`SELECT * FROM locations WHERE id = ?`, [to_location_id]);
  if (!toLoc || toLoc.location_type !== 'Outlet') throw new Error('Destination must be an Outlet');

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute('SELECT id FROM stock_transfers WHERE transfer_no = ?', [transfer_no]);
    if (existing.length > 0) { await conn.rollback(); throw new Error('Transfer number already exists'); }

    const [res] = await conn.execute(
      `INSERT INTO stock_transfers (transfer_no, production_request_id, from_location_id, to_location_id, dispatch_date, status, vehicle_no, driver_name, dispatch_reference, remarks, dispatched_by)
       VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?)`,
      [transfer_no, production_request_id, from_location_id, to_location_id, dispatch_date, vehicle_no || null, driver_name || null, dispatch_reference || null, remarks || null, userId]
    );
    const transferId = res.insertId;

    for (const it of items) {
      const [reqItem] = await conn.execute('SELECT * FROM production_request_items WHERE id = ?', [it.production_request_item_id]);
      if (!reqItem.length) { await conn.rollback(); throw new Error('Invalid production request item'); }
      await conn.execute(
        `INSERT INTO stock_transfer_items (transfer_id, production_request_id, production_request_item_id, raw_material_id, approved_qty, dispatched_qty, unit_id, unit_cost, batch_no, expiry_date, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [transferId, production_request_id, it.production_request_item_id, it.raw_material_id, num(reqItem[0].planned_qty), it.dispatched_qty, it.unit_id, 0, it.batch_no || null, it.expiry_date || null, it.remarks || null]
      );
      // Reserve this qty against the request item so other pending (Draft) dispatches
      // being prepared concurrently don't double-count the same finished stock.
      // recalculateRequestFulfilment() recomputes this from scratch once the dispatch
      // is posted or received, so the reservation is released automatically then.
      await conn.execute(
        'UPDATE production_request_items SET allocated_qty = allocated_qty + ? WHERE id = ?',
        [num(it.dispatched_qty), it.production_request_item_id]
      );
    }
    await conn.commit();
    return getProductionDispatchById(transferId);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function postProductionDispatch(id, userId) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [transfer] = await conn.execute('SELECT * FROM stock_transfers WHERE id = ? FOR UPDATE', [id]);
    if (!transfer.length) { await conn.rollback(); throw new Error('Dispatch not found'); }
    if (transfer[0].status !== 'Draft') { await conn.rollback(); throw new Error('Dispatch already posted'); }

    const items = await conn.execute('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [id]);
    const stock = await getCurrentStock(transfer[0].from_location_id, { materialRole: 'Finished Good' });

    for (const it of items[0]) {
      const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
      const baseQty = await convertToBase(num(it.dispatched_qty), it.unit_id, baseUnit.id);
      const [reqItemRow] = await conn.execute('SELECT received_qty FROM production_request_items WHERE id = ?', [it.production_request_item_id]);
      const pendingForDispatch = Math.max(0, num(it.approved_qty) - num(reqItemRow[0]?.received_qty));
      if (num(it.dispatched_qty) > pendingForDispatch) { await conn.rollback(); throw new Error('Dispatch qty exceeds pending request quantity'); }
      const matStock = stock.find((s) => Number(s.raw_material_id) === Number(it.raw_material_id));
      const unitCost = matStock ? (num(matStock.total_value) / num(matStock.current_qty)) : 0;
      const available = num(matStock?.current_qty);
      if (num(baseQty) > available) { await conn.rollback(); throw new Error(`Insufficient finished stock for ${it.raw_material_id}`); }

      const matRows = await query('SELECT is_batch_tracked, transfer_price FROM raw_materials WHERE id = ?', [it.raw_material_id]);
      const isBatchTracked = num(matRows[0]?.is_batch_tracked) === 1;
      const transferPrice = matRows[0]?.transfer_price !== null && matRows[0]?.transfer_price !== undefined ? num(matRows[0].transfer_price) : null;

      if (isBatchTracked) {
        const allocations = await allocateFEFO(transfer[0].from_location_id, it.raw_material_id, num(baseQty));
        for (const alloc of allocations) {
          const valueOut = num(alloc.allocated_qty) * unitCost;
          const saleValue = transferPrice !== null ? num(alloc.allocated_qty) * transferPrice : null;
          const [ledger] = await conn.execute(
            `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
             VALUES (?, ?, ?, 'TRANSFER_OUT', 'TRANSFER', ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?)`,
            [transfer[0].from_location_id, it.raw_material_id, transfer[0].dispatch_date, id, it.id, alloc.allocated_qty, baseUnit.id, unitCost, valueOut, alloc.batch_no || null, alloc.expiry_date || null, userId]
          );
          await conn.execute('UPDATE stock_transfer_items SET unit_cost = ?, transfer_price = ?, sale_value = ?, batch_no = ?, expiry_date = ? WHERE id = ?', [unitCost, transferPrice, saleValue, alloc.batch_no || null, alloc.expiry_date || null, it.id]);
        }
      } else {
        const valueOut = num(baseQty) * unitCost;
        const saleValue = transferPrice !== null ? num(baseQty) * transferPrice : null;
        const [ledger] = await conn.execute(
          `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
           VALUES (?, ?, ?, 'TRANSFER_OUT', 'TRANSFER', ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [transfer[0].from_location_id, it.raw_material_id, transfer[0].dispatch_date, id, it.id, baseQty, baseUnit.id, unitCost, valueOut, it.batch_no || null, it.expiry_date || null, userId]
        );
        await conn.execute('UPDATE stock_transfer_items SET unit_cost = ?, transfer_price = ?, sale_value = ? WHERE id = ?', [unitCost, transferPrice, saleValue, it.id]);
      }
    }

    await conn.execute("UPDATE stock_transfers SET status = 'In Transit' WHERE id = ?", [id]);
    await recalculateRequestFulfilment(transfer[0].production_request_id, conn);
    await conn.commit();
    return getProductionDispatchById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function receiveProductionDispatch(id, data, userId) {
  const { received_at, items } = data;
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [transfer] = await conn.execute('SELECT * FROM stock_transfers WHERE id = ? FOR UPDATE', [id]);
    if (!transfer.length) { await conn.rollback(); throw new Error('Dispatch not found'); }
    if (transfer[0].status !== 'In Transit') { await conn.rollback(); throw new Error('Dispatch not in transit'); }

    for (const it of items) {
      const [ti] = await conn.execute('SELECT * FROM stock_transfer_items WHERE id = ? AND transfer_id = ?', [it.id, id]);
      if (!ti.length) { await conn.rollback(); throw new Error('Invalid transfer item'); }
      const received = num(it.received_qty);
      const short = num(it.short_qty);
      const damaged = num(it.damaged_qty);
      const total = received + short + damaged;
      if (total > num(ti[0].dispatched_qty)) { await conn.rollback(); throw new Error('Received + short + damaged cannot exceed dispatched qty'); }

      const baseUnit = await getMaterialBaseUnit(ti[0].raw_material_id);
      const receivedBase = await convertToBase(received, ti[0].unit_id, baseUnit.id);
      const valueIn = receivedBase * num(ti[0].unit_cost);
      await conn.execute(
        `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
         VALUES (?, ?, ?, 'TRANSFER_IN', 'TRANSFER', ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
        [transfer[0].to_location_id, ti[0].raw_material_id, received_at || new Date().toISOString().split('T')[0], id, ti[0].id, receivedBase, baseUnit.id, ti[0].unit_cost, valueIn, ti[0].batch_no || null, ti[0].expiry_date || null, userId]
      );
      await conn.execute(
        `UPDATE stock_transfer_items SET received_qty = ?, short_qty = ?, damaged_qty = ? WHERE id = ?`,
        [received, short, damaged, it.id]
      );
    }

    const allItems = await conn.execute('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [id]);
    const totalReceived = allItems[0].reduce((s, x) => s + num(x.received_qty), 0);
    const totalDispatched = allItems[0].reduce((s, x) => s + num(x.dispatched_qty), 0);
    const newStatus = totalReceived >= totalDispatched ? 'Received' : 'Partially Received';
    await conn.execute("UPDATE stock_transfers SET status = ?, received_at = NOW(), received_by = ? WHERE id = ?", [newStatus, userId, id]);
    await recalculateRequestFulfilment(transfer[0].production_request_id, conn);
    await conn.commit();
    return getProductionDispatchById(id);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

async function recalculateRequestFulfilment(requestId, conn) {
  const items = await conn.execute('SELECT * FROM production_request_items WHERE production_request_id = ?', [requestId]);
  let totalApproved = 0;
  let totalAllocated = 0;
  let totalReceived = 0;
  let totalDispatched = 0;
  let totalShort = 0;
  let totalDamaged = 0;

  for (const it of items[0]) {
    const approved = num(it.planned_qty) || num(it.requested_qty);
    totalApproved += approved;

    const transfers = await conn.execute(`SELECT SUM(dispatched_qty) as d, SUM(received_qty) as r, SUM(short_qty) as s, SUM(damaged_qty) as dm
      FROM stock_transfer_items WHERE production_request_item_id = ? AND transfer_id IN (SELECT id FROM stock_transfers WHERE status IN ('In Transit','Partially Received','Received'))`, [it.id]);
    const d = num(transfers[0][0]?.d);
    const r = num(transfers[0][0]?.r);
    const s = num(transfers[0][0]?.s);
    const dm = num(transfers[0][0]?.dm);

    // Still-Draft dispatches remain a live reservation; anything In Transit/Received
    // is already committed (reflected in dispatched_qty above), not just reserved.
    const allocRows = await conn.execute(`SELECT COALESCE(SUM(dispatched_qty), 0) as a
      FROM stock_transfer_items WHERE production_request_item_id = ? AND transfer_id IN (SELECT id FROM stock_transfers WHERE status = 'Draft')`, [it.id]);
    const allocated = num(allocRows[0][0]?.a);

    totalReceived += r;
    totalDispatched += d;
    totalShort += s;
    totalDamaged += dm;
    totalAllocated += allocated;

    await conn.execute(
      `UPDATE production_request_items SET allocated_qty = ?, dispatched_qty = ?, received_qty = ?, short_qty = ?, damaged_qty = ? WHERE id = ?`,
      [allocated, d, r, s, dm, it.id]
    );
  }

  let status = 'Approved';
  if (totalReceived > 0 && totalReceived < totalApproved) status = 'Partially Fulfilled';
  else if (totalReceived >= totalApproved) status = 'Fulfilled';
  else if (totalDispatched > 0) status = 'In Transit';

  await conn.execute(
    `UPDATE production_requests SET allocated_qty = ?, dispatched_qty = ?, received_qty = ?, short_qty = ?, damaged_qty = ?, status = ? WHERE id = ?`,
    [totalAllocated, totalDispatched, totalReceived, totalShort, totalDamaged, status, requestId]
  );
}

export async function exportProductionDispatchExcel(filters) {
  const ExcelJS = (await import('exceljs')).default;
  const rows = await getProductionDispatches(filters);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Dispatches');
  sheet.columns = [
    { header: 'Dispatch No', key: 'transfer_no' },
    { header: 'Date', key: 'dispatch_date' },
    { header: 'From', key: 'from_location' },
    { header: 'To', key: 'to_location' },
    { header: 'Request No', key: 'production_request_no' },
    { header: 'Status', key: 'status' },
    { header: 'Vehicle', key: 'vehicle_no' },
    { header: 'Driver', key: 'driver_name' },
  ];
  for (const r of rows) sheet.addRow(r);
  return workbook.xlsx.writeBuffer();
}
