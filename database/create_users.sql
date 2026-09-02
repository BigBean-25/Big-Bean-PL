USE `bigbeancafe_db`;

-- Insert roles.
-- ON DUPLICATE KEY UPDATE set to the same values makes a re-run against a
-- database that already has these rows a safe no-op instead of failing
-- outright on the primary key / unique role_name collision.
INSERT INTO roles (id, role_name, permissions, description, is_active) VALUES
(1, 'Developer', '["all"]', 'Full system access including technical configuration', 1),
(2, 'Super Admin', '["all"]', 'Owner / head office control with full access to all outlets and reports', 1),
(3, 'Admin', '["manage_masters","upload_data","verify_entries","view_reports","export_reports","manage_month_end","approve_sales"]', 'Accountant / admin for uploads, verification, reports and month-end work', 1),
(4, 'Outlet Admin', '["enter_cashbook","enter_expenses","upload_proofs","view_outlet_reports","submit_day_closing"]', 'Outlet manager access for daily entries and outlet-level reports', 1),
(5, 'Outlet Staff', '["enter_expenses","upload_proofs","view_limited"]', 'Limited outlet staff access', 1),
(6, 'Viewer', '["view_reports"]', 'Read-only report viewing access', 1)
ON DUPLICATE KEY UPDATE
  role_name = VALUES(role_name),
  permissions = VALUES(permissions),
  description = VALUES(description),
  is_active = VALUES(is_active);

-- Insert users (password: Admin@123 for all users).
-- ON DUPLICATE KEY UPDATE set to the same values makes a re-run against a
-- database that already has these rows a safe no-op instead of failing
-- outright on the primary key / unique email collision.
INSERT INTO users (id, role_id, full_name, email, password, phone, is_active, created_by) VALUES
(1, 1, 'System Developer', 'developer@bigbean.local', '$2a$10$0zpwesdecFeJH/.qFmw.OOZfKc2gbUbMn4gpBwHpdjyaVUaDC06Ti', '9999999999', 1, NULL),
(2, 2, 'Super Admin', 'superadmin@bigbean.local', '$2a$10$0zpwesdecFeJH/.qFmw.OOZfKc2gbUbMn4gpBwHpdjyaVUaDC06Ti', '9999999998', 1, 1),
(3, 3, 'Admin Accountant', 'admin@bigbean.local', '$2a$10$0zpwesdecFeJH/.qFmw.OOZfKc2gbUbMn4gpBwHpdjyaVUaDC06Ti', '9999999997', 1, 2),
(4, 4, 'Outlet Admin', 'outletadmin@bigbean.local', '$2a$10$0zpwesdecFeJH/.qFmw.OOZfKc2gbUbMn4gpBwHpdjyaVUaDC06Ti', '9999999996', 1, 2),
(5, 5, 'Outlet Staff', 'staff@bigbean.local', '$2a$10$0zpwesdecFeJH/.qFmw.OOZfKc2gbUbMn4gpBwHpdjyaVUaDC06Ti', '9999999995', 1, 4)
ON DUPLICATE KEY UPDATE
  role_id = VALUES(role_id),
  full_name = VALUES(full_name),
  email = VALUES(email),
  password = VALUES(password),
  phone = VALUES(phone),
  is_active = VALUES(is_active),
  created_by = VALUES(created_by);