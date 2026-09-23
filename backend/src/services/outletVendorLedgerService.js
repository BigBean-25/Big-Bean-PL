import { query } from '../config/database.js';

const num = (value) => Number(value || 0);

/**
 * Cumulative sum of vendor purchases for an outlet+vendor, from all time up
 * to and including asOfDate. Mirrors supplierLedgerService's approach: a
 * pure cumulative-to-date sum, not a delta since the last payment, so it's
 * immune to same-date ordering issues and never depends on a stale stored
 * balance from an earlier row.
 *
 * paid_by = 'Outlet' purchases are excluded: the outlet already settled
 * those in cash at the time of purchase, so nothing is owed to the vendor
 * for them. Counting them here would create a payable that no
 * outlet_vendor_payments row will ever offset (nobody pays what's already
 * paid), permanently inflating outstanding/ageing for every such purchase.
 */
const getCumulativePurchases = async (outletId, vendorId, asOfDate) => {
  const rows = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM outlet_vendor_purchases
     WHERE outlet_id = ? AND vendor_id = ? AND purchase_date <= ? AND paid_by != 'Outlet'`,
    [outletId, vendorId, asOfDate]
  );
  return num(rows[0]?.total);
};

// Phase 7D2A1: only Verified payments are financially effective - the same
// rule supplier_payments has always used. Draft/Submitted/Rejected rows are
// in-flight workflow states and must never reduce outstanding or consume
// purchases in FIFO ageing. Pre-workflow rows are backfilled to Verified by
// the 7D2A1 migration, so historical balances are numerically unchanged.
const getCumulativePayments = async (outletId, vendorId, asOfDate, excludeId = null) => {
  let sql = `SELECT COALESCE(SUM(paid_amount), 0) AS total
             FROM outlet_vendor_payments
             WHERE outlet_id = ? AND vendor_id = ? AND date <= ? AND status = 'Verified'`;
  const params = [outletId, vendorId, asOfDate];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const rows = await query(sql, params);
  return num(rows[0]?.total);
};

/**
 * Phase 7D3A1: eligible opening payable for an outlet+vendor pair. One row per
 * pair (UNIQUE), contributes only when effective_date <= cutoff - a timeless
 * scalar would corrupt historical as-of balances. Accepts an optional
 * transaction connection so verify-time checks read under the same lock.
 */
export const getOpeningBalance = async (outletId, vendorId, asOfDate, conn = null) => {
  const sql = `SELECT COALESCE(SUM(opening_amount), 0) AS total
               FROM outlet_vendor_opening_balances
               WHERE outlet_id = ? AND vendor_id = ? AND effective_date <= ?`;
  const params = [outletId, vendorId, asOfDate];
  const rows = conn ? (await conn.execute(sql, params))[0] : await query(sql, params);
  return num(rows[0]?.total);
};

/**
 * Canonical vendor ledger summary:
 *   Current Outstanding = opening(effective<=date) + SUM(purchases up to date)
 *                         - SUM(Verified payments up to date, excluding self)
 * Verified includes negative reversal rows - they must NOT be excluded.
 */
export const getVendorLedgerSummary = async ({ outletId, vendorId, date, excludeId = null }) => {
  if (!outletId || !vendorId || !date) {
    throw new Error('outlet_id, vendor_id and date are required');
  }
  const openingBalance = await getOpeningBalance(outletId, vendorId, date);
  const purchaseValue = await getCumulativePurchases(outletId, vendorId, date);
  const previousPaid = await getCumulativePayments(outletId, vendorId, date, excludeId);
  const currentOutstanding = openingBalance + purchaseValue - previousPaid;
  return {
    opening_balance: openingBalance,
    purchase_value: purchaseValue,
    previous_paid_amount: previousPaid,
    current_outstanding: currentOutstanding,
  };
};

export const getCurrentOutstanding = async (outletId, vendorId, asOfDate = null) => {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const summary = await getVendorLedgerSummary({ outletId, vendorId, date });
  return summary.current_outstanding;
};

/**
 * 7D4A: canonical FIFO allocator - the single source of truth for applying
 * net Verified signed payments (incl. negative reversal rows) across a pair's
 * liability timeline. Used by BOTH getVendorAgeing and the bulk dashboard
 * summary, so the two paths can never diverge. `liabilities` must already be
 * deterministically ordered; overdue boundary is strict `due < cutoff`.
 */
export const allocateVendorLiabilities = (liabilities, paymentsTotal, cutoff) => {
  let remainingPayments = num(paymentsTotal);
  let overdueAmount = 0;
  let notDueAmount = 0;
  const cutoffDate = new Date(cutoff);
  for (const liab of liabilities) {
    const covered = Math.min(remainingPayments, liab.amount);
    remainingPayments -= covered;
    const unpaid = liab.amount - covered;
    if (unpaid <= 0) continue;
    if (liab.due < cutoffDate) overdueAmount += unpaid;
    else notDueAmount += unpaid;
  }
  return { overdueAmount, notDueAmount };
};

// Deterministic liability ordering shared by ageing + bulk summary:
// liability date ASC; opening ('ob-') precedes purchase ('pur-') on ties.
const liabilitySort = (a, b) => {
  const da = String(a.date).slice(0, 10);
  const db = String(b.date).slice(0, 10);
  if (da !== db) return da.localeCompare(db);
  return a.key.localeCompare(b.key);
};

const addDays = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };

const purchaseLiability = (p, creditDays) => ({
  key: `pur-${p.id}`,
  date: p.purchase_date,
  due: p.due_date ? new Date(p.due_date) : addDays(p.purchase_date, creditDays),
  amount: num(p.amount),
});

const openingLiability = (o) => ({
  key: `ob-${o.id}`,
  date: o.effective_date,
  due: new Date(o.due_date),
  amount: num(o.opening_amount),
});

/**
 * FIFO ageing: payments are applied against the oldest purchases first
 * (there's no per-invoice payment allocation in this simple ledger, so this
 * is the standard AP-ageing assumption). Each purchase's due date is
 * purchase_date + the vendor's credit_days at the time credit_days is read
 * (i.e. today's setting - a vendor's terms changing doesn't retroactively
 * alter old purchases' due dates in this simplified model).
 * Returns { overdue_amount, not_due_amount, current_outstanding } as of
 * asOfDate - "overdue" means past its due date and not yet fully covered by
 * cumulative payments applied oldest-first.
 */
export const getVendorAgeing = async ({ outletId, vendorId, date }) => {
  const [vendorRows, openingRows, purchases, paymentsTotal] = await Promise.all([
    query('SELECT credit_days FROM outlet_vendors WHERE id = ?', [vendorId]),
    query(
      `SELECT id, effective_date, due_date, opening_amount FROM outlet_vendor_opening_balances
       WHERE outlet_id = ? AND vendor_id = ? AND effective_date <= ?`,
      [outletId, vendorId, date]
    ),
    query(
      `SELECT id, purchase_date, due_date, amount FROM outlet_vendor_purchases
       WHERE outlet_id = ? AND vendor_id = ? AND purchase_date <= ? AND paid_by != 'Outlet'
       ORDER BY purchase_date ASC, id ASC`,
      [outletId, vendorId, date]
    ),
    getCumulativePayments(outletId, vendorId, date),
  ]);

  const creditDays = num(vendorRows[0]?.credit_days);

  // Liability timeline: opening payable + purchases, ordered by liability date
  // (opening wins same-date ties deterministically). Stored purchase.due_date
  // always wins; NULL falls back to purchase_date + current credit_days only
  // for pre-snapshot rows the migration could not reach.
  const liabilities = [
    ...openingRows.map(openingLiability),
    ...purchases.map((p) => purchaseLiability(p, creditDays)),
  ].sort(liabilitySort);

  const { overdueAmount, notDueAmount } = allocateVendorLiabilities(liabilities, paymentsTotal, date);

  return {
    overdue_amount: overdueAmount,
    not_due_amount: notDueAmount,
    current_outstanding: overdueAmount + notDueAmount,
    credit_days: creditDays,
  };
};

/**
 * Outstanding balance per vendor across all outlets that have transacted
 * with them - used for a vendor-pending overview list.
 */
export const getAllVendorOutstanding = async (asOfDate = null, allowedOutletIds = null) => {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  // allowedOutletIds confines an outlet-scoped caller to their own outlets'
  // payables. Outlet Manager/Admin hold outlet_vendors.can_view, and this
  // report previously listed every outlet/vendor pair company-wide, so one
  // outlet could read every other outlet's vendor outstanding. null means the
  // caller has genuine all-outlet access; an empty array means no access.
  if (Array.isArray(allowedOutletIds) && allowedOutletIds.length === 0) return [];
  const outletFilter = Array.isArray(allowedOutletIds)
    ? ` AND outlet_id IN (${allowedOutletIds.map(() => '?').join(',')})`
    : '';
  // Pair discovery must also see opening balances (7D3A1): an opening-only
  // outlet+vendor pair has no purchase/payment rows but still owes money.
  // effective_date <= cutoff keeps future-dated openings out of the report;
  // UNION deduplicates pairs appearing in multiple sources. Amounts are never
  // summed here - getVendorLedgerSummary remains the only financial formula.
  const pairs = await query(
    `SELECT DISTINCT outlet_id, vendor_id FROM outlet_vendor_purchases WHERE purchase_date <= ?${outletFilter}
     UNION
     SELECT DISTINCT outlet_id, vendor_id FROM outlet_vendor_payments WHERE date <= ?${outletFilter}
     UNION
     SELECT DISTINCT outlet_id, vendor_id FROM outlet_vendor_opening_balances WHERE effective_date <= ?${outletFilter}`,
    Array.isArray(allowedOutletIds)
      ? [date, ...allowedOutletIds, date, ...allowedOutletIds, date, ...allowedOutletIds]
      : [date, date, date]
  );
  const results = [];
  for (const p of pairs) {
    const summary = await getVendorLedgerSummary({ outletId: p.outlet_id, vendorId: p.vendor_id, date });
    if (Math.abs(summary.current_outstanding) > 0.005) {
      results.push({ outlet_id: p.outlet_id, vendor_id: p.vendor_id, ...summary });
    }
  }
  return results;
};

/**
 * 7D4A: bulk vendor-payables summary for dashboards. Same canonical semantics
 * as getVendorLedgerSummary/getVendorAgeing (opening + qualifying purchases -
 * Verified signed payments; FIFO ageing via the shared allocator), but with a
 * FIXED query count: 5 set-based queries regardless of outlet+vendor pair
 * count - no per-pair ledger/ageing calls (the N+1 this replaces).
 *
 * allowedOutletIds: null = all-outlet caller; [] = no access; list = scoped.
 * includePendingApprovals gates the Submitted-count query (caller-side
 * can_verify decision) so checker-workload data is never computed - let alone
 * returned - for users without it.
 */
export const getVendorPayablesSummary = async ({ asOfDate, allowedOutletIds = null, includePendingApprovals = false }) => {
  const cutoff = asOfDate || new Date().toISOString().slice(0, 10);
  const scoped = Array.isArray(allowedOutletIds);
  if (scoped && allowedOutletIds.length === 0) {
    return { as_of_date: cutoff, total_outstanding: 0, overdue_amount: 0, not_due_amount: 0, vendors_with_outstanding: 0, pending_approvals: includePendingApprovals ? 0 : null, top_vendors: [] };
  }
  const outletFilter = scoped
    ? ` AND outlet_id IN (${allowedOutletIds.map(() => '?').join(',')})`
    : '';
  const outletParams = scoped ? allowedOutletIds : [];

  const [openings, purchases, payments, vendors, outlets, pendingRows] = await Promise.all([
    query(
      `SELECT id, outlet_id, vendor_id, effective_date, due_date, opening_amount
       FROM outlet_vendor_opening_balances WHERE effective_date <= ?${outletFilter}`,
      [cutoff, ...outletParams]
    ),
    query(
      `SELECT p.id, p.outlet_id, p.vendor_id, p.purchase_date, p.due_date, p.amount, v.credit_days
       FROM outlet_vendor_purchases p
       LEFT JOIN outlet_vendors v ON v.id = p.vendor_id
       WHERE p.purchase_date <= ? AND p.paid_by != 'Outlet'${outletFilter.replace('outlet_id', 'p.outlet_id')}`,
      [cutoff, ...outletParams]
    ),
    query(
      `SELECT outlet_id, vendor_id, SUM(paid_amount) AS total
       FROM outlet_vendor_payments
       WHERE date <= ? AND status = 'Verified'${outletFilter}
       GROUP BY outlet_id, vendor_id`,
      [cutoff, ...outletParams]
    ),
    query('SELECT id, vendor_name FROM outlet_vendors'),
    query('SELECT id, outlet_name FROM outlets'),
    includePendingApprovals
      ? query(
          `SELECT COUNT(*) AS total FROM outlet_vendor_payments WHERE status = 'Submitted'${outletFilter}`,
          outletParams
        )
      : Promise.resolve(null),
  ]);

  const vendorNames = new Map(vendors.map((v) => [Number(v.id), v.vendor_name]));
  const outletNames = new Map(outlets.map((o) => [Number(o.id), o.outlet_name]));

  // Buckets keyed by outlet+vendor pair; a pair exists if ANY financial
  // source references it (payments-only pairs keep their negative balance).
  const buckets = new Map();
  const bucket = (outletId, vendorId) => {
    const k = `${outletId}:${vendorId}`;
    if (!buckets.has(k)) buckets.set(k, { outlet_id: Number(outletId), vendor_id: Number(vendorId), liabilities: [], payments: 0, liabilityTotal: 0 });
    return buckets.get(k);
  };

  for (const o of openings) {
    const liab = openingLiability(o);
    const b = bucket(o.outlet_id, o.vendor_id);
    b.liabilities.push(liab);
    b.liabilityTotal += liab.amount;
  }
  for (const p of purchases) {
    const liab = purchaseLiability(p, num(p.credit_days));
    const b = bucket(p.outlet_id, p.vendor_id);
    b.liabilities.push(liab);
    b.liabilityTotal += liab.amount;
  }
  for (const pay of payments) {
    bucket(pay.outlet_id, pay.vendor_id).payments = num(pay.total);
  }

  let totalOutstanding = 0;
  let overdueAmount = 0;
  let notDueAmount = 0;
  let vendorsWithOutstanding = 0;
  const top = [];

  for (const b of buckets.values()) {
    b.liabilities.sort(liabilitySort);
    const { overdueAmount: od, notDueAmount: nd } = allocateVendorLiabilities(b.liabilities, b.payments, cutoff);
    const pairOutstanding = b.liabilityTotal - b.payments;
    totalOutstanding += pairOutstanding;
    overdueAmount += od;
    notDueAmount += nd;
    if (pairOutstanding > 0.005) {
      vendorsWithOutstanding += 1;
      top.push({
        outlet_id: b.outlet_id,
        outlet_name: outletNames.get(b.outlet_id) || null,
        vendor_id: b.vendor_id,
        vendor_name: vendorNames.get(b.vendor_id) || null,
        outstanding: pairOutstanding,
        overdue_amount: od,
        not_due_amount: nd,
      });
    }
  }

  top.sort((a, b) => (b.outstanding - a.outstanding) || (a.outlet_id - b.outlet_id) || (a.vendor_id - b.vendor_id));

  return {
    as_of_date: cutoff,
    total_outstanding: totalOutstanding,
    overdue_amount: overdueAmount,
    not_due_amount: notDueAmount,
    vendors_with_outstanding: vendorsWithOutstanding,
    pending_approvals: includePendingApprovals ? num(pendingRows[0]?.total) : null,
    top_vendors: top.slice(0, 5),
  };
};
