-- Lets a Daily Cash Expense be tagged as a raw material purchase paid for
-- with cash by management, so it actually feeds consumption tracking
-- instead of only ever showing up as a generic expense line.
--
-- Design: the linked material_purchase_items row is created only when the
-- expense is APPROVED (see backend/src/controllers/dailyAccountsController.js
-- approveDailyCashExpense), not at draft time - drafts can still be freely
-- edited/deleted (existing rule: only Draft/Rejected are editable, Approved
-- is immutable), so there's nothing to keep in sync. A rejected expense
-- never creates a purchase record at all.

ALTER TABLE expense_heads
  ADD COLUMN IF NOT EXISTS is_raw_material_category TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When set, selecting this head on a Daily Cash Expense requires picking a raw material + quantity, and approving it creates a real purchase record for consumption tracking';

ALTER TABLE daily_cash_expenses
  ADD COLUMN IF NOT EXISTS raw_material_id INT NULL AFTER expense_head_id,
  ADD COLUMN IF NOT EXISTS material_qty DECIMAL(12,3) NULL AFTER raw_material_id,
  ADD COLUMN IF NOT EXISTS linked_purchase_item_id INT NULL AFTER material_qty
  COMMENT 'material_purchase_items.id created on approval, if this expense was raw-material-tagged';

-- Add the FKs separately, guarded, since ADD CONSTRAINT has no IF NOT EXISTS
-- form - re-running this file must not fail on a constraint that's already there.
SET @exist := (SELECT COUNT(1) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'daily_cash_expenses' AND constraint_name = 'fk_dce_raw_material');
SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE daily_cash_expenses ADD CONSTRAINT fk_dce_raw_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(1) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'daily_cash_expenses' AND constraint_name = 'fk_dce_linked_purchase_item');
SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE daily_cash_expenses ADD CONSTRAINT fk_dce_linked_purchase_item FOREIGN KEY (linked_purchase_item_id) REFERENCES material_purchase_items(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add the "Raw Material" expense head if it doesn't already exist, flagged
-- so the frontend knows to show the raw-material picker for it. Kept
-- distinct from the existing "Local Purchase" head, whose scope (any small
-- local buy, not necessarily a tracked raw material) stays unchanged.
INSERT INTO expense_heads (expense_name, expense_type, is_active, is_raw_material_category)
SELECT 'Raw Material', 'Daily', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_heads WHERE expense_name = 'Raw Material');
