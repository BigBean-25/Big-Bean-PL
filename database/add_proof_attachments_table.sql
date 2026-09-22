-- Phase 7B3B: guarantee proof_attachments exists.
-- The table is defined in COMPLETE_SCHEMA_WITH_PETPOOJA.sql (the base
-- bootstrap schema) but is NOT created by any tracked migration, so a
-- database built only through database/migrate.mjs would not have it.
-- This migration is a verbatim copy of the base-schema definition behind
-- CREATE TABLE IF NOT EXISTS - additive, idempotent, no data rewrites.
CREATE TABLE IF NOT EXISTS proof_attachments (
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
