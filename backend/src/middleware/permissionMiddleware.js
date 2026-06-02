import { query } from '../config/database.js';
import { rowsToPermissionObject } from '../utils/rolePermissionModules.js';

const superRoles = ['Super Admin', 'Admin', 'Technical Admin', 'Developer'];

export const loadRolePermissions = async (roleId) => {
  const rows = await query('SELECT * FROM role_permissions WHERE role_id = ?', [roleId]);
  return rowsToPermissionObject(rows);
};

export const checkPermission = (moduleKey, action = 'can_view') => {
  return async (req, res, next) => {
    try {
      if (superRoles.includes(req.user?.role_name)) {
        return next();
      }

      const rows = await query(
        `SELECT ${action} permission_value, is_read_only
         FROM role_permissions
         WHERE role_id = ? AND module_key = ?
         LIMIT 1`,
        [req.user.role_id, moduleKey]
      );

      const permission = rows[0];
      const isWriteAction = action !== 'can_view' && action !== 'can_export';

      if (!permission || !permission.permission_value || (permission.is_read_only && isWriteAction)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action'
        });
      }

      return next();
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ success: false, message: 'role_permissions table is missing. Run database/role_permissions_migration.sql' });
      }
      console.error('Permission check error:', error);
      return res.status(500).json({ success: false, message: 'Error checking permission' });
    }
  };
};
