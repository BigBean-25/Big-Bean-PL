-- Req #25: establishes "Marketing" as a Daily Cash Expense head so outlets can
-- record marketing spend under its own category instead of Miscellaneous/Other.
--
-- Master-data only: every consumer (expense entry dropdown, create/update
-- validation, Expense Report grouping, Excel export, monthly P&L aggregation)
-- already reads expense_heads dynamically, so inserting the row is the whole
-- feature. No application-code or schema change accompanies this file.
--
-- CREATE-IF-MISSING semantics: safe to re-run, and if a Marketing head already
-- exists (even with different expense_type/is_active flags) this file leaves
-- it untouched - a conflicting pre-existing row should be reviewed manually
-- during release rather than silently rewritten. The normalized-name check
-- (LOWER + TRIM) also blocks near-duplicates like " marketing " regardless of
-- the table's collation.
--
-- expense_type is set to 'Daily' because this head is for daily cash expense
-- entry; the column is currently informational only (no code path filters on
-- it). is_raw_material_category stays 0 - marketing spend never needs the
-- raw-material/qty picker or creates a purchase record on approval.
--
-- Req #26 (marketing subcategories) is handled separately - no parent_id or
-- subcategory structure is added here; this row is simply the parent anchor.

INSERT INTO expense_heads (expense_name, expense_type, is_active, is_raw_material_category)
SELECT 'Marketing', 'Daily', 1, 0
WHERE NOT EXISTS (
  SELECT 1 FROM expense_heads WHERE LOWER(TRIM(expense_name)) = 'marketing'
);
