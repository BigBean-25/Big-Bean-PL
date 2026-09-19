-- Phase 6A9: controlled locked-record exceptions and compensating reversal links.
--
-- This migration is additive and rerun-safe. It introduces a narrow generic
-- exception workflow plus reversal-link columns on the source tables that
-- need an auditable compensating record in the same domain table.
--
-- The framework does NOT unlock original records. It only records request,
-- review, approval and executed compensating actions.
--
-- Conventions: INFORMATION_SCHEMA-guarded ALTERs (MySQL 8 has no
-- ADD COLUMN IF NOT EXISTS), CREATE TABLE IF NOT EXISTS, and a gap-fill
-- permission seed (INSERT IGNORE) that never overwrites customised grants.

CREATE TABLE IF NOT EXISTS controlled_exceptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  exception_no VARCHAR(50) NOT NULL,
  source_module VARCHAR(80) NOT NULL,
  source_type VARCHAR(80) NOT NULL,
  source_id INT NOT NULL,
  source_item_id INT DEFAULT NULL,
  outlet_id INT DEFAULT NULL,
  location_id INT DEFAULT NULL,
  exception_type ENUM('DATA_CORRECTION','FINANCIAL_REVERSAL','PHYSICAL_REVERSAL','DUPLICATE_TRANSACTION','WRONG_OUTLET','WRONG_AMOUNT','WRONG_DATE','WRONG_MATERIAL','OTHER') NOT NULL,
  reason TEXT NOT NULL,
  business_impact VARCHAR(40) NOT NULL,
  source_status VARCHAR(40) DEFAULT NULL,
  source_date DATE DEFAULT NULL,
  original_amount DECIMAL(18,6) DEFAULT NULL,
  original_qty DECIMAL(18,6) DEFAULT NULL,
  requested_by INT NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_by INT DEFAULT NULL,
  submitted_at DATETIME DEFAULT NULL,
  status ENUM('Requested','Under Review','Approved','Rejected','Executed','Cancelled') NOT NULL DEFAULT 'Requested',
  reviewed_by INT DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  approved_by INT DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  rejected_by INT DEFAULT NULL,
  rejected_at DATETIME DEFAULT NULL,
  rejection_reason TEXT DEFAULT NULL,
  executed_by INT DEFAULT NULL,
  executed_at DATETIME DEFAULT NULL,
  reversal_reference_type VARCHAR(80) DEFAULT NULL,
  reversal_reference_id INT DEFAULT NULL,
  reversal_effective_date DATE DEFAULT NULL,
  reversal_amount DECIMAL(18,6) DEFAULT NULL,
  reversal_qty DECIMAL(18,6) DEFAULT NULL,
  original_payload_json JSON DEFAULT NULL,
  reversal_payload_json JSON DEFAULT NULL,
  support_status ENUM('FULL_REVERSAL_SUPPORTED','CORRECTION_DOCUMENT_SUPPORTED','REQUEST_ONLY_REQUIRES_MANUAL_RESOLUTION','NOT_APPLICABLE') NOT NULL DEFAULT 'REQUEST_ONLY_REQUIRES_MANUAL_RESOLUTION',
  reversal_key VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_controlled_exceptions_no (exception_no),
  UNIQUE KEY uq_controlled_exceptions_reversal_key (reversal_key),
  INDEX idx_controlled_exceptions_source (source_module, source_type, source_id),
  INDEX idx_controlled_exceptions_outlet (outlet_id, status, requested_at),
  INDEX idx_controlled_exceptions_status (status, exception_type),
  CONSTRAINT fk_controlled_exceptions_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_controlled_exceptions_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id),
  CONSTRAINT fk_controlled_exceptions_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id),
  CONSTRAINT fk_controlled_exceptions_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
  CONSTRAINT fk_controlled_exceptions_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id),
  CONSTRAINT fk_controlled_exceptions_executed_by FOREIGN KEY (executed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reversal-link columns (one guarded ALTER per table, one guard per index).

SET @cols_exist := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'supplier_payments' AND column_name = 'is_reversal');
SET @sqlstmt := IF(@cols_exist = 0,
  'ALTER TABLE supplier_payments
     ADD COLUMN is_reversal TINYINT(1) NOT NULL DEFAULT 0,
     ADD COLUMN reversal_of_payment_id INT DEFAULT NULL,
     ADD COLUMN reversal_exception_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exist := (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'supplier_payments' AND index_name = 'uq_supplier_payments_reversal_of');
SET @sqlstmt := IF(@idx_exist = 0,
  'ALTER TABLE supplier_payments ADD UNIQUE KEY uq_supplier_payments_reversal_of (reversal_of_payment_id)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @cols_exist := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'purchase_returns' AND column_name = 'is_reversal');
SET @sqlstmt := IF(@cols_exist = 0,
  'ALTER TABLE purchase_returns
     ADD COLUMN is_reversal TINYINT(1) NOT NULL DEFAULT 0,
     ADD COLUMN reversal_of_return_id INT DEFAULT NULL,
     ADD COLUMN reversal_exception_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exist := (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'purchase_returns' AND index_name = 'uq_purchase_returns_reversal_of');
SET @sqlstmt := IF(@idx_exist = 0,
  'ALTER TABLE purchase_returns ADD UNIQUE KEY uq_purchase_returns_reversal_of (reversal_of_return_id)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @cols_exist := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'accounting_effects' AND column_name = 'is_reversal');
SET @sqlstmt := IF(@cols_exist = 0,
  'ALTER TABLE accounting_effects
     ADD COLUMN is_reversal TINYINT(1) NOT NULL DEFAULT 0,
     ADD COLUMN reversal_of_effect_id INT DEFAULT NULL,
     ADD COLUMN reversal_exception_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exist := (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'accounting_effects' AND index_name = 'uq_accounting_effects_reversal_of');
SET @sqlstmt := IF(@idx_exist = 0,
  'ALTER TABLE accounting_effects ADD UNIQUE KEY uq_accounting_effects_reversal_of (reversal_of_effect_id)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @cols_exist := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'outlet_consumptions' AND column_name = 'reversal_exception_id');
SET @sqlstmt := IF(@cols_exist = 0,
  'ALTER TABLE outlet_consumptions ADD COLUMN reversal_exception_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exist := (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'outlet_consumptions' AND index_name = 'uq_oc_reversal_exception');
SET @sqlstmt := IF(@idx_exist = 0,
  'ALTER TABLE outlet_consumptions ADD UNIQUE KEY uq_oc_reversal_exception (reversal_exception_id)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Gap-fill permission seed for the new controlled_exceptions module key.
-- INSERT IGNORE means a rerun inserts only missing (role, module) rows and
-- leaves any customised grants untouched - this must never reset a role's
-- hand-edited permissions.
--
-- Default grant shape:
--   Super Admin / Admin / Developer / Accountant / Technical Admin -> full workflow
--   Warehouse Admin                                              -> request + review (no approve/lock)
--   Outlet Admin / Outlet Staff                                  -> request only
--   Viewer                                                       -> view only, read-only
INSERT IGNORE INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT
    r.id,
    'controlled_exceptions' AS module_key,
    'Controlled Exceptions' AS module_name,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin','Warehouse Admin','Outlet Admin','Outlet Staff','Viewer') THEN 1 ELSE 0 END AS can_view,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin','Warehouse Admin','Outlet Admin','Outlet Staff') THEN 1 ELSE 0 END AS can_create,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin','Warehouse Admin') THEN 1 ELSE 0 END AS can_edit,
    0 AS can_delete,
    0 AS can_upload,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin','Warehouse Admin','Outlet Admin','Outlet Staff') THEN 1 ELSE 0 END AS can_submit,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin','Warehouse Admin') THEN 1 ELSE 0 END AS can_verify,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin') THEN 1 ELSE 0 END AS can_approve,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin') THEN 1 ELSE 0 END AS can_reject,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin') THEN 1 ELSE 0 END AS can_lock,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin','Warehouse Admin','Outlet Admin','Outlet Staff','Viewer') THEN 1 ELSE 0 END AS can_export,
    CASE WHEN r.role_name = 'Viewer' THEN 1 ELSE 0 END AS is_read_only
  FROM roles r
) src;
