import { query } from '../config/database.js';

// Phase 6A3 - canonical "effective purchase" definition.
//
// An accounting purchase contributes to P&L / supplier outstanding /
// consumption EXACTLY ONCE through one of two paths:
//
//   A. manual_effective - a material_purchase_items row whose upload is
//      Completed + Verified and which has NOT been replaced by a Posted
//      claimed bridge effect (claim_upload_item_id -> this item).
//
//   B. bridge_effective - a Posted accounting_effects PURCHASE row sourced
//      from a GRN (source_type='GRN', effect_type='PURCHASE') with a resolved
//      accounting outlet (outlet_id IS NOT NULL).
//
// While a bridge effect is still Draft the claimed manual item remains
// financially effective - the manual amount only stops contributing at the
// moment the bridge reaches Posted, so a purchase can never be temporarily
// missing and can never be counted twice.
//
// Every financial consumer must use these fragments/helpers rather than
// re-deriving the status/claim rules, so the definition cannot silently
// diverge between P&L, supplier ledger and consumption.

const num = (value) => Number(value || 0);

// Manual-side predicate. Expects aliases mpi (material_purchase_items) and
// mpu (material_purchase_uploads).
export const MANUAL_EFFECTIVE_WHERE = `
  mpu.status = 'Completed' AND mpu.approval_status = 'Verified'
  AND NOT EXISTS (
    SELECT 1 FROM accounting_effects ae_claim
    WHERE ae_claim.claim_upload_item_id = mpi.id
      AND ae_claim.source_type = 'GRN'
      AND ae_claim.effect_type = 'PURCHASE'
      AND ae_claim.status = 'Posted'
  )`;

// Bridge-side predicate. Expects alias ae (accounting_effects). NULL outlet
// effects are never financially effective - they are unresolved central
// warehouse/kitchen activity awaiting an explicit future owner decision.
export const BRIDGE_EFFECTIVE_WHERE = `
  ae.source_type IN ('GRN', 'CONTROLLED_EXCEPTION')
  AND ae.effect_type = 'PURCHASE'
  AND ae.status = 'Posted' AND ae.outlet_id IS NOT NULL`;

/**
 * Effective purchase value for an outlet (or all outlets) over a date range.
 * Used by the P&L purchases input.
 */
export const getEffectivePurchaseValue = async ({ outletId = null, fromDate, toDate }) => {
  const manual = await query(
    `SELECT COALESCE(SUM(mpi.total_amount), 0) AS total
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
     WHERE ${outletId ? 'mpi.outlet_id = ?' : '1=1'}
       AND mpi.date >= ? AND mpi.date <= ?
       AND ${MANUAL_EFFECTIVE_WHERE}`,
    [...(outletId ? [outletId] : []), fromDate, toDate]
  );
  const bridge = await query(
    `SELECT COALESCE(SUM(ae.total_amount), 0) AS total
     FROM accounting_effects ae
     WHERE ${BRIDGE_EFFECTIVE_WHERE}
       AND ${outletId ? 'ae.outlet_id = ?' : '1=1'}
       AND ae.effective_date >= ? AND ae.effective_date <= ?`,
    [...(outletId ? [outletId] : []), fromDate, toDate]
  );
  return num(manual[0]?.total) + num(bridge[0]?.total);
};

/**
 * Effective purchases grouped by raw material (qty + value) for the
 * consumption formula (Opening + Purchases - Closing).
 */
export const getEffectivePurchasesByMaterial = async ({ outletId, fromDate, toDate }) => {
  const manual = await query(
    `SELECT mpi.raw_material_id,
            COALESCE(SUM(mpi.qty), 0) AS purchase_qty,
            COALESCE(SUM(mpi.total_amount), 0) AS purchase_value
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
     WHERE mpi.outlet_id = ? AND mpi.date >= ? AND mpi.date <= ?
       AND ${MANUAL_EFFECTIVE_WHERE}
     GROUP BY mpi.raw_material_id`,
    [outletId, fromDate, toDate]
  );
  const bridge = await query(
    `SELECT ae.raw_material_id,
            COALESCE(SUM(ae.quantity), 0) AS purchase_qty,
            COALESCE(SUM(ae.total_amount), 0) AS purchase_value
     FROM accounting_effects ae
     WHERE ${BRIDGE_EFFECTIVE_WHERE}
       AND ae.outlet_id = ?
       AND ae.effective_date >= ? AND ae.effective_date <= ?
     GROUP BY ae.raw_material_id`,
    [outletId, fromDate, toDate]
  );
  const byMaterial = new Map();
  for (const row of [...manual, ...bridge]) {
    const key = row.raw_material_id === null ? 'null' : Number(row.raw_material_id);
    const cur = byMaterial.get(key) || { raw_material_id: row.raw_material_id, purchase_qty: 0, purchase_value: 0 };
    cur.purchase_qty += num(row.purchase_qty);
    cur.purchase_value += num(row.purchase_value);
    byMaterial.set(key, cur);
  }
  return [...byMaterial.values()];
};

/**
 * Cumulative effective purchases for an outlet+supplier up to and including
 * asOfDate - the supplier-liability side of the same rule. Bridge effects
 * carry supplier_id from the GRN; manual items carry it from the upload row.
 */
export const getCumulativeEffectivePurchases = async ({ outletId, supplierId, asOfDate }) => {
  const manual = await query(
    `SELECT COALESCE(SUM(mpi.total_amount), 0) AS total
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
     WHERE mpi.outlet_id = ? AND mpi.supplier_id = ?
       AND ${MANUAL_EFFECTIVE_WHERE}
       AND mpi.date <= ?`,
    [outletId, supplierId, asOfDate]
  );
  const bridge = await query(
    `SELECT COALESCE(SUM(ae.total_amount), 0) AS total
     FROM accounting_effects ae
     WHERE ${BRIDGE_EFFECTIVE_WHERE}
       AND ae.outlet_id = ? AND ae.supplier_id = ?
       AND ae.effective_date <= ?`,
    [outletId, supplierId, asOfDate]
  );
  return num(manual[0]?.total) + num(bridge[0]?.total);
};

/**
 * (outlet_id, supplier_id) pairs that carry effective purchase value -
 * manual effective items plus posted bridge effects. Used by the supplier
 * pending report so a bridged supplier appears even with no manual upload.
 */
export const getEffectivePurchasePairs = async ({ outletId = null, supplierId = null } = {}) => {
  const params = [];
  let manualScope = '';
  if (outletId) { manualScope += ' AND mpi.outlet_id = ?'; params.push(outletId); }
  if (supplierId) { manualScope += ' AND mpi.supplier_id = ?'; params.push(supplierId); }
  const bridgeParams = [];
  let bridgeScope = '';
  if (outletId) { bridgeScope += ' AND ae.outlet_id = ?'; bridgeParams.push(outletId); }
  if (supplierId) { bridgeScope += ' AND ae.supplier_id = ?'; bridgeParams.push(supplierId); }
  return query(
    `SELECT outlet_id, supplier_id FROM (
       SELECT mpi.outlet_id, mpi.supplier_id
       FROM material_purchase_items mpi
       INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
       WHERE mpi.supplier_id IS NOT NULL ${manualScope}
         AND ${MANUAL_EFFECTIVE_WHERE}
       UNION
       SELECT ae.outlet_id, ae.supplier_id
       FROM accounting_effects ae
       WHERE ${BRIDGE_EFFECTIVE_WHERE} AND ae.supplier_id IS NOT NULL ${bridgeScope}
     ) pairs`,
    [...params, ...bridgeParams]
  );
};
