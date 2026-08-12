CREATE DATABASE idsml
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

SHOW DATABASES;
USE idsml;

-- ADMIN USERS (full privileges for Diego & Sarah)
CREATE USER IF NOT EXISTS 'sarah_admin'@'localhost' IDENTIFIED BY 'S@rahAdm1n_2025!';
CREATE USER IF NOT EXISTS 'diego_admin'@'localhost' IDENTIFIED BY 'D13go_Admin#2025$';

GRANT ALL PRIVILEGES ON idsml.* TO 'sarah_admin'@'localhost';
GRANT ALL PRIVILEGES ON idsml.* TO 'diego_admin'@'localhost';

-- APPLICATION USER (limited privileges for Flask app and others)
CREATE USER IF NOT EXISTS 'ids_app'@'localhost' IDENTIFIED BY 'idsAPP_dev_93Jf2LmQ';

GRANT SELECT, INSERT, UPDATE, DELETE ON idsml.* TO 'ids_app'@'localhost';

-- FRONTEND / GENERAL DEV ACCESS (read-only, for other team members)
CREATE USER IF NOT EXISTS 'ids_view'@'localhost' IDENTIFIED BY 'idsVIEW_readOnly_2025';
GRANT SELECT ON idsml.* TO 'ids_view'@'localhost';

FLUSH PRIVILEGES;


CREATE TABLE IF NOT EXISTS model_runs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  model_name   VARCHAR(64) NOT NULL,                -- LightGBM, XGBoost, CatBoost
  params       JSON NOT NULL,                       -- hyperparameters (JSON)
  results      JSON NOT NULL,                       -- metrics (accuracy, precision, recall, F1, etc.)
  duration_s   DECIMAL(10,3) NULL,                  -- seconds to complete
  created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_model_time (model_name, created_at)
) ENGINE=InnoDB;


SHOW TABLES;
SHOW GRANTS FOR 'ids_app'@'localhost';
SHOW GRANTS FOR 'ids_view'@'localhost';