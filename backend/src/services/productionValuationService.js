import { query } from '../config/database.js';

// Phase 6A7 - Production valuation diagnostics. READ-ONLY.
//
// Surfaces the deterministic physical cost trail that postProductionBatch()
// already writes:
//   PRODUCTION_ISSUE   (raw materials out, value_out = qty x WAC at post time)
//   PRODUCTION_WASTAGE (wastage out via Posted production_wastage docs)
//   PRODUCTION_RECEIPT (finished goods in, value_in = total issue cost,
//                       unit_cost = issue cost / accepted output base qty)
//   TRANSFER_OUT/IN    (internal dispatch/receipt at the same unit_cost)
//
// Nothing here recalculates historical issue costs from today's WAC, writes
// anything, or creates accounting entries - internal production movements are
// company-level zero P&L and stay that way. Batches are never backfilled:
// pre-6A7 batches show whatever their stored ledger rows contain.

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));
const round4 = (n) => Math.round(n * 10000) / 10000;

export const getProductionValuation = async ({ centralKitchenId, fromDate, toDate }) => {
  if (!centralKitchenId) throw new Error('central_kitchen_id is required');
  const [loc] = await query(
    `SELECT id, location_name, location_type FROM locations WHERE id = ? AND location_type = 'Central Kitchen' AND is_active = 1`,
    [centralKitchenId]
  );
  if (!loc) {
    const err = new Error('Central Kitchen not found');
    err.statusCode = 404;
    throw err;
  }

  const dateFilter = fromDate && toDate ? 'AND sl.transaction_date BETWEEN ? AND ?' : '';
  const dateParams = fromDate && toDate ? [fromDate, toDate] : [];

  // All batches at this kitchen; valuation comes from stored ledger rows, so
  // unposted/Draft batches simply show zero movement values.
  const batches = await query(
    `SELECT pb.id, pb.batch_no, pb.status, pb.is_posted, pb.posted_at, pb.batch_no_output,
            pb.accepted_output_qty, pb.unit_id,
            rm.material_name AS finished_product_name, rm.material_code AS finished_product_code,
            pb.finished_product_id, u.unit_name
     FROM production_batches pb
     LEFT JOIN raw_materials rm ON rm.id = pb.finished_product_id
     LEFT JOIN units u ON u.id = pb.unit_id
     WHERE pb.central_kitchen_id = ?
     ORDER BY pb.created_at DESC`,
    [centralKitchenId]
  );

  const result = [];
  for (const b of batches) {
    const [issue] = await query(
      `SELECT COALESCE(SUM(sl.qty_out),0) AS qty, COALESCE(SUM(sl.value_out),0) AS value, COUNT(*) AS row_count
       FROM stock_ledger sl
       WHERE sl.location_id = ? AND sl.transaction_type = 'PRODUCTION_ISSUE'
         AND sl.reference_type = 'PRODUCTION_BATCH' AND sl.reference_id = ? ${dateFilter}`,
      [centralKitchenId, b.id, ...dateParams]
    );

    // Production wastage posted against this batch via Posted/Locked
    // production_wastage documents (RAW_MATERIAL / FINISHED_GOOD scopes write
    // ledger rows; PROCESS_LOSS intentionally has no ledger movement).
    const [wastage] = await query(
      `SELECT COALESCE(SUM(sl.qty_out),0) AS qty, COALESCE(SUM(sl.value_out),0) AS value, COUNT(*) AS row_count
       FROM stock_ledger sl
       JOIN production_wastage pw ON pw.id = sl.reference_id AND pw.status IN ('Posted','Locked')
       WHERE sl.location_id = ? AND sl.transaction_type = 'PRODUCTION_WASTAGE'
         AND sl.reference_type = 'PRODUCTION_WASTAGE' AND pw.production_batch_id = ? ${dateFilter}`,
      [centralKitchenId, b.id, ...dateParams]
    );

    const [receipt] = await query(
      `SELECT COALESCE(SUM(sl.qty_in),0) AS qty, COALESCE(SUM(sl.value_in),0) AS value,
              MAX(sl.unit_cost) AS unit_cost, COUNT(*) AS row_count
       FROM stock_ledger sl
       WHERE sl.location_id = ? AND sl.transaction_type = 'PRODUCTION_RECEIPT'
         AND sl.reference_type = 'PRODUCTION_BATCH' AND sl.reference_id = ? ${dateFilter}`,
      [centralKitchenId, b.id, ...dateParams]
    );

    // Dispatch/receipt of this batch's finished output is only attributable
    // where the batch carried a batch_no_output and the transfer ledger rows
    // recorded it - otherwise honestly reported as not attributable rather
    // than allocated by guesswork.
    let dispatched = { qty: 0, value: 0, attributable: false };
    let received = { qty: 0, value: 0, attributable: false };
    if (b.batch_no_output && b.finished_product_id) {
      const [d] = await query(
        `SELECT COALESCE(SUM(sl.qty_out),0) AS qty, COALESCE(SUM(sl.value_out),0) AS value
         FROM stock_ledger sl
         WHERE sl.location_id = ? AND sl.raw_material_id = ? AND sl.transaction_type = 'TRANSFER_OUT'
           AND sl.batch_no = ? ${dateFilter}`,
        [centralKitchenId, b.finished_product_id, b.batch_no_output, ...dateParams]
      );
      const [r] = await query(
        `SELECT COALESCE(SUM(sl.qty_in),0) AS qty, COALESCE(SUM(sl.value_in),0) AS value
         FROM stock_ledger sl
         WHERE sl.raw_material_id = ? AND sl.transaction_type = 'TRANSFER_IN' AND sl.batch_no = ? ${dateFilter}`,
        [b.finished_product_id, b.batch_no_output, ...dateParams]
      );
      dispatched = { qty: num(d.qty), value: num(d.value), attributable: true };
      received = { qty: num(r.qty), value: num(r.value), attributable: true };
    }

    const issueValue = num(issue.value);
    const receiptValue = num(receipt.value);
    const receiptUnitCost = num(receipt.unit_cost);
    const hasIssue = num(issue.row_count) > 0;
    const hasReceipt = num(receipt.row_count) > 0;

    // COMPLETE: issue value exists AND a valued receipt exists AND (if the
    // batch posted) the receipt unit cost is positive.
    // PARTIAL: some physical valuation rows exist but not all.
    // UNAVAILABLE: no ledger valuation at all (Draft/unposted batches land
    // here - they are not defects).
    const valuationState = !hasIssue && !hasReceipt
      ? 'UNAVAILABLE'
      : hasIssue && hasReceipt && issueValue > 0 && receiptValue > 0 && receiptUnitCost > 0
        ? 'COMPLETE'
        : 'PARTIAL';

    result.push({
      batch_id: b.id,
      batch_no: b.batch_no,
      status: b.status,
      is_posted: Boolean(b.is_posted),
      posted_at: b.posted_at,
      finished_product: { id: b.finished_product_id, name: b.finished_product_name, code: b.finished_product_code },
      accepted_output_qty: num(b.accepted_output_qty),
      unit: b.unit_name,
      raw_issue: { qty: num(issue.qty), value: round4(issueValue), rows: num(issue.row_count) },
      production_wastage: { qty: num(wastage.qty), value: round4(num(wastage.value)), rows: num(wastage.row_count) },
      finished_unit_cost: hasReceipt ? round4(receiptUnitCost) : null,
      receipt: { qty: num(receipt.qty), value: round4(receiptValue), rows: num(receipt.row_count) },
      dispatch: { qty: round4(dispatched.qty), value: round4(dispatched.value), attributable: dispatched.attributable },
      received: { qty: round4(received.qty), value: round4(received.value), attributable: received.attributable },
      valuation_state: valuationState,
    });
  }

  return {
    read_only: true,
    disclaimer: 'PRODUCTION VALUATION - deterministic physical cost flow only. No labor/overhead absorption, no accounting entries, internal movements are company-level zero P&L.',
    params: { central_kitchen_id: Number(centralKitchenId), from_date: fromDate || null, to_date: toDate || null },
    location: loc,
    batches: result,
    totals: {
      batches: result.length,
      posted: result.filter((b) => b.is_posted).length,
      issue_value: round4(result.reduce((s, b) => s + b.raw_issue.value, 0)),
      wastage_value: round4(result.reduce((s, b) => s + b.production_wastage.value, 0)),
      receipt_value: round4(result.reduce((s, b) => s + b.receipt.value, 0)),
    },
  };
};
