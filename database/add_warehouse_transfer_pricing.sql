-- Warehouse "sale" price to outlets, separate from purchase cost, so
-- warehouse profit (transfer price vs. purchase cost) can be reported.
-- transfer_price is priced per the material's BASE unit, same as unit_cost
-- already is elsewhere in the warehouse module.
-- Additive only. Run once against each live database.

ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS transfer_price DECIMAL(10,2) NULL AFTER gst_rate;

ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS transfer_price DECIMAL(12,4) NULL AFTER unit_cost;
ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS sale_value DECIMAL(14,4) NULL AFTER transfer_price;
