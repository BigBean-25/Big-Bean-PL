USE `bigbeancafe_db`;

-- Phase 1C: Payout workflow audit fields
-- Adds maker/checker tracking columns for submit, verify, reject actions.

ALTER TABLE online_payouts
  ADD COLUMN IF NOT EXISTS submitted_by INT NULL AFTER status,
  ADD COLUMN IF NOT EXISTS submitted_at DATETIME NULL AFTER submitted_by,
  ADD COLUMN IF NOT EXISTS verified_by INT NULL AFTER submitted_at,
  ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL AFTER verified_by,
  ADD COLUMN IF NOT EXISTS rejected_by INT NULL AFTER verified_at,
  ADD COLUMN IF NOT EXISTS rejected_at DATETIME NULL AFTER rejected_by,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL AFTER rejected_at;

ALTER TABLE dine_in_payouts
  ADD COLUMN IF NOT EXISTS submitted_by INT NULL AFTER status,
  ADD COLUMN IF NOT EXISTS submitted_at DATETIME NULL AFTER submitted_by,
  ADD COLUMN IF NOT EXISTS verified_by INT NULL AFTER submitted_at,
  ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL AFTER verified_by,
  ADD COLUMN IF NOT EXISTS rejected_by INT NULL AFTER verified_at,
  ADD COLUMN IF NOT EXISTS rejected_at DATETIME NULL AFTER rejected_by,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL AFTER rejected_at;
