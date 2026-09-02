import { query } from '../config/database.js';

const num = (value) => Number(value || 0);

/**
 * Cumulative sum of vendor purchases for an outlet+vendor, from all time up
 * to and including asOfDate. Mirrors supplierLedgerService's approach: a
 * pure cumulative-to-date sum, not a delta since the last payment, so it's
 * immune to same-date ordering issues and never depends on a stale stored
 * balance from an earlier row.
 */
const getCumulativePurchases = async (outletId, vendorId, asOfDate) => {
  const rows = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM outlet_vendor_purchases
     WHERE outlet_id = ? AND vendor_id = ? AND purchase_date <= ?`,
    [outletId, vendorId, asOfDate]
  );
  return num(rows[0]?.total);
};

const getCumulativePayments = async (outletId, vendorId, asOfDate, excludeId = null) => {
  let sql = `SELECT COALESCE(SUM(paid_amount), 0) AS total
             FROM outlet_vendor_payments
             WHERE outlet_id = ? AND vendor_id = ? AND date <= ?`;
  const params = [outletId, vendorId, asOfDate];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const rows = await query(sql, params);
  return num(rows[0]?.total);
};

/**
 * Canonical vendor ledger summary:
 *   Current Outstanding = SUM(purchases up to date) - SUM(payments up to date, excluding self)
 */
export const getVendorLedgerSummary = async ({ outletId, vendorId, date, excludeId = null }) => {
  if (!outletId || !vendorId || !date) {
    throw new Error('outlet_id, vendor_id and date are required');
  }
  const purchaseValue = await getCumulativePurchases(outletId, vendorId, date);
  const previousPaid = await getCumulativePayments(outletId, vendorId, date, excludeId);
  const currentOutstanding = purchaseValue - previousPaid;
  return {
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
  const [vendorRows, purchases, paymentsTotal] = await Promise.all([
    query('SELECT credit_days FROM outlet_vendors WHERE id = ?', [vendorId]),
    query(
      `SELECT id, purchase_date, amount FROM outlet_vendor_purchases
       WHERE outlet_id = ? AND vendor_id = ? AND purchase_date <= ?
       ORDER BY purchase_date ASC, id ASC`,
      [outletId, vendorId, date]
    ),
    getCumulativePayments(outletId, vendorId, date),
  ]);

  const creditDays = num(vendorRows[0]?.credit_days);
  let remainingPayments = paymentsTotal;
  let overdueAmount = 0;
  let notDueAmount = 0;

  for (const p of purchases) {
    const amount = num(p.amount);
    const covered = Math.min(remainingPayments, amount);
    remainingPayments -= covered;
    const unpaid = amount - covered;
    if (unpaid <= 0) continue;

    const dueDate = new Date(p.purchase_date);
    dueDate.setDate(dueDate.getDate() + creditDays);
    const isOverdue = dueDate < new Date(date);
    if (isOverdue) overdueAmount += unpaid;
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
export const getAllVendorOutstanding = async (asOfDate = null) => {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const pairs = await query(
    `SELECT DISTINCT outlet_id, vendor_id FROM outlet_vendor_purchases WHERE purchase_date <= ?
     UNION
     SELECT DISTINCT outlet_id, vendor_id FROM outlet_vendor_payments WHERE date <= ?`,
    [date, date]
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
