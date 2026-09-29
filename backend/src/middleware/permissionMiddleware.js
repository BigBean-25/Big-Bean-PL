import { query } from '../config/database.js';
import { rowsToPermissionObject } from '../utils/rolePermissionModules.js';

export const loadRolePermissions = async (roleId) => {
  const rows = await query('SELECT * FROM role_permissions WHERE role_id = ?', [roleId]);
  return rowsToPermissionObject(rows);
};

export const checkPermission = (moduleKey, action = 'can_view') => {
  return async (req, res, next) => {
    try {
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

// Allows the request when the given action is granted on ANY of the listed
// module keys (e.g. the vendor lookup shared by the master / purchases /
// ledger modules). Mirrors checkPermission's read-only semantics: read-only
// roles may still view/export but are blocked from write actions.
export const checkAnyModulePermission = (moduleKeys = [], action = 'can_view') => {
  return async (req, res, next) => {
    try {
      const rows = await query(
        `SELECT * FROM role_permissions
         WHERE role_id = ? AND module_key IN (${moduleKeys.map(() => '?').join(',')})`,
        [req.user.role_id, ...moduleKeys]
      );

      const isWriteAction = action !== 'can_view' && action !== 'can_export';
      const allowed = rows.some(
        (row) => row[action] && !(row.is_read_only && isWriteAction)
      );

      if (!allowed) {
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

// Allows the request when ANY of the listed actions on the module is granted
// (e.g. transfer receive: can_submit OR legacy can_edit). Read-only roles are
// still blocked because every alternative action is a write.
export const checkAnyPermission = (moduleKey, actions = []) => {
  return async (req, res, next) => {
    try {
      const rows = await query(
        `SELECT * FROM role_permissions
         WHERE role_id = ? AND module_key = ?
         LIMIT 1`,
        [req.user.role_id, moduleKey]
      );

      const permission = rows[0];
      const allowed = permission && !permission.is_read_only
        && actions.some((action) => permission[action]);

      if (!allowed) {
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
