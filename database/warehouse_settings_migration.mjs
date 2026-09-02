import { query, getConnection } from '../backend/src/config/database.js';

const conn = await getConnection();
try {
  await conn.execute(`CREATE TABLE IF NOT EXISTS warehouse_settings (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    location_id  INT NOT NULL,
    setting_key  VARCHAR(80) NOT NULL,
    setting_value TEXT NOT NULL,
    value_type   ENUM('boolean','integer','decimal','string','json') NOT NULL DEFAULT 'string',
    updated_by   INT NULL,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_location_key (location_id, setting_key),
    CONSTRAINT fk_ws_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    CONSTRAINT fk_ws_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.execute('CREATE INDEX idx_ws_location ON warehouse_settings (location_id)');
  await conn.execute('CREATE INDEX idx_ws_key ON warehouse_settings (setting_key)');

  console.log('warehouse_settings table created OK');
  const rows = await conn.execute('DESCRIBE warehouse_settings');
  console.log('Columns:', rows[0].map(r => r.Field).join(', '));
} catch (e) {
  console.error('Migration error:', e.message);
} finally {
  conn.release();
  process.exit(0);
}
