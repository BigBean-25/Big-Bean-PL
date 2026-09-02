-- Fix: adding a Raw Material or Menu Item currently fails with a 500 error
-- because the frontend form sends a `description` field that these tables
-- don't have. Run this once against each live database.
--
-- IF NOT EXISTS guard: add_item_hsn_gst_fields.sql adds this same column to
-- both tables (its own comment notes it's there in case this script hasn't
-- run yet). Without the guard, whichever of these two scripts runs second
-- fails with "Duplicate column name 'description'".

ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER reorder_level;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER selling_price;

-- Optional cleanup: remove the test row created while diagnosing this bug.
-- Only run this line if a row with this exact code still exists.
-- DELETE FROM raw_materials WHERE material_code = 'TEST002';
