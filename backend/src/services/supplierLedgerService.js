import { query } from '../config/database.js';

const num = (value) => Number(value || 0);

/**
 * Cumulative sum of Completed material purchases for an outlet+supplier,
 * from all time up to and including asOfDate. Deliberately NOT windowed
 * against the previous payment's date: date-only granularity cannot
 * disambiguate same-day ordering between a payment and a purchase, so any
 * "since previous payment" window either double-counts same-day purchases
 * (inclusive boundary) or silently drops same-day purchases uploaded after
 * the previous payment (exclusive boundary). A pure cumulative-to-date sum
 * avoids the boundary entirely and is always safe to recompute.
 */
const getCumulativePurchases = async (outletId, supplierId, asOfDate) => {
  const rows = await query(
    `SELECT COALESCE(SUM(mpi.total_amount), 0) AS total
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
     WHERE mpi.outlet_id = ?
       AND mpi.supplier_id = ?
       AND mpu.status = 'Completed'
       AND mpi.date <= ?`,
    [outletId, supplierId, asOfDate]
  );
  return num(rows[0]?.total);
};

/**
 * Cumulative sum of all supplier payments for an outlet+supplier, from all
 * time up to and including asOfDate, excluding the row currently being
 * edited (if any). This is always recomputed from source rows rather than
 * chained off a previous row's stored balance_pending, so it cannot go
 * stale when an older payment is edited.
 */
const getCumulativePayments = async (outletId, supplierId, asOfDate, excludeId = null) => {
  let sql = `SELECT COALESCE(SUM(paid_amount), 0) AS total
             FROM supplier_payments
             WHERE outlet_id = ? AND supplier_id = ? AND date <= ?`;
  const params = [outletId, supplierId, asOfDate];

  if (excludeId) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }

  const rows = await query(sql, params);
  return num(rows[0]?.total);
};

/**
 * Cumulative sum of posted purchase return supplier credits for a supplier,
 * from all warehouse locations, up to and including asOfDate.
 * Credits become effective once the purchase return is Posted.
 * Changing the credit note status (Pending/Received/Reconciled) does NOT
 * affect the outstanding reduction; it is a receivable tracking status only.
 */
const getCumulativeCredits = async (supplierId, asOfDate) => {
  const rows = await query(
    `SELECT COALESCE(SUM(sc.credit_amount), 0) AS total
     FROM supplier_credits sc
     INNER JOIN purchase_returns pr ON pr.id = sc.purchase_return_id
     WHERE sc.supplier_id = ?
       AND pr.status IN ('Posted', 'Locked')
       AND COALESCE(sc.credit_note_date, sc.created_at) <= ?`,
    [supplierId, asOfDate]
  );
  return num(rows[0]?.total);
};

/**
 * Canonical supplier ledger summary, computed as a pure cumulative
 * source-of-truth (not an incremental chain off previous rows):
 *
 *   Current Outstanding = Opening Baseline
 *                        + SUM(Completed material purchases up to date)
 *                        - SUM(supplier payments up to date, excluding self)
 *                        - SUM(posted purchase return supplier credits up to date)
 *
 * Opening Baseline is 0 unless a legacy pre-system anchor is required (see
 * supplierLedgerService audit notes) — no such anchor currently exists in
 * this dataset, so it is fixed at 0. "Purchases" and "Previous Payments"
 * below are cumulative-to-date figures, not deltas since the last payment,
 * which is what makes this formula immune to same-date ordering issues and
 * to stale stored balance_pending snapshots on earlier rows.
 */
export const getSupplierLedgerSummary = async ({
  outletId,
  supplierId,
  date,
  excludeId = null,
}) => {
  if (!outletId || !supplierId || !date) {
    throw new Error('outlet_id, supplier_id and date are required');
  }

  const openingOutstanding = 0;

  const purchaseValue = await getCumulativePurchases(outletId, supplierId, date);
  const previousPaid = await getCumulativePayments(outletId, supplierId, date, excludeId);
  const creditValue = await getCumulativeCredits(supplierId, date);

  const currentOutstanding = openingOutstanding + purchaseValue - previousPaid - creditValue;

  return {
    opening_outstanding: openingOutstanding,
    purchase_value: purchaseValue,
    previous_paid_amount: previousPaid,
    purchase_return_credits: creditValue,
    current_outstanding: currentOutstanding,
  };
};

/**
 * Compute the legacy snapshot columns to store for a payment transaction.
 *
 * supplier_payments.balance_pending is a MySQL GENERATED column:
 *   balance_pending = opening_pending + purchase_value - paid_amount
 *
 * To keep that generated column mathematically correct under the canonical
 * cumulative ledger, we must NOT store the raw cumulative purchase total in
 * purchase_value (that would ignore previous payments entirely and produce
 * the wrong balance). Instead we store:
 *   opening_pending = 0
 *   purchase_value  = current_outstanding BEFORE this payment
 *                     (i.e. summary.current_outstanding, which already nets
 *                     all cumulative purchases minus all previous payments)
 * so that balance_pending = current_outstanding - paid_amount, which is the
 * correct outstanding AFTER this payment.
 */
export const computePaymentRowValues = async ({
  outletId,
  supplierId,
  date,
  excludeId = null,
}) => {
  const summary = await getSupplierLedgerSummary({
    outletId,
    supplierId,
    date,
    excludeId,
  });

  return {
    opening_pending: 0,
    purchase_value: summary.current_outstanding,
    current_outstanding: summary.current_outstanding,
  };
};

/**
 * Calculate current outstanding for a supplier/outlet as of a given date.
 * Useful for reports and the supplier pending report.
 */
export const getCurrentOutstanding = async (outletId, supplierId, asOfDate = null) => {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const summary = await getSupplierLedgerSummary({ outletId, supplierId, date });
  return summary.current_outstanding;
};
