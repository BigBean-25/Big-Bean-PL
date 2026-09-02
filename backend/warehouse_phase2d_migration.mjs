import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, './.env') });

const addColumnIfMissing = async (table, column, def) => {
  const cols = await query(`SHOW COLUMNS FROM ${table}`);
  if (!cols.find(c => c.Field === column)) {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    console.log(`Added ${column} to ${table}`);
  } else {
    console.log(`${column} already exists in ${table}`);
  }
};

const migrate = async () => {
  await addColumnIfMissing('raw_materials', 'is_batch_tracked', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('raw_materials', 'is_expiry_tracked', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('raw_materials', 'near_expiry_days', 'INT NOT NULL DEFAULT 7');
  console.log('Phase 2D additive schema migration complete');
};

migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
