// One-off remediation: every seeded user account (all except id=40, which
// already has its own password) shares the same bcrypt hash for "Admin@123"
// - and per check_seed_users_status.mjs, these are real, actively-used
// production logins (Super Admin, Admin, and most outlet managers have
// recent last_login timestamps), not stale test accounts. This generates a
// unique strong password per account, hashes each with bcryptjs (matching
// authController.js's bcrypt.hash(..., 10) exactly), and updates them
// individually. The plaintext list is printed once and written to a local
// result file for distribution - DELETE that file once the passwords have
// been handed off, it is not meant to be kept or committed.
import dotenv from 'dotenv';
dotenv.config();
import { getConnection } from './src/config/database.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const SEED_HASH = '$2a$10$0zpwesdecFeJH/.qFmw.OOZfKc2gbUbMn4gpBwHpdjyaVUaDC06Ti';

// Excludes visually-ambiguous characters (0/O, 1/l/I) - these get read off a
// screen or typed on a phone by real people, not pasted from a manager.
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
function genPassword(length = 14) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

const conn = await getConnection();
const results = [];
try {
  const [users] = await conn.query(
    `SELECT id, email, full_name FROM users WHERE password = ? ORDER BY id`,
    [SEED_HASH]
  );

  if (users.length === 0) {
    results.push('No users currently have the shared seed password - nothing to do.');
  } else {
    for (const u of users) {
      const newPassword = genPassword();
      const hash = await bcrypt.hash(newPassword, 10);
      await conn.execute('UPDATE users SET password = ? WHERE id = ?', [hash, u.id]);
      results.push(`${u.email}  (${u.full_name})  ->  ${newPassword}`);
    }
    results.unshift(`Reset ${users.length} account(s):\n`);
  }
} catch (e) {
  results.push(`ERROR: ${e.message || e}`);
} finally {
  conn.release();
}

const { writeFileSync } = await import('fs');
const text = results.join('\n') + '\n';
writeFileSync('reset_shared_seed_passwords.result.txt', text);
console.log(text);
await new Promise((r) => setTimeout(r, 200));
process.exit(0);
