import { query, getConnection } from '../config/database.js';
import { getActualConsumption, getTheoreticalConsumption } from './consumptionService.js';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

const HIGH_VARIANCE_PCT = 15;
const WARNING_VARIANCE_PCT = 5;

// Actual consumption is tracked per raw material only; theoretical consumption is
// tracked per (menu item, raw material) since it's derived from what was sold. A
// variance comparison needs both sides at the same grain, so theoretical is summed
// up to the material level here - the raw per-menu-item rows are still what gets
// persisted to theoretical_consumption_items, matching that table's schema.
function aggregateTheoreticalByMaterial(theoreticalRows) {
  const byMaterial = {};
  for (const row of theoreticalRows) {
    const key = row.raw_material_id;
    if (!byMaterial[key]) {
      byMaterial[key] = {
        raw_material_id: key,
        material_name: row.material_name,
        material_code: row.material_code,
        unit: row.unit,
        theoretical_qty: 0,
      };
    }
    byMaterial[key].theoretical_qty += num(row.total_used_qty);
  }
  return byMaterial;
}

export async function computeConsumptionVariance({ outletId, month, year }) {
  const [actualRows, theoreticalRows] = await Promise.all([
    getActualConsumption({ outletId, month, year }),
    getTheoreticalConsumption({ outletId, month, year }),
  ]);

  const theoreticalByMaterial = aggregateTheoreticalByMaterial(theoreticalRows);
  const actualByMaterial = Object.fromEntries(actualRows.map((a) => [a.raw_material_id, a]));

  const materialIds = new Set([
    ...Object.keys(theoreticalByMaterial).map(Number),
    ...actualRows.map((a) => a.raw_material_id),
  ]);

  const rows = [...materialIds].map((id) => {
    const t = theoreticalByMaterial[id];
    const a = actualByMaterial[id];
    const actualQty = num(a?.actual_consumption_qty);
    const actualValue = num(a?.actual_consumption_value);
    const theoreticalQty = num(t?.theoretical_qty);
    // No independent unit rate exists for theoretical usage (it's a physical qty
    // derived from recipes, not a purchase), so it's valued at the same effective
    // rate the actual side paid this month - the fair basis for a cost comparison.
    const effectiveRate = actualQty > 0 ? actualValue / actualQty : 0;
    const theoreticalValue = theoreticalQty * effectiveRate;
    const varianceQty = actualQty - theoreticalQty;
    const varianceValue = actualValue - theoreticalValue;
    const variancePct = theoreticalQty > 0 ? (varianceQty / theoreticalQty) * 100 : (actualQty > 0 ? 100 : 0);
    const absPct = Math.abs(variancePct);
    const status = absPct > HIGH_VARIANCE_PCT ? 'Critical' : absPct > WARNING_VARIANCE_PCT ? 'Warning' : 'Normal';

    return {
      raw_material_id: id,
      material_name: a?.material_name || t?.material_name,
      material_code: a?.material_code || t?.material_code,
      unit: a?.unit || t?.unit,
      actual_qty: actualQty,
      theoretical_qty: theoreticalQty,
      variance_qty: varianceQty,
      variance_percentage: variancePct,
      actual_value: actualValue,
      theoretical_value: theoreticalValue,
      variance_value: varianceValue,
      status,
    };
  }).sort((x, y) => Math.abs(y.variance_value) - Math.abs(x.variance_value));

  return { rows, actualRows, theoreticalRows };
}

export async function getConsumptionVarianceReport({ outletId, month, year }) {
  const { rows } = await computeConsumptionVariance({ outletId, month, year });
  return rows;
}

// Saves one audit snapshot per outlet/month/year. Re-running for a month that
// already has a saved run replaces its items rather than accumulating duplicate
// history rows - the live numbers above are always freshly computed regardless,
// this is only the persisted audit trail.
export async function saveConsumptionVarianceRun({ outletId, month, year, userId }) {
  const { rows, actualRows, theoreticalRows } = await computeConsumptionVariance({ outletId, month, year });
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.execute(
      `SELECT id FROM consumption_runs WHERE run_type = 'Variance' AND outlet_id = ? AND month = ? AND year = ? LIMIT 1`,
      [outletId, month, year]
    );

    let runId;
    if (existing.length) {
      runId = existing[0].id;
      await conn.execute('DELETE FROM actual_consumption_items WHERE run_id = ?', [runId]);
      await conn.execute('DELETE FROM theoretical_consumption_items WHERE run_id = ?', [runId]);
      await conn.execute('DELETE FROM consumption_variance_items WHERE run_id = ?', [runId]);
      await conn.execute(
        `UPDATE consumption_runs SET run_date = CURDATE(), status = 'Completed', total_items = ?, run_by = ? WHERE id = ?`,
        [rows.length, userId || null, runId]
      );
    } else {
      const [res] = await conn.execute(
        `INSERT INTO consumption_runs (run_type, month, year, outlet_id, run_date, status, total_items, run_by)
         VALUES ('Variance', ?, ?, ?, CURDATE(), 'Completed', ?, ?)`,
        [month, year, outletId, rows.length, userId || null]
      );
      runId = res.insertId;
    }

    for (const a of actualRows) {
      await conn.execute(
        `INSERT INTO actual_consumption_items (run_id, outlet_id, raw_material_id, opening_qty, purchase_qty, closing_qty, opening_value, purchase_value, closing_value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [runId, outletId, a.raw_material_id, num(a.opening_qty), num(a.purchase_qty), num(a.closing_qty), num(a.opening_value), num(a.purchase_value), num(a.closing_value)]
      );
    }

    for (const t of theoreticalRows) {
      const actualForMaterial = actualRows.find((a) => a.raw_material_id === t.raw_material_id);
      const rate = actualForMaterial && num(actualForMaterial.actual_consumption_qty) > 0
        ? num(actualForMaterial.actual_consumption_value) / num(actualForMaterial.actual_consumption_qty)
        : 0;
      await conn.execute(
        `INSERT INTO theoretical_consumption_items (run_id, outlet_id, menu_item_id, raw_material_id, qty_sold, recipe_qty, avg_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [runId, outletId, t.menu_item_id, t.raw_material_id, num(t.qty_sold), num(t.recipe_qty_per_item), rate]
      );
    }

    for (const v of rows) {
      await conn.execute(
        `INSERT INTO consumption_variance_items (run_id, outlet_id, raw_material_id, actual_qty, theoretical_qty, variance_percentage, actual_value, theoretical_value, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [runId, outletId, v.raw_material_id, v.actual_qty, v.theoretical_qty, v.variance_percentage, v.actual_value, v.theoretical_value, v.status]
      );
    }

    await conn.commit();
    return { runId, rows };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
