import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { logAudit } from '../utils/logger.js';

export const getUsers = async (req, res) => {
  try {
    const { role_id, is_active, outlet_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (role_id) {
      whereClause += ' AND u.role_id = ?';
      params.push(role_id);
    }

    if (is_active !== undefined) {
      whereClause += ' AND u.is_active = ?';
      params.push(is_active);
    }

    if (outlet_id) {
      whereClause += ' AND uo.outlet_id = ?';
      params.push(outlet_id);
    }

    const users = await query(
      `SELECT u.*, r.role_name,
              GROUP_CONCAT(DISTINCT o.outlet_name) as assigned_outlets,
              GROUP_CONCAT(DISTINCT uo.outlet_id) as outlet_ids
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN user_outlets uo ON u.id = uo.user_id
       LEFT JOIN outlets o ON uo.outlet_id = o.id
       WHERE ${whereClause}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    // Remove password from response
    users.forEach(user => delete user.password);

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
};

export const getUsersByOutlet = async (req, res) => {
  try {
    const { outlet_id } = req.params;
    
    // Check if user has access to this outlet
    if (req.user.role_name === 'Outlet Admin' || req.user.role_name === 'Outlet Staff') {
      const userOutlets = await query(
        'SELECT outlet_id FROM user_outlets WHERE user_id = ?',
        [req.user.id]
      );
      const hasAccess = userOutlets.some(uo => uo.outlet_id == outlet_id);
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this outlet'
        });
      }
    }

    const users = await query(
      `SELECT u.*, r.role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       INNER JOIN user_outlets uo ON u.id = uo.user_id
       WHERE uo.outlet_id = ?
       ORDER BY u.full_name`,
      [outlet_id]
    );

    users.forEach(user => delete user.password);

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get users by outlet error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const users = await query(
      `SELECT u.*, r.role_name,
              GROUP_CONCAT(uo.outlet_id) as outlet_ids
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN user_outlets uo ON u.id = uo.user_id
       WHERE u.id = ?
       GROUP BY u.id`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[0];
    delete user.password;

    // Get assigned outlets details
    if (user.outlet_ids) {
      const outlets = await query(
        `SELECT id, outlet_name, outlet_code FROM outlets WHERE id IN (${user.outlet_ids})`
      );
      user.assigned_outlets = outlets;
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user'
    });
  }
};

export const createUser = async (req, res) => {
  try {
    const { full_name, email, password, phone, role_id, is_active = 1, outlet_ids } = req.body;

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await query(
      `INSERT INTO users (role_id, full_name, email, password, phone, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [role_id, full_name, email, hashedPassword, phone, is_active]
    );

    const userId = result.insertId;

    // Assign outlets if provided
    if (outlet_ids && outlet_ids.length > 0) {
      for (const outlet_id of outlet_ids) {
        await query(
          'INSERT INTO user_outlets (user_id, outlet_id, created_at) VALUES (?, ?, NOW())',
          [userId, outlet_id]
        );
      }
    }

    await logAudit(req.user.id, 'CREATE', 'users', userId, null, { full_name, email, role_id }, 'Created user');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { id: userId }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user'
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, password, phone, role_id, is_active, outlet_ids } = req.body;

    // Check if user exists
    const existing = await query('SELECT * FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is taken by another user
    if (email && email !== existing[0].email) {
      const emailCheck = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
      if (emailCheck.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    // Build update query
    const updates = [];
    const values = [];

    if (full_name) {
      updates.push('full_name = ?');
      values.push(full_name);
    }
    if (email) {
      updates.push('email = ?');
      values.push(email);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashedPassword);
    }
    if (phone) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (role_id) {
      updates.push('role_id = ?');
      values.push(role_id);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      values.push(id);

      await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Update outlet assignments if provided
    if (outlet_ids !== undefined) {
      await query('DELETE FROM user_outlets WHERE user_id = ?', [id]);
      
      if (outlet_ids.length > 0) {
        for (const outlet_id of outlet_ids) {
          await query(
            'INSERT INTO user_outlets (user_id, outlet_id, created_at) VALUES (?, ?, NOW())',
            [id, outlet_id]
          );
        }
      }
    }

    await logAudit(req.user.id, 'UPDATE', 'users', id, existing[0], req.body, 'Updated user');

    res.status(200).json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user'
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existing = await query('SELECT * FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow deleting yourself
    if (id == req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Delete outlet assignments first
    await query('DELETE FROM user_outlets WHERE user_id = ?', [id]);

    // Delete user
    await query('DELETE FROM users WHERE id = ?', [id]);

    await logAudit(req.user.id, 'DELETE', 'users', id, existing[0], null, 'Deleted user');

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user'
    });
  }
};

export const assignUserToOutlet = async (req, res) => {
  try {
    const { id } = req.params;
    const { outlet_ids } = req.body;

    // Check if user exists
    const existing = await query('SELECT id FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove existing assignments
    await query('DELETE FROM user_outlets WHERE user_id = ?', [id]);

    // Add new assignments
    if (outlet_ids && outlet_ids.length > 0) {
      for (const outlet_id of outlet_ids) {
        await query(
          'INSERT INTO user_outlets (user_id, outlet_id, created_at) VALUES (?, ?, NOW())',
          [id, outlet_id]
        );
      }
    }

    await logAudit(req.user.id, 'UPDATE', 'user_outlets', id, null, { outlet_ids }, 'Assigned user to outlets');

    res.status(200).json({
      success: true,
      message: 'User assigned to outlets successfully'
    });
  } catch (error) {
    console.error('Assign user to outlet error:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning user to outlets'
    });
  }
};
