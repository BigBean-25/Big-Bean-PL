import { query, getConnection } from '../backend/src/config/database.js';

const conn = await getConnection();
try {
  await conn.beginTransaction();

  // Ensure Central Kitchen location exists
  const [ck] = await conn.execute("SELECT id FROM locations WHERE location_type IN ('Central Kitchen','Production Unit') LIMIT 1");
  if (ck.length === 0) {
    await conn.execute(
      `INSERT INTO locations (location_code, location_name, location_type, is_inventory_location, is_active)
       VALUES ('BBC-CK-001', 'Big Bean Central Kitchen', 'Central Kitchen', 1, 1)`
    );
    console.log('Created Central Kitchen location');
  } else {
    console.log('Central Kitchen already exists id:', ck[0].id);
  }

  // Production Requests
  await conn.execute(`CREATE TABLE IF NOT EXISTS production_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_no VARCHAR(40) NOT NULL UNIQUE,
    request_date DATE NOT NULL,
    required_date DATE,
    from_outlet_id INT,
    to_central_kitchen_id INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    priority VARCHAR(20) DEFAULT 'Normal',
    remarks TEXT,
    created_by INT,
    reviewed_by INT,
    approved_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pr_from_outlet FOREIGN KEY (from_outlet_id) REFERENCES outlets(id) ON DELETE SET NULL,
    CONSTRAINT fk_pr_to_ck FOREIGN KEY (to_central_kitchen_id) REFERENCES locations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pr_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pr_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS production_request_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_request_id INT NOT NULL,
    menu_item_id INT,
    raw_material_id INT,
    requested_qty DECIMAL(15,4) NOT NULL,
    planned_qty DECIMAL(15,4) DEFAULT 0,
    unit_id INT,
    priority VARCHAR(20) DEFAULT 'Normal',
    remarks TEXT,
    status VARCHAR(30) DEFAULT 'Draft',
    reason_for_adjustment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pri_request FOREIGN KEY (production_request_id) REFERENCES production_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_pri_raw_mat FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
    CONSTRAINT fk_pri_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Production Plans
  await conn.execute(`CREATE TABLE IF NOT EXISTS production_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plan_no VARCHAR(40) NOT NULL UNIQUE,
    plan_date DATE NOT NULL,
    central_kitchen_id INT NOT NULL,
    production_item_id INT,
    demand_qty DECIMAL(15,4) DEFAULT 0,
    existing_finished_stock DECIMAL(15,4) DEFAULT 0,
    planned_production_qty DECIMAL(15,4) DEFAULT 0,
    unit_id INT,
    recipe_id INT,
    priority VARCHAR(20) DEFAULT 'Normal',
    remarks TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    created_by INT,
    approved_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pp_ck FOREIGN KEY (central_kitchen_id) REFERENCES locations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pp_item FOREIGN KEY (production_item_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
    CONSTRAINT fk_pp_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
    CONSTRAINT fk_pp_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
    CONSTRAINT fk_pp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pp_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS production_plan_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_plan_id INT NOT NULL,
    production_request_id INT,
    production_request_item_id INT,
    demand_qty DECIMAL(15,4) DEFAULT 0,
    planned_qty DECIMAL(15,4) DEFAULT 0,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ppi_plan FOREIGN KEY (production_plan_id) REFERENCES production_plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_ppi_request FOREIGN KEY (production_request_id) REFERENCES production_requests(id) ON DELETE SET NULL,
    CONSTRAINT fk_ppi_request_item FOREIGN KEY (production_request_item_id) REFERENCES production_request_items(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Production Batches
  await conn.execute(`CREATE TABLE IF NOT EXISTS production_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_no VARCHAR(40) NOT NULL UNIQUE,
    plan_id INT,
    central_kitchen_id INT NOT NULL,
    finished_product_id INT,
    recipe_id INT,
    planned_qty DECIMAL(15,4) DEFAULT 0,
    actual_qty DECIMAL(15,4) DEFAULT 0,
    unit_id INT,
    batch_no_output VARCHAR(80),
    mfg_date DATE,
    expiry_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    is_posted TINYINT(1) DEFAULT 0,
    posted_at DATETIME,
    created_by INT,
    started_by INT,
    completed_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pb_plan FOREIGN KEY (plan_id) REFERENCES production_plans(id) ON DELETE SET NULL,
    CONSTRAINT fk_pb_ck FOREIGN KEY (central_kitchen_id) REFERENCES locations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pb_product FOREIGN KEY (finished_product_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
    CONSTRAINT fk_pb_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
    CONSTRAINT fk_pb_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
    CONSTRAINT fk_pb_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pb_started_by FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_pb_completed_by FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS production_batch_materials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_batch_id INT NOT NULL,
    raw_material_id INT NOT NULL,
    recipe_item_id INT,
    required_qty DECIMAL(15,4) DEFAULT 0,
    required_unit_id INT,
    actual_issued_qty DECIMAL(15,4) DEFAULT 0,
    actual_unit_id INT,
    unit_cost DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    batch_no VARCHAR(80),
    expiry_date DATE,
    stock_ledger_reference_type VARCHAR(30),
    stock_ledger_reference_id INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pbm_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id) ON DELETE CASCADE,
    CONSTRAINT fk_pbm_raw_mat FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE,
    CONSTRAINT fk_pbm_req_unit FOREIGN KEY (required_unit_id) REFERENCES units(id) ON DELETE SET NULL,
    CONSTRAINT fk_pbm_actual_unit FOREIGN KEY (actual_unit_id) REFERENCES units(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS production_batch_outputs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_batch_id INT NOT NULL,
    finished_product_id INT,
    actual_qty DECIMAL(15,4) DEFAULT 0,
    unit_id INT,
    unit_cost DECIMAL(15,4) DEFAULT 0,
    total_cost DECIMAL(15,4) DEFAULT 0,
    batch_no VARCHAR(80),
    mfg_date DATE,
    expiry_date DATE,
    stock_ledger_reference_id INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pbo_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id) ON DELETE CASCADE,
    CONSTRAINT fk_pbo_product FOREIGN KEY (finished_product_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
    CONSTRAINT fk_pbo_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.execute('CREATE INDEX idx_pr_status ON production_requests(status)');
  await conn.execute('CREATE INDEX idx_pp_status ON production_plans(status)');
  await conn.execute('CREATE INDEX idx_pb_status ON production_batches(status)');
  await conn.execute('CREATE INDEX idx_pbm_batch ON production_batch_materials(production_batch_id)');
  await conn.execute('CREATE INDEX idx_pbo_batch ON production_batch_outputs(production_batch_id)');

  await conn.commit();
  console.log('Phase 3A production tables created OK');
} catch (e) {
  await conn.rollback();
  console.error('Phase 3A migration error:', e.message);
  process.exit(1);
} finally {
  conn.release();
  process.exit(0);
}
