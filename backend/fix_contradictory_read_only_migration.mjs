import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';

// rolePermissionModules.js's full() helper blindly mapped every PERMISSION_ACTIONS
// entry (including the is_read_only modifier flag) to 1. checkPermission() treats
// is_read_only=1 as "block every write action regardless of the individual can_*
// flags" - so any role_permissions row seeded via full() ended up self-contradictory:
// granted can_create/can_edit/etc., but silently write-blocked anyway by is_read_only.
// This is fixed going forward in rolePermissionModules.js; this migration corrects
// rows already written with the contradiction. The condition is safe and general:
// a row that genuinely means "read only" never has any write action granted, so
// only rows with BOTH is_read_only=1 AND at least one write action=1 are touched -
// a real Viewer-style row is never affected.
const result = await query(`
  UPDATE role_permissions
  SET is_read_only = 0
  WHERE is_read_only = 1
    AND (can_create=1 OR can_edit=1 OR can_delete=1 OR can_approve=1 OR can_submit=1
         OR can_verify=1 OR can_reject=1 OR can_lock=1 OR can_upload=1)
`);
console.log(`Fixed ${result.affectedRows} contradictory role_permissions row(s) (is_read_only=1 with write access granted).`);
process.exit(0);
