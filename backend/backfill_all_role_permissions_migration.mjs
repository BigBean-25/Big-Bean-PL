import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';
import { ROLE_PERMISSION_MODULES, buildDefaultPermissionMatrix } from './src/utils/rolePermissionModules.js';

// General sweep: some roles were created before certain module keys existed (e.g.
// warehouse_settings was added after 4 of the 8 roles already existed), so those
// roles never got a role_permissions row for it at all - a permanent hard 403,
// indistinguishable from "intentionally no access" in the UI. INSERT IGNORE makes
// this safe to re-run any time a new module key is added; it only fills gaps, never
// touches an existing row.
const moduleNameByKey = Object.fromEntries(
  ROLE_PERMISSION_MODULES.map((m) => [m.module_key, m.module_name])
);

const roles = await query('SELECT id, role_name FROM roles');

let inserted = 0;
const filled = [];
for (const { id, role_name } of roles) {
  const defaults = buildDefaultPermissionMatrix(role_name);
  for (const module of ROLE_PERMISSION_MODULES) {
    const key = module.module_key;
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
      if (result.affectedRows) {
        inserted += result.affectedRows;
        filled.push(`${role_name} / ${key}`);
      }
    } catch (error) {
      console.error(`Role ${role_name} (${id}) module ${key} error:`, error.message);
    }
  }
}

console.log(`Done. Backfilled ${inserted} missing role_permissions row(s) across ${roles.length} role(s) x ${ROLE_PERMISSION_MODULES.length} module(s).`);
if (filled.length) console.log('Filled:\n' + filled.join('\n'));
process.exit(0);
