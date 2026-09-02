import { query } from './src/config/database.js';

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    po_no VARCHAR(50) NOT NULL UNIQUE,
    po_date DATE NOT NULL,
    supplier_id INT NOT NULL,
    warehouse_location_id INT NOT NULL,
    expected_delivery_date DATE NULL,
    payment_terms VARCHAR(100) NULL,
    reference VARCHAR(100) NULL,
    remarks TEXT NULL,
    subtotal DECIMAL(14,4) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(14,4) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(14,4) NOT NULL DEFAULT 0,
    total_amount DECIMAL(14,4) NOT NULL DEFAULT 0,
    status ENUM('Draft','Submitted','Approved','Sent','Partially Received','Received','Rejected','Closed') NOT NULL DEFAULT 'Draft',
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    submitted_by INT NULL,
    submitted_at TIMESTAMP NULL,
    approved_by INT NULL,
    approved_at TIMESTAMP NULL,
    sent_by INT NULL,
    sent_at TIMESTAMP NULL,
    closed_by INT NULL,
    closed_at TIMESTAMP NULL,
    close_reason TEXT NULL,
    rejected_by INT NULL,
    rejected_at TIMESTAMP NULL,
    rejection_reason TEXT NULL,
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_location FOREIGN KEY (warehouse_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_po_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_po_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_po_sent_by FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_po_closed_by FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_po_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id INT NOT NULL,
    raw_material_id INT NOT NULL,
    ordered_qty DECIMAL(14,4) NOT NULL,
    unit_id INT NOT NULL,
    rate DECIMAL(14,6) NOT NULL,
    discount DECIMAL(14,4) NOT NULL DEFAULT 0,
    tax DECIMAL(14,4) NOT NULL DEFAULT 0,
    line_value DECIMAL(14,4) NOT NULL DEFAULT 0,
    batch_required TINYINT(1) NOT NULL DEFAULT 0,
    expiry_required TINYINT(1) NOT NULL DEFAULT 0,
    remarks TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_poi_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
    CONSTRAINT fk_poi_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  try {
    await query(`ALTER TABLE grn ADD COLUMN purchase_order_id INT NULL AFTER purchase_reference,
      ADD CONSTRAINT fk_grn_purchase_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL`);
  } catch (e) { console.log('grn.purchase_order_id add/alter:', e.message); }

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id)',
    'CREATE INDEX IF NOT EXISTS idx_po_location ON purchase_orders(warehouse_location_id)',
    'CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(purchase_order_id)',
    'CREATE INDEX IF NOT EXISTS idx_grn_po ON grn(purchase_order_id)',
  ];
  for (const sql of indexes) { try { await query(sql); } catch (e) { console.log('index warn:', e.message); } }

  console.log('Warehouse Phase 2F migration complete');
  process.exit(0);
}

migrate().catch((e) => { console.error(e); process.exit(1); });
