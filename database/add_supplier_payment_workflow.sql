USE `bigbeancafe_db`;

-- Phase 5D1: schema foundation for maker-checker workflows.
-- Additive only. Every statement is guarded through INFORMATION_SCHEMA so the
-- file is safe to re-run (the canonical runner also tracks it once in
-- schema_migrations). No drops, no renames, no destructive conversion.

-- ---------------------------------------------------------------------------
-- 1. production_wastage: repair the reject workflow.
-- productionWastageService.rejectProductionWastage writes rejected_by /
-- rejected_at, but the columns were never created, so every reject call
-- failed with ER_BAD_FIELD_ERROR. Column types match the table's other
-- user-audit fields (INT + DATETIME), and the FK matches the existing
-- fk_pw_* convention (all *_by columns reference users.id).
-- ---------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'production_wastage' AND COLUMN_NAME = 'rejected_by');
SET @s := IF(@c = 0,
  'ALTER TABLE production_wastage ADD COLUMN rejected_by INT NULL AFTER approved_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'production_wastage' AND COLUMN_NAME = 'rejected_at');
SET @s := IF(@c = 0,
  'ALTER TABLE production_wastage ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'production_wastage' AND CONSTRAINT_NAME = 'fk_pw_rejected_by');
SET @s := IF(@c = 0,
  'ALTER TABLE production_wastage ADD CONSTRAINT fk_pw_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- 2. supplier_payments: minimal maker-checker lifecycle
--    Draft -> Submitted -> Verified
--    Submitted -> Rejected (Rejected is editable/resubmittable, matching the
--    payout/daily-accounts convention)
--
--    Status/audit columns mirror payout_workflow_migration.sql:
--    status ENUM, *_by INT -> users(id) (this table already FKs created_by,
--    so the same ibfk style is used), *_at DATETIME, rejection_reason TEXT.
-- ---------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND COLUMN_NAME = 'status');
SET @s := IF(@c = 0,
  "ALTER TABLE supplier_payments ADD COLUMN status ENUM('Draft','Submitted','Verified','Rejected') NULL AFTER remarks",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND COLUMN_NAME = 'submitted_by');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD COLUMN submitted_by INT NULL AFTER status',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND COLUMN_NAME = 'submitted_at');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD COLUMN submitted_at DATETIME NULL AFTER submitted_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND COLUMN_NAME = 'verified_by');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD COLUMN verified_by INT NULL AFTER submitted_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND COLUMN_NAME = 'verified_at');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD COLUMN verified_at DATETIME NULL AFTER verified_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND COLUMN_NAME = 'rejected_by');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD COLUMN rejected_by INT NULL AFTER verified_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND COLUMN_NAME = 'rejected_at');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND COLUMN_NAME = 'rejection_reason');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD COLUMN rejection_reason TEXT NULL AFTER rejected_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- 3. Historical-row backfill.
-- Existing rows represent already-recorded payments that feed the supplier
-- ledger. They are marked Verified (the terminal "recorded" state) rather
-- than Draft, so ledger totals are preserved exactly and legacy rows become
-- immutable as intended.
--
-- verified_by / verified_at are deliberately left NULL: the pre-workflow
-- system had no verification step, so there is no genuine historical
-- evidence of a verifier. Copying created_by would fabricate one. The UI
-- displays such rows as legacy records.
--
-- The guard `status IS NULL` is what makes this permanently re-run safe:
-- rows created AFTER this migration always carry a non-NULL status ('Draft'
-- on insert), so only pre-workflow rows can ever match.
-- ---------------------------------------------------------------------------
UPDATE supplier_payments
SET status = 'Verified'
WHERE status IS NULL;

-- Now that every row has a status, tighten the column to NOT NULL so all
-- future inserts must carry a workflow state (default Draft).
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments'
    AND COLUMN_NAME = 'status' AND IS_NULLABLE = 'NO');
SET @s := IF(@c = 0,
  "ALTER TABLE supplier_payments MODIFY COLUMN status ENUM('Draft','Submitted','Verified','Rejected') NOT NULL DEFAULT 'Draft'",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- 4. Foreign keys for the new user-audit columns, following this table's
--    existing supplier_payments_ibfk_* naming convention.
-- ---------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND CONSTRAINT_NAME = 'supplier_payments_ibfk_5');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD CONSTRAINT supplier_payments_ibfk_5 FOREIGN KEY (submitted_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND CONSTRAINT_NAME = 'supplier_payments_ibfk_6');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD CONSTRAINT supplier_payments_ibfk_6 FOREIGN KEY (verified_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments' AND CONSTRAINT_NAME = 'supplier_payments_ibfk_7');
SET @s := IF(@c = 0,
  'ALTER TABLE supplier_payments ADD CONSTRAINT supplier_payments_ibfk_7 FOREIGN KEY (rejected_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
