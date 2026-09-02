import { query } from '../config/database.js';
import { logAudit } from '../utils/logger.js';

const assertMonthEditable = async (outletId, month, year) => {
  const rows = await query(
    'SELECT is_finalized FROM monthly_pnl_snapshots WHERE outlet_id = ? AND month = ? AND year = ?',
    [outletId, month, year]
  );
  if (rows.length > 0 && rows[0].is_finalized) {
    const err = new Error('This month is finalized for this outlet — fixed costs can no longer be edited');
    err.statusCode = 400;
    throw err;
  }
};

export const getFixedCosts = async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND fc.outlet_id = ?';
      params.push(outlet_id);
    }
    if (month) {
      whereClause += ' AND fc.month = ?';
      params.push(month);
    }
    if (year) {
      whereClause += ' AND fc.year = ?';
      params.push(year);
    }

    const rows = await query(
      `SELECT fc.*, o.outlet_name, u.full_name as created_by_name
       FROM outlet_fixed_costs fc
       LEFT JOIN outlets o ON fc.outlet_id = o.id
       LEFT JOIN users u ON fc.created_by = u.id
       WHERE ${whereClause}
       ORDER BY fc.year DESC, fc.month DESC, fc.category`,
      params
    );

    const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    res.status(200).json({ success: true, data: rows, total });
  } catch (error) {
    console.error('Get fixed costs error:', error);
    res.status(500).json({ success: false, message: 'Error fetching fixed costs' });
  }
};

export const createFixedCost = async (req, res) => {
  try {
    const { outlet_id, month, year, category, amount, remarks } = req.body;

    if (!outlet_id || !month || !year || !category || amount === undefined) {
      return res.status(400).json({ success: false, message: 'Outlet, month, year, category and amount are required' });
    }

    await assertMonthEditable(outlet_id, month, year);

    const existing = await query(
      'SELECT id FROM outlet_fixed_costs WHERE outlet_id = ? AND month = ? AND year = ? AND category = ?',
      [outlet_id, month, year, category]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'A fixed cost entry for this outlet/month/category already exists — edit it instead' });
    }

    const result = await query(
      `INSERT INTO outlet_fixed_costs (outlet_id, month, year, category, amount, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [outlet_id, month, year, category, amount, remarks || null, req.user.id]
    );

    await logAudit(req.user.id, 'CREATE', 'outlet_fixed_costs', result.insertId, null, req.body, 'Created fixed cost entry');

    res.status(201).json({ success: true, message: 'Fixed cost entry created', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create fixed cost error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error creating fixed cost entry' });
  }
};

export const updateFixedCost = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, remarks, category } = req.body;

    const existing = await query('SELECT * FROM outlet_fixed_costs WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Fixed cost entry not found' });
    }

    const record = existing[0];
    await assertMonthEditable(record.outlet_id, record.month, record.year);

    const updateData = {};
    if (amount !== undefined) updateData.amount = amount;
    if (remarks !== undefined) updateData.remarks = remarks;
    if (category !== undefined) updateData.category = category;
    updateData.updated_by = req.user.id;

    const fields = Object.keys(updateData);
    const values = Object.values(updateData);
    const setClause = fields.map((f) => `${f} = ?`).join(', ');

    await query(`UPDATE outlet_fixed_costs SET ${setClause}, updated_at = NOW() WHERE id = ?`, [...values, id]);

    await logAudit(req.user.id, 'UPDATE', 'outlet_fixed_costs', id, record, updateData, 'Updated fixed cost entry');

    res.status(200).json({ success: true, message: 'Fixed cost entry updated' });
  } catch (error) {
    console.error('Update fixed cost error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error updating fixed cost entry' });
  }
};

export const deleteFixedCost = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM outlet_fixed_costs WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Fixed cost entry not found' });
    }

    const record = existing[0];
    await assertMonthEditable(record.outlet_id, record.month, record.year);

    await query('DELETE FROM outlet_fixed_costs WHERE id = ?', [id]);

    await logAudit(req.user.id, 'DELETE', 'outlet_fixed_costs', id, record, null, 'Deleted fixed cost entry');

    res.status(200).json({ success: true, message: 'Fixed cost entry deleted' });
  } catch (error) {
    console.error('Delete fixed cost error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error deleting fixed cost entry' });
  }
};
