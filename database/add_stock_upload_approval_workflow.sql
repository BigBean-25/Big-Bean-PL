USE `bigbeancafe_db`;

-- Phase 5D2B1: maker-checker approval workflow for opening_stock_uploads and
-- closing_stock_uploads.
--
-- The existing `status` column (Pending/Processing/Completed/Failed/Rolled
-- Back) stays the TECHNICAL import status and is untouched. The new
-- `approval_status` is the BUSINESS/FINANCIAL approval state. A row only has
-- accounting effect when BOTH hold:
--   status = 'Completed' AND approval_status = 'Verified'
--
-- Additive only. Every statement is guarded through INFORMATION_SCHEMA so the
-- file is safe to re-run (the canonical runner also tracks it once in
-- schema_migrations). No drops, no renames, no destructive conversion.

-- ---------------------------------------------------------------------------
-- Helper pattern (repeated per table/column because the migration runner
-- splits on ';' and does not support routines/variables across statements):
--   SET @c := (SELECT COUNT(*) ...);
--   SET @s := IF(@c = 0, '<ALTER>', 'SELECT 1');
--   PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- ---------------------------------------------------------------------------

-- ============================ opening_stock_uploads =========================
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND COLUMN_NAME = 'approval_status');
SET @s := IF(@c = 0,
  "ALTER TABLE opening_stock_uploads ADD COLUMN approval_status ENUM('Draft','Submitted','Verified','Rejected') NULL AFTER status",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND COLUMN_NAME = 'submitted_by');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD COLUMN submitted_by INT NULL AFTER approval_status',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND COLUMN_NAME = 'submitted_at');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD COLUMN submitted_at DATETIME NULL AFTER submitted_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND COLUMN_NAME = 'verified_by');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD COLUMN verified_by INT NULL AFTER submitted_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND COLUMN_NAME = 'verified_at');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD COLUMN verified_at DATETIME NULL AFTER verified_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND COLUMN_NAME = 'rejected_by');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD COLUMN rejected_by INT NULL AFTER verified_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND COLUMN_NAME = 'rejected_at');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND COLUMN_NAME = 'rejection_reason');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD COLUMN rejection_reason TEXT NULL AFTER rejected_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ============================ closing_stock_uploads =========================
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND COLUMN_NAME = 'approval_status');
SET @s := IF(@c = 0,
  "ALTER TABLE closing_stock_uploads ADD COLUMN approval_status ENUM('Draft','Submitted','Verified','Rejected') NULL AFTER status",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND COLUMN_NAME = 'submitted_by');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD COLUMN submitted_by INT NULL AFTER approval_status',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND COLUMN_NAME = 'submitted_at');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD COLUMN submitted_at DATETIME NULL AFTER submitted_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND COLUMN_NAME = 'verified_by');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD COLUMN verified_by INT NULL AFTER submitted_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND COLUMN_NAME = 'verified_at');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD COLUMN verified_at DATETIME NULL AFTER verified_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND COLUMN_NAME = 'rejected_by');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD COLUMN rejected_by INT NULL AFTER verified_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND COLUMN_NAME = 'rejected_at');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND COLUMN_NAME = 'rejection_reason');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD COLUMN rejection_reason TEXT NULL AFTER rejected_at',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- Historical backfill (both tables).
-- Existing 'Completed' rows already feed COGS/P&L and must remain financially
-- effective -> approval_status='Verified'. verified_by/verified_at stay NULL:
-- the pre-workflow system had no verification step, so there is no genuine
-- historical evidence of a verifier; copying uploaded_by would fabricate one.
-- Non-Completed rows were never financially effective -> 'Draft'.
-- `approval_status IS NULL` keeps this permanently re-run safe: rows created
-- after this migration always carry a non-NULL approval_status.
-- ---------------------------------------------------------------------------
UPDATE opening_stock_uploads
SET approval_status = IF(status = 'Completed', 'Verified', 'Draft')
WHERE approval_status IS NULL;

UPDATE closing_stock_uploads
SET approval_status = IF(status = 'Completed', 'Verified', 'Draft')
WHERE approval_status IS NULL;

-- Tighten to NOT NULL DEFAULT 'Draft' once every row carries a value.
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads'
    AND COLUMN_NAME = 'approval_status' AND IS_NULLABLE = 'NO');
SET @s := IF(@c = 0,
  "ALTER TABLE opening_stock_uploads MODIFY COLUMN approval_status ENUM('Draft','Submitted','Verified','Rejected') NOT NULL DEFAULT 'Draft'",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads'
    AND COLUMN_NAME = 'approval_status' AND IS_NULLABLE = 'NO');
SET @s := IF(@c = 0,
  "ALTER TABLE closing_stock_uploads MODIFY COLUMN approval_status ENUM('Draft','Submitted','Verified','Rejected') NOT NULL DEFAULT 'Draft'",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- Foreign keys for the new user-audit columns, matching each table's existing
-- *_ibfk_* convention (uploaded_by -> users).
-- ---------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND CONSTRAINT_NAME = 'opening_stock_uploads_ibfk_3');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD CONSTRAINT opening_stock_uploads_ibfk_3 FOREIGN KEY (submitted_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND CONSTRAINT_NAME = 'opening_stock_uploads_ibfk_4');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD CONSTRAINT opening_stock_uploads_ibfk_4 FOREIGN KEY (verified_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'opening_stock_uploads' AND CONSTRAINT_NAME = 'opening_stock_uploads_ibfk_5');
SET @s := IF(@c = 0,
  'ALTER TABLE opening_stock_uploads ADD CONSTRAINT opening_stock_uploads_ibfk_5 FOREIGN KEY (rejected_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND CONSTRAINT_NAME = 'closing_stock_uploads_ibfk_3');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD CONSTRAINT closing_stock_uploads_ibfk_3 FOREIGN KEY (submitted_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND CONSTRAINT_NAME = 'closing_stock_uploads_ibfk_4');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD CONSTRAINT closing_stock_uploads_ibfk_4 FOREIGN KEY (verified_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'closing_stock_uploads' AND CONSTRAINT_NAME = 'closing_stock_uploads_ibfk_5');
SET @s := IF(@c = 0,
  'ALTER TABLE closing_stock_uploads ADD CONSTRAINT closing_stock_uploads_ibfk_5 FOREIGN KEY (rejected_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
