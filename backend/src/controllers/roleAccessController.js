import { query } from '../config/database.js';
import { PERMISSION_ACTIONS, matrixToRows, rowsToPermissionObject } from '../utils/rolePermissionModules.js';

const canManageRoleAccess = (roleName = '') => ['Super Admin', 'Admin', 'Technical Admin', 'Developer'].includes(String(roleName || '').trim());

const normalizePermissionRows = (roleId, roleName, rows = []) => matrixToRows(roleId, roleName, rows);

export const getRoleAccessRoles = async (req, res) => {
  try {
    if (!canManageRoleAccess(req.user.role_name)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }

    const roles = await query(
      `SELECT id, role_name, description, is_active
       FROM roles
       WHERE COALESCE(is_active, 1) = 1
       ORDER BY id ASC`
    );

    res.json({ success: true, data: roles, roles });
  } catch (error) {
    console.error('Get role access roles error:', error);
    res.status(500).json({ success: false, message: 'Error fetching roles' });
  }
};

export const getRolePermissions = async (req, res) => {
  try {
    if (!canManageRoleAccess(req.user.role_name)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }

    const { roleId } = req.params;
    const roles = await query('SELECT id, role_name FROM roles WHERE id = ?', [roleId]);

    if (roles.length === 0) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    const rows = await query('SELECT * FROM role_permissions WHERE role_id = ? ORDER BY module_name ASC', [roleId]);
    const permissions = normalizePermissionRows(roleId, roles[0].role_name, rows);

    res.json({
      success: true,
      data: {
        role: roles[0],
        permissions,
        permissions_object: rowsToPermissionObject(permissions)
      }
    });
  } catch (error) {
    console.error('Get role permissions error:', error);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      const roleId = req.params.roleId;
      const roles = await query('SELECT id, role_name FROM roles WHERE id = ?', [roleId]);
      if (roles.length === 0) {
        return res.status(404).json({ success: false, message: 'Role not found' });
      }
      const permissions = normalizePermissionRows(roleId, roles[0].role_name, []);
      return res.json({
        success: true,
        migration_required: true,
        message: 'role_permissions table is missing. Run database/role_permissions_migration.sql before saving changes.',
        data: {
          role: roles[0],
          permissions,
          permissions_object: rowsToPermissionObject(permissions)
        }
      });
    }
    res.status(500).json({ success: false, message: 'Error fetching role permissions' });
  }
};

export const updateRolePermissions = async (req, res) => {
  try {
    if (!canManageRoleAccess(req.user.role_name)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }

    const { roleId } = req.params;
    const roles = await query('SELECT id, role_name FROM roles WHERE id = ?', [roleId]);

    if (roles.length === 0) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    const payload = Array.isArray(req.body.permissions) ? req.body.permissions : [];

    for (const item of payload) {
      if (!item.module_key || !item.module_name) continue;

      const values = PERMISSION_ACTIONS.map((action) => (item[action] ? 1 : 0));
      await query(
        `INSERT INTO role_permissions
         (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           module_name = VALUES(module_name),
           can_view = VALUES(can_view),
           can_create = VALUES(can_create),
           can_edit = VALUES(can_edit),
           can_delete = VALUES(can_delete),
           can_upload = VALUES(can_upload),
           can_submit = VALUES(can_submit),
           can_verify = VALUES(can_verify),
           can_approve = VALUES(can_approve),
           can_reject = VALUES(can_reject),
           can_lock = VALUES(can_lock),
           can_export = VALUES(can_export),
           is_read_only = VALUES(is_read_only)`,
        [roleId, item.module_key, item.module_name, ...values]
      );
    }

    const rows = await query('SELECT * FROM role_permissions WHERE role_id = ? ORDER BY module_name ASC', [roleId]);
    const permissions = normalizePermissionRows(roleId, roles[0].role_name, rows);

    res.json({
      success: true,
      message: 'Role permissions saved successfully',
      data: {
        role: roles[0],
        permissions,
        permissions_object: rowsToPermissionObject(permissions)
      }
    });
  } catch (error) {
    console.error('Update role permissions error:', error);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(400).json({ success: false, message: 'role_permissions table is missing. Run database/role_permissions_migration.sql before saving changes.' });
    }
    res.status(500).json({ success: false, message: 'Error saving role permissions' });
  }
};
