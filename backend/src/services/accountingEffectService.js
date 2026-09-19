import { query, getConnection } from '../config/database.js';
import { assertNotOwnDocument } from '../utils/makerChecker.js';
import { assertMonthEditable } from '../utils/periodLock.js';

// Phase 6A1 - accounting integration foundation.
// Phase 6A3 - GRN -> PURCHASE bridge.
//
// accounting_effects is the idempotency + linkage layer through which a
// physical inventory document contributes an accounting effect. In 6A3 the
// ONLY live bridge is: Posted GRN item -> Draft PURCHASE effect (created
// inside the GRN Post transaction in warehouseService.postGRN) -> explicit
// accounting checker verifyAndPostPurchaseEffect() -> Posted, at which point
// effectivePurchaseService counts it as an effective purchase.
//
// Still deliberate non-goals:
//   - no effect generation from returns / transfers / wastage / production
//   - no fuzzy invoice matching - claims are explicit, fully-proven links
//   - no historical backfill - only GRNs Posted after the bridge code went
//     live produce effects
//   - no reversal framework - Posted is terminal in this phase

const num = (value) => Number(value || 0);

const httpError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Same deterministic normalisation as the 6A2 reconciliation service:
// uppercase + strip non-alphanumerics. Anything beyond this is fuzzy
// matching, which the bridge deliberately does not do.
const normalizeInvoice = (value) =>
  value === null || value === undefined ? null : String(value).toUpperCase().replace(/[^A-Z0-9]/g, '') || null;

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
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
  return query(`SELECT * FROM accounting_effects ${where} ORDER BY id DESC LIMIT ${lim}`, params);
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
 * Phase 6A3 - strict explicit claim. Attaching a material_purchase_items row
 * to a Draft GRN PURCHASE effect means "this manual upload line and this GRN
 * receipt are the same real-world purchase": once the effect reaches Posted
 * the manual item stops contributing and the bridge contributes instead.
 *
 * Every linkable dimension must be PROVEN, never assumed:
 *   - effect must be Draft (Posted is terminal - 6A3 has no reversal)
 *   - upload must be Completed + Verified
 *   - supplier, outlet and raw material must all be present and equal
 *   - both sides must carry an invoice reference whose normalised form is
 *     equal - absent or contradictory invoice data blocks the claim rather
 *     than guessing
 * The claim itself is a checker action, so the effect creator cannot claim
 * their own effect.
 */
export const claimEffect = async (effectId, uploadItemId, userId) => {
  const effect = await getEffect(effectId);
  if (!effect) throw httpError('Accounting effect not found', 404);
  if (effect.status !== 'Draft') {
    throw httpError(effect.status === 'Posted' ? 'Posted effects are terminal - the claim cannot change' : 'Only Draft effects can be claimed', 409);
  }
  assertNotOwnDocument(effect, userId, 'created_by', 'claim', 'accounting effect');
  if (effect.claim_upload_item_id !== null) {
    throw httpError('Effect already claimed - unclaim it before re-claiming', 409);
  }
  if (!effect.outlet_id) {
    throw httpError('Effect has no accounting outlet - it cannot be claimed', 400);
  }
  // A claim changes which side will contribute once the effect posts - that
  // replacement must not be decided for an already-finalized month.
  const effDate = new Date(effect.effective_date);
  await assertMonthEditable(effect.outlet_id, effDate.getMonth() + 1, effDate.getFullYear(), 'An accounting effect claim');

  const items = await query(
    `SELECT mpi.*, mpu.status AS upload_status, mpu.approval_status
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpu.id = mpi.upload_id
     WHERE mpi.id = ?`,
    [uploadItemId]
  );
  const item = items[0];
  if (!item) throw httpError('Material purchase upload item not found', 404);
  if (item.upload_status !== 'Completed' || item.approval_status !== 'Verified') {
    throw httpError('Claim rejected: upload item is not a Completed + Verified purchase', 400);
  }
  if (!effect.supplier_id || !item.supplier_id || Number(effect.supplier_id) !== Number(item.supplier_id)) {
    throw httpError('Claim rejected: supplier does not match (or is missing) on one side', 400);
  }
  if (Number(effect.outlet_id) !== Number(item.outlet_id)) {
    throw httpError('Claim rejected: upload item outlet does not match effect outlet', 400);
  }
  if (!effect.raw_material_id || !item.raw_material_id || Number(effect.raw_material_id) !== Number(item.raw_material_id)) {
    throw httpError('Claim rejected: raw material does not match (or is missing) on one side', 400);
  }
  const meta = effect.metadata_json
    ? (typeof effect.metadata_json === 'string' ? JSON.parse(effect.metadata_json) : effect.metadata_json)
    : {};
  const effectInvoice = normalizeInvoice(meta.invoice_reference);
  const itemInvoice = normalizeInvoice(item.invoice_no);
  if (!effectInvoice || !itemInvoice || effectInvoice !== itemInvoice) {
    throw httpError('Claim rejected: invoice reference is absent or contradictory - explicit matching requires equal normalized invoices', 400);
  }

  const claimed = await query('SELECT id FROM accounting_effects WHERE claim_upload_item_id = ? AND id != ?', [uploadItemId, effectId]);
  if (claimed.length) {
    throw httpError('Upload item already claims another accounting effect', 409);
  }

  let res;
  try {
    res = await query(
      `UPDATE accounting_effects SET claim_upload_item_id = ?
       WHERE id = ? AND status = 'Draft' AND claim_upload_item_id IS NULL`,
      [uploadItemId, effectId]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw httpError('Upload item already claims another accounting effect', 409);
    throw e;
  }
  if (res.affectedRows === 0) throw httpError('Effect was already claimed or posted by someone else', 409);
  return getEffect(effectId);
};

export const unclaimEffect = async (effectId, userId) => {
  const effect = await getEffect(effectId);
  if (!effect) throw httpError('Accounting effect not found', 404);
  if (effect.status !== 'Draft') {
    throw httpError(effect.status === 'Posted' ? 'Posted effects are terminal - cannot unclaim' : 'Only Draft effects can be unclaimed', 409);
  }
  assertNotOwnDocument(effect, userId, 'created_by', 'unclaim', 'accounting effect');
  if (effect.outlet_id) {
    const effDate = new Date(effect.effective_date);
    await assertMonthEditable(effect.outlet_id, effDate.getMonth() + 1, effDate.getFullYear(), 'An accounting effect claim');
  }
  const res = await query(
    `UPDATE accounting_effects SET claim_upload_item_id = NULL WHERE id = ? AND status = 'Draft'`,
    [effectId]
  );
  if (res.affectedRows === 0) throw httpError('Effect was already handled by someone else', 409);
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

// ---------------------------------------------------------------------------
// Phase 6A3 - GRN -> PURCHASE bridge review flow
// ---------------------------------------------------------------------------

/**
 * Verified-manual-upload duplicate candidates for a GRN PURCHASE effect.
 * Deterministic dimensions only (same rule as the 6A2 reconciliation
 * classification): supplier + normalized invoice + outlet, then raw material
 * at item level. When the GRN carries no invoice reference the only safe
 * residual check is same supplier+outlet+material on the same date.
 *
 * Returns { blockingReason, candidates } - blockingReason NULL means the
 * bridge may post; anything else must be resolved explicitly (claim or
 * manual review), never auto-resolved.
 */
const findManualDuplicateBlock = async (connection, effect, grn) => {
  const invoiceNorm = normalizeInvoice(grn.invoice_reference);

  if (invoiceNorm) {
    const params = [effect.outlet_id, invoiceNorm];
    let supplierClause = '';
    if (effect.supplier_id) { supplierClause = 'AND mpi.supplier_id = ?'; params.push(effect.supplier_id); }
    const [candidates] = await connection.execute(
      `SELECT mpi.id, mpi.raw_material_id, mpi.total_amount, mpi.date, mpi.invoice_no, mpu.batch_id
       FROM material_purchase_items mpi
       INNER JOIN material_purchase_uploads mpu ON mpu.id = mpi.upload_id
       WHERE mpu.status = 'Completed' AND mpu.approval_status = 'Verified'
         AND mpi.outlet_id = ?
         AND UPPER(REGEXP_REPLACE(COALESCE(mpi.invoice_no, ''), '[^A-Za-z0-9]', '')) = ?
         ${supplierClause}`,
      params
    );
    if (candidates.length === 0) return { blockingReason: null, candidates: [] };
    const sameMaterial = candidates.filter((c) => Number(c.raw_material_id) === Number(effect.raw_material_id));
    if (sameMaterial.length === 1) {
      return {
        blockingReason: `Verified manual purchase item #${sameMaterial[0].id} matches this GRN exactly (supplier + invoice + outlet + material). Claim it explicitly before posting.`,
        candidates,
      };
    }
    if (sameMaterial.length > 1 || candidates.length > 1) {
      return {
        blockingReason: `Invoice matches ${candidates.length} Verified manual purchase items - ambiguous duplicate risk, requires manual resolution.`,
        candidates,
      };
    }
    return {
      blockingReason: `A Verified manual purchase carries the same supplier invoice but no safe item-level match - duplicate risk, requires manual resolution.`,
      candidates,
    };
  }

  // No invoice reference on the GRN - invoice-keyed dedupe is impossible.
  // Same supplier + outlet + material + date is still a concrete
  // double-count risk worth blocking on, never a silent pass.
  if (effect.supplier_id) {
    const [candidates] = await connection.execute(
      `SELECT mpi.id, mpi.raw_material_id, mpi.total_amount, mpi.date, mpi.invoice_no, mpu.batch_id
       FROM material_purchase_items mpi
       INNER JOIN material_purchase_uploads mpu ON mpu.id = mpi.upload_id
       WHERE mpu.status = 'Completed' AND mpu.approval_status = 'Verified'
         AND mpi.outlet_id = ? AND mpi.supplier_id = ?
         AND mpi.raw_material_id = ? AND mpi.date = ?`,
      [effect.outlet_id, effect.supplier_id, effect.raw_material_id, effect.effective_date]
    );
    if (candidates.length) {
      return {
        blockingReason: `GRN has no invoice reference and a Verified manual purchase exists for the same supplier/outlet/material/date - ambiguous duplicate risk, requires manual resolution.`,
        candidates,
      };
    }
  }
  return { blockingReason: null, candidates: [] };
};

/**
 * Atomic accounting-checker step for the GRN purchase bridge.
 *
 * In ONE transaction: lock the effect, require Draft, maker-checker self
 * guard (the effect creator is the GRN poster - they cannot be the
 * accounting checker), require GRN/PURCHASE type, require a resolved
 * accounting outlet, period-lock check, re-validate the source GRN and its
 * amounts, enforce the manual-upload double-count rules, then mark the
 * effect Posted with the same user as verified_by and posted_by. Any
 * failure rolls the whole thing back - no externally visible half-Verified
 * state. Posted is terminal in 6A3.
 */
export const verifyAndPostPurchaseEffect = async (effectId, checkerUserId) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute('SELECT * FROM accounting_effects WHERE id = ? FOR UPDATE', [effectId]);
    const effect = rows[0];
    if (!effect) throw httpError('Accounting effect not found', 404);
    if (effect.status !== 'Draft') {
      throw httpError(effect.status === 'Posted' ? 'Effect is already Posted - Posted is terminal' : 'Only Draft effects can be verified and posted', 409);
    }
    assertNotOwnDocument(effect, checkerUserId, 'created_by', 'verify and post', 'accounting effect');
    if (effect.effect_type !== 'PURCHASE' || effect.source_type !== 'GRN') {
      throw httpError('Only GRN PURCHASE effects can be posted through this flow', 400);
    }
    if (!effect.outlet_id) {
      throw httpError('No accounting outlet is assigned to this source location.', 400);
    }

    const effDate = new Date(effect.effective_date);
    await assertMonthEditable(effect.outlet_id, effDate.getMonth() + 1, effDate.getFullYear(), 'An accounting effect');

    const [grnRows] = await connection.execute('SELECT * FROM grn WHERE id = ?', [effect.source_id]);
    const grn = grnRows[0];
    if (!grn || grn.status !== 'Posted') {
      throw httpError('Source GRN is not Posted - the physical receipt no longer supports this effect', 409);
    }
    const [itemRows] = await connection.execute('SELECT * FROM grn_items WHERE id = ? AND grn_id = ?', [effect.source_item_id, effect.source_id]);
    const item = itemRows[0];
    if (!item) throw httpError('Source GRN item no longer exists', 409);

    // Amount semantics: grn_items.total_amount = accepted_qty*rate + tax_amount
    // (verified against createGRN). base + tax must equal total on both sides.
    const base = num(item.accepted_qty) * num(item.rate);
    const total = base + num(item.tax_amount);
    if (
      Math.abs(num(item.total_amount) - total) > 0.01 ||
      Math.abs(num(effect.base_amount) - base) > 0.01 ||
      Math.abs(num(effect.tax_amount) - num(item.tax_amount)) > 0.01 ||
      Math.abs(num(effect.total_amount) - num(item.total_amount)) > 0.01
    ) {
      throw httpError('Amount semantics inconsistent between GRN item and accounting effect - posting blocked for review', 409);
    }

    if (effect.claim_upload_item_id) {
      const [claimRows] = await connection.execute(
        `SELECT mpi.id, mpu.status AS upload_status, mpu.approval_status
         FROM material_purchase_items mpi
         INNER JOIN material_purchase_uploads mpu ON mpu.id = mpi.upload_id
         WHERE mpi.id = ?`,
        [effect.claim_upload_item_id]
      );
      const claim = claimRows[0];
      if (!claim || claim.upload_status !== 'Completed' || claim.approval_status !== 'Verified') {
        throw httpError('Claimed upload item is no longer a Completed + Verified purchase - resolve the claim before posting', 409);
      }
    } else {
      const { blockingReason, candidates } = await findManualDuplicateBlock(connection, effect, grn);
      if (blockingReason) {
        const err = httpError(blockingReason, 409);
        err.duplicate_candidates = candidates;
        throw err;
      }
    }

    const [upd] = await connection.execute(
      `UPDATE accounting_effects
       SET status = 'Posted', verified_by = ?, verified_at = NOW(), posted_by = ?, posted_at = NOW()
       WHERE id = ? AND status = 'Draft'`,
      [checkerUserId, checkerUserId, effectId]
    );
    if (upd.affectedRows === 0) {
      throw httpError('Effect was already handled by someone else', 409);
    }

    await connection.commit();
    return getEffect(effectId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Diagnostic duplicate-risk count for a Draft GRN PURCHASE effect - same
 * deterministic rule as findManualDuplicateBlock, used to badge the review
 * list. Read-only, non-blocking.
 */
const countDuplicateCandidates = async (effect) => {
  if (effect.source_type !== 'GRN' || !effect.outlet_id) return 0;
  const [grnRows] = await query('SELECT invoice_reference FROM grn WHERE id = ?', [effect.source_id]);
  const invoiceNorm = normalizeInvoice(grnRows[0]?.invoice_reference);
  if (!invoiceNorm) return 0;
  const params = [effect.outlet_id, invoiceNorm];
  let supplierClause = '';
  if (effect.supplier_id) { supplierClause = 'AND mpi.supplier_id = ?'; params.push(effect.supplier_id); }
  const rows = await query(
    `SELECT COUNT(*) AS n
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpu.id = mpi.upload_id
     WHERE mpu.status = 'Completed' AND mpu.approval_status = 'Verified'
       AND mpi.outlet_id = ?
       AND UPPER(REGEXP_REPLACE(COALESCE(mpi.invoice_no, ''), '[^A-Za-z0-9]', '')) = ?
       ${supplierClause}`,
    params
  );
  return Number(rows[0]?.n || 0);
};

/**
 * Review-list view of GRN PURCHASE effects with the GRN, location, supplier,
 * material, claim and duplicate-risk context a checker needs. Read-only.
 */
export const listPurchaseEffects = async ({ status = null, outletIds = null, includeUnowned = false, limit = 200 } = {}) => {
  const clauses = [`ae.effect_type = 'PURCHASE'`, `ae.source_type = 'GRN'`];
  const params = [];
  if (status) { clauses.push('ae.status = ?'); params.push(status); }
  if (!includeUnowned) clauses.push('ae.outlet_id IS NOT NULL');
  if (outletIds && outletIds.length) {
    clauses.push(`ae.outlet_id IN (${outletIds.map(() => '?').join(',')})`);
    params.push(...outletIds);
  }
  // LIMIT is inlined (already clamped to an integer here) rather than bound -
  // pool.execute's prepared statements reject a numeric LIMIT parameter on
  // this MySQL version (ER_WRONG_ARGUMENTS).
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
  const rows = await query(
    `SELECT ae.*, g.grn_no, g.grn_date, g.invoice_reference, g.warehouse_location_id,
            l.location_name, l.location_type, s.supplier_name,
            rm.material_name, rm.material_code, u.unit_name,
            cu.full_name AS created_by_name, vu.full_name AS verified_by_name, pu.full_name AS posted_by_name,
            ae.claim_upload_item_id AS claimed_item_id
     FROM accounting_effects ae
     LEFT JOIN grn g ON g.id = ae.source_id
     LEFT JOIN locations l ON l.id = ae.location_id
     LEFT JOIN suppliers s ON s.id = ae.supplier_id
     LEFT JOIN raw_materials rm ON rm.id = ae.raw_material_id
     LEFT JOIN units u ON u.id = ae.unit_id
     LEFT JOIN users cu ON cu.id = ae.created_by
     LEFT JOIN users vu ON vu.id = ae.verified_by
     LEFT JOIN users pu ON pu.id = ae.posted_by
     WHERE ${clauses.join(' AND ')}
     ORDER BY ae.id DESC
     LIMIT ${lim}`,
    params
  );
  for (const row of rows) {
    row.duplicate_candidate_count = row.status === 'Posted' ? 0 : await countDuplicateCandidates(row);
    row.duplicate_risk = row.duplicate_candidate_count > 0;
    row.bridge_state = row.claim_upload_item_id
      ? (row.status === 'Posted' ? 'CLAIMED_POSTED_EFFECT' : 'CLAIMED_DRAFT_EFFECT')
      : (row.status === 'Posted' ? 'POSTED_EFFECT' : 'DRAFT_EFFECT');
    row.accounting_owner = row.outlet_id ? 'RESOLVED' : 'UNRESOLVED';
  }
  return rows;
};

export const getPurchaseEffectDetail = async (effectId) => {
  const rows = await query(
    `SELECT ae.*, g.grn_no, g.grn_date, g.invoice_reference, g.warehouse_location_id,
            l.location_name, l.location_type, s.supplier_name,
            rm.material_name, rm.material_code, u.unit_name,
            cu.full_name AS created_by_name, vu.full_name AS verified_by_name, pu.full_name AS posted_by_name,
            ae.claim_upload_item_id AS claimed_item_id
     FROM accounting_effects ae
     LEFT JOIN grn g ON g.id = ae.source_id
     LEFT JOIN locations l ON l.id = ae.location_id
     LEFT JOIN suppliers s ON s.id = ae.supplier_id
     LEFT JOIN raw_materials rm ON rm.id = ae.raw_material_id
     LEFT JOIN units u ON u.id = ae.unit_id
     LEFT JOIN users cu ON cu.id = ae.created_by
     LEFT JOIN users vu ON vu.id = ae.verified_by
     LEFT JOIN users pu ON pu.id = ae.posted_by
     WHERE ae.id = ? AND ae.effect_type = 'PURCHASE' AND ae.source_type = 'GRN'`,
    [effectId]
  );
  const row = rows[0];
  if (!row) return null;
  row.duplicate_candidate_count = row.status === 'Posted' ? 0 : await countDuplicateCandidates(row);
  row.duplicate_risk = row.duplicate_candidate_count > 0;
  row.bridge_state = row.claim_upload_item_id
    ? (row.status === 'Posted' ? 'CLAIMED_POSTED_EFFECT' : 'CLAIMED_DRAFT_EFFECT')
    : (row.status === 'Posted' ? 'POSTED_EFFECT' : 'DRAFT_EFFECT');
  row.accounting_owner = row.outlet_id ? 'RESOLVED' : 'UNRESOLVED';
  return row;
};

export { getConnection };
