import { query } from '../config/database.js';
import { logAudit, logApproval } from '../utils/logger.js';

export const getEmployeeSalaries = async (req, res) => {
  try {
    const { outlet_id, month, year, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND es.outlet_id = ?';
      params.push(outlet_id);
    }

    if (month) {
      whereClause += ' AND es.month = ?';
      params.push(month);
    }

    if (year) {
      whereClause += ' AND es.year = ?';
      params.push(year);
    }

    if (status) {
      whereClause += ' AND es.status = ?';
      params.push(status);
    }

    const salaries = await query(
      `SELECT es.*, o.outlet_name,
              u1.full_name as created_by_name
       FROM employee_salary_monthly es
       LEFT JOIN outlets o ON es.outlet_id = o.id
       LEFT JOIN users u1 ON es.created_by = u1.id
       WHERE ${whereClause}
       ORDER BY es.year DESC, es.month DESC, es.outlet_id
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    res.status(200).json({
      success: true,
      data: salaries
    });
  } catch (error) {
    console.error('Get employee salaries error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee salaries'
    });
  }
};

export const createEmployeeSalary = async (req, res) => {
  try {
    const salaryData = {
      ...req.body,
      created_by: req.user.id,
      status: 'Draft'
    };

    // Check if record already exists for this month/year/outlet
    const existing = await query(
      'SELECT id FROM employee_salary_monthly WHERE month = ? AND year = ? AND outlet_id = ?',
      [salaryData.month, salaryData.year, salaryData.outlet_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Salary record already exists for this month/year/outlet'
      });
    }

    const fields = Object.keys(salaryData);
    const values = Object.values(salaryData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO employee_salary_monthly (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'employee_salary_monthly', result.insertId, null, salaryData, 'Created employee salary record');

    res.status(201).json({
      success: true,
      message: 'Employee salary record created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create employee salary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating employee salary record'
    });
  }
};

export const updateEmployeeSalary = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if exists and is editable
    const existing = await query('SELECT * FROM employee_salary_monthly WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }

    if (existing[0].status === 'Verified') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit verified salary record'
      });
    }

    const fields = Object.keys(req.body);
    const values = Object.values(req.body);
    const setClause = fields.map(f => `${f} = ?`).join(', ');

    await query(
      `UPDATE employee_salary_monthly SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, id]
    );

    await logAudit(req.user.id, 'UPDATE', 'employee_salary_monthly', id, existing[0], req.body, 'Updated employee salary record');

    res.status(200).json({
      success: true,
      message: 'Employee salary record updated successfully'
    });
  } catch (error) {
    console.error('Update employee salary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating employee salary record'
    });
  }
};

export const deleteEmployeeSalary = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM employee_salary_monthly WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }

    if (existing[0].status === 'Verified') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete verified salary record'
      });
    }

    await query('DELETE FROM employee_salary_monthly WHERE id = ?', [id]);

    await logAudit(req.user.id, 'DELETE', 'employee_salary_monthly', id, existing[0], null, 'Deleted employee salary record');

    res.status(200).json({
      success: true,
      message: 'Employee salary record deleted successfully'
    });
  } catch (error) {
    console.error('Delete employee salary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting employee salary record'
    });
  }
};

export const verifyEmployeeSalary = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!['Verified', 'Submitted'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action'
      });
    }

    await query(
      `UPDATE employee_salary_monthly SET status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?`,
      [action, req.user.id, id]
    );

    await logApproval(req.user.id, 'employee_salary_monthly', id, action, null);

    res.status(200).json({
      success: true,
      message: `Salary record ${action.toLowerCase()} successfully`
    });
  } catch (error) {
    console.error('Verify employee salary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying employee salary record'
    });
  }
};
