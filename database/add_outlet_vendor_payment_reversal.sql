-- Phase 7D2B1: controlled-reversal link columns for outlet_vendor_payments.
-- Mirrors the supplier_payments block of add_controlled_exception_framework.sql.
-- Each column has an INDEPENDENT INFORMATION_SCHEMA guard so a partially-applied
-- state recovers: a rerun adds whichever columns are missing and never skips a
-- missing column just because is_reversal already exists. The UNIQUE key on
-- reversal_of_payment_id is guarded separately and only attempted after the
-- column-add statements have run, so the index always sees an existing column.

SET @c_is_reversal := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'outlet_vendor_payments' AND column_name = 'is_reversal');
SET @sqlstmt := IF(@c_is_reversal = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN is_reversal TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c_reversal_of := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'outlet_vendor_payments' AND column_name = 'reversal_of_payment_id');
SET @sqlstmt := IF(@c_reversal_of = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN reversal_of_payment_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c_reversal_exc := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'outlet_vendor_payments' AND column_name = 'reversal_exception_id');
SET @sqlstmt := IF(@c_reversal_exc = 0,
  'ALTER TABLE outlet_vendor_payments ADD COLUMN reversal_exception_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exist := (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'outlet_vendor_payments' AND index_name = 'uq_outlet_vendor_payments_reversal_of');
SET @sqlstmt := IF(@idx_exist = 0,
  'ALTER TABLE outlet_vendor_payments ADD UNIQUE KEY uq_outlet_vendor_payments_reversal_of (reversal_of_payment_id)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
