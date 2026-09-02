import dotenv from 'dotenv';
dotenv.config();
import { query, default as pool } from './src/config/database.js';
import { createLocation, postOpening, getCurrentStock, getAllowedLocations } from './src/services/warehouseService.js';
import {
  createRequisition, submitRequisition, approveRequisition,
  dispatchRequisition, receiveTransfer
} from './src/services/warehouseService.js';

const results = {};

async function main() {
  const superUser = await query('SELECT u.id, u.full_name, r.role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = 2');
  const superUserObj = { ...superUser[0], outlet_ids: [] };
  const whUserRes = await query("INSERT INTO users (full_name, email, password, role_id, is_active, created_at, updated_at) VALUES ('Test WH Admin 2B', 'test.wh2b@bigbean.local', 'x', 8, 1, NOW(), NOW())");
  const whUserId = whUserRes.insertId;
  const whUser = { id: whUserId, full_name: 'Test WH Admin 2B', role_name: 'Warehouse Admin', role_id: 8, outlet_ids: [] };
  const outletUser = { id: 4, full_name: 'Outlet Admin', role_name: 'Outlet Admin', role_id: 4, outlet_ids: [1] };

  const firstOutlet = await query('SELECT id FROM outlets WHERE is_active = 1 LIMIT 1');
  const outletId = firstOutlet[0].id;
  outletUser.outlet_ids = [outletId];

  const cw = await createLocation({ location_code: 'TEST_CW_001', location_name: 'Test Central Warehouse', location_type: 'Central Warehouse' }, superUserObj.id);
  const outletLoc = await createLocation({ location_code: 'TEST_OUTLET_001', location_name: 'Test Outlet', location_type: 'Outlet', outlet_id: outletId }, superUserObj.id);

  const coffee = await query('SELECT id, material_name, unit_id FROM raw_materials WHERE id = 407');
  const coffeeId = coffee[0].id;
  const kgId = 1;

  // Security checks
  const whAllowed = (await getAllowedLocations(whUser, 'all')).some((l) => l.id === cw.id);
  const outletAllowed = (await getAllowedLocations(outletUser, 'all')).some((l) => l.id === outletLoc.id);
  const outletNotCW = !(await getAllowedLocations(outletUser, 'all')).some((l) => l.id === cw.id);
  results.security = { whCanAccessCW: whAllowed, outletCanAccessOwn: outletAllowed, outletCannotAccessCW: outletNotCW };

  // Warehouse opening 100 KG @ 100/KG
  const open = await postOpening({ location_id: cw.id, raw_material_id: coffeeId, transaction_date: '2026-08-26', qty: 100, unit_id: kgId, unit_cost: 100 }, whUser.id);
  results.warehouseOpening = { qty: open.qty_in, value: open.value_in, base_unit_id: open.base_unit_id };

  // Requisition 60 KG from CW to outlet
  const req = await createRequisition({
    requisition_no: 'TEST_REQ_001',
    from_location_id: cw.id,
    to_location_id: outletLoc.id,
    request_date: '2026-08-26',
    required_date: '2026-08-27',
    remarks: 'Phase 2B test',
    items: [{ raw_material_id: coffeeId, requested_qty: 60, unit_id: kgId, remarks: 'Test' }],
  }, whUser.id);
  results.requisitionCreate = req ? { id: req.id, status: req.status } : 'FAIL';

  const submitted = await submitRequisition(req.id, whUser.id);
  results.requisitionSubmit = submitted ? { status: submitted.status } : 'FAIL';

  const approved = await approveRequisition(req.id, {
    items: req.items.map((it) => ({ id: it.id, approved_qty: 50 })),
    remarks: 'Approve 50 KG'
  }, whUser.id);
  results.partialApproval = approved ? { status: approved.status, items: approved.items.map((i) => ({ requested: i.requested_qty, approved: i.approved_qty })) } : 'FAIL';

  let whStock = await getCurrentStock(cw.id);
  let whCoffee = whStock.find((s) => Number(s.raw_material_id) === Number(coffeeId));
  results.warehouseStockAfterApproval = whCoffee ? { qty: whCoffee.current_qty, unit: whCoffee.unit_name, value: whCoffee.total_value } : 'FAIL';

  const transfer = await dispatchRequisition(req.id, {
    transfer_no: 'TEST_TRF_001',
    dispatch_date: '2026-08-26',
    vehicle_no: 'TEST-01',
    driver_name: 'Test Driver',
    items: req.items.map((it) => ({ raw_material_id: it.raw_material_id, dispatched_qty: 40, unit_id: it.unit_id, batch_no: 'B1', expiry_date: '2026-12-31' })),
  }, whUser.id);
  results.dispatch = transfer ? { id: transfer.id, status: transfer.status, items: transfer.items.map((i) => ({ material: i.material_name, dispatched: i.dispatched_qty, unit: i.unit_name, unit_cost: i.unit_cost })) } : 'FAIL';

  whStock = await getCurrentStock(cw.id);
  whCoffee = whStock.find((s) => Number(s.raw_material_id) === Number(coffeeId));
  results.warehouseStockAfterDispatch = whCoffee ? { qty: whCoffee.current_qty, unit: whCoffee.unit_name, value: whCoffee.total_value } : 'FAIL';

  let outletStock = await getCurrentStock(outletLoc.id);
  let outletCoffee = outletStock.find((s) => Number(s.raw_material_id) === Number(coffeeId));
  results.outletStockBeforeReceipt = outletCoffee ? { qty: outletCoffee.current_qty } : { qty: 0 };

  const received = await receiveTransfer(transfer.id, {
    items: transfer.items.map((i) => ({ id: i.id, received_qty: 38, damaged_qty: 1, short_qty: 1, remarks: 'Received 38, damaged 1, short 1' })),
  }, whUser.id);
  results.receipt = received ? { status: received.status, items: received.items.map((i) => ({ material: i.material_name, dispatched: i.dispatched_qty, received: i.received_qty, damaged: i.damaged_qty, short: i.short_qty })) } : 'FAIL';

  whStock = await getCurrentStock(cw.id);
  whCoffee = whStock.find((s) => Number(s.raw_material_id) === Number(coffeeId));
  results.warehouseStockAfterReceipt = whCoffee ? { qty: whCoffee.current_qty, value: whCoffee.total_value } : 'FAIL';

  outletStock = await getCurrentStock(outletLoc.id);
  outletCoffee = outletStock.find((s) => Number(s.raw_material_id) === Number(coffeeId));
  results.outletStockAfterReceipt = outletCoffee ? { qty: outletCoffee.current_qty, unit: outletCoffee.unit_name, value: outletCoffee.total_value, avg: outletCoffee.average_cost } : 'FAIL';

  const ledgerRows = await query('SELECT transaction_type, COALESCE(SUM(qty_in),0) as qty, COALESCE(SUM(value_in),0) as val FROM stock_ledger WHERE reference_id = ? AND reference_item_id IN (SELECT id FROM stock_transfer_items WHERE transfer_id = ?) GROUP BY transaction_type', [transfer.id, transfer.id]);
  const transferIn = ledgerRows.find((r) => r.transaction_type === 'TRANSFER_IN') || { qty: 0, val: 0 };
  const damage = ledgerRows.find((r) => r.transaction_type === 'TRANSIT_DAMAGE') || { qty: 0, val: 0 };
  const short = ledgerRows.find((r) => r.transaction_type === 'TRANSIT_SHORT') || { qty: 0, val: 0 };
  const dispatchedBase = 40000;
  const dispatchedValue = 4000;
  const accountedQty = Number(transferIn.qty) + Number(damage.qty) + Number(short.qty);
  const accountedValue = Number(transferIn.val) + Number(damage.val) + Number(short.val);
  results.reconciliation = {
    dispatched: { qty: dispatchedBase, value: dispatchedValue },
    received: { qty: Number(transferIn.qty), value: Number(transferIn.val) },
    damaged: { qty: Number(damage.qty), value: Number(damage.val) },
    short: { qty: Number(short.qty), value: Number(short.val) },
    unaccounted: { qty: dispatchedBase - accountedQty, value: dispatchedValue - accountedValue }
  };

  // Idempotency: second dispatch should fail
  try {
    await dispatchRequisition(req.id, { transfer_no: 'TEST_TRF_002', dispatch_date: '2026-08-26', items: [] }, whUser.id);
    results.dispatchIdempotency = false;
  } catch (e) { results.dispatchIdempotency = true; }

  // Idempotency: second receive should not duplicate TRANSFER_IN
  try {
    await receiveTransfer(transfer.id, { items: transfer.items.map((i) => ({ id: i.id, received_qty: 0, damaged_qty: 0, short_qty: 0 })) }, whUser.id);
    results.receiveIdempotency = false;
  } catch (e) { results.receiveIdempotency = true; }

  // Negative stock protection: try to dispatch 200 KG from a new requisition
  const req2 = await createRequisition({ requisition_no: 'TEST_REQ_002', from_location_id: cw.id, to_location_id: outletLoc.id, request_date: '2026-08-26', items: [{ raw_material_id: coffeeId, requested_qty: 200, unit_id: kgId }] }, whUser.id);
  await submitRequisition(req2.id, whUser.id);
  try {
    await approveRequisition(req2.id, { items: req2.items.map((it) => ({ id: it.id, approved_qty: 200 })) }, whUser.id);
    results.negativeStockProtection = false;
  } catch (e) { results.negativeStockProtection = true; }

  // P&L / expense check
  const expense = await query('SELECT COUNT(*) as c FROM daily_cash_expenses');
  const supplierPayments = await query('SELECT COUNT(*) as c FROM supplier_payments');
  const purchase = await query('SELECT COUNT(*) as c FROM material_purchase_uploads');
  results.noPLImpact = { dailyCashExpenses: expense[0].c, supplierPayments: supplierPayments[0].c, materialPurchases: purchase[0].c };

  // Cleanup
  await query("DELETE FROM stock_ledger WHERE location_id IN (SELECT id FROM locations WHERE location_code LIKE 'TEST%')");
  await query("DELETE FROM stock_transfer_items WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE transfer_no LIKE 'TEST%')");
  await query("DELETE FROM stock_transfers WHERE transfer_no LIKE 'TEST%'");
  await query("DELETE FROM stock_requisition_items WHERE requisition_id IN (SELECT id FROM stock_requisitions WHERE requisition_no LIKE 'TEST%')");
  await query("DELETE FROM stock_requisitions WHERE requisition_no LIKE 'TEST%'");
  await query("DELETE FROM locations WHERE location_code LIKE 'TEST%'");
  await query("DELETE FROM users WHERE id = ?", [whUserId]);

  const remaining = await query(`
    SELECT
      (SELECT COUNT(*) FROM locations WHERE location_code LIKE 'TEST%') as locs,
      (SELECT COUNT(*) FROM stock_requisitions WHERE requisition_no LIKE 'TEST%') as reqs,
      (SELECT COUNT(*) FROM stock_transfers WHERE transfer_no LIKE 'TEST%') as trfs,
      (SELECT COUNT(*) FROM stock_ledger WHERE location_id IN (SELECT id FROM locations WHERE location_code LIKE 'TEST%')) as ledger
  `);
  results.remaining = remaining[0];

  console.log(JSON.stringify(results, null, 2));
  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error('ERROR', e); await pool.end(); process.exit(1); });
