-- ============================================================
-- Notifications Table Migration
-- Run once against bigbeancafe_db
-- Safe: does NOT modify or drop any existing tables
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id              INT          AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  outlet_id       INT          NULL,
  type            ENUM('info','success','warning','danger') NOT NULL DEFAULT 'info',
  title           VARCHAR(255) NOT NULL,
  message         TEXT         NOT NULL,
  reference_type  VARCHAR(50)  NULL   COMMENT 'e.g. cashbook, expense, day_closing',
  reference_id    INT          NULL   COMMENT 'PK of the related record',
  nav_path        VARCHAR(255) NULL   COMMENT 'Frontend URL to navigate to on click',
  is_read         TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         DATETIME     NULL,
  CONSTRAINT fk_notif_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_notif_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CREATE INDEX has no IF NOT EXISTS form in MySQL/MariaDB, so each index is
-- guarded with an information_schema check + prepared statement instead,
-- making this file safe to run more than once.
SET @exist := (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'notifications' AND index_name = 'idx_notif_user_read');
SET @sqlstmt := IF(@exist = 0,
  'CREATE INDEX idx_notif_user_read ON notifications (user_id, is_read)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'notifications' AND index_name = 'idx_notif_created');
SET @sqlstmt := IF(@exist = 0,
  'CREATE INDEX idx_notif_created ON notifications (created_at)',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
