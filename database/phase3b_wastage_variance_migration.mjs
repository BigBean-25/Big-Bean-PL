import { query, getConnection } from '../backend/src/config/database.js';

const conn = await getConnection();
try {
  await conn.beginTransaction();

  // Ensure stock_ledger transaction_type is wide enough for PRODUCTION_WASTAGE
  const [stockType] = await conn.execute("SHOW COLUMNS FROM stock_ledger WHERE Field = 'transaction_type'");
  if (stockType.length && stockType[0].Type.includes('varchar') && !stockType[0].Type.includes('30')) {
    await conn.execute('ALTER TABLE stock_ledger MODIFY transaction_type VARCHAR(30)');
    console.log('Widened stock_ledger.transaction_type to VARCHAR(30)');
  }

  // Additive columns on production_batches for gross / rejected / accepted output
  const batchCols = await conn.execute("SHOW COLUMNS FROM production_batches LIKE 'gross_output_qty'");
  if (batchCols[0].length === 0) {
    await conn.execute(`ALTER TABLE production_batches
      ADD COLUMN gross_output_qty DECIMAL(15,4) DEFAULT 0 AFTER actual_qty,
      ADD COLUMN rejected_output_qty DECIMAL(15,4) DEFAULT 0 AFTER gross_output_qty,
      ADD COLUMN accepted_output_qty DECIMAL(15,4) DEFAULT 0 AFTER rejected_output_qty`);
    console.log('Added output breakdown columns to production_batches');
  }

  const outCols = await conn.execute("SHOW COLUMNS FROM production_batch_outputs LIKE 'gross_output_qty'");
  if (outCols[0].length === 0) {
    await conn.execute(`ALTER TABLE production_batch_outputs
      ADD COLUMN gross_output_qty DECIMAL(15,4) DEFAULT 0 AFTER actual_qty,
      ADD COLUMN rejected_output_qty DECIMAL(15,4) DEFAULT 0 AFTER gross_output_qty,
      ADD COLUMN accepted_output_qty DECIMAL(15,4) DEFAULT 0 AFTER rejected_output_qty`);
    console.log('Added output breakdown columns to production_batch_outputs');
  }

  // Production Wastage
  await conn.execute(`CREATE TABLE IF NOT EXISTS production_wastage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wastage_no VARCHAR(40) NOT NULL UNIQUE,
    production_batch_id INT,
    central_kitchen_id INT NOT NULL,
    wastage_date DATE NOT NULL,
    wastage_type VARCHAR(40),
    reason VARCHAR(100),
    remarks TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    total_qty DECIMAL(15,4) DEFAULT 0,
    total_value DECIMAL(15,4) DEFAULT 0,
    is_posted TINYINT(1) DEFAULT 0,
    posted_at DATETIME,
    created_by INT,
    submitted_by INT,
    submitted_at DATETIME,
    verified_by INT,
    verified_at DATETIME,
    approved_by INT,
    approved_at DATETIME,
    posted_by INT,
    locked_by INT,
    locked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pw_ck FOREIGN KEY (central_kitchen_id) REFERENCES locations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pw_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id) ON DELETE SET NULL,
    CONSTRAINT fk_pw_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pw_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pw_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pw_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pw_posted_by FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pw_locked_by FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS production_wastage_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_wastage_id INT NOT NULL,
    raw_material_id INT,
    wastage_scope VARCHAR(30) NOT NULL,
    qty DECIMAL(15,4) NOT NULL,
    unit_id INT,
    base_qty DECIMAL(15,4) DEFAULT 0,
    base_unit_id INT,
    unit_cost DECIMAL(15,6) DEFAULT 0,
    value DECIMAL(15,4) DEFAULT 0,
    batch_no VARCHAR(80),
    expiry_date DATE,
    ledger_posted TINYINT(1) DEFAULT 0,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pwi_wastage FOREIGN KEY (production_wastage_id) REFERENCES production_wastage(id) ON DELETE CASCADE,
    CONSTRAINT fk_pwi_raw_mat FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
    CONSTRAINT fk_pwi_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
    CONSTRAINT fk_pwi_base_unit FOREIGN KEY (base_unit_id) REFERENCES units(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Insert permission modules into role_permissions if missing
  const modules = [
    { key: 'production_wastage', name: 'Production Wastage' },
    { key: 'production_variance', name: 'Production Variance' },
  ];

  const adminRoles = [1, 2, 3]; // Developer, Super Admin, Admin
  for (const roleId of adminRoles) {
    for (const m of modules) {
      const [rp] = await conn.execute('SELECT id FROM role_permissions WHERE role_id = ? AND module_key = ?', [roleId, m.key]);
      if (!rp.length) {
        await conn.execute(
          `INSERT INTO role_permissions
           (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
           VALUES (?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0)`,
          [roleId, m.key, m.name]
        );
      }
    }
  }
  console.log('Granted wastage/variance permissions to admin roles');

  await conn.commit();
  console.log('Phase 3B migration complete');
} catch (err) {
  await conn.rollback();
  console.error('Migration failed:', err.message);
  throw err;
} finally {
  conn.release();
  process.exit(0);
}
