import dotenv from 'dotenv';
dotenv.config();
import { query, default as pool } from './src/config/database.js';
import { createLocation, postOpening, createGRN, postGRN, getCurrentStock, getAllowedLocations } from './src/services/warehouseService.js';
import { getMaterialBaseUnit, convertToBase, normalizeRateToBase, findConversionFactor } from './src/utils/uomUtils.js';

const results = {};

async function main() {
  const superUser = await query('SELECT u.id, u.full_name, r.role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = 2');
  const superUserObj = { ...superUser[0], outlet_ids: [] };
  const whUserRes = await query("INSERT INTO users (full_name, email, password, role_id, is_active, created_at, updated_at) VALUES ('Test WH Admin UOM', 'test.wh.uom@bigbean.local', 'x', 8, 1, NOW(), NOW())");
  const whUserId = whUserRes.insertId;
  const whUser = { id: whUserId, full_name: 'Test WH Admin UOM', role_name: 'Warehouse Admin', role_id: 8, outlet_ids: [] };

  const cw = await createLocation({ location_code: 'TEST_CW_001', location_name: 'Test Central Warehouse', location_type: 'Central Warehouse' }, superUserObj.id);
  const ckw = await createLocation({ location_code: 'TEST_CK_001', location_name: 'Test Central Kitchen', location_type: 'Central Kitchen' }, superUserObj.id);

  const coffee = await query('SELECT id, unit_id, material_name FROM raw_materials WHERE id = 407');
  const coffeeId = coffee[0].id;
  const gramId = 2;
  const kgId = 1;

  const espresso = await query('SELECT id, unit_id, material_name FROM raw_materials WHERE id = 408');
  const espressoId = espresso[0].id;
  const mlId = 4;
  const ltrId = 3;

  // Same UOM factor 1
  const one = await findConversionFactor(gramId, gramId);
  results.sameUomFactor = one;

  // KG to Gram
  const kgToGm = await findConversionFactor(kgId, gramId);
  results.kgToGram = kgToGm;

  // Litre to Millilitre
  const ltrToMl = await findConversionFactor(ltrId, mlId);
  results.litreToMl = ltrToMl;

  // Invalid dimension: coffee (Weight) with Litre (Volume)
  try {
    await postOpening({ location_id: cw.id, raw_material_id: coffeeId, transaction_date: '2026-08-26', qty: 2, unit_id: ltrId, unit_cost: 10 }, whUser.id);
    results.invalidDimension = false;
  } catch (e) {
    results.invalidDimension = true;
  }

  // Opening coffee 100 KG @ 100/KG
  const opening = await postOpening({ location_id: cw.id, raw_material_id: coffeeId, transaction_date: '2026-08-26', qty: 100, unit_id: kgId, unit_cost: 100 }, whUser.id);
  results.openingPost = { qty: opening.qty_in, value: opening.value_in, base_unit_id: opening.base_unit_id };

  // GRN coffee 50 KG @ 200/KG
  const grn1 = await createGRN({ grn_no: 'TEST_GRN_001', grn_date: '2026-08-26', warehouse_location_id: cw.id, supplier_id: null, items: [{ raw_material_id: coffeeId, received_qty: 50, rejected_qty: 0, unit_id: kgId, rate: 200 }] }, whUser.id);
  const posted1 = await postGRN(grn1.id, whUser.id);
  results.grnPost = { id: posted1.id, status: posted1.status };

  let stock = await getCurrentStock(cw.id);
  let coffeeStock = stock.find((s) => Number(s.raw_material_id) === Number(coffeeId));
  results.coffeeAfterFirstGRN = coffeeStock ? { qty: coffeeStock.current_qty, unit: coffeeStock.unit_name, value: coffeeStock.total_value, avg: coffeeStock.average_cost } : 'FAIL';

  // Second GRN: received 50 KG, rejected 10 KG, accepted 40 KG @ 200/KG
  const grn2 = await createGRN({ grn_no: 'TEST_GRN_002', grn_date: '2026-08-26', warehouse_location_id: cw.id, supplier_id: null, items: [{ raw_material_id: coffeeId, received_qty: 50, rejected_qty: 10, unit_id: kgId, rate: 200 }] }, whUser.id);
  const posted2 = await postGRN(grn2.id, whUser.id);

  stock = await getCurrentStock(cw.id);
  coffeeStock = stock.find((s) => Number(s.raw_material_id) === Number(coffeeId));
  results.coffeeAfterSecondGRN = coffeeStock ? { qty: coffeeStock.current_qty, unit: coffeeStock.unit_name, value: coffeeStock.total_value, avg: coffeeStock.average_cost } : 'FAIL';

  // Volume test: Espresso base Millilitre. Opening 2 Litre @ 10/Litre, GRN 1 Litre @ 10/Litre
  const volOpen = await postOpening({ location_id: cw.id, raw_material_id: espressoId, transaction_date: '2026-08-26', qty: 2, unit_id: ltrId, unit_cost: 10 }, whUser.id);
  const volGrn = await createGRN({ grn_no: 'TEST_VOL_GRN_001', grn_date: '2026-08-26', warehouse_location_id: cw.id, supplier_id: null, items: [{ raw_material_id: espressoId, received_qty: 1, rejected_qty: 0, unit_id: ltrId, rate: 10 }] }, whUser.id);
  const volPosted = await postGRN(volGrn.id, whUser.id);

  stock = await getCurrentStock(cw.id);
  const espressoStock = stock.find((s) => Number(s.raw_material_id) === Number(espressoId));
  results.espressoVolume = espressoStock ? { qty: espressoStock.current_qty, unit: espressoStock.unit_name, value: espressoStock.total_value, avg: espressoStock.average_cost } : 'FAIL';

  // Cleanup
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
