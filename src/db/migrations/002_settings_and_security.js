export const version = '002';
export const name = 'settings_and_security';

export function up(db) {
  // Add first_name and last_name columns to users table safely if missing
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userColumns.includes('first_name')) {
    db.exec(`ALTER TABLE users ADD COLUMN first_name TEXT DEFAULT '';`);
  }
  if (!userColumns.includes('last_name')) {
    db.exec(`ALTER TABLE users ADD COLUMN last_name TEXT DEFAULT '';`);
  }

  // Add progress_percent and progress_step columns to scans table if missing
  const scanColumns = db.prepare("PRAGMA table_info(scans)").all().map(c => c.name);
  if (!scanColumns.includes('progress_percent')) {
    db.exec(`ALTER TABLE scans ADD COLUMN progress_percent INTEGER DEFAULT 0;`);
  }
  if (!scanColumns.includes('progress_step')) {
    db.exec(`ALTER TABLE scans ADD COLUMN progress_step TEXT DEFAULT '';`);
  }

  // Create settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default system settings if not already present
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);
  `);
  
  insertSetting.run('scanner_default_num_pages', '0');
  insertSetting.run('scanner_default_timeout', '60');
  insertSetting.run('scanner_default_headless', 'true');
  insertSetting.run('scanner_max_concurrent', '3');
  insertSetting.run('ip_whitelist', '[]');
  insertSetting.run('ip_blacklist', '[]');

  // Create login audit logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT NOT NULL,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      ip_address TEXT NOT NULL,
      user_agent TEXT,
      status TEXT NOT NULL, -- success, failure
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
}

export function down(db) {
  db.exec(`DROP TABLE IF EXISTS login_logs;`);
  db.exec(`DROP TABLE IF EXISTS settings;`);
}
