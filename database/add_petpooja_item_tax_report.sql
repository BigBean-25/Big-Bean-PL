-- Adds a new supplementary upload: PetPooja's "Item Wise Tax Report" export,
-- which carries the REAL per-item CGST/SGST split (not a guessed 50/50 split)
-- and the real tax rate PetPooja applied to each item. GSTR-1 uses this data
-- when it's available for an outlet+period instead of estimating from the
-- Outlet-Item Wise Report's combined Tax column + a name-matched menu item
-- rate. New tables only - nothing existing is touched. Run once against
-- bigbeancafe.org's database.

CREATE TABLE IF NOT EXISTS petpooja_item_tax_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_number VARCHAR(50) NOT NULL UNIQUE,
  outlet_id INT NOT NULL,
  upload_date_from DATE NOT NULL,
  upload_date_to DATE NOT NULL,
  file_name VARCHAR(255),
  file_path VARCHAR(500),
  total_items INT DEFAULT 0,
  total_net_amount DECIMAL(14,2) DEFAULT 0,
  total_cgst DECIMAL(14,2) DEFAULT 0,
  total_sgst DECIMAL(14,2) DEFAULT 0,
  total_tax DECIMAL(14,2) DEFAULT 0,
  total_amount DECIMAL(14,2) DEFAULT 0,
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_item_tax_upload_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_item_tax_upload_user FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_item_tax_upload_outlet_range (outlet_id, upload_date_from, upload_date_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS petpooja_item_tax_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  upload_id INT NOT NULL,
  outlet_id INT NOT NULL,
  category VARCHAR(150),
  item_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(12,2) DEFAULT 0,
  net_amount DECIMAL(14,2) DEFAULT 0,
  disc_qty DECIMAL(12,2) DEFAULT 0,
  total_discount DECIMAL(14,2) DEFAULT 0,
  cgst DECIMAL(14,2) DEFAULT 0,
  sgst DECIMAL(14,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  total_tax DECIMAL(14,2) DEFAULT 0,
  total_amount DECIMAL(14,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_item_tax_item_upload FOREIGN KEY (upload_id) REFERENCES petpooja_item_tax_uploads(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_tax_item_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  INDEX idx_item_tax_item_upload (upload_id),
  INDEX idx_item_tax_item_name (item_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- role_permissions seed for the new 'item_sales_tax' module key.
--
-- Dynamic-by-role-name pattern (same approach as role_permissions_migration.sql
-- and the fixed-up add_outlet_vendors_module.sql) instead of hardcoded
-- role_id values: numeric role IDs are assigned by auto-increment and vary
-- per database, so a hand-guessed ID list from one database's state breaks
-- on any other database where role IDs don't line up the same way. Selecting
-- `r.id FROM roles r` and branching on `r.role_name` instead makes this
-- insert work correctly no matter what numeric IDs a given database actually
-- assigned to each role. The CASE values below mirror
-- backend/src/utils/rolePermissionModules.js's buildDefaultPermissionMatrix()
-- for the 'item_sales_tax' module key exactly: any role name not explicitly
-- listed here falls through to all-zero, matching that function's
-- "unrecognized role" default for this module too.
--
-- The SELECT is wrapped in a derived table (`src`) before ON DUPLICATE KEY
-- UPDATE: MariaDB's parser cannot disambiguate a bare `FROM roles r`
-- immediately followed by `ON DUPLICATE KEY UPDATE` (it tries to read
-- "ON DUPLICATE" as a join condition on `r`) — wrapping in a derived table
-- removes the ambiguity, same as role_permissions_migration.sql.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT
    r.id,
    'item_sales_tax' AS module_key,
    'Item Tax Report' AS module_name,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin','Outlet Manager','Outlet Admin')
           OR r.role_name IN ('Viewer','Viewer Auditor','Viewer / Auditor') THEN 1 ELSE 0 END AS can_view,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant') THEN 1 ELSE 0 END AS can_create,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Technical Admin') THEN 1 ELSE 0 END AS can_edit,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant') THEN 1 ELSE 0 END AS can_delete,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant') THEN 1 ELSE 0 END AS can_upload,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_submit,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_verify,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_approve,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_reject,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_lock,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin')
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
