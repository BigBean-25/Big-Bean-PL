import dotenv from 'dotenv';
dotenv.config();
import { getConnection } from './src/config/database.js';

// raw_materials doubles as the "items master" for both true raw materials AND
// central-kitchen finished/output products (production_batches.finished_product_id
// references raw_materials.id). getCurrentStock() summed both roles together with no
// way to tell them apart, which inflated the raw-material shortage check and the
// finished-stock-value dashboard tile. This adds an explicit role column and backfills
// it from every place a raw_materials row is actually used as a production output.
const conn = await getConnection();
try {
  await conn.beginTransaction();

  const [existing] = await conn.execute("SHOW COLUMNS FROM raw_materials LIKE 'material_role'");
  if (existing.length === 0) {
    await conn.execute(
      `ALTER TABLE raw_materials
       ADD COLUMN material_role ENUM('Raw Material','Finished Good') NOT NULL DEFAULT 'Raw Material' AFTER material_name`
    );
    console.log('Added material_role column to raw_materials');
  } else {
    console.log('material_role column already exists, skipping ALTER');
  }

  const [result] = await conn.execute(`
    UPDATE raw_materials rm
    SET rm.material_role = 'Finished Good'
    WHERE rm.id IN (
      SELECT finished_product_id FROM production_batches WHERE finished_product_id IS NOT NULL
      UNION
      SELECT finished_product_id FROM production_batch_outputs WHERE finished_product_id IS NOT NULL
      UNION
      SELECT production_item_id FROM production_plans WHERE production_item_id IS NOT NULL
    )
  `);
  console.log(`Backfilled material_role = 'Finished Good' for ${result.affectedRows} row(s)`);

  await conn.commit();
  console.log('material_role migration completed');
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
  process.exit(0);
}
