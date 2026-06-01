import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { query } from '../config/database.js';

const router = express.Router();

router.get('/online', protect, async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (outlet_id) {
      whereClause += ' AND op.outlet_id = ?';
      params.push(outlet_id);
    }
    
    if (month) {
      whereClause += ' AND op.month = ?';
      params.push(month);
    }
    
    if (year) {
      whereClause += ' AND op.year = ?';
      params.push(year);
    }
    
    const payouts = await query(
      `SELECT op.*, o.outlet_name, opl.platform_name
       FROM online_payouts op
       LEFT JOIN outlets o ON op.outlet_id = o.id
       LEFT JOIN online_platforms opl ON op.platform_id = opl.id
       WHERE ${whereClause}
       ORDER BY op.year DESC, op.month DESC`,
      params
    );
    
    res.json({ success: true, data: payouts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/online', protect, authorize('Admin', 'Super Admin'), async (req, res) => {
  try {
    const fields = Object.keys(req.body);
    const values = Object.values(req.body);
    const placeholders = fields.map(() => '?').join(', ');
    
    const result = await query(
      `INSERT INTO online_payouts (${fields.join(', ')}, created_by, created_at) VALUES (${placeholders}, ?, NOW())`,
      [...values, req.user.id]
    );
    
    res.status(201).json({ success: true, message: 'Online payout created successfully', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/online/:id', protect, authorize('Admin', 'Super Admin'), async (req, res) => {
  try {
    const fields = Object.keys(req.body);
    const values = Object.values(req.body);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    
    await query(
      `UPDATE online_payouts SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, req.params.id]
    );
    
    res.json({ success: true, message: 'Online payout updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/online/:id', protect, authorize('Super Admin'), async (req, res) => {
  try {
    await query('DELETE FROM online_payouts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Online payout deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/dine-in', protect, async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (outlet_id) {
      whereClause += ' AND dp.outlet_id = ?';
      params.push(outlet_id);
    }
    
    if (month) {
      whereClause += ' AND dp.month = ?';
      params.push(month);
    }
    
    if (year) {
      whereClause += ' AND dp.year = ?';
      params.push(year);
    }
    
    const payouts = await query(
      `SELECT dp.*, o.outlet_name, dip.portal_name
       FROM dine_in_payouts dp
       LEFT JOIN outlets o ON dp.outlet_id = o.id
       LEFT JOIN dine_in_portals dip ON dp.portal_id = dip.id
       WHERE ${whereClause}
       ORDER BY dp.year DESC, dp.month DESC`,
      params
    );
    
    res.json({ success: true, data: payouts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/dine-in', protect, authorize('Admin', 'Super Admin'), async (req, res) => {
  try {
    const fields = Object.keys(req.body);
    const values = Object.values(req.body);
    const placeholders = fields.map(() => '?').join(', ');
    
    const result = await query(
      `INSERT INTO dine_in_payouts (${fields.join(', ')}, created_by, created_at) VALUES (${placeholders}, ?, NOW())`,
      [...values, req.user.id]
    );
    
    res.status(201).json({ success: true, message: 'Dine-in payout created successfully', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/dine-in/:id', protect, authorize('Admin', 'Super Admin'), async (req, res) => {
  try {
    const fields = Object.keys(req.body);
    const values = Object.values(req.body);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    
    await query(
      `UPDATE dine_in_payouts SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, req.params.id]
    );
    
    res.json({ success: true, message: 'Dine-in payout updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/dine-in/:id', protect, authorize('Super Admin'), async (req, res) => {
  try {
    await query('DELETE FROM dine_in_payouts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Dine-in payout deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
