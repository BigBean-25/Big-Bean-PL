import { query } from '../backend/src/config/database.js';

const ensureColumn = async (table, column, def) => {
  const rows = await query(`SHOW COLUMNS FROM ${table}`);
  if (!rows.some(r => r.Field === column)) {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    console.log(`Added ${table}.${column}`);
  } else {
    console.log(`Already exists: ${table}.${column}`);
  }
};

const ensureIndex = async (table, index, cols) => {
  const rows = await query(`SHOW INDEX FROM ${table}`);
  if (!rows.some(r => r.Key_name === index)) {
    await query(`CREATE INDEX ${index} ON ${table}(${cols})`);
    console.log(`Created ${index}`);
  } else {
    console.log(`Index already exists: ${index}`);
  }
};

const main = async () => {
  await ensureColumn('raw_materials', 'lead_time_days', 'INT DEFAULT NULL');
  await ensureColumn('raw_materials', 'preferred_supplier_id', 'INT DEFAULT NULL');
  await ensureColumn('raw_materials', 'safety_stock_qty', 'DECIMAL(14,4) DEFAULT 0');
  await ensureIndex('raw_materials', 'idx_rm_preferred_supplier', 'preferred_supplier_id');
  await ensureIndex('stock_ledger', 'idx_stock_ledger_material_loc', 'location_id, raw_material_id');
  await ensureIndex('purchase_order_items', 'idx_poi_material_po', 'raw_material_id, purchase_order_id');
  console.log('Phase 2H migration completed');
  process.exit(0);
};

main().catch(e => { console.error(e); process.exit(1); });
