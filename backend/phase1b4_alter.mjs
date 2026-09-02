import 'dotenv/config';
import pool, { query } from './src/config/database.js';

// Minimal schema migration for Batch/Semi-Finished/Production BOM output material linkage
await query(`
  ALTER TABLE recipes
  MODIFY menu_item_id INT NULL,
  ADD COLUMN output_raw_material_id INT DEFAULT NULL AFTER menu_item_id,
  ADD KEY idx_recipe_output (output_raw_material_id),
  ADD CONSTRAINT fk_recipe_output
    FOREIGN KEY (output_raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
  DROP INDEX idx_recipe_active_unique,
  ADD UNIQUE KEY idx_recipe_active_unique (menu_item_id, output_raw_material_id, for_outlet_id, version_no)
`);

await query(`
  ALTER TABLE recipe_versions
  MODIFY menu_item_id INT NULL,
  ADD COLUMN output_raw_material_id INT DEFAULT NULL AFTER menu_item_id,
  ADD KEY idx_version_output (output_raw_material_id),
  ADD CONSTRAINT fk_recipe_versions_output
    FOREIGN KEY (output_raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL
`);

const [r] = await query('SHOW CREATE TABLE recipes');
const [v] = await query('SHOW CREATE TABLE recipe_versions');
console.log(r['Create Table']);
console.log('\n--- recipe_versions ---\n' + v['Create Table']);
await pool.end();
