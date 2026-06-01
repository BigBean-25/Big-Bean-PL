import { query, getConnection } from '../config/database.js';
import { logAudit, logApproval } from '../utils/logger.js';

export const getDailyCashbooks = async (req, res) => {
  try {
    const { outlet_id, start_date, end_date, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND dc.outlet_id = ?';
      params.push(outlet_id);
    }

    if (start_date) {
      whereClause += ' AND dc.date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND dc.date <= ?';
      params.push(end_date);
    }

    if (status) {
      whereClause += ' AND dc.status = ?';
      params.push(status);
    }

    const cashbooks = await query(
      `SELECT dc.*, o.outlet_name, 
              u1.full_name as entered_by_name, 
              u2.full_name as verified_by_name
       FROM daily_cashbooks dc
       LEFT JOIN outlets o ON dc.outlet_id = o.id
       LEFT JOIN users u1 ON dc.entered_by = u1.id
       LEFT JOIN users u2 ON dc.verified_by = u2.id
       WHERE ${whereClause}
       ORDER BY dc.date DESC, dc.outlet_id
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    res.status(200).json({
      success: true,
      data: cashbooks
    });
  } catch (error) {
    console.error('Get daily cashbooks error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching daily cashbooks'
    });
  }
};

export const createDailyCashbook = async (req, res) => {
  try {
    const cashbookData = {
      ...req.body,
      entered_by: req.user.id,
      status: 'Draft'
    };

    const existing = await query(
      'SELECT id FROM daily_cashbooks WHERE date = ? AND outlet_id = ?',
      [cashbookData.date, cashbookData.outlet_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cashbook entry already exists for this date and outlet'
      });
    }

    const totalExpenses = await query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM daily_cash_expenses 
       WHERE date = ? AND outlet_id = ? AND status = 'Approved'`,
      [cashbookData.date, cashbookData.outlet_id]
    );

    cashbookData.cash_expenses = totalExpenses[0].total;

    const fields = Object.keys(cashbookData);
    const values = Object.values(cashbookData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO daily_cashbooks (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'daily_cashbooks', result.insertId, null, cashbookData, 'Created daily cashbook');

    res.status(201).json({
      success: true,
      message: 'Daily cashbook created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create daily cashbook error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating daily cashbook'
    });
  }
};

export const updateDailyCashbook = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM daily_cashbooks WHERE id = ?', [id]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cashbook not found'
      });
    }

    if (existing[0].status === 'Locked') {
      return res.status(403).json({
        success: false,
        message: 'Cannot update locked cashbook'
      });
    }

    const fields = Object.keys(req.body);
    const values = Object.values(req.body);
    const setClause = fields.map(f => `${f} = ?`).join(', ');

    await query(
      `UPDATE daily_cashbooks SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, id]
    );

    await logAudit(req.user.id, 'UPDATE', 'daily_cashbooks', id, existing[0], req.body, 'Updated daily cashbook');

    res.status(200).json({
      success: true,
      message: 'Daily cashbook updated successfully'
    });
  } catch (error) {
    console.error('Update daily cashbook error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating daily cashbook'
    });
  }
};

export const verifyDailyCashbook = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, remarks } = req.body;

    if (!['Verified', 'Rejected'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action'
      });
    }

    await query(
      `UPDATE daily_cashbooks SET status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?`,
      [action, req.user.id, id]
    );

    await logApproval(req.user.id, 'daily_cashbook', id, action, remarks);

    res.status(200).json({
      success: true,
      message: `Cashbook ${action.toLowerCase()} successfully`
    });
  } catch (error) {
    console.error('Verify daily cashbook error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying daily cashbook'
    });
  }
};

export const getDailyCashExpenses = async (req, res) => {
  try {
    const { outlet_id, start_date, end_date, status, page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND dce.outlet_id = ?';
      params.push(outlet_id);
    }

    if (start_date) {
      whereClause += ' AND dce.date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND dce.date <= ?';
      params.push(end_date);
    }

    if (status) {
      whereClause += ' AND dce.status = ?';
      params.push(status);
    }

    const expenses = await query(
      `SELECT dce.*, o.outlet_name, eh.expense_name, pm.mode_name,
              u1.full_name as entered_by_name, 
              u2.full_name as verified_by_name
       FROM daily_cash_expenses dce
       LEFT JOIN outlets o ON dce.outlet_id = o.id
       LEFT JOIN expense_heads eh ON dce.expense_head_id = eh.id
       LEFT JOIN payment_modes pm ON dce.payment_mode_id = pm.id
       LEFT JOIN users u1 ON dce.entered_by = u1.id
       LEFT JOIN users u2 ON dce.verified_by = u2.id
       WHERE ${whereClause}
       ORDER BY dce.date DESC, dce.id DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    res.status(200).json({
      success: true,
      data: expenses
    });
  } catch (error) {
    console.error('Get daily cash expenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching daily cash expenses'
    });
  }
};

export const createDailyCashExpense = async (req, res) => {
  try {
    const expenseData = {
      ...req.body,
      entered_by: req.user.id,
      status: 'Draft',
      proof_attachment: req.file?.path || null
    };

    const fields = Object.keys(expenseData);
    const values = Object.values(expenseData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO daily_cash_expenses (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'daily_cash_expenses', result.insertId, null, expenseData, 'Created daily cash expense');

    res.status(201).json({
      success: true,
      message: 'Daily cash expense created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create daily cash expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating daily cash expense'
    });
  }
};

export const approveDailyCashExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, admin_remarks } = req.body;

    if (!['Approved', 'Rejected'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action'
      });
    }

    await query(
      `UPDATE daily_cash_expenses SET status = ?, verified_by = ?, verified_at = NOW(), admin_remarks = ? WHERE id = ?`,
      [action, req.user.id, admin_remarks, id]
    );

    await logApproval(req.user.id, 'daily_cash_expense', id, action, admin_remarks);

    res.status(200).json({
      success: true,
      message: `Expense ${action.toLowerCase()} successfully`
    });
  } catch (error) {
    console.error('Approve daily cash expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving daily cash expense'
    });
  }
};

export const createBankDeposit = async (req, res) => {
  try {
    const depositData = {
      ...req.body,
      entered_by: req.user.id,
      status: 'Draft',
      proof_attachment: req.file?.path || null
    };

    const fields = Object.keys(depositData);
    const values = Object.values(depositData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO bank_deposits (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'bank_deposits', result.insertId, null, depositData, 'Created bank deposit');

    res.status(201).json({
      success: true,
      message: 'Bank deposit created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create bank deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating bank deposit'
    });
  }
};

export const getDayClosings = async (req, res) => {
  try {
    const { outlet_id, start_date, end_date, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND dc.outlet_id = ?';
      params.push(outlet_id);
    }

    if (start_date) {
      whereClause += ' AND dc.date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND dc.date <= ?';
      params.push(end_date);
    }

    if (status) {
      whereClause += ' AND dc.status = ?';
      params.push(status);
    }

    const closings = await query(
      `SELECT dc.*, o.outlet_name, 
              u1.full_name as submitted_by_name, 
              u2.full_name as verified_by_name
       FROM day_closings dc
       LEFT JOIN outlets o ON dc.outlet_id = o.id
       LEFT JOIN users u1 ON dc.submitted_by = u1.id
       LEFT JOIN users u2 ON dc.verified_by = u2.id
       WHERE ${whereClause}
       ORDER BY dc.date DESC, dc.outlet_id
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    res.status(200).json({
      success: true,
      data: closings
    });
  } catch (error) {
    console.error('Get day closings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching day closings'
    });
  }
};

export const submitDayClosing = async (req, res) => {
  try {
    const closingData = {
      ...req.body,
      submitted_by: req.user.id,
      submitted_at: new Date(),
      status: 'Submitted'
    };

    const existing = await query(
      'SELECT id FROM day_closings WHERE date = ? AND outlet_id = ?',
      [closingData.date, closingData.outlet_id]
    );

    if (existing.length > 0) {
      const fields = Object.keys(closingData);
      const values = Object.values(closingData);
      const setClause = fields.map(f => `${f} = ?`).join(', ');

      await query(
        `UPDATE day_closings SET ${setClause}, updated_at = NOW() WHERE id = ?`,
        [...values, existing[0].id]
      );

      await logAudit(req.user.id, 'UPDATE', 'day_closings', existing[0].id, null, closingData, 'Updated day closing');

      return res.status(200).json({
        success: true,
        message: 'Day closing updated successfully'
      });
    }

    const fields = Object.keys(closingData);
    const values = Object.values(closingData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO day_closings (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'day_closings', result.insertId, null, closingData, 'Created day closing');

    res.status(201).json({
      success: true,
      message: 'Day closing submitted successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Submit day closing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting day closing'
    });
  }
};

export const verifyDayClosing = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!['Verified', 'Rejected', 'Locked'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action'
      });
    }

    await query(
      `UPDATE day_closings SET status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?`,
      [action, req.user.id, id]
    );

    await logApproval(req.user.id, 'day_closing', id, action, null);

    res.status(200).json({
      success: true,
      message: `Day closing ${action.toLowerCase()} successfully`
    });
  } catch (error) {
    console.error('Verify day closing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying day closing'
    });
  }
};
