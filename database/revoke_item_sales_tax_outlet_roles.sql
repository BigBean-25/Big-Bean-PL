-- Phase 7C1: revoke item_sales_tax access for outlet-side roles.
--
-- The module's seed migration (add_petpooja_item_tax_report.sql) wrote an
-- explicit can_view=1 row for Outlet Manager/Outlet Admin, and backend
-- checkPermission() reads ONLY the saved role_permissions row - so removing
-- the JS default alone would leave deployed databases still granting access.
-- This UPDATE zeroes every action column on existing item_sales_tax rows for
-- the locked-outlet roles only. It is intentionally revoking: a previously
-- stored grant for these roles is not preserved.
--
-- Idempotent: pure UPDATE over existing rows - a missing role, a missing
-- row, or an already-zero row simply matches nothing / writes the same
-- zeros. No rows are INSERTed: backend checkPermission() already denies
-- when no row exists, and Role Access can still explicitly re-grant later
-- (no structural deny, by design).
UPDATE role_permissions rp
JOIN roles r ON r.id = rp.role_id
SET
  rp.can_view = 0,
  rp.can_create = 0,
  rp.can_edit = 0,
  rp.can_delete = 0,
  rp.can_upload = 0,
  rp.can_submit = 0,
  rp.can_verify = 0,
  rp.can_approve = 0,
  rp.can_reject = 0,
  rp.can_lock = 0,
  rp.can_export = 0,
  rp.is_read_only = 0
WHERE rp.module_key = 'item_sales_tax'
  AND r.role_name IN ('Outlet Admin', 'Outlet Manager', 'Outlet Staff', 'Franchise', 'Franchise Owner');
