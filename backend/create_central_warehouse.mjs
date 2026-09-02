import { query } from './src/config/database.js';

async function main() {
  const existing = await query(
    `SELECT id, location_code, location_name, location_type, outlet_id, is_inventory_location, is_active
     FROM locations
     WHERE location_type = 'Central Warehouse' OR location_code = 'BBC-WH-001'
     LIMIT 1`
  );

  if (existing.length > 0) {
    console.log('EXISTS — not creating duplicate:');
    console.log(JSON.stringify(existing[0], null, 2));
    process.exit(0);
  }

  await query(
    `INSERT INTO locations (location_code, location_name, location_type, outlet_id, is_inventory_location, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    ['BBC-WH-001', 'Big Bean Central Warehouse', 'Central Warehouse', null, 1, 1]
  );

  const created = await query(
    `SELECT id, location_code, location_name, location_type, outlet_id, is_inventory_location, is_active
     FROM locations
     WHERE location_code = 'BBC-WH-001'`
  );

  console.log('CREATED:');
  console.log(JSON.stringify(created[0], null, 2));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
