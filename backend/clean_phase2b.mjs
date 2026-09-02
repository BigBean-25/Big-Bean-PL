import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';

await query("DELETE FROM users WHERE email = 'test.wh2b@bigbean.local'");
await query("DELETE FROM stock_ledger WHERE location_id IN (SELECT id FROM locations WHERE location_code LIKE 'TEST%')");
await query("DELETE FROM stock_transfer_items WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE transfer_no LIKE 'TEST%')");
await query("DELETE FROM stock_transfers WHERE transfer_no LIKE 'TEST%'");
await query("DELETE FROM stock_requisition_items WHERE requisition_id IN (SELECT id FROM stock_requisitions WHERE requisition_no LIKE 'TEST%')");
await query("DELETE FROM stock_requisitions WHERE requisition_no LIKE 'TEST%'");
await query("DELETE FROM locations WHERE location_code LIKE 'TEST%'");

console.log('cleaned 2B test data');
process.exit(0);
