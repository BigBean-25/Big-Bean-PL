-- Phase 6A4: hard database guarantee that one purchase return produces at
-- most one supplier credit.
--
-- postReturn() already serialises concurrent posts on the return row's
-- FOR UPDATE lock and refuses a second post, but the supplier_credits row
-- itself had no database-level uniqueness - the one-credit-per-return
-- invariant lived only in application code. supplier_credits feeds
-- getCumulativeCredits() in supplierLedgerService, so a duplicate credit
-- would silently double-reduce supplier outstanding.
--
-- Verified against the local database before writing this file: zero
-- duplicate purchase_return_id values exist, and purchase_return_id is
-- NOT NULL so every row participates in the key. Guarded so re-running
-- does not fail on an existing index.

SET @exist := (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'supplier_credits' AND index_name = 'uq_sc_return');
SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE supplier_credits ADD UNIQUE KEY uq_sc_return (purchase_return_id)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
