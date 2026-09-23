-- Req #16: allow NULL dispatch_date on stock_transfers.
--
-- A direct Outlet -> Outlet transfer is created as Draft: it has NOT been
-- dispatched yet, so writing today's date into dispatch_date would record a
-- dispatch that never happened. The column was created NOT NULL in
-- warehouse_phase2b_migration.mjs because every transfer back then was born
-- inside a dispatch (requisition dispatch or Central Kitchen dispatch) - both
-- always carry a real dispatch date, so nothing existing writes NULL.
--
-- Guarded + idempotent via INFORMATION_SCHEMA (same SET/PREPARE/EXECUTE
-- pattern as the other tracked migrations). MODIFY preserves existing values
-- and the DEFAULT; no rows are touched.

SET @c := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_transfers'
    AND COLUMN_NAME = 'dispatch_date' AND IS_NULLABLE = 'NO');
SET @s := IF(@c = 1,
  'ALTER TABLE stock_transfers MODIFY COLUMN dispatch_date DATE NULL',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
