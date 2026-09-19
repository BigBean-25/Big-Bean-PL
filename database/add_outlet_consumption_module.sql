-- Phase 6A7: Outlet Consumption module.
--
-- Introduces an explicit, controlled physical-consumption document for outlet
-- locations. Until now there was no normal outlet sales-consumption
-- transaction type in stock_ledger, so the hybrid COGS diagnostic could only
-- ever report physical_consumption_model = 'INCOMPLETE'. This document closes
-- that gap the same controlled way every other physical document in this
-- system works: Draft -> Submitted -> Verified -> Approved -> Posted -> Locked,
-- maker-checker enforced, and ONLY the Post step writes stock_ledger rows
-- (transaction_type = 'OUTLET_CONSUMPTION').
--
-- Theoretical sales (Verified Item Sales + recipes) may PRE-FILL a Draft via
-- source_type = 'ITEM_SALES_THEORETICAL' - it never posts automatically.
-- 'PETPOOJA_THEORETICAL' is reserved in the enum but not implemented: there is
-- no deterministic petpooja_item_sales -> menu_items -> recipe linkage (the
-- upload stores free-text item_name only).
--
-- No accounting effect: posting touches the physical stock ledger only. It
-- never writes P&L, supplier ledgers, accounting_effects, or stock uploads.
--
-- Run once against each live database (registered in database/migrate.mjs).

CREATE TABLE IF NOT EXISTS outlet_consumptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  consumption_no VARCHAR(50) NOT NULL,
  outlet_id INT NOT NULL,
  location_id INT NOT NULL,
  consumption_date DATE NOT NULL,
  source_type ENUM('MANUAL','ITEM_SALES_THEORETICAL','PETPOOJA_THEORETICAL') NOT NULL DEFAULT 'MANUAL',
  source_reference_id INT DEFAULT NULL,
  source_period_month INT DEFAULT NULL,
  source_period_year INT DEFAULT NULL,
  status ENUM('Draft','Submitted','Verified','Approved','Posted','Locked') NOT NULL DEFAULT 'Draft',
  total_qty DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  total_value DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  remarks TEXT,
  created_by INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  submitted_by INT,
  submitted_at DATETIME,
  verified_by INT,
  verified_at DATETIME,
  approved_by INT,
  approved_at DATETIME,
  posted_by INT,
  posted_at DATETIME,
  locked_by INT,
  locked_at DATETIME,
  UNIQUE KEY uq_outlet_consumptions_no (consumption_no),
  -- DB-level "no double consumption" guard for source-linked documents: one
  -- theoretical document per outlet + source type + source period. NULL source
  -- periods (MANUAL documents) never collide in a MySQL unique index, so
  -- manual records stay independently auditable.
  UNIQUE KEY uq_outlet_consumption_source (outlet_id, source_type, source_period_month, source_period_year),
  INDEX idx_outlet_consumption_loc (location_id, consumption_date),
  INDEX idx_outlet_consumption_outlet (outlet_id, consumption_date),
  CONSTRAINT fk_oc_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_oc_location FOREIGN KEY (location_id) REFERENCES locations(id),
  CONSTRAINT fk_oc_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outlet_consumption_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  consumption_id INT NOT NULL,
  raw_material_id INT NOT NULL,
  qty DECIMAL(14,4) NOT NULL,
  unit_id INT NOT NULL,
  base_qty DECIMAL(14,4) DEFAULT NULL,
  base_unit_id INT DEFAULT NULL,
  unit_cost DECIMAL(14,6) DEFAULT NULL,
  consumption_value DECIMAL(14,4) DEFAULT NULL,
  source_menu_item_id INT DEFAULT NULL,
  theoretical_qty DECIMAL(14,4) DEFAULT NULL,
  variance_qty DECIMAL(14,4) DEFAULT NULL,
  ledger_posted TINYINT(1) NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_oci_consumption (consumption_id),
  CONSTRAINT fk_oci_consumption FOREIGN KEY (consumption_id) REFERENCES outlet_consumptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_oci_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
  CONSTRAINT fk_oci_unit FOREIGN KEY (unit_id) REFERENCES units(id),
  CONSTRAINT fk_oci_base_unit FOREIGN KEY (base_unit_id) REFERENCES units(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed role_permissions for the new 'outlet_consumption' module key so existing
-- roles aren't locked out (checkPermission requires an actual row - it does
-- not fall back to buildDefaultPermissionMatrix()'s in-memory default).
--
-- Dynamic-by-role-name pattern (same approach as role_permissions_migration.sql
-- and add_outlet_vendors_module.sql): numeric role IDs vary per database, so
-- this selects r.id and branches on r.role_name.
--
-- The CASE values mirror buildDefaultPermissionMatrix() for the
-- 'outlet_consumption' module key exactly:
--   Super Admin / Admin / Developer  -> full workflow
--   Warehouse Admin                  -> full workflow (physical-inventory doc
--                                       owner, same grant shape as the rest of
--                                       WAREHOUSE_WORKFLOW_MODULES)
--   Outlet Admin / Outlet Manager    -> maker side only (create/edit/delete/
--                                       submit) - mirrors their
--                                       warehouse_requisitions grant; they
--                                       never hold checker actions
--   Accountant / Technical Admin     -> view (+edit for Technical Admin,
--                                       matching its blanket) + export
--   Viewer                           -> view + export, is_read_only
--   Central Kitchen Admin / Outlet Staff / unknown -> no grant
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT
    r.id,
    'outlet_consumption' AS module_key,
    'Outlet Consumption' AS module_name,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin','Accountant','Technical Admin','Outlet Manager','Outlet Admin')
           OR r.role_name IN ('Viewer','Viewer Auditor','Viewer / Auditor') THEN 1 ELSE 0 END AS can_view,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin','Outlet Manager','Outlet Admin') THEN 1 ELSE 0 END AS can_create,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin','Technical Admin','Outlet Manager','Outlet Admin') THEN 1 ELSE 0 END AS can_edit,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin','Outlet Manager','Outlet Admin') THEN 1 ELSE 0 END AS can_delete,
    0 AS can_upload,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin','Outlet Manager','Outlet Admin') THEN 1 ELSE 0 END AS can_submit,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin') THEN 1 ELSE 0 END AS can_verify,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin') THEN 1 ELSE 0 END AS can_approve,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin') THEN 1 ELSE 0 END AS can_reject,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin') THEN 1 ELSE 0 END AS can_lock,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Warehouse Admin','Accountant','Technical Admin','Outlet Manager','Outlet Admin')
           OR r.role_name IN ('Viewer','Viewer Auditor','Viewer / Auditor') THEN 1 ELSE 0 END AS can_export,
    CASE WHEN r.role_name IN ('Viewer','Viewer Auditor','Viewer / Auditor') THEN 1 ELSE 0 END AS is_read_only
  FROM roles r
) src
ON DUPLICATE KEY UPDATE
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
