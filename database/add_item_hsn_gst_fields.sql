-- Foundation for the Items/HSN/GST roadmap: broadens Raw Materials into a
-- general Items master (item_type) and adds HSN code + GST rate to both
-- Raw Materials and Menu Items, needed for HSN search and any GSTR-grade
-- reporting built on top of this later. Run once against each live database.
--
-- Also (re)adds `description` to raw_materials/menu_items in case
-- fix_masters_description_column.sql from earlier was not yet run — this
-- statement is safe to run even if that column already exists.

ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER reorder_level;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS item_type ENUM('Raw Material','Packaging','Consumable','Asset','Other') NOT NULL DEFAULT 'Raw Material' AFTER description;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20) NULL AFTER item_type;
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) NULL AFTER hsn_code;

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER selling_price;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20) NULL AFTER description;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) NULL AFTER hsn_code;
