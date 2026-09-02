import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    location_code VARCHAR(50) NOT NULL UNIQUE,
    location_name VARCHAR(100) NOT NULL,
    location_type ENUM('Outlet','Central Warehouse','Central Kitchen','Corporate Office','Dark Store') NOT NULL,
    outlet_id INT NULL UNIQUE,
    is_inventory_location TINYINT(1) NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_loc_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // database/warehouse_phase2a_migration.mjs creates this same `locations`
  // table with extra columns (gstin, address, city, state, pincode, phone,
  // email) that the CREATE TABLE above does not include. Since both scripts
  // use CREATE TABLE IF NOT EXISTS, whichever one runs first "wins" the
  // table shape, and code selecting those columns would break if this file
  // ran first. These idempotent ADD COLUMN IF NOT EXISTS statements bring
  // this file's `locations` table up to the same shape regardless of run
  // order, so both scripts converge on one final schema.
  await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS gstin VARCHAR(20) NULL`);
  await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS address TEXT NULL`);
  await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS city VARCHAR(50) NULL`);
  await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS state VARCHAR(50) NULL`);
  await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS pincode VARCHAR(10) NULL`);
  await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL`);
  await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS email VARCHAR(100) NULL`);

  await query(`CREATE TABLE IF NOT EXISTS grn (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grn_no VARCHAR(50) NOT NULL UNIQUE,
    grn_date DATE NOT NULL,
    supplier_id INT NULL,
    warehouse_location_id INT NOT NULL,
    purchase_reference VARCHAR(100) NULL,
    invoice_reference VARCHAR(100) NULL,
    total_amount DECIMAL(14,4) NOT NULL DEFAULT 0,
    status ENUM('Draft','Posted') NOT NULL DEFAULT 'Draft',
    remarks TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_grn_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    CONSTRAINT fk_grn_warehouse FOREIGN KEY (warehouse_location_id) REFERENCES locations(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS grn_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grn_id INT NOT NULL,
    raw_material_id INT NOT NULL,
    ordered_qty DECIMAL(14,4) NULL,
    received_qty DECIMAL(14,4) NOT NULL,
    rejected_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    accepted_qty DECIMAL(14,4) NOT NULL,
    unit_id INT NOT NULL,
    rate DECIMAL(14,6) NOT NULL,
    tax_amount DECIMAL(14,4) NULL DEFAULT 0,
    total_amount DECIMAL(14,4) NOT NULL,
    batch_no VARCHAR(50) NULL,
    expiry_date DATE NULL,
    remarks TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gri_grn FOREIGN KEY (grn_id) REFERENCES grn(id) ON DELETE CASCADE,
    CONSTRAINT fk_gri_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
    CONSTRAINT fk_gri_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS stock_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL,
    raw_material_id INT NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type ENUM('OPENING','PURCHASE_GRN','TRANSFER_IN','TRANSFER_OUT','PRODUCTION_RECEIPT','PRODUCTION_ISSUE','PURCHASE_RETURN','WASTAGE','ADJUSTMENT_POSITIVE','ADJUSTMENT_NEGATIVE','PHYSICAL_ADJUSTMENT') NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    reference_id INT NOT NULL,
    reference_item_id INT NULL,
    qty_in DECIMAL(14,4) NOT NULL DEFAULT 0,
    qty_out DECIMAL(14,4) NOT NULL DEFAULT 0,
    unit_id INT NOT NULL,
    unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0,
    value_in DECIMAL(14,4) NOT NULL DEFAULT 0,
    value_out DECIMAL(14,4) NOT NULL DEFAULT 0,
    batch_no VARCHAR(50) NULL,
    expiry_date DATE NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sl_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sl_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sl_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
    UNIQUE KEY uq_stock_ledger (transaction_type, reference_type, reference_id, reference_item_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  console.log('Warehouse Phase 2A tables created/verified');
}

migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
