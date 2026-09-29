-- ============================================================================
-- database/sync_role_permissions_role_alignment.sql
--
-- Synchronizes SAVED role_permissions rows with the FINAL APPROVED
-- buildDefaultPermissionMatrix() presets defined in:
--   backend/src/utils/rolePermissionModules.js   (source HEAD 75d93ba8)
--
-- This file was GENERATED from that module - every role/module/action value
-- below is the literal output of the code matrix, not a hand-derived copy.
--
-- WHY THIS EXISTS: checkPermission() reads role_permissions rows directly;
-- the code preset only feeds the login payload merge (matrixToRows). Saved
-- rows predate the approved hardening (Head Office Admin restrictions,
-- Developer/Technical Admin view-export-only, outlet receive keys, vendor
-- split) - this file makes the database agree with the code.
--
-- RELEASE ORDER (safe intended order):
--   1.  TAKE PRODUCTION DB BACKUP
--   2.  VERIFY TARGET SCHEMA (SELECT DATABASE();)
--   3.  VERIFY roles / role_permissions structure (columns + UNIQUE(role_id,
--       module_key) must match Section C of the source audit)
--   4.  VERIFY older prerequisite schema migrations are applied (see notes at
--       bottom of this header)
--   5.  RUN split_outlet_vendor_permissions.sql
--   6.  VERIFY the three vendor keys exist per role
--   7.  RUN add_stock_transfer_receipt_history.sql
--   8.  VERIFY receipt-history tables/indexes/FKs
--   9.  RUN THIS FILE
--   10. VERIFY saved role matrices (commented queries at the bottom)
--   11. DEPLOY BACKEND + FRONTEND matching this source
--   12. RESTART NODE APP
--   13. RUN HEALTH / PERMISSION / RECEIVING SMOKE TESTS
--
-- SAFETY PROPERTIES:
--   * No USE statement - run inside the target schema.
--   * No DROP / TRUNCATE / DELETE - nothing is removed.
--   * No hardcoded numeric role IDs - role_id resolved via roles.role_name.
--   * Roles are never created: the JOIN to roles means an absent role_name
--     (e.g. a missing 'Bakehouse Admin' or 'Viewer Auditor' alias row) is
--     skipped safely.
--   * Only the 15 approved role names are touched; custom/unknown roles keep
--     their saved rows untouched.
--   * Only module_keys in the current ROLE_PERMISSION_MODULES list (63
--     modules) are written; obsolete saved rows are preserved (report query
--     at the bottom).
--   * Idempotent: INSERT ... SELECT ... ON DUPLICATE KEY UPDATE rewrites the
--     same deterministic values on re-run.
--   * MariaDB: the SELECT is wrapped in a derived table before
--     ON DUPLICATE KEY UPDATE (same parser workaround as
--     role_permissions_migration.sql / split_outlet_vendor_permissions.sql).
--
-- EXPECTED ROW COUNTS: 63 modules per existing synced role.
--   Maximum touched rows = 63 x (number of the 15 approved role
--   names present in roles). Aliases that do not exist contribute 0.
-- ============================================================================

-- ============================================================================
-- Super Admin - full platform control (unrestricted)
-- Source: buildDefaultPermissionMatrix('Super Admin') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 1 can_create, 1 can_edit, 1 can_delete, 1 can_upload, 1 can_submit, 1 can_verify, 1 can_approve, 1 can_reject, 1 can_lock, 1 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'roles', 'Roles', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'masters', 'Masters', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'categories', 'Categories', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'reports', 'Reports', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'grn', 'GRN', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
  ) v
  WHERE r.role_name IN ('Super Admin')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Admin - "Head Office Admin" (hardened: users.can_delete=0, roles.can_edit/delete=0, role_access dead actions=0)
-- Source: buildDefaultPermissionMatrix('Admin') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 1 can_create, 1 can_edit, 1 can_delete, 1 can_upload, 1 can_submit, 1 can_verify, 1 can_approve, 1 can_reject, 1 can_lock, 1 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'roles', 'Roles', 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'masters', 'Masters', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'categories', 'Categories', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'reports', 'Reports', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'grn', 'GRN', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
  ) v
  WHERE r.role_name IN ('Admin')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Developer + Technical Admin - view/export diagnostics only (display label "Technical Support")
-- Source: buildDefaultPermissionMatrix('Developer') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 0 can_create, 0 can_edit, 0 can_delete, 0 can_upload, 0 can_submit, 0 can_verify, 0 can_approve, 0 can_reject, 0 can_lock, 1 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'roles', 'Roles', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'masters', 'Masters', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'categories', 'Categories', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'reports', 'Reports', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'grn', 'GRN', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
  ) v
  WHERE r.role_name IN ('Developer', 'Technical Admin')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Warehouse Admin - "Warehouse Manager" (full warehouse workflow)
-- Source: buildDefaultPermissionMatrix('Warehouse Admin') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 0 can_create, 0 can_edit, 0 can_delete, 0 can_upload, 0 can_submit, 0 can_verify, 0 can_approve, 0 can_reject, 0 can_lock, 0 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'roles', 'Roles', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'masters', 'Masters', 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'categories', 'Categories', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'reports', 'Reports', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0
    UNION ALL
    SELECT 'grn', 'GRN', 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  ) v
  WHERE r.role_name IN ('Warehouse Admin')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Accountant - finance checker / month-end
-- Source: buildDefaultPermissionMatrix('Accountant') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 0 can_create, 0 can_edit, 0 can_delete, 0 can_upload, 0 can_submit, 0 can_verify, 0 can_approve, 0 can_reject, 0 can_lock, 0 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'roles', 'Roles', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'masters', 'Masters', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'categories', 'Categories', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'reports', 'Reports', 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'grn', 'GRN', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  ) v
  WHERE r.role_name IN ('Accountant')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Central Kitchen Admin + Bakehouse Admin - "Bakehouse Manager" (same preset; alias skipped safely if absent)
-- Source: buildDefaultPermissionMatrix('Central Kitchen Admin') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 0 can_create, 0 can_edit, 0 can_delete, 0 can_upload, 0 can_submit, 0 can_verify, 0 can_approve, 0 can_reject, 0 can_lock, 0 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'roles', 'Roles', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'masters', 'Masters', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'categories', 'Categories', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'reports', 'Reports', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'grn', 'GRN', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0
  ) v
  WHERE r.role_name IN ('Central Kitchen Admin', 'Bakehouse Admin')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Outlet Admin - "Outlet Manager" (maker + receive-only dispatch; alias Outlet Manager synced if such a row exists)
-- Source: buildDefaultPermissionMatrix('Outlet Admin') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 1 can_create, 1 can_edit, 0 can_delete, 0 can_upload, 1 can_submit, 0 can_verify, 0 can_approve, 0 can_reject, 0 can_lock, 0 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'roles', 'Roles', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'masters', 'Masters', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'categories', 'Categories', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'reports', 'Reports', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'grn', 'GRN', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0
  ) v
  WHERE r.role_name IN ('Outlet Admin', 'Outlet Manager')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Outlet Staff - maker-only + receive keys
-- Source: buildDefaultPermissionMatrix('Outlet Staff') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 0 can_create, 0 can_edit, 0 can_delete, 0 can_upload, 0 can_submit, 0 can_verify, 0 can_approve, 0 can_reject, 0 can_lock, 0 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'roles', 'Roles', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'masters', 'Masters', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'categories', 'Categories', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'reports', 'Reports', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'grn', 'GRN', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0
  ) v
  WHERE r.role_name IN ('Outlet Staff')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Franchise - maker-style, outlet-scoped
-- Source: buildDefaultPermissionMatrix('Franchise') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 0 can_create, 0 can_edit, 0 can_delete, 0 can_upload, 0 can_submit, 0 can_verify, 0 can_approve, 0 can_reject, 0 can_lock, 0 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'roles', 'Roles', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'masters', 'Masters', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'categories', 'Categories', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'reports', 'Reports', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'grn', 'GRN', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
  ) v
  WHERE r.role_name IN ('Franchise')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Franchise Owner - oversight view/export
-- Source: buildDefaultPermissionMatrix('Franchise Owner') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 0 can_create, 0 can_edit, 0 can_delete, 0 can_upload, 0 can_submit, 0 can_verify, 0 can_approve, 0 can_reject, 0 can_lock, 1 can_export, 0 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'roles', 'Roles', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'masters', 'Masters', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'categories', 'Categories', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'payroll', 'Payroll', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'reports', 'Reports', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'grn', 'GRN', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
  ) v
  WHERE r.role_name IN ('Franchise Owner')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- Viewer variants - read/export only, is_read_only=1 (each variant gets its own rows)
-- Source: buildDefaultPermissionMatrix('Viewer') - do not hand-edit values.
-- Existing rows are overwritten to the approved matrix; missing rows are
-- inserted. Only the role names below are touched; the JOIN means an absent
-- role name is skipped safely and no role is ever created here.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, v.module_key, v.module_name, v.can_view, v.can_create, v.can_edit, v.can_delete, v.can_upload, v.can_submit, v.can_verify, v.can_approve, v.can_reject, v.can_lock, v.can_export, v.is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name,
      1 can_view, 0 can_create, 0 can_edit, 0 can_delete, 0 can_upload, 0 can_submit, 0 can_verify, 0 can_approve, 0 can_reject, 0 can_lock, 1 can_export, 1 is_read_only
    UNION ALL
    SELECT 'users', 'Users', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'roles', 'Roles', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'role_access', 'Role Access', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'outlets', 'Outlets', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'masters', 'Masters', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'categories', 'Categories', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'suppliers', 'Suppliers', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'raw_materials', 'Raw Materials', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'menu_items', 'Menu Items', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'day_closing', 'Day Closing', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'opening_stock', 'Opening Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'closing_stock', 'Closing Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'material_purchase', 'Material Purchase', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'outlet_vendors', 'Outlet Vendors', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'outlet_vendor_master', 'Outlet Vendor Master', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'vendor_purchases', 'Vendor Purchases', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'vendor_ledger_payments', 'Vendor Ledger & Payments', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'item_sales', 'Item-wise Sales', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'item_sales_tax', 'Item Tax Report', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'payroll', 'Payroll', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'utility_bills', 'Utility Bills', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'online_payouts', 'Online Payouts', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'recipe_list', 'Recipe List', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'add_recipe', 'Add Recipe', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    UNION ALL
    SELECT 'reports', 'Reports', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'controlled_exceptions', 'Exceptions & Reversals', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'fixed_costs', 'Fixed Costs', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'sales_target', 'Sales Target', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_dashboard', 'Warehouse Dashboard', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_stock', 'Warehouse Current Stock', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_ledger', 'Warehouse Stock Ledger', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'grn', 'GRN', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'locations', 'Inventory Locations', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_requisitions', 'Stock Requisitions', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_transfers', 'Stock Transfers', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'physical_stock_counts', 'Physical Stock Count', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'stock_adjustments', 'Stock Adjustments', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_wastage', 'Warehouse Wastage & Damage', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'outlet_consumption', 'Outlet Consumption', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_batch_expiry', 'Batch & Expiry', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_purchase_returns', 'Purchase Returns', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_purchase_orders', 'Purchase Orders', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_supplier_history', 'Supplier Purchase History', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_reorder', 'Low Stock / Reorder', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_reports', 'Warehouse Reports', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'warehouse_settings', 'Warehouse Settings', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'production_dashboard', 'Bakehouse Dashboard', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'production_requests', 'Production Requests', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'production_planning', 'Production Planning', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'production_batches', 'Production Batches', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'production_wastage', 'Production Wastage', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'production_variance', 'Production Variance', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
    UNION ALL
    SELECT 'production_dispatch', 'Production Dispatch', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1
  ) v
  WHERE r.role_name IN ('Viewer', 'Viewer / Auditor', 'Viewer Auditor')
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  can_view = VALUES(can_view),
  can_create = VALUES(can_create),
  can_edit = VALUES(can_edit),
  can_delete = VALUES(can_delete),
  can_upload = VALUES(can_upload),
  can_submit = VALUES(can_submit),
  can_verify = VALUES(can_verify),
  can_approve = VALUES(can_approve),
  can_reject = VALUES(can_reject),
  can_lock = VALUES(can_lock),
  can_export = VALUES(can_export),
  is_read_only = VALUES(is_read_only);

-- ============================================================================
-- POST-RUN VERIFICATION (commented out - SELECT-only, run manually)
-- ============================================================================
--
-- 1) Per-role matrix dump (swap the role_name):
-- SELECT r.role_name, rp.module_key, rp.can_view, rp.can_create, rp.can_edit,
--        rp.can_delete, rp.can_upload, rp.can_submit, rp.can_verify,
--        rp.can_approve, rp.can_reject, rp.can_lock, rp.can_export, rp.is_read_only
-- FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
-- WHERE r.role_name = 'Super Admin' ORDER BY rp.module_key;
--   Repeat for: 'Admin', 'Developer', 'Technical Admin', 'Outlet Admin',
--   'Outlet Staff', 'Warehouse Admin', 'Accountant', 'Central Kitchen Admin',
--   'Bakehouse Admin', 'Outlet Manager', 'Franchise', 'Franchise Owner',
--   'Viewer', 'Viewer / Auditor', 'Viewer Auditor'.
--
-- 2) Row count per synced role (expect 63 per existing role):
-- SELECT r.role_name, COUNT(*) AS rows_per_role
-- FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
-- WHERE r.role_name IN ('Super Admin','Admin','Developer','Technical Admin',
--   'Outlet Admin','Outlet Manager','Outlet Staff','Warehouse Admin',
--   'Accountant','Central Kitchen Admin','Bakehouse Admin','Franchise',
--   'Franchise Owner','Viewer','Viewer / Auditor','Viewer Auditor')
-- GROUP BY r.role_name ORDER BY r.role_name;
--
-- 3) New vendor keys across every synced role (expect per role:
--    Admin=full-ish per matrix, Outlet Admin maker, Outlet Staff purchases-only,
--    Accountant checker, Franchise purchases-maker+ledger-view,
--    Franchise Owner view/export, Viewers read/export):
-- SELECT r.role_name, rp.module_key, rp.can_view, rp.can_create, rp.can_edit,
--        rp.can_delete, rp.can_upload, rp.can_submit, rp.can_verify,
--        rp.can_approve, rp.can_reject, rp.can_lock, rp.can_export, rp.is_read_only
-- FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
-- WHERE rp.module_key IN ('outlet_vendor_master','vendor_purchases','vendor_ledger_payments')
--   AND r.role_name IN ('Super Admin','Admin','Developer','Technical Admin',
--     'Outlet Admin','Outlet Staff','Warehouse Admin','Accountant',
--     'Central Kitchen Admin','Bakehouse Admin','Franchise','Franchise Owner',
--     'Viewer','Viewer / Auditor','Viewer Auditor')
-- ORDER BY r.role_name, rp.module_key;
--
-- 4) Hardcoded invariants:
-- Developer/Technical Admin write check (expect 0 rows):
-- SELECT r.role_name, rp.module_key FROM role_permissions rp
-- JOIN roles r ON r.id = rp.role_id
-- WHERE r.role_name IN ('Developer','Technical Admin')
--   AND (rp.can_create OR rp.can_edit OR rp.can_delete OR rp.can_upload
--        OR rp.can_submit OR rp.can_verify OR rp.can_approve OR rp.can_reject
--        OR rp.can_lock OR rp.is_read_only);
-- Admin user-delete / role-write check (expect 0 rows):
-- SELECT rp.module_key FROM role_permissions rp
-- JOIN roles r ON r.id = rp.role_id
-- WHERE r.role_name = 'Admin'
--   AND ((rp.module_key = 'users' AND rp.can_delete)
--        OR (rp.module_key = 'roles' AND (rp.can_edit OR rp.can_delete)));
-- Viewer write check (expect 0 rows):
-- SELECT r.role_name, rp.module_key FROM role_permissions rp
-- JOIN roles r ON r.id = rp.role_id
-- WHERE r.role_name IN ('Viewer','Viewer / Auditor','Viewer Auditor')
--   AND (rp.can_create OR rp.can_edit OR rp.can_delete OR rp.can_upload
--        OR rp.can_submit OR rp.can_verify OR rp.can_approve OR rp.can_reject
--        OR rp.can_lock);
--
-- 5) Obsolete/orphan module keys report (rows keyed to modules no longer in
--    ROLE_PERMISSION_MODULES - REPORT ONLY, this migration does not delete them):
-- SELECT r.role_name, rp.module_key, COUNT(*) OVER () AS obsolete_row_count
-- FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
-- WHERE rp.module_key NOT IN ('dashboard','users','roles','role_access','outlets','masters','categories','suppliers','raw_materials','menu_items','daily_cashbook','daily_expenses','day_closing','daily_checklist','bank_deposits','opening_stock','closing_stock','material_purchase','supplier_payments','outlet_vendors','outlet_vendor_master','vendor_purchases','vendor_ledger_payments','item_sales','item_sales_daily','item_sales_monthly','item_sales_tax','payroll','utility_bills','online_payouts','dine_in_payouts','recipe_list','add_recipe','reports','controlled_exceptions','monthly_pl','fixed_costs','sales_target','warehouse_dashboard','warehouse_stock','warehouse_ledger','grn','locations','warehouse_requisitions','warehouse_transfers','physical_stock_counts','stock_adjustments','warehouse_wastage','outlet_consumption','warehouse_batch_expiry','warehouse_purchase_returns','warehouse_purchase_orders','warehouse_supplier_history','warehouse_reorder','warehouse_reports','warehouse_settings','production_dashboard','production_requests','production_planning','production_batches','production_wastage','production_variance','production_dispatch')
-- ORDER BY rp.module_key, r.role_name;
--
-- 6) Custom roles untouched check (roles outside the approved list keep their
--    saved rows as-is - compare before/after if needed):
-- SELECT r.role_name FROM roles r
-- WHERE r.role_name NOT IN ('Super Admin','Admin','Developer','Technical Admin',
--   'Outlet Admin','Outlet Manager','Outlet Staff','Warehouse Admin',
--   'Accountant','Central Kitchen Admin','Bakehouse Admin','Franchise',
--   'Franchise Owner','Viewer','Viewer / Auditor','Viewer Auditor');
