-- Distinguishes who actually paid for a purchase: the outlet itself
-- (cash/UPI, e.g. vegetables/chicken bought same-day by outlet staff) vs
-- Management/HQ paying the supplier directly for goods delivered straight
-- to the outlet. Additive only. Run once against each live database.

ALTER TABLE material_purchase_items ADD COLUMN IF NOT EXISTS paid_by ENUM('Outlet','Management') NOT NULL DEFAULT 'Outlet' AFTER invoice_no;
ALTER TABLE material_purchase_items ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(30) NULL AFTER paid_by;
