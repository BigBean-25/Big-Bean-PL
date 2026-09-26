-- Req #26: Marketing expense subcategories.
--
-- Adds a small lookup table (expense_subcategories) parented to expense_heads
-- and a nullable daily_cash_expenses.expense_subcategory_id pointing at it.
-- Backend validation (dailyAccountsController) enforces the business rule:
-- Marketing expenses require an active subcategory belonging to the Marketing
-- head; every other head stores NULL. Marketing is resolved by normalized
-- name, never by id.
--
-- Fully additive + idempotent: table uses IF NOT EXISTS, the column/index/FK
-- are guarded through information_schema so re-running this file is a no-op.
-- Existing daily_cash_expenses rows keep expense_subcategory_id = NULL and
-- remain valid - no backfill. No initial subcategory rows are seeded: the
-- authoritative list is unconfirmed, so subcategories are created through the
-- Masters -> Marketing Subcategories screen instead.
--
-- ON DELETE RESTRICT on both FKs keeps historical expenses attached to a
-- valid subcategory id - a referenced subcategory can be deactivated but
-- never physically removed.

CREATE TABLE IF NOT EXISTS expense_subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_head_id INT NOT NULL COMMENT 'expense_heads.id - only the Marketing head is allowed by backend validation',
  subcategory_name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_es_head_name (expense_head_id, subcategory_name),
  CONSTRAINT fk_es_head FOREIGN KEY (expense_head_id) REFERENCES expense_heads(id) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Marketing expense subcategories (Req #26)';

-- Nullable subcategory link on expenses. Guard each ALTER independently via
-- information_schema: a partial previous run must not make a re-run fail.
SET @exist := (SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'daily_cash_expenses' AND column_name = 'expense_subcategory_id');
SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE daily_cash_expenses ADD COLUMN expense_subcategory_id INT NULL COMMENT "expense_subcategories.id - required when head is Marketing, NULL otherwise" AFTER expense_head_id',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'daily_cash_expenses' AND index_name = 'idx_dce_subcategory');
SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE daily_cash_expenses ADD INDEX idx_dce_subcategory (expense_subcategory_id)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(1) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'daily_cash_expenses' AND constraint_name = 'fk_dce_subcategory');
SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE daily_cash_expenses ADD CONSTRAINT fk_dce_subcategory FOREIGN KEY (expense_subcategory_id) REFERENCES expense_subcategories(id) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
