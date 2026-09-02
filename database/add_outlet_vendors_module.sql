-- New, standalone Outlet Vendors module - deliberately separate from the
-- warehouse `suppliers` table, for informal/direct outlet purchases (milk,
-- vegetables, chicken, eggs) that don't go through the warehouse GRN/PO
-- pipeline. Also used for emergency/ad-hoc purchases (Zepto, Hyperpure etc.)
-- at the outlet when warehouse stock is temporarily unavailable.
-- Run once against each live database.

CREATE TABLE IF NOT EXISTS outlet_vendors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  vendor_code VARCHAR(30) UNIQUE,
  vendor_name VARCHAR(150) NOT NULL,
  category ENUM('Milk','Vegetables','Chicken & Meat','Eggs','Bakery Supplies','Groceries','Other') NOT NULL DEFAULT 'Other',
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  gstin VARCHAR(20),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS outlet_vendor_purchases (
  id INT PRIMARY KEY AUTO_INCREMENT,
  purchase_no VARCHAR(30) UNIQUE,
  outlet_id INT NOT NULL,
  vendor_id INT NOT NULL,
  purchase_date DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_by ENUM('Outlet','Management') NOT NULL DEFAULT 'Outlet',
  payment_mode_id INT,
  is_emergency TINYINT(1) NOT NULL DEFAULT 0,
  invoice_no VARCHAR(50),
  remarks TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (vendor_id) REFERENCES outlet_vendors(id),
  FOREIGN KEY (payment_mode_id) REFERENCES payment_modes(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_outlet_vendor (outlet_id, vendor_id),
  INDEX idx_purchase_date (purchase_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS outlet_vendor_payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  outlet_id INT NOT NULL,
  vendor_id INT NOT NULL,
  date DATE NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL,
  payment_mode_id INT,
  reference_no VARCHAR(50),
  remarks TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (vendor_id) REFERENCES outlet_vendors(id),
  FOREIGN KEY (payment_mode_id) REFERENCES payment_modes(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_outlet_vendor_pay (outlet_id, vendor_id)
) ENGINE=InnoDB;

-- Seed role_permissions for the new 'outlet_vendors' module key so existing
-- roles aren't locked out (checkPermission requires an actual row - it does
-- not fall back to buildDefaultPermissionMatrix()'s in-memory default).
--
-- Dynamic-by-role-name pattern (same approach as role_permissions_migration.sql)
-- instead of hardcoded role_id values: numeric role IDs are assigned by
-- auto-increment and vary per database, so a hand-guessed ID list from one
-- database's state (e.g. "role_id 4") breaks on any other database where
-- role IDs don't happen to line up the same way. Selecting `r.id FROM roles r`
-- and branching on `r.role_name` instead makes this insert work correctly no
-- matter what numeric IDs a given database actually assigned to each role.
-- The CASE values below mirror backend/src/utils/rolePermissionModules.js's
-- buildDefaultPermissionMatrix() for the 'outlet_vendors' module key exactly:
-- any role name not explicitly listed here falls through to all-zero, which
-- matches that function's "unrecognized role" default for this module too.
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
    'outlet_vendors' AS module_key,
    'Outlet Vendors' AS module_name,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin','Outlet Manager','Outlet Admin')
           OR r.role_name IN ('Viewer','Viewer Auditor','Viewer / Auditor') THEN 1 ELSE 0 END AS can_view,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Outlet Manager','Outlet Admin') THEN 1 ELSE 0 END AS can_create,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin') THEN 1 ELSE 0 END AS can_edit,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_delete,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_upload,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_submit,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_verify,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_approve,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_reject,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END AS can_lock,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer','Accountant','Technical Admin','Outlet Manager','Outlet Admin')
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
