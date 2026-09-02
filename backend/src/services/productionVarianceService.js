import ExcelJS from 'exceljs';
import { query } from '../config/database.js';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

const HIGH_VARIANCE_THRESHOLD = 0.05; // 5%
const LOW_YIELD_THRESHOLD = 0.90; // 90%

export async function getProductionVariance(filters = {}) {
  const { central_kitchen_id, from_date, to_date, finished_product_id, batch, status } = filters;
  let sql = `SELECT pb.*, rm.material_name as finished_product, rm.material_code as finished_product_code, r.recipe_name, r.yield_qty, r.yield_unit_id, l.location_name as central_kitchen,
      u.unit_name as output_unit_name, pb.gross_output_qty, pb.rejected_output_qty, pb.accepted_output_qty
    FROM production_batches pb
    LEFT JOIN raw_materials rm ON rm.id = pb.finished_product_id
    LEFT JOIN recipes r ON r.id = pb.recipe_id
    LEFT JOIN locations l ON l.id = pb.central_kitchen_id
    LEFT JOIN units u ON u.id = pb.unit_id
    WHERE pb.is_posted = 1`;
  const params = [];
  if (central_kitchen_id) { sql += ' AND pb.central_kitchen_id = ?'; params.push(central_kitchen_id); }
  if (finished_product_id) { sql += ' AND pb.finished_product_id = ?'; params.push(finished_product_id); }
  if (from_date && to_date) { sql += ' AND pb.mfg_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  if (batch) { sql += ' AND (pb.batch_no LIKE ?)'; params.push(`%${batch}%`); }
  sql += ' ORDER BY pb.mfg_date DESC, pb.created_at DESC';
  const rows = await query(sql, params);
  const result = [];
  for (const r of rows) {
    const summary = await computeBatchVariance(r.id);
    let flag = 'Normal';
    if (num(summary.yield_pct_accepted) < LOW_YIELD_THRESHOLD * 100) flag = 'High Variance';
    else if (num(summary.max_variance_pct) > HIGH_VARIANCE_THRESHOLD * 100) flag = 'High Variance';
    if (status && status !== flag) continue;
    result.push({ ...r, variance_summary: summary, variance_status: flag });
  }
  return result;
}

export async function getProductionVarianceByBatch(batchId) {
  const [batch] = await query(`SELECT pb.*, rm.material_name, r.recipe_name, r.yield_qty, r.yield_unit_id, l.location_name
    FROM production_batches pb
    LEFT JOIN raw_materials rm ON rm.id = pb.finished_product_id
    LEFT JOIN recipes r ON r.id = pb.recipe_id
    LEFT JOIN locations l ON l.id = pb.central_kitchen_id
    WHERE pb.id = ?`, [batchId]);
  if (!batch) throw new Error('Batch not found');
  const variance = await computeBatchVariance(batchId);
  const wastage = await query(`SELECT pwi.*, rm.material_name, rm.material_code, w.wastage_type, w.status
    FROM production_wastage w
    JOIN production_wastage_items pwi ON pwi.production_wastage_id = w.id
    LEFT JOIN raw_materials rm ON rm.id = pwi.raw_material_id
    WHERE w.production_batch_id = ? AND w.status IN ('Posted','Locked')
    ORDER BY w.created_at DESC`, [batchId]);
  return { batch, variance, wastage };
}

async function computeBatchVariance(batchId) {
  const [batch] = await query('SELECT pb.*, r.yield_qty, r.yield_unit_id, u.unit_name as output_unit_name FROM production_batches pb LEFT JOIN recipes r ON r.id = pb.recipe_id LEFT JOIN units u ON u.id = pb.unit_id WHERE pb.id = ?', [batchId]);
  if (!batch) throw new Error('Batch not found');

  const planned = num(batch.planned_qty);
  const gross = num(batch.gross_output_qty);
  const accepted = num(batch.accepted_output_qty);

  const yield_pct_gross = planned > 0 ? (gross / planned) * 100 : 0;
  const yield_pct_accepted = planned > 0 ? (accepted / planned) * 100 : 0;
  const output_loss_qty = planned - accepted;
  const output_loss_qty_gross = planned - gross;

  // Theoretical usage based on gross produced
  const recipeItems = await query(`SELECT ri.*, rm.material_name, rm.material_code, u.unit_name as base_unit_name
    FROM recipe_items ri
    LEFT JOIN raw_materials rm ON rm.id = ri.raw_material_id
    LEFT JOIN units u ON u.id = ri.base_unit_id
    WHERE ri.recipe_id = ?
    ORDER BY ri.display_order`, [batch.recipe_id]);

  const yieldQty = num(batch.yield_qty) || 1;
  // Aggregate across ALL cost tranches per material (FEFO can issue the same material
  // from multiple differently-costed batches) - unit_cost is derived as a weighted
  // average so total_actual_cost isn't silently missing tranches.
  const actualIssues = await query(`SELECT raw_material_id, SUM(qty_out) as actual_qty, SUM(value_out) as actual_value
    FROM stock_ledger
    WHERE reference_type = 'PRODUCTION_BATCH' AND reference_id = ? AND transaction_type = 'PRODUCTION_ISSUE'
    GROUP BY raw_material_id`, [batchId]);
  const actualByMaterial = Object.fromEntries(actualIssues.map((x) => [
    Number(x.raw_material_id),
    { ...x, unit_cost: num(x.actual_qty) > 0 ? num(x.actual_value) / num(x.actual_qty) : 0 },
  ]));

  let total_standard_cost = 0;
  let total_actual_cost = 0;
  let total_wastage_value = 0;
  let max_variance_pct = 0;
  const material_variance = [];

  for (const ri of recipeItems) {
    const theoreticalBase = (num(ri.base_qty) * gross) / yieldQty;
    const unitCost = num(actualByMaterial[Number(ri.raw_material_id)]?.unit_cost) || 0;
    const actualBase = num(actualByMaterial[Number(ri.raw_material_id)]?.actual_qty) || 0;
    const actualValue = num(actualByMaterial[Number(ri.raw_material_id)]?.actual_value) || 0;
    const varianceQty = actualBase - theoreticalBase;
    const standardValue = theoreticalBase * unitCost;
    const varianceValue = varianceQty * unitCost;
    const variancePct = theoreticalBase > 0 ? (varianceQty / theoreticalBase) * 100 : 0;
    total_standard_cost += standardValue;
    total_actual_cost += actualValue;
    max_variance_pct = Math.max(max_variance_pct, Math.abs(variancePct));
    material_variance.push({
      raw_material_id: ri.raw_material_id,
      material_code: ri.material_code,
      material_name: ri.material_name,
      theoretical_qty: theoreticalBase,
      actual_qty: actualBase,
      variance_qty: varianceQty,
      variance_pct: variancePct,
      unit_cost: unitCost,
      standard_value: standardValue,
      actual_value: actualValue,
      variance_value: varianceValue,
      base_unit_name: ri.base_unit_name,
    });
  }

  const wastageRows = await query(`SELECT COALESCE(SUM(pwi.value), 0) as total
    FROM production_wastage w
    JOIN production_wastage_items pwi ON pwi.production_wastage_id = w.id
    WHERE w.production_batch_id = ? AND w.status IN ('Posted','Locked')`, [batchId]);
  total_wastage_value = num(wastageRows[0]?.total);

  const production_cost = total_actual_cost;
  const finished_unit_cost = accepted > 0 ? production_cost / accepted : 0;

  return {
    planned_qty: planned,
    gross_output_qty: gross,
    rejected_output_qty: num(batch.rejected_output_qty),
    accepted_output_qty: accepted,
    yield_pct_gross,
    yield_pct_accepted,
    output_loss_qty,
    output_loss_qty_gross,
    total_standard_cost,
    total_actual_cost,
    production_cost,
    total_wastage_value,
    finished_unit_cost,
    max_variance_pct,
    material_variance,
  };
}

export async function getProductionDashboardVarianceKPIs(centralKitchenId) {
  const today = new Date().toISOString().split('T')[0];
  const wastageRows = await query(`SELECT COALESCE(SUM(total_value), 0) as total
    FROM production_wastage
    WHERE central_kitchen_id = ? AND wastage_date = ? AND status IN ('Posted','Locked')`, [centralKitchenId, today]);
  const posted = await query(`SELECT id FROM production_batches WHERE central_kitchen_id = ? AND is_posted = 1`, [centralKitchenId]);
  let totalYield = 0;
  let highVariance = 0;
  for (const p of posted) {
    const v = await computeBatchVariance(p.id);
    totalYield += v.yield_pct_accepted;
    if (v.yield_pct_accepted < LOW_YIELD_THRESHOLD * 100 || v.max_variance_pct > HIGH_VARIANCE_THRESHOLD * 100) highVariance++;
  }
  return {
    today_wastage_value: num(wastageRows[0]?.total),
    average_yield: posted.length ? totalYield / posted.length : 0,
    high_variance_batches: highVariance,
  };
}

export async function exportProductionVarianceExcel(filters) {
  const batches = await getProductionVariance(filters);
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Batch No', key: 'batch_no' },
    { header: 'Mfg Date', key: 'mfg_date' },
    { header: 'Finished Product', key: 'finished_product' },
    { header: 'Planned Qty', key: 'planned_qty' },
    { header: 'Gross Output', key: 'gross_output_qty' },
    { header: 'Rejected', key: 'rejected_output_qty' },
    { header: 'Accepted', key: 'accepted_output_qty' },
    { header: 'Gross Yield %', key: 'yield_pct_gross' },
    { header: 'Accepted Yield %', key: 'yield_pct_accepted' },
    { header: 'Std Cost', key: 'total_standard_cost' },
    { header: 'Actual Cost', key: 'total_actual_cost' },
    { header: 'Wastage Value', key: 'total_wastage_value' },
    { header: 'Finished Unit Cost', key: 'finished_unit_cost' },
    { header: 'Variance Status', key: 'variance_status' },
  ];

  const detailSheet = workbook.addWorksheet('Material Variance');
  detailSheet.columns = [
    { header: 'Batch No', key: 'batch_no' },
    { header: 'Finished Product', key: 'finished_product' },
    { header: 'Material', key: 'material_name' },
    { header: 'Theoretical Qty', key: 'theoretical_qty' },
    { header: 'Actual Qty', key: 'actual_qty' },
    { header: 'Variance Qty', key: 'variance_qty' },
    { header: 'Variance %', key: 'variance_pct' },
    { header: 'Unit Cost', key: 'unit_cost' },
    { header: 'Variance Value', key: 'variance_value' },
    { header: 'Base Unit', key: 'base_unit_name' },
  ];

  for (const b of batches) {
    const s = b.variance_summary;
    summarySheet.addRow({
      batch_no: b.batch_no,
      mfg_date: b.mfg_date,
      finished_product: b.finished_product,
      planned_qty: b.planned_qty,
      gross_output_qty: s.gross_output_qty,
      rejected_output_qty: s.rejected_output_qty,
      accepted_output_qty: s.accepted_output_qty,
      yield_pct_gross: s.yield_pct_gross,
      yield_pct_accepted: s.yield_pct_accepted,
      total_standard_cost: s.total_standard_cost,
      total_actual_cost: s.total_actual_cost,
      total_wastage_value: s.total_wastage_value,
      finished_unit_cost: s.finished_unit_cost,
      variance_status: b.variance_status,
    });
    for (const m of s.material_variance || []) {
      detailSheet.addRow({
        batch_no: b.batch_no,
        finished_product: b.finished_product,
        material_name: m.material_name,
        theoretical_qty: m.theoretical_qty,
        actual_qty: m.actual_qty,
        variance_qty: m.variance_qty,
        variance_pct: m.variance_pct,
        unit_cost: m.unit_cost,
        variance_value: m.variance_value,
        base_unit_name: m.base_unit_name,
      });
    }
  }

  return workbook.xlsx.writeBuffer();
}
