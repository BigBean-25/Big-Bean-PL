import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { query } from '../config/database.js';

const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const { menu_item_id, status } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (menu_item_id) {
      whereClause += ' AND r.menu_item_id = ?';
      params.push(menu_item_id);
    }
    
    if (status) {
      whereClause += ' AND r.status = ?';
      params.push(status);
    }
    
    const recipes = await query(
      `SELECT r.*, mi.item_name, mi.item_code
       FROM recipes r
       LEFT JOIN menu_items mi ON r.menu_item_id = mi.id
       WHERE ${whereClause}
       ORDER BY r.id DESC`,
      params
    );
    
    res.json({ success: true, data: recipes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const recipes = await query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    
    if (recipes.length === 0) {
      return res.status(404).json({ success: false, message: 'Recipe not found' });
    }
    
    const items = await query(
      `SELECT ri.*, rm.material_name, rm.material_code, u.unit_name
       FROM recipe_items ri
       LEFT JOIN raw_materials rm ON ri.raw_material_id = rm.id
       LEFT JOIN units u ON ri.unit_id = u.id
       WHERE ri.recipe_id = ?`,
      [req.params.id]
    );
    
    res.json({ success: true, data: { ...recipes[0], items } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', protect, authorize('Admin', 'Super Admin'), async (req, res) => {
  try {
    const { menu_item_id, recipe_category, for_outlet_id, portion, prep_time, cooking_time, finishing_time, items } = req.body;
    
    const result = await query(
      `INSERT INTO recipes (menu_item_id, recipe_category, for_outlet_id, portion, prep_time, cooking_time, finishing_time, status, version_no, effective_from, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', 1, CURDATE(), ?, NOW())`,
      [menu_item_id, recipe_category, for_outlet_id, portion, prep_time, cooking_time, finishing_time, req.user.id]
    );
    
    const recipeId = result.insertId;
    
    if (items && items.length > 0) {
      for (const item of items) {
        await query(
          `INSERT INTO recipe_items (recipe_id, raw_material_id, qty_per_item, unit_id, waste_percentage, extra_cost, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [recipeId, item.raw_material_id, item.qty_per_item, item.unit_id, item.waste_percentage || 0, item.extra_cost || 0, item.remarks]
        );
      }
    }
    
    res.status(201).json({ success: true, message: 'Recipe created successfully', data: { id: recipeId } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', protect, authorize('Admin', 'Super Admin'), async (req, res) => {
  try {
    const { menu_item_id, recipe_category, for_outlet_id, portion, prep_time, cooking_time, finishing_time, status, items } = req.body;
    
    await query(
      `UPDATE recipes SET menu_item_id = ?, recipe_category = ?, for_outlet_id = ?, portion = ?, prep_time = ?, cooking_time = ?, finishing_time = ?, status = ?, updated_at = NOW() WHERE id = ?`,
      [menu_item_id, recipe_category, for_outlet_id, portion, prep_time, cooking_time, finishing_time, status, req.params.id]
    );
    
    await query('DELETE FROM recipe_items WHERE recipe_id = ?', [req.params.id]);
    
    if (items && items.length > 0) {
      for (const item of items) {
        await query(
          `INSERT INTO recipe_items (recipe_id, raw_material_id, qty_per_item, unit_id, waste_percentage, extra_cost, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.params.id, item.raw_material_id, item.qty_per_item, item.unit_id, item.waste_percentage || 0, item.extra_cost || 0, item.remarks]
        );
      }
    }
    
    res.json({ success: true, message: 'Recipe updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', protect, authorize('Super Admin'), async (req, res) => {
  try {
    await query('DELETE FROM recipe_items WHERE recipe_id = ?', [req.params.id]);
    await query('DELETE FROM recipes WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Recipe deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
