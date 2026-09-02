import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';
import { ROLE_PERMISSION_MODULES, buildDefaultPermissionMatrix } from './src/utils/rolePermissionModules.js';

// These 5 module keys were used throughout the routes (checkPermission calls) but were
// never registered in ROLE_PERMISSION_MODULES, so no role could ever be granted access to
// them through the Role Access admin UI, and any newly created role got no row for them at
// all (hard 403 forever). This backfills role_permissions for every existing role, using
// the same buildDefaultPermissionMatrix() the app already uses elsewhere - not a one-off
// hardcoded role_id/role_name list, so it stays correct as roles are added later.
const newModuleKeys = [
  'warehouse_requisitions',
  'warehouse_transfers',
  'production_wastage',
  'production_variance',
  'production_dispatch',
];

const moduleNameByKey = Object.fromEntries(
  ROLE_PERMISSION_MODULES.map((m) => [m.module_key, m.module_name])
);

const roles = await query('SELECT id, role_name FROM roles');

let inserted = 0;
for (const { id, role_name } of roles) {
  const defaults = buildDefaultPermissionMatrix(role_name);
  for (const key of newModuleKeys) {
    const a = defaults[key] || {};
    try {
      const result = await query(
        `INSERT IGNORE INTO role_permissions
           (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete,
            can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, key, moduleNameByKey[key] || key,
          a.can_view || 0, a.can_create || 0, a.can_edit || 0, a.can_delete || 0,
          a.can_upload || 0, a.can_submit || 0, a.can_verify || 0, a.can_approve || 0,
          a.can_reject || 0, a.can_lock || 0, a.can_export || 0, a.is_read_only || 0,
        ]
      );
      if (result.affectedRows) inserted += result.affectedRows;
    } catch (error) {
      console.error(`Role ${role_name} (${id}) module ${key} error:`, error.message);
    }
  }
}

console.log(`Done. Inserted ${inserted} new role_permissions row(s) for ${newModuleKeys.length} module(s) across ${roles.length} role(s).`);
process.exit(0);
