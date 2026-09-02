-- Adds credit terms to the outlet vendor master, so each purchase can carry
-- a due date (purchase_date + credit_days) and the ledger can flag overdue
-- balances instead of just a flat outstanding number.
-- Additive only. Run once against each live database.

ALTER TABLE outlet_vendors ADD COLUMN IF NOT EXISTS credit_days INT NOT NULL DEFAULT 0 AFTER category;
