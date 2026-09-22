import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';
import { ROLE_PERMISSION_MODULES, buildDefaultPermissionMatrix } from './src/utils/rolePermissionModules.js';

// Phase 7D2A2 (Req 11) - permission DATA only, no schema change.
//
// The outlet vendor payment maker-checker (submit/verify/reject) now lives
// behind can_submit / can_verify / can_reject on the existing
// 'outlet_vendors' module key, but deployments seeded before this grant -
// or where a row was manually cleared - still hold rows without those
// flags, since prior backfill scripts never repair an existing row.
//
// This script:
//   - inserts the canonical default row when none exists (seed parity)
//   - turns ON only the workflow flags each role actually needs:
//       Outlet Admin / Outlet Manager -> can_submit (makers)
//       Accountant                    -> can_submit + can_verify + can_reject
//   - NEVER clears a flag and NEVER grants can_verify / can_reject to the
//     outlet maker roles - checker actions stay with Accountant/admin roles
//   - touches ONLY the listed role names and ONLY module_key
//     'outlet_vendors'
//
// Idempotent: re-running produces identical rows (set-to-1 is a fixed point).

const MODULE_KEY = 'outlet_vendors';
const MAKER_ROLES = ['Outlet Admin', 'Outlet Manager'];
const CHECKER_ROLES = ['Accountant'];
const MODULE_NAME = (ROLE_PERMISSION_MODULES.find((m) => m.module_key === MODULE_KEY) || {}).module_name || MODULE_KEY;

const allRoles = [...MAKER_ROLES, ...CHECKER_ROLES];
const roles = await query(
  `SELECT id, role_name FROM roles WHERE role_name IN (${allRoles.map(() => '?').join(',')})`,
  allRoles
);

for (const { id, role_name } of roles) {
  const d = buildDefaultPermissionMatrix(role_name)[MODULE_KEY] || {};
  const isChecker = CHECKER_ROLES.includes(role_name);
  const update = isChecker
    ? 'can_submit = 1, can_verify = 1, can_reject = 1'
    : 'can_submit = 1';
  await query(
    `INSERT INTO role_permissions
       (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete,
        can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE ${update}`,
    [
      id, MODULE_KEY, MODULE_NAME,
      d.can_view || 0, d.can_create || 0, d.can_edit || 0, d.can_delete || 0,
      d.can_upload || 0, d.can_submit || 0, d.can_verify || 0, d.can_approve || 0,
      d.can_reject || 0, d.can_lock || 0, d.can_export || 0, d.is_read_only || 0,
    ]
  );
  console.log(`${role_name} (role_id ${id}): outlet_vendors -> ${update} ensured`);
}

console.log('Done. Outlet vendor payment workflow permissions ensured (idempotent, additive only).');
process.exit(0);
