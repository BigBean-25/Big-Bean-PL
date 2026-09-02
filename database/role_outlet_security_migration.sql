USE `bigbeancafe_db`;

CREATE TABLE IF NOT EXISTS user_outlets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  outlet_id INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_outlet (user_id, outlet_id),
  INDEX idx_user_outlets_user (user_id),
  INDEX idx_user_outlets_outlet (outlet_id),
  CONSTRAINT fk_user_outlets_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_outlets_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  role_name VARCHAR(100) NULL,
  outlet_id INT NULL,
  module_name VARCHAR(100) NOT NULL,
  record_id VARCHAR(100) NULL,
  action VARCHAR(100) NOT NULL,
  old_data JSON NULL,
  new_data JSON NULL,
  reason TEXT NULL,
  ip_address VARCHAR(80) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_outlet (outlet_id),
  INDEX idx_audit_module (module_name),
  INDEX idx_audit_created (created_at)
);

CREATE TABLE IF NOT EXISTS petpooja_item_sales (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  outlet_id INT NOT NULL,
  sales_date DATE NOT NULL,
  bill_no VARCHAR(100) NULL,
  item_name VARCHAR(255) NOT NULL,
  category_name VARCHAR(255) NULL,
  quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  gross_sales DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax DECIMAL(14,2) NOT NULL DEFAULT 0,
  net_sales DECIMAL(14,2) NOT NULL DEFAULT 0,
  order_type VARCHAR(100) NULL,
  platform VARCHAR(100) NULL,
  uploaded_by INT NULL,
  upload_batch_id VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pp_item_sales_outlet_date (outlet_id, sales_date),
  INDEX idx_pp_item_sales_category (category_name),
  INDEX idx_pp_item_sales_platform (platform),
  CONSTRAINT fk_pp_item_sales_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_pp_item_sales_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Note: stock_movements/outlet_stock are intentionally NOT altered here — neither
-- table is created anywhere in the schema and neither is part of the required
-- table list, so there is nothing to add outlet_id/status/lock columns to.
ALTER TABLE daily_cashbooks ADD COLUMN IF NOT EXISTS outlet_id INT NULL;
ALTER TABLE daily_cash_expenses ADD COLUMN IF NOT EXISTS outlet_id INT NULL;
ALTER TABLE day_closings ADD COLUMN IF NOT EXISTS outlet_id INT NULL;
ALTER TABLE opening_stock_uploads ADD COLUMN IF NOT EXISTS outlet_id INT NULL;
ALTER TABLE closing_stock_uploads ADD COLUMN IF NOT EXISTS outlet_id INT NULL;
ALTER TABLE material_purchase_uploads ADD COLUMN IF NOT EXISTS outlet_id INT NULL;
ALTER TABLE employee_salary_monthly ADD COLUMN IF NOT EXISTS outlet_id INT NULL;
ALTER TABLE online_payouts ADD COLUMN IF NOT EXISTS outlet_id INT NULL;
ALTER TABLE dine_in_payouts ADD COLUMN IF NOT EXISTS outlet_id INT NULL;

ALTER TABLE daily_cashbooks ADD COLUMN IF NOT EXISTS status ENUM('Draft','Submitted','Verified','Approved','Rejected','Locked') NOT NULL DEFAULT 'Draft';
ALTER TABLE daily_cash_expenses ADD COLUMN IF NOT EXISTS status ENUM('Draft','Submitted','Verified','Approved','Rejected','Locked') NOT NULL DEFAULT 'Draft';
ALTER TABLE day_closings ADD COLUMN IF NOT EXISTS status ENUM('Draft','Submitted','Verified','Approved','Rejected','Locked') NOT NULL DEFAULT 'Draft';
ALTER TABLE opening_stock_uploads ADD COLUMN IF NOT EXISTS status ENUM('Draft','Submitted','Verified','Approved','Rejected','Locked') NOT NULL DEFAULT 'Draft';
ALTER TABLE closing_stock_uploads ADD COLUMN IF NOT EXISTS status ENUM('Draft','Submitted','Verified','Approved','Rejected','Locked') NOT NULL DEFAULT 'Draft';
ALTER TABLE material_purchase_uploads ADD COLUMN IF NOT EXISTS status ENUM('Draft','Submitted','Verified','Approved','Rejected','Locked') NOT NULL DEFAULT 'Draft';
ALTER TABLE employee_salary_monthly ADD COLUMN IF NOT EXISTS status ENUM('Draft','Submitted','Verified','Approved','Rejected','Locked') NOT NULL DEFAULT 'Draft';
ALTER TABLE online_payouts ADD COLUMN IF NOT EXISTS status ENUM('Draft','Submitted','Verified','Approved','Rejected','Locked') NOT NULL DEFAULT 'Draft';
ALTER TABLE dine_in_payouts ADD COLUMN IF NOT EXISTS status ENUM('Draft','Submitted','Verified','Approved','Rejected','Locked') NOT NULL DEFAULT 'Draft';

ALTER TABLE daily_cashbooks ADD COLUMN IF NOT EXISTS locked_by INT NULL, ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL, ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL;
ALTER TABLE daily_cash_expenses ADD COLUMN IF NOT EXISTS locked_by INT NULL, ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL, ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL;
ALTER TABLE day_closings ADD COLUMN IF NOT EXISTS locked_by INT NULL, ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL, ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL;
ALTER TABLE opening_stock_uploads ADD COLUMN IF NOT EXISTS locked_by INT NULL, ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL, ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL;
ALTER TABLE closing_stock_uploads ADD COLUMN IF NOT EXISTS locked_by INT NULL, ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL, ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL;
ALTER TABLE material_purchase_uploads ADD COLUMN IF NOT EXISTS locked_by INT NULL, ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL, ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL;
ALTER TABLE employee_salary_monthly ADD COLUMN IF NOT EXISTS locked_by INT NULL, ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL, ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL;
ALTER TABLE online_payouts ADD COLUMN IF NOT EXISTS locked_by INT NULL, ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL, ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL;
ALTER TABLE dine_in_payouts ADD COLUMN IF NOT EXISTS locked_by INT NULL, ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL, ADD COLUMN IF NOT EXISTS lock_reason TEXT NULL;

CREATE INDEX idx_daily_cashbooks_outlet ON daily_cashbooks(outlet_id);
CREATE INDEX idx_daily_cash_expenses_outlet ON daily_cash_expenses(outlet_id);
CREATE INDEX idx_day_closings_outlet ON day_closings(outlet_id);
CREATE INDEX idx_opening_stock_uploads_outlet ON opening_stock_uploads(outlet_id);
CREATE INDEX idx_closing_stock_uploads_outlet ON closing_stock_uploads(outlet_id);
CREATE INDEX idx_material_purchase_uploads_outlet ON material_purchase_uploads(outlet_id);
CREATE INDEX idx_employee_salary_monthly_outlet ON employee_salary_monthly(outlet_id);
CREATE INDEX idx_online_payouts_outlet ON online_payouts(outlet_id);
CREATE INDEX idx_dine_in_payouts_outlet ON dine_in_payouts(outlet_id);
