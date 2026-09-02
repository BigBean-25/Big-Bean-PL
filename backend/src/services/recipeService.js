import { query } from '../config/database.js';

const num = (value) => Number(value || 0);

// 1. UOM factor: from consumption unit to target (usually inventory) unit
export const getUomFactor = async (fromUnitId, toUnitId) => {
  if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;
  const rows = await query(
    `SELECT from_unit_id, to_unit_id, conversion_factor FROM uom_conversions
     WHERE is_active = 1 AND ((from_unit_id = ? AND to_unit_id = ?) OR (from_unit_id = ? AND to_unit_id = ?))`,
    [fromUnitId, toUnitId, toUnitId, fromUnitId]
  );
  if (rows.length === 0) return null; // no conversion
  const r = rows[0];
  if (Number(r.from_unit_id) === Number(fromUnitId)) return Number(r.conversion_factor);
  return 1 / Number(r.conversion_factor);
};

// 2. Latest approved material rate as of a date (outlet-specific or global)
export const getMaterialRate = async (rawMaterialId, outletId, asOfDate) => {
  const date = asOfDate || new Date().toISOString().split('T')[0];
  const params = [rawMaterialId, date];
  let outletFilter = 'AND outlet_id IS NULL';
  if (outletId) {
    outletFilter = 'AND (outlet_id = ? OR outlet_id IS NULL)';
    params.push(outletId);
  }
  const rows = await query(
    `SELECT rate FROM raw_material_rates
     WHERE raw_material_id = ? AND is_approved = 1 AND effective_from <= ? ${outletFilter}
     ORDER BY effective_from DESC, outlet_id DESC LIMIT 1`,
    params
  );
  if (rows.length > 0) return num(rows[0].rate);
  // Fallback to raw_materials.current_rate if allowed? Not implemented; return null.
  return null;
};

// 3. Active recipe for a menu item + outlet + date (respects status/effective dates/is_deleted)
export const resolveActiveRecipe = async ({ menu_item_id, outlet_id, as_of_date }) => {
  const date = as_of_date || new Date().toISOString().split('T')[0];
  const o = num(outlet_id);
  const scopeSql = o ? 'AND (r.for_outlet_id = ? OR r.for_outlet_id IS NULL)' : 'AND r.for_outlet_id IS NULL';
  const params = [menu_item_id, date, date];
  if (o) params.push(o);
  const rows = await query(
    `SELECT r.*, mi.item_name, mi.item_code, mi.selling_price, u1.unit_name as yield_unit_name, u2.unit_name as serving_unit_name
     FROM recipes r
     LEFT JOIN menu_items mi ON r.menu_item_id = mi.id
     LEFT JOIN units u1 ON r.yield_unit_id = u1.id
     LEFT JOIN units u2 ON r.serving_unit_id = u2.id
     WHERE r.menu_item_id = ?
       AND r.status = 'Active'
       AND r.is_deleted = 0
       AND r.effective_from <= ?
       AND (r.effective_to IS NULL OR r.effective_to >= ?)
       ${scopeSql}
     ORDER BY r.for_outlet_id IS NULL, r.version_no DESC, r.effective_from DESC
     LIMIT 1`,
    params
  );
  return rows[0] || null;
};

// 3b. Active recipe for a produced output material + outlet + date
export const resolveActiveRecipeByOutput = async ({ output_raw_material_id, for_outlet_id, as_of_date }) => {
  const date = as_of_date || new Date().toISOString().split('T')[0];
  const o = num(for_outlet_id);
  const scopeSql = o ? 'AND (r.for_outlet_id = ? OR r.for_outlet_id IS NULL)' : 'AND r.for_outlet_id IS NULL';
  const params = [output_raw_material_id, date, date];
  if (o) params.push(o);
  const rows = await query(
    `SELECT r.*, u1.unit_name as yield_unit_name, u2.unit_name as serving_unit_name
     FROM recipes r
     LEFT JOIN units u1 ON r.yield_unit_id = u1.id
     LEFT JOIN units u2 ON r.serving_unit_id = u2.id
     WHERE r.output_raw_material_id = ?
       AND r.status = 'Active'
       AND r.is_deleted = 0
       AND r.effective_from <= ?
       AND (r.effective_to IS NULL OR r.effective_to >= ?)
       ${scopeSql}
     ORDER BY r.for_outlet_id IS NULL, r.version_no DESC, r.effective_from DESC
     LIMIT 1`,
    params
  );
  return rows[0] || null;
};

// 3c. Standard production cost per base output UOM for a produced material
export const getStandardOutputCost = async (outputRawMaterialId, outletId, asOfDate) => {
  const recipe = await resolveActiveRecipeByOutput({ output_raw_material_id: outputRawMaterialId, for_outlet_id: outletId, as_of_date: asOfDate });
  if (!recipe) return null;
  if (num(recipe.yield_qty) <= 0) return null;
  const items = await getRecipeItems(recipe.id, recipe.for_outlet_id, asOfDate, recipe.output_raw_material_id);
  const total = items.reduce((sum, it) => sum + num(it.ingredient_cost), 0);
  return total / num(recipe.yield_qty);
};

// 3d. Validate that a recipe does not create a circular BOM dependency
export const validateNoCircularDependency = async (currentOutput, for_outlet_id, ingredientMaterialIds, asOfDate) => {
  if (!currentOutput) return true;
  const visited = new Set();
  const walk = async (mid) => {
    if (Number(mid) === Number(currentOutput)) return true;
    if (visited.has(Number(mid))) return false;
    visited.add(Number(mid));
    const recipe = await resolveActiveRecipeByOutput({ output_raw_material_id: mid, for_outlet_id, as_of_date: asOfDate });
    if (!recipe) return false;
    const items = await query('SELECT raw_material_id FROM recipe_items WHERE recipe_id = ?', [recipe.id]);
    for (const it of items) {
      if (Number(it.raw_material_id) === Number(currentOutput)) return true;
      if (await walk(it.raw_material_id)) return true;
    }
    return false;
  };
  for (const mid of ingredientMaterialIds) {
    if (Number(mid) === Number(currentOutput)) return false;
    if (await walk(mid)) return false;
  }
  return true;
};

// 4. Load recipe items and compute base qty / cost per item
export const getRecipeItems = async (recipeId, outletId, asOfDate, currentOutput = null) => {
  const date = asOfDate || new Date().toISOString().split('T')[0];
  const items = await query(
    `SELECT ri.*, rm.material_name, rm.material_code, rm.unit_id AS inventory_unit_id, u1.unit_name AS recipe_unit_name, u2.unit_name AS base_unit_name
     FROM recipe_items ri
     LEFT JOIN raw_materials rm ON ri.raw_material_id = rm.id
     LEFT JOIN units u1 ON ri.recipe_unit_id = u1.id
     LEFT JOIN units u2 ON ri.base_unit_id = u2.id
     WHERE ri.recipe_id = ?
     ORDER BY ri.display_order, ri.id`,
    [recipeId]
  );

  const result = [];
  for (const item of items) {
    const baseUnit = num(item.base_unit_id) || num(item.inventory_unit_id) || num(item.unit_id);
    const recipeUnit = num(item.recipe_unit_id) || num(item.unit_id);
    const factor = await getUomFactor(recipeUnit, baseUnit);
    const baseQty = factor ? num(item.qty_per_item) * factor : null;
    const standardWastage = item.waste_percentage ? (baseQty || num(item.qty_per_item)) * (num(item.waste_percentage) / 100) : 0;
    const netQty = (baseQty || num(item.qty_per_item)) + standardWastage;
    let rate = null;
    if (Number(item.raw_material_id) !== Number(currentOutput)) {
      rate = await getStandardOutputCost(item.raw_material_id, outletId, date) ?? await getMaterialRate(item.raw_material_id, outletId, date);
    }
    const ingredientCost = (baseQty !== null && rate !== null) ? netQty * rate : null;

    result.push({
      ...item,
      recipe_unit_id: recipeUnit,
      base_unit_id: baseUnit,
      conversion_factor: factor,
      base_qty: baseQty,
      standard_wastage_qty: standardWastage,
      net_qty: netQty,
      rate,
      ingredient_cost: ingredientCost,
      notes: item.remarks,
      recipe_unit_name: item.recipe_unit_name,
      base_unit_name: item.base_unit_name,
      is_semi_finished: rate === null ? false : (await resolveActiveRecipeByOutput({ output_raw_material_id: item.raw_material_id, for_outlet_id: outletId, as_of_date: date })) !== null,
    });
  }
  return result;
};

// 5. Theoretical consumption for a sale event
export const getTheoreticalConsumption = async ({ outlet_id, menu_item_id, sale_date, quantity_sold }) => {
  const recipe = await resolveActiveRecipe({ menu_item_id, outlet_id, as_of_date: sale_date });
  if (!recipe) return { recipe: null, items: [] };
  const items = await getRecipeItems(recipe.id, outlet_id, sale_date, recipe.output_raw_material_id);
  const qty = num(quantity_sold);
  return {
    recipe,
    items: items.map((item) => ({
      raw_material_id: item.raw_material_id,
      material_name: item.material_name,
      material_code: item.material_code,
      base_unit_id: item.base_unit_id,
      base_unit_name: item.base_unit_name,
      recipe_qty_per_item: item.base_qty,
      quantity_sold: qty,
      theoretical_qty: item.base_qty ? item.base_qty * qty : null,
    })),
  };
};

// 6. Find an overlapping effective recipe version for the same menu item + outlet scope
export const findOverlappingEffective = async ({
  menu_item_id,
  output_raw_material_id,
  for_outlet_id,
  effective_from,
  effective_to,
  exclude_id,
}) => {
  const target = menu_item_id || output_raw_material_id;
  const isMenu = menu_item_id ? 1 : 0;
  const isOutput = output_raw_material_id ? 1 : 0;
  const to = effective_to || '9999-12-31';
  const params = [isMenu, menu_item_id, isOutput, output_raw_material_id, for_outlet_id, for_outlet_id, to, effective_from, exclude_id];
  const rows = await query(
    `SELECT id, version_no, effective_from, effective_to FROM recipes
     WHERE ((? = 1 AND menu_item_id = ?) OR (? = 1 AND output_raw_material_id = ?))
       AND (for_outlet_id = ? OR (for_outlet_id IS NULL AND ? IS NULL))
       AND is_deleted = 0
       AND status != 'Draft'
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
       AND id != ?
     LIMIT 1`,
    params
  );
  return rows[0] || null;
};

// 7. Snapshot a recipe version into recipe_versions
export const writeRecipeVersionSnapshot = async (recipeRow, items, userId) => {
  const exists = await query(
    'SELECT id FROM recipe_versions WHERE (menu_item_id <=> ? AND output_raw_material_id <=> ?) AND for_outlet_id <=> ? AND version_no = ?',
    [recipeRow.menu_item_id, recipeRow.output_raw_material_id, recipeRow.for_outlet_id, recipeRow.version_no]
  );
  if (exists.length > 0) return;
  const payload = JSON.stringify({
    recipe_id: recipeRow.id,
    menu_item_id: recipeRow.menu_item_id,
    output_raw_material_id: recipeRow.output_raw_material_id,
    for_outlet_id: recipeRow.for_outlet_id,
    recipe_name: recipeRow.recipe_name,
    recipe_type: recipeRow.recipe_type,
    recipe_category: recipeRow.recipe_category,
    version_no: recipeRow.version_no,
    effective_from: recipeRow.effective_from,
    effective_to: recipeRow.effective_to,
    yield_qty: recipeRow.yield_qty,
    yield_unit_id: recipeRow.yield_unit_id,
    serving_size: recipeRow.serving_size,
    serving_unit_id: recipeRow.serving_unit_id,
    portion: recipeRow.portion,
    notes: recipeRow.notes,
    items: items.map((it) => ({
      raw_material_id: it.raw_material_id,
      qty_per_item: it.qty_per_item,
      recipe_unit_id: it.recipe_unit_id,
      base_unit_id: it.base_unit_id,
      conversion_factor: it.conversion_factor,
      base_qty: it.base_qty,
      waste_percentage: it.waste_percentage,
      standard_wastage_qty: it.standard_wastage_qty,
      net_qty: it.net_qty,
    })),
  });
  await query(
    'INSERT INTO recipe_versions (menu_item_id, output_raw_material_id, for_outlet_id, version_no, recipe_data, effective_from, effective_to, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [recipeRow.menu_item_id, recipeRow.output_raw_material_id, recipeRow.for_outlet_id, recipeRow.version_no, payload, recipeRow.effective_from, recipeRow.effective_to, userId]
  );
};

// 8. Version history for a menu item + outlet scope
export const getRecipeVersionHistory = async (menu_item_id, for_outlet_id, output_raw_material_id = null) => {
  const rows = await query(
    `SELECT rv.id, rv.menu_item_id, rv.output_raw_material_id, rv.for_outlet_id, rv.version_no, rv.recipe_data,
            rv.created_by, rv.created_at, u.full_name as created_by_name,
            r.id as recipe_id, r.status, rv.effective_from, rv.effective_to
     FROM recipe_versions rv
     LEFT JOIN users u ON rv.created_by = u.id
     LEFT JOIN recipes r
       ON (
         (rv.menu_item_id IS NOT NULL AND r.menu_item_id = rv.menu_item_id)
         OR (rv.output_raw_material_id IS NOT NULL AND r.output_raw_material_id = rv.output_raw_material_id)
       )
       AND (r.for_outlet_id <=> rv.for_outlet_id)
       AND r.version_no = rv.version_no
       AND r.is_deleted = 0
     WHERE (rv.menu_item_id <=> ? AND rv.output_raw_material_id <=> ?) AND rv.for_outlet_id <=> ?
     ORDER BY rv.version_no DESC`,
    [menu_item_id, output_raw_material_id, for_outlet_id]
  );
  return rows.map((row) => {
    let data = null;
    if (row.recipe_data) {
      try {
        data = typeof row.recipe_data === "string" ? JSON.parse(row.recipe_data) : row.recipe_data;
      } catch {
        data = null;
      }
    }
    return {
      ...row,
      effective_from: row.effective_from ?? data?.effective_from ?? null,
      effective_to: row.effective_to ?? data?.effective_to ?? null,
    };
  });
};

// 9. Create a new draft version from an existing recipe
export const createNewVersion = async (existingRecipeId, userId) => {
  const existingRows = await query('SELECT * FROM recipes WHERE is_deleted = 0 AND id = ?', [existingRecipeId]);
  if (existingRows.length === 0) throw new Error('Recipe not found');
  const existing = existingRows[0];

  const [maxRow] = await query(
    'SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM recipes WHERE (menu_item_id <=> ? AND output_raw_material_id <=> ?) AND (for_outlet_id = ? OR (for_outlet_id IS NULL AND ? IS NULL))',
    [existing.menu_item_id, existing.output_raw_material_id, existing.for_outlet_id, existing.for_outlet_id]
  );
  const newVersion = maxRow.next_version;

  const result = await query(
    `INSERT INTO recipes (
      menu_item_id, output_raw_material_id, recipe_name, recipe_code, recipe_category, recipe_type,
      for_outlet_id, portion, yield_qty, yield_unit_id, serving_size, serving_unit_id,
      prep_time, cooking_time, finishing_time, effective_from, effective_to, status,
      version_no, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      existing.menu_item_id, existing.output_raw_material_id, existing.recipe_name, existing.recipe_code, existing.recipe_category, existing.recipe_type,
      existing.for_outlet_id, existing.portion, existing.yield_qty, existing.yield_unit_id, existing.serving_size, existing.serving_unit_id,
      existing.prep_time, existing.cooking_time, existing.finishing_time, null, null, 'Draft',
      newVersion, existing.notes, userId
    ]
  );
  const newRecipeId = result.insertId;

  const items = await query('SELECT * FROM recipe_items WHERE recipe_id = ?', [existingRecipeId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await query(
      `INSERT INTO recipe_items (
        recipe_id, raw_material_id, unit_id, qty_per_item, recipe_unit_id, base_unit_id,
        conversion_factor, base_qty, waste_percentage, standard_wastage_qty, net_qty,
        extra_cost, remarks, display_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        newRecipeId, it.raw_material_id, it.unit_id, it.qty_per_item, it.recipe_unit_id, it.base_unit_id,
        it.conversion_factor, it.base_qty, it.waste_percentage, it.standard_wastage_qty, it.net_qty,
        it.extra_cost, it.remarks, i
      ]
    );
  }
  return newRecipeId;
};

// 10. Complete recipe with costing (used by GET one and list)
export const buildRecipeResponse = async (recipeRow, { as_of_date } = {}) => {
  if (!recipeRow) return null;
  const fmtDate = (d) => {
    if (!d) return null;
    const date = new Date(d);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  };
  recipeRow.effective_from = fmtDate(recipeRow.effective_from);
  recipeRow.effective_to = fmtDate(recipeRow.effective_to);
  const items = await getRecipeItems(recipeRow.id, recipeRow.for_outlet_id, as_of_date, recipeRow.output_raw_material_id);
  const totalRecipeCost = items.reduce((sum, item) => sum + num(item.ingredient_cost) + num(item.extra_cost), 0);
  const sellingPrice = num(recipeRow.selling_price);
  const foodCostPercent = sellingPrice > 0 ? (totalRecipeCost / sellingPrice) * 100 : null;
  const grossMarginAmount = sellingPrice - totalRecipeCost;
  const grossMarginPercent = sellingPrice > 0 ? (grossMarginAmount / sellingPrice) * 100 : null;
  const yieldQty = num(recipeRow.yield_qty);
  const costPerOutputUnit = (recipeRow.recipe_type !== 'Direct' && yieldQty > 0) ? (totalRecipeCost / yieldQty) : null;
  return {
    ...recipeRow,
    items,
    total_recipe_cost: totalRecipeCost,
    selling_price: sellingPrice,
    food_cost_percentage: foodCostPercent,
    gross_margin_amount: grossMarginAmount,
    gross_margin_percentage: grossMarginPercent,
    cost_per_output_unit: costPerOutputUnit,
    yield_qty: yieldQty,
  };
};
