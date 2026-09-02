import dotenv from 'dotenv';
dotenv.config();
import { query } from './src/config/database.js';

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS stock_requisitions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requisition_no VARCHAR(50) NOT NULL UNIQUE,
    from_location_id INT NOT NULL,
    to_location_id INT NOT NULL,
    request_date DATE NOT NULL,
    required_date DATE NULL,
    status ENUM('Draft','Submitted','Partially Approved','Approved','Rejected','Dispatched','In Transit','Partially Received','Received','Cancelled') NOT NULL DEFAULT 'Draft',
    remarks TEXT NULL,
    created_by INT NULL,
    submitted_by INT NULL,
    submitted_at DATETIME NULL,
    approved_by INT NULL,
    approved_at DATETIME NULL,
    rejected_by INT NULL,
    rejected_at DATETIME NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sr_from FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sr_to FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sr_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sr_submitted FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sr_approved FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sr_rejected FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS stock_requisition_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requisition_id INT NOT NULL,
    raw_material_id INT NOT NULL,
    requested_qty DECIMAL(14,4) NOT NULL,
    approved_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    unit_id INT NOT NULL,
    remarks TEXT NULL,
    CONSTRAINT fk_sri_req FOREIGN KEY (requisition_id) REFERENCES stock_requisitions(id) ON DELETE CASCADE,
    CONSTRAINT fk_sri_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sri_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS stock_transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transfer_no VARCHAR(50) NOT NULL UNIQUE,
    requisition_id INT NOT NULL,
    from_location_id INT NOT NULL,
    to_location_id INT NOT NULL,
    dispatch_date DATE NOT NULL,
    status ENUM('Draft','Dispatched','In Transit','Partially Received','Received','Cancelled') NOT NULL DEFAULT 'Draft',
    vehicle_no VARCHAR(50) NULL,
    driver_name VARCHAR(100) NULL,
    dispatch_reference VARCHAR(100) NULL,
    remarks TEXT NULL,
    dispatched_by INT NULL,
    received_by INT NULL,
    received_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_st_req FOREIGN KEY (requisition_id) REFERENCES stock_requisitions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_st_from FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_st_to FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_st_dispatched FOREIGN KEY (dispatched_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_st_received FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transfer_id INT NOT NULL,
    raw_material_id INT NOT NULL,
    approved_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    dispatched_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    received_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    short_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    damaged_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
    unit_id INT NOT NULL,
    unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0,
    batch_no VARCHAR(50) NULL,
    expiry_date DATE NULL,
    remarks TEXT NULL,
    CONSTRAINT fk_sti_transfer FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
    CONSTRAINT fk_sti_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sti_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  console.log('Warehouse Phase 2B tables created/verified');
}

migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
