-- EOCheck - Database Creation Script
-- Inspiration: Dolibarr Architecture

CREATE TABLE IF NOT EXISTS llx_const (
  rowid INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  value TEXT,
  note TEXT,
  UNIQUE(name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO llx_const (name, value, note) VALUES ('MAIN_DB_VERSION', '1.0.0', 'Version de la structure de base de données');

CREATE TABLE IF NOT EXISTS llx_users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(191) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) DEFAULT '',
  last_name VARCHAR(100) DEFAULT '',
  role VARCHAR(50) DEFAULT 'user',
  phone VARCHAR(50) DEFAULT '',
  email_verified TINYINT(1) DEFAULT 0,
  email_verification_code VARCHAR(10),
  email_verification_expires DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS llx_settings (
  `key` VARCHAR(191) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO llx_settings (`key`, value) VALUES 
('scanner_default_num_pages', '0'),
('scanner_default_timeout', '60'),
('scanner_default_headless', 'true'),
('scanner_max_concurrent', '3'),
('ip_whitelist', '[]'),
('ip_blacklist', '[]'),
('smtp_config', '{"host":"","port":587,"secure":false,"user":"","pass":"","from":"eocheck@eoxia.com"}'),
('email_template_verification', '{"subject":"EOCheck - Vérification de votre adresse e-mail","body":"<p>Bonjour,</p><p>Voici votre code de vérification : <strong>{CODE}</strong></p><p>Ce code est valable 15 minutes.</p>"}');

CREATE TABLE IF NOT EXISTS llx_login_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  email VARCHAR(191) NOT NULL,
  first_name VARCHAR(100) DEFAULT '',
  last_name VARCHAR(100) DEFAULT '',
  ip_address VARCHAR(100) NOT NULL,
  user_agent TEXT,
  status VARCHAR(50) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES llx_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS llx_user_groups (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  max_pages INT DEFAULT 0,
  max_timeout INT DEFAULT 60,
  max_concurrent INT DEFAULT 1,
  max_depth INT DEFAULT 3
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO llx_user_groups (id, name, description, max_pages, max_timeout, max_depth) VALUES 
('admin-group-id-0000', 'Administrateurs', 'Accès complet', 1000, 600, 5),
('user-group-id-0000', 'Utilisateurs standards', 'Accès restreint aux scans', 200, 300, 3);

CREATE TABLE IF NOT EXISTS llx_group_permissions (
  group_id VARCHAR(36) NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  PRIMARY KEY (group_id, permission_code),
  FOREIGN KEY (group_id) REFERENCES llx_user_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO llx_group_permissions (group_id, permission_code) VALUES 
('admin-group-id-0000', 'page:scans'), ('admin-group-id-0000', 'page:settings'),
('admin-group-id-0000', 'page:users'), ('admin-group-id-0000', 'page:groups'),
('admin-group-id-0000', 'page:system'), ('admin-group-id-0000', 'scan:launch'),
('admin-group-id-0000', 'scan:delete'), ('admin-group-id-0000', 'settings:edit'),
('admin-group-id-0000', 'users:manage'), ('admin-group-id-0000', 'groups:manage'),
('user-group-id-0000', 'page:scans');

CREATE TABLE IF NOT EXISTS llx_user_group_memberships (
  user_id VARCHAR(36) NOT NULL,
  group_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES llx_users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES llx_user_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS llx_api_tokens (
  id VARCHAR(36) PRIMARY KEY,
  fk_user VARCHAR(36) NOT NULL,
  token_hash VARCHAR(191) UNIQUE NOT NULL,
  token_prefix VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  client_app VARCHAR(255) DEFAULT 'eo-tools',
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_expiration DATETIME,
  date_last_used DATETIME,
  FOREIGN KEY (fk_user) REFERENCES llx_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS llx_scans (
  id VARCHAR(36) PRIMARY KEY,
  fk_user VARCHAR(36),
  target_url VARCHAR(2048) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  options_json JSON,
  result_json JSON,
  error_message TEXT,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_completion DATETIME,
  FOREIGN KEY (fk_user) REFERENCES llx_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS llx_scan_profiles (
  rowid INT AUTO_INCREMENT PRIMARY KEY,
  ref VARCHAR(100),
  label VARCHAR(255) NOT NULL,
  description TEXT,
  max_pages INT DEFAULT 100,
  timeout_secs INT DEFAULT 300,
  max_depth INT DEFAULT 3,
  headless TINYINT(1) DEFAULT 1,
  inspect_cookies TINYINT(1) DEFAULT 1,
  detect_trackers TINYINT(1) DEFAULT 1,
  capture_images TINYINT(1) DEFAULT 0,
  cookie_action VARCHAR(50) DEFAULT 'ignore',
  use_sitemap_only TINYINT(1) DEFAULT 0,
  sitemap_index_scan TINYINT(1) DEFAULT 1,
  sitemap_index_max INT DEFAULT 5,
  fk_user_owner VARCHAR(36),
  fk_usergroup VARCHAR(36),
  datec DATETIME DEFAULT CURRENT_TIMESTAMP,
  tms DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  fk_user_creat VARCHAR(36),
  fk_user_modif VARCHAR(36),
  FOREIGN KEY (fk_user_owner) REFERENCES llx_users(id) ON DELETE SET NULL,
  FOREIGN KEY (fk_usergroup) REFERENCES llx_user_groups(id) ON DELETE SET NULL,
  FOREIGN KEY (fk_user_creat) REFERENCES llx_users(id) ON DELETE SET NULL,
  FOREIGN KEY (fk_user_modif) REFERENCES llx_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS llx_actioncomm (
  rowid INT AUTO_INCREMENT PRIMARY KEY,
  datep DATETIME DEFAULT CURRENT_TIMESTAMP,
  label VARCHAR(255) NOT NULL,
  note TEXT,
  fk_user_author VARCHAR(36),
  elementtype VARCHAR(100),
  fk_element INT,
  FOREIGN KEY (fk_user_author) REFERENCES llx_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

