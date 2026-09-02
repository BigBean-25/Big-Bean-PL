import express from 'express';
import { query } from '../config/database.js';
import { protect, applyOutletScope, loadScopedRecord } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

const num = (v) => Number(v || 0);

// List rates for a material (and optionally outlet)
router.get('/', protect, applyOutletScope, async (req, res) => {
  try {
    const { raw_material_id } = req.query;
    const scope = req.outletScope;
    let sql = `SELECT r.*, o.outlet_name, u.full_name as approved_by_name
               FROM raw_material_rates r
               LEFT JOIN outlets o ON o.id = r.outlet_id
               LEFT JOIN users u ON u.id = r.approved_by
               WHERE 1=1`;
    const params = [];
    if (raw_material_id) {
      sql += ' AND r.raw_material_id = ?';
      params.push(raw_material_id);
    }
    if (!scope.all) {
      if (scope.outletIds.length > 0) {
        const placeholders = scope.outletIds.map(() => '?').join(',');
        sql += ` AND (r.outlet_id IN (${placeholders}) OR r.outlet_id IS NULL)`;
        params.push(...scope.outletIds);
      } else {
        sql += ' AND 1=0';
      }
    }
    sql += ' ORDER BY r.effective_from DESC, r.is_approved DESC, r.outlet_id DESC';
    const rows = await query(sql, params);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Get material rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch material rates' });
  }
});

// Get one rate
router.get('/:id', protect, applyOutletScope, loadScopedRecord('raw_material_rates'), async (req, res) => {
  try {
    const rows = await query(
      `SELECT r.*, o.outlet_name, u.full_name as approved_by_name
       FROM raw_material_rates r
       LEFT JOIN outlets o ON o.id = r.outlet_id
       LEFT JOIN users u ON u.id = r.approved_by
       WHERE r.id = ?`,
      [req.params.id]
    );
    res.status(200).json({ success: true, data: rows[0] || req.record });
  } catch (error) {
    console.error('Get material rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch material rate' });
  }
});

// Create rate
router.post('/', protect, applyOutletScope, checkPermission('raw_materials', 'can_create'), async (req, res) => {
  try {
    const { raw_material_id, outlet_id, rate, effective_from, is_approved } = req.body;
    if (!raw_material_id) return res.status(400).json({ success: false, message: 'Material is required' });
    if (rate === undefined || rate === null || rate === '') return res.status(400).json({ success: false, message: 'Rate is required' });
    if (!effective_from) return res.status(400).json({ success: false, message: 'Effective from is required' });
    const approved = is_approved === 1 || is_approved === true ? 1 : 0;
    const result = await query(
      'INSERT INTO raw_material_rates (raw_material_id, outlet_id, rate, effective_from, is_approved, approved_by, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [raw_material_id, outlet_id || null, num(rate), effective_from, approved, approved ? req.user.id : null, req.user.id]
    );
    res.status(201).json({ success: true, message: 'Rate created successfully', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create material rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to create material rate' });
  }
});

// Update rate
router.put('/:id', protect, applyOutletScope, loadScopedRecord('raw_material_rates'), checkPermission('raw_materials', 'can_edit'), async (req, res) => {
  try {
    const { raw_material_id, outlet_id, rate, effective_from, is_approved } = req.body;
    if (!raw_material_id) return res.status(400).json({ success: false, message: 'Material is required' });
    if (rate === undefined || rate === null || rate === '') return res.status(400).json({ success: false, message: 'Rate is required' });
    if (!effective_from) return res.status(400).json({ success: false, message: 'Effective from is required' });
    const approved = is_approved === 1 || is_approved === true ? 1 : 0;
    await query(
      'UPDATE raw_material_rates SET raw_material_id = ?, outlet_id = ?, rate = ?, effective_from = ?, is_approved = ?, approved_by = ? WHERE id = ?',
      [raw_material_id, outlet_id || null, num(rate), effective_from, approved, approved ? req.user.id : null, req.params.id]
    );
    res.status(200).json({ success: true, message: 'Rate updated successfully' });
  } catch (error) {
    console.error('Update material rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to update material rate' });
  }
});

// Delete rate
router.delete('/:id', protect, applyOutletScope, loadScopedRecord('raw_material_rates'), checkPermission('raw_materials', 'can_delete'), async (req, res) => {
  try {
    await query('DELETE FROM raw_material_rates WHERE id = ?', [req.params.id]);
    res.status(200).json({ success: true, message: 'Rate deleted successfully' });
  } catch (error) {
    console.error('Delete material rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete material rate' });
  }
});

export default router;
