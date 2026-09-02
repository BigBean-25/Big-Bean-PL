-- Adds GSTIN and address fields to locations, so a warehouse/outlet can be
-- used as the "Buyer" block on a printed Purchase Order / Tax Invoice.
-- Additive only, no data loss. Run once against each live database.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS gstin VARCHAR(20) NULL AFTER location_name;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS address TEXT NULL AFTER gstin;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS city VARCHAR(50) NULL AFTER address;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS state VARCHAR(50) NULL AFTER city;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS pincode VARCHAR(10) NULL AFTER state;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL AFTER pincode;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS email VARCHAR(100) NULL AFTER phone;
