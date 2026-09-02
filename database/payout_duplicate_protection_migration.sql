USE `bigbeancafe_db`;

-- Phase 1B: Payout duplicate protection
-- Prevents multiple records for the same outlet + month + year + platform/portal.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE online_payouts
  ADD UNIQUE INDEX IF NOT EXISTS ux_online_payout_outlet_month_platform (outlet_id, month, year, platform_id);

ALTER TABLE dine_in_payouts
  ADD UNIQUE INDEX IF NOT EXISTS ux_dine_in_payout_outlet_month_portal (outlet_id, month, year, portal_id);
