-- Phase 6A8: explicit per-outlet COGS source mode + PHYSICAL-capable snapshots.
--
-- outlet_cogs_settings holds the operator's cutover decision per outlet:
--   cogs_mode = 'PERIODIC'  -> official COGS stays Verified Opening +
--                              Effective Purchases - Verified Closing.
--   cogs_mode = 'PHYSICAL'  -> official COGS is the posted physical
--                              consumption value, but ONLY for months whose
--                              month-start is >= the month containing
--                              physical_cogs_start_date, and ONLY when the
--                              period's physical data passes the readiness
--                              gate in physicalCogsService.js.
--
-- A NULL physical_cogs_start_date means PHYSICAL can never take effect, so a
-- mode row alone cannot silently switch historical months. Historical rows
-- (none exist yet) and all future PERIODIC rows behave exactly as before.
--
-- monthly_pnl_snapshots changes are additive and backward compatible:
--   cogs_source / physical_cogs / physical_wastage /
--   physical_adjustment_variance / physical_readiness are plain columns.
--   official_cogs is a STORED generated column: for PERIODIC rows it
--   reproduces (opening_stock + purchases - closing_stock) byte-for-byte, so
--   existing finalized snapshots stay numerically identical.
--   gross_profit / net_profit generated expressions are redefined to resolve
--   the official COGS the same way; on PERIODIC rows the new expressions
--   evaluate to exactly the old formula. MySQL forbids generated columns
--   referencing other generated columns, so the IF() is inlined rather than
--   referencing official_cogs.
--
-- Guarded so re-running does nothing once applied.

CREATE TABLE IF NOT EXISTS outlet_cogs_settings (
  outlet_id INT PRIMARY KEY,
  cogs_mode ENUM('PERIODIC','PHYSICAL') NOT NULL DEFAULT 'PERIODIC',
  physical_cogs_start_date DATE NULL COMMENT 'first calendar month PHYSICAL may apply (whole-month granularity) - NULL disables PHYSICAL entirely',
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ocs_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @cols_exist := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'monthly_pnl_snapshots' AND column_name = 'official_cogs');
SET @sqlstmt := IF(@cols_exist = 0,
  'ALTER TABLE monthly_pnl_snapshots
     ADD COLUMN cogs_source ENUM(''PERIODIC'',''PHYSICAL'') NOT NULL DEFAULT ''PERIODIC'' AFTER closing_stock,
     ADD COLUMN physical_cogs DECIMAL(12,2) NULL AFTER cogs_source,
     ADD COLUMN physical_wastage DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER physical_cogs,
     ADD COLUMN physical_adjustment_variance DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER physical_wastage,
     ADD COLUMN physical_readiness VARCHAR(20) NULL AFTER physical_adjustment_variance,
     ADD COLUMN official_cogs DECIMAL(12,2) GENERATED ALWAYS AS (IF(cogs_source = ''PHYSICAL'' AND physical_cogs IS NOT NULL, physical_cogs, (opening_stock + purchases - closing_stock))) STORED AFTER physical_readiness,
     MODIFY COLUMN gross_profit DECIMAL(12,2) GENERATED ALWAYS AS (net_sales - IF(cogs_source = ''PHYSICAL'' AND physical_cogs IS NOT NULL, physical_cogs, (opening_stock + purchases - closing_stock))) STORED,
     MODIFY COLUMN net_profit DECIMAL(12,2) GENERATED ALWAYS AS (
       net_sales
       - IF(cogs_source = ''PHYSICAL'' AND physical_cogs IS NOT NULL, physical_cogs, (opening_stock + purchases - closing_stock))
       - (employee_salary + incentives + overtime + staff_benefits)
       - (rent + electricity + water + maintenance + accommodation + other_expenses)
       - (zomato_commission + swiggy_commission + dine_in_commission + gateway_charges + tds + tcs + other_deductions)
       - IF(cogs_source = ''PHYSICAL'', COALESCE(physical_wastage,0) + COALESCE(physical_adjustment_variance,0), 0)
     ) STORED',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
