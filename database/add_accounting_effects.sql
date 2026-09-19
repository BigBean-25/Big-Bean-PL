-- Phase 6A1: accounting integration foundation / idempotency layer.
--
-- accounting_effects is the single bridge table through which a physical
-- inventory document (GRN, purchase return, stock adjustment, wastage,
-- production) may LATER contribute an accounting effect. This migration is
-- deliberately additive and creates ZERO rows: no financial query reads this
-- table yet (plCalculator / supplierLedgerService / consumptionService are
-- untouched), so creating it cannot change any P&L, COGS, opening/closing
-- stock, supplier outstanding, revenue or GST figure.
--
-- Idempotency: MySQL treats NULLs as distinct in UNIQUE keys, so a plain
-- UNIQUE(source_type, source_id, source_item_id, effect_type) would let two
-- rows coexist when source_item_id IS NULL. source_item_key is a STORED
-- generated column that normalises NULL -> 0, so the unique key below is a
-- hard database guarantee: one physical source item can produce at most one
-- row per effect_type, regardless of application code.
--
-- source_type / effect_type are VARCHAR rather than ENUM so future batches
-- (6A2+) can add source kinds (PURCHASE_RETURN, WASTAGE, PRODUCTION,
-- MANUAL_CLAIM, ...) without schema churn. status stays an ENUM because the
-- Draft -> Verified -> Posted -> Reversed lifecycle is fixed foundation
-- semantics. TRANSFER_REVENUE / TRANSFER_EXPENSE intentionally do not exist:
-- internal transfers stay company-level zero-P&L by design.

CREATE TABLE IF NOT EXISTS accounting_effects (
  id INT NOT NULL AUTO_INCREMENT,
  effect_type VARCHAR(40) NOT NULL COMMENT 'PURCHASE | PURCHASE_RETURN | INVENTORY_VARIANCE | WASTAGE | CONSUMPTION | future kinds',
  source_type VARCHAR(40) NOT NULL COMMENT 'GRN | PURCHASE_RETURN | STOCK_ADJUSTMENT | WASTAGE | PRODUCTION | MANUAL_CLAIM | future kinds',
  source_id INT NOT NULL COMMENT 'id of the physical source document',
  source_item_id INT NULL COMMENT 'id of the source line item, NULL for document-level effects',
  source_item_key INT GENERATED ALWAYS AS (COALESCE(source_item_id, 0)) STORED COMMENT 'NULL-safe key for the source uniqueness guarantee (COALESCE never yields NULL, so NOT NULL is unnecessary and unsupported by MySQL grammar)',
  outlet_id INT NULL COMMENT 'accounting owner when the location resolves to an outlet - NULL means no statutory owner yet',
  location_id INT NULL COMMENT 'physical location the effect originated at',
  supplier_id INT NULL,
  raw_material_id INT NULL,
  effective_date DATE NOT NULL,
  quantity DECIMAL(18,6) NULL,
  unit_id INT NULL,
  base_amount DECIMAL(18,6) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(18,6) NOT NULL DEFAULT 0,
  total_amount DECIMAL(18,6) NOT NULL DEFAULT 0,
  claim_upload_item_id INT NULL COMMENT 'material_purchase_items.id that explicitly claims this effect - prevents GRN + manual upload double counting',
  status ENUM('Draft','Verified','Posted','Reversed') NOT NULL DEFAULT 'Draft',
  created_by INT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  verified_by INT NULL,
  verified_at DATETIME NULL,
  posted_by INT NULL,
  posted_at DATETIME NULL,
  reversed_by INT NULL,
  reversed_at DATETIME NULL,
  reversal_reason VARCHAR(255) NULL,
  metadata_json JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ae_source (source_type, source_id, source_item_key, effect_type),
  UNIQUE KEY uq_ae_claim (claim_upload_item_id),
  KEY idx_ae_outlet (outlet_id, effective_date),
  KEY idx_ae_location (location_id),
  KEY idx_ae_supplier (supplier_id),
  KEY idx_ae_status (status, effect_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
