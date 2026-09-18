USE `bigbeancafe_db`;

-- Phase 5D2B2: maker-checker approval workflow for material_purchase_uploads.
--
-- The existing `status` column (Pending/Processing/Completed/Failed/Rolled
-- Back) stays the TECHNICAL import status and is untouched. The new
-- `approval_status` is the BUSINESS/FINANCIAL approval state. A row only has
-- accounting effect (COGS purchases, consumption, supplier outstanding) when
-- BOTH hold:
--   status = 'Completed' AND approval_status = 'Verified'
--
-- Additive only. Every statement is guarded through INFORMATION_SCHEMA so the
-- file is safe to re-run (the canonical runner also tracks it once in
-- schema_migrations). No drops, no renames, no destructive conversion.

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND COLUMN_NAME = 'approval_status');
SET @s := IF(@c = 0,
  "ALTER TABLE material_purchase_uploads ADD COLUMN approval_status ENUM('Draft','Submitted','Verified','Rejected') NULL AFTER status",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND COLUMN_NAME = 'submitted_by');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD COLUMN submitted_by INT NULL AFTER approval_status',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND COLUMN_NAME = 'submitted_at');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD COLUMN submitted_at DATETIME NULL AFTER submitted_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND COLUMN_NAME = 'verified_by');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD COLUMN verified_by INT NULL AFTER submitted_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND COLUMN_NAME = 'verified_at');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD COLUMN verified_at DATETIME NULL AFTER verified_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND COLUMN_NAME = 'rejected_by');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD COLUMN rejected_by INT NULL AFTER verified_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND COLUMN_NAME = 'rejected_at');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND COLUMN_NAME = 'rejection_reason');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD COLUMN rejection_reason TEXT NULL AFTER rejected_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- Historical backfill.
-- Existing 'Completed' rows already feed COGS/consumption/supplier ledger and
-- must remain financially effective -> approval_status='Verified'. This
-- includes CASHEXP-* synthetic uploads created by the approved raw-material
-- cash-expense path: their parent expense already passed approval, so they are
-- legitimately effective. verified_by/verified_at stay NULL for ALL historical
-- rows - the pre-workflow system had no verification step, so there is no
-- genuine evidence of a verifier; copying uploaded_by would fabricate one.
-- Non-Completed rows were never financially effective -> 'Draft'.
-- `approval_status IS NULL` keeps this permanently re-run safe.
-- ---------------------------------------------------------------------------
UPDATE material_purchase_uploads
SET approval_status = IF(status = 'Completed', 'Verified', 'Draft')
WHERE approval_status IS NULL;

-- Tighten to NOT NULL DEFAULT 'Draft' once every row carries a value.
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads'
    AND COLUMN_NAME = 'approval_status' AND IS_NULLABLE = 'NO');
SET @s := IF(@c = 0,
  "ALTER TABLE material_purchase_uploads MODIFY COLUMN approval_status ENUM('Draft','Submitted','Verified','Rejected') NOT NULL DEFAULT 'Draft'",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- Foreign keys for the new user-audit columns, matching the table's existing
-- *_ibfk_* convention (uploaded_by -> users is ibfk_2).
-- ---------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND CONSTRAINT_NAME = 'material_purchase_uploads_ibfk_3');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD CONSTRAINT material_purchase_uploads_ibfk_3 FOREIGN KEY (submitted_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND CONSTRAINT_NAME = 'material_purchase_uploads_ibfk_4');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD CONSTRAINT material_purchase_uploads_ibfk_4 FOREIGN KEY (verified_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'material_purchase_uploads' AND CONSTRAINT_NAME = 'material_purchase_uploads_ibfk_5');
SET @s := IF(@c = 0,
  'ALTER TABLE material_purchase_uploads ADD CONSTRAINT material_purchase_uploads_ibfk_5 FOREIGN KEY (rejected_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
