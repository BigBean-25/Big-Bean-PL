-- Daily Checklist Phase 1 tables and master seed
-- Safe to run on existing bigbeancafe_db

-- -----------------------------------------------------------
-- daily_checklists
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_checklists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `date` DATE NOT NULL,
  outlet_id INT NOT NULL,
  status ENUM('Open', 'Submitted', 'Verified', 'Rejected') NOT NULL DEFAULT 'Open',
  manager_remarks TEXT NULL,
  entered_by INT NULL,
  submitted_by INT NULL,
  submitted_at TIMESTAMP NULL,
  verified_by INT NULL,
  verified_at TIMESTAMP NULL,
  rejected_by INT NULL,
  rejected_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_daily_checklist_date_outlet (`date`, outlet_id),
  KEY idx_daily_checklists_status (status),
  KEY idx_daily_checklists_outlet (outlet_id),
  CONSTRAINT fk_daily_checklists_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
  CONSTRAINT fk_daily_checklists_entered_by FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_daily_checklists_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_daily_checklists_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_daily_checklists_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- daily_checklist_items
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_key VARCHAR(80) NOT NULL,
  section_key VARCHAR(40) NOT NULL,
  item_label VARCHAR(255) NOT NULL,
  description VARCHAR(255) NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_daily_checklist_item_key (item_key),
  KEY idx_checklist_items_section (section_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- daily_checklist_responses
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_checklist_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  checklist_id INT NOT NULL,
  checklist_item_id INT NOT NULL,
  is_checked TINYINT(1) NOT NULL DEFAULT 0,
  note VARCHAR(500) NULL,
  checked_by INT NULL,
  checked_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_daily_checklist_response (checklist_id, checklist_item_id),
  CONSTRAINT fk_daily_checklist_responses_checklist FOREIGN KEY (checklist_id) REFERENCES daily_checklists(id) ON DELETE CASCADE,
  CONSTRAINT fk_daily_checklist_responses_item FOREIGN KEY (checklist_item_id) REFERENCES daily_checklist_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_daily_checklist_responses_checked_by FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- Master seed
-- -----------------------------------------------------------
INSERT INTO daily_checklist_items (item_key, section_key, item_label, description, is_required, sort_order) VALUES
  ('sales_available', 'sales_billing', 'Sales data available / uploaded', NULL, 1, 10),
  ('pos_sales_reviewed', 'sales_billing', 'POS sales reviewed', NULL, 1, 20),
  ('payment_mode_reviewed', 'sales_billing', 'Payment mode reconciliation reviewed', NULL, 0, 30),
  ('refunds_reviewed', 'sales_billing', 'Cancelled / refunded bills reviewed', NULL, 0, 40),
  ('discounts_reviewed', 'sales_billing', 'Discounts reviewed', NULL, 0, 50),

  ('cashbook_completed', 'cash_closing', 'Daily Cashbook completed', NULL, 1, 10),
  ('physical_cash_checked', 'cash_closing', 'Physical cash checked', NULL, 1, 20),
  ('cash_variance_reviewed', 'cash_closing', 'Cash variance reviewed', NULL, 0, 30),
  ('cash_handover_completed', 'cash_closing', 'Cash handover completed', NULL, 0, 40),

  ('expenses_entered', 'expenses', 'All daily cash expenses entered', NULL, 1, 10),
  ('expense_proofs_reviewed', 'expenses', 'Expense proofs reviewed', NULL, 0, 20),
  ('pending_expenses_reviewed', 'expenses', 'Pending expenses reviewed', NULL, 0, 30),

  ('bank_deposit_reviewed', 'bank_deposit', 'Bank deposit entry reviewed', NULL, 1, 10),
  ('deposit_proof_reviewed', 'bank_deposit', 'Deposit proof reviewed where applicable', NULL, 0, 20),
  ('deposit_variance_reviewed', 'bank_deposit', 'Deposit mismatch reviewed / explained', NULL, 0, 30),

  ('local_purchases_recorded', 'purchase_stock', 'Emergency / local purchases recorded', NULL, 0, 10),
  ('purchase_bills_available', 'purchase_stock', 'Purchase bills / proofs available', NULL, 0, 20),
  ('stock_issues_reported', 'purchase_stock', 'Stock issues reported', NULL, 0, 30),
  ('wastage_recorded', 'purchase_stock', 'Wastage recorded where applicable', NULL, 0, 40),
  ('closing_stock_checked', 'purchase_stock', 'Closing stock operational check completed', NULL, 0, 50),

  ('opening_checklist_completed', 'outlet_operations', 'Opening operational checks completed', NULL, 1, 10),
  ('equipment_checked', 'outlet_operations', 'Equipment checked', NULL, 0, 20),
  ('cleaning_completed', 'outlet_operations', 'Cleaning / hygiene checks completed', NULL, 0, 30),
  ('staff_attendance_checked', 'outlet_operations', 'Staff attendance reviewed', NULL, 0, 40),
  ('customer_complaints_reviewed', 'outlet_operations', 'Customer complaints reviewed', NULL, 0, 50),
  ('customer_feedback_reviewed', 'outlet_operations', 'Customer feedback / reviews reviewed', NULL, 0, 60),
  ('maintenance_issues_reported', 'outlet_operations', 'Maintenance issues reported', NULL, 0, 70),
  ('handover_items_recorded', 'outlet_operations', 'Pending handover items recorded', NULL, 0, 80)
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  description = VALUES(description),
  is_required = VALUES(is_required),
  sort_order = VALUES(sort_order),
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP;
