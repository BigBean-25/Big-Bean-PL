-- Phase 7E1A: direct grn_items -> purchase_order_items linkage.
--
-- Problem: grn.purchase_order_id links receipts at HEADER level only.
-- grn_items carries raw_material_id but a PO may legally contain the same
-- material on multiple lines (no UNIQUE(po,material), validatePOItems does
-- not reject duplicates), so PO+material cannot identify which line a
-- receipt came from. This column is source attribution metadata ONLY -
-- it changes no rates, quantities, totals, stock valuation or payables.
--
-- FK choice: RESTRICT.
--   updatePO/deletePO are Draft-only and every linked GRN exists only after
--   the PO is Approved+, so RESTRICT can never block a legitimate flow.
--   SET NULL is rejected because it would silently orphan received history;
--   CASCADE is rejected because it could never be allowed to delete receipts.
--
-- Backfill: only when attribution is UNIQUELY provable - the parent GRN has a
-- purchase_order_id AND the PO contains exactly ONE item for that material.
-- Duplicate-material POs and manual GRNs stay NULL; no rate/qty/order
-- heuristics are used to fabricate identity.
--
-- Each step is independently INFORMATION_SCHEMA-guarded (partial-state safe).
-- Runner-compatible SET/PREPARE/EXECUTE pattern only.

-- 1) Column
SET @c := (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'grn_items' AND column_name = 'purchase_order_item_id');
SET @sqlstmt := IF(@c = 0,
  'ALTER TABLE grn_items ADD COLUMN purchase_order_item_id INT NULL AFTER grn_id',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Index
SET @i := (SELECT COUNT(1) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'grn_items' AND index_name = 'idx_gri_po_item');
SET @sqlstmt := IF(@i = 0,
  'CREATE INDEX idx_gri_po_item ON grn_items(purchase_order_item_id)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Foreign key (guarded by constraint name)
SET @f := (SELECT COUNT(1) FROM information_schema.TABLE_CONSTRAINTS
  WHERE table_schema = DATABASE() AND table_name = 'grn_items'
    AND constraint_name = 'fk_gri_po_item' AND constraint_type = 'FOREIGN KEY');
SET @sqlstmt := IF(@f = 0,
  'ALTER TABLE grn_items ADD CONSTRAINT fk_gri_po_item FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) Safe backfill - only uniquely-attributable rows:
--    parent GRN has a PO, and that PO has exactly ONE item for the material.
--    Naturally idempotent: once populated the row never matches again.
UPDATE grn_items gri
JOIN grn g ON g.id = gri.grn_id
JOIN purchase_order_items poi
  ON poi.purchase_order_id = g.purchase_order_id
 AND poi.raw_material_id = gri.raw_material_id
SET gri.purchase_order_item_id = poi.id
WHERE g.purchase_order_id IS NOT NULL
  AND gri.purchase_order_item_id IS NULL
  AND (SELECT COUNT(*) FROM purchase_order_items pi2
       WHERE pi2.purchase_order_id = g.purchase_order_id
         AND pi2.raw_material_id = gri.raw_material_id) = 1;
