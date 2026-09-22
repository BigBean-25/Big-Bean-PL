import { randomUUID } from 'crypto';
import { query, getConnection } from '../config/database.js';
import { assertNotOwnDocument } from '../utils/makerChecker.js';
import { assertDateEditable } from '../utils/periodLock.js';

const num = (value) => Number(value || 0);
const today = () => new Date().toISOString().slice(0, 10);
const parseJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

const badRequest = (msg, statusCode = 400) => {
  const err = new Error(msg);
  err.statusCode = statusCode;
  return err;
};

const EXCEPTION_TYPES = new Set([
  'DATA_CORRECTION',
  'FINANCIAL_REVERSAL',
  'PHYSICAL_REVERSAL',
  'DUPLICATE_TRANSACTION',
  'WRONG_OUTLET',
  'WRONG_AMOUNT',
  'WRONG_DATE',
  'WRONG_MATERIAL',
  'OTHER',
]);

const TERMINAL_STATUSES = {
  supplier_payments: ['Verified'],
  outlet_vendor_payments: ['Verified'],
  accounting_effects: ['Posted'],
  purchase_returns: ['Posted', 'Locked'],
  outlet_consumptions: ['Posted', 'Locked'],
};

const SUPPORT_MATRIX = {
  supplier_payments: {
    support_status: 'FULL_REVERSAL_SUPPORTED',
    business_impact: 'FINANCIAL',
    source_label: 'supplier payment',
  },
  outlet_vendor_payments: {
    support_status: 'FULL_REVERSAL_SUPPORTED',
    business_impact: 'FINANCIAL',
    source_label: 'outlet vendor payment',
  },
  accounting_effects: {
    support_status: 'FULL_REVERSAL_SUPPORTED',
    business_impact: 'FINANCIAL',
    source_label: 'GRN accounting effect',
  },
  purchase_returns: {
    support_status: 'FULL_REVERSAL_SUPPORTED',
    business_impact: 'BOTH',
    source_label: 'purchase return',
  },
  outlet_consumptions: {
    support_status: 'FULL_REVERSAL_SUPPORTED',
    business_impact: 'PHYSICAL',
    source_label: 'outlet consumption',
  },
};

const MANUAL_SUPPORT = {
  support_status: 'REQUEST_ONLY_REQUIRES_MANUAL_RESOLUTION',
  business_impact: 'MANUAL',
  source_label: 'unsupported record',
};

const buildExceptionNo = () => `EXC-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const buildReversalKey = (row) => [row.source_module, row.source_type, row.source_id, row.source_item_id ?? 0, row.exception_type].join(':');

const ensureExceptionType = (value) => {
  const type = String(value || '').toUpperCase();
  if (!EXCEPTION_TYPES.has(type)) {
    const err = new Error('Invalid exception_type');
    err.statusCode = 400;
    throw err;
  }
  return type;
};

const ensureReason = (reason) => {
  const text = String(reason || '').trim();
  if (!text) {
    const err = new Error('reason is required');
    err.statusCode = 400;
    throw err;
  }
  return text;
};

const isScopeAllowed = (scope, outletId) => {
  if (!scope || scope.all) return true;
  const allowed = (scope.outletIds || []).map(Number);
  if (outletId === null || outletId === undefined) return false;
  return allowed.includes(Number(outletId));
};

const loadSupplierPayment = async (id) => {
  const rows = await query('SELECT * FROM supplier_payments WHERE id = ? LIMIT 1', [id]);
  const row = rows[0];
  if (!row) return null;
  if (row.status !== 'Verified') {
    const err = new Error('Only Verified supplier payments can be reversed through exceptions - Draft/Submitted/Rejected payments still have a normal correction path');
    err.statusCode = 400;
    throw err;
  }
  return {
    source_module: 'supplier_payments',
    source_type: 'supplier_payments',
    source_id: row.id,
    source_item_id: null,
    outlet_id: row.outlet_id,
    location_id: null,
    source_status: row.status,
    source_date: row.date,
    original_amount: num(row.paid_amount),
    original_qty: null,
    support_status: SUPPORT_MATRIX.supplier_payments.support_status,
    business_impact: SUPPORT_MATRIX.supplier_payments.business_impact,
    source_snapshot_json: row,
  };
};

// Outlet vendor payments (7D2B1): Verified + non-reversal originals only.
// Legacy backfilled rows (verified_by/at NULL) stay eligible - eligibility is
// status + is_reversal only, never verifier presence.
const loadOutletVendorPayment = async (id) => {
  const rows = await query('SELECT * FROM outlet_vendor_payments WHERE id = ? LIMIT 1', [id]);
  const row = rows[0];
  if (!row) return null;
  if (row.status !== 'Verified' || Number(row.is_reversal) === 1) {
    const err = new Error('Only Verified outlet vendor payments can be reversed through exceptions - Draft/Submitted/Rejected payments still have a normal correction path');
    err.statusCode = 400;
    throw err;
  }
  return {
    source_module: 'outlet_vendor_payments',
    source_type: 'outlet_vendor_payments',
    source_id: row.id,
    source_item_id: null,
    outlet_id: row.outlet_id,
    location_id: null,
    source_status: row.status,
    source_date: row.date,
    original_amount: num(row.paid_amount),
    original_qty: null,
    support_status: SUPPORT_MATRIX.outlet_vendor_payments.support_status,
    business_impact: SUPPORT_MATRIX.outlet_vendor_payments.business_impact,
    source_snapshot_json: row,
  };
};

const loadAccountingEffect = async (id) => {
  const rows = await query('SELECT * FROM accounting_effects WHERE id = ? LIMIT 1', [id]);
  const row = rows[0];
  if (!row) return null;
  if (!(row.source_type === 'GRN' && row.effect_type === 'PURCHASE' && row.status === 'Posted')) {
    const err = new Error('Only posted GRN purchase effects can be reversed through exceptions');
    err.statusCode = 400;
    throw err;
  }
  return {
    source_module: 'accounting_effects',
    source_type: 'accounting_effects',
    source_id: row.id,
    source_item_id: row.source_item_id,
    outlet_id: row.outlet_id,
    location_id: row.location_id,
    source_status: row.status,
    source_date: row.effective_date,
    original_amount: num(row.total_amount),
    original_qty: row.quantity === null || row.quantity === undefined ? null : num(row.quantity),
    support_status: SUPPORT_MATRIX.accounting_effects.support_status,
    business_impact: SUPPORT_MATRIX.accounting_effects.business_impact,
    source_snapshot_json: row,
  };
};

const loadPurchaseReturn = async (id) => {
  const rows = await query('SELECT * FROM purchase_returns WHERE id = ? LIMIT 1', [id]);
  const row = rows[0];
  if (!row) return null;
  if (!['Posted', 'Locked'].includes(row.status)) {
    const err = new Error('Only posted purchase returns can be reversed through exceptions');
    err.statusCode = 400;
    throw err;
  }
  const items = await query('SELECT * FROM purchase_return_items WHERE purchase_return_id = ? ORDER BY id', [id]);
  const credits = await query('SELECT * FROM supplier_credits WHERE purchase_return_id = ? LIMIT 1', [id]);
  const loc = (await query('SELECT outlet_id FROM locations WHERE id = ? LIMIT 1', [row.warehouse_location_id]))[0] || null;
  return {
    source_module: 'purchase_returns',
    source_type: 'purchase_returns',
    source_id: row.id,
    source_item_id: null,
    outlet_id: loc?.outlet_id ?? null,
    location_id: row.warehouse_location_id,
    source_status: row.status,
    source_date: row.return_date,
    original_amount: num(row.total_return_value),
    original_qty: num(row.total_return_qty),
    support_status: SUPPORT_MATRIX.purchase_returns.support_status,
    business_impact: SUPPORT_MATRIX.purchase_returns.business_impact,
    source_snapshot_json: { header: row, items, supplier_credit: credits[0] || null },
  };
};

const loadOutletConsumption = async (id) => {
  const rows = await query('SELECT * FROM outlet_consumptions WHERE id = ? LIMIT 1', [id]);
  const row = rows[0];
  if (!row) return null;
  if (!['Posted', 'Locked'].includes(row.status)) {
    const err = new Error('Only posted outlet consumptions can be reversed through exceptions');
    err.statusCode = 400;
    throw err;
  }
  const items = await query('SELECT * FROM outlet_consumption_items WHERE consumption_id = ? ORDER BY id', [id]);
  const ledger = await query("SELECT * FROM stock_ledger WHERE transaction_type = 'OUTLET_CONSUMPTION' AND reference_type = 'OUTLET_CONSUMPTION' AND reference_id = ? ORDER BY id", [id]);
  return {
    source_module: 'outlet_consumptions',
    source_type: 'outlet_consumptions',
    source_id: row.id,
    source_item_id: null,
    outlet_id: row.outlet_id,
    location_id: row.location_id,
    source_status: row.status,
    source_date: row.consumption_date,
    original_amount: num(row.total_value),
    original_qty: num(row.total_qty),
    support_status: SUPPORT_MATRIX.outlet_consumptions.support_status,
    business_impact: SUPPORT_MATRIX.outlet_consumptions.business_impact,
    source_snapshot_json: { header: row, items, ledger },
  };
};

const loadSource = async (sourceModule, sourceId) => {
  if (!sourceId) {
    const err = new Error('source_id is required');
    err.statusCode = 400;
    throw err;
  }
  if (sourceModule === 'supplier_payments') return loadSupplierPayment(sourceId);
  if (sourceModule === 'outlet_vendor_payments') return loadOutletVendorPayment(sourceId);
  if (sourceModule === 'accounting_effects') return loadAccountingEffect(sourceId);
  if (sourceModule === 'purchase_returns') return loadPurchaseReturn(sourceId);
  if (sourceModule === 'outlet_consumptions') return loadOutletConsumption(sourceId);
  return null;
};

const rowToDetail = (row) => ({
  ...row,
  original_payload_json: parseJson(row.original_payload_json),
  reversal_payload_json: parseJson(row.reversal_payload_json),
});

export const getControlledExceptionSupportMatrix = () => ({
  supported: Object.entries(SUPPORT_MATRIX).map(([module_key, cfg]) => ({ module_key, ...cfg })),
  manual: MANUAL_SUPPORT,
});

export const listControlledExceptions = async ({ outletId = null, status = null, sourceModule = null, limit = 200 } = {}) => {
  const clauses = [];
  const params = [];
  if (outletId) { clauses.push('ce.outlet_id = ?'); params.push(outletId); }
  if (status) { clauses.push('ce.status = ?'); params.push(status); }
  if (sourceModule) { clauses.push('ce.source_module = ?'); params.push(sourceModule); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const rows = await query(
    `SELECT ce.*, o.outlet_name
     FROM controlled_exceptions ce
     LEFT JOIN outlets o ON o.id = ce.outlet_id
     ${where}
     ORDER BY ce.id DESC
     LIMIT ${lim}`,
    params
  );
  return rows.map(rowToDetail);
};

export const getControlledExceptionById = async (id) => {
  const rows = await query(
    `SELECT ce.*, o.outlet_name, l.location_name, u1.full_name AS requested_by_name,
            u2.full_name AS submitted_by_name, u3.full_name AS reviewed_by_name,
            u4.full_name AS approved_by_name, u5.full_name AS rejected_by_name,
            u6.full_name AS executed_by_name
     FROM controlled_exceptions ce
     LEFT JOIN outlets o ON o.id = ce.outlet_id
     LEFT JOIN locations l ON l.id = ce.location_id
     LEFT JOIN users u1 ON u1.id = ce.requested_by
     LEFT JOIN users u2 ON u2.id = ce.submitted_by
     LEFT JOIN users u3 ON u3.id = ce.reviewed_by
     LEFT JOIN users u4 ON u4.id = ce.approved_by
     LEFT JOIN users u5 ON u5.id = ce.rejected_by
     LEFT JOIN users u6 ON u6.id = ce.executed_by
     WHERE ce.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] ? rowToDetail(rows[0]) : null;
};

export const createControlledException = async ({ sourceModule, sourceType, sourceId, sourceItemId = null, outletId = null, locationId = null, exceptionType, reason, businessImpact, requestedBy, outletScope = null }) => {
  const moduleKey = String(sourceModule || '').trim();
  if (!moduleKey) {
    const err = new Error('source_module is required');
    err.statusCode = 400;
    throw err;
  }
  const sourceKey = String(sourceType || moduleKey).trim();
  const sourceIdNum = Number(sourceId);
  if (!sourceIdNum) {
    const err = new Error('source_id is required');
    err.statusCode = 400;
    throw err;
  }
  const excType = ensureExceptionType(exceptionType);
  const reasonText = ensureReason(reason);

  const source = await loadSource(moduleKey, sourceIdNum);
  if (!source && SUPPORT_MATRIX[moduleKey]) {
    const err = new Error(`${SUPPORT_MATRIX[moduleKey].source_label} #${sourceIdNum} not found`);
    err.statusCode = 404;
    throw err;
  }
  const support = source ? (SUPPORT_MATRIX[moduleKey] || MANUAL_SUPPORT) : MANUAL_SUPPORT;
  const impact = String(businessImpact || '').trim().toUpperCase() || support.business_impact;

  const resolvedOutletId = source?.outlet_id ?? outletId ?? null;
  if (outletScope && !isScopeAllowed(outletScope, resolvedOutletId)) {
    const err = new Error('You do not have access to the requested outlet');
    err.statusCode = 403;
    throw err;
  }

  const exceptionNo = buildExceptionNo();
  const row = {
    exception_no: exceptionNo,
    source_module: moduleKey,
    source_type: sourceKey,
    source_id: sourceIdNum,
    source_item_id: sourceItemId === null || sourceItemId === undefined ? null : Number(sourceItemId),
    outlet_id: resolvedOutletId,
    location_id: source?.location_id ?? locationId ?? null,
    exception_type: excType,
    reason: reasonText,
    business_impact: impact,
    source_status: source?.source_status ?? null,
    source_date: source?.source_date ?? null,
    original_amount: source?.original_amount ?? null,
    original_qty: source?.original_qty ?? null,
    requested_by: requestedBy,
    status: 'Requested',
    support_status: source ? support.support_status : MANUAL_SUPPORT.support_status,
    original_payload_json: source?.source_snapshot_json ? JSON.stringify(source.source_snapshot_json) : null,
  };

  const result = await query(
    `INSERT INTO controlled_exceptions (
      exception_no, source_module, source_type, source_id, source_item_id, outlet_id, location_id,
      exception_type, reason, business_impact, source_status, source_date, original_amount, original_qty,
      requested_by, status, support_status, original_payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.exception_no, row.source_module, row.source_type, row.source_id, row.source_item_id, row.outlet_id, row.location_id,
      row.exception_type, row.reason, row.business_impact, row.source_status, row.source_date, row.original_amount, row.original_qty,
      row.requested_by, row.status, row.support_status, row.original_payload_json,
    ]
  );

  return getControlledExceptionById(result.insertId);
};

const transitionControlledException = async (id, userId, action, extra = {}) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM controlled_exceptions WHERE id = ? FOR UPDATE', [id]);
    const current = rows[0];
    if (!current) {
      await conn.rollback();
      throw badRequest('Exception not found', 404);
    }

    if (['verify', 'approve', 'reject', 'execute'].includes(action)) {
      assertNotOwnDocument(current, userId, 'requested_by', action, 'exception');
    }

    const set = { updated_at: new Date() };
    if (action === 'submit') {
      if (current.status !== 'Requested') throw badRequest(`Cannot submit an exception with status "${current.status}"`);
      set.status = 'Under Review';
      set.submitted_by = userId;
      set.submitted_at = new Date();
    } else if (action === 'verify') {
      if (current.status !== 'Under Review') throw badRequest(`Cannot verify an exception with status "${current.status}"`);
      set.reviewed_by = userId;
      set.reviewed_at = new Date();
      set.status = 'Under Review';
    } else if (action === 'approve') {
      if (current.status !== 'Under Review') throw badRequest(`Cannot approve an exception with status "${current.status}"`);
      if (!current.reviewed_by) throw badRequest('Exception must be reviewed before approval');
      set.approved_by = userId;
      set.approved_at = new Date();
      set.status = 'Approved';
    } else if (action === 'reject') {
      if (!['Requested', 'Under Review'].includes(current.status)) throw badRequest(`Cannot reject an exception with status "${current.status}"`);
      const reason = ensureReason(extra.rejection_reason);
      set.status = 'Rejected';
      set.rejected_by = userId;
      set.rejected_at = new Date();
      set.rejection_reason = reason;
    } else if (action === 'cancel') {
      if (!['Requested', 'Under Review'].includes(current.status)) throw badRequest(`Cannot cancel an exception with status "${current.status}"`);
      set.status = 'Cancelled';
    } else {
      throw badRequest(`Unsupported exception transition ${action}`);
    }

    const keys = Object.keys(set);
    const sql = `UPDATE controlled_exceptions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    await conn.execute(sql, [...keys.map((k) => set[k]), id]);
    await conn.commit();
    return getControlledExceptionById(id);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

export const submitControlledException = (id, userId) => transitionControlledException(id, userId, 'submit');
export const verifyControlledException = (id, userId) => transitionControlledException(id, userId, 'verify');
export const approveControlledException = (id, userId) => transitionControlledException(id, userId, 'approve');
export const rejectControlledException = (id, userId, rejectionReason) => transitionControlledException(id, userId, 'reject', { rejection_reason: rejectionReason });

// Source rows are read on the transaction connection with FOR UPDATE so two
// concurrent executions against the SAME source serialize on the source row
// lock: the loser waits, then observes the reversal link and aborts before
// writing anything.
const loadSourceForExecute = async (conn, exception) => {
  if (exception.source_module === 'supplier_payments') {
    const [rows] = await conn.execute('SELECT * FROM supplier_payments WHERE id = ? LIMIT 1 FOR UPDATE', [exception.source_id]);
    const row = rows[0];
    if (!row || row.status !== 'Verified') throw badRequest('Supplier payment is no longer in Verified state');
    if (row.reversal_of_payment_id) throw badRequest('Supplier payment already reversed');
    return { row, support: SUPPORT_MATRIX.supplier_payments };
  }
  if (exception.source_module === 'outlet_vendor_payments') {
    const [rows] = await conn.execute('SELECT * FROM outlet_vendor_payments WHERE id = ? LIMIT 1 FOR UPDATE', [exception.source_id]);
    const row = rows[0];
    if (!row || row.status !== 'Verified' || Number(row.is_reversal) === 1) throw badRequest('Outlet vendor payment is no longer a reversible Verified payment');
    if (row.reversal_of_payment_id) throw badRequest('Outlet vendor payment already reversed');
    return { row, support: SUPPORT_MATRIX.outlet_vendor_payments };
  }
  if (exception.source_module === 'accounting_effects') {
    const [rows] = await conn.execute('SELECT * FROM accounting_effects WHERE id = ? LIMIT 1 FOR UPDATE', [exception.source_id]);
    const row = rows[0];
    if (!row || !(row.source_type === 'GRN' && row.effect_type === 'PURCHASE' && row.status === 'Posted')) throw badRequest('GRN purchase effect is no longer posted');
    if (row.reversal_of_effect_id) throw badRequest('GRN purchase effect already reversed');
    return { row, support: SUPPORT_MATRIX.accounting_effects };
  }
  if (exception.source_module === 'purchase_returns') {
    const [rows] = await conn.execute('SELECT * FROM purchase_returns WHERE id = ? LIMIT 1 FOR UPDATE', [exception.source_id]);
    const row = rows[0];
    if (!row || !['Posted', 'Locked'].includes(row.status)) throw badRequest('Purchase return is no longer posted or locked');
    if (row.reversal_of_return_id) throw badRequest('Purchase return already reversed');
    const [items] = await conn.execute('SELECT * FROM purchase_return_items WHERE purchase_return_id = ? ORDER BY id', [exception.source_id]);
    return { row, items, support: SUPPORT_MATRIX.purchase_returns };
  }
  if (exception.source_module === 'outlet_consumptions') {
    const [rows] = await conn.execute('SELECT * FROM outlet_consumptions WHERE id = ? LIMIT 1 FOR UPDATE', [exception.source_id]);
    const row = rows[0];
    if (!row || !['Posted', 'Locked'].includes(row.status)) throw badRequest('Outlet consumption is no longer posted or locked');
    if (row.reversal_exception_id) throw badRequest('Outlet consumption already reversed');
    const [ledger] = await conn.execute("SELECT * FROM stock_ledger WHERE transaction_type = 'OUTLET_CONSUMPTION' AND reference_type = 'OUTLET_CONSUMPTION' AND reference_id = ? ORDER BY id", [exception.source_id]);
    return { row, ledger, support: SUPPORT_MATRIX.outlet_consumptions };
  }
  throw badRequest('This exception source requires manual resolution');
};

// Claim the source row for this reversal. The IS NULL guard plus the
// affectedRows check makes the claim atomic even if two exceptions race the
// same source past the FOR UPDATE read.
const claimSourceForReversal = async (conn, table, linkColumn, linkValue, exceptionId, sourceId) => {
  const [res] = await conn.execute(
    `UPDATE ${table} SET ${linkColumn} = ?, reversal_exception_id = ? WHERE id = ? AND ${linkColumn} IS NULL AND reversal_exception_id IS NULL`,
    [linkValue, exceptionId, sourceId]
  );
  if (res.affectedRows === 0) throw badRequest('Source record is already linked to a reversal');
};

const insertReversalException = async (conn, exception, reversalDate, reversalAmount, reversalQty, reversalRefType, reversalRefId, reversalPayload) => {
  const reversalKey = buildReversalKey(exception);
  const [res] = await conn.execute(
    `UPDATE controlled_exceptions
     SET status = 'Executed', executed_by = ?, executed_at = NOW(), reversal_reference_type = ?, reversal_reference_id = ?, reversal_effective_date = ?, reversal_amount = ?, reversal_qty = ?, reversal_payload_json = ?, reversal_key = ?, updated_at = NOW()
     WHERE id = ? AND status = 'Approved' AND reversal_key IS NULL`,
    [
      reversalPayload.executed_by,
      reversalRefType,
      reversalRefId,
      reversalDate,
      reversalAmount,
      reversalQty,
      JSON.stringify(reversalPayload),
      reversalKey,
      exception.id,
    ]
  );
  if (res.affectedRows === 0) throw badRequest('Exception was already executed or not approved');
};

const getOpenCorrectionDate = async (exception, correctionDate) => {
  const date = correctionDate || today();
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    const err = new Error('reversal_effective_date is not a valid date');
    err.statusCode = 400;
    throw err;
  }
  if (exception.outlet_id) {
    await assertDateEditable(exception.outlet_id, date, 'A controlled reversal');
  }
  return date;
};

export const executeControlledException = async ({ exceptionId, executedBy, reversalEffectiveDate = null }) => {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM controlled_exceptions WHERE id = ? FOR UPDATE', [exceptionId]);
    const exception = rows[0];
    if (!exception) throw badRequest('Exception not found', 404);
    if (exception.status !== 'Approved') throw badRequest(`Cannot execute an exception with status "${exception.status}"`);

    assertNotOwnDocument(exception, executedBy, 'requested_by', 'execute', 'exception');
    const source = await loadSourceForExecute(conn, exception);
    const correctionDate = await getOpenCorrectionDate(exception, reversalEffectiveDate);

    let reversalPayload = { executed_by: executedBy };
    let reversalRefType = null;
    let reversalRefId = null;
    let reversalAmount = num(exception.original_amount);
    let reversalQty = exception.original_qty === null || exception.original_qty === undefined ? null : num(exception.original_qty);

    if (exception.source_module === 'supplier_payments') {
      const original = source.row;
      reversalRefType = 'supplier_payments';
      // Compensating Verified payment with negative paid_amount: the canonical
      // supplier-ledger cumulative Verified-payment sum decreases by exactly
      // the original amount, so outstanding increases by exactly that amount.
      // The original row is never modified except for its audit link.
      const [res] = await conn.execute(
        `INSERT INTO supplier_payments
         (date, outlet_id, supplier_id, opening_pending, purchase_value, paid_amount, payment_mode_id, reference_no, remarks, status, submitted_by, submitted_at, verified_by, verified_at, created_by, proof_attachment, is_reversal, reversal_of_payment_id, reversal_exception_id)
         VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, 'Verified', ?, NOW(), ?, NOW(), ?, NULL, 1, ?, ?)`,
        [
          correctionDate,
          original.outlet_id,
          original.supplier_id,
          -Math.abs(num(original.paid_amount)),
          original.payment_mode_id ?? null,
          `REV-${exception.exception_no}`,
          `Controlled reversal of supplier payment #${original.id} via exception ${exception.exception_no}`,
          executedBy,
          executedBy,
          executedBy,
          original.id,
          exception.id,
        ]
      );
      reversalRefId = res.insertId;
      reversalPayload = { ...reversalPayload, reversal_payment_id: reversalRefId, original_payment_id: original.id, reversal_amount: -Math.abs(num(original.paid_amount)) };
      await claimSourceForReversal(conn, 'supplier_payments', 'reversal_of_payment_id', reversalRefId, exception.id, original.id);
    } else if (exception.source_module === 'outlet_vendor_payments') {
      const original = source.row;
      reversalRefType = 'outlet_vendor_payments';
      // Compensating Verified payment with negative paid_amount: the canonical
      // outlet-vendor cumulative Verified-payment sum decreases by exactly the
      // original amount, so outstanding restores by that amount. Prospective -
      // the reversal carries the correction date, not the original date. The
      // original row is never modified except for its audit link.
      const [res] = await conn.execute(
        `INSERT INTO outlet_vendor_payments
         (outlet_id, vendor_id, date, paid_amount, payment_mode_id, reference_no, remarks, status, submitted_by, submitted_at, verified_by, verified_at, created_by, is_reversal, reversal_of_payment_id, reversal_exception_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Verified', ?, NOW(), ?, NOW(), ?, 1, ?, ?)`,
        [
          original.outlet_id,
          original.vendor_id,
          correctionDate,
          -Math.abs(num(original.paid_amount)),
          original.payment_mode_id ?? null,
          `REV-${exception.exception_no}`,
          `Controlled reversal of outlet vendor payment #${original.id} via exception ${exception.exception_no}`,
          executedBy,
          executedBy,
          executedBy,
          original.id,
          exception.id,
        ]
      );
      reversalRefId = res.insertId;
      reversalPayload = { ...reversalPayload, reversal_payment_id: reversalRefId, original_payment_id: original.id, reversal_amount: -Math.abs(num(original.paid_amount)) };
      await claimSourceForReversal(conn, 'outlet_vendor_payments', 'reversal_of_payment_id', reversalRefId, exception.id, original.id);
    } else if (exception.source_module === 'accounting_effects') {
      const original = source.row;
      reversalRefType = 'accounting_effects';
      const [res] = await conn.execute(
        `INSERT INTO accounting_effects
         (effect_type, source_type, source_id, source_item_id, outlet_id, location_id, supplier_id, raw_material_id,
          effective_date, quantity, unit_id, base_amount, tax_amount, total_amount, claim_upload_item_id,
          status, created_by, verified_by, verified_at, posted_by, posted_at, is_reversal, reversal_of_effect_id, reversal_exception_id, metadata_json)
         VALUES ('PURCHASE', 'CONTROLLED_EXCEPTION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'Posted', ?, ?, NOW(), ?, NOW(), 1, ?, ?, ?)`,
        [
          exception.id,
          original.id,
          original.outlet_id,
          original.location_id,
          original.supplier_id,
          original.raw_material_id,
          correctionDate,
          original.quantity === null || original.quantity === undefined ? null : -Math.abs(num(original.quantity)),
          original.unit_id,
          -Math.abs(num(original.base_amount)),
          -Math.abs(num(original.tax_amount)),
          -Math.abs(num(original.total_amount)),
          executedBy,
          executedBy,
          executedBy,
          original.id,
          exception.id,
          JSON.stringify({ reversal_of_effect_id: original.id, exception_id: exception.id }),
        ]
      );
      reversalRefId = res.insertId;
      reversalPayload = { ...reversalPayload, reversal_effect_id: reversalRefId, original_effect_id: original.id, reversal_amount: -Math.abs(num(original.total_amount)) };
      await claimSourceForReversal(conn, 'accounting_effects', 'reversal_of_effect_id', reversalRefId, exception.id, original.id);
    } else if (exception.source_module === 'purchase_returns') {
      const original = source.row;
      reversalRefType = 'purchase_returns';
      const reversalNo = `REV-${exception.exception_no}`;
      // Compensating return document carries NEGATIVE header/item values so
      // every existing Posted-return aggregate (supplier history totals,
      // purchase-return GST, reconciliation listings) nets original +X with
      // reversal -X to zero. The physical restoration is written as positive
      // qty_in/value_in stock_ledger rows below.
      const [hdr] = await conn.execute(
        `INSERT INTO purchase_returns
         (return_no, return_date, supplier_id, grn_id, warehouse_location_id, supplier_invoice_reference, supplier_credit_note_no, supplier_credit_note_date,
          return_reason, remarks, total_return_qty, total_return_value, status, created_by, submitted_by, submitted_at, verified_by, verified_at, approved_by, approved_at, posted_by, posted_at, locked_by, locked_at,
          is_reversal, reversal_of_return_id, reversal_exception_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?, NOW(), ?, NOW(), ?, NOW(), ?, NOW(), ?, NOW(), 1, ?, ?)`,
        [
          reversalNo,
          correctionDate,
          original.supplier_id,
          original.grn_id,
          original.warehouse_location_id,
          original.supplier_invoice_reference,
          `REV-${original.supplier_credit_note_no || original.return_no || exception.exception_no}`,
          correctionDate,
          original.return_reason,
          `Controlled reversal of purchase return #${original.id} via exception ${exception.exception_no}`,
          -Math.abs(num(original.total_return_qty)),
          -Math.abs(num(original.total_return_value)),
          executedBy,
          executedBy,
          executedBy,
          executedBy,
          executedBy,
          executedBy,
          original.id,
          exception.id,
        ]
      );
      const reversalId = hdr.insertId;
      const items = source.items || [];
      for (const it of items) {
        // Compensating item rows mirror the original item exactly (same qty,
        // same original/inventory unit cost, same batch) but negated - no
        // recalculation against today's WAC, the reversal restores exactly
        // what the original return removed.
        const value = num(it.base_qty) * num(it.inventory_unit_cost);
        await conn.execute(
          `INSERT INTO purchase_return_items
           (purchase_return_id, grn_item_id, raw_material_id, batch_no, expiry_date, return_qty, input_unit_id, base_qty, base_unit_id,
            original_purchase_rate, supplier_credit_value, inventory_unit_cost, inventory_value, reason, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [reversalId, it.grn_item_id, it.raw_material_id, it.batch_no, it.expiry_date, -Math.abs(num(it.return_qty)), it.input_unit_id,
           -Math.abs(num(it.base_qty)), it.base_unit_id, it.original_purchase_rate, -Math.abs(num(it.supplier_credit_value)), it.inventory_unit_cost,
           -Math.abs(value), it.reason, `Controlled reversal of purchase return item #${it.id} via exception ${exception.exception_no}`]
        );
        await conn.execute(
          `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
           VALUES (?, ?, ?, 'PURCHASE_RETURN', 'CONTROLLED_EXCEPTION', ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
          [original.warehouse_location_id, it.raw_material_id, correctionDate, exception.id, it.id, num(it.base_qty), it.base_unit_id, it.inventory_unit_cost, value, it.batch_no, it.expiry_date, executedBy]
        );
      }
      const totalCredit = items.reduce((s, it) => s + num(it.supplier_credit_value), 0);
      await conn.execute(
        `INSERT INTO supplier_credits (supplier_id, purchase_return_id, credit_note_no, credit_note_date, credit_amount, status, remarks)
         VALUES (?, ?, ?, ?, ?, 'Pending', ?)`,
        [original.supplier_id, reversalId, `REV-${exception.exception_no}`, correctionDate, -Math.abs(totalCredit), `Controlled reversal of purchase return #${original.id} via exception ${exception.exception_no}`]
      );
      reversalRefId = reversalId;
      reversalPayload = { ...reversalPayload, reversal_return_id: reversalId, original_return_id: original.id, reversal_amount: -Math.abs(totalCredit), reversal_qty: -Math.abs(num(original.total_return_qty)) };
      await claimSourceForReversal(conn, 'purchase_returns', 'reversal_of_return_id', reversalId, exception.id, original.id);
    } else if (exception.source_module === 'outlet_consumptions') {
      const original = source.row;
      reversalRefType = 'stock_ledger';
      const ledgers = source.ledger || [];
      for (const ledger of ledgers) {
        const [res] = await conn.execute(
          `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
           VALUES (?, ?, ?, 'OUTLET_CONSUMPTION', 'CONTROLLED_EXCEPTION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ledger.location_id, ledger.raw_material_id, correctionDate, exception.id, ledger.id, num(ledger.qty_out), num(ledger.qty_in), ledger.unit_id, ledger.unit_cost, num(ledger.value_out), num(ledger.value_in), ledger.batch_no, ledger.expiry_date, executedBy]
        );
        reversalRefId = res.insertId;
      }
      reversalPayload = { ...reversalPayload, reversal_ledger_rows: ledgers.length, original_consumption_id: original.id, reversal_amount: num(original.total_value), reversal_qty: num(original.total_qty) };
      const [claim] = await conn.execute('UPDATE outlet_consumptions SET reversal_exception_id = ? WHERE id = ? AND reversal_exception_id IS NULL', [exception.id, original.id]);
      if (claim.affectedRows === 0) throw badRequest('Source record is already linked to a reversal');
    } else {
      throw new Error('This exception source requires manual resolution');
    }

    await insertReversalException(conn, exception, correctionDate, reversalAmount, reversalQty, reversalRefType, reversalRefId, reversalPayload);
    await conn.commit();
    return getControlledExceptionById(exception.id);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};
