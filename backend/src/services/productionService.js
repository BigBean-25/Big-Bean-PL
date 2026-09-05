import { query, getConnection } from '../config/database.js';
import { getMaterialBaseUnit, convertToBase } from '../utils/uomUtils.js';
import { getCurrentStock } from './warehouseService.js';
import { allocateFEFO, getAvailableBatches } from './warehouseBatchService.js';

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));

export async function getCentralKitchenLocations() {
  return query("SELECT * FROM locations WHERE location_type = 'Central Kitchen' AND is_active = 1 ORDER BY location_name");
}

export async function getFinishedGoodsStock(centralKitchenId) {
  return getCurrentStock(centralKitchenId, { materialRole: 'Finished Good' });
}

export async function getProductionDashboard(centralKitchenId) {
  const pendingRequests = await query('SELECT COUNT(*) as c FROM production_requests WHERE to_central_kitchen_id = ? AND status IN (\'Submitted\',\'Reviewed\',\'Approved\',\'Partially Planned\')', [centralKitchenId]);
  const plannedToday = await query('SELECT COUNT(*) as c FROM production_plans WHERE central_kitchen_id = ? AND plan_date = CURDATE()', [centralKitchenId]);
  const inProduction = await query('SELECT COUNT(*) as c FROM production_batches WHERE central_kitchen_id = ? AND status = \'In Production\'', [centralKitchenId]);
  const completedToday = await query('SELECT COUNT(*) as c FROM production_batches WHERE central_kitchen_id = ? AND status = \'Posted\' AND DATE(posted_at) = CURDATE()', [centralKitchenId]);
  const rawStock = await getCurrentStock(centralKitchenId, { materialRole: 'Raw Material' });
  const finishedStock = await getCurrentStock(centralKitchenId, { materialRole: 'Finished Good' });
  const rawShortages = rawStock.filter((r) => r.status === 'Out of Stock' || r.status === 'Low Stock');
  const finishedStockValue = finishedStock.reduce((s, r) => s + num(r.total_value), 0);

  return {
    central_kitchen_id: Number(centralKitchenId),
    pending_requests: pendingRequests[0]?.c || 0,
    planned_today: plannedToday[0]?.c || 0,
    in_production: inProduction[0]?.c || 0,
    completed_today: completedToday[0]?.c || 0,
    raw_material_shortages: rawShortages.length,
    finished_stock_value: finishedStockValue,
  };
}

export async function getProductionRequests(centralKitchenId) {
  return query(`
    SELECT pr.*, o.outlet_name, l.location_name as central_kitchen_name, ol.id as from_outlet_location_id
    FROM production_requests pr
    LEFT JOIN outlets o ON o.id = pr.from_outlet_id
    LEFT JOIN locations l ON l.id = pr.to_central_kitchen_id
    LEFT JOIN locations ol ON ol.outlet_id = o.id
    WHERE pr.to_central_kitchen_id = ?
    ORDER BY pr.created_at DESC`, [centralKitchenId]);
}

export async function getProductionRequestById(id) {
  const [req] = await query(`
    SELECT pr.*, o.outlet_name, l.location_name as central_kitchen_name, ol.id as from_outlet_location_id
    FROM production_requests pr
    LEFT JOIN outlets o ON o.id = pr.from_outlet_id
    LEFT JOIN locations l ON l.id = pr.to_central_kitchen_id
    LEFT JOIN locations ol ON ol.outlet_id = o.id
    WHERE pr.id = ?`, [id]);
  if (!req) return null;
  const items = await query(`
    SELECT pri.*, rm.material_name, rm.material_code, u.unit_name
    FROM production_request_items pri
    LEFT JOIN raw_materials rm ON rm.id = pri.raw_material_id
    LEFT JOIN units u ON u.id = pri.unit_id
    WHERE pri.production_request_id = ?`, [id]);
  return { ...req, items };
}

export async function createProductionRequest(data, userId) {
  const { request_no, request_date, required_date, from_outlet_id, to_central_kitchen_id, priority, remarks, items } = data;
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [req] = await conn.execute(
      `INSERT INTO production_requests (request_no, request_date, required_date, from_outlet_id, to_central_kitchen_id, priority, remarks, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`,
      [request_no, request_date, required_date, from_outlet_id, to_central_kitchen_id, priority, remarks, userId]
    );
    const requestId = req.insertId;
    for (const item of items || []) {
      await conn.execute(
        `INSERT INTO production_request_items (production_request_id, raw_material_id, requested_qty, unit_id, priority, remarks)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [requestId, item.raw_material_id, item.requested_qty, item.unit_id, item.priority || priority, item.remarks]
      );
    }
    await conn.commit();
    return getProductionRequestById(requestId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function updateProductionRequestStatus(id, status, userId, reasons = {}) {
  const setFields = ['status = ?'];
  const values = [status];
  if (status === 'Reviewed') { setFields.push('reviewed_by = ?'); values.push(userId); }
  if (status === 'Approved') { setFields.push('approved_by = ?'); values.push(userId); }
  values.push(id);
  await query(`UPDATE production_requests SET ${setFields.join(', ')} WHERE id = ?`, values);

  // Approving a request is what authorizes dispatch against it, and the dispatch
  // flow reads planned_qty (not requested_qty) as "how much was approved". Without
  // this, every item's planned_qty stays at its schema default of 0 and no dispatch
  // can ever be created against an approved request. Item-level quantity overrides
  // can be passed via reasons.items; otherwise this approves the full requested qty.
  if (status === 'Approved') {
    const overrides = Object.fromEntries((reasons.items || []).map((it) => [Number(it.id), it.planned_qty]));
    const items = await query('SELECT id, requested_qty, planned_qty FROM production_request_items WHERE production_request_id = ?', [id]);
    for (const it of items) {
      const planned = overrides[it.id] !== undefined ? Number(overrides[it.id]) : Number(it.requested_qty);
      if (Number(it.planned_qty) !== planned) {
        await query('UPDATE production_request_items SET planned_qty = ? WHERE id = ?', [planned, it.id]);
      }
    }
  }

  return getProductionRequestById(id);
}

export async function getProductionPlans(centralKitchenId) {
  return query(`
    SELECT pp.*, rm.material_name, rm.material_code, u.unit_name, r.recipe_name
    FROM production_plans pp
    LEFT JOIN raw_materials rm ON rm.id = pp.production_item_id
    LEFT JOIN units u ON u.id = pp.unit_id
    LEFT JOIN recipes r ON r.id = pp.recipe_id
    WHERE pp.central_kitchen_id = ?
    ORDER BY pp.created_at DESC`, [centralKitchenId]);
}

export async function getProductionPlanById(id) {
  const [plan] = await query('SELECT * FROM production_plans WHERE id = ?', [id]);
  const items = await query('SELECT * FROM production_plan_items WHERE production_plan_id = ?', [id]);
  return { ...plan, items };
}

export async function updateProductionPlanStatus(id, status, userId) {
  // The UI only ever offers Approve/Reject on a Draft plan (PlanningTab.jsx)
  // - this had no validation at all: any status string was accepted, from
  // any current status, by the plan's own creator. Enforcing the same
  // maker-checker + status-transition rules every other approval workflow
  // in this codebase already has (production requests, wastage, GRN, etc.).
  if (!['Approved', 'Rejected'].includes(status)) {
    throw new Error('Invalid status. Only Approved or Rejected are allowed.');
  }
  const [plan] = await query('SELECT status, created_by FROM production_plans WHERE id = ?', [id]);
  if (!plan) throw new Error('Production plan not found');
  if (plan.status !== 'Draft') {
    throw new Error(`Cannot ${status.toLowerCase()} a plan with status "${plan.status}". Only Draft plans can be approved or rejected.`);
  }
  if (Number(plan.created_by) === Number(userId)) {
    throw new Error('You cannot approve or reject your own production plan');
  }

  const setFields = ['status = ?'];
  const values = [status];
  if (status === 'Approved') { setFields.push('approved_by = ?'); values.push(userId); }
  values.push(id);
  await query(`UPDATE production_plans SET ${setFields.join(', ')} WHERE id = ?`, values);
  return getProductionPlanById(id);
}

export async function createProductionPlan(data, userId) {
  const { plan_no, plan_date, central_kitchen_id, production_item_id, demand_qty, existing_finished_stock, planned_production_qty, unit_id, recipe_id, priority, remarks, items } = data;
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [plan] = await conn.execute(
      `INSERT INTO production_plans (plan_no, plan_date, central_kitchen_id, production_item_id, demand_qty, existing_finished_stock, planned_production_qty, unit_id, recipe_id, priority, remarks, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`,
      [plan_no, plan_date, central_kitchen_id, production_item_id, demand_qty, existing_finished_stock, planned_production_qty, unit_id, recipe_id, priority, remarks, userId]
    );
    const planId = plan.insertId;
    for (const it of items || []) {
      await conn.execute(
        `INSERT INTO production_plan_items (production_plan_id, production_request_id, production_request_item_id, demand_qty, planned_qty, remarks)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [planId, it.production_request_id, it.production_request_item_id, it.demand_qty, it.planned_qty, it.remarks]
      );
    }
    await conn.commit();
    return getProductionPlanById(planId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getProductionBatches(centralKitchenId) {
  return query(`
    SELECT pb.*, rm.material_name, rm.material_code, u.unit_name, r.recipe_name
    FROM production_batches pb
    LEFT JOIN raw_materials rm ON rm.id = pb.finished_product_id
    LEFT JOIN units u ON u.id = pb.unit_id
    LEFT JOIN recipes r ON r.id = pb.recipe_id
    WHERE pb.central_kitchen_id = ?
    ORDER BY pb.created_at DESC`, [centralKitchenId]);
}

export async function getProductionBatchById(id) {
  const [batch] = await query('SELECT * FROM production_batches WHERE id = ?', [id]);
  if (!batch) return null;
  const materials = await query(`
    SELECT pbm.*, rm.material_name, rm.material_code, uu.unit_name as required_unit_name, ua.unit_name as actual_unit_name
    FROM production_batch_materials pbm
    LEFT JOIN raw_materials rm ON rm.id = pbm.raw_material_id
    LEFT JOIN units uu ON uu.id = pbm.required_unit_id
    LEFT JOIN units ua ON ua.id = pbm.actual_unit_id
    WHERE pbm.production_batch_id = ?`, [id]);
  const outputs = await query(`
    SELECT pbo.*, rm.material_name, rm.material_code, u.unit_name
    FROM production_batch_outputs pbo
    LEFT JOIN raw_materials rm ON rm.id = pbo.finished_product_id
    LEFT JOIN units u ON u.id = pbo.unit_id
    WHERE pbo.production_batch_id = ?`, [id]);
  return { ...batch, materials, outputs };
}

export async function createProductionBatch(data, userId) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const actual = data.actual_qty || data.planned_qty;
    const gross = data.gross_output_qty || actual;
    const rejected = data.rejected_output_qty || 0;
    const accepted = data.accepted_output_qty || (gross - rejected);
    const [batch] = await conn.execute(
      `INSERT INTO production_batches (batch_no, plan_id, central_kitchen_id, finished_product_id, recipe_id, planned_qty, actual_qty, gross_output_qty, rejected_output_qty, accepted_output_qty, unit_id, batch_no_output, mfg_date, expiry_date, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`,
      [data.batch_no, data.plan_id || null, data.central_kitchen_id, data.finished_product_id, data.recipe_id, data.planned_qty, actual, gross, rejected, accepted, data.unit_id, data.batch_no_output || null, data.mfg_date, data.expiry_date, userId]
    );
    const batchId = batch.insertId;

    // derive raw material requirements from recipe_items
    if (data.recipe_id) {
      const recipeItems = await conn.execute(`
        SELECT ri.*, rm.unit_id as material_base_unit_id, rm.is_batch_tracked, rm.is_expiry_tracked, r.yield_qty as recipe_yield_qty
        FROM recipe_items ri
        JOIN raw_materials rm ON rm.id = ri.raw_material_id
        JOIN recipes r ON r.id = ri.recipe_id
        WHERE ri.recipe_id = ?
        ORDER BY ri.display_order`, [data.recipe_id]);
      for (const it of recipeItems[0]) {
        const baseQty = num(it.base_qty) * num(data.planned_qty) / num(it.recipe_yield_qty || 1);
        await conn.execute(
          `INSERT INTO production_batch_materials (production_batch_id, raw_material_id, recipe_item_id, required_qty, required_unit_id)
           VALUES (?, ?, ?, ?, ?)`,
          [batchId, it.raw_material_id, it.id, baseQty, it.base_unit_id]
        );
      }
    }

    await conn.execute(
      `INSERT INTO production_batch_outputs (production_batch_id, finished_product_id, actual_qty, gross_output_qty, rejected_output_qty, accepted_output_qty, unit_id, mfg_date, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchId, data.finished_product_id, actual, gross, rejected, accepted, data.unit_id, data.mfg_date, data.expiry_date]
    );

    await conn.commit();
    return getProductionBatchById(batchId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function setProductionBatchMaterials(id, materials) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    // Even more destructive than updateProductionBatchActualQty above if
    // called post-posting: postProductionBatch stamps stock_ledger_reference_id/
    // unit_cost/total_cost onto each row here once it posts, and this DELETEs
    // every row for the batch outright and re-inserts fresh ones with none of
    // that - severing the batch's material lines from the stock_ledger entries
    // that already moved real stock for them.
    const [[existingBatch]] = await conn.execute('SELECT is_posted FROM production_batches WHERE id = ?', [id]);
    if (!existingBatch) { await conn.rollback(); throw new Error('Production batch not found'); }
    if (existingBatch.is_posted) { await conn.rollback(); throw new Error('Cannot edit materials on an already-posted production batch'); }
    await conn.execute('DELETE FROM production_batch_materials WHERE production_batch_id = ?', [id]);
    for (const m of materials || []) {
      await conn.execute(
        `INSERT INTO production_batch_materials (production_batch_id, raw_material_id, required_qty, required_unit_id, actual_issued_qty, actual_unit_id, batch_no, expiry_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, m.raw_material_id, m.required_qty, m.required_unit_id, m.actual_issued_qty, m.actual_unit_id, m.batch_no, m.expiry_date]
      );
    }
    await conn.commit();
    return getProductionBatchById(id);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function updateProductionBatchActualQty(id, data) {
  // postProductionBatch bakes actual_qty/accepted_output_qty into the
  // stock_ledger entries it creates (qty_in, unit_cost = totalMaterialCost /
  // actualOutputBaseQty) - editing these fields after posting would silently
  // desynchronize the batch record from what was actually posted, with no
  // warning and no way to tell the two apart later.
  const [existing] = await query('SELECT is_posted FROM production_batches WHERE id = ?', [id]);
  if (!existing) throw new Error('Production batch not found');
  if (existing.is_posted) throw new Error('Cannot edit quantities on an already-posted production batch');

  const { actual_qty, gross_output_qty, rejected_output_qty, accepted_output_qty } = data || {};
  const fields = [];
  const values = [];
  if (actual_qty !== undefined) { fields.push('actual_qty = ?'); values.push(actual_qty); }
  if (gross_output_qty !== undefined) { fields.push('gross_output_qty = ?'); values.push(gross_output_qty); }
  if (rejected_output_qty !== undefined) { fields.push('rejected_output_qty = ?'); values.push(rejected_output_qty); }
  if (accepted_output_qty !== undefined) { fields.push('accepted_output_qty = ?'); values.push(accepted_output_qty); }
  if (fields.length) {
    await query(`UPDATE production_batches SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    await query(`UPDATE production_batch_outputs SET ${fields.join(', ')} WHERE production_batch_id = ?`, [...values, id]);
  }
  return getProductionBatchById(id);
}

export async function getRawMaterialAvailability(batchId) {
  const batch = await getProductionBatchById(batchId);
  const current = await getCurrentStock(batch.central_kitchen_id, { materialRole: 'Raw Material' });
  return batch.materials.map((m) => {
    const stock = current.find((s) => Number(s.raw_material_id) === Number(m.raw_material_id));
    const available = num(stock?.current_qty);
    return { ...m, available_qty: available };
  });
}

export async function postProductionBatch(id, userId) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [[batch]] = await conn.execute('SELECT * FROM production_batches WHERE id = ? FOR UPDATE', [id]);
    if (!batch) throw new Error('Production batch not found');
    if (batch.is_posted) throw new Error('Production batch already posted');
    if (batch.status !== 'Completed' && batch.status !== 'In Production' && batch.status !== 'Draft') {
      throw new Error('Production batch cannot be posted in current status');
    }

    const [materials] = await conn.execute('SELECT * FROM production_batch_materials WHERE production_batch_id = ?', [id]);
    const [[output]] = await conn.execute('SELECT * FROM production_batch_outputs WHERE production_batch_id = ?', [id]);

    const today = new Date().toISOString().split('T')[0];
    let totalMaterialCost = 0;

    for (const m of materials) {
      const baseUnit = await getMaterialBaseUnit(m.raw_material_id);
      const baseQty = await convertToBase(num(m.actual_issued_qty), m.actual_unit_id, baseUnit.id);
      if (!baseQty && num(m.actual_issued_qty) > 0) throw new Error(`UOM conversion failed for material ${m.raw_material_id}`);

      const current = await getCurrentStock(batch.central_kitchen_id, { materialRole: 'Raw Material' });
      const matStock = current.find((s) => Number(s.raw_material_id) === Number(m.raw_material_id));
      if (!matStock) {
        throw new Error(`No stock record for material ${m.raw_material_id}`);
      }
      const unitCost = num(matStock.average_cost);

      const [matInfo] = await conn.execute('SELECT is_batch_tracked, is_expiry_tracked FROM raw_materials WHERE id = ?', [m.raw_material_id]);
      const isBatchTracked = matInfo[0]?.is_batch_tracked;

      if (isBatchTracked) {
        // Availability must be checked against the same non-expired-batch view that
        // allocateFEFO() uses below, otherwise this check can pass and FEFO can still
        // fail (or vice versa) when expired batches sit in the ledger.
        const availableBatches = await getAvailableBatches(batch.central_kitchen_id, m.raw_material_id, { excludeExpired: true });
        const availableQty = availableBatches.reduce((s, b) => s + num(b.available_qty), 0);
        if (availableQty < baseQty) {
          throw new Error(`Insufficient non-expired stock for material ${m.raw_material_id}: required ${baseQty}, available ${availableQty}`);
        }
      } else if (num(matStock.current_qty) < baseQty) {
        throw new Error(`Insufficient stock for material ${m.raw_material_id}: required ${baseQty}, available ${matStock.current_qty}`);
      }

      let materialTotal = 0;
      let firstLedgerId = null;

      if (isBatchTracked) {
        const allocs = await allocateFEFO(batch.central_kitchen_id, m.raw_material_id, baseQty);
        for (const alloc of allocs) {
          const valueOut = num(alloc.allocated_qty) * unitCost;
          materialTotal += valueOut;
          const [ledger] = await conn.execute(
            `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, qty_out, unit_id, unit_cost, value_out, batch_no, expiry_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [batch.central_kitchen_id, m.raw_material_id, today, 'PRODUCTION_ISSUE', 'PRODUCTION_BATCH', id, num(alloc.allocated_qty), baseUnit.id, unitCost, valueOut, alloc.batch_no, alloc.expiry_date, userId]
          );
          if (firstLedgerId === null) firstLedgerId = ledger.insertId;
        }
      } else {
        const valueOut = baseQty * unitCost;
        materialTotal += valueOut;
        const [ledger] = await conn.execute(
          `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, qty_out, unit_id, unit_cost, value_out, batch_no, expiry_date, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [batch.central_kitchen_id, m.raw_material_id, today, 'PRODUCTION_ISSUE', 'PRODUCTION_BATCH', id, baseQty, baseUnit.id, unitCost, valueOut, m.batch_no || null, m.expiry_date || null, userId]
        );
        firstLedgerId = ledger.insertId;
      }

      totalMaterialCost += materialTotal;
      await conn.execute('UPDATE production_batch_materials SET stock_ledger_reference_type = ?, stock_ledger_reference_id = ?, unit_cost = ?, total_cost = ? WHERE id = ?', ['STOCK_LEDGER', firstLedgerId, unitCost, materialTotal, m.id]);
    }

    const outputBaseUnit = output.finished_product_id ? await getMaterialBaseUnit(output.finished_product_id) : { id: output.unit_id };
    const acceptedQty = num(output.accepted_output_qty) > 0 ? num(output.accepted_output_qty) : num(output.actual_qty);
    const actualOutputBaseQty = await convertToBase(acceptedQty, output.unit_id, outputBaseUnit.id);
    const unitCost = actualOutputBaseQty > 0 ? totalMaterialCost / actualOutputBaseQty : 0;

    const [ledger] = await conn.execute(
      `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, qty_in, unit_id, unit_cost, value_in, batch_no, expiry_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batch.central_kitchen_id, output.finished_product_id, today, 'PRODUCTION_RECEIPT', 'PRODUCTION_BATCH', id, actualOutputBaseQty, outputBaseUnit.id, unitCost, totalMaterialCost, batch.batch_no_output || null, batch.expiry_date || null, userId]
    );
    await conn.execute('UPDATE production_batch_outputs SET stock_ledger_reference_id = ?, unit_cost = ?, total_cost = ?, actual_qty = ?, gross_output_qty = ?, rejected_output_qty = ?, accepted_output_qty = ? WHERE id = ?',
      [ledger.insertId, unitCost, totalMaterialCost, output.actual_qty, output.gross_output_qty, output.rejected_output_qty, output.accepted_output_qty, output.id]);

    await conn.execute(
      'UPDATE production_batches SET status = ?, is_posted = 1, posted_at = NOW(), completed_by = ? WHERE id = ?',
      ['Posted', userId, id]
    );

    await conn.commit();
    return getProductionBatchById(id);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
