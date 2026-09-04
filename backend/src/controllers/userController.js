import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';
import { logAudit } from '../utils/logger.js';
import { canAccessAllOutlets } from '../utils/roleAccess.js';
import { validateContactFields } from '../utils/validators.js';

// Reassigning someone's role_id is a stronger action than "edit a user's
// contact details" - it's a privilege change. users.can_edit alone is too
// broad a gate for it (e.g. Technical Admin has users.can_edit for
// onboarding/support, but was never meant to be able to promote an account,
// including its own, to Super Admin). Only these two roles may change role_id.
const ROLE_REASSIGNMENT_ROLES = ['Super Admin', 'Developer'];

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

    // req.outletScope (set by applyOutletScope) is the source of truth for
    // outlet-locked roles - it already resolves to the caller's own assigned
    // outlet even when the client sends no outlet_id at all, so a Outlet
    // Admin/Staff/Manager can never list another outlet's users just by
    // omitting the query param. Full-access roles keep seeing every outlet
    // unless they explicitly filter.
    const scope = req.outletScope;
    if (scope && !scope.all) {
      whereClause += ' AND uo.outlet_id = ?';
      params.push(scope.outletIds[0]);
    } else if (outlet_id) {
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

    // Outlet-locked roles (Outlet Admin/Staff/Manager, Franchise/Franchise
    // Owner) may only look up their own outlet's users - matches
    // LOCKED_OUTLET_ROLES rather than a hardcoded role-name pair, so it
    // stays correct as new locked roles are added instead of silently
    // letting them through.
    if (!canAccessAllOutlets(req.user.role_name)) {
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

    if (!id || isNaN(Number(id))) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

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

    // Same outlet-scope check updateUser already applies below in this file -
    // getUserById had none at all, so an outlet-locked caller with users.can_view
    // (e.g. a Franchise Owner) could read any other outlet's user record by id.
    if (!canAccessAllOutlets(req.user.role_name)) {
      const callerOutletIds = (req.user.outlet_ids || []).map((oid) => Number(oid));
      const targetOutletIds = (user.outlet_ids || '')
        .split(',')
        .filter(Boolean)
        .map((oid) => Number(oid));
      const sharesOutlet = targetOutletIds.some((oid) => callerOutletIds.includes(oid));
      if (!sharesOutlet) {
        return res.status(403).json({
          success: false,
          message: 'You can only view users assigned to your own outlet'
        });
      }
    }

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

    const contactError = validateContactFields({ email, phone });
    if (contactError) {
      return res.status(400).json({ success: false, message: contactError });
    }

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

    // Assign outlets if provided. Same restriction updateUser/assignUserToOutlet
    // already apply - a non-full-access creator can only grant outlets they
    // themselves have, otherwise they could create a user scoped to an
    // outlet they can't even see themselves. Not currently reachable by any
    // configured role (every outlet-locked role's users.can_create is
    // false today), kept for consistency with the sibling endpoints and as
    // a safeguard if that ever changes.
    let nextOutletIds = outlet_ids;
    if (outlet_ids && outlet_ids.length > 0 && !canAccessAllOutlets(req.user.role_name)) {
      const callerOutletIds = (req.user.outlet_ids || []).map((oid) => Number(oid));
      nextOutletIds = outlet_ids.filter((oid) => callerOutletIds.includes(Number(oid)));
    }

    if (nextOutletIds && nextOutletIds.length > 0) {
      for (const outlet_id of nextOutletIds) {
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

    const contactError = validateContactFields({ email, phone });
    if (contactError) {
      return res.status(400).json({ success: false, message: contactError });
    }

    // Check if user exists
    const existing = await query('SELECT * FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (role_id && Number(role_id) !== Number(existing[0].role_id) && !ROLE_REASSIGNMENT_ROLES.includes(req.user.role_name)) {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin or Developer can change a user\'s role'
      });
    }

    if (!canAccessAllOutlets(req.user.role_name)) {
      const callerOutletIds = (req.user.outlet_ids || []).map((oid) => Number(oid));
      const targetOutletRows = await query('SELECT outlet_id FROM user_outlets WHERE user_id = ?', [id]);
      const targetOutletIds = targetOutletRows.map((r) => Number(r.outlet_id));
      const sharesOutlet = targetOutletIds.some((oid) => callerOutletIds.includes(oid));
      if (!sharesOutlet) {
        return res.status(403).json({
          success: false,
          message: 'You can only manage users assigned to your own outlet'
        });
      }
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

    // Update outlet assignments if provided. A non-full-access editor can
    // only grant outlets they themselves have - otherwise editing a peer's
    // outlet_ids would be a way to hand out access to outlets the editor
    // can't even see themselves.
    if (outlet_ids !== undefined) {
      let nextOutletIds = outlet_ids;
      if (!canAccessAllOutlets(req.user.role_name)) {
        const callerOutletIds = (req.user.outlet_ids || []).map((oid) => Number(oid));
        nextOutletIds = outlet_ids.filter((oid) => callerOutletIds.includes(Number(oid)));
      }
      await query('DELETE FROM user_outlets WHERE user_id = ?', [id]);

      if (nextOutletIds.length > 0) {
        for (const outlet_id of nextOutletIds) {
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

export const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const userId = Number(id);
    if (!id || isNaN(userId)) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (userId === Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You cannot delete or deactivate your own account'
      });
    }

    const existing = await query('SELECT id, is_active FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const next = Number(is_active) === 1 ? 1 : 0;

    await query('UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?', [next, userId]);

    res.status(200).json({
      success: true,
      message: next === 1 ? 'User activated successfully' : 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ success: false, message: 'Error updating user status' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const userId = Number(id);
    if (!id || isNaN(userId)) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if user exists
    const existing = await query('SELECT id, is_active FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Don't allow deleting yourself
    if (userId === Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You cannot delete or deactivate your own account'
      });
    }

    // Check for foreign-key references before deleting
    const conflictBody = {
      success: false,
      code: 'USER_HAS_HISTORY',
      message: 'This user cannot be permanently deleted because historical records are linked to this account. Deactivate the user instead.'
    };

    try {
      const foreignKeys = await query(
        `SELECT TABLE_NAME, COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND REFERENCED_TABLE_NAME = 'users'
           AND REFERENCED_COLUMN_NAME = 'id'`,
        []
      );

      const excludeTables = ['users', 'user_outlets'];
      const childTables = foreignKeys.filter((row) => !excludeTables.includes(row.TABLE_NAME));

      if (childTables.length > 0) {
        const checkSql = childTables
          .map((row) => `(SELECT 1 AS dep FROM \`${row.TABLE_NAME}\` WHERE \`${row.COLUMN_NAME}\` = ? LIMIT 1)`)
          .join(' UNION ALL ');
        const params = childTables.map(() => userId);

        const dependencies = await query(checkSql, params);
        if (dependencies.length > 0) {
          return res.status(409).json(conflictBody);
        }
      }
    } catch (fkError) {
      console.warn('FK dependency check warning:', fkError.message || fkError);
    }

    // Delete outlet assignments first
    await query('DELETE FROM user_outlets WHERE user_id = ?', [userId]);

    // Delete user
    try {
      await query('DELETE FROM users WHERE id = ?', [userId]);
    } catch (error) {
      if (
        error.code === 'ER_ROW_IS_REFERENCED_2' ||
        error.code === 'ER_ROW_IS_REFERENCED' ||
        error.code === 'ER_FK_CONSTRAINT_VIOLATION' ||
        error.code === 'ER_CANNOT_DELETE_PARENT' ||
        error.sqlMessage?.includes('foreign key constraint')
      ) {
        return res.status(409).json(conflictBody);
      }
      throw error;
    }

    await logAudit(req.user.id, 'DELETE', 'users', userId, existing[0], null, 'Deleted user permanently');

    res.status(200).json({
      success: true,
      message: 'User deleted permanently'
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

    let nextOutletIds = outlet_ids || [];
    if (!canAccessAllOutlets(req.user.role_name)) {
      const callerOutletIds = (req.user.outlet_ids || []).map((oid) => Number(oid));
      nextOutletIds = nextOutletIds.filter((oid) => callerOutletIds.includes(Number(oid)));
    }

    // Remove existing assignments
    await query('DELETE FROM user_outlets WHERE user_id = ?', [id]);

    // Add new assignments
    if (nextOutletIds.length > 0) {
      for (const outlet_id of nextOutletIds) {
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
