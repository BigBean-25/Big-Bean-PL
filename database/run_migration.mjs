// Superseded by database/notifications_migration.sql, which now has the same
// try/catch-equivalent safety (guarded CREATE INDEX) and is the canonical
// version - kept only for historical reference, prefer the .sql file.
import { query } from '../backend/src/config/database.js';

try {
  await query(`CREATE TABLE IF NOT EXISTS notifications (
    id             INT          AUTO_INCREMENT PRIMARY KEY,
    user_id        INT          NOT NULL,
    outlet_id      INT          NULL,
    type           ENUM('info','success','warning','danger') NOT NULL DEFAULT 'info',
    title          VARCHAR(255) NOT NULL,
    message        TEXT         NOT NULL,
    reference_type VARCHAR(50)  NULL,
    reference_id   INT          NULL,
    nav_path       VARCHAR(255) NULL,
    is_read        TINYINT(1)   NOT NULL DEFAULT 0,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at        DATETIME     NULL,
    CONSTRAINT fk_notif_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
    CONSTRAINT fk_notif_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  console.log('Table created/verified OK');
} catch (e) {
  console.error('CREATE TABLE error:', e.message);
}

for (const [name, col] of [
  ['idx_notif_user_read', '(user_id, is_read)'],
  ['idx_notif_created',   '(created_at)']
]) {
  try {
    await query(`CREATE INDEX ${name} ON notifications ${col}`);
    console.log('Index created:', name);
  } catch (e) {
    console.log('Index skip:', name, '-', e.message.slice(0, 70));
  }
}

const rows = await query('DESCRIBE notifications');
console.log('Columns:', rows.map(r => r.Field).join(', '));
process.exit(0);
