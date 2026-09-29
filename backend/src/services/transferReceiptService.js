import { query } from '../config/database.js';

// Per-receipt-event history for stock transfers (warehouse, outlet-to-outlet
// and bakehouse receiving all share stock_transfers / stock_transfer_items).
//
// This module is traceability + idempotency only. It never changes stock
// accounting: callers insert these rows inside their existing receipt
// transaction, after the transfer lock and quantity validation.
//
// discrepancy_reason is an application-controlled string (no DB ENUM):
export const DISCREPANCY_REASONS = new Set([
  'SHORT_SUPPLY',
  'DAMAGED_IN_TRANSIT',
  'NOT_RECEIVED',
  'WRONG_ITEM',
  'QUALITY_ISSUE',
  'EXPIRED',
  'REJECTED',
  'OTHER',
]);

const num = (v) => Number(v) || 0;

// Validates one submitted receipt item's reason rules: any damaged/short
// quantity requires a recognised discrepancy_reason, and OTHER requires a
// free-text remark. Clean received-only items need neither.
export const validateReceiptItemReasons = (items = []) => {
  for (const it of items) {
    const damaged = num(it.damaged_qty);
    const short = num(it.short_qty);
    if (damaged > 0 || short > 0) {
      const reason = String(it.discrepancy_reason || '').trim().toUpperCase();
      if (!DISCREPANCY_REASONS.has(reason)) {
        throw new Error('A discrepancy reason is required when recording damaged or short quantities');
      }
      if (reason === 'OTHER' && !String(it.remarks || '').trim()) {
        throw new Error('Remarks are required when the discrepancy reason is Other');
      }
    }
  }
};

export const receiptDiscrepancyFlag = (items = []) =>
  items.some((it) => num(it.damaged_qty) > 0 || num(it.short_qty) > 0) ? 1 : 0;

// Inserts the receipt header inside the caller's transaction. The
// UNIQUE(transfer_id, receipt_key) constraint is the authoritative
// idempotency guard: a retried submission hits ER_DUP_ENTRY here BEFORE any
// quantity is applied, so stock can never be credited twice for one attempt.
// Returns the new receipt id, or null on duplicate receipt_key.
export const insertReceiptHeader = async (connection, transferId, receiptKey, userId, receiptRemarks, discrepancyFlag) => {
  try {
    const [res] = await connection.execute(
      `INSERT INTO stock_transfer_receipts (transfer_id, receipt_key, received_by, received_at, receipt_remarks, discrepancy_flag)
       VALUES (?, ?, ?, NOW(), ?, ?)`,
      [transferId, receiptKey, userId, receiptRemarks || null, discrepancyFlag]
    );
    return res.insertId;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) return null;
    throw error;
  }
};

// One history row per submitted item: THIS event's increments plus the
// pending balance left on the line immediately after the event.
export const insertReceiptItem = async (connection, receiptId, transferItemId, event, pendingAfter) => {
  const reason = String(event.discrepancy_reason || '').trim().toUpperCase();
  await connection.execute(
    `INSERT INTO stock_transfer_receipt_items
     (receipt_id, transfer_item_id, received_qty, damaged_qty, short_qty, pending_after_qty, discrepancy_reason, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      receiptId, transferItemId,
      num(event.received_qty), num(event.damaged_qty), num(event.short_qty), num(pendingAfter),
      DISCREPANCY_REASONS.has(reason) ? reason : null,
      event.remarks || null,
    ]
  );
};

// Read side for the manager-facing Receipt History sections. Returns events
// newest-first with their item rows; sender/receiver/location ids stay on the
// parent transfer, not repeated here.
export const getTransferReceiptHistory = async (transferId) => {
  const headers = await query(
    `SELECT r.id, r.receipt_key, r.received_by, u.full_name AS received_by_name,
            r.received_at, r.receipt_remarks, r.discrepancy_flag
     FROM stock_transfer_receipts r
     LEFT JOIN users u ON u.id = r.received_by
     WHERE r.transfer_id = ?
     ORDER BY r.received_at DESC, r.id DESC`,
    [transferId]
  );
  if (!headers.length) return [];

  const items = await query(
    `SELECT ri.receipt_id, ri.transfer_item_id, ri.received_qty, ri.damaged_qty,
            ri.short_qty, ri.pending_after_qty, ri.discrepancy_reason, ri.remarks,
            ti.raw_material_id, rm.material_name, rm.material_code, un.unit_name
     FROM stock_transfer_receipt_items ri
     JOIN stock_transfer_receipts r ON r.id = ri.receipt_id
     LEFT JOIN stock_transfer_items ti ON ti.id = ri.transfer_item_id
     LEFT JOIN raw_materials rm ON rm.id = ti.raw_material_id
     LEFT JOIN units un ON un.id = ti.unit_id
     WHERE r.transfer_id = ?
     ORDER BY ri.receipt_id DESC, ri.id`,
    [transferId]
  );

  const byReceipt = new Map();
  for (const row of items) {
    if (!byReceipt.has(row.receipt_id)) byReceipt.set(row.receipt_id, []);
    byReceipt.get(row.receipt_id).push(row);
  }
  return headers.map((h) => ({ ...h, items: byReceipt.get(h.id) || [] }));
};
