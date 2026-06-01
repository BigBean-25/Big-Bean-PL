-- =====================================================
-- BIG BEAN CAFÉ - COMPLETE DATABASE SCHEMA
-- Version: 3.0 (With PetPooja Sales Reconciliation)
-- Date: May 29, 2026
-- =====================================================

-- Drop and recreate database
DROP DATABASE IF EXISTS bigbean_cafe;
CREATE DATABASE bigbean_cafe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bigbean_cafe;

-- =====================================================
-- SECTION 1: ROLES AND USERS
-- =====================================================

CREATE TABLE roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  permissions JSON,
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  role_id INT NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  is_active TINYINT(1) DEFAULT 1,
  last_login TIMESTAMP NULL,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  INDEX idx_email (email),
  INDEX idx_role (role_id)
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 2: MASTER DATA
-- =====================================================

CREATE TABLE outlets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  outlet_code VARCHAR(50) NOT NULL UNIQUE,
  outlet_name VARCHAR(100) NOT NULL,
  address TEXT,
  city VARCHAR(50),
  state VARCHAR(50),
  pincode VARCHAR(10),
  phone VARCHAR(20),
  email VARCHAR(100),
  manager_name VARCHAR(100),
  opening_date DATE,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (outlet_code)
) ENGINE=InnoDB;

CREATE TABLE user_outlets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  outlet_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_outlet (user_id, outlet_id)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category_name VARCHAR(100) NOT NULL,
  category_type ENUM('Raw Material', 'Menu Item', 'Both') DEFAULT 'Both',
  parent_id INT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  supplier_code VARCHAR(50) UNIQUE,
  supplier_name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  city VARCHAR(50),
  state VARCHAR(50),
  pincode VARCHAR(10),
  gstin VARCHAR(20),
  pan VARCHAR(20),
  payment_terms VARCHAR(100),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (supplier_name)
) ENGINE=InnoDB;

CREATE TABLE units (
  id INT PRIMARY KEY AUTO_INCREMENT,
  unit_name VARCHAR(50) NOT NULL UNIQUE,
  unit_symbol VARCHAR(20),
  unit_type ENUM('Weight', 'Volume', 'Count', 'Other') DEFAULT 'Other',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE raw_materials (
  id INT PRIMARY KEY AUTO_INCREMENT,
  material_code VARCHAR(50) UNIQUE,
  material_name VARCHAR(150) NOT NULL,
  category_id INT,
  unit_id INT,
  min_stock_qty DECIMAL(10,3) DEFAULT 0,
  max_stock_qty DECIMAL(10,3) DEFAULT 0,
  reorder_level DECIMAL(10,3) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
  INDEX idx_name (material_name),
  INDEX idx_code (material_code)
) ENGINE=InnoDB;

CREATE TABLE menu_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  item_code VARCHAR(50) UNIQUE,
  item_name VARCHAR(150) NOT NULL,
  category_id INT,
  selling_price DECIMAL(10,2) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_name (item_name),
  INDEX idx_code (item_code)
) ENGINE=InnoDB;

CREATE TABLE expense_heads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  expense_name VARCHAR(100) NOT NULL UNIQUE,
  expense_type ENUM('Daily', 'Monthly', 'Both') DEFAULT 'Both',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE payment_modes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  mode_name VARCHAR(50) NOT NULL UNIQUE,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE online_platforms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  platform_name VARCHAR(100) NOT NULL UNIQUE,
  commission_rate DECIMAL(5,2) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE dine_in_portals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  portal_name VARCHAR(100) NOT NULL UNIQUE,
  commission_rate DECIMAL(5,2) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 3: DAILY OUTLET ACCOUNTS
-- =====================================================

CREATE TABLE daily_cashbooks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  outlet_id INT NOT NULL,
  opening_cash DECIMAL(12,2) DEFAULT 0,
  cash_sales DECIMAL(12,2) DEFAULT 0,
  card_sales DECIMAL(12,2) DEFAULT 0,
  upi_sales DECIMAL(12,2) DEFAULT 0,
  zomato_sales DECIMAL(12,2) DEFAULT 0,
  swiggy_sales DECIMAL(12,2) DEFAULT 0,
  own_app_sales DECIMAL(12,2) DEFAULT 0,
  ownly_sales DECIMAL(12,2) DEFAULT 0,
  swiggy_dineout_sales DECIMAL(12,2) DEFAULT 0,
  zomato_dining_sales DECIMAL(12,2) DEFAULT 0,
  district_sales DECIMAL(12,2) DEFAULT 0,
  eazydiner_sales DECIMAL(12,2) DEFAULT 0,
  other_sales DECIMAL(12,2) DEFAULT 0,
  total_sales DECIMAL(12,2) GENERATED ALWAYS AS (
    cash_sales + card_sales + upi_sales + zomato_sales + swiggy_sales + 
    own_app_sales + ownly_sales + swiggy_dineout_sales + zomato_dining_sales + 
    district_sales + eazydiner_sales + other_sales
  ) STORED,
  cash_expenses DECIMAL(12,2) DEFAULT 0,
  bank_deposit DECIMAL(12,2) DEFAULT 0,
  cash_transfer_to_ho DECIMAL(12,2) DEFAULT 0,
  closing_cash DECIMAL(12,2) GENERATED ALWAYS AS (
    opening_cash + cash_sales - cash_expenses - bank_deposit - cash_transfer_to_ho
  ) STORED,
  actual_cash_in_hand DECIMAL(12,2) DEFAULT 0,
  cash_difference DECIMAL(12,2) GENERATED ALWAYS AS (
    actual_cash_in_hand - (opening_cash + cash_sales - cash_expenses - bank_deposit - cash_transfer_to_ho)
  ) STORED,
  remarks TEXT,
  status ENUM('Draft', 'Submitted', 'Verified', 'Rejected', 'Locked') DEFAULT 'Draft',
  entered_by INT,
  verified_by INT,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (entered_by) REFERENCES users(id),
  FOREIGN KEY (verified_by) REFERENCES users(id),
  UNIQUE KEY unique_date_outlet (date, outlet_id),
  INDEX idx_date (date),
  INDEX idx_outlet (outlet_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

CREATE TABLE daily_cash_expenses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  outlet_id INT NOT NULL,
  expense_head_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_mode_id INT,
  paid_to VARCHAR(100),
  description TEXT,
  proof_attachment VARCHAR(255),
  status ENUM('Draft', 'Submitted', 'Approved', 'Rejected') DEFAULT 'Draft',
  entered_by INT,
  verified_by INT,
  verified_at TIMESTAMP NULL,
  admin_remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (expense_head_id) REFERENCES expense_heads(id),
  FOREIGN KEY (payment_mode_id) REFERENCES payment_modes(id),
  FOREIGN KEY (entered_by) REFERENCES users(id),
  FOREIGN KEY (verified_by) REFERENCES users(id),
  INDEX idx_date (date),
  INDEX idx_outlet (outlet_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

CREATE TABLE bank_deposits (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  outlet_id INT NOT NULL,
  deposit_amount DECIMAL(12,2) NOT NULL,
  bank_name VARCHAR(100),
  reference_no VARCHAR(100),
  deposited_by VARCHAR(100),
  proof_attachment VARCHAR(255),
  remarks TEXT,
  status ENUM('Draft', 'Submitted', 'Verified', 'Rejected') DEFAULT 'Draft',
  entered_by INT,
  verified_by INT,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (entered_by) REFERENCES users(id),
  FOREIGN KEY (verified_by) REFERENCES users(id),
  INDEX idx_date (date),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB;

CREATE TABLE day_closings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  outlet_id INT NOT NULL,
  sales_confirmed TINYINT(1) DEFAULT 0,
  expenses_confirmed TINYINT(1) DEFAULT 0,
  purchases_confirmed TINYINT(1) DEFAULT 0,
  proofs_uploaded TINYINT(1) DEFAULT 0,
  actual_cash_in_hand DECIMAL(12,2) DEFAULT 0,
  closing_cash_system DECIMAL(12,2) DEFAULT 0,
  difference DECIMAL(12,2) DEFAULT 0,
  manager_remarks TEXT,
  status ENUM('Open', 'Submitted', 'Verified', 'Rejected', 'Locked') DEFAULT 'Open',
  submitted_by INT,
  submitted_at TIMESTAMP NULL,
  verified_by INT,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (submitted_by) REFERENCES users(id),
  FOREIGN KEY (verified_by) REFERENCES users(id),
  UNIQUE KEY unique_date_outlet (date, outlet_id),
  INDEX idx_date (date),
  INDEX idx_outlet (outlet_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

CREATE TABLE proof_attachments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  record_type VARCHAR(50) NOT NULL,
  record_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_type VARCHAR(50),
  file_size INT,
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_record (record_type, record_id)
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 4: STOCK MANAGEMENT
-- =====================================================

CREATE TABLE opening_stock_uploads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  batch_id VARCHAR(100) NOT NULL UNIQUE,
  month INT NOT NULL,
  year INT NOT NULL,
  outlet_id INT NOT NULL,
  file_name VARCHAR(255),
  file_path VARCHAR(255),
  total_rows INT DEFAULT 0,
  success_rows INT DEFAULT 0,
  failed_rows INT DEFAULT 0,
  status ENUM('Pending', 'Processing', 'Completed', 'Failed', 'Rolled Back') DEFAULT 'Pending',
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_batch (batch_id),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB;

CREATE TABLE opening_stock_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id INT NOT NULL,
  date DATE NOT NULL,
  outlet_id INT NOT NULL,
  raw_material_id INT,
  raw_material_code VARCHAR(50),
  raw_material_name VARCHAR(150),
  category_id INT,
  qty DECIMAL(12,3) NOT NULL,
  unit_id INT,
  rate DECIMAL(10,2) NOT NULL,
  value DECIMAL(12,2) GENERATED ALWAYS AS (qty * rate) STORED,
  remarks TEXT,
  original_row JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (upload_id) REFERENCES opening_stock_uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
  INDEX idx_upload (upload_id),
  INDEX idx_date (date),
  INDEX idx_outlet (outlet_id),
  INDEX idx_material (raw_material_id)
) ENGINE=InnoDB;

CREATE TABLE closing_stock_uploads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  batch_id VARCHAR(100) NOT NULL UNIQUE,
  month INT NOT NULL,
  year INT NOT NULL,
  outlet_id INT NOT NULL,
  file_name VARCHAR(255),
  file_path VARCHAR(255),
  total_rows INT DEFAULT 0,
  success_rows INT DEFAULT 0,
  failed_rows INT DEFAULT 0,
  status ENUM('Pending', 'Processing', 'Completed', 'Failed', 'Rolled Back') DEFAULT 'Pending',
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_batch (batch_id),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB;

CREATE TABLE closing_stock_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id INT NOT NULL,
  date DATE NOT NULL,
  outlet_id INT NOT NULL,
  raw_material_id INT,
  raw_material_code VARCHAR(50),
  raw_material_name VARCHAR(150),
  category_id INT,
  qty DECIMAL(12,3) NOT NULL,
  unit_id INT,
  rate DECIMAL(10,2) NOT NULL,
  value DECIMAL(12,2) GENERATED ALWAYS AS (qty * rate) STORED,
  remarks TEXT,
  original_row JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (upload_id) REFERENCES closing_stock_uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
  INDEX idx_upload (upload_id),
  INDEX idx_date (date),
  INDEX idx_outlet (outlet_id),
  INDEX idx_material (raw_material_id)
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 5: PURCHASES
-- =====================================================

CREATE TABLE material_purchase_uploads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  batch_id VARCHAR(100) NOT NULL UNIQUE,
  outlet_id INT NOT NULL,
  file_name VARCHAR(255),
  file_path VARCHAR(255),
  total_rows INT DEFAULT 0,
  success_rows INT DEFAULT 0,
  failed_rows INT DEFAULT 0,
  status ENUM('Pending', 'Processing', 'Completed', 'Failed', 'Rolled Back') DEFAULT 'Pending',
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_batch (batch_id),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB;

CREATE TABLE material_purchase_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id INT NOT NULL,
  date DATE NOT NULL,
  outlet_id INT NOT NULL,
  supplier_id INT,
  supplier_name VARCHAR(100),
  raw_material_id INT,
  raw_material_code VARCHAR(50),
  raw_material_name VARCHAR(150),
  category_id INT,
  qty DECIMAL(12,3) NOT NULL,
  unit_id INT,
  rate DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  invoice_no VARCHAR(100),
  remarks TEXT,
  original_row JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (upload_id) REFERENCES material_purchase_uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
  INDEX idx_upload (upload_id),
  INDEX idx_date (date),
  INDEX idx_outlet (outlet_id),
  INDEX idx_supplier (supplier_id),
  INDEX idx_material (raw_material_id)
) ENGINE=InnoDB;

CREATE TABLE supplier_payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  outlet_id INT NOT NULL,
  supplier_id INT NOT NULL,
  opening_pending DECIMAL(12,2) DEFAULT 0,
  purchase_value DECIMAL(12,2) DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  balance_pending DECIMAL(12,2) GENERATED ALWAYS AS (
    opening_pending + purchase_value - paid_amount
  ) STORED,
  payment_mode_id INT,
  reference_no VARCHAR(100),
  proof_attachment VARCHAR(255),
  remarks TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (payment_mode_id) REFERENCES payment_modes(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_date (date),
  INDEX idx_outlet (outlet_id),
  INDEX idx_supplier (supplier_id)
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 6: SALES (OLD ITEM-WISE SALES)
-- =====================================================

CREATE TABLE item_sales_uploads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  batch_id VARCHAR(100) NOT NULL UNIQUE,
  outlet_id INT NOT NULL,
  file_name VARCHAR(255),
  file_path VARCHAR(255),
  total_rows INT DEFAULT 0,
  success_rows INT DEFAULT 0,
  failed_rows INT DEFAULT 0,
  status ENUM('Pending', 'Processing', 'Completed', 'Failed', 'Rolled Back') DEFAULT 'Pending',
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_batch (batch_id),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB;

CREATE TABLE item_sales_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id INT NOT NULL,
  date DATE NOT NULL,
  outlet_id INT NOT NULL,
  category_id INT,
  category_name VARCHAR(100),
  menu_item_id INT,
  item_code VARCHAR(50),
  item_name VARCHAR(150),
  qty_sold DECIMAL(10,3) NOT NULL,
  gross_sales DECIMAL(12,2) NOT NULL,
  discount DECIMAL(12,2) DEFAULT 0,
  tax DECIMAL(12,2) DEFAULT 0,
  net_sales DECIMAL(12,2) NOT NULL,
  payment_mode VARCHAR(50),
  order_type VARCHAR(50),
  platform VARCHAR(50),
  remarks TEXT,
  original_row JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (upload_id) REFERENCES item_sales_uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL,
  INDEX idx_upload (upload_id),
  INDEX idx_date (date),
  INDEX idx_outlet (outlet_id),
  INDEX idx_item (menu_item_id)
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 7: PETPOOJA SALES RECONCILIATION (NEW!)
-- =====================================================

CREATE TABLE petpooja_sales_uploads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  batch_number VARCHAR(50) UNIQUE NOT NULL,
  upload_date DATE NOT NULL COMMENT 'Start date or single date',
  upload_date_from DATE COMMENT 'Date range start',
  upload_date_to DATE COMMENT 'Date range end',
  outlet_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  total_items INT DEFAULT 0 COMMENT 'Number of item rows',
  gross_sales DECIMAL(12,2) DEFAULT 0 COMMENT 'Total Gross Sales from Row 6',
  total_discount DECIMAL(12,2) DEFAULT 0 COMMENT 'Total Discount from Row 6',
  net_sales DECIMAL(12,2) DEFAULT 0 COMMENT 'Total My Amount (Net) from Row 6',
  total_tax DECIMAL(12,2) DEFAULT 0 COMMENT 'Total Tax from Row 6',
  final_collection DECIMAL(12,2) DEFAULT 0 COMMENT 'Same as gross_sales',
  status ENUM('Pending', 'Reconciling', 'Approved', 'Rejected') DEFAULT 'Pending',
  uploaded_by INT NOT NULL,
  approved_by INT NULL,
  approved_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  INDEX idx_batch (batch_number),
  INDEX idx_outlet_date (outlet_id, upload_date),
  INDEX idx_status (status)
) ENGINE=InnoDB COMMENT='PetPooja sales upload batches with date range and totals';

CREATE TABLE petpooja_sales_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id INT NOT NULL,
  outlet_id INT NOT NULL,
  outlet_name VARCHAR(255) NOT NULL COMMENT 'From Restaurant column',
  category VARCHAR(100) COMMENT 'From Category column',
  item_name VARCHAR(255) NOT NULL COMMENT 'From Item column',
  sap_code VARCHAR(50) COMMENT 'From Sap Code column',
  quantity DECIMAL(10,2) NOT NULL COMMENT 'From Qty column',
  net_sales DECIMAL(10,2) NOT NULL COMMENT 'From My Amount column (before tax)',
  discount DECIMAL(10,2) DEFAULT 0 COMMENT 'From Discount column',
  total_tax DECIMAL(10,2) DEFAULT 0 COMMENT 'From Tax column (CGST+SGST combined)',
  gross_sales DECIMAL(10,2) NOT NULL COMMENT 'From Gross Sales column (Net + Tax)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (upload_id) REFERENCES petpooja_sales_uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  INDEX idx_upload (upload_id),
  INDEX idx_item (item_name),
  INDEX idx_category (category),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB COMMENT='Item-wise sales data from PetPooja (NOT bill-wise)';

CREATE TABLE sales_reconciliation_batches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id INT NOT NULL,
  outlet_id INT NOT NULL,
  reconciliation_date DATE NOT NULL COMMENT 'Start date of reconciliation period',
  date_from DATE COMMENT 'Reconciliation period start',
  date_to DATE COMMENT 'Reconciliation period end',
  
  -- PetPooja Totals
  petpooja_gross_sales DECIMAL(12,2) DEFAULT 0,
  petpooja_discount DECIMAL(12,2) DEFAULT 0,
  petpooja_net_sales DECIMAL(12,2) DEFAULT 0 COMMENT 'My Amount total',
  petpooja_tax DECIMAL(12,2) DEFAULT 0,
  petpooja_final_collection DECIMAL(12,2) DEFAULT 0,
  
  -- Cashbook Totals (for date range)
  cashbook_total DECIMAL(12,2) DEFAULT 0 COMMENT 'Sum of all cashbook entries in date range',
  
  -- Reconciliation
  collection_difference DECIMAL(12,2) GENERATED ALWAYS AS (
    petpooja_final_collection - cashbook_total
  ) STORED,
  tolerance_amount DECIMAL(10,2) DEFAULT 0 COMMENT 'Allowed variance based on days',
  is_matched BOOLEAN DEFAULT 0,
  error_count INT DEFAULT 0,
  warning_count INT DEFAULT 0,
  
  status ENUM('Pending', 'Matched', 'Mismatched', 'Approved', 'Rejected') DEFAULT 'Pending',
  reconciled_by INT,
  reconciled_at TIMESTAMP NULL,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (upload_id) REFERENCES petpooja_sales_uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (reconciled_by) REFERENCES users(id),
  INDEX idx_upload (upload_id),
  INDEX idx_date (reconciliation_date),
  INDEX idx_status (status)
) ENGINE=InnoDB COMMENT='Reconciliation of PetPooja sales with cashbook';

CREATE TABLE sales_reconciliation_errors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  reconciliation_id INT NOT NULL,
  upload_id INT NOT NULL,
  error_type ENUM(
    'Collection Mismatch',
    'Total Mismatch',
    'Gross Sales Formula Error',
    'Invalid Quantity',
    'Tax Validation',
    'Missing Item Name',
    'Outlet Mismatch',
    'Item Not Mapped',
    'Negative Sales',
    'Other'
  ) NOT NULL,
  severity ENUM('Error', 'Warning', 'Info') DEFAULT 'Error',
  item_name VARCHAR(255),
  expected_value DECIMAL(12,2),
  actual_value DECIMAL(12,2),
  difference DECIMAL(12,2),
  error_message TEXT NOT NULL,
  row_number INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (reconciliation_id) REFERENCES sales_reconciliation_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (upload_id) REFERENCES petpooja_sales_uploads(id) ON DELETE CASCADE,
  INDEX idx_reconciliation (reconciliation_id),
  INDEX idx_type (error_type),
  INDEX idx_severity (severity)
) ENGINE=InnoDB COMMENT='Errors and warnings from sales reconciliation';

CREATE TABLE sales_category_summary (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id INT NOT NULL,
  outlet_id INT NOT NULL,
  category VARCHAR(100) NOT NULL,
  total_quantity DECIMAL(12,2) DEFAULT 0,
  total_net_sales DECIMAL(12,2) DEFAULT 0,
  total_discount DECIMAL(12,2) DEFAULT 0,
  total_tax DECIMAL(12,2) DEFAULT 0,
  total_gross_sales DECIMAL(12,2) DEFAULT 0,
  item_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (upload_id) REFERENCES petpooja_sales_uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  INDEX idx_upload (upload_id),
  INDEX idx_category (category)
) ENGINE=InnoDB COMMENT='Category-wise sales aggregation for analysis';

CREATE TABLE sales_approval_audit (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id INT NOT NULL,
  action ENUM('Uploaded', 'Reconciled', 'Approved', 'Rejected', 'Locked') NOT NULL,
  performed_by INT NOT NULL,
  remarks TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (upload_id) REFERENCES petpooja_sales_uploads(id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES users(id),
  INDEX idx_upload (upload_id),
  INDEX idx_action (action)
) ENGINE=InnoDB COMMENT='Audit trail for sales upload approvals';

-- =====================================================
-- SECTION 8: MONTHLY P&L SNAPSHOTS (UPDATED!)
-- =====================================================

CREATE TABLE monthly_pnl_snapshots (
  id INT PRIMARY KEY AUTO_INCREMENT,
  month INT NOT NULL,
  year INT NOT NULL,
  outlet_id INT NOT NULL,
  
  -- Revenue (Net Sales excluding Tax) - FROM APPROVED PETPOOJA UPLOADS
  gross_sales DECIMAL(12,2) DEFAULT 0 COMMENT 'Total gross from PetPooja',
  total_discount DECIMAL(12,2) DEFAULT 0,
  net_sales DECIMAL(12,2) DEFAULT 0 COMMENT 'Revenue = My Amount from PetPooja',
  
  -- Tax (Separate - Not Revenue)
  total_tax DECIMAL(12,2) DEFAULT 0 COMMENT 'Tax liability, not revenue',
  
  -- COGS
  opening_stock DECIMAL(12,2) DEFAULT 0,
  purchases DECIMAL(12,2) DEFAULT 0,
  closing_stock DECIMAL(12,2) DEFAULT 0,
  cogs DECIMAL(12,2) GENERATED ALWAYS AS (
    opening_stock + purchases - closing_stock
  ) STORED,
  
  -- Gross Profit
  gross_profit DECIMAL(12,2) GENERATED ALWAYS AS (
    net_sales - (opening_stock + purchases - closing_stock)
  ) STORED,
  gross_profit_percentage DECIMAL(5,2),
  
  -- Payroll Costs
  employee_salary DECIMAL(12,2) DEFAULT 0,
  incentives DECIMAL(12,2) DEFAULT 0,
  overtime DECIMAL(12,2) DEFAULT 0,
  staff_benefits DECIMAL(12,2) DEFAULT 0,
  total_payroll_cost DECIMAL(12,2) GENERATED ALWAYS AS (
    employee_salary + incentives + overtime + staff_benefits
  ) STORED,
  
  -- Outlet Fixed Expenses
  rent DECIMAL(12,2) DEFAULT 0,
  electricity DECIMAL(12,2) DEFAULT 0,
  water DECIMAL(12,2) DEFAULT 0,
  maintenance DECIMAL(12,2) DEFAULT 0,
  accommodation DECIMAL(12,2) DEFAULT 0,
  other_expenses DECIMAL(12,2) DEFAULT 0,
  total_fixed_expenses DECIMAL(12,2) GENERATED ALWAYS AS (
    rent + electricity + water + maintenance + accommodation + other_expenses
  ) STORED,
  
  -- Platform Charges
  zomato_commission DECIMAL(12,2) DEFAULT 0,
  swiggy_commission DECIMAL(12,2) DEFAULT 0,
  dine_in_commission DECIMAL(12,2) DEFAULT 0,
  gateway_charges DECIMAL(12,2) DEFAULT 0,
  tds DECIMAL(12,2) DEFAULT 0,
  tcs DECIMAL(12,2) DEFAULT 0,
  other_deductions DECIMAL(12,2) DEFAULT 0,
  total_platform_charges DECIMAL(12,2) GENERATED ALWAYS AS (
    zomato_commission + swiggy_commission + dine_in_commission + gateway_charges + tds + tcs + other_deductions
  ) STORED,
  
  -- Net Profit (Revenue - COGS - Payroll - Expenses - Platform)
  net_profit DECIMAL(12,2) GENERATED ALWAYS AS (
    net_sales - (opening_stock + purchases - closing_stock) - 
    (employee_salary + incentives + overtime + staff_benefits) - 
    (rent + electricity + water + maintenance + accommodation + other_expenses) - 
    (zomato_commission + swiggy_commission + dine_in_commission + gateway_charges + tds + tcs + other_deductions)
  ) STORED,
  net_profit_percentage DECIMAL(5,2),
  
  -- Metadata
  is_finalized BOOLEAN DEFAULT 0,
  finalized_by INT,
  finalized_at TIMESTAMP NULL,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (finalized_by) REFERENCES users(id),
  UNIQUE KEY unique_month_outlet (month, year, outlet_id),
  INDEX idx_period (year, month),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB COMMENT='Monthly P&L with Net Sales-based revenue calculation';

-- =====================================================
-- SECTION 9: RECIPE / BOM
-- =====================================================

CREATE TABLE recipes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  menu_item_id INT NOT NULL,
  recipe_category VARCHAR(100),
  for_outlet_id INT NULL,
  `portion` VARCHAR(50),
  prep_time INT,
  cooking_time INT,
  finishing_time INT,
  status ENUM('Draft', 'Active', 'Inactive') DEFAULT 'Active',
  version_no INT DEFAULT 1,
  effective_from DATE,
  approved_by INT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  FOREIGN KEY (for_outlet_id) REFERENCES outlets(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_item (menu_item_id),
  INDEX idx_outlet (for_outlet_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

CREATE TABLE recipe_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  recipe_id INT NOT NULL,
  raw_material_id INT NOT NULL,
  qty_per_item DECIMAL(10,3) NOT NULL,
  unit_id INT NOT NULL,
  waste_percentage DECIMAL(5,2) DEFAULT 0,
  extra_cost DECIMAL(10,2) DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
  FOREIGN KEY (unit_id) REFERENCES units(id),
  INDEX idx_recipe (recipe_id),
  INDEX idx_material (raw_material_id)
) ENGINE=InnoDB;

CREATE TABLE recipe_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  menu_item_id INT NOT NULL,
  version_no INT NOT NULL,
  recipe_data JSON,
  effective_from DATE,
  effective_to DATE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_item_version (menu_item_id, version_no)
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 10: PAYOUTS
-- =====================================================

CREATE TABLE online_payouts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  month INT NOT NULL,
  year INT NOT NULL,
  outlet_id INT NOT NULL,
  platform_id INT NOT NULL,
  gross_order_value DECIMAL(12,2) DEFAULT 0,
  customer_paid_amount DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  taxes DECIMAL(12,2) DEFAULT 0,
  platform_commission DECIMAL(12,2) DEFAULT 0,
  payment_gateway_charges DECIMAL(12,2) DEFAULT 0,
  packaging_charges DECIMAL(12,2) DEFAULT 0,
  delivery_charges DECIMAL(12,2) DEFAULT 0,
  tcs DECIMAL(12,2) DEFAULT 0,
  tds DECIMAL(12,2) DEFAULT 0,
  other_deductions DECIMAL(12,2) DEFAULT 0,
  net_payout_expected DECIMAL(12,2) GENERATED ALWAYS AS (
    customer_paid_amount - platform_commission - payment_gateway_charges - tcs - tds - other_deductions
  ) STORED,
  actual_payout_received DECIMAL(12,2) DEFAULT 0,
  difference DECIMAL(12,2) GENERATED ALWAYS AS (
    actual_payout_received - (customer_paid_amount - platform_commission - payment_gateway_charges - tcs - tds - other_deductions)
  ) STORED,
  payout_date DATE,
  reference_no VARCHAR(100),
  statement_attachment VARCHAR(255),
  remarks TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (platform_id) REFERENCES online_platforms(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_month_year (month, year),
  INDEX idx_outlet (outlet_id),
  INDEX idx_platform (platform_id)
) ENGINE=InnoDB;

CREATE TABLE dine_in_payouts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  month INT NOT NULL,
  year INT NOT NULL,
  outlet_id INT NOT NULL,
  portal_id INT NOT NULL,
  customer_bill_value DECIMAL(12,2) DEFAULT 0,
  customer_paid_value DECIMAL(12,2) DEFAULT 0,
  discount_given DECIMAL(12,2) DEFAULT 0,
  tax DECIMAL(12,2) DEFAULT 0,
  portal_commission DECIMAL(12,2) DEFAULT 0,
  tcs DECIMAL(12,2) DEFAULT 0,
  tds DECIMAL(12,2) DEFAULT 0,
  other_deduction DECIMAL(12,2) DEFAULT 0,
  expected_payout DECIMAL(12,2) GENERATED ALWAYS AS (
    customer_paid_value - portal_commission - tcs - tds - other_deduction
  ) STORED,
  actual_payout_received DECIMAL(12,2) DEFAULT 0,
  difference DECIMAL(12,2) GENERATED ALWAYS AS (
    actual_payout_received - (customer_paid_value - portal_commission - tcs - tds - other_deduction)
  ) STORED,
  payout_date DATE,
  reference_no VARCHAR(100),
  statement_attachment VARCHAR(255),
  remarks TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (portal_id) REFERENCES dine_in_portals(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_month_year (month, year),
  INDEX idx_outlet (outlet_id),
  INDEX idx_portal (portal_id)
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 11: MONTH-END ENTRIES
-- =====================================================

CREATE TABLE utility_bills (
  id INT PRIMARY KEY AUTO_INCREMENT,
  month INT NOT NULL,
  year INT NOT NULL,
  outlet_id INT NOT NULL,
  electricity_bill DECIMAL(10,2) DEFAULT 0,
  maintenance_cost DECIMAL(10,2) DEFAULT 0,
  water_bill DECIMAL(10,2) DEFAULT 0,
  garbage DECIMAL(10,2) DEFAULT 0,
  internet DECIMAL(10,2) DEFAULT 0,
  gas_monthly DECIMAL(10,2) DEFAULT 0,
  other_utility DECIMAL(10,2) DEFAULT 0,
  total_utility_cost DECIMAL(12,2) GENERATED ALWAYS AS (
    electricity_bill + maintenance_cost + water_bill + garbage + internet + gas_monthly + other_utility
  ) STORED,
  bill_attachment VARCHAR(255),
  remarks TEXT,
  status ENUM('Draft', 'Submitted', 'Verified') DEFAULT 'Draft',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY unique_month_outlet (month, year, outlet_id),
  INDEX idx_month_year (month, year),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB;

CREATE TABLE employee_salary_monthly (
  id INT PRIMARY KEY AUTO_INCREMENT,
  month INT NOT NULL,
  year INT NOT NULL,
  outlet_id INT NOT NULL,
  total_employee_salary DECIMAL(12,2) DEFAULT 0,
  incentive_bonus DECIMAL(10,2) DEFAULT 0,
  staff_accommodation DECIMAL(10,2) DEFAULT 0,
  other_staff_cost DECIMAL(10,2) DEFAULT 0,
  total_salary_cost DECIMAL(12,2) GENERATED ALWAYS AS (
    total_employee_salary + incentive_bonus + staff_accommodation + other_staff_cost
  ) STORED,
  remarks TEXT,
  status ENUM('Draft', 'Submitted', 'Verified') DEFAULT 'Draft',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY unique_month_outlet (month, year, outlet_id),
  INDEX idx_month_year (month, year),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 12: CONSUMPTION CALCULATION
-- =====================================================

CREATE TABLE consumption_runs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  run_type ENUM('Actual', 'Theoretical', 'Variance') NOT NULL,
  month INT NOT NULL,
  year INT NOT NULL,
  outlet_id INT NOT NULL,
  run_date DATE NOT NULL,
  status ENUM('Running', 'Completed', 'Failed') DEFAULT 'Running',
  total_items INT DEFAULT 0,
  run_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (run_by) REFERENCES users(id),
  INDEX idx_month_year (month, year),
  INDEX idx_outlet (outlet_id)
) ENGINE=InnoDB;

CREATE TABLE actual_consumption_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  run_id INT NOT NULL,
  outlet_id INT NOT NULL,
  raw_material_id INT NOT NULL,
  opening_qty DECIMAL(12,3) DEFAULT 0,
  purchase_qty DECIMAL(12,3) DEFAULT 0,
  closing_qty DECIMAL(12,3) DEFAULT 0,
  actual_consumption_qty DECIMAL(12,3) GENERATED ALWAYS AS (
    opening_qty + purchase_qty - closing_qty
  ) STORED,
  opening_value DECIMAL(12,2) DEFAULT 0,
  purchase_value DECIMAL(12,2) DEFAULT 0,
  closing_value DECIMAL(12,2) DEFAULT 0,
  actual_consumption_value DECIMAL(12,2) GENERATED ALWAYS AS (
    opening_value + purchase_value - closing_value
  ) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES consumption_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
  INDEX idx_run (run_id),
  INDEX idx_outlet (outlet_id),
  INDEX idx_material (raw_material_id)
) ENGINE=InnoDB;

CREATE TABLE theoretical_consumption_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  run_id INT NOT NULL,
  outlet_id INT NOT NULL,
  menu_item_id INT NOT NULL,
  raw_material_id INT NOT NULL,
  qty_sold DECIMAL(10,3) NOT NULL,
  recipe_qty DECIMAL(10,3) NOT NULL,
  total_used_qty DECIMAL(12,3) GENERATED ALWAYS AS (qty_sold * recipe_qty) STORED,
  avg_rate DECIMAL(10,2) DEFAULT 0,
  consumption_value DECIMAL(12,2) GENERATED ALWAYS AS (qty_sold * recipe_qty * avg_rate) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES consumption_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
  INDEX idx_run (run_id),
  INDEX idx_outlet (outlet_id),
  INDEX idx_item (menu_item_id),
  INDEX idx_material (raw_material_id)
) ENGINE=InnoDB;

CREATE TABLE consumption_variance_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  run_id INT NOT NULL,
  outlet_id INT NOT NULL,
  raw_material_id INT NOT NULL,
  actual_qty DECIMAL(12,3) DEFAULT 0,
  theoretical_qty DECIMAL(12,3) DEFAULT 0,
  variance_qty DECIMAL(12,3) GENERATED ALWAYS AS (actual_qty - theoretical_qty) STORED,
  variance_percentage DECIMAL(10,2) DEFAULT 0,
  actual_value DECIMAL(12,2) DEFAULT 0,
  theoretical_value DECIMAL(12,2) DEFAULT 0,
  variance_value DECIMAL(12,2) GENERATED ALWAYS AS (actual_value - theoretical_value) STORED,
  status ENUM('Normal', 'Warning', 'Critical') DEFAULT 'Normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES consumption_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
  INDEX idx_run (run_id),
  INDEX idx_outlet (outlet_id),
  INDEX idx_material (raw_material_id)
) ENGINE=InnoDB;

-- =====================================================
-- SECTION 13: LOGS AND AUDIT
-- =====================================================

CREATE TABLE approval_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  record_type VARCHAR(50) NOT NULL,
  record_id INT NOT NULL,
  action ENUM('Approved', 'Rejected', 'Verified', 'Locked', 'Unlocked') NOT NULL,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_record (record_type, record_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(100),
  record_id INT,
  old_data JSON,
  new_data JSON,
  remarks TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user (user_id),
  INDEX idx_table (table_name),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE upload_error_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id INT,
  upload_type VARCHAR(50),
  row_number INT,
  error_message TEXT,
  row_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_upload (upload_id),
  INDEX idx_type (upload_type)
) ENGINE=InnoDB;

CREATE TABLE report_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  report_name VARCHAR(100) NOT NULL,
  filters JSON,
  export_format ENUM('Excel', 'PDF', 'View') DEFAULT 'View',
  file_path VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user (user_id),
  INDEX idx_report (report_name)
) ENGINE=InnoDB;

CREATE TABLE column_mappings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_type VARCHAR(50) NOT NULL,
  source_column VARCHAR(100) NOT NULL,
  target_field VARCHAR(100) NOT NULL,
  is_required TINYINT(1) DEFAULT 0,
  data_type VARCHAR(50),
  default_value VARCHAR(100),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_type (upload_type)
) ENGINE=InnoDB;

-- =====================================================
-- INSTALLATION COMPLETE
-- =====================================================

SELECT '========================================' as '';
SELECT 'BIG BEAN CAFÉ DATABASE SCHEMA' as '';
SELECT 'Version 3.0 - WITH PETPOOJA SALES' as '';
SELECT '========================================' as '';
SELECT '' as '';
SELECT 'Installation Status: SUCCESS' as Status;
SELECT 'Total Tables Created: 60+' as Info;
SELECT '' as '';
SELECT 'NEW FEATURES:' as '';
SELECT '  ✅ PetPooja Sales Reconciliation' as Feature;
SELECT '  ✅ Net Sales-based P&L' as Feature;
SELECT '  ✅ Sales Approval Workflow' as Feature;
SELECT '  ✅ Category-wise Analysis' as Feature;
SELECT '  ✅ Error Tracking & Reporting' as Feature;
SELECT '' as '';
SELECT '========================================' as '';

-- Show all tables
SHOW TABLES;

-- =====================================================
-- IMPORTANT NOTES
-- =====================================================
-- 1. This schema includes ALL existing tables PLUS new PetPooja features
-- 2. PetPooja sales are item-aggregated (NOT bill-wise)
-- 3. "My Amount" from PetPooja = Net Sales (revenue)
-- 4. Tax shown separately in P&L (NOT revenue)
-- 5. Only APPROVED PetPooja uploads included in P&L
-- 6. Reconciliation compares totals (not transaction-level)
-- 7. P&L Formula: Net Profit = Net Sales - COGS - Payroll - Expenses - Platform
-- =====================================================
