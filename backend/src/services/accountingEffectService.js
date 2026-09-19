import { query, getConnection } from '../config/database.js';
import { assertNotOwnDocument } from '../utils/makerChecker.js';

// Phase 6A1 - accounting integration foundation.
//
// accounting_effects is the idempotency + linkage layer through which a
// physical inventory document (GRN, purchase return, adjustment, wastage,
// production) may LATER contribute an accounting effect. This service only
// provides the data model and explicit claim plumbing - it is NOT wired into
// any financial read path. Nothing here makes a row financially effective:
// plCalculator, supplierLedgerService and consumptionService do not read
// accounting_effects at all in this phase.
//
// Deliberate non-goals in 6A1:
//   - no effect generation from GRNs / returns / transfers / production
//   - no financial aggregation
//   - no fuzzy invoice matching - claims are explicit id pairs only
//   - no historical backfill

const num = (value) => Number(value || 0);

const EFFECT_STATUSES = ['Draft', 'Verified', 'Posted', 'Reversed'];

/**
 * Classify where the accounting ownership of a physical location lies.
 *
 * The two tracks use different grains: accounting rows (material_purchase_items
 * etc.) are outlet_id-keyed while physical stock_ledger rows are
 * location_id-keyed. locations.outlet_id is the only legitimate bridge between
 * them. A Central Warehouse or Central Kitchen has no statutory outlet owner,
 * so this function returns an explicit NULL owner with a reason instead of
 * guessing one - a guessed owner would silently attribute purchases to the
 * wrong outlet's books.
 *
 * Returns: { accounting_owner_type, accounting_outlet_id, reason }
 */
export const resolveAccountingOwner = async (locationId) => {
  if (!locationId) {
    return { accounting_owner_type: 'NONE', accounting_outlet_id: null, reason: 'no location provided' };
  }
  const rows = await query('SELECT id, location_name, location_type, outlet_id FROM locations WHERE id = ?', [locationId]);
  const loc = rows[0];
  if (!loc) {
    return { accounting_owner_type: 'NONE', accounting_outlet_id: null, reason: `location ${locationId} not found` };
  }
  if (loc.outlet_id) {
    return {
      accounting_owner_type: 'OUTLET',
      accounting_outlet_id: loc.outlet_id,
      reason: `location ${loc.id} (${loc.location_name}) mapped to outlet ${loc.outlet_id}`,
    };
  }
  return {
    accounting_owner_type: 'CENTRAL',
    accounting_outlet_id: null,
    reason: `${loc.location_type} '${loc.location_name}' has no outlet_id - no statutory accounting owner`,
  };
};

/**
 * Locate an existing effect for a physical source (item), if any.
 */
export const findEffectBySource = async ({ source_type, source_id, source_item_id = null, effect_type }) => {
  const rows = await query(
    `SELECT * FROM accounting_effects
     WHERE source_type = ? AND source_id = ?
       AND source_item_key = ? AND effect_type = ?`,
    [source_type, source_id, source_item_id === null || source_item_id === undefined ? 0 : source_item_id, effect_type]
  );
  return rows[0] || null;
};

/**
 * Hard idempotency assertion - mirrors the database UNIQUE key but produces a
 * readable error before the duplicate INSERT is attempted. The unique index
 * remains the real guarantee (concurrent creators can both pass this check);
 * callers inside a transaction should rely on the INSERT failing.
 */
export const assertNoDuplicateEffect = async ({ source_type, source_id, source_item_id = null, effect_type }) => {
  const existing = await findEffectBySource({ source_type, source_id, source_item_id, effect_type });
  if (existing) {
    const err = new Error(`Accounting effect already exists for ${source_type}#${source_id} item ${source_item_id ?? '-'} (${effect_type})`);
    err.statusCode = 409;
    throw err;
  }
};

export const getEffect = async (id) => {
  const rows = await query('SELECT * FROM accounting_effects WHERE id = ?', [id]);
  return rows[0] || null;
};

/**
 * Read-only listing for diagnostics/admin. No financial aggregation - callers
 * must not treat these rows as money yet.
 */
export const listEffects = async ({ status, effect_type, source_type, outlet_id, location_id, supplier_id, limit = 200 } = {}) => {
  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (effect_type) { clauses.push('effect_type = ?'); params.push(effect_type); }
  if (source_type) { clauses.push('source_type = ?'); params.push(source_type); }
  if (outlet_id) { clauses.push('outlet_id = ?'); params.push(outlet_id); }
  if (location_id) { clauses.push('location_id = ?'); params.push(location_id); }
  if (supplier_id) { clauses.push('supplier_id = ?'); params.push(supplier_id); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return query(`SELECT * FROM accounting_effects ${where} ORDER BY id DESC LIMIT ?`, [...params, Math.min(num(limit) || 200, 1000)]);
};

/**
 * Create a foundation effect row (status Draft). Does NOT make anything
 * financially effective - only future, deliberately-written consumers may
 * read Posted effects.
 *
 * If location_id is provided and outlet_id is not, the owner is resolved via
 * resolveAccountingOwner() - a location with no outlet mapping produces a
 * NULL outlet_id (no owner), never a guessed one.
 */
export const createEffect = async (data, userId) => {
  const {
    effect_type, source_type, source_id, source_item_id = null,
    outlet_id = null, location_id = null, supplier_id = null, raw_material_id = null,
    effective_date, quantity = null, unit_id = null,
    base_amount = 0, tax_amount = 0, total_amount = 0,
    metadata_json = null,
  } = data || {};
  if (!effect_type || !source_type || !source_id || !effective_date) {
    throw new Error('effect_type, source_type, source_id and effective_date are required');
  }

  let resolvedOutlet = outlet_id;
  if (resolvedOutlet === null && location_id !== null) {
    const owner = await resolveAccountingOwner(location_id);
    resolvedOutlet = owner.accounting_outlet_id; // stays NULL for non-outlet locations - never guessed
  }

  await assertNoDuplicateEffect({ source_type, source_id, source_item_id, effect_type });

  const res = await query(
    `INSERT INTO accounting_effects
     (effect_type, source_type, source_id, source_item_id, outlet_id, location_id,
      supplier_id, raw_material_id, effective_date, quantity, unit_id,
      base_amount, tax_amount, total_amount, metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [effect_type, source_type, source_id, source_item_id, resolvedOutlet, location_id,
     supplier_id, raw_material_id, effective_date, quantity, unit_id,
     num(base_amount), num(tax_amount), num(total_amount),
     metadata_json ? JSON.stringify(metadata_json) : null, userId]
  );
  return getEffect(res.insertId);
};

const setStatus = async (id, status, extraSet, params, userId, action) => {
  const effect = await getEffect(id);
  if (!effect) throw new Error('Accounting effect not found');
  if (!EFFECT_STATUSES.includes(status)) throw new Error(`Invalid effect status ${status}`);
  assertNotOwnDocument(effect, userId, 'created_by', action, 'accounting effect');
  await query(`UPDATE accounting_effects SET status = ?, ${extraSet} WHERE id = ?`, [status, ...params, userId, id]);
  return getEffect(id);
};

// Maker-checker transitions. These exist so the lifecycle columns are never
// written ad-hoc; a status change still carries no financial effect because
// no consumer reads the table.
export const verifyEffect = async (id, userId) =>
  setStatus(id, 'Verified', 'verified_by = ?, verified_at = NOW()', [], userId, 'verify');

export const postEffect = async (id, userId) =>
  setStatus(id, 'Posted', 'posted_by = ?, posted_at = NOW()', [], userId, 'post');

export const reverseEffect = async (id, userId, reversal_reason) =>
  setStatus(id, 'Reversed', 'reversed_by = ?, reversed_at = NOW(), reversal_reason = ?', [reversal_reason || null], userId, 'reverse');

/**
 * Explicitly attach a material_purchase_items row to an effect - the claim
 * link that prevents a bridged GRN purchase and a manual upload line from
 * both becoming financially effective in a later phase.
 *
 * Rules enforced here (no fuzzy matching, no auto-claim):
 *   - the effect must exist and not be Reversed
 *   - the upload item must exist
 *   - the upload item must not already claim a different effect
 *     (uq_ae_claim makes this a hard DB guarantee too)
 *   - the upload item's supplier must match the effect's supplier when both
 *     are known - a claim that crosses suppliers is never valid
 */
export const claimEffect = async (effectId, uploadItemId, userId) => {
  const effect = await getEffect(effectId);
  if (!effect) throw new Error('Accounting effect not found');
  if (effect.status === 'Reversed') throw new Error('Cannot claim a Reversed effect');
  if (effect.claim_upload_item_id !== null) {
    const err = new Error('Effect already claimed - unclaim it before re-claiming');
    err.statusCode = 409;
    throw err;
  }

  const items = await query('SELECT id, supplier_id, outlet_id FROM material_purchase_items WHERE id = ?', [uploadItemId]);
  const item = items[0];
  if (!item) throw new Error('Material purchase upload item not found');

  if (effect.supplier_id && item.supplier_id && Number(effect.supplier_id) !== Number(item.supplier_id)) {
    throw new Error('Claim rejected: upload item supplier does not match effect supplier');
  }
  if (effect.outlet_id && item.outlet_id && Number(effect.outlet_id) !== Number(item.outlet_id)) {
    throw new Error('Claim rejected: upload item outlet does not match effect outlet');
  }

  const claimed = await query('SELECT id FROM accounting_effects WHERE claim_upload_item_id = ? AND id != ?', [uploadItemId, effectId]);
  if (claimed.length) {
    const err = new Error('Upload item already claims another accounting effect');
    err.statusCode = 409;
    throw err;
  }

  const res = await query('UPDATE accounting_effects SET claim_upload_item_id = ? WHERE id = ?', [uploadItemId, effectId]);
  if (res.affectedRows === 0) throw new Error('Claim failed');
  return getEffect(effectId);
};

export const unclaimEffect = async (effectId, userId) => {
  const effect = await getEffect(effectId);
  if (!effect) throw new Error('Accounting effect not found');
  await query('UPDATE accounting_effects SET claim_upload_item_id = NULL WHERE id = ?', [effectId]);
  return getEffect(effectId);
};

/**
 * Transaction-scoped variant for future bridge writers (6A2+): insert an
 * effect on an existing connection so it commits/rolls back with the source
 * document's own transaction. Same column set as createEffect minus the
 * pre-check - the unique key is the atomic guarantee here.
 */
export const createEffectInTransaction = async (connection, data, userId) => {
  const {
    effect_type, source_type, source_id, source_item_id = null,
    outlet_id = null, location_id = null, supplier_id = null, raw_material_id = null,
    effective_date, quantity = null, unit_id = null,
    base_amount = 0, tax_amount = 0, total_amount = 0,
    metadata_json = null,
  } = data || {};
  const [res] = await connection.execute(
    `INSERT INTO accounting_effects
     (effect_type, source_type, source_id, source_item_id, outlet_id, location_id,
      supplier_id, raw_material_id, effective_date, quantity, unit_id,
      base_amount, tax_amount, total_amount, metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [effect_type, source_type, source_id, source_item_id, outlet_id, location_id,
     supplier_id, raw_material_id, effective_date, quantity, unit_id,
     num(base_amount), num(tax_amount), num(total_amount),
     metadata_json ? JSON.stringify(metadata_json) : null, userId]
  );
  return res.insertId;
};

export { getConnection };
