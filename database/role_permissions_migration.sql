USE `bigbeancafe_db`;

CREATE TABLE IF NOT EXISTS role_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL,
  module_key VARCHAR(100) NOT NULL,
  module_name VARCHAR(150) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  can_upload TINYINT(1) NOT NULL DEFAULT 0,
  can_submit TINYINT(1) NOT NULL DEFAULT 0,
  can_verify TINYINT(1) NOT NULL DEFAULT 0,
  can_approve TINYINT(1) NOT NULL DEFAULT 0,
  can_reject TINYINT(1) NOT NULL DEFAULT 0,
  can_lock TINYINT(1) NOT NULL DEFAULT 0,
  can_export TINYINT(1) NOT NULL DEFAULT 0,
  is_read_only TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_permissions_role_module (role_id, module_key),
  INDEX idx_role_permissions_role (role_id),
  INDEX idx_role_permissions_module (module_key),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- The SELECT is wrapped in a derived table (`src`) before ON DUPLICATE KEY
-- UPDATE: MariaDB's parser cannot disambiguate a bare `CROSS JOIN (...) m`
-- immediately followed by `ON DUPLICATE KEY UPDATE` (it tries to read
-- "ON DUPLICATE" as a join condition) — wrapping in a derived table removes
-- the ambiguity.
INSERT INTO role_permissions (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
SELECT * FROM (
  SELECT r.id, m.module_key, m.module_name,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 WHEN m.module_key = 'dashboard' THEN 1 ELSE 0 END as can_view,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_create,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_edit,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_delete,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_upload,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_submit,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_verify,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_approve,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_reject,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_lock,
    CASE WHEN r.role_name IN ('Super Admin','Admin','Developer') THEN 1 ELSE 0 END as can_export,
    0 as is_read_only
  FROM roles r
  CROSS JOIN (
    SELECT 'dashboard' module_key, 'Dashboard' module_name UNION ALL
    SELECT 'users', 'Users' UNION ALL
    SELECT 'roles', 'Roles' UNION ALL
    SELECT 'role_access', 'Role Access' UNION ALL
    SELECT 'outlets', 'Outlets' UNION ALL
    SELECT 'masters', 'Masters' UNION ALL
    SELECT 'categories', 'Categories' UNION ALL
    SELECT 'suppliers', 'Suppliers' UNION ALL
    SELECT 'raw_materials', 'Raw Materials' UNION ALL
    SELECT 'menu_items', 'Menu Items' UNION ALL
    SELECT 'daily_cashbook', 'Daily Cashbook' UNION ALL
    SELECT 'daily_expenses', 'Daily Expenses' UNION ALL
    SELECT 'day_closing', 'Day Closing' UNION ALL
    SELECT 'daily_checklist', 'Daily Checklist' UNION ALL
    SELECT 'bank_deposits', 'Bank Deposits' UNION ALL
    SELECT 'opening_stock', 'Opening Stock' UNION ALL
    SELECT 'closing_stock', 'Closing Stock' UNION ALL
    SELECT 'material_purchase', 'Material Purchase' UNION ALL
    SELECT 'supplier_payments', 'Supplier Payments' UNION ALL
    SELECT 'item_sales', 'Item-wise Sales' UNION ALL
    SELECT 'item_sales_daily', 'Daily Sales Upload' UNION ALL
    SELECT 'item_sales_monthly', 'Monthly Sales Upload' UNION ALL
    SELECT 'payroll', 'Payroll' UNION ALL
    SELECT 'utility_bills', 'Utility Bills' UNION ALL
    SELECT 'online_payouts', 'Online Payouts' UNION ALL
    SELECT 'dine_in_payouts', 'Dine-in Payouts' UNION ALL
    SELECT 'recipe_list', 'Recipe List' UNION ALL
    SELECT 'add_recipe', 'Add Recipe' UNION ALL
    SELECT 'reports', 'Reports' UNION ALL
    SELECT 'monthly_pl', 'Monthly P&L'
  ) m
) src
ON DUPLICATE KEY UPDATE module_name = VALUES(module_name);

UPDATE role_permissions rp
JOIN roles r ON r.id = rp.role_id
SET rp.can_view = 1,
    rp.can_create = 1,
    rp.can_edit = 1,
    rp.can_delete = 1,
    rp.can_upload = 1,
    rp.can_submit = 1,
    rp.can_verify = 1,
    rp.can_approve = 1,
    rp.can_reject = 1,
    rp.can_lock = 1,
    rp.can_export = 1,
    rp.is_read_only = 0
WHERE r.role_name IN ('Super Admin','Admin','Developer');

UPDATE role_permissions rp
JOIN roles r ON r.id = rp.role_id
SET rp.can_view = 1, rp.can_export = 1, rp.is_read_only = 1
WHERE r.role_name = 'Viewer'
  AND rp.module_key NOT IN ('users','roles','role_access','add_recipe');

-- Outlet Admin: full day-to-day entry rights on outlet-level modules, view+export
-- elsewhere. Matches backend/src/utils/rolePermissionModules.js's
-- buildDefaultPermissionMatrix('Outlet Admin') branch.
UPDATE role_permissions rp
JOIN roles r ON r.id = rp.role_id
SET rp.can_view = 1, rp.can_create = 1, rp.can_edit = 1, rp.can_submit = 1
WHERE r.role_name = 'Outlet Admin'
  AND rp.module_key IN ('dashboard','daily_cashbook','daily_expenses','day_closing','daily_checklist','bank_deposits');

UPDATE role_permissions rp
JOIN roles r ON r.id = rp.role_id
SET rp.can_view = 1, rp.can_export = 1
WHERE r.role_name = 'Outlet Admin'
  AND rp.module_key IN ('opening_stock','closing_stock','material_purchase','item_sales','payroll','utility_bills','reports');

-- Outlet Admin ("store manager"): can upload day-wise PetPooja sales for their
-- own outlet. Month-wise uploads (item_sales_monthly) are deliberately NOT
-- granted here — that's the warehouse/Admin team's job, and Admin already gets
-- full access to every module via the Super Admin/Admin/Developer block above.
UPDATE role_permissions rp
JOIN roles r ON r.id = rp.role_id
SET rp.can_view = 1, rp.can_upload = 1
WHERE r.role_name = 'Outlet Admin'
  AND rp.module_key = 'item_sales_daily';

-- Outlet Staff: limited to daily expense entry + upload, per
-- buildDefaultPermissionMatrix('Outlet Staff').
UPDATE role_permissions rp
JOIN roles r ON r.id = rp.role_id
SET rp.can_view = 1
WHERE r.role_name = 'Outlet Staff'
  AND rp.module_key = 'dashboard';

UPDATE role_permissions rp
JOIN roles r ON r.id = rp.role_id
SET rp.can_view = 1, rp.can_create = 1, rp.can_upload = 1
WHERE r.role_name = 'Outlet Staff'
  AND rp.module_key = 'daily_expenses';
