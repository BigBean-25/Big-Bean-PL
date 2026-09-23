-- Phase 7D3A1: outlet vendor ledger financial foundations.
--   1. outlet_vendor_opening_balances - one opening payable per
--      (outlet_id, vendor_id). Balances are outlet+vendor scoped; the global
--      outlet_vendors master deliberately gets NO opening_balance column.
--   2. outlet_vendor_purchases.due_date - historical due-date snapshot.
--
-- IMPORTANT (backfill honesty): existing purchases never stored the credit
-- terms in force at purchase time. The NULL backfill below uses the vendor's
-- CURRENT credit_days and is a BEST-EFFORT APPROXIMATION - original historic
-- contractual credit days cannot be reconstructed from existing data.
--
-- Each step is independently INFORMATION_SCHEMA-guarded so partially-applied
-- states recover on rerun. Runner-compatible SET/PREPARE/EXECUTE pattern only.

-- 1) Opening-balance table
CREATE TABLE IF NOT EXISTS outlet_vendor_opening_balances (
  id INT PRIMARY KEY AUTO_INCREMENT,
  outlet_id INT NOT NULL,
  vendor_id INT NOT NULL,
  effective_date DATE NOT NULL,
  due_date DATE NOT NULL,
  opening_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  remarks TEXT,
  created_by INT,
  updated_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_outlet_vendor_opening_pair (outlet_id, vendor_id),
  INDEX idx_ovob_vendor (vendor_id),
  INDEX idx_ovob_effective (outlet_id, vendor_id, effective_date),
  CONSTRAINT fk_ovob_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_ovob_vendor FOREIGN KEY (vendor_id) REFERENCES outlet_vendors(id),
  CONSTRAINT fk_ovob_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_ovob_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- 2) purchase due_date column (independent guard)
SET @c_due := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'outlet_vendor_purchases' AND column_name = 'due_date');
SET @sqlstmt := IF(@c_due = 0,
  'ALTER TABLE outlet_vendor_purchases ADD COLUMN due_date DATE DEFAULT NULL AFTER invoice_no',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) legacy backfill - ONLY NULL rows, CURRENT vendor credit_days (approximation
--    per header comment). Naturally idempotent: once due_date is populated the
--    row never matches again.
UPDATE outlet_vendor_purchases p
JOIN outlet_vendors v ON v.id = p.vendor_id
SET p.due_date = DATE_ADD(p.purchase_date, INTERVAL v.credit_days DAY)
WHERE p.due_date IS NULL;
