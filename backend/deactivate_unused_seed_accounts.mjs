// Deactivates the 2 remaining seed accounts (RRN Staff, Viewer) instead of
// hard-deleting them - login already requires is_active=1 (authController.js),
// so this fully blocks login without risking a foreign-key error or
// cascading away any real record these accounts may have created on their
// one prior login (Aug 9).
import dotenv from 'dotenv';
dotenv.config();
import { getConnection } from './src/config/database.js';

const IDS = [11, 12]; // rrn.staff@bigbean.local, viewer@bigbean.local

const conn = await getConnection();
const results = [];
try {
  for (const id of IDS) {
    const [[before]] = await conn.query('SELECT id, email, is_active FROM users WHERE id = ?', [id]);
    if (!before) {
      results.push(`SKIP id=${id}: no such user`);
      continue;
    }
    await conn.execute('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    const [[after]] = await conn.query('SELECT is_active FROM users WHERE id = ?', [id]);
    results.push(after.is_active === 0
      ? `OK id=${id} (${before.email}): deactivated, verified`
      : `WARNING id=${id} (${before.email}): update ran but is_active shows ${after.is_active}`);
  }
} catch (e) {
  results.push(`ERROR: ${e.message || e}`);
} finally {
  conn.release();
}

console.log(results.join('\n'));
await new Promise((r) => setTimeout(r, 200));
process.exit(0);
