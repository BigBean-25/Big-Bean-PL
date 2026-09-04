import express from 'express';
import { query } from '../config/database.js';
import { protect, applyOutletScope, loadScopedRecord } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

const num = (v) => Number(v || 0);

// is_approved feeds directly into BOM/recipe costing (raw_material_rates
// WHERE is_approved = 1) but create/update used to take it straight from the
// client with no separate check - anyone with raw_materials.can_create/
// can_edit (e.g. Warehouse Admin, which has neither can_approve nor a
// finance-facing role) could self-approve a cost rate outright. No role
// currently has an explicit can_approve grant on raw_materials except the
// full-access sweep (Super Admin/Admin/Developer), so this only actually
// restricts non-full-access roles - the same set that shouldn't be able to
// approve their own rate today anyway.
const canApproveRate = async (req) => {
  const rows = await query('SELECT can_approve FROM role_permissions WHERE role_id = ? AND module_key = ?', [req.user.role_id, 'raw_materials']);
  return Boolean(rows[0]?.can_approve);
};

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
    const wantsApproved = is_approved === 1 || is_approved === true;
    const approved = wantsApproved && (await canApproveRate(req)) ? 1 : 0;
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
    // A caller without can_approve can't grant OR revoke approval - preserve
    // both the record's current status and its original approver untouched,
    // rather than forcing it to false (which would silently un-approve a
    // rate on an unrelated edit, e.g. fixing a typo) or crediting the
    // approval to whoever happens to edit the record next.
    const wantsApproved = is_approved === 1 || is_approved === true;
    const mayApprove = await canApproveRate(req);
    const approved = mayApprove ? (wantsApproved ? 1 : 0) : Number(req.record.is_approved) || 0;
    const approvedBy = mayApprove ? (approved ? req.user.id : null) : (req.record.approved_by || null);
    await query(
      'UPDATE raw_material_rates SET raw_material_id = ?, outlet_id = ?, rate = ?, effective_from = ?, is_approved = ?, approved_by = ? WHERE id = ?',
      [raw_material_id, outlet_id || null, num(rate), effective_from, approved, approvedBy, req.params.id]
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
