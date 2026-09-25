-- Req #17: reconcile tracked stock_ledger unique-key shape with production.
--
-- The tracked 2A migration creates a 4-column key:
--   uq_stock_ledger (transaction_type, reference_type, reference_id, reference_item_id)
-- Production additionally has STORED generated columns and a 5-column key:
--   reference_item_key INT  GENERATED ALWAYS AS (COALESCE(reference_item_id,0)) STORED
--   batch_key          VARCHAR(50) GENERATED ALWAYS AS (COALESCE(batch_no,'')) STORED
--   uq_stock_ledger (transaction_type, reference_type, reference_id, reference_item_key, batch_key)
-- The batch/item key columns let repeated partial receipts of the same
-- transfer-item+batch collide on purpose so ON DUPLICATE KEY UPDATE can
-- accumulate them instead of hard-failing.
--
-- Guarded + idempotent via INFORMATION_SCHEMA (same SET/PREPARE/EXECUTE
-- convention as the other tracked migrations). No rows are touched: generated
-- columns materialize from existing data and the index swap reuses them.
-- On a database that already has the production shape every statement below
-- resolves to SELECT 1.

-- 1. Generated column: reference_item_key
SET @c := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_ledger'
    AND COLUMN_NAME = 'reference_item_key');
SET @s := IF(@c = 0,
  'ALTER TABLE stock_ledger ADD COLUMN reference_item_key INT GENERATED ALWAYS AS (COALESCE(reference_item_id, 0)) STORED',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2. Generated column: batch_key
SET @c := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_ledger'
    AND COLUMN_NAME = 'batch_key');
SET @s := IF(@c = 0,
  "ALTER TABLE stock_ledger ADD COLUMN batch_key VARCHAR(50) GENERATED ALWAYS AS (COALESCE(batch_no, '')) STORED",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3. Replace uq_stock_ledger only when its ordered column list differs from
--    the production 5-column definition. Two steps so a missing index (fresh
--    schema where the 4-col key was never created) can still gain the key
--    without a DROP of a non-existent index.
SET @cols := (SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_ledger'
    AND INDEX_NAME = 'uq_stock_ledger');
SET @s := IF(@cols IS NOT NULL AND @cols <> 'transaction_type,reference_type,reference_id,reference_item_key,batch_key',
  'ALTER TABLE stock_ledger DROP INDEX uq_stock_ledger',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF(@cols IS NULL OR @cols <> 'transaction_type,reference_type,reference_id,reference_item_key,batch_key',
  'ALTER TABLE stock_ledger ADD UNIQUE KEY uq_stock_ledger (transaction_type, reference_type, reference_id, reference_item_key, batch_key)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
