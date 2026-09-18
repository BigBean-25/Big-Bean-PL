-- Phase 5D2B4: maker-checker approval workflow for petpooja_item_tax_uploads.
--
-- Item Tax uploads are the precise PetPooja item-wise CGST/SGST source used
-- by GSTR-1 when available. After this migration, only uploads whose
-- approval_status is 'Verified' may supply precise tax data; Draft,
-- Submitted and Rejected uploads have zero report effect.
--
-- Additive and rerun-safe: every statement is guarded by INFORMATION_SCHEMA
-- checks, so running this file twice is a no-op. Local dev only - do not run
-- against production.

-- approval_status ------------------------------------------------------------

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'petpooja_item_tax_uploads'
    AND COLUMN_NAME = 'approval_status'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE petpooja_item_tax_uploads ADD COLUMN approval_status ENUM(''Draft'',''Submitted'',''Verified'',''Rejected'') NULL AFTER total_amount',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Historical backfill: every pre-existing upload was already usable by
-- GSTR-1's precise-tax path, so they all become Verified. verified_by and
-- verified_at stay NULL - no genuine checker identity exists for rows that
-- predate the workflow, and fabricating one would corrupt the audit trail.
-- Guarded on approval_status IS NULL so a rerun cannot overwrite states the
-- workflow has already moved.
UPDATE petpooja_item_tax_uploads
SET approval_status = 'Verified'
WHERE approval_status IS NULL;

-- Tighten to NOT NULL DEFAULT 'Draft' only after the backfill so brand-new
-- uploads start their lifecycle as Draft.
ALTER TABLE petpooja_item_tax_uploads
  MODIFY COLUMN approval_status ENUM('Draft','Submitted','Verified','Rejected') NOT NULL DEFAULT 'Draft';

-- workflow audit columns -----------------------------------------------------

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'petpooja_item_tax_uploads'
    AND COLUMN_NAME = 'submitted_by'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE petpooja_item_tax_uploads ADD COLUMN submitted_by INT NULL, ADD COLUMN submitted_at DATETIME NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'petpooja_item_tax_uploads'
    AND COLUMN_NAME = 'verified_by'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE petpooja_item_tax_uploads ADD COLUMN verified_by INT NULL, ADD COLUMN verified_at DATETIME NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'petpooja_item_tax_uploads'
    AND COLUMN_NAME = 'rejected_by'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE petpooja_item_tax_uploads ADD COLUMN rejected_by INT NULL, ADD COLUMN rejected_at DATETIME NULL, ADD COLUMN rejection_reason TEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FKs to users(id), matching the table's existing fk_item_tax_* convention ---

SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'petpooja_item_tax_uploads'
    AND CONSTRAINT_NAME = 'fk_item_tax_upload_submitter'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE petpooja_item_tax_uploads ADD CONSTRAINT fk_item_tax_upload_submitter FOREIGN KEY (submitted_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'petpooja_item_tax_uploads'
    AND CONSTRAINT_NAME = 'fk_item_tax_upload_verifier'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE petpooja_item_tax_uploads ADD CONSTRAINT fk_item_tax_upload_verifier FOREIGN KEY (verified_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'petpooja_item_tax_uploads'
    AND CONSTRAINT_NAME = 'fk_item_tax_upload_rejecter'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE petpooja_item_tax_uploads ADD CONSTRAINT fk_item_tax_upload_rejecter FOREIGN KEY (rejected_by) REFERENCES users(id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
