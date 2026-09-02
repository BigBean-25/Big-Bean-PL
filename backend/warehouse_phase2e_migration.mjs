import dotenv from 'dotenv';
import { query } from './src/config/database.js';

dotenv.config();

const tables = [
  `CREATE TABLE IF NOT EXISTS purchase_returns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_no VARCHAR(50) NOT NULL UNIQUE,
    return_date DATE NOT NULL,
    supplier_id INT NOT NULL,
    grn_id INT,
    warehouse_location_id INT NOT NULL,
    supplier_invoice_reference VARCHAR(100),
    supplier_credit_note_no VARCHAR(100),
    supplier_credit_note_date DATE,
    return_reason VARCHAR(100),
    remarks TEXT,
    total_return_qty DECIMAL(18,6) DEFAULT 0,
    total_return_value DECIMAL(18,6) DEFAULT 0,
    status ENUM('Draft','Submitted','Verified','Approved','Rejected','Posted','Locked') DEFAULT 'Draft',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    submitted_by INT,
    submitted_at TIMESTAMP NULL,
    verified_by INT,
    verified_at TIMESTAMP NULL,
    approved_by INT,
    approved_at TIMESTAMP NULL,
    posted_by INT,
    posted_at TIMESTAMP NULL,
    locked_by INT,
    locked_at TIMESTAMP NULL,
    rejected_by INT,
    rejected_at TIMESTAMP NULL,
    rejection_reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_return_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_return_id INT NOT NULL,
    grn_item_id INT,
    raw_material_id INT NOT NULL,
    batch_no VARCHAR(100),
    expiry_date DATE,
    return_qty DECIMAL(18,6) NOT NULL,
    input_unit_id INT NOT NULL,
    base_qty DECIMAL(18,6) NOT NULL,
    base_unit_id INT NOT NULL,
    original_purchase_rate DECIMAL(18,6) NOT NULL,
    supplier_credit_value DECIMAL(18,6) NOT NULL,
    inventory_unit_cost DECIMAL(18,6) NOT NULL,
    inventory_value DECIMAL(18,6) NOT NULL,
    reason VARCHAR(100),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS supplier_credits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    purchase_return_id INT NOT NULL,
    credit_note_no VARCHAR(100),
    credit_note_date DATE,
    credit_amount DECIMAL(18,6) NOT NULL,
    status ENUM('Pending','Received','Reconciled') DEFAULT 'Pending',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
];

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_pr_supplier ON purchase_returns(supplier_id)',
  'CREATE INDEX IF NOT EXISTS idx_pr_grn ON purchase_returns(grn_id)',
  'CREATE INDEX IF NOT EXISTS idx_pr_location ON purchase_returns(warehouse_location_id)',
  'CREATE INDEX IF NOT EXISTS idx_pri_return ON purchase_return_items(purchase_return_id)',
  'CREATE INDEX IF NOT EXISTS idx_pri_material ON purchase_return_items(raw_material_id)',
  'CREATE INDEX IF NOT EXISTS idx_sc_supplier ON supplier_credits(supplier_id)',
  'CREATE INDEX IF NOT EXISTS idx_sc_return ON supplier_credits(purchase_return_id)',
];

async function main() {
  for (const sql of tables) {
    await query(sql);
  }
  for (const sql of indexes) {
    try { await query(sql); } catch (e) { console.log('index warn:', e.message); }
  }
  console.log('Phase 2E migration complete');
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
