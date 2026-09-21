import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';
import { ROLE_PERMISSION_MODULES, buildDefaultPermissionMatrix } from './src/utils/rolePermissionModules.js';

// Phase 7B2 (Req 2) - permission DATA only, no schema change.
//
// Outlet Admin / Outlet Manager are the outlet-scoped operational roles that
// raise stock requests. The canonical default matrix already grants them
// warehouse_requisitions {can_view, can_create, can_submit, can_export}, but
// the historical backfill scripts all use INSERT IGNORE - they fill missing
// rows yet never repair an existing all-zero row, so deployments seeded before
// the grant existed (or where a row was manually cleared) are still locked out.
//
// This script:
//   - inserts the canonical default row when none exists (seed parity)
//   - sets can_view / can_create / can_submit to 1 on any existing row
//   - NEVER clears a flag and NEVER touches can_edit / can_verify /
//     can_approve / can_reject / can_lock / can_delete / is_read_only -
//     can_edit on warehouse_requisitions gates DISPATCH, and approve/reject
//     are the warehouse-side checker step, so none of those may ever be set
//     on an outlet maker role here
//   - touches ONLY the listed role names and ONLY module_key
//     'warehouse_requisitions'
//
// Idempotent: re-running produces identical rows (set-to-1 is a fixed point).
// Outlet Staff is deliberately absent - the canonical matrix keeps it
// front-line entry only.

const MODULE_KEY = 'warehouse_requisitions';
const TARGET_ROLES = ['Outlet Admin', 'Outlet Manager'];
const MODULE_NAME = (ROLE_PERMISSION_MODULES.find((m) => m.module_key === MODULE_KEY) || {}).module_name || MODULE_KEY;

const roles = await query(
  `SELECT id, role_name FROM roles WHERE role_name IN (${TARGET_ROLES.map(() => '?').join(',')})`,
  TARGET_ROLES
);

for (const { id, role_name } of roles) {
  const d = buildDefaultPermissionMatrix(role_name)[MODULE_KEY] || {};
  await query(
    `INSERT INTO role_permissions
       (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete,
        can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE can_view = 1, can_create = 1, can_submit = 1`,
    [
      id, MODULE_KEY, MODULE_NAME,
      d.can_view || 0, d.can_create || 0, d.can_edit || 0, d.can_delete || 0,
      d.can_upload || 0, d.can_submit || 0, d.can_verify || 0, d.can_approve || 0,
      d.can_reject || 0, d.can_lock || 0, d.can_export || 0, d.is_read_only || 0,
    ]
  );
  console.log(`${role_name} (role_id ${id}): warehouse_requisitions -> can_view/can_create/can_submit ensured`);
}

console.log('Done. Outlet Purchase Order maker permissions ensured (idempotent, additive only).');
process.exit(0);
