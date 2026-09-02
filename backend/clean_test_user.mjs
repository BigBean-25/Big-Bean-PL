import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';

await query("DELETE FROM users WHERE email = 'test.wh@bigbean.local'");
await query("DELETE FROM stock_ledger WHERE location_id IN (SELECT id FROM locations WHERE location_code LIKE 'TEST%')");
await query("DELETE FROM grn_items WHERE grn_id IN (SELECT id FROM grn WHERE grn_no LIKE 'TEST%')");
await query("DELETE FROM grn WHERE grn_no LIKE 'TEST%'");
await query("DELETE FROM locations WHERE location_code LIKE 'TEST%'");
console.log('cleaned synthetic test data');
process.exit(0);
