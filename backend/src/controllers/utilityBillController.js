import { query } from '../config/database.js';
import { assertSafeColumnNames } from '../utils/validators.js';
import { logAudit, logApproval } from '../utils/logger.js';
import { notifyAdmins, notifyUser } from '../utils/notificationService.js';

export const getUtilityBills = async (req, res) => {
  try {
    const { outlet_id, month, year, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND ub.outlet_id = ?';
      params.push(outlet_id);
    }

    if (month) {
      whereClause += ' AND ub.month = ?';
      params.push(month);
    }

    if (year) {
      whereClause += ' AND ub.year = ?';
      params.push(year);
    }

    if (status) {
      whereClause += ' AND ub.status = ?';
      params.push(status);
    }

    const bills = await query(
      `SELECT ub.*, o.outlet_name,
              u1.full_name as created_by_name
       FROM utility_bills ub
       LEFT JOIN outlets o ON ub.outlet_id = o.id
       LEFT JOIN users u1 ON ub.created_by = u1.id
       WHERE ${whereClause}
       ORDER BY ub.year DESC, ub.month DESC, ub.outlet_id
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    res.status(200).json({
      success: true,
      data: bills
    });
  } catch (error) {
    console.error('Get utility bills error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching utility bills'
    });
  }
};

export const createUtilityBill = async (req, res) => {
  try {
    const billData = {
      ...req.body,
      created_by: req.user.id,
      status: 'Draft',
      bill_attachment: req.file?.path || null
    };

    const existing = await query(
      'SELECT id FROM utility_bills WHERE month = ? AND year = ? AND outlet_id = ?',
      [billData.month, billData.year, billData.outlet_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Utility bill record already exists for this month/year/outlet'
      });
    }

    const fields = Object.keys(billData);
    assertSafeColumnNames(fields);
    const values = Object.values(billData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO utility_bills (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'utility_bills', result.insertId, null, billData, 'Created utility bill record');

    await notifyAdmins({
      actorId: req.user.id,
      outletId: billData.outlet_id,
      type: 'info',
      title: 'Utility Bill Submitted',
      message: `A utility bill has been submitted for ${billData.month}/${billData.year}.`,
      referenceType: 'utility_bill',
      referenceId: result.insertId,
      navPath: '/month-end/utility-bills'
    });

    res.status(201).json({
      success: true,
      message: 'Utility bill record created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create utility bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating utility bill record'
    });
  }
};

export const updateUtilityBill = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM utility_bills WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Utility bill record not found'
      });
    }

    if (existing[0].status === 'Verified') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit verified utility bill record'
      });
    }

    const updateData = { ...req.body };
    if (req.file?.path) {
      updateData.bill_attachment = req.file.path;
    }

    const fields = Object.keys(updateData);
    assertSafeColumnNames(fields);
    const values = Object.values(updateData);
    const setClause = fields.map(f => `${f} = ?`).join(', ');

    await query(
      `UPDATE utility_bills SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, id]
    );

    await logAudit(req.user.id, 'UPDATE', 'utility_bills', id, existing[0], updateData, 'Updated utility bill record');

    res.status(200).json({
      success: true,
      message: 'Utility bill record updated successfully'
    });
  } catch (error) {
    console.error('Update utility bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating utility bill record'
    });
  }
};

export const deleteUtilityBill = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM utility_bills WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Utility bill record not found'
      });
    }

    await query('DELETE FROM utility_bills WHERE id = ?', [id]);

    await logAudit(req.user.id, 'DELETE', 'utility_bills', id, existing[0], null, 'Deleted utility bill record');

    res.status(200).json({
      success: true,
      message: 'Utility bill deleted successfully'
    });
  } catch (error) {
    console.error('Delete utility bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting utility bill record'
    });
  }
};

export const verifyUtilityBill = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!['Verified', 'Submitted'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action'
      });
    }

    const existing = await query('SELECT * FROM utility_bills WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Utility bill record not found' });
    }

    // Same two bugs already found and fixed in payrollController.js's
    // verifyEmployeeSalary: (1) no status-transition guard at all - this
    // used to let either action fire from any current status, including an
    // already-Verified or otherwise-final record; (2) the self-check applied
    // to both Submitted and Verified, blocking a lone Accountant (the only
    // role with utility_bills.can_verify, gating this single combined
    // endpoint) from ever submitting their own draft.
    const requiredFromStatus = action === 'Submitted' ? 'Draft' : 'Submitted';
    if (existing[0].status !== requiredFromStatus) {
      return res.status(400).json({
        success: false,
        message: `Utility bill record must be ${requiredFromStatus} before it can be marked ${action}`
      });
    }
    if (action === 'Verified' && Number(existing[0].created_by) === Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Users cannot verify their own utility bill record' });
    }

    await query(
      `UPDATE utility_bills SET status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?`,
      [action, req.user.id, id]
    );

    await logApproval(req.user.id, 'utility_bills', id, action, null);

    await notifyUser({
      userId: existing[0].created_by,
      outletId: existing[0].outlet_id,
      type: action === 'Verified' ? 'success' : 'info',
      title: `Utility Bill ${action}`,
      message: `Utility bill for ${existing[0].month}/${existing[0].year} has been ${action.toLowerCase()}.`,
      referenceType: 'utility_bill',
      referenceId: id,
      navPath: '/month-end/utility-bills'
    });

    res.status(200).json({
      success: true,
      message: `Utility bill record ${action.toLowerCase()} successfully`
    });
  } catch (error) {
    console.error('Verify utility bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying utility bill record'
    });
  }
};
