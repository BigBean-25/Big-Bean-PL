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
  const addDays = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };

  // Liability timeline: opening payable + purchases, ordered by liability date
  // (opening wins same-date ties deterministically). Stored purchase.due_date
  // always wins; NULL falls back to purchase_date + current credit_days only
  // for pre-snapshot rows the migration could not reach.
  const liabilities = [
    ...openingRows.map((o) => ({
      key: `ob-${o.id}`,
      date: o.effective_date,
      due: new Date(o.due_date),
      amount: num(o.opening_amount),
    })),
    ...purchases.map((p) => ({
      key: `pur-${p.id}`,
      date: p.purchase_date,
      due: p.due_date ? new Date(p.due_date) : addDays(p.purchase_date, creditDays),
      amount: num(p.amount),
    })),
  ].sort((a, b) => {
    const da = String(a.date).slice(0, 10);
    const db = String(b.date).slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return a.key.localeCompare(b.key); // 'ob-' < 'pur-' => opening first on ties
  });

  let remainingPayments = paymentsTotal;
  let overdueAmount = 0;
  let notDueAmount = 0;
  const cutoff = new Date(date);

  for (const liab of liabilities) {
    const covered = Math.min(remainingPayments, liab.amount);
    remainingPayments -= covered;
    const unpaid = liab.amount - covered;
    if (unpaid <= 0) continue;
    if (liab.due < cutoff) overdueAmount += unpaid;
    else notDueAmount += unpaid;
  }

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
