-- ============================================================================
-- Per-receipt-event history for stock transfers
-- (Warehouse -> Outlet, Outlet -> Outlet, Bakehouse -> Outlet).
--
-- Purpose: traceability + idempotency ONLY.
--
--   * Records each receipt ATTEMPT as an immutable event: who received, when,
--     which quantities were received/damaged/short THIS time, the pending
--     balance after the event, a structured discrepancy reason and remarks.
--   * (transfer_id, receipt_key) is UNIQUE - the client-generated receipt_key
--     makes a retried/double-clicked submission physically unable to apply
--     stock twice.
--   * discrepancy_flag marks any event containing damaged/short quantities so
--     managers can review it later - it adds no approval lifecycle.
--
-- Nothing here changes stock accounting: received/damaged/short stay
-- cumulative on stock_transfer_items, TRANSFER_OUT / TRANSFER_IN /
-- TRANSIT_DAMAGE / TRANSIT_SHORT semantics are untouched, and the existing
-- status rules (received+damaged+short >= dispatched -> Received) are
-- unchanged.
--
-- DEPLOYMENT ORDER - RUN THIS MIGRATION **BEFORE** DEPLOYING/RESTARTING THE
-- BACKEND VERSION THAT WRITES stock_transfer_receipts. The new receive code
-- inserts into these tables inside the receipt transaction; if the backend
-- is deployed first, every receive fails against the missing tables.
--
-- Safe production order:
--   1. Production backup.
--   2. Verify target production schema (run inside the target schema - this
--      file intentionally has no USE statement).
--   3. Run this additive migration.
--   4. Verify both new tables/indexes/FKs (see post-run verification below).
--   5. Deploy backend code.
--   6. Restart Node application.
--   7. Smoke-test receiving.
--   8. Deploy frontend if required.
--   9. Final receiving/history smoke test.
--
-- Safety properties:
--   * No USE statement - run inside the target schema.
--   * CREATE TABLE IF NOT EXISTS - idempotent, safe to re-run.
--   * No DELETE / DROP / TRUNCATE / ALTER - purely additive.
--   * Quantity precision DECIMAL(14,4) matches stock_transfer_items.
--   * No discrepancy columns on stock_transfer_items - reasons belong to the
--     receipt event, not the cumulative line.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_transfer_receipts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_id INT NOT NULL,
  -- Client-generated per receipt attempt (crypto.randomUUID). Retries of the
  -- same attempt reuse the key; the unique key below makes a duplicate insert
  -- impossible, so a repeated POST can never apply stock twice.
  receipt_key VARCHAR(64) NOT NULL,
  received_by INT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Whole-receipt note; per-item notes live on the item rows.
  receipt_remarks TEXT NULL,
  -- 1 when ANY item in this receipt recorded damaged_qty > 0 or
  -- short_qty > 0 - surfaces the event for manager review without adding a
  -- new approval lifecycle.
  discrepancy_flag TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_str_transfer FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_str_received_by FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_str_transfer_receipt (transfer_id, receipt_key),
  INDEX idx_str_transfer (transfer_id),
  INDEX idx_str_received_by (received_by),
  INDEX idx_str_received_at (received_at),
  INDEX idx_str_discrepancy (discrepancy_flag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_transfer_receipt_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  receipt_id BIGINT NOT NULL,
  transfer_item_id INT NOT NULL,
  -- Quantities for THIS receipt event only. The cumulative totals remain on
  -- stock_transfer_items; pending_after_qty snapshots
  -- dispatched - received - damaged - short immediately after this event.
  received_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
  damaged_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
  short_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
  pending_after_qty DECIMAL(14,4) NOT NULL DEFAULT 0,
  -- Application-controlled string (no ENUM - the list can evolve without
  -- migrations): SHORT_SUPPLY, DAMAGED_IN_TRANSIT, NOT_RECEIVED, WRONG_ITEM,
  -- QUALITY_ISSUE, EXPIRED, REJECTED, OTHER. Required by the service when
  -- damaged_qty or short_qty > 0 on this event; 'OTHER' also requires remarks.
  discrepancy_reason VARCHAR(50) NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stri_receipt FOREIGN KEY (receipt_id) REFERENCES stock_transfer_receipts(id) ON DELETE CASCADE,
  CONSTRAINT fk_stri_item FOREIGN KEY (transfer_item_id) REFERENCES stock_transfer_items(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_stri_receipt_item (receipt_id, transfer_item_id),
  INDEX idx_stri_receipt (receipt_id),
  INDEX idx_stri_item (transfer_item_id),
  INDEX idx_stri_reason (discrepancy_reason)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Post-run verification (manual):
--   SHOW TABLES LIKE 'stock_transfer_receipt%';
--   SHOW INDEX FROM stock_transfer_receipts;
--   DESCRIBE stock_transfer_receipt_items;
-- ============================================================================
