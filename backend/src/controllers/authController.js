import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { logAudit } from '../utils/logger.js';
import { getRolePermissions } from '../utils/roleAccess.js';
import { matrixToRows, rowsToPermissionObject } from '../utils/rolePermissionModules.js';

const getRolePermissionObject = async (roleId, roleName) => {
  try {
    const rows = await query('SELECT * FROM role_permissions WHERE role_id = ?', [roleId]);
    return rowsToPermissionObject(matrixToRows(roleId, roleName, rows));
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return rowsToPermissionObject(matrixToRows(roleId, roleName, []));
    }
    throw error;
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const users = await query(
      `SELECT u.*, r.role_name, r.permissions 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.email = ? AND u.is_active = 1`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = users[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const userOutlets = await query(
      `SELECT uo.outlet_id id, o.outlet_name, o.outlet_code
       FROM user_outlets uo
       LEFT JOIN outlets o ON o.id = uo.outlet_id
       WHERE uo.user_id = ?`,
      [user.id]
    );

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role_name,
        role_id: user.role_id,
        role_name: user.role_name,
        outlet_ids: userOutlets.map(o => o.id)
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    const permissions = await getRolePermissionObject(user.role_id, user.role_name);

    await logAudit(user.id, 'LOGIN', 'users', user.id, null, null, 'User logged in');

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role_name,
        role_name: user.role_name,
        is_active: user.is_active,
        permissions,
        legacy_permissions: getRolePermissions(user.role_name),
        outlets: userOutlets
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

export const getMe = async (req, res) => {
  try {
    const userOutlets = await query(
      `SELECT o.id, o.outlet_name, o.outlet_code FROM outlets o 
       INNER JOIN user_outlets uo ON o.id = uo.outlet_id 
       WHERE uo.user_id = ?`,
      [req.user.id]
    );

    const permissions = await getRolePermissionObject(req.user.role_id, req.user.role_name);

    res.status(200).json({
      success: true,
      data: {
        id: req.user.id,
        full_name: req.user.full_name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role_name,
        role_name: req.user.role_name,
        is_active: req.user.is_active,
        permissions,
        legacy_permissions: getRolePermissions(req.user.role_name),
        outlets: userOutlets
      },
      user: {
        id: req.user.id,
        full_name: req.user.full_name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role_name,
        role_name: req.user.role_name,
        is_active: req.user.is_active,
        permissions,
        legacy_permissions: getRolePermissions(req.user.role_name),
        outlets: userOutlets
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    const users = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = users[0];

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);

    await logAudit(req.user.id, 'PASSWORD_CHANGE', 'users', req.user.id, null, null, 'Password changed');

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
