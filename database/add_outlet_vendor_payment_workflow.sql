USE `bigbeancafe_db`;

-- Phase 7D2A1: maker-checker workflow foundation for outlet_vendor_payments.
-- Additive only. Every statement is guarded through INFORMATION_SCHEMA so the
-- file is safe to re-run (the canonical runner also tracks it once in
-- schema_migrations). No drops, no renames, no destructive conversion.
--
-- Mirrors add_supplier_payment_workflow.sql (Phase 5D1) exactly:
--   Draft -> Submitted -> Verified
--   Submitted -> Rejected (Rejected stays editable/resubmittable)
-- Only status='Verified' rows are financially effective (see
-- outletVendorLedgerService.getCumulativePayments).

-- ---------------------------------------------------------------------------
-- 1. outlet_vendor_payments: minimal maker-checker lifecycle columns.
--    *_by INT -> users(id) (this table already FKs created_by, so the same
--    ibfk style is used), *_at DATETIME, rejection_reason TEXT.
-- ---------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND COLUMN_NAME = 'status');
SET @s := IF(@c = 0,
  "ALTER TABLE outlet_vendor_payments ADD COLUMN status ENUM('Draft','Submitted','Verified','Rejected') NULL AFTER remarks",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND COLUMN_NAME = 'submitted_by');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN submitted_by INT NULL AFTER status',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND COLUMN_NAME = 'submitted_at');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN submitted_at DATETIME NULL AFTER submitted_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND COLUMN_NAME = 'verified_by');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN verified_by INT NULL AFTER submitted_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND COLUMN_NAME = 'verified_at');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN verified_at DATETIME NULL AFTER verified_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND COLUMN_NAME = 'rejected_by');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN rejected_by INT NULL AFTER verified_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND COLUMN_NAME = 'rejected_at');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND COLUMN_NAME = 'rejection_reason');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN rejection_reason TEXT NULL AFTER rejected_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- 2. Historical-row backfill.
-- Every pre-existing row already reduces vendor outstanding under the
-- pre-workflow "all payments count" rule. Marking them Verified (the
-- terminal "recorded" state) keeps ledger totals identical; any other
-- status would silently inflate outstanding.
--
-- verified_by / verified_at are deliberately left NULL: the pre-workflow
-- system had no verification step, so there is no genuine historical
-- evidence of a verifier. Copying created_by would fabricate one.
--
-- The guard `status IS NULL` is what makes this permanently re-run safe:
-- rows created AFTER this migration always carry a non-NULL status ('Draft'
-- on insert), so only pre-workflow rows can ever match.
-- ---------------------------------------------------------------------------
UPDATE outlet_vendor_payments
SET status = 'Verified'
WHERE status IS NULL;

-- Now that every row has a status, tighten the column to NOT NULL so all
-- future inserts must carry a workflow state (default Draft). New payments
-- only become financially effective once Verified - Phase 7D2A2 adds the
-- submit/verify routes; until then freshly created rows intentionally do
-- not reduce outstanding.
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments'
    AND COLUMN_NAME = 'status' AND IS_NULLABLE = 'NO');
SET @s := IF(@c = 0,
  "ALTER TABLE outlet_vendor_payments MODIFY COLUMN status ENUM('Draft','Submitted','Verified','Rejected') NOT NULL DEFAULT 'Draft'",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- 3. Foreign keys for the new user-audit columns. The table's existing
--    unnamed FKs (outlet_id, vendor_id, payment_mode_id, created_by) occupy
--    outlet_vendor_payments_ibfk_1..4, so the next numbers follow the same
--    convention.
-- ---------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND CONSTRAINT_NAME = 'outlet_vendor_payments_ibfk_5');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD CONSTRAINT outlet_vendor_payments_ibfk_5 FOREIGN KEY (submitted_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND CONSTRAINT_NAME = 'outlet_vendor_payments_ibfk_6');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD CONSTRAINT outlet_vendor_payments_ibfk_6 FOREIGN KEY (verified_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_vendor_payments' AND CONSTRAINT_NAME = 'outlet_vendor_payments_ibfk_7');
SET @s := IF(@c = 0,
  'ALTER TABLE outlet_vendor_payments ADD CONSTRAINT outlet_vendor_payments_ibfk_7 FOREIGN KEY (rejected_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
