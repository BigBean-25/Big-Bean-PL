import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import { query } from './src/config/database.js';

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS physical_stock_counts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    count_no VARCHAR(50) NOT NULL UNIQUE,
    location_id INT NOT NULL,
    count_date DATE NOT NULL,
    status ENUM('Draft','Submitted','Verified','Approved','Posted','Locked') NOT NULL DEFAULT 'Draft',
    total_system_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    total_counted_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    total_variance_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    total_variance_value DECIMAL(14,4) NOT NULL DEFAULT 0,
    remarks TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    submitted_by INT NULL,
    submitted_at DATETIME NULL,
    verified_by INT NULL,
    verified_at DATETIME NULL,
    approved_by INT NULL,
    approved_at DATETIME NULL,
    posted_by INT NULL,
    posted_at DATETIME NULL,
    locked_by INT NULL,
    locked_at DATETIME NULL,
    CONSTRAINT fk_psc_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_psc_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_psc_submitted FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_psc_verified FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_psc_approved FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_psc_posted FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_psc_locked FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS physical_stock_count_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    physical_count_id INT NOT NULL,
    raw_material_id INT NOT NULL,
    unit_id INT NOT NULL,
    batch_no VARCHAR(50) NULL,
    expiry_date DATE NULL,
    system_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    counted_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    variance_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0,
    variance_value DECIMAL(14,4) NOT NULL DEFAULT 0,
    reason VARCHAR(100) NULL,
    ledger_posted TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_psci_count FOREIGN KEY (physical_count_id) REFERENCES physical_stock_counts(id) ON DELETE CASCADE,
    CONSTRAINT fk_psci_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
    CONSTRAINT fk_psci_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS stock_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    adjustment_no VARCHAR(50) NOT NULL UNIQUE,
    location_id INT NOT NULL,
    adjustment_date DATE NOT NULL,
    status ENUM('Draft','Submitted','Verified','Approved','Posted','Locked') NOT NULL DEFAULT 'Draft',
    adjustment_reason ENUM('Inventory Correction','Damage','Expiry','Recount','Other') NULL,
    total_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    total_value DECIMAL(14,4) NOT NULL DEFAULT 0,
    remarks TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    submitted_by INT NULL,
    submitted_at DATETIME NULL,
    verified_by INT NULL,
    verified_at DATETIME NULL,
    approved_by INT NULL,
    approved_at DATETIME NULL,
    posted_by INT NULL,
    posted_at DATETIME NULL,
    locked_by INT NULL,
    locked_at DATETIME NULL,
    CONSTRAINT fk_sa_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sa_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sa_submitted FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sa_verified FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sa_approved FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sa_posted FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sa_locked FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS stock_adjustment_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stock_adjustment_id INT NOT NULL,
    raw_material_id INT NOT NULL,
    unit_id INT NOT NULL,
    batch_no VARCHAR(50) NULL,
    expiry_date DATE NULL,
    qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0,
    value DECIMAL(14,4) NOT NULL DEFAULT 0,
    adjustment_type ENUM('Positive','Negative') NOT NULL,
    reason VARCHAR(100) NULL,
    ledger_posted TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sai_adj FOREIGN KEY (stock_adjustment_id) REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    CONSTRAINT fk_sai_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sai_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS warehouse_wastage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wastage_no VARCHAR(50) NOT NULL UNIQUE,
    location_id INT NOT NULL,
    wastage_date DATE NOT NULL,
    status ENUM('Draft','Submitted','Verified','Approved','Posted','Locked') NOT NULL DEFAULT 'Draft',
    total_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    total_value DECIMAL(14,4) NOT NULL DEFAULT 0,
    remarks TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    submitted_by INT NULL,
    submitted_at DATETIME NULL,
    verified_by INT NULL,
    verified_at DATETIME NULL,
    approved_by INT NULL,
    approved_at DATETIME NULL,
    posted_by INT NULL,
    posted_at DATETIME NULL,
    locked_by INT NULL,
    locked_at DATETIME NULL,
    CONSTRAINT fk_ww_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ww_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_ww_submitted FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_ww_verified FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_ww_approved FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_ww_posted FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_ww_locked FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS warehouse_wastage_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    warehouse_wastage_id INT NOT NULL,
    raw_material_id INT NOT NULL,
    unit_id INT NOT NULL,
    batch_no VARCHAR(50) NULL,
    expiry_date DATE NULL,
    qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0,
    value DECIMAL(14,4) NOT NULL DEFAULT 0,
    wastage_type ENUM('Damage','Expiry','Spoilage','Other') NOT NULL,
    reason VARCHAR(100) NULL,
    ledger_posted TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wwi_wastage FOREIGN KEY (warehouse_wastage_id) REFERENCES warehouse_wastage(id) ON DELETE CASCADE,
    CONSTRAINT fk_wwi_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
    CONSTRAINT fk_wwi_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  console.log('Warehouse Phase 2C tables created/verified');
}

migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
