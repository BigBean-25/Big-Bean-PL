import fs from 'fs';
import path from 'path';
import { query, getConnection } from '../config/database.js';
import { assertSafeColumnNames } from '../utils/validators.js';
import { assertDateEditable } from '../utils/periodLock.js';
import { logAudit, logApproval } from '../utils/logger.js';
import { notifyAdmins, notifyUser } from '../utils/notificationService.js';

const toISOLocal = (value) => {
  if (!value) return null;
  const d = new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeBankDepositDate = (row) => {
  if (row && row.date) {
    const iso = toISOLocal(row.date);
    if (iso) row.date = iso;
  }
  if (row && row.status === 'Rejected' && row.remarks) {
    const marker = 'Rejection reason:';
    const idx = row.remarks.indexOf(marker);
    if (idx !== -1) {
      row.rejection_reason = row.remarks.substring(idx + marker.length).trim();
    }
  }
  return row;
};

const normalizeUploadPath = (filePath) => {
  if (!filePath) return null;
  return String(filePath).replace(/\\/g, '/');
};

const normalizeExpenseDate = (row) => row ? { ...row, date: toISOLocal(row.date) } : null;

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
    const {
      total_sales,
      closing_cash,
      cash_difference,
      verified_by,
      verified_at,
      locked_by,
      locked_at,
      submitted_by,
      submitted_at,
      status,
      ...body
    } = req.body;

    const cashbookData = {
      ...body,
      entered_by: req.user.id,
      status: 'Draft'
    };

    if (!cashbookData.date || !cashbookData.outlet_id) {
      return res.status(400).json({
        success: false,
        message: 'Date and outlet are required'
      });
    }

    await assertDateEditable(cashbookData.outlet_id, cashbookData.date, 'A cashbook');

    const existing = await query(
      'SELECT id FROM daily_cashbooks WHERE date = ? AND outlet_id = ?',
      [cashbookData.date, cashbookData.outlet_id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Daily Cashbook already exists for this outlet and date'
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
    assertSafeColumnNames(fields);
    const values = Object.values(cashbookData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO daily_cashbooks (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'daily_cashbooks', result.insertId, null, cashbookData, 'Created daily cashbook');

    await notifyAdmins({
      actorId: req.user.id,
      outletId: cashbookData.outlet_id,
      type: 'info',
      title: 'Cashbook Created',
      message: `A daily cashbook has been created for ${cashbookData.date}.`,
      referenceType: 'cashbook',
      referenceId: result.insertId,
      navPath: '/daily-accounts/cashbook'
    });

    res.status(201).json({
      success: true,
      message: 'Daily cashbook created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create daily cashbook error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Daily Cashbook already exists for this outlet and date'
      });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating daily cashbook'
    });
  }
};

export const updateDailyCashbook = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = req.record || (await query('SELECT * FROM daily_cashbooks WHERE id = ?', [id]))[0];

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Cashbook not found'
      });
    }

    if (existing.status === 'Locked') {
      return res.status(403).json({
        success: false,
        message: 'Cannot update locked cashbook'
      });
    }

    if (!['Draft', 'Rejected'].includes(existing.status)) {
      return res.status(403).json({
        success: false,
        message: 'Only Draft or Rejected cashbooks can be edited'
      });
    }

    await assertDateEditable(existing.outlet_id, existing.date, 'A cashbook');

    const {
      total_sales,
      closing_cash,
      cash_difference,
      verified_by,
      verified_at,
      locked_by,
      locked_at,
      submitted_by,
      submitted_at,
      entered_by,
      status,
      date,
      outlet_id,
      ...body
    } = req.body;

    const updateData = { ...body };

    // Business key and status cannot be changed through an edit.
    if (date !== undefined || outlet_id !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'Date and outlet cannot be changed. Create a new cashbook instead.'
      });
    }

    // cash_expenses is the single source of truth from approved daily_cash_expenses.
    const totalExpenses = await query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM daily_cash_expenses 
       WHERE date = ? AND outlet_id = ? AND status = 'Approved'`,
      [existing.date, existing.outlet_id]
    );

    updateData.cash_expenses = totalExpenses[0].total;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    const fields = Object.keys(updateData);
    assertSafeColumnNames(fields);
    const values = Object.values(updateData);
    const setClause = fields.map(f => `${f} = ?`).join(', ');

    await query(
      `UPDATE daily_cashbooks SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, id]
    );

    const [updated] = await query('SELECT * FROM daily_cashbooks WHERE id = ?', [id]);

    await logAudit(req.user.id, 'UPDATE', 'daily_cashbooks', id, existing, updateData, 'Updated daily cashbook');

    res.status(200).json({
      success: true,
      message: 'Daily cashbook updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Update daily cashbook error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
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

    const conn = await getConnection();
    let existing, updated;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT * FROM daily_cashbooks WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Cashbook not found' });
      }
      existing = rows[0];

      if (existing.status !== 'Submitted') {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Cashbook must be Submitted before it can be verified or rejected'
        });
      }

      if (Number(existing.entered_by) === Number(req.user.id)) {
        await conn.rollback();
        return res.status(403).json({ success: false, message: 'Users cannot verify their own cashbook' });
      }

      const fieldsToSet = ['status = ?'];
      const params = [action];

      if (action === 'Verified') {
        if ('verified_by' in existing) {
          fieldsToSet.push('verified_by = ?');
          params.push(req.user.id);
        }
        if ('verified_at' in existing) {
          fieldsToSet.push('verified_at = NOW()');
        }
      }

      await conn.execute(
        `UPDATE daily_cashbooks SET ${fieldsToSet.join(', ')} WHERE id = ?`,
        [...params, id]
      );

      const [updatedRows] = await conn.execute('SELECT * FROM daily_cashbooks WHERE id = ?', [id]);
      updated = updatedRows[0];
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    await logApproval(req.user.id, 'daily_cashbook', id, action, remarks);
    await logAudit(req.user.id, action === 'Verified' ? 'VERIFY' : 'REJECT', 'daily_cashbooks', id, existing, updated, `${action} daily cashbook`);

    await notifyUser({
      userId: existing.entered_by,
      outletId: existing.outlet_id,
      type: action === 'Verified' ? 'success' : 'warning',
      title: `Cashbook ${action}`,
      message: `Your cashbook for ${existing.date} has been ${action.toLowerCase()}.`,
      referenceType: 'cashbook',
      referenceId: id,
      navPath: '/daily-accounts/cashbook'
    });

    res.status(200).json({
      success: true,
      message: `Cashbook ${action.toLowerCase()} successfully`,
      data: updated
    });
  } catch (error) {
    console.error('Verify daily cashbook error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying daily cashbook'
    });
  }
};

export const submitDailyCashbook = async (req, res) => {
  try {
    const { id } = req.params;
    const conn = await getConnection();
    let existing, updated;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT * FROM daily_cashbooks WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Cashbook not found' });
      }
      existing = rows[0];

      if (!['Draft', 'Rejected'].includes(existing.status)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Only Draft or Rejected cashbooks can be submitted'
        });
      }

      if (!existing.date || !existing.outlet_id) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Date and outlet are required'
        });
      }

      const fieldsToSet = ['status = ?'];
      const params = ['Submitted'];

      if ('submitted_by' in existing) {
        fieldsToSet.push('submitted_by = ?');
        params.push(req.user.id);
      }
      if ('submitted_at' in existing) {
        fieldsToSet.push('submitted_at = NOW()');
      }

      await conn.execute(
        `UPDATE daily_cashbooks SET ${fieldsToSet.join(', ')} WHERE id = ?`,
        [...params, id]
      );

      const [updatedRows] = await conn.execute('SELECT * FROM daily_cashbooks WHERE id = ?', [id]);
      updated = updatedRows[0];
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    await logAudit(req.user.id, 'SUBMIT', 'daily_cashbooks', id, existing, updated, 'Submitted daily cashbook');

    await notifyAdmins({
      actorId: req.user.id,
      outletId: existing.outlet_id,
      type: 'info',
      title: 'Cashbook Submitted',
      message: `A daily cashbook has been submitted for ${existing.date}.`,
      referenceType: 'cashbook',
      referenceId: id,
      navPath: '/daily-accounts/cashbook'
    });

    res.status(200).json({
      success: true,
      message: 'Daily cashbook submitted successfully',
      data: updated
    });
  } catch (error) {
    console.error('Submit daily cashbook error:', error);
    res.status(500).json({ success: false, message: 'Error submitting daily cashbook' });
  }
};

export const lockDailyCashbook = async (req, res) => {
  try {
    const { id } = req.params;
    const { lock_reason } = req.body;
    const conn = await getConnection();
    let existing, updated;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT * FROM daily_cashbooks WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Cashbook not found' });
      }
      existing = rows[0];

      if (existing.status !== 'Verified') {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Only Verified cashbooks can be locked'
        });
      }

      const fieldsToSet = ['status = ?'];
      const params = ['Locked'];

      if ('locked_by' in existing) {
        fieldsToSet.push('locked_by = ?');
        params.push(req.user.id);
      }
      if ('locked_at' in existing) {
        fieldsToSet.push('locked_at = NOW()');
      }
      if ('lock_reason' in existing && lock_reason !== undefined) {
        fieldsToSet.push('lock_reason = ?');
        params.push(lock_reason);
      }

      await conn.execute(
        `UPDATE daily_cashbooks SET ${fieldsToSet.join(', ')} WHERE id = ?`,
        [...params, id]
      );

      const [updatedRows] = await conn.execute('SELECT * FROM daily_cashbooks WHERE id = ?', [id]);
      updated = updatedRows[0];
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    await logAudit(req.user.id, 'LOCK', 'daily_cashbooks', id, existing, updated, 'Locked daily cashbook');

    res.status(200).json({
      success: true,
      message: 'Daily cashbook locked successfully',
      data: updated
    });
  } catch (error) {
    console.error('Lock daily cashbook error:', error);
    res.status(500).json({ success: false, message: 'Error locking daily cashbook' });
  }
};

export const getCashbookSummary = async (req, res) => {
  try {
    const { outlet_id, date } = req.query;

    if (!outlet_id || !date) {
      return res.status(400).json({
        success: false,
        message: 'outlet_id and date are required'
      });
    }

    const [existing] = await query(
      'SELECT id, status, total_sales, closing_cash, cash_difference FROM daily_cashbooks WHERE outlet_id = ? AND date = ?',
      [outlet_id, date]
    );

    const approvedExpenses = await query(
      `SELECT COALESCE(SUM(amount), 0) as approved_cash_expenses
       FROM daily_cash_expenses
       WHERE outlet_id = ? AND date = ? AND status = 'Approved'`,
      [outlet_id, date]
    );

    res.status(200).json({
      success: true,
      data: {
        outlet_id,
        date,
        approved_cash_expenses: approvedExpenses[0].approved_cash_expenses,
        existing_cashbook: existing || null
      }
    });
  } catch (error) {
    console.error('Get cashbook summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cashbook summary'
    });
  }
};

export const deleteDailyCashbook = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = req.record || (await query('SELECT * FROM daily_cashbooks WHERE id = ?', [id]))[0];

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Cashbook not found' });
    }

    if (!['Draft', 'Rejected'].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        message: 'Submitted, verified or locked cashbooks cannot be deleted'
      });
    }

    await logAudit(req.user.id, 'DELETE', 'daily_cashbooks', id, existing, null, 'Deleted daily cashbook');

    await query('DELETE FROM daily_cashbooks WHERE id = ?', [id]);

    res.status(200).json({ success: true, message: 'Daily cashbook deleted successfully' });
  } catch (error) {
    console.error('Delete daily cashbook error:', error);
    res.status(500).json({ success: false, message: 'Error deleting daily cashbook' });
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
      data: expenses.map(normalizeExpenseDate)
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
    const { date, outlet_id, expense_head_id, amount, payment_mode_id, paid_to, description, raw_material_id, material_qty } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Valid date is required (YYYY-MM-DD)' });
    }
    if (!outlet_id) {
      return res.status(400).json({ success: false, message: 'Outlet is required' });
    }
    if (!expense_head_id) {
      return res.status(400).json({ success: false, message: 'Expense head is required' });
    }
    if (!payment_mode_id) {
      return res.status(400).json({ success: false, message: 'Payment mode is required' });
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    const [outlet] = await query('SELECT id FROM outlets WHERE id = ? AND is_active = 1', [outlet_id]);
    if (!outlet) {
      return res.status(400).json({ success: false, message: 'Outlet not found or inactive' });
    }

    await assertDateEditable(outlet_id, date, 'A cash expense');

    const [head] = await query('SELECT id, is_raw_material_category FROM expense_heads WHERE id = ? AND is_active = 1', [expense_head_id]);
    if (!head) {
      return res.status(400).json({ success: false, message: 'Expense head not found or inactive' });
    }

    const [mode] = await query('SELECT id FROM payment_modes WHERE id = ? AND is_active = 1', [payment_mode_id]);
    if (!mode) {
      return res.status(400).json({ success: false, message: 'Payment mode not found or inactive' });
    }

    // Raw-material-flagged heads (e.g. "Raw Material") require picking a real
    // raw material + quantity so approval can create a proper purchase record
    // (see approveDailyCashExpense). Any other head ignores/clears these -
    // switching categories shouldn't leave stale linkage fields behind.
    let finalRawMaterialId = null;
    let finalMaterialQty = null;
    if (Number(head.is_raw_material_category) === 1) {
      if (!raw_material_id) {
        return res.status(400).json({ success: false, message: 'Please select a raw material' });
      }
      const parsedQty = Number(material_qty);
      if (material_qty === undefined || material_qty === null || material_qty === '' || !Number.isFinite(parsedQty) || parsedQty <= 0) {
        return res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
      }
      const [material] = await query('SELECT id, unit_id FROM raw_materials WHERE id = ? AND is_active = 1', [raw_material_id]);
      if (!material) {
        return res.status(400).json({ success: false, message: 'Raw material not found or inactive' });
      }
      finalRawMaterialId = raw_material_id;
      finalMaterialQty = parsedQty;
    }

    const proofAttachment = req.file ? normalizeUploadPath(req.file.path) : null;

    const result = await query(
      `INSERT INTO daily_cash_expenses
       (date, outlet_id, expense_head_id, raw_material_id, material_qty, amount, payment_mode_id, paid_to, description, proof_attachment, entered_by, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [date, outlet_id, expense_head_id, finalRawMaterialId, finalMaterialQty, parsedAmount, payment_mode_id, paid_to || null, description || null, proofAttachment, req.user.id, 'Draft']
    );

    const [created] = await query(
      `SELECT dce.*, o.outlet_name, eh.expense_name, pm.mode_name,
              u1.full_name as entered_by_name, u2.full_name as verified_by_name
       FROM daily_cash_expenses dce
       LEFT JOIN outlets o ON dce.outlet_id = o.id
       LEFT JOIN expense_heads eh ON dce.expense_head_id = eh.id
       LEFT JOIN payment_modes pm ON dce.payment_mode_id = pm.id
       LEFT JOIN users u1 ON dce.entered_by = u1.id
       LEFT JOIN users u2 ON dce.verified_by = u2.id
       WHERE dce.id = ?`,
      [result.insertId]
    );

    await logAudit(req.user.id, 'CREATE', 'daily_cash_expenses', result.insertId, null, created, 'Created daily cash expense');

    await notifyAdmins({
      actorId: req.user.id,
      outletId: outlet_id,
      type: 'info',
      title: 'Draft Expense Created',
      message: `A cash expense draft of ₹${parsedAmount} has been created for ${date}.`,
      referenceType: 'expense',
      referenceId: result.insertId,
      navPath: '/daily-accounts/expenses'
    });

    res.status(201).json({
      success: true,
      message: 'Daily cash expense created successfully',
      data: normalizeExpenseDate(created)
    });
  } catch (error) {
    console.error('Create daily cash expense error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating daily cash expense'
    });
  }
};

export const createDailyCashExpensesBatch = async (req, res) => {
  try {
    const { date, outlet_id, items } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Valid date is required (YYYY-MM-DD)' });
    }
    if (!outlet_id) {
      return res.status(400).json({ success: false, message: 'Outlet is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one expense item is required' });
    }

    const [outlet] = await query('SELECT id FROM outlets WHERE id = ? AND is_active = 1', [outlet_id]);
    if (!outlet) {
      return res.status(400).json({ success: false, message: 'Outlet not found or inactive' });
    }

    await assertDateEditable(outlet_id, date, 'A cash expense');

    // Validate every row up front so a bad row further down the list fails
    // the whole batch before anything is inserted, rather than leaving a
    // partial set of drafts behind.
    const validatedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const rowLabel = `Item ${i + 1}`;
      const { expense_head_id, amount, payment_mode_id, paid_to, description, raw_material_id, material_qty } = item;

      if (!expense_head_id) {
        return res.status(400).json({ success: false, message: `${rowLabel}: expense head is required` });
      }
      if (!payment_mode_id) {
        return res.status(400).json({ success: false, message: `${rowLabel}: payment mode is required` });
      }
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: `${rowLabel}: amount must be greater than 0` });
      }

      const [head] = await query('SELECT id, is_raw_material_category FROM expense_heads WHERE id = ? AND is_active = 1', [expense_head_id]);
      if (!head) {
        return res.status(400).json({ success: false, message: `${rowLabel}: expense head not found or inactive` });
      }

      const [mode] = await query('SELECT id FROM payment_modes WHERE id = ? AND is_active = 1', [payment_mode_id]);
      if (!mode) {
        return res.status(400).json({ success: false, message: `${rowLabel}: payment mode not found or inactive` });
      }

      let finalRawMaterialId = null;
      let finalMaterialQty = null;
      if (Number(head.is_raw_material_category) === 1) {
        if (!raw_material_id) {
          return res.status(400).json({ success: false, message: `${rowLabel}: please select a raw material` });
        }
        const parsedQty = Number(material_qty);
        if (material_qty === undefined || material_qty === null || material_qty === '' || !Number.isFinite(parsedQty) || parsedQty <= 0) {
          return res.status(400).json({ success: false, message: `${rowLabel}: quantity must be greater than 0` });
        }
        const [material] = await query('SELECT id, unit_id FROM raw_materials WHERE id = ? AND is_active = 1', [raw_material_id]);
        if (!material) {
          return res.status(400).json({ success: false, message: `${rowLabel}: raw material not found or inactive` });
        }
        finalRawMaterialId = raw_material_id;
        finalMaterialQty = parsedQty;
      }

      validatedItems.push({
        expense_head_id, amount: parsedAmount, payment_mode_id,
        paid_to: paid_to || null, description: description || null,
        raw_material_id: finalRawMaterialId, material_qty: finalMaterialQty,
      });
    }

    const conn = await getConnection();
    const insertedIds = [];
    try {
      await conn.beginTransaction();
      for (const item of validatedItems) {
        const [result] = await conn.execute(
          `INSERT INTO daily_cash_expenses
           (date, outlet_id, expense_head_id, raw_material_id, material_qty, amount, payment_mode_id, paid_to, description, proof_attachment, entered_by, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [date, outlet_id, item.expense_head_id, item.raw_material_id, item.material_qty, item.amount, item.payment_mode_id, item.paid_to, item.description, null, req.user.id, 'Draft']
        );
        insertedIds.push(result.insertId);
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const createdRows = await query(
      `SELECT dce.*, o.outlet_name, eh.expense_name, pm.mode_name,
              u1.full_name as entered_by_name, u2.full_name as verified_by_name
       FROM daily_cash_expenses dce
       LEFT JOIN outlets o ON dce.outlet_id = o.id
       LEFT JOIN expense_heads eh ON dce.expense_head_id = eh.id
       LEFT JOIN payment_modes pm ON dce.payment_mode_id = pm.id
       LEFT JOIN users u1 ON dce.entered_by = u1.id
       LEFT JOIN users u2 ON dce.verified_by = u2.id
       WHERE dce.id IN (${insertedIds.map(() => '?').join(',')})
       ORDER BY dce.id ASC`,
      insertedIds
    );

    await logAudit(req.user.id, 'CREATE', 'daily_cash_expenses', insertedIds.join(','), null, createdRows, `Created ${insertedIds.length} daily cash expenses in one batch entry`);

    const totalAmount = validatedItems.reduce((sum, item) => sum + item.amount, 0);
    await notifyAdmins({
      actorId: req.user.id,
      outletId: outlet_id,
      type: 'info',
      title: 'Draft Expenses Created',
      message: `${insertedIds.length} cash expense draft(s) totalling ₹${totalAmount} have been created for ${date}.`,
      referenceType: 'expense',
      referenceId: insertedIds[0],
      navPath: '/daily-accounts/expenses'
    });

    res.status(201).json({
      success: true,
      message: `${insertedIds.length} daily cash expenses created successfully`,
      data: createdRows.map(normalizeExpenseDate)
    });
  } catch (error) {
    console.error('Create daily cash expenses batch error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating daily cash expenses'
    });
  }
};

export const getDailyCashExpenseById = async (req, res) => {
  try {
    const [expense] = await query(
      `SELECT dce.*, o.outlet_name, eh.expense_name, pm.mode_name,
              u1.full_name as entered_by_name, u2.full_name as verified_by_name
       FROM daily_cash_expenses dce
       LEFT JOIN outlets o ON dce.outlet_id = o.id
       LEFT JOIN expense_heads eh ON dce.expense_head_id = eh.id
       LEFT JOIN payment_modes pm ON dce.payment_mode_id = pm.id
       LEFT JOIN users u1 ON dce.entered_by = u1.id
       LEFT JOIN users u2 ON dce.verified_by = u2.id
       WHERE dce.id = ?`,
      [req.record.id]
    );

    res.status(200).json({ success: true, data: normalizeExpenseDate(expense) });
  } catch (error) {
    console.error('Get daily cash expense by id error:', error);
    res.status(500).json({ success: false, message: 'Error fetching expense' });
  }
};

export const updateDailyCashExpense = async (req, res) => {
  try {
    const existing = req.record;
    if (!['Draft', 'Rejected'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Only Draft or Rejected expenses can be edited' });
    }

    const { date, expense_head_id, amount, payment_mode_id, paid_to, description, raw_material_id, material_qty } = req.body;

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }

    // Check both the record's current date and, if it's changing, the new
    // one - covers editing a field on an already-finalized-period expense,
    // and moving a date into (or out of) a finalized month.
    await assertDateEditable(existing.outlet_id, existing.date, 'A cash expense');
    if (date && date !== existing.date) {
      await assertDateEditable(existing.outlet_id, date, 'A cash expense');
    }

    const parsedAmount = amount !== undefined ? Number(amount) : existing.amount;
    if (amount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    const effectiveHeadId = expense_head_id || existing.expense_head_id;
    let effectiveHead = null;
    if (expense_head_id) {
      const [head] = await query('SELECT id, is_raw_material_category FROM expense_heads WHERE id = ? AND is_active = 1', [expense_head_id]);
      if (!head) return res.status(400).json({ success: false, message: 'Expense head not found or inactive' });
      effectiveHead = head;
    } else {
      const [head] = await query('SELECT id, is_raw_material_category FROM expense_heads WHERE id = ?', [effectiveHeadId]);
      effectiveHead = head || null;
    }

    if (payment_mode_id) {
      const [mode] = await query('SELECT id FROM payment_modes WHERE id = ? AND is_active = 1', [payment_mode_id]);
      if (!mode) return res.status(400).json({ success: false, message: 'Payment mode not found or inactive' });
    }

    // Same raw-material requirement as create, evaluated against the
    // effective (possibly just-changed) expense head. Switching to a
    // non-raw-material head clears any previously-set linkage fields.
    let finalRawMaterialId = null;
    let finalMaterialQty = null;
    if (effectiveHead && Number(effectiveHead.is_raw_material_category) === 1) {
      const effectiveRawMaterialId = raw_material_id !== undefined ? raw_material_id : existing.raw_material_id;
      const effectiveMaterialQty = material_qty !== undefined ? material_qty : existing.material_qty;

      if (!effectiveRawMaterialId) {
        return res.status(400).json({ success: false, message: 'Please select a raw material' });
      }
      const parsedQty = Number(effectiveMaterialQty);
      if (effectiveMaterialQty === undefined || effectiveMaterialQty === null || effectiveMaterialQty === '' || !Number.isFinite(parsedQty) || parsedQty <= 0) {
        return res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
      }
      const [material] = await query('SELECT id, unit_id FROM raw_materials WHERE id = ? AND is_active = 1', [effectiveRawMaterialId]);
      if (!material) {
        return res.status(400).json({ success: false, message: 'Raw material not found or inactive' });
      }
      finalRawMaterialId = effectiveRawMaterialId;
      finalMaterialQty = parsedQty;
    }

    const updateData = {
      date: date || existing.date,
      expense_head_id: effectiveHeadId,
      raw_material_id: finalRawMaterialId,
      material_qty: finalMaterialQty,
      amount: parsedAmount,
      payment_mode_id: payment_mode_id || existing.payment_mode_id,
      paid_to: paid_to !== undefined ? (paid_to || null) : existing.paid_to,
      description: description !== undefined ? (description || null) : existing.description
    };

    if (req.file) {
      updateData.proof_attachment = normalizeUploadPath(req.file.path);
    }

    const fields = Object.keys(updateData);
    assertSafeColumnNames(fields);
    const values = Object.values(updateData);
    const setClause = fields.map(f => `${f} = ?`).join(', ');

    await query(
      `UPDATE daily_cash_expenses SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, existing.id]
    );

    const [updated] = await query(
      `SELECT dce.*, o.outlet_name, eh.expense_name, pm.mode_name,
              u1.full_name as entered_by_name, u2.full_name as verified_by_name
       FROM daily_cash_expenses dce
       LEFT JOIN outlets o ON dce.outlet_id = o.id
       LEFT JOIN expense_heads eh ON dce.expense_head_id = eh.id
       LEFT JOIN payment_modes pm ON dce.payment_mode_id = pm.id
       LEFT JOIN users u1 ON dce.entered_by = u1.id
       LEFT JOIN users u2 ON dce.verified_by = u2.id
       WHERE dce.id = ?`,
      [existing.id]
    );

    await logAudit(req.user.id, 'UPDATE', 'daily_cash_expenses', existing.id, existing, updated, 'Updated daily cash expense');

    res.status(200).json({
      success: true,
      message: 'Daily cash expense updated successfully',
      data: normalizeExpenseDate(updated)
    });
  } catch (error) {
    console.error('Update daily cash expense error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Error updating daily cash expense' });
  }
};

export const submitDailyCashExpense = async (req, res) => {
  try {
    const existing = req.record;
    if (!['Draft', 'Rejected'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Only Draft or Rejected expenses can be submitted' });
    }

    await query(
      `UPDATE daily_cash_expenses SET status = ?, updated_at = NOW() WHERE id = ?`,
      ['Submitted', existing.id]
    );

    const [updated] = await query('SELECT * FROM daily_cash_expenses WHERE id = ?', [existing.id]);

    await logAudit(req.user.id, 'SUBMIT', 'daily_cash_expenses', existing.id, existing, updated, 'Submitted daily cash expense');

    await notifyAdmins({
      actorId: req.user.id,
      outletId: existing.outlet_id,
      type: 'info',
      title: 'Expense Submitted for Approval',
      message: `A cash expense of ₹${existing.amount} for ${existing.date} has been submitted.`,
      referenceType: 'expense',
      referenceId: existing.id,
      navPath: '/daily-accounts/expenses'
    });

    res.status(200).json({
      success: true,
      message: 'Expense submitted successfully',
      data: normalizeExpenseDate(updated)
    });
  } catch (error) {
    console.error('Submit daily cash expense error:', error);
    res.status(500).json({ success: false, message: 'Error submitting daily cash expense' });
  }
};

export const approveDailyCashExpense = async (req, res) => {
  try {
    const existing = req.record;
    if (existing.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: 'Only Submitted expenses can be approved' });
    }
    if (Number(existing.entered_by) === Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Users cannot approve their own expense' });
    }

    const { admin_remarks } = req.body || {};
    // req.record (existing) is a plain, unlocked SELECT from loadScopedRecord -
    // two near-simultaneous approve requests for the same expense could both
    // pass the status check above before either UPDATE commits. The
    // status = 'Submitted' guard here (rather than just WHERE id = ?) plus the
    // affectedRows check turns that into a clean "someone already handled
    // this" error instead of letting both requests fall through to the
    // material_purchase_items linkage below and double-record the cost.
    const updateResult = await query(
      `UPDATE daily_cash_expenses SET status = ?, verified_by = ?, verified_at = NOW(), admin_remarks = ? WHERE id = ? AND status = 'Submitted'`,
      ['Approved', req.user.id, admin_remarks || null, existing.id]
    );
    if (updateResult.affectedRows === 0) {
      return res.status(409).json({ success: false, message: 'This expense was already actioned by someone else' });
    }

    // Raw-material-tagged cash expenses get a real material_purchase_items row
    // created only now, at approval time, so they feed consumption tracking /
    // P&L raw-material cost the same way any other purchase does. See
    // database/add_raw_material_cash_expense_linkage.sql for the design note.
    // The approval update above has already committed, so a failure in this
    // block must not fail the request - it's logged for manual reconciliation
    // instead of surfacing as a 500 on an approval that actually succeeded.
    // existing.linked_purchase_item_id is checked as a second, defense-in-depth
    // guard against double-linking, independent of the status race above.
    let linkedPurchaseItemId = null;
    let linkedMaterial = null;
    if (!existing.linked_purchase_item_id && existing.raw_material_id && existing.material_qty) {
      try {
        const [head] = await query('SELECT is_raw_material_category FROM expense_heads WHERE id = ?', [existing.expense_head_id]);
        if (head && Number(head.is_raw_material_category) === 1) {
          const [material] = await query(
            'SELECT material_code, material_name, category_id, unit_id FROM raw_materials WHERE id = ?',
            [existing.raw_material_id]
          );
          if (!material) {
            console.error(`Approve daily cash expense #${existing.id}: raw material ${existing.raw_material_id} no longer exists, skipping purchase-record linkage.`);
          } else {
            const conn = await getConnection();
            try {
              await conn.beginTransaction();

              const batchId = `CASHEXP-${existing.id}`;
              const qty = Number(existing.material_qty);
              const rate = Math.round((Number(existing.amount) / qty) * 100) / 100;

              const [uploadResult] = await conn.execute(
                `INSERT INTO material_purchase_uploads
                 (batch_id, outlet_id, file_name, file_path, total_rows, success_rows, failed_rows, status, uploaded_by, created_at)
                 VALUES (?, ?, NULL, NULL, 1, 1, 0, 'Completed', ?, NOW())`,
                [batchId, existing.outlet_id, req.user.id]
              );
              const uploadId = uploadResult.insertId;

              const [itemResult] = await conn.execute(
                `INSERT INTO material_purchase_items
                 (upload_id, date, outlet_id, supplier_id, supplier_name, raw_material_id, raw_material_code, raw_material_name, category_id, qty, unit_id, rate, tax, total_amount, invoice_no, paid_by, payment_mode, remarks, created_at)
                 VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, 'Management', 'Cash', ?, NOW())`,
                [
                  uploadId,
                  existing.date,
                  existing.outlet_id,
                  existing.paid_to || null,
                  existing.raw_material_id,
                  material.material_code || null,
                  material.material_name,
                  material.category_id,
                  qty,
                  material.unit_id,
                  rate,
                  existing.amount,
                  `Auto-created from Daily Cash Expense #${existing.id}`
                ]
              );
              linkedPurchaseItemId = itemResult.insertId;

              await conn.execute(
                'UPDATE daily_cash_expenses SET linked_purchase_item_id = ? WHERE id = ?',
                [linkedPurchaseItemId, existing.id]
              );

              await conn.commit();
              linkedMaterial = material;
            } catch (linkTxError) {
              await conn.rollback();
              throw linkTxError;
            } finally {
              conn.release();
            }
          }
        }
      } catch (linkError) {
        linkedPurchaseItemId = null;
        linkedMaterial = null;
        console.error(`Approve daily cash expense #${existing.id}: failed to create linked material_purchase_items record (approval itself already committed):`, linkError);
      }
    }

    const [updated] = await query(
      `SELECT dce.*, o.outlet_name, eh.expense_name, pm.mode_name,
              u1.full_name as entered_by_name, u2.full_name as verified_by_name
       FROM daily_cash_expenses dce
       LEFT JOIN outlets o ON dce.outlet_id = o.id
       LEFT JOIN expense_heads eh ON dce.expense_head_id = eh.id
       LEFT JOIN payment_modes pm ON dce.payment_mode_id = pm.id
       LEFT JOIN users u1 ON dce.entered_by = u1.id
       LEFT JOIN users u2 ON dce.verified_by = u2.id
       WHERE dce.id = ?`,
      [existing.id]
    );

    await logApproval(req.user.id, 'daily_cash_expense', existing.id, 'Approved', admin_remarks);
    await logAudit(req.user.id, 'APPROVE', 'daily_cash_expenses', existing.id, existing, updated, 'Approved daily cash expense');

    await notifyUser({
      userId: existing.entered_by,
      outletId: existing.outlet_id,
      type: 'success',
      title: 'Expense Approved',
      message: `Your expense of ₹${existing.amount} for ${existing.date} has been approved.`,
      referenceType: 'expense',
      referenceId: existing.id,
      navPath: '/daily-accounts/expenses'
    });

    res.status(200).json({
      success: true,
      message: 'Expense approved successfully',
      data: {
        ...normalizeExpenseDate(updated),
        ...(linkedMaterial ? {
          raw_material_code: linkedMaterial.material_code,
          raw_material_name: linkedMaterial.material_name
        } : {})
      }
    });
  } catch (error) {
    console.error('Approve daily cash expense error:', error);
    res.status(500).json({ success: false, message: 'Error approving daily cash expense' });
  }
};

export const rejectDailyCashExpense = async (req, res) => {
  try {
    const existing = req.record;
    if (existing.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: 'Only Submitted expenses can be rejected' });
    }
    if (Number(existing.entered_by) === Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Users cannot reject their own expense' });
    }

    const { admin_remarks } = req.body || {};
    if (!admin_remarks || !String(admin_remarks).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    await query(
      `UPDATE daily_cash_expenses SET status = ?, verified_by = ?, verified_at = NOW(), admin_remarks = ? WHERE id = ?`,
      ['Rejected', req.user.id, admin_remarks, existing.id]
    );

    const [updated] = await query(
      `SELECT dce.*, o.outlet_name, eh.expense_name, pm.mode_name,
              u1.full_name as entered_by_name, u2.full_name as verified_by_name
       FROM daily_cash_expenses dce
       LEFT JOIN outlets o ON dce.outlet_id = o.id
       LEFT JOIN expense_heads eh ON dce.expense_head_id = eh.id
       LEFT JOIN payment_modes pm ON dce.payment_mode_id = pm.id
       LEFT JOIN users u1 ON dce.entered_by = u1.id
       LEFT JOIN users u2 ON dce.verified_by = u2.id
       WHERE dce.id = ?`,
      [existing.id]
    );

    await logApproval(req.user.id, 'daily_cash_expense', existing.id, 'Rejected', admin_remarks);
    await logAudit(req.user.id, 'REJECT', 'daily_cash_expenses', existing.id, existing, updated, 'Rejected daily cash expense');

    await notifyUser({
      userId: existing.entered_by,
      outletId: existing.outlet_id,
      type: 'warning',
      title: 'Expense Rejected',
      message: `Your expense of ₹${existing.amount} for ${existing.date} has been rejected: ${admin_remarks}`,
      referenceType: 'expense',
      referenceId: existing.id,
      navPath: '/daily-accounts/expenses'
    });

    res.status(200).json({
      success: true,
      message: 'Expense rejected successfully',
      data: normalizeExpenseDate(updated)
    });
  } catch (error) {
    console.error('Reject daily cash expense error:', error);
    res.status(500).json({ success: false, message: 'Error rejecting daily cash expense' });
  }
};

export const deleteDailyCashExpense = async (req, res) => {
  try {
    const existing = req.record;
    if (!['Draft', 'Rejected'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Only Draft or Rejected expenses can be deleted' });
    }

    await logAudit(req.user.id, 'DELETE', 'daily_cash_expenses', existing.id, existing, null, 'Deleted daily cash expense');

    await query('DELETE FROM daily_cash_expenses WHERE id = ?', [existing.id]);

    if (existing.proof_attachment) {
      try {
        const [usedBy] = await query(
          'SELECT COUNT(*) as count FROM daily_cash_expenses WHERE proof_attachment = ? AND id != ?',
          [existing.proof_attachment, existing.id]
        );
        if (usedBy.count === 0) {
          const filePath = path.resolve(existing.proof_attachment);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (fileError) {
        console.error('Proof file cleanup error:', fileError.message);
      }
    }

    res.status(200).json({ success: true, message: 'Daily cash expense deleted successfully' });
  } catch (error) {
    console.error('Delete daily cash expense error:', error);
    res.status(500).json({ success: false, message: 'Error deleting daily cash expense' });
  }
};

export const getBankDeposits = async (req, res) => {
  try {
    const { outlet_id, start_date, end_date, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    const finalOutletId = outlet_id || req.query.outlet_id;
    if (finalOutletId) {
      whereClause += ' AND bd.outlet_id = ?';
      params.push(finalOutletId);
    }

    if (start_date) {
      whereClause += ' AND bd.date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND bd.date <= ?';
      params.push(end_date);
    }

    if (status) {
      whereClause += ' AND bd.status = ?';
      params.push(status);
    }

    const deposits = await query(
      `SELECT bd.*, o.outlet_name,
              u1.full_name as entered_by_name,
              u2.full_name as reviewer_name
       FROM bank_deposits bd
       LEFT JOIN outlets o ON bd.outlet_id = o.id
       LEFT JOIN users u1 ON bd.entered_by = u1.id
       LEFT JOIN users u2 ON bd.verified_by = u2.id
       WHERE ${whereClause}
       ORDER BY bd.date DESC, bd.id DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    const normalized = deposits.map(normalizeBankDepositDate);

    res.status(200).json({
      success: true,
      data: normalized
    });
  } catch (error) {
    console.error('Get bank deposits error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bank deposits'
    });
  }
};

export const getBankDepositSummary = async (req, res) => {
  try {
    const { outlet_id, date } = req.query;

    if (!outlet_id || !date) {
      return res.status(400).json({
        success: false,
        message: 'outlet_id and date are required'
      });
    }

    const [summary] = await query(
      `SELECT COALESCE(SUM(deposit_amount), 0) as verified_bank_deposits, COUNT(*) as verified_count
       FROM bank_deposits
       WHERE outlet_id = ? AND date = ? AND status = 'Verified'`,
      [outlet_id, date]
    );

    res.status(200).json({
      success: true,
      data: {
        verified_bank_deposits: Number(summary.verified_bank_deposits) || 0,
        verified_count: Number(summary.verified_count) || 0
      }
    });
  } catch (error) {
    console.error('Get bank deposit summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching bank deposit summary' });
  }
};

export const getBankDepositById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = req.record || (await query('SELECT * FROM bank_deposits WHERE id = ?', [id]))[0];
    if (!record) {
      return res.status(404).json({ success: false, message: 'Bank deposit not found' });
    }

    const [details] = await query(
      `SELECT bd.*, o.outlet_name,
              u1.full_name as entered_by_name,
              u2.full_name as reviewer_name
       FROM bank_deposits bd
       LEFT JOIN outlets o ON bd.outlet_id = o.id
       LEFT JOIN users u1 ON bd.entered_by = u1.id
       LEFT JOIN users u2 ON bd.verified_by = u2.id
       WHERE bd.id = ?`,
      [id]
    );

    res.status(200).json({
      success: true,
      data: normalizeBankDepositDate(details)
    });
  } catch (error) {
    console.error('Get bank deposit by id error:', error);
    res.status(500).json({ success: false, message: 'Error fetching bank deposit' });
  }
};

const WHITELIST_BANK_DEPOSIT_CREATE = ['date', 'outlet_id', 'deposit_amount', 'bank_name', 'reference_no', 'deposited_by', 'remarks'];
const WHITELIST_BANK_DEPOSIT_UPDATE = ['date', 'deposit_amount', 'bank_name', 'reference_no', 'deposited_by', 'remarks'];

const validateBankDeposit = (data, isUpdate = false) => {
  const errors = [];
  if (!isUpdate && !data.date) errors.push('Date is required');
  if (!isUpdate && !data.outlet_id) errors.push('Outlet is required');
  if (!isUpdate && (data.deposit_amount === undefined || data.deposit_amount === '')) errors.push('Deposit amount is required');
  if (data.deposit_amount !== undefined && data.deposit_amount !== '' && Number(data.deposit_amount) <= 0) errors.push('Deposit amount must be greater than zero');
  if (data.date && isNaN(Date.parse(data.date))) errors.push('Invalid date');
  return errors;
};

export const updateBankDeposit = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM bank_deposits WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank deposit not found' });
    }

    if (['Submitted', 'Verified'].includes(existing[0].status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit a bank deposit that is already submitted or verified'
      });
    }

    const updateData = {};
    for (const key of WHITELIST_BANK_DEPOSIT_UPDATE) {
      if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }

    const validation = validateBankDeposit(updateData, true);
    if (validation.length) {
      return res.status(400).json({ success: false, message: validation.join('. ') });
    }

    await assertDateEditable(existing[0].outlet_id, existing[0].date, 'A bank deposit');
    if (updateData.date && updateData.date !== existing[0].date) {
      await assertDateEditable(existing[0].outlet_id, updateData.date, 'A bank deposit');
    }

    if (req.file?.path) {
      updateData.proof_attachment = normalizeUploadPath(req.file.path);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields provided for update' });
    }

    const fields = Object.keys(updateData);
    assertSafeColumnNames(fields);
    const values = Object.values(updateData);
    const setClause = fields.map(f => `${f} = ?`).join(', ');

    await query(
      `UPDATE bank_deposits SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, id]
    );

    await logAudit(req.user.id, 'UPDATE', 'bank_deposits', id, existing[0], updateData, 'Updated bank deposit');

    res.status(200).json({
      success: true,
      message: 'Bank deposit updated successfully'
    });
  } catch (error) {
    console.error('Update bank deposit error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Error updating bank deposit' });
  }
};

export const createBankDeposit = async (req, res) => {
  try {
    const body = req.body || {};

    const depositData = {};
    for (const key of WHITELIST_BANK_DEPOSIT_CREATE) {
      if (body[key] !== undefined) depositData[key] = body[key];
    }

    const validation = validateBankDeposit(depositData);
    if (validation.length) {
      return res.status(400).json({ success: false, message: validation.join('. ') });
    }

    await assertDateEditable(depositData.outlet_id, depositData.date, 'A bank deposit');

    depositData.deposit_amount = Number(depositData.deposit_amount);
    depositData.entered_by = req.user.id;
    depositData.status = 'Draft';
    depositData.proof_attachment = req.file?.path ? normalizeUploadPath(req.file.path) : null;

    const fields = Object.keys(depositData);
    assertSafeColumnNames(fields);
    const values = Object.values(depositData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO bank_deposits (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'bank_deposits', result.insertId, null, depositData, 'Created bank deposit');

    await notifyAdmins({
      actorId: req.user.id,
      outletId: depositData.outlet_id,
      type: 'info',
      title: 'Bank Deposit Submitted',
      message: `A bank deposit of ₹${depositData.deposit_amount} has been submitted for ${depositData.date}.`,
      referenceType: 'bank_deposit',
      referenceId: result.insertId,
      navPath: '/daily-accounts/bank-deposits'
    });

    res.status(201).json({
      success: true,
      message: 'Bank deposit created successfully',
      data: { id: result.insertId, status: 'Draft' }
    });
  } catch (error) {
    console.error('Create bank deposit error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Error creating bank deposit' });
  }
};

export const submitBankDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM bank_deposits WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank deposit not found' });
    }

    if (!['Draft', 'Rejected'].includes(existing[0].status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot submit a bank deposit with status ${existing[0].status}`
      });
    }

    await query(
      `UPDATE bank_deposits SET status = 'Submitted', updated_at = NOW() WHERE id = ?`,
      [id]
    );

    await logAudit(req.user.id, 'SUBMIT', 'bank_deposits', id, existing[0], { status: 'Submitted' }, 'Submitted bank deposit');

    res.status(200).json({ success: true, message: 'Bank deposit submitted successfully' });
  } catch (error) {
    console.error('Submit bank deposit error:', error);
    res.status(500).json({ success: false, message: 'Error submitting bank deposit' });
  }
};

export const verifyBankDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM bank_deposits WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank deposit not found' });
    }

    if (existing[0].status !== 'Submitted') {
      return res.status(400).json({
        success: false,
        message: 'Only Submitted bank deposits can be verified'
      });
    }

    if (Number(existing[0].entered_by) === Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Users cannot verify their own bank deposits'
      });
    }

    await query(
      `UPDATE bank_deposits SET status = 'Verified', verified_by = ?, verified_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );

    const [updated] = await query('SELECT * FROM bank_deposits WHERE id = ?', [id]);
    await logAudit(req.user.id, 'VERIFY', 'bank_deposits', id, existing[0], updated, 'Verified bank deposit');

    res.status(200).json({ success: true, message: 'Bank deposit verified successfully' });
  } catch (error) {
    console.error('Verify bank deposit error:', error);
    res.status(500).json({ success: false, message: 'Error verifying bank deposit' });
  }
};

export const rejectBankDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body || {};
    const existing = await query('SELECT * FROM bank_deposits WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank deposit not found' });
    }

    if (existing[0].status !== 'Submitted') {
      return res.status(400).json({
        success: false,
        message: 'Only Submitted bank deposits can be rejected'
      });
    }

    if (Number(existing[0].entered_by) === Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Users cannot reject their own bank deposits'
      });
    }

    if (!String(rejection_reason).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    await query(
      `UPDATE bank_deposits SET status = 'Rejected', verified_by = ?, verified_at = NOW(), remarks = CONCAT(IFNULL(remarks, ''), ?), updated_at = NOW() WHERE id = ?`,
      [req.user.id, `\nRejection reason: ${String(rejection_reason).trim()}`, id]
    );

    const [updated] = await query('SELECT * FROM bank_deposits WHERE id = ?', [id]);
    await logAudit(req.user.id, 'REJECT', 'bank_deposits', id, existing[0], updated, `Rejected bank deposit: ${rejection_reason}`);

    res.status(200).json({ success: true, message: 'Bank deposit rejected successfully' });
  } catch (error) {
    console.error('Reject bank deposit error:', error);
    res.status(500).json({ success: false, message: 'Error rejecting bank deposit' });
  }
};

export const deleteBankDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM bank_deposits WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Bank deposit not found' });
    }

    if (!['Draft', 'Rejected'].includes(existing[0].status)) {
      return res.status(400).json({
        success: false,
        message: 'Only Draft or Rejected bank deposits can be deleted'
      });
    }

    const attachment = existing[0].proof_attachment;
    await query('DELETE FROM bank_deposits WHERE id = ?', [id]);

    if (attachment) {
      try {
        const filePath = path.join(process.cwd(), attachment);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fsError) {
        console.error('Failed to delete bank deposit proof file:', fsError.message);
      }
    }

    await logAudit(req.user.id, 'DELETE', 'bank_deposits', id, existing[0], null, 'Deleted bank deposit');

    res.status(200).json({ success: true, message: 'Bank deposit deleted successfully' });
  } catch (error) {
    console.error('Delete bank deposit error:', error);
    res.status(500).json({ success: false, message: 'Error deleting bank deposit' });
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
              u2.full_name as verified_by_name,
              u3.full_name as locked_by_name
       FROM day_closings dc
       LEFT JOIN outlets o ON dc.outlet_id = o.id
       LEFT JOIN users u1 ON dc.submitted_by = u1.id
       LEFT JOIN users u2 ON dc.verified_by = u2.id
       LEFT JOIN users u3 ON dc.locked_by = u3.id
       WHERE ${whereClause}
       ORDER BY dc.date DESC, dc.outlet_id
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    const normalized = closings.map((row) => {
      if (row && row.date) {
        const iso = toISOLocal(row.date);
        if (iso) row.date = iso;
      }
      if (row && row.status === 'Rejected' && row.manager_remarks) {
        const marker = 'Rejection reason:';
        const idx = row.manager_remarks.indexOf(marker);
        if (idx !== -1) {
          row.rejection_reason = row.manager_remarks.substring(idx + marker.length).trim();
        }
      }
      return row;
    });

    res.status(200).json({
      success: true,
      data: normalized
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
    const { id } = req.params;
    const conn = await getConnection();
    let existing;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT * FROM day_closings WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Day closing not found' });
      }
      existing = rows[0];

      if (!['Open', 'Rejected'].includes(existing.status)) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Only Open or Rejected day closings can be submitted' });
      }

      const [cashbookRows] = await conn.execute(
        'SELECT * FROM daily_cashbooks WHERE outlet_id = ? AND date = ?',
        [existing.outlet_id, toISOLocal(existing.date)]
      );
      const cashbook = cashbookRows[0];

      if (!cashbook) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Daily cashbook is required before submitting day closing' });
      }

      if (!['Submitted', 'Verified', 'Locked'].includes(cashbook.status)) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Daily cashbook must be Submitted, Verified or Locked before day closing' });
      }

      const [verifiedDepositsRows] = await conn.execute(
        `SELECT COALESCE(SUM(deposit_amount), 0) as total, COUNT(*) as count
         FROM bank_deposits
         WHERE outlet_id = ? AND date = ? AND status = 'Verified'`,
        [existing.outlet_id, toISOLocal(existing.date)]
      );
      const verifiedDeposits = verifiedDepositsRows[0];

      const verifiedBankDeposits = Number(verifiedDeposits.total) || 0;
      const cashbookBankDeposit = Number(cashbook.bank_deposit) || 0;
      const bankDepositMismatch = verifiedBankDeposits !== cashbookBankDeposit;
      const hasManagerRemarks = String(existing.manager_remarks || '').trim() || String(req.body.manager_remarks || '').trim();

      if (bankDepositMismatch && !hasManagerRemarks) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Bank deposit mismatch. Please provide manager remarks before submitting.'
        });
      }

      const fieldsToSet = [
        'status = ?',
        'submitted_by = ?',
        'submitted_at = NOW()',
        'closing_cash_system = ?',
        'actual_cash_in_hand = ?',
        'difference = ?'
      ];

      const values = [
        'Submitted',
        req.user.id,
        Number(cashbook.closing_cash) || 0,
        Number(cashbook.actual_cash_in_hand) || 0,
        Number(cashbook.cash_difference) || 0
      ];

      if (req.body.manager_remarks !== undefined) {
        fieldsToSet.push('manager_remarks = ?');
        values.push(String(req.body.manager_remarks).trim());
      }

      await conn.execute(
        `UPDATE day_closings SET ${fieldsToSet.join(', ')}, updated_at = NOW() WHERE id = ?`,
        [...values, id]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    await logAudit(req.user.id, 'SUBMIT', 'day_closings', id, existing, { status: 'Submitted' }, 'Submitted day closing');

    res.status(200).json({ success: true, message: 'Day closing submitted successfully' });
  } catch (error) {
    console.error('Submit day closing error:', error);
    res.status(500).json({ success: false, message: 'Error submitting day closing' });
  }
};

export const verifyDayClosing = async (req, res) => {
  try {
    const { id } = req.params;
    const conn = await getConnection();
    let existing;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT * FROM day_closings WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Day closing not found' });
      }
      existing = rows[0];

      if (existing.status !== 'Submitted') {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Only Submitted day closings can be verified' });
      }

      if (Number(existing.submitted_by) === Number(req.user.id)) {
        await conn.rollback();
        return res.status(403).json({ success: false, message: 'Users cannot verify their own day closing' });
      }

      await conn.execute(
        `UPDATE day_closings SET status = 'Verified', verified_by = ?, verified_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [req.user.id, id]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    await logApproval(req.user.id, 'day_closing', id, 'Verified', null);
    await logAudit(req.user.id, 'VERIFY', 'day_closings', id, existing, { status: 'Verified' }, 'Verified day closing');

    res.status(200).json({ success: true, message: 'Day closing verified successfully' });
  } catch (error) {
    console.error('Verify day closing error:', error);
    res.status(500).json({ success: false, message: 'Error verifying day closing' });
  }
};

export const createDayClosing = async (req, res) => {
  try {
    const { date, outlet_id } = req.body || {};
    if (!date || !outlet_id) {
      return res.status(400).json({ success: false, message: 'Date and outlet are required' });
    }

    await assertDateEditable(outlet_id, date, 'A day closing');

    const whitelist = ['date', 'outlet_id', 'sales_confirmed', 'expenses_confirmed', 'purchases_confirmed', 'proofs_uploaded', 'manager_remarks'];
    const closingData = {};
    for (const key of whitelist) {
      if (req.body[key] !== undefined) closingData[key] = req.body[key];
    }
    closingData.status = 'Open';

    const [cashbook] = await query(
      'SELECT * FROM daily_cashbooks WHERE outlet_id = ? AND date = ?',
      [outlet_id, date]
    );

    if (cashbook) {
      closingData.closing_cash_system = Number(cashbook.closing_cash) || 0;
      closingData.actual_cash_in_hand = Number(cashbook.actual_cash_in_hand) || 0;
      closingData.difference = Number(cashbook.cash_difference) || 0;
    } else {
      closingData.closing_cash_system = 0;
      closingData.actual_cash_in_hand = 0;
      closingData.difference = 0;
    }

    const fields = Object.keys(closingData);
    assertSafeColumnNames(fields);
    const values = Object.values(closingData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO day_closings (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'day_closings', result.insertId, null, closingData, 'Created day closing');

    res.status(201).json({ success: true, message: 'Day closing created successfully', data: { id: result.insertId } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' || String(error.message || '').includes('Duplicate')) {
      return res.status(409).json({ success: false, message: 'Day closing already exists for this date and outlet' });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Create day closing error:', error);
    res.status(500).json({ success: false, message: 'Error creating day closing' });
  }
};

export const updateDayClosing = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = req.record || (await query('SELECT * FROM day_closings WHERE id = ?', [id]))[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Day closing not found' });
    }

    if (!['Open', 'Rejected'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Only Open or Rejected day closings can be edited' });
    }

    const whitelist = ['date', 'outlet_id', 'sales_confirmed', 'expenses_confirmed', 'purchases_confirmed', 'proofs_uploaded', 'manager_remarks'];
    const updateData = {};
    for (const key of whitelist) {
      if (req.body[key] !== undefined) updateData[key] = req.body[key];
    }

    if (updateData.date && updateData.outlet_id) {
      const [duplicate] = await query(
        'SELECT id FROM day_closings WHERE date = ? AND outlet_id = ? AND id != ?',
        [updateData.date, updateData.outlet_id, id]
      );
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'Day closing already exists for this date and outlet' });
      }
    }

    const effectiveOutletId = updateData.outlet_id || existing.outlet_id;
    await assertDateEditable(existing.outlet_id, existing.date, 'A day closing');
    if ((updateData.date && updateData.date !== existing.date) || (updateData.outlet_id && Number(updateData.outlet_id) !== Number(existing.outlet_id))) {
      await assertDateEditable(effectiveOutletId, updateData.date || existing.date, 'A day closing');
    }

    const [cashbook] = await query(
      'SELECT * FROM daily_cashbooks WHERE outlet_id = ? AND date = ?',
      [updateData.outlet_id || existing.outlet_id, updateData.date || toISOLocal(existing.date)]
    );

    if (cashbook) {
      updateData.closing_cash_system = Number(cashbook.closing_cash) || 0;
      updateData.actual_cash_in_hand = Number(cashbook.actual_cash_in_hand) || 0;
      updateData.difference = Number(cashbook.cash_difference) || 0;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const fields = Object.keys(updateData);
    assertSafeColumnNames(fields);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updateData);

    await query(
      `UPDATE day_closings SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, id]
    );

    await logAudit(req.user.id, 'UPDATE', 'day_closings', id, existing, updateData, 'Updated day closing');

    res.status(200).json({ success: true, message: 'Day closing updated successfully' });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Update day closing error:', error);
    res.status(500).json({ success: false, message: 'Error updating day closing' });
  }
};

export const getDayClosingById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = req.record || (await query('SELECT * FROM day_closings WHERE id = ?', [id]))[0];
    if (!record) {
      return res.status(404).json({ success: false, message: 'Day closing not found' });
    }

    const [details] = await query(
      `SELECT dc.*, o.outlet_name,
              u1.full_name as submitted_by_name,
              u2.full_name as verified_by_name,
              u3.full_name as locked_by_name
       FROM day_closings dc
       LEFT JOIN outlets o ON dc.outlet_id = o.id
       LEFT JOIN users u1 ON dc.submitted_by = u1.id
       LEFT JOIN users u2 ON dc.verified_by = u2.id
       LEFT JOIN users u3 ON dc.locked_by = u3.id
       WHERE dc.id = ?`,
      [id]
    );

    if (details && details.date) {
      const iso = toISOLocal(details.date);
      if (iso) details.date = iso;
    }

    if (details && details.status === 'Rejected' && details.manager_remarks) {
      const marker = 'Rejection reason:';
      const idx = details.manager_remarks.indexOf(marker);
      if (idx !== -1) {
        details.rejection_reason = details.manager_remarks.substring(idx + marker.length).trim();
      }
    }

    res.status(200).json({ success: true, data: details });
  } catch (error) {
    console.error('Get day closing error:', error);
    res.status(500).json({ success: false, message: 'Error fetching day closing' });
  }
};

export const rejectDayClosing = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body || {};
    if (!String(rejection_reason).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const conn = await getConnection();
    let existing;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT * FROM day_closings WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Day closing not found' });
      }
      existing = rows[0];

      if (existing.status !== 'Submitted') {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Only Submitted day closings can be rejected' });
      }

      if (Number(existing.submitted_by) === Number(req.user.id)) {
        await conn.rollback();
        return res.status(403).json({ success: false, message: 'Users cannot reject their own day closing' });
      }

      const existingRemarks = String(existing.manager_remarks || '').trim();
      const reasonLine = `Rejection reason: ${String(rejection_reason).trim()}`;
      const updatedRemarks = existingRemarks ? `${existingRemarks}\n${reasonLine}` : reasonLine;

      await conn.execute(
        `UPDATE day_closings SET status = 'Rejected', verified_by = ?, verified_at = NOW(), manager_remarks = ?, updated_at = NOW() WHERE id = ?`,
        [req.user.id, updatedRemarks, id]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    await logApproval(req.user.id, 'day_closing', id, 'Rejected', String(rejection_reason).trim());
    await logAudit(req.user.id, 'REJECT', 'day_closings', id, existing, { status: 'Rejected' }, `Rejected day closing: ${rejection_reason}`);

    res.status(200).json({ success: true, message: 'Day closing rejected successfully' });
  } catch (error) {
    console.error('Reject day closing error:', error);
    res.status(500).json({ success: false, message: 'Error rejecting day closing' });
  }
};

export const lockDayClosing = async (req, res) => {
  try {
    const { id } = req.params;
    const { lock_reason } = req.body || {};
    const conn = await getConnection();
    let existing;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT * FROM day_closings WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Day closing not found' });
      }
      existing = rows[0];

      if (existing.status !== 'Verified') {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Only Verified day closings can be locked' });
      }

      const fieldsToSet = ['status = ?', 'locked_by = ?', 'locked_at = NOW()'];
      const values = ['Locked', req.user.id];

      if (lock_reason) {
        fieldsToSet.push('lock_reason = ?');
        values.push(String(lock_reason).trim());
      }

      await conn.execute(
        `UPDATE day_closings SET ${fieldsToSet.join(', ')}, updated_at = NOW() WHERE id = ?`,
        [...values, id]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    await logApproval(req.user.id, 'day_closing', id, 'Locked', lock_reason || null);
    await logAudit(req.user.id, 'LOCK', 'day_closings', id, existing, { status: 'Locked' }, 'Locked day closing');

    res.status(200).json({ success: true, message: 'Day closing locked successfully' });
  } catch (error) {
    console.error('Lock day closing error:', error);
    res.status(500).json({ success: false, message: 'Error locking day closing' });
  }
};

export const deleteDayClosing = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = req.record || (await query('SELECT * FROM day_closings WHERE id = ?', [id]))[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Day closing not found' });
    }

    if (!['Open', 'Rejected'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Only Open or Rejected day closings can be deleted' });
    }

    await query('DELETE FROM day_closings WHERE id = ?', [id]);

    await logAudit(req.user.id, 'DELETE', 'day_closings', id, existing, null, 'Deleted day closing');

    res.status(200).json({ success: true, message: 'Day closing deleted successfully' });
  } catch (error) {
    console.error('Delete day closing error:', error);
    res.status(500).json({ success: false, message: 'Error deleting day closing' });
  }
};

export const getDayClosingSummary = async (req, res) => {
  try {
    const { outlet_id, date } = req.query || {};
    if (!outlet_id || !date) {
      return res.status(400).json({ success: false, message: 'outlet_id and date are required' });
    }

    const [cashbook] = await query(
      'SELECT * FROM daily_cashbooks WHERE outlet_id = ? AND date = ?',
      [outlet_id, date]
    );

    const [approvedExpenses] = await query(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM daily_cash_expenses
       WHERE outlet_id = ? AND date = ? AND status = 'Approved'`,
      [outlet_id, date]
    );

    const expensesByStatus = await query(
      `SELECT status, COUNT(*) as count
       FROM daily_cash_expenses
       WHERE outlet_id = ? AND date = ?
       GROUP BY status`,
      [outlet_id, date]
    );

    const expenseStatusCounts = { Draft: 0, Submitted: 0, Rejected: 0, Approved: 0 };
    for (const row of expensesByStatus) {
      expenseStatusCounts[row.status] = Number(row.count);
    }

    const [bankDeposits] = await query(
      `SELECT COALESCE(SUM(deposit_amount), 0) as verified_total,
              COUNT(*) as verified_count
       FROM bank_deposits
       WHERE outlet_id = ? AND date = ? AND status = 'Verified'`,
      [outlet_id, date]
    );

    const [pendingBankDeposits] = await query(
      `SELECT COUNT(*) as count
       FROM bank_deposits
       WHERE outlet_id = ? AND date = ? AND status IN ('Draft', 'Submitted', 'Rejected')`,
      [outlet_id, date]
    );

    const cashbookBankDeposit = cashbook ? Number(cashbook.bank_deposit) || 0 : 0;
    const verifiedBankDeposits = Number(bankDeposits.verified_total) || 0;

    const dailySalesRows = await query(
      `SELECT psu.status as upload_status,
              COALESCE(SUM(psi.gross_sales), 0) as total
       FROM petpooja_sales_items psi
       INNER JOIN petpooja_sales_uploads psu ON psi.upload_id = psu.id
       WHERE psu.outlet_id = ?
         AND ? BETWEEN COALESCE(psu.upload_date_from, psu.upload_date) AND COALESCE(psu.upload_date_to, psu.upload_date)
         AND psu.status = 'Approved'
       GROUP BY psu.status`,
      [outlet_id, date]
    );

    const approvedSales = dailySalesRows.find(r => r.upload_status === 'Approved') || {};
    const salesTotal = Number(approvedSales.total) || 0;
    const salesStatus = approvedSales.upload_status || null;

    const summary = {
      cashbook: cashbook ? {
        cashbook_id: cashbook.id,
        cashbook_status: cashbook.status,
        total_sales: Number(cashbook.total_sales) || 0,
        approved_cash_expenses: Number(approvedExpenses.total) || 0,
        bank_deposit: Number(cashbook.bank_deposit) || 0,
        closing_cash: Number(cashbook.closing_cash) || 0,
        actual_cash_in_hand: Number(cashbook.actual_cash_in_hand) || 0,
        cash_difference: Number(cashbook.cash_difference) || 0
      } : null,
      sales: {
        daily_sales_amount: salesTotal,
        daily_sales_status: salesStatus || null,
        sales_ready: salesStatus === 'Approved' && salesTotal > 0
      },
      expenses: {
        approved_cash_expenses: Number(approvedExpenses.total) || 0,
        draft_expense_count: expenseStatusCounts.Draft,
        submitted_expense_count: expenseStatusCounts.Submitted,
        rejected_expense_count: expenseStatusCounts.Rejected
      },
      bank_deposits: {
        verified_bank_deposits: verifiedBankDeposits,
        verified_deposit_count: Number(bankDeposits.verified_count) || 0,
        pending_deposit_count: Number(pendingBankDeposits.count) || 0,
        cashbook_bank_deposit: cashbookBankDeposit,
        bank_deposit_difference: cashbookBankDeposit - verifiedBankDeposits
      },
      warnings: []
    };

    if (cashbookBankDeposit !== verifiedBankDeposits) {
      summary.warnings.push(`Bank deposit mismatch: Cashbook shows ${cashbookBankDeposit}, verified deposits are ${verifiedBankDeposits}`);
    }

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error('Get day closing summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching day closing summary' });
  }
};

const fetchDailyChecklistResponses = async (checklistId) => {
  return query(
    `SELECT dcr.id, dcr.checklist_id, dcr.checklist_item_id, dcr.is_checked,
            dcr.note, dcr.checked_by, dcr.checked_at,
            dci.item_key, dci.section_key, dci.item_label, dci.description, dci.is_required, dci.sort_order
     FROM daily_checklist_responses dcr
     INNER JOIN daily_checklist_items dci ON dcr.checklist_item_id = dci.id
     WHERE dcr.checklist_id = ?
     ORDER BY dci.section_key, dci.sort_order`,
    [checklistId]
  );
};

const getDailyChecklistSummary = async (outletId, date) => {
  const [cashbook] = await query(
    'SELECT * FROM daily_cashbooks WHERE outlet_id = ? AND date = ?',
    [outletId, date]
  );

  const [approvedExpenses] = await query(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
     FROM daily_cash_expenses
     WHERE outlet_id = ? AND date = ? AND status = 'Approved'`,
    [outletId, date]
  );

  const expensesByStatus = await query(
    `SELECT status, COUNT(*) as count
     FROM daily_cash_expenses
     WHERE outlet_id = ? AND date = ?
     GROUP BY status`,
    [outletId, date]
  );

  const expenseStatusCounts = { Draft: 0, Submitted: 0, Rejected: 0, Approved: 0 };
  for (const row of expensesByStatus) {
    expenseStatusCounts[row.status] = Number(row.count);
  }

  const [bankDeposits] = await query(
    `SELECT COALESCE(SUM(deposit_amount), 0) as verified_total,
            COUNT(*) as verified_count
     FROM bank_deposits
     WHERE outlet_id = ? AND date = ? AND status = 'Verified'`,
    [outletId, date]
  );

  const [pendingBankDeposits] = await query(
    `SELECT COUNT(*) as count
     FROM bank_deposits
     WHERE outlet_id = ? AND date = ? AND status IN ('Draft', 'Submitted', 'Rejected')`,
    [outletId, date]
  );

  const cashbookBankDeposit = cashbook ? Number(cashbook.bank_deposit) || 0 : 0;
  const verifiedBankDeposits = Number(bankDeposits.verified_total) || 0;

  const dailySalesRows = await query(
    `SELECT psu.status as upload_status,
            COALESCE(SUM(psi.gross_sales), 0) as total
     FROM petpooja_sales_items psi
     INNER JOIN petpooja_sales_uploads psu ON psi.upload_id = psu.id
     WHERE psu.outlet_id = ?
       AND ? BETWEEN COALESCE(psu.upload_date_from, psu.upload_date) AND COALESCE(psu.upload_date_to, psu.upload_date)
       AND psu.status = 'Approved'
     GROUP BY psu.status`,
    [outletId, date]
  );

  const approvedSales = dailySalesRows.find(r => r.upload_status === 'Approved') || {};
  const salesTotal = Number(approvedSales.total) || 0;
  const salesStatus = approvedSales.upload_status || null;

  const [dayClosing] = await query(
    'SELECT id, status FROM day_closings WHERE outlet_id = ? AND date = ?',
    [outletId, date]
  );

  return {
    cashbook: cashbook ? {
      cashbook_id: cashbook.id,
      cashbook_status: cashbook.status,
      expected_closing_cash: Number(cashbook.closing_cash) || 0,
      actual_cash_in_hand: Number(cashbook.actual_cash_in_hand) || 0,
      difference: Number(cashbook.cash_difference) || 0
    } : null,
    sales: {
      amount: salesTotal,
      status: salesStatus || null,
      ready: salesStatus === 'Approved' && salesTotal > 0
    },
    expenses: {
      approved_amount: Number(approvedExpenses.total) || 0,
      draft_count: expenseStatusCounts.Draft,
      submitted_count: expenseStatusCounts.Submitted,
      rejected_count: expenseStatusCounts.Rejected
    },
    bank_deposits: {
      verified_amount: verifiedBankDeposits,
      verified_count: Number(bankDeposits.verified_count) || 0,
      pending_count: Number(pendingBankDeposits.count) || 0,
      cashbook_amount: cashbookBankDeposit,
      difference: cashbookBankDeposit - verifiedBankDeposits
    },
    day_closing: dayClosing ? {
      id: dayClosing.id,
      status: dayClosing.status
    } : null
  };
};

export const getDailyChecklists = async (req, res) => {
  try {
    const { outlet_id, date, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND dc.outlet_id = ?';
      params.push(outlet_id);
    }

    if (date) {
      whereClause += ' AND dc.date = ?';
      params.push(date);
    }

    if (status) {
      whereClause += ' AND dc.status = ?';
      params.push(status);
    }

    const checklists = await query(
      `SELECT dc.*, o.outlet_name,
              u1.full_name as entered_by_name,
              u2.full_name as submitted_by_name,
              u3.full_name as verified_by_name,
              u4.full_name as rejected_by_name,
              CASE dc.status
                WHEN 'Rejected' THEN u4.full_name
                WHEN 'Verified' THEN u3.full_name
                ELSE NULL
              END as reviewer_name,
              cb.status as cashbook_status,
              dcl.status as day_closing_status
       FROM daily_checklists dc
       LEFT JOIN outlets o ON dc.outlet_id = o.id
       LEFT JOIN users u1 ON dc.entered_by = u1.id
       LEFT JOIN users u2 ON dc.submitted_by = u2.id
       LEFT JOIN users u3 ON dc.verified_by = u3.id
       LEFT JOIN users u4 ON dc.rejected_by = u4.id
       LEFT JOIN daily_cashbooks cb ON dc.outlet_id = cb.outlet_id AND dc.date = cb.date
       LEFT JOIN day_closings dcl ON dc.outlet_id = dcl.outlet_id AND dc.date = dcl.date
       WHERE ${whereClause}
       ORDER BY dc.date DESC, dc.outlet_id
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    res.status(200).json({ success: true, data: checklists });
  } catch (error) {
    console.error('Get daily checklists error:', error);
    res.status(500).json({ success: false, message: 'Error fetching daily checklists' });
  }
};

export const getDailyChecklistById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = req.record || (await query('SELECT * FROM daily_checklists WHERE id = ?', [id]))[0];
    if (!record) {
      return res.status(404).json({ success: false, message: 'Daily checklist not found' });
    }

    const rows = await query(
      `SELECT dc.*, o.outlet_name,
              u1.full_name as entered_by_name,
              u2.full_name as submitted_by_name,
              u3.full_name as verified_by_name,
              u4.full_name as rejected_by_name
       FROM daily_checklists dc
       LEFT JOIN outlets o ON dc.outlet_id = o.id
       LEFT JOIN users u1 ON dc.entered_by = u1.id
       LEFT JOIN users u2 ON dc.submitted_by = u2.id
       LEFT JOIN users u3 ON dc.verified_by = u3.id
       LEFT JOIN users u4 ON dc.rejected_by = u4.id
       WHERE dc.id = ?`,
      [id]
    );

    const checklist = rows[0];
    const responses = await fetchDailyChecklistResponses(id);
    const summary = await getDailyChecklistSummary(checklist.outlet_id, toISOLocal(checklist.date));

    res.status(200).json({
      success: true,
      data: { ...checklist, responses, summary }
    });
  } catch (error) {
    console.error('Get daily checklist by id error:', error);
    res.status(500).json({ success: false, message: 'Error fetching daily checklist' });
  }
};

export const getDailyChecklistSummaryAPI = async (req, res) => {
  try {
    const { outlet_id, date } = req.query || {};
    if (!outlet_id || !date) {
      return res.status(400).json({ success: false, message: 'outlet_id and date are required' });
    }

    const [checklist] = await query(
      'SELECT id, status FROM daily_checklists WHERE outlet_id = ? AND date = ?',
      [outlet_id, date]
    );

    const summary = await getDailyChecklistSummary(outlet_id, date);

    res.status(200).json({
      success: true,
      data: {
        ...summary,
        checklist_status: checklist ? checklist.status : null
      }
    });
  } catch (error) {
    console.error('Get daily checklist summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching daily checklist summary' });
  }
};

export const createDailyChecklist = async (req, res) => {
  try {
    const { date, outlet_id, manager_remarks } = req.body || {};

    if (!date || !outlet_id) {
      return res.status(400).json({ success: false, message: 'Date and outlet are required' });
    }

    if (String(outlet_id).toLowerCase() === 'all') {
      return res.status(400).json({ success: false, message: 'outlet_id "all" is not allowed' });
    }

    const isoDate = toISOLocal(date);
    const [existing] = await query(
      'SELECT id FROM daily_checklists WHERE date = ? AND outlet_id = ?',
      [isoDate, outlet_id]
    );

    if (existing) {
      return res.status(409).json({ success: false, message: 'Daily checklist already exists for this date and outlet' });
    }

    const items = await query(
      'SELECT id FROM daily_checklist_items WHERE is_active = 1 ORDER BY section_key, sort_order'
    );

    if (!items.length) {
      return res.status(500).json({ success: false, message: 'No checklist items configured' });
    }

    const result = await query(
      `INSERT INTO daily_checklists (date, outlet_id, status, manager_remarks, entered_by, created_at)
       VALUES (?, ?, 'Open', ?, ?, NOW())`,
      [isoDate, outlet_id, manager_remarks || null, req.user.id]
    );

    const checklistId = result.insertId;

    const responseValues = items.map(() => '(?, ?, 0, NULL, NULL, NULL, NOW(), NOW())').join(', ');
    const responseParams = items.flatMap((item) => [checklistId, item.id]);

    await query(
      `INSERT INTO daily_checklist_responses
       (checklist_id, checklist_item_id, is_checked, note, checked_by, checked_at, created_at, updated_at)
       VALUES ${responseValues}`,
      responseParams
    );

    await logAudit(req.user.id, 'CREATE', 'daily_checklists', checklistId, null, { date: isoDate, outlet_id }, 'Created daily checklist');

    res.status(201).json({
      success: true,
      message: 'Daily checklist created successfully',
      data: { id: checklistId }
    });
  } catch (error) {
    console.error('Create daily checklist error:', error);
    res.status(500).json({ success: false, message: 'Error creating daily checklist' });
  }
};

export const updateDailyChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = req.record || (await query('SELECT * FROM daily_checklists WHERE id = ?', [id]))[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Daily checklist not found' });
    }

    if (!['Open', 'Rejected'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Only Open or Rejected checklists can be edited' });
    }

    const { responses, manager_remarks } = req.body || {};

    if (manager_remarks !== undefined) {
      await query('UPDATE daily_checklists SET manager_remarks = ?, updated_at = NOW() WHERE id = ?', [manager_remarks, id]);
    }

    if (Array.isArray(responses) && responses.length) {
      for (const response of responses) {
        if (!response.id) continue;
        const note = response.note !== undefined ? response.note : null;
        await query(
          `UPDATE daily_checklist_responses
           SET is_checked = ?, note = ?, checked_by = ?, checked_at = NOW(), updated_at = NOW()
           WHERE id = ? AND checklist_id = ?`,
          [response.is_checked ? 1 : 0, note, response.is_checked ? req.user.id : null, response.id, id]
        );
      }
    }

    await logAudit(req.user.id, 'UPDATE', 'daily_checklists', id, existing, { responses, manager_remarks }, 'Updated daily checklist');

    res.status(200).json({ success: true, message: 'Daily checklist updated successfully' });
  } catch (error) {
    console.error('Update daily checklist error:', error);
    res.status(500).json({ success: false, message: 'Error updating daily checklist' });
  }
};

export const submitDailyChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = req.record || (await query('SELECT * FROM daily_checklists WHERE id = ?', [id]))[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Daily checklist not found' });
    }

    if (!['Open', 'Rejected'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Only Open or Rejected checklists can be submitted' });
    }

    const missingRequired = await query(
      `SELECT dci.item_label
       FROM daily_checklist_responses dcr
       INNER JOIN daily_checklist_items dci ON dcr.checklist_item_id = dci.id
       WHERE dcr.checklist_id = ?
         AND dci.is_required = 1
         AND dcr.is_checked = 0`,
      [id]
    );

    if (missingRequired.length) {
      return res.status(400).json({
        success: false,
        message: 'Required checklist items are not completed',
        missing: missingRequired.map(r => r.item_label)
      });
    }

    await query(
      `UPDATE daily_checklists
       SET status = 'Submitted',
           submitted_by = ?,
           submitted_at = NOW(),
           rejected_by = NULL,
           rejected_at = NULL,
           rejection_reason = NULL,
           verified_by = NULL,
           verified_at = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [req.user.id, id]
    );

    await logAudit(req.user.id, 'SUBMIT', 'daily_checklists', id, existing, { status: 'Submitted' }, 'Submitted daily checklist');

    res.status(200).json({ success: true, message: 'Daily checklist submitted successfully' });
  } catch (error) {
    console.error('Submit daily checklist error:', error);
    res.status(500).json({ success: false, message: 'Error submitting daily checklist' });
  }
};

export const verifyDailyChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = req.record || (await query('SELECT * FROM daily_checklists WHERE id = ?', [id]))[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Daily checklist not found' });
    }

    if (existing.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: 'Only Submitted checklists can be verified' });
    }

    if (existing.submitted_by === req.user.id) {
      return res.status(403).json({ success: false, message: 'You cannot verify your own submission' });
    }

    await query(
      `UPDATE daily_checklists
       SET status = 'Verified', verified_by = ?, verified_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [req.user.id, id]
    );

    await logApproval(req.user.id, 'daily_checklist', id, 'Verified', null);
    await logAudit(req.user.id, 'VERIFY', 'daily_checklists', id, existing, { status: 'Verified' }, 'Verified daily checklist');

    res.status(200).json({ success: true, message: 'Daily checklist verified successfully' });
  } catch (error) {
    console.error('Verify daily checklist error:', error);
    res.status(500).json({ success: false, message: 'Error verifying daily checklist' });
  }
};

export const rejectDailyChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body || {};
    const existing = req.record || (await query('SELECT * FROM daily_checklists WHERE id = ?', [id]))[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Daily checklist not found' });
    }

    if (existing.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: 'Only Submitted checklists can be rejected' });
    }

    if (existing.submitted_by === req.user.id) {
      return res.status(403).json({ success: false, message: 'You cannot reject your own submission' });
    }

    if (!rejection_reason || !String(rejection_reason).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    await query(
      `UPDATE daily_checklists
       SET status = 'Rejected', rejected_by = ?, rejected_at = NOW(), rejection_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      [req.user.id, String(rejection_reason).trim(), id]
    );

    await logApproval(req.user.id, 'daily_checklist', id, 'Rejected', String(rejection_reason).trim());
    await logAudit(req.user.id, 'REJECT', 'daily_checklists', id, existing, { status: 'Rejected' }, `Rejected daily checklist: ${rejection_reason}`);

    res.status(200).json({ success: true, message: 'Daily checklist rejected successfully' });
  } catch (error) {
    console.error('Reject daily checklist error:', error);
    res.status(500).json({ success: false, message: 'Error rejecting daily checklist' });
  }
};

export const deleteDailyChecklist = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = req.record || (await query('SELECT * FROM daily_checklists WHERE id = ?', [id]))[0];
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Daily checklist not found' });
    }

    if (!['Open', 'Rejected'].includes(existing.status)) {
      return res.status(400).json({ success: false, message: 'Only Open or Rejected checklists can be deleted' });
    }

    await query('DELETE FROM daily_checklist_responses WHERE checklist_id = ?', [id]);
    await query('DELETE FROM daily_checklists WHERE id = ?', [id]);

    await logAudit(req.user.id, 'DELETE', 'daily_checklists', id, existing, null, 'Deleted daily checklist');

    res.status(200).json({ success: true, message: 'Daily checklist deleted successfully' });
  } catch (error) {
    console.error('Delete daily checklist error:', error);
    res.status(500).json({ success: false, message: 'Error deleting daily checklist' });
  }
};
