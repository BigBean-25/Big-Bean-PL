import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';
import { ROLE_PERMISSION_MODULES, buildDefaultPermissionMatrix } from './src/utils/rolePermissionModules.js';

const newModuleKeys = [
  'warehouse_dashboard',
  'warehouse_stock',
  'warehouse_ledger',
  'grn',
  'locations'
];

const rows = await query('SELECT id, role_name FROM roles');

for (const { id, role_name } of rows) {
  const defaults = buildDefaultPermissionMatrix(role_name);
  for (const key of newModuleKeys) {
    const actions = defaults[key] || { can_view: 0, can_create: 0, can_edit: 0, can_delete: 0, can_upload: 0, can_export: 0, can_approve: 0, can_reject: 0, can_verify: 0, can_submit: 0, is_read_only: 0 };
    try {
      await query(
        `INSERT IGNORE INTO role_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete, can_upload, can_export, can_approve, can_reject, can_verify, can_submit, is_read_only)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, key, actions.can_view || 0, actions.can_create || 0, actions.can_edit || 0, actions.can_delete || 0, actions.can_upload || 0, actions.can_export || 0, actions.can_approve || 0, actions.can_reject || 0, actions.can_verify || 0, actions.can_submit || 0, actions.is_read_only || 0]
      );
    } catch (error) {
      console.error(`Role ${role_name} module ${key} error:`, error.message);
    }
  }
}

console.log('Warehouse permission rows inserted');
process.exit(0);
