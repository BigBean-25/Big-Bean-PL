import fs from 'fs';
import path from 'path';

const envPath = path.resolve('backend/.env');
try {
  const envText = fs.readFileSync(envPath, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      process.env[m[1]] = m[2].replace(/^['"](.*)['"]$/s, '$1').trim();
    }
  }
  console.log('Loaded env from', envPath);
} catch (e) {
  console.log('No .env file at', envPath, e.message);
}

const { query } = await import('../backend/src/config/database.js');

const run = async (sql, label) => {
  try {
    await query(sql);
    console.log('OK:', label);
  } catch (error) {
    if (error.message.includes('Duplicate column name') || error.message.includes('already exists') || error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_TABLE_EXISTS_ERROR' || error.message.includes('ER_CANT_DROP_FIELD_OR_KEY')) {
      console.log('SKIP:', label, '-', error.message.slice(0, 60));
    } else {
      console.error('FAIL:', label, error.message);
      throw error;
    }
  }
};

// UOM conversions for deterministic cross-unit calculation
try {
  await query(`CREATE TABLE IF NOT EXISTS uom_conversions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_unit_id INT NOT NULL,
    to_unit_id INT NOT NULL,
    conversion_factor DECIMAL(18,8) NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_uom_conv_pair (from_unit_id, to_unit_id),
    CONSTRAINT fk_uc_from_unit FOREIGN KEY (from_unit_id) REFERENCES units(id) ON DELETE CASCADE,
    CONSTRAINT fk_uc_to_unit   FOREIGN KEY (to_unit_id)   REFERENCES units(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  console.log('OK: uom_conversions table');
} catch (e) {
  console.log('SKIP: uom_conversions', e.message.slice(0, 60));
}

// Approved material rates (cost source for recipe costing)
try {
  await query(`CREATE TABLE IF NOT EXISTS raw_material_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    raw_material_id INT NOT NULL,
    outlet_id INT NULL,
    rate DECIMAL(12,4) NOT NULL,
    effective_from DATE NOT NULL,
    is_approved TINYINT(1) NOT NULL DEFAULT 0,
    approved_by INT NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_material (raw_material_id),
    KEY idx_outlet (outlet_id),
    KEY idx_effective (effective_from),
    CONSTRAINT fk_rmr_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE,
    CONSTRAINT fk_rmr_outlet   FOREIGN KEY (outlet_id)      REFERENCES outlets(id)   ON DELETE SET NULL,
    CONSTRAINT fk_rmr_approved FOREIGN KEY (approved_by)    REFERENCES users(id)     ON DELETE SET NULL,
    CONSTRAINT fk_rmr_created  FOREIGN KEY (created_by)     REFERENCES users(id)     ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  console.log('OK: raw_material_rates table');
} catch (e) {
  console.log('SKIP: raw_material_rates', e.message.slice(0, 60));
}

// Recipe header V2 columns
await run(`ALTER TABLE recipes ADD COLUMN recipe_name VARCHAR(150) NULL AFTER id`, 'recipes.recipe_name');
await run(`ALTER TABLE recipes ADD COLUMN recipe_code VARCHAR(50) NULL`, 'recipes.recipe_code');
await run(`ALTER TABLE recipes ADD COLUMN recipe_type ENUM('Direct','Batch','Semi-Finished','Production') NOT NULL DEFAULT 'Direct'`, 'recipes.recipe_type');
await run(`ALTER TABLE recipes ADD COLUMN yield_qty DECIMAL(12,4) NULL`, 'recipes.yield_qty');
await run(`ALTER TABLE recipes ADD COLUMN yield_unit_id INT NULL`, 'recipes.yield_unit_id');
await run(`ALTER TABLE recipes ADD COLUMN serving_size DECIMAL(12,4) NULL`, 'recipes.serving_size');
await run(`ALTER TABLE recipes ADD COLUMN serving_unit_id INT NULL`, 'recipes.serving_unit_id');
await run(`ALTER TABLE recipes ADD COLUMN effective_to DATE NULL`, 'recipes.effective_to');
await run(`ALTER TABLE recipes ADD COLUMN notes TEXT NULL`, 'recipes.notes');
await run(`ALTER TABLE recipes ADD COLUMN updated_by INT NULL`, 'recipes.updated_by');
await run(`ALTER TABLE recipes ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0`, 'recipes.is_deleted');
await run(`ALTER TABLE recipes ADD COLUMN deleted_at DATETIME NULL`, 'recipes.deleted_at');
await run(`ALTER TABLE recipes ADD COLUMN deleted_by INT NULL`, 'recipes.deleted_by');

await run(`ALTER TABLE recipes ADD CONSTRAINT fk_recipe_yield_unit  FOREIGN KEY (yield_unit_id)    REFERENCES units(id)   ON DELETE SET NULL`, 'recipes.fk_yield_unit');
await run(`ALTER TABLE recipes ADD CONSTRAINT fk_recipe_serving_unit FOREIGN KEY (serving_unit_id)  REFERENCES units(id)   ON DELETE SET NULL`, 'recipes.fk_serving_unit');
await run(`ALTER TABLE recipes ADD CONSTRAINT fk_recipe_updated_by  FOREIGN KEY (updated_by)       REFERENCES users(id)   ON DELETE SET NULL`, 'recipes.fk_updated_by');
await run(`ALTER TABLE recipes ADD CONSTRAINT fk_recipe_deleted_by  FOREIGN KEY (deleted_by)       REFERENCES users(id)   ON DELETE SET NULL`, 'recipes.fk_deleted_by');

// Prevent ambiguous active BOM for same menu/location/version
await run(`ALTER TABLE recipes ADD UNIQUE KEY idx_recipe_active_unique (menu_item_id, for_outlet_id, version_no)`, 'recipes.unique active key');

// Recipe ingredient V2 columns
await run(`ALTER TABLE recipe_items ADD COLUMN display_order INT NOT NULL DEFAULT 0`, 'recipe_items.display_order');
await run(`ALTER TABLE recipe_items ADD COLUMN recipe_unit_id INT NULL`, 'recipe_items.recipe_unit_id');
await run(`ALTER TABLE recipe_items ADD COLUMN base_unit_id INT NULL`, 'recipe_items.base_unit_id');
await run(`ALTER TABLE recipe_items ADD COLUMN base_qty DECIMAL(12,6) NULL`, 'recipe_items.base_qty');
await run(`ALTER TABLE recipe_items ADD COLUMN conversion_factor DECIMAL(18,8) NULL`, 'recipe_items.conversion_factor');
await run(`ALTER TABLE recipe_items ADD COLUMN standard_wastage_qty DECIMAL(12,6) NULL`, 'recipe_items.standard_wastage_qty');
await run(`ALTER TABLE recipe_items ADD COLUMN net_qty DECIMAL(12,6) NULL`, 'recipe_items.net_qty');
await run(`ALTER TABLE recipe_items ADD COLUMN rate DECIMAL(12,4) NULL`, 'recipe_items.rate');
await run(`ALTER TABLE recipe_items ADD COLUMN ingredient_cost DECIMAL(12,4) NULL`, 'recipe_items.ingredient_cost');
await run(`ALTER TABLE recipe_items ADD COLUMN notes TEXT NULL`, 'recipe_items.notes');

await run(`ALTER TABLE recipe_items ADD CONSTRAINT fk_ri_recipe_unit FOREIGN KEY (recipe_unit_id) REFERENCES units(id) ON DELETE SET NULL`, 'recipe_items.fk_recipe_unit');
await run(`ALTER TABLE recipe_items ADD CONSTRAINT fk_ri_base_unit  FOREIGN KEY (base_unit_id)  REFERENCES units(id) ON DELETE SET NULL`, 'recipe_items.fk_base_unit');

// Backfill existing data
console.log('Backfilling recipes...');
try {
  await query(`UPDATE recipes r
    LEFT JOIN menu_items mi ON r.menu_item_id = mi.id
    SET r.recipe_name = COALESCE(r.recipe_name, CONCAT(mi.item_name, ' - ', COALESCE(r.portion, 'Std'))),
        r.recipe_code = COALESCE(r.recipe_code, CONCAT('R', LPAD(r.id, 6, '0'))),
        r.yield_qty = COALESCE(r.yield_qty, 1),
        r.serving_size = COALESCE(r.serving_size, 1),
        r.is_deleted = 0`);
  console.log('OK: recipes backfill');
} catch (e) {
  console.log('SKIP recipes backfill', e.message.slice(0, 80));
}

console.log('Backfilling recipe_items...');
try {
  await query(`UPDATE recipe_items ri
    LEFT JOIN raw_materials rm ON ri.raw_material_id = rm.id
    SET ri.recipe_unit_id = COALESCE(ri.unit_id, rm.unit_id),
        ri.base_unit_id = COALESCE(ri.base_unit_id, rm.unit_id),
        ri.conversion_factor = COALESCE(ri.conversion_factor, 1),
        ri.base_qty = COALESCE(ri.base_qty, ri.qty_per_item),
        ri.net_qty = COALESCE(ri.net_qty, ri.qty_per_item),
        ri.display_order = COALESCE(ri.display_order, 0)`);
  console.log('OK: recipe_items backfill');
} catch (e) {
  console.log('SKIP recipe_items backfill', e.message.slice(0, 80));
}

// Seed common UOM conversions
console.log('Seeding UOM conversions...');
const conversions = [
  [2, 1, 0.001],   // Gram -> Kilogram
  [1, 2, 1000],    // Kilogram -> Gram
  [4, 3, 0.001],   // Millilitre -> Litre
  [3, 4, 1000],    // Litre -> Millilitre
  [5, 5, 1],       // Number -> Number
  [6, 6, 1],       // Slice -> Slice
];
for (const [fromId, toId, factor] of conversions) {
  try {
    await query(`INSERT IGNORE INTO uom_conversions (from_unit_id, to_unit_id, conversion_factor) VALUES (?, ?, ?)`, [fromId, toId, factor]);
    console.log('OK: uom conversion', fromId, '->', toId);
  } catch (e) {
    console.log('SKIP: uom conversion', fromId, '->', toId, e.message.slice(0, 60));
  }
}

process.exit(0);
