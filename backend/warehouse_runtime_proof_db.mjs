import dotenv from 'dotenv';
dotenv.config();
import { query, getConnection, default as pool } from './src/config/database.js';
import { createLocation, postOpening, createGRN, postGRN, getCurrentStock, getAllowedLocations } from './src/services/warehouseService.js';

const results = {};

async function testSecurity(user, expectedCWA, expectedCKA) {
  const req = { user, query: { location_id: 'all' } };
  const res = { status: (c) => ({ json: (d) => { results[user.role_name + '_cw'] = c; } }) };
  const locations = await getAllowedLocations(user, 'all');
  return { cw: locations.some((l) => l.location_type === 'Central Warehouse'), ck: locations.some((l) => l.id === expectedCKA) };
}

async function main() {
  const material = await query('SELECT id, unit_id FROM raw_materials WHERE is_active = 1 LIMIT 1');
  if (!material.length) throw new Error('No material found');
  const { id: materialId, unit_id: unitId } = material[0];

  const superUser = await query('SELECT u.id, u.full_name, r.role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = 2');
  const superUserObj = { ...superUser[0], outlet_ids: [] };
  const whUserRes = await query("INSERT INTO users (full_name, email, password, role_id, is_active, created_at, updated_at) VALUES ('Test WH Admin', 'test.wh@bigbean.local', 'x', 8, 1, NOW(), NOW())");
  const whUserId = whUserRes.insertId;
  const whUser = { id: whUserId, full_name: 'Test WH Admin', role_name: 'Warehouse Admin', role_id: 8, outlet_ids: [] };
  const outletUserRows = await query('SELECT outlet_id FROM user_outlets WHERE user_id = 4');
  const outletUser = { id: 4, full_name: 'Outlet Admin', role_name: 'Outlet Admin', role_id: 4, outlet_ids: outletUserRows.map(x => x.outlet_id) };

  const cw = await createLocation({ location_code: 'TEST_CW_001', location_name: 'Test Central Warehouse', location_type: 'Central Warehouse' }, superUserObj.id);
  const ckw = await createLocation({ location_code: 'TEST_CK_001', location_name: 'Test Central Kitchen', location_type: 'Central Kitchen' }, superUserObj.id);

  results.super_admin_cw = (await getAllowedLocations(superUserObj, 'all')).some((l) => l.id === cw.id);
  results.wh_admin_cw = (await getAllowedLocations(whUser, 'all')).some((l) => l.id === cw.id);
  results.wh_admin_ck = (await getAllowedLocations(whUser, 'all')).some((l) => l.id === ckw.id);
  results.outlet_admin_cw = (await getAllowedLocations(outletUser, 'all')).some((l) => l.id === cw.id);

  const opening1 = await postOpening({ location_id: cw.id, raw_material_id: materialId, transaction_date: '2026-08-26', qty: 100, unit_id: unitId, unit_cost: 100 }, whUser.id);
  results.openingPost = opening1 ? { qty: opening1.qty_in, value: opening1.value_in } : 'FAIL';

  try { await postOpening({ location_id: cw.id, raw_material_id: materialId, transaction_date: '2026-08-26', qty: 100, unit_id: unitId, unit_cost: 100 }, whUser.id); results.openingIdempotent = false; } catch (e) { results.openingIdempotent = true; }

  const grn = await createGRN({ grn_no: 'TEST_GRN_001', grn_date: '2026-08-26', warehouse_location_id: cw.id, supplier_id: null, items: [{ raw_material_id: materialId, received_qty: 50, rejected_qty: 0, unit_id: unitId, rate: 200 }] }, whUser.id);
  const posted = await postGRN(grn.id, whUser.id);
  results.grnPost = posted ? { id: posted.id, status: posted.status } : 'FAIL';

  try { await postGRN(grn.id, whUser.id); results.grnIdempotent = false; } catch (e) { results.grnIdempotent = true; }

  let stock = await getCurrentStock(cw.id);
  let materialStock = stock.find((s) => Number(s.raw_material_id) === Number(materialId));
  results.stockAfterFirstGRN = materialStock ? { qty: materialStock.current_qty, value: materialStock.total_value, avg: materialStock.average_cost } : 'FAIL';

  const grn2 = await createGRN({ grn_no: 'TEST_GRN_002', grn_date: '2026-08-26', warehouse_location_id: cw.id, supplier_id: null, items: [{ raw_material_id: materialId, received_qty: 50, rejected_qty: 10, unit_id: unitId, rate: 200 }] }, whUser.id);
  const posted2 = await postGRN(grn2.id, whUser.id);
  results.grnAccepted = posted2 ? 'OK' : 'FAIL';

  stock = await getCurrentStock(cw.id);
  materialStock = stock.find((s) => Number(s.raw_material_id) === Number(materialId));
  results.stockAfterSecondGRN = materialStock ? { qty: materialStock.current_qty, value: materialStock.total_value, avg: materialStock.average_cost } : 'FAIL';

  const dashboard = await query('SELECT COUNT(*) as c FROM stock_ledger WHERE location_id = ?', [cw.id]);
  results.ledgerRows = dashboard[0].c;

  await query("DELETE FROM stock_ledger WHERE location_id IN (SELECT id FROM locations WHERE location_code LIKE 'TEST%')");
  await query("DELETE FROM grn_items WHERE grn_id IN (SELECT id FROM grn WHERE grn_no LIKE 'TEST%')");
  await query("DELETE FROM grn WHERE grn_no LIKE 'TEST%'");
  await query("DELETE FROM locations WHERE location_code LIKE 'TEST%'");
  await query("DELETE FROM users WHERE id = ?", [whUserId]);

  const remainingLocs = await query("SELECT COUNT(*) as c FROM locations WHERE location_code LIKE 'TEST%'");
  const remainingGRNs = await query("SELECT COUNT(*) as c FROM grn WHERE grn_no LIKE 'TEST%'");
  const remainingGRNItems = await query("SELECT COUNT(*) as c FROM grn_items WHERE grn_id IN (SELECT id FROM grn WHERE grn_no LIKE 'TEST%')");
  const remainingLedger = await query("SELECT COUNT(*) as c FROM stock_ledger WHERE location_id IN (SELECT id FROM locations WHERE location_code LIKE 'TEST%')");
  results.remaining = { locations: remainingLocs[0].c, grn: remainingGRNs[0].c, grnItems: remainingGRNItems[0].c, ledger: remainingLedger[0].c };

  console.log(JSON.stringify(results, null, 2));
  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error('ERROR', e); await pool.end(); process.exit(1); });
