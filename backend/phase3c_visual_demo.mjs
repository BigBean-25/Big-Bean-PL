import { query } from './src/config/database.js';
import { getProductionRequestById, createProductionRequest, updateProductionRequestStatus, createProductionPlan, createProductionBatch, postProductionBatch } from './src/services/productionService.js';
import { createProductionDispatch, postProductionDispatch, receiveProductionDispatch, exportProductionDispatchExcel } from './src/services/productionDispatchService.js';
import { createProductionWastage, submitProductionWastage, verifyProductionWastage, approveProductionWastage, postProductionWastage } from './src/services/productionWastageService.js';
import { getProductionVariance } from './src/services/productionVarianceService.js';

const userId = 1;
const kitchenId = 28;
let materialId = null;
let recipeId = null;
let batchId = null;
let planId = null;
let requestId = null;
let wastageId = null;
let dispatchId = null;
let unitId = null;
let outletLocationId = null;
const results = [];

function assert(label, condition) {
  results.push({ label, pass: condition });
  console.log(`${condition ? '✅' : '❌'} ${label}`);
  if (!condition) throw new Error(`ASSERT FAIL: ${label}`);
}

async function preCleanup() {
  console.log('=== Pre-cleanup of old VISUAL-CK test data ===');
  const [m] = await query('SELECT id FROM raw_materials WHERE material_code = "VISUAL-CK-E2E-001"');
  if (!m) return;
  const mid = m.id;
  await query('DELETE FROM stock_ledger WHERE raw_material_id = ?', [mid]);
  const oldBatches = await query('SELECT id FROM production_batches WHERE batch_no LIKE "VISUAL-CK-BATCH-%"');
  for (const b of oldBatches) {
    await query('DELETE FROM production_batch_outputs WHERE production_batch_id = ?', [b.id]);
    await query('DELETE FROM production_batch_materials WHERE production_batch_id = ?', [b.id]);
    await query('DELETE FROM production_batches WHERE id = ?', [b.id]);
  }
  const oldPlans = await query('SELECT id FROM production_plans WHERE plan_no LIKE "VISUAL-CK-PLAN-%"');
  for (const p of oldPlans) {
    await query('DELETE FROM production_plan_items WHERE production_plan_id = ?', [p.id]);
    await query('DELETE FROM production_plans WHERE id = ?', [p.id]);
  }
  const oldReqs = await query('SELECT id FROM production_requests WHERE request_no LIKE "VISUAL-CK-REQ-%"');
  for (const r of oldReqs) {
    const oldDispatches = await query('SELECT id FROM stock_transfers WHERE production_request_id = ?', [r.id]);
    for (const d of oldDispatches) {
      await query('DELETE FROM stock_transfer_items WHERE transfer_id = ?', [d.id]);
      await query('DELETE FROM stock_transfers WHERE id = ?', [d.id]);
    }
    await query('DELETE FROM production_request_items WHERE production_request_id = ?', [r.id]);
    await query('DELETE FROM production_requests WHERE id = ?', [r.id]);
  }
  const oldWaste = await query('SELECT id FROM production_wastage WHERE wastage_no LIKE "VISUAL-CK-WASTE-%"');
  for (const w of oldWaste) {
    await query('DELETE FROM production_wastage_items WHERE production_wastage_id = ?', [w.id]);
    await query('DELETE FROM production_wastage WHERE id = ?', [w.id]);
  }
  console.log('Pre-cleanup complete');
}

async function main() {
  try {
    await preCleanup();
    const before = {
      supplier_payments: (await query('SELECT COUNT(*) as c FROM supplier_payments'))[0].c,
      daily_cashbooks: (await query('SELECT COUNT(*) as c FROM daily_cashbooks'))[0].c,
      bank_deposits: (await query('SELECT COUNT(*) as c FROM bank_deposits'))[0].c,
      pnl: (await query('SELECT COUNT(*) as c FROM monthly_pnl_snapshots'))[0].c,
    };

    const [u] = await query('SELECT id FROM units ORDER BY id LIMIT 1');
    unitId = u.id;
    const today = new Date().toISOString().split('T')[0];

    const [existing] = await query('SELECT id FROM raw_materials WHERE material_code = "VISUAL-CK-E2E-001"');
    if (existing) materialId = existing.id;
    else {
      const res = await query('INSERT INTO raw_materials (material_code, material_name, unit_id, is_batch_tracked, is_expiry_tracked, is_active) VALUES (?, ?, ?, 1, 1, 1)', ['VISUAL-CK-E2E-001', 'Visual Test Butter Croissant', unitId]);
      materialId = res.insertId;
    }
    assert('Visual product created', materialId > 0);

    const [r] = await query('SELECT id FROM recipes WHERE recipe_name = "VISUAL-CK-RECIPE-001"');
    if (r) recipeId = r.id;
    else {
      const recipeRes = await query(
        `INSERT INTO recipes (recipe_name, recipe_code, recipe_category, recipe_type, output_raw_material_id, yield_qty, yield_unit_id, status, effective_from, created_by)
         VALUES (?, ?, 'Finished Good', 'Production', ?, 1, ?, 'Active', CURDATE(), ?)`,
        ['VISUAL-CK-RECIPE-001', 'VISUAL-CK-RECIPE-001', materialId, unitId, userId]
      );
      recipeId = recipeRes.insertId;
    }

    const batch = await createProductionBatch({
      batch_no: `VISUAL-CK-BATCH-001-${Date.now()}`,
      central_kitchen_id: kitchenId,
      finished_product_id: materialId,
      recipe_id: recipeId,
      planned_qty: 20,
      actual_qty: 20,
      gross_output_qty: 20,
      rejected_output_qty: 0,
      accepted_output_qty: 20,
      unit_id: unitId,
      mfg_date: today,
      expiry_date: '2026-12-31',
      batch_no_output: 'VISUAL-CK-BATCH-001',
    }, userId);
    batchId = batch.id;
    await postProductionBatch(batchId, userId);
    const ckStock = (await query('SELECT SUM(qty_in) - SUM(qty_out) as q FROM stock_ledger WHERE location_id = ? AND raw_material_id = ?', [kitchenId, materialId]))[0].q;
    assert('Central Kitchen finished stock = 20', Number(ckStock) === 20);

    const [rr] = await query('SELECT id FROM outlets WHERE outlet_name LIKE "%RR Nagar%" LIMIT 1');
    if (!rr) throw new Error('RR Nagar outlet not found');
    const outletId = rr.id;
    let outletLoc = await query('SELECT id FROM locations WHERE outlet_id = ? LIMIT 1', [outletId]);
    if (!outletLoc.length) {
      const lr = await query('INSERT INTO locations (location_code, location_name, location_type, outlet_id, is_inventory_location, is_active) VALUES (?, ?, ?, ?, 1, 1)', ['LOC-VISUAL-RR', 'RR Nagar Visual', 'Outlet', outletId]);
      outletLoc = [{ id: lr.insertId }];
    }
    outletLocationId = outletLoc[0].id;

    const req = await createProductionRequest({
      request_no: `VISUAL-CK-REQ-001-${Date.now()}`,
      request_date: today,
      required_date: today,
      from_outlet_id: outletId,
      to_central_kitchen_id: kitchenId,
      priority: 'Normal',
      remarks: 'Visual demo',
      items: [{ raw_material_id: materialId, requested_qty: 10, unit_id: unitId, remarks: '' }],
    }, userId);
    requestId = req.id;
    const appr = await updateProductionRequestStatus(requestId, 'Approved', userId);
    assert('Request approved', appr.status === 'Approved');
    await query('UPDATE production_request_items SET planned_qty = 10 WHERE production_request_id = ?', [requestId]);

    const plan = await createProductionPlan({
      plan_no: `VISUAL-CK-PLAN-001-${Date.now()}`,
      plan_date: today,
      central_kitchen_id: kitchenId,
      production_item_id: materialId,
      demand_qty: 10,
      existing_finished_stock: 20,
      planned_production_qty: 0,
      unit_id: unitId,
      recipe_id: recipeId,
      priority: 'Normal',
      remarks: 'Visual demo',
      items: [{ production_request_id: requestId, production_request_item_id: (await getProductionRequestById(requestId)).items[0].id, demand_qty: 10, planned_qty: 0, remarks: '' }],
    }, userId);
    planId = plan.id;
    assert('Planning record visible', Number(plan.demand_qty) === 10);

    const wastage = await createProductionWastage({
      wastage_no: `VISUAL-CK-WASTE-001-${Date.now()}`,
      wastage_date: today,
      central_kitchen_id: kitchenId,
      production_batch_id: batchId,
      wastage_type: 'Finished Good',
      remarks: 'Visual E2E Test Damage',
      items: [{ raw_material_id: materialId, wastage_scope: 'Finished Good', qty: 1, unit_id: unitId, base_qty: 1, batch_no: batch.batch_no_output, reason: 'Visual E2E Test Damage' }],
    }, userId);
    wastageId = wastage.id;
    await submitProductionWastage(wastageId, userId);
    await verifyProductionWastage(wastageId, userId);
    await approveProductionWastage(wastageId, userId);
    await postProductionWastage(wastageId, userId);
    const wastageRow = (await query('SELECT * FROM production_wastage WHERE id = ?', [wastageId]))[0];
    assert('Wastage posted', wastageRow.status === 'Posted');

    const variance = await getProductionVariance({ central_kitchen_id: kitchenId });
    assert('Variance data exists', Array.isArray(variance) && variance.length > 0);

    const reqItem = (await getProductionRequestById(requestId)).items[0];
    const d = await createProductionDispatch({
      transfer_no: `VISUAL-CK-DISP-001-${Date.now()}`,
      production_request_id: requestId,
      from_location_id: kitchenId,
      to_location_id: outletLocationId,
      dispatch_date: today,
      items: [{ production_request_item_id: reqItem.id, raw_material_id: materialId, dispatched_qty: 8, unit_id: unitId }],
    }, userId);
    dispatchId = d.id;
    await postProductionDispatch(dispatchId, userId);
    const stItem = (await query('SELECT id FROM stock_transfer_items WHERE transfer_id = ?', [dispatchId]))[0];
    await receiveProductionDispatch(dispatchId, { received_at: today, items: [{ id: stItem.id, received_qty: 7, short_qty: 1, damaged_qty: 0 }] }, userId);
    const reqAfter = await getProductionRequestById(requestId);
    assert('Request received = 7', Number(reqAfter.received_qty) === 7);
    assert('Request short = 1', Number(reqAfter.short_qty) === 1);
    assert('Request pending = 3', Number(reqAfter.items[0].planned_qty - reqAfter.received_qty) === 3);
    assert('Request Partially Fulfilled', reqAfter.status === 'Partially Fulfilled');

    const buffer = await exportProductionDispatchExcel({ from_location_id: kitchenId });
    assert('Excel export non-empty', Buffer.byteLength(buffer) > 0);

    const dashboard = (await (await import('./src/services/productionService.js')).getProductionDashboard(kitchenId));
    assert('Dashboard finished stock value >= 0', Number(dashboard.finished_stock_value) >= 0);

    const after = {
      supplier_payments: (await query('SELECT COUNT(*) as c FROM supplier_payments'))[0].c,
      daily_cashbooks: (await query('SELECT COUNT(*) as c FROM daily_cashbooks'))[0].c,
      bank_deposits: (await query('SELECT COUNT(*) as c FROM bank_deposits'))[0].c,
      pnl: (await query('SELECT COUNT(*) as c FROM monthly_pnl_snapshots'))[0].c,
    };
    assert('No supplier_payments change', before.supplier_payments === after.supplier_payments);
    assert('No daily_cashbooks change', before.daily_cashbooks === after.daily_cashbooks);
    assert('No bank_deposits change', before.bank_deposits === after.bank_deposits);
    assert('No PnL change', before.pnl === after.pnl);

    console.log('\n=== Visual Demo Summary ===');
    const passed = results.filter((r) => r.pass).length;
    console.log(`${passed}/${results.length} passed`);
    console.log('VISUAL TEST DATA READY FOR BROWSER CHECK');
    console.log(`\nCreated IDs — Product: ${materialId}, Recipe: ${recipeId}, Batch: ${batchId}, Plan: ${planId}, Request: ${requestId}, Wastage: ${wastageId}, Dispatch: ${dispatchId}`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
