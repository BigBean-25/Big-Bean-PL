import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';

async function alter() {
  await query(`ALTER TABLE stock_ledger
    MODIFY COLUMN transaction_type ENUM(
      'OPENING','PURCHASE_GRN','TRANSFER_IN','TRANSFER_OUT','TRANSIT_DAMAGE','TRANSIT_SHORT',
      'PRODUCTION_RECEIPT','PRODUCTION_ISSUE','PURCHASE_RETURN','WASTAGE',
      'ADJUSTMENT_POSITIVE','ADJUSTMENT_NEGATIVE','PHYSICAL_ADJUSTMENT'
    ) NOT NULL`);
  console.log('Added TRANSIT_DAMAGE and TRANSIT_SHORT to stock_ledger transaction_type enum');
}

alter().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
