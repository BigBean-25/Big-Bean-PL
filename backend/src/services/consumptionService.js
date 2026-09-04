import { query } from '../config/database.js';
import { resolveActiveRecipe } from './recipeService.js';

// Extracted from reportController.js's getActualConsumptionReport/
// getTheoreticalConsumptionReport so the calculation can be reused - originally
// the consumption-variance report (Actual vs Theoretical) had nowhere to get either
// side without re-running the same queries. The controllers now call these too, so
// there's a single source of truth for both calculations.

export async function getActualConsumption({ outletId, month, year }) {
  const openingStock = await query(
    `SELECT
      osi.raw_material_id,
      rm.material_name,
      rm.material_code,
      c.category_name,
      u.unit_name,
      COALESCE(SUM(osi.qty), 0) as opening_qty,
      COALESCE(SUM(osi.value), 0) as opening_value
     FROM opening_stock_items osi
     INNER JOIN opening_stock_uploads osu ON osi.upload_id = osu.id
     LEFT JOIN raw_materials rm ON osi.raw_material_id = rm.id
     LEFT JOIN categories c ON rm.category_id = c.id
     LEFT JOIN units u ON rm.unit_id = u.id
     WHERE osi.outlet_id = ? AND osu.month = ? AND osu.year = ?
     AND osu.status = 'Completed'
     GROUP BY osi.raw_material_id, rm.material_name, rm.material_code, c.category_name, u.unit_name`,
    [outletId, month, year]
  );

  const closingStock = await query(
    `SELECT
      csi.raw_material_id,
      COALESCE(SUM(csi.qty), 0) as closing_qty,
      COALESCE(SUM(csi.value), 0) as closing_value
     FROM closing_stock_items csi
     INNER JOIN closing_stock_uploads csu ON csi.upload_id = csu.id
     WHERE csi.outlet_id = ? AND csu.month = ? AND csu.year = ?
     AND csu.status = 'Completed'
     GROUP BY csi.raw_material_id`,
    [outletId, month, year]
  );

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;

  const purchases = await query(
    `SELECT
      mpi.raw_material_id,
      COALESCE(SUM(mpi.qty), 0) as purchase_qty,
      COALESCE(SUM(mpi.total_amount), 0) as purchase_value
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
     WHERE mpi.outlet_id = ? AND mpi.date >= ? AND mpi.date <= ?
     AND mpu.status = 'Completed'
     GROUP BY mpi.raw_material_id`,
    [outletId, startDate, endDateStr]
  );

  const closingMap = Object.fromEntries(closingStock.map((item) => [item.raw_material_id, item]));
  const purchaseMap = Object.fromEntries(purchases.map((item) => [item.raw_material_id, item]));

  return openingStock.map((item) => {
    const closing = closingMap[item.raw_material_id] || { closing_qty: 0, closing_value: 0 };
    const purchase = purchaseMap[item.raw_material_id] || { purchase_qty: 0, purchase_value: 0 };

    const actualQty = Number(item.opening_qty) + Number(purchase.purchase_qty) - Number(closing.closing_qty);
    const actualValue = Number(item.opening_value) + Number(purchase.purchase_value) - Number(closing.closing_value);

    return {
      raw_material_id: item.raw_material_id,
      material_name: item.material_name,
      material_code: item.material_code,
      category: item.category_name,
      unit: item.unit_name,
      opening_qty: item.opening_qty,
      opening_value: item.opening_value,
      purchase_qty: purchase.purchase_qty,
      purchase_value: purchase.purchase_value,
      closing_qty: closing.closing_qty,
      closing_value: closing.closing_value,
      actual_consumption_qty: actualQty,
      actual_consumption_value: actualValue
    };
  });
}

export async function getTheoreticalConsumption({ outletId, month, year }) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;

  const sales = await query(
    `SELECT
      isi.menu_item_id,
      mi.item_name,
      mi.item_code,
      c.category_name,
      COALESCE(SUM(isi.qty_sold), 0) as total_qty_sold
     FROM item_sales_items isi
     INNER JOIN item_sales_uploads isu ON isi.upload_id = isu.id
     LEFT JOIN menu_items mi ON isi.menu_item_id = mi.id
     LEFT JOIN categories c ON mi.category_id = c.id
     WHERE isi.outlet_id = ? AND isi.date >= ? AND isi.date <= ?
     AND isu.status = 'Completed' AND isi.menu_item_id IS NOT NULL
     GROUP BY isi.menu_item_id, mi.item_name, mi.item_code, c.category_name`,
    [outletId, startDate, endDateStr]
  );

  const theoreticalConsumption = [];

  for (const sale of sales) {
    // Was an inline query here: WHERE r.menu_item_id = ? AND r.status = 'Active'
    // AND (r.for_outlet_id IS NULL OR r.for_outlet_id = ?), with no LIMIT. That
    // has two bugs: (1) it ignores effective_from/effective_to entirely, so a
    // recipe edited today silently rewrites theoretical consumption for every
    // past month's report, and (2) an outlet-specific override and its global
    // default can both be Active at once by design (see recipeService.js's
    // resolveActiveRecipe/resolveActiveRecipeByOutput, which already handle
    // this correctly elsewhere) - the old query returned BOTH and summed their
    // ingredients, double-counting for any menu item with an outlet override.
    // resolveActiveRecipe() already implements the correct single-winner
    // lookup (outlet-specific preferred over global, as-of a given date), so
    // reuse it here instead of re-deriving the same logic incorrectly.
    // as_of_date uses the reporting month's last day as the best single-date
    // approximation - a recipe changed mid-month still isn't split day-by-day
    // by this, but it fixes the "always uses whatever is active today,
    // regardless of which month you're viewing" behavior, which was the more
    // severe and more common failure.
    const recipe = await resolveActiveRecipe({ menu_item_id: sale.menu_item_id, outlet_id: outletId, as_of_date: endDateStr });
    const recipeItems = recipe
      ? await query(
        `SELECT
          ri.raw_material_id,
          rm.material_name,
          rm.material_code,
          ri.qty_per_item,
          u.unit_name,
          ri.waste_percentage
         FROM recipe_items ri
         LEFT JOIN raw_materials rm ON ri.raw_material_id = rm.id
         LEFT JOIN units u ON ri.unit_id = u.id
         WHERE ri.recipe_id = ?`,
        [recipe.id]
      )
      : [];

    for (const recipeItem of recipeItems) {
      // Recipe wastage allowance must be folded in here, or the theoretical
      // side is always understated vs actual for any material with a
      // waste_percentage - the same standard-wastage math recipeService.js's
      // getRecipeItems() already applies for BOM costing.
      const wastageMultiplier = 1 + (Number(recipeItem.waste_percentage) || 0) / 100;
      const totalUsedQty = sale.total_qty_sold * recipeItem.qty_per_item * wastageMultiplier;

      theoreticalConsumption.push({
        menu_item_id: sale.menu_item_id,
        item_name: sale.item_name,
        item_code: sale.item_code,
        category: sale.category_name,
        qty_sold: sale.total_qty_sold,
        raw_material_id: recipeItem.raw_material_id,
        material_name: recipeItem.material_name,
        material_code: recipeItem.material_code,
        recipe_qty_per_item: recipeItem.qty_per_item,
        unit: recipeItem.unit_name,
        waste_percentage: recipeItem.waste_percentage,
        total_used_qty: totalUsedQty
      });
    }
  }

  return theoreticalConsumption;
}
