import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { query, getConnection } from '../config/database.js';
import {
  getUomFactor,
  getMaterialRate,
  getRecipeItems,
  resolveActiveRecipe,
  getTheoreticalConsumption,
  buildRecipeResponse,
  findOverlappingEffective,
  writeRecipeVersionSnapshot,
  getRecipeVersionHistory,
  createNewVersion,
  validateNoCircularDependency,
} from '../services/recipeService.js';

const router = express.Router();

const num = (value) => Number(value || 0);

const isEditableStatus = (status) => ['Draft', 'Rejected'].includes(status);

// --- Scoped record loader equivalent to loadScopedRecord for recipes table ---
const loadRecipeRecord = async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT r.*, mi.selling_price,
              u1.unit_name as yield_unit_name, u2.unit_name as serving_unit_name
       FROM recipes r
       LEFT JOIN menu_items mi ON r.menu_item_id = mi.id
       LEFT JOIN units u1 ON r.yield_unit_id = u1.id
       LEFT JOIN units u2 ON r.serving_unit_id = u2.id
       WHERE r.is_deleted = 0 AND r.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Recipe not found' });
    }
    const record = rows[0];
    const scope = req.outletScope;
    if (scope && !scope.all && record.for_outlet_id && !scope.outletIds.includes(Number(record.for_outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this record outlet' });
    }
    req.record = record;
    next();
  } catch (error) {
    console.error('Load recipe record error:', error);
    res.status(500).json({ success: false, message: 'Error loading recipe record' });
  }
};

// --- Create-scope validation ---
const validateRecipeCreateScope = (forOutletId, scope) => {
  if (String(forOutletId) === 'all') return 'Invalid outlet selection';
  if (!scope || scope.all) return null; // Super/Admin can create global or any allowed outlet
  if (!forOutletId) return 'Global recipes are not allowed for this role. Select an assigned outlet.';
  if (!scope.outletIds.includes(Number(forOutletId))) return 'Selected outlet is outside your authorized scope.';
  return null;
};

// --- Duplicate ingredient validation ---
const validateRecipeItems = (items) => {
  if (!items || items.length === 0) return 'At least one ingredient is required';
  const seen = new Set();
  for (const it of items) {
    if (!it.raw_material_id || num(it.qty_per_item) <= 0) return 'Each ingredient must have a material and positive quantity';
    if (!it.recipe_unit_id) return 'Each ingredient must have a recipe unit';
    const key = Number(it.raw_material_id);
    if (seen.has(key)) return 'Duplicate ingredient lines are not allowed within a recipe';
    seen.add(key);
  }
  return null;
};

// --- Historical usage check (status-based + usage tables) ---
const hasHistoricalUsage = async (recipeId) => {
  const [counts] = await query(
    `SELECT (
      (SELECT COUNT(*) FROM theoretical_consumption_items tci
       INNER JOIN recipes r ON tci.menu_item_id = r.menu_item_id AND r.id = ?)
     ) AS usage_count`,
    [recipeId]
  );
  return counts.usage_count > 0;
};

router.get('/uom-conversion/:from/:to', protect, async (req, res) => {
  try {
    const factor = await getUomFactor(req.params.from, req.params.to);
    res.json({ success: true, data: { factor } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/material-rate/:materialId', protect, async (req, res) => {
  try {
    const { outlet_id, as_of_date } = req.query;
    const rate = await getMaterialRate(req.params.materialId, outlet_id, as_of_date);
    res.json({ success: true, data: { rate } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Helpers ---
const getNextVersion = async (menuItemId, outputRawMaterialId, forOutletId) => {
  const [row] = await query(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM recipes
     WHERE (menu_item_id <=> ? AND output_raw_material_id <=> ?)
       AND (for_outlet_id = ? OR (for_outlet_id IS NULL AND ? IS NULL))
       AND is_deleted = 0`,
    [menuItemId, outputRawMaterialId, forOutletId, forOutletId]
  );
  return row ? row.next_version : 1;
};

const assertScope = (record, scope) => {
  if (!scope || scope.all) return true;
  if (!record.for_outlet_id) return true;
  return scope.outletIds.includes(Number(record.for_outlet_id));
};

// --- Routes ---

router.get('/', protect, applyOutletScope, async (req, res) => {
  try {
    const { menu_item_id, status, recipe_type } = req.query;
    let whereClause = 'r.is_deleted = 0';
    const params = [];

    if (menu_item_id) {
      whereClause += ' AND r.menu_item_id = ?';
      params.push(menu_item_id);
    }

    if (status) {
      whereClause += ' AND r.status = ?';
      params.push(status);
    }

    if (recipe_type) {
      whereClause += ' AND r.recipe_type = ?';
      params.push(recipe_type);
    }

    if (req.outletScope && !req.outletScope.all) {
      whereClause += ` AND (r.for_outlet_id IS NULL OR r.for_outlet_id IN (${req.outletScope.outletIds.map(() => '?').join(',')}))`;
      params.push(...req.outletScope.outletIds);
    }

    const recipes = await query(
      `SELECT r.*, mi.item_name, mi.item_code, mi.selling_price,
              o.outlet_name, u1.unit_name as yield_unit_name, u2.unit_name as serving_unit_name,
              uc.full_name as created_by_name, uu.full_name as updated_by_name
       FROM recipes r
       LEFT JOIN menu_items mi ON r.menu_item_id = mi.id
       LEFT JOIN outlets o ON r.for_outlet_id = o.id
       LEFT JOIN units u1 ON r.yield_unit_id = u1.id
       LEFT JOIN units u2 ON r.serving_unit_id = u2.id
       LEFT JOIN users uc ON r.created_by = uc.id
       LEFT JOIN users uu ON r.updated_by = uu.id
       WHERE ${whereClause}
       ORDER BY r.id DESC`,
      params
    );

    // enrich with cost/gross margin asynchronously
    const data = await Promise.all(recipes.map((r) => buildRecipeResponse(r, { as_of_date: req.query.as_of_date })));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', protect, applyOutletScope, loadRecipeRecord, async (req, res) => {
  try {
    const data = await buildRecipeResponse(req.record, { as_of_date: req.query.as_of_date });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id/theoretical-consumption', protect, applyOutletScope, async (req, res) => {
  try {
    const { quantity_sold, sale_date } = req.query;
    const recipes = await query('SELECT * FROM recipes WHERE is_deleted = 0 AND id = ?', [req.params.id]);
    if (recipes.length === 0) return res.status(404).json({ success: false, message: 'Recipe not found' });
    const recipe = recipes[0];
    if (!assertScope(recipe, req.outletScope)) return res.status(403).json({ success: false, message: 'Outlet access denied' });

    const result = await getTheoreticalConsumption({
      outlet_id: recipe.for_outlet_id,
      menu_item_id: recipe.menu_item_id,
      sale_date: sale_date || new Date().toISOString().split('T')[0],
      quantity_sold: num(quantity_sold) || 1,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', protect, applyOutletScope, checkPermission('add_recipe', 'can_create'), async (req, res) => {
  try {
    const b = req.body;
    const { recipe_name, recipe_code, recipe_category, recipe_type, for_outlet_id, portion, yield_qty, yield_unit_id, serving_size, serving_unit_id, prep_time, cooking_time, finishing_time, effective_from, effective_to, status, notes, items } = b;
    let { menu_item_id, output_raw_material_id } = b;
    const type = recipe_type || 'Direct';

    if (!recipe_name) {
      return res.status(400).json({ success: false, message: 'Recipe name is required' });
    }
    if (!['Direct', 'Batch', 'Semi-Finished', 'Production'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid recipe type' });
    }

    const itemError = validateRecipeItems(items);
    if (itemError) {
      return res.status(400).json({ success: false, message: itemError });
    }

    if (type === 'Direct') {
      if (!menu_item_id) {
        return res.status(400).json({ success: false, message: 'Menu item is required for Direct recipes' });
      }
      output_raw_material_id = null;
      const menuItem = (await query('SELECT is_active FROM menu_items WHERE id = ?', [menu_item_id]))[0];
      if (!menuItem) {
        return res.status(400).json({ success: false, message: 'Menu item not found' });
      }
    } else {
      if (!output_raw_material_id) {
        return res.status(400).json({ success: false, message: 'Output material is required for Batch/Semi-Finished/Production recipes' });
      }
      menu_item_id = null;
      if (num(yield_qty) <= 0) {
        return res.status(400).json({ success: false, message: 'Yield quantity must be greater than 0' });
      }
      if (!yield_unit_id) {
        return res.status(400).json({ success: false, message: 'Yield UOM is required' });
      }
      const outputMat = (await query('SELECT is_active FROM raw_materials WHERE id = ?', [output_raw_material_id]))[0];
      if (!outputMat) {
        return res.status(400).json({ success: false, message: 'Output material not found' });
      }
    }

    const createScopeError = validateRecipeCreateScope(for_outlet_id, req.outletScope);
    if (createScopeError) {
      return res.status(403).json({ success: false, message: createScopeError });
    }

    const activeFrom = effective_from || new Date().toISOString().split('T')[0];
    const activeStatus = status || 'Draft';

    // Effective date and overlap protection
    if (activeStatus === 'Active') {
      if (!effective_from) {
        return res.status(400).json({ success: false, message: 'Effective from date is required for Active recipes' });
      }
      if (effective_to && new Date(effective_to) < new Date(activeFrom)) {
        return res.status(400).json({ success: false, message: 'Effective to cannot be before effective from' });
      }
      const overlap = await findOverlappingEffective({
        menu_item_id,
        output_raw_material_id,
        for_outlet_id: for_outlet_id || null,
        effective_from: activeFrom,
        effective_to,
        exclude_id: null,
      });
      if (overlap) {
        return res.status(409).json({ success: false, message: 'Another recipe version is already effective for this menu item/output, outlet and date range.' });
      }
      const circular = await validateNoCircularDependency(output_raw_material_id, for_outlet_id || null, items.map((it) => it.raw_material_id), activeFrom);
      if (!circular) {
        return res.status(400).json({ success: false, message: 'Circular SOP dependency detected.' });
      }
    }

    const version = await getNextVersion(menu_item_id, output_raw_material_id, for_outlet_id);
    const code = recipe_code || `R${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const connection = await getConnection();
    try {
      await connection.beginTransaction();

      const [recipesResult] = await connection.execute(
        `INSERT INTO recipes (
          menu_item_id, output_raw_material_id, recipe_name, recipe_code, recipe_category, recipe_type,
          for_outlet_id, portion, yield_qty, yield_unit_id, serving_size, serving_unit_id,
          prep_time, cooking_time, finishing_time, effective_from, effective_to, status,
          version_no, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          menu_item_id || null, output_raw_material_id || null, recipe_name, code, recipe_category || 'Beverages', type,
          for_outlet_id || null, portion || null, num(yield_qty) || 1, yield_unit_id || null, num(serving_size) || 1, serving_unit_id || null,
          num(prep_time), num(cooking_time), num(finishing_time), activeFrom, effective_to || null, activeStatus,
          version, notes || null, req.user.id
        ]
      );

      const recipeId = recipesResult.insertId;
      const runOnConn = async (sql, params) => {
        const [r] = await connection.execute(sql, params);
        return r;
      };
      await insertRecipeItems(runOnConn, recipeId, items, req.user.id);

      if (activeStatus === 'Active') {
        const [newRecipe] = await connection.execute('SELECT * FROM recipes WHERE id = ?', [recipeId]);
        const newItems = await query('SELECT * FROM recipe_items WHERE recipe_id = ?', [recipeId]);
        await writeRecipeVersionSnapshot(newRecipe[0], newItems, req.user.id);
      }

      await connection.commit();
      res.status(201).json({ success: true, message: 'Recipe created successfully', data: { id: recipeId } });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('POST /recipes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', protect, applyOutletScope, checkPermission('add_recipe', 'can_edit'), loadRecipeRecord, async (req, res) => {
  try {
    const b = req.body;
    const recipeId = Number(req.params.id);
    const existing = req.record;

    if (!isEditableStatus(existing.status)) return res.status(400).json({ success: false, message: `Cannot edit recipe with status "${existing.status}"` });

    const { menu_item_id, recipe_name, recipe_code, recipe_category, recipe_type, for_outlet_id, portion, yield_qty, yield_unit_id, serving_size, serving_unit_id, prep_time, cooking_time, finishing_time, effective_from, effective_to, status, notes, items } = b;

    if (!menu_item_id || !recipe_name) {
      return res.status(400).json({ success: false, message: 'Menu item and recipe name are required' });
    }

    const itemError = validateRecipeItems(items);
    if (itemError) return res.status(400).json({ success: false, message: itemError });

    const menuItem = (await query('SELECT is_active FROM menu_items WHERE id = ?', [menu_item_id]))[0];
    if (!menuItem) return res.status(400).json({ success: false, message: 'Menu item not found' });

    if (String(for_outlet_id) === 'all') {
      return res.status(400).json({ success: false, message: 'Invalid outlet selection' });
    }

    // Prevent moving from an authorized outlet to an unauthorized one
    const newOutletId = for_outlet_id ? Number(for_outlet_id) : null;
    if (newOutletId !== existing.for_outlet_id) {
      const createScopeError = validateRecipeCreateScope(for_outlet_id, req.outletScope);
      if (createScopeError) return res.status(403).json({ success: false, message: createScopeError });
    }

    const activeFrom = effective_from || existing.effective_from;
    const activeTo = effective_to !== undefined ? effective_to : existing.effective_to;
    const activeStatus = status || existing.status;

    if (activeStatus === 'Active' && !menuItem.is_active) {
      return res.status(400).json({ success: false, message: 'Cannot activate a recipe for an inactive menu item' });
    }

    if (activeStatus === 'Active') {
      // findConflictingActive only checked whether the new effective_from fell
      // inside an existing Active recipe's range - it never compared the new
      // recipe's effective_to against ranges that start later, so editing a
      // recipe to Active could create two simultaneously Active, overlapping
      // recipes (resolveActiveRecipe silently picks one via LIMIT 1, hiding
      // the other). Use the same true interval-overlap check POST / and
      // /:id/activate already use below, for consistency.
      const conflict = await findOverlappingEffective({
        menu_item_id,
        output_raw_material_id: null,
        for_outlet_id: for_outlet_id || null,
        effective_from: activeFrom,
        effective_to: activeTo,
        exclude_id: recipeId,
      });
      if (conflict) {
        return res.status(409).json({ success: false, message: 'Another recipe version is already effective for this menu item, outlet and date range. Deactivate it first.' });
      }
    }

    const safeOutletId = for_outlet_id !== undefined ? (for_outlet_id || null) : existing.for_outlet_id;

    const connection = await getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE recipes SET
          menu_item_id = ?, recipe_name = ?, recipe_code = ?, recipe_category = ?, recipe_type = ?,
          for_outlet_id = ?, portion = ?, yield_qty = ?, yield_unit_id = ?, serving_size = ?, serving_unit_id = ?,
          prep_time = ?, cooking_time = ?, finishing_time = ?, effective_from = ?, effective_to = ?, status = ?,
          notes = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
        [
          menu_item_id, recipe_name, recipe_code || existing.recipe_code, recipe_category || existing.recipe_category, recipe_type || existing.recipe_type,
          safeOutletId, portion || null, num(yield_qty) || 1, yield_unit_id || null, num(serving_size) || 1, serving_unit_id || null,
          num(prep_time), num(cooking_time), num(finishing_time), activeFrom, effective_to || null, activeStatus,
          notes || null, req.user.id, recipeId
        ]
      );

      await connection.execute('DELETE FROM recipe_items WHERE recipe_id = ?', [recipeId]);

      const runOnConn = async (sql, params) => {
        const [r] = await connection.execute(sql, params);
        return r;
      };
      await insertRecipeItems(runOnConn, recipeId, items, req.user.id);

      await connection.commit();
      res.json({ success: true, message: 'Recipe updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/new-version', protect, applyOutletScope, checkPermission('add_recipe', 'can_create'), loadRecipeRecord, async (req, res) => {
  try {
    const newRecipeId = await createNewVersion(req.record.id, req.user.id);
    res.status(201).json({ success: true, message: 'New version created', data: { id: newRecipeId } });
  } catch (error) {
    console.error('POST /:id/new-version error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/activate', protect, applyOutletScope, checkPermission('add_recipe', 'can_edit'), loadRecipeRecord, async (req, res) => {
  try {
    const existing = req.record;
    const { effective_from, effective_to } = req.body;
    if (!effective_from) {
      return res.status(400).json({ success: false, message: 'Effective from date is required' });
    }
    if (effective_to && new Date(effective_to) < new Date(effective_from)) {
      return res.status(400).json({ success: false, message: 'Effective to cannot be before effective from' });
    }

    const overlap = await findOverlappingEffective({
      menu_item_id: existing.menu_item_id,
      output_raw_material_id: existing.output_raw_material_id,
      for_outlet_id: existing.for_outlet_id,
      effective_from,
      effective_to,
      exclude_id: existing.id,
    });
    if (overlap) {
      return res.status(409).json({ success: false, message: 'Another recipe version is already effective for this menu item, outlet and date range.' });
    }

    const prevRows = await query(
      `SELECT id, effective_from FROM recipes
       WHERE (
         (menu_item_id IS NOT NULL AND menu_item_id = ?)
         OR (output_raw_material_id IS NOT NULL AND output_raw_material_id = ?)
       )
         AND (for_outlet_id = ? OR (for_outlet_id IS NULL AND ? IS NULL))
         AND status = 'Active'
         AND is_deleted = 0
         AND id != ?
         AND (effective_to IS NULL OR effective_to >= ?)`,
      [existing.menu_item_id, existing.output_raw_material_id, existing.for_outlet_id, existing.for_outlet_id, existing.id, effective_from]
    );

    const prevDate = new Date(effective_from);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevTo = prevDate.toISOString().split('T')[0];

    const connection = await getConnection();
    try {
      await connection.beginTransaction();
      for (const prev of prevRows) {
        await connection.execute('UPDATE recipes SET effective_to = ? WHERE id = ?', [prevTo, prev.id]);
      }
      await connection.execute(
        'UPDATE recipes SET status = ?, effective_from = ?, effective_to = ? WHERE id = ?',
        ['Active', effective_from, effective_to || null, existing.id]
      );
      const [activated] = await connection.execute('SELECT * FROM recipes WHERE id = ?', [existing.id]);
      const items = await query('SELECT * FROM recipe_items WHERE recipe_id = ?', [existing.id]);
      await writeRecipeVersionSnapshot(activated[0], items, req.user.id);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    res.json({ success: true, message: 'Version activated', data: { id: existing.id } });
  } catch (error) {
    console.error('POST /:id/activate error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id/versions', protect, applyOutletScope, loadRecipeRecord, async (req, res) => {
  try {
    const history = await getRecipeVersionHistory(req.record.menu_item_id, req.record.for_outlet_id, req.record.output_raw_material_id);
    const currentVersion = Number(req.record.version_no);
    const currentIndex = history.findIndex((h) => Number(h.version_no) === currentVersion);
    if (currentIndex >= 0) {
      history[currentIndex].is_current = true;
    } else {
      history.unshift({
        id: req.record.id,
        menu_item_id: req.record.menu_item_id,
        output_raw_material_id: req.record.output_raw_material_id,
        for_outlet_id: req.record.for_outlet_id,
        version_no: req.record.version_no,
        recipe_data: null,
        created_by: req.record.created_by,
        created_at: req.record.created_at,
        created_by_name: req.user?.full_name || req.user?.name || '-',
        recipe_id: req.record.id,
        status: req.record.status,
        effective_from: req.record.effective_from,
        effective_to: req.record.effective_to,
        is_current: true,
      });
    }
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', protect, applyOutletScope, checkPermission('add_recipe', 'can_delete'), loadRecipeRecord, async (req, res) => {
  try {
    const recipeId = Number(req.params.id);
    const existing = req.record;

    // Only allow hard delete for Draft/test records without historical usage.
    const used = existing.status !== 'Draft' || (await hasHistoricalUsage(recipeId));
    if (used) {
      return res.status(400).json({ success: false, message: 'Recipe cannot be deleted because it is active or has historical usage.' });
    }

    await query('DELETE FROM recipe_items WHERE recipe_id = ?', [recipeId]);
    await query('DELETE FROM recipes WHERE id = ?', [recipeId]);
    res.json({ success: true, message: 'Recipe deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Ingredient persistence ---
async function insertRecipeItems(queryFn, recipeId, items, userId) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rawMaterial = (await query('SELECT unit_id FROM raw_materials WHERE id = ?', [item.raw_material_id]))[0];
    const inventoryUnitId = rawMaterial ? rawMaterial.unit_id : item.unit_id;
    const recipeUnitId = item.recipe_unit_id || item.unit_id;
    const baseUnitId = item.base_unit_id || inventoryUnitId || recipeUnitId;

    if (!recipeUnitId) {
      throw new Error(`Ingredient unit is incomplete for material ${item.raw_material_id}`);
    }

    const factor = await getUomFactor(recipeUnitId, baseUnitId);
    if (factor === null && recipeUnitId !== baseUnitId) {
      throw new Error(`UOM conversion not found from unit ${recipeUnitId} to ${baseUnitId} for material ${item.raw_material_id}`);
    }
    const convFactor = factor !== null ? factor : 1;
    const baseQty = num(item.qty_per_item) * convFactor;
    const wastagePercent = num(item.waste_percentage);
    const standardWastageQty = baseQty * (wastagePercent / 100);
    const netQty = baseQty + standardWastageQty;

    await queryFn(
      `INSERT INTO recipe_items (
        recipe_id, raw_material_id, unit_id, qty_per_item, recipe_unit_id, base_unit_id,
        conversion_factor, base_qty, waste_percentage, standard_wastage_qty, net_qty,
        extra_cost, remarks, display_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        recipeId, item.raw_material_id, recipeUnitId, num(item.qty_per_item), recipeUnitId, baseUnitId,
        convFactor, baseQty, wastagePercent, standardWastageQty, netQty,
        num(item.extra_cost), item.notes || null, i
      ]
    );
  }
}

export default router;
