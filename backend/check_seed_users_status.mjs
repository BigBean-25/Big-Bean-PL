// Read-only check: are the 5 seeded @bigbean.local accounts still the only
// accounts, or has real staff data been added since? Informs whether
// rotating their shared password is pure cleanup or affects live logins.
import dotenv from 'dotenv';
dotenv.config();
import { getConnection } from './src/config/database.js';

const conn = await getConnection();
let out = [];
try {
  const [allUsers] = await conn.query(
    `SELECT u.id, u.full_name, u.email, r.role_name, u.is_active, u.last_login,
            (u.password = '$2a$10$0zpwesdecFeJH/.qFmw.OOZfKc2gbUbMn4gpBwHpdjyaVUaDC06Ti') AS has_seed_password
     FROM users u LEFT JOIN roles r ON r.id = u.role_id
     ORDER BY u.id`
  );
  out.push(`Total users: ${allUsers.length}`);
  for (const u of allUsers) {
    out.push(`id=${u.id} email=${u.email} role=${u.role_name} active=${u.is_active} last_login=${u.last_login} seed_password=${u.has_seed_password ? 'YES' : 'no'}`);
  }
} catch (e) {
  out.push(`ERROR: ${e.message || e}`);
} finally {
  conn.release();
}
const { writeFileSync } = await import('fs');
const text = out.join('\n') + '\n';
writeFileSync('check_seed_users_status.result.txt', text);
console.log(text);
await new Promise((r) => setTimeout(r, 200));
process.exit(0);
