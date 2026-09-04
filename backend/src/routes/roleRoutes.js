import express from 'express';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { query, getConnection } from '../config/database.js';
import { ROLE_PERMISSION_MODULES, PERMISSION_ACTIONS, buildDefaultPermissionMatrix } from '../utils/rolePermissionModules.js';

const router = express.Router();

// Get all roles
router.get('/', protect, checkPermission('roles', 'can_view'), async (req, res) => {
  try {
    const roles = await query('SELECT id, role_name, permissions, description, is_active FROM roles ORDER BY id');

    res.status(200).json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roles'
    });
  }
});

// Create a new role and initialize empty role_permissions
router.post('/', protect, checkPermission('roles', 'can_create'), async (req, res) => {
  const { role_name, description, is_active } = req.body;

    if (!role_name || !String(role_name).trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required' });
    }

    const normalizedName = String(role_name).trim();
    const existing = await query('SELECT id FROM roles WHERE role_name = ?', [normalizedName]);

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Role name already exists' });
    }

    const connection = await getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        'INSERT INTO roles (role_name, description, is_active, permissions) VALUES (?, ?, ?, ?)',
        [normalizedName, description || null, is_active === false || is_active === '0' ? 0 : 1, null]
      );

      const roleId = result.insertId;

      // Seed from buildDefaultPermissionMatrix() rather than all-zero rows -
      // a role name it recognizes (Accountant, Warehouse Admin, etc.) starts
      // with a sensible working default instead of every module blocked
      // until an admin manually checks every box. Unrecognized custom names
      // still fall back to its safe dashboard-only default.
      const defaults = buildDefaultPermissionMatrix(normalizedName);
      const placeholders = PERMISSION_ACTIONS.map(() => '?').join(', ');

      for (const module of ROLE_PERMISSION_MODULES) {
        const perms = defaults[module.module_key] || {};
        await connection.query(
          `INSERT INTO role_permissions
           (role_id, module_key, module_name, ${PERMISSION_ACTIONS.join(', ')})
           VALUES (?, ?, ?, ${placeholders})`,
          [roleId, module.module_key, module.module_name, ...PERMISSION_ACTIONS.map((action) => (perms[action] ? 1 : 0))]
        );
      }

      await connection.commit();

      const newRole = await query('SELECT id, role_name, description, is_active FROM roles WHERE id = ?', [roleId]);

      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: newRole[0]
      });
    } catch (error) {
      await connection.rollback().catch(() => {});
      console.error('Create role error:', error);

      if (error.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ success: false, message: 'role_permissions table is missing. Run database/role_permissions_migration.sql' });
      }

      res.status(500).json({ success: false, message: 'Error creating role' });
    } finally {
      connection.release();
    }
});

export default router;
