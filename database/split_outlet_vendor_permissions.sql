-- ============================================================================
-- Split the overly broad `outlet_vendors` module key into three granular keys:
--
--   outlet_vendor_master      -> Outlet Vendor Master (vendor CRUD)
--   vendor_purchases          -> Vendor Purchases (purchase entry/list/delete)
--   vendor_ledger_payments    -> Vendor Ledger & Payments (ledger, outstanding,
--                                opening balances, payment workflow)
--
-- THIS ADDITIVE PERMISSION MIGRATION MUST RUN **BEFORE** DEPLOYING/RESTARTING
-- THE BACKEND CODE THAT CHECKS THE NEW KEYS:
--
--   outlet_vendor_master
--   vendor_purchases
--   vendor_ledger_payments
--
-- Reason: checkPermission() reads role_permissions rows directly - there is no
-- default-matrix fallback at request time. Without these rows the new vendor
-- endpoints return 403 even for roles that should have access.
--
-- Safe to re-run: inserts are idempotent and never overwrite action
-- columns on rows that already exist.
--
-- Safety properties:
--   * No USE statement - run inside the target schema.
--   * No DELETE / DROP / TRUNCATE. Legacy `outlet_vendors` rows are preserved
--     untouched for rollback/compatibility.
--   * No hardcoded role_id values - everything is derived by role_name, same
--     pattern as add_outlet_vendors_module.sql / role_permissions_migration.sql.
--   * ON DUPLICATE KEY UPDATE touches ONLY module_name, so intentional Role
--     Access edits made to the new keys are never overwritten.
--   * Roles without a legacy `outlet_vendors` row get explicit per-role
--     defaults matching buildDefaultPermissionMatrix() - Outlet Staff gets
--     vendor_purchases view+create (its approved new grant), not a clone of
--     its zero legacy row.
--
-- Value sources per new key:
--   * Default for every role          -> copy the role's legacy outlet_vendors
--                                        values (preserves live behaviour).
--   * 'Outlet Staff'                  -> approved policy override (see CASEs).
--   * 'Franchise'                     -> master: zero; purchases: maker;
--                                        ledger: view+export only.
--   * 'Franchise Owner'               -> view+export on all three.
--   * 'Viewer' / 'Viewer Auditor' /   -> view+export, is_read_only=1 where a
--     'Viewer / Auditor'                legacy row is absent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. outlet_vendor_master
--    Default = clone legacy row. Overrides: Outlet Staff & Franchise -> zero;
--    Franchise Owner / Viewer variants without a legacy row -> view+export.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT
    r.id,
    'outlet_vendor_master' AS module_key,
    'Outlet Vendor Master' AS module_name,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_view
      WHEN r.role_name IN ('Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 1
      ELSE 0
    END AS can_view,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_create
      ELSE 0
    END AS can_create,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_edit
      ELSE 0
    END AS can_edit,
    CASE
      WHEN ov.role_id IS NOT NULL AND r.role_name NOT IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN ov.can_delete
      ELSE 0
    END AS can_delete,
    CASE
      WHEN ov.role_id IS NOT NULL AND r.role_name NOT IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN ov.can_upload
      ELSE 0
    END AS can_upload,
    0 AS can_submit,
    0 AS can_verify,
    0 AS can_approve,
    0 AS can_reject,
    0 AS can_lock,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_export
      WHEN r.role_name IN ('Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 1
      ELSE 0
    END AS can_export,
    CASE
      WHEN ov.role_id IS NOT NULL THEN ov.is_read_only
      WHEN r.role_name IN ('Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 1
      ELSE 0
    END AS is_read_only
  FROM roles r
  LEFT JOIN role_permissions ov
    ON ov.role_id = r.id AND ov.module_key = 'outlet_vendors'
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name);

-- ---------------------------------------------------------------------------
-- 2. vendor_purchases
--    Default = clone legacy row. Overrides:
--      Outlet Staff    -> view+create ONLY (no delete: purchase deletion has
--                         no payment linkage guard).
--      Franchise       -> maker set: view/create/submit/export.
--      Franchise Owner -> view+export.
--      Viewer variants -> view+export, read-only.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT
    r.id,
    'vendor_purchases' AS module_key,
    'Vendor Purchases' AS module_name,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 1
      WHEN ov.role_id IS NOT NULL THEN ov.can_view
      ELSE 0
    END AS can_view,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise') THEN 1
      WHEN r.role_name IN ('Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_create
      ELSE 0
    END AS can_create,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_edit
      ELSE 0
    END AS can_edit,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_delete
      ELSE 0
    END AS can_delete,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_upload
      ELSE 0
    END AS can_upload,
    CASE
      WHEN r.role_name = 'Franchise' THEN 1
      WHEN r.role_name IN ('Outlet Staff', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_submit
      ELSE 0
    END AS can_submit,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_verify
      ELSE 0
    END AS can_verify,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_approve
      ELSE 0
    END AS can_approve,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_reject
      ELSE 0
    END AS can_reject,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_lock
      ELSE 0
    END AS can_lock,
    CASE
      WHEN r.role_name = 'Outlet Staff' THEN 0
      WHEN r.role_name IN ('Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 1
      WHEN ov.role_id IS NOT NULL THEN ov.can_export
      ELSE 0
    END AS can_export,
    CASE
      WHEN ov.role_id IS NOT NULL THEN ov.is_read_only
      WHEN r.role_name IN ('Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 1
      ELSE 0
    END AS is_read_only
  FROM roles r
  LEFT JOIN role_permissions ov
    ON ov.role_id = r.id AND ov.module_key = 'outlet_vendors'
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name);

-- ---------------------------------------------------------------------------
-- 3. vendor_ledger_payments
--    Default = clone legacy row. Overrides:
--      Outlet Staff    -> ALL ZERO (no money movement).
--      Franchise       -> view+export only (no payment create/submit/verify).
--      Franchise Owner -> view+export.
--      Viewer variants -> view+export, read-only.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT
    r.id,
    'vendor_ledger_payments' AS module_key,
    'Vendor Ledger & Payments' AS module_name,
    CASE
      WHEN r.role_name = 'Outlet Staff' THEN 0
      WHEN r.role_name IN ('Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 1
      WHEN ov.role_id IS NOT NULL THEN ov.can_view
      ELSE 0
    END AS can_view,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_create
      ELSE 0
    END AS can_create,
    CASE
      WHEN r.role_name IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 0
      WHEN ov.role_id IS NOT NULL THEN ov.can_edit
      ELSE 0
    END AS can_edit,
    CASE
      WHEN ov.role_id IS NOT NULL AND r.role_name NOT IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN ov.can_delete
      ELSE 0
    END AS can_delete,
    CASE
      WHEN ov.role_id IS NOT NULL AND r.role_name NOT IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN ov.can_upload
      ELSE 0
    END AS can_upload,
    CASE
      WHEN ov.role_id IS NOT NULL AND r.role_name NOT IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN ov.can_submit
      ELSE 0
    END AS can_submit,
    CASE
      WHEN ov.role_id IS NOT NULL AND r.role_name NOT IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN ov.can_verify
      ELSE 0
    END AS can_verify,
    CASE
      WHEN ov.role_id IS NOT NULL AND r.role_name NOT IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN ov.can_approve
      ELSE 0
    END AS can_approve,
    CASE
      WHEN ov.role_id IS NOT NULL AND r.role_name NOT IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN ov.can_reject
      ELSE 0
    END AS can_reject,
    CASE
      WHEN ov.role_id IS NOT NULL AND r.role_name NOT IN ('Outlet Staff', 'Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN ov.can_lock
      ELSE 0
    END AS can_lock,
    CASE
      WHEN r.role_name = 'Outlet Staff' THEN 0
      WHEN r.role_name IN ('Franchise', 'Franchise Owner', 'Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 1
      WHEN ov.role_id IS NOT NULL THEN ov.can_export
      ELSE 0
    END AS can_export,
    CASE
      WHEN ov.role_id IS NOT NULL THEN ov.is_read_only
      WHEN r.role_name IN ('Viewer', 'Viewer Auditor', 'Viewer / Auditor') THEN 1
      ELSE 0
    END AS is_read_only
  FROM roles r
  LEFT JOIN role_permissions ov
    ON ov.role_id = r.id AND ov.module_key = 'outlet_vendors'
) src
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name);

-- ============================================================================
-- Post-run verification (manual):
--   SELECT r.role_name, rp.module_key, rp.can_view, rp.can_create, rp.can_edit,
--          rp.can_delete, rp.can_submit, rp.can_verify, rp.can_approve,
--          rp.can_reject, rp.can_lock, rp.can_export, rp.is_read_only
--   FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
--   WHERE rp.module_key IN
--     ('outlet_vendor_master', 'vendor_purchases', 'vendor_ledger_payments')
--   ORDER BY r.role_name, rp.module_key;
--
-- Rollback: revert the deployed code only. The legacy `outlet_vendors` rows
-- were never touched, and these three new-key rows can simply be deleted if
-- ever required - nothing else references them.
-- ============================================================================
