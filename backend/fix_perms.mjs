import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';

await query("UPDATE role_permissions SET is_read_only = 0 WHERE module_key IN ('warehouse_dashboard','warehouse_stock','warehouse_ledger','grn','locations') AND role_id != 6");
console.log('is_read_only fixed');
process.exit(0);
