export const version = '005';
export const name = 'scan_profiles_actioncomm';

export function up(db) {
  // Table scan_profiles
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_profiles (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT,
      label TEXT NOT NULL,
      description TEXT,
      max_pages INTEGER DEFAULT 100,
      timeout_secs INTEGER DEFAULT 300,
      max_depth INTEGER DEFAULT 3,
      headless INTEGER DEFAULT 1,
      inspect_cookies INTEGER DEFAULT 1,
      detect_trackers INTEGER DEFAULT 1,
      capture_images INTEGER DEFAULT 0,
      cookie_action TEXT DEFAULT 'ignore',
      fk_user_owner TEXT, -- string id
      fk_usergroup INTEGER,
      datec DATETIME DEFAULT CURRENT_TIMESTAMP,
      tms DATETIME DEFAULT CURRENT_TIMESTAMP,
      fk_user_creat TEXT, -- string id
      fk_user_modif TEXT, -- string id,
      FOREIGN KEY (fk_user_owner) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (fk_usergroup) REFERENCES user_groups(id) ON DELETE SET NULL,
      FOREIGN KEY (fk_user_creat) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (fk_user_modif) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Trigger to update tms on scan_profiles
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trigger_scan_profiles_tms
    AFTER UPDATE ON scan_profiles
    FOR EACH ROW
    BEGIN
      UPDATE scan_profiles SET tms = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid;
    END;
  `);

  // Table actioncomm
  db.exec(`
    CREATE TABLE IF NOT EXISTS actioncomm (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      datep DATETIME DEFAULT CURRENT_TIMESTAMP,
      label TEXT NOT NULL,
      note TEXT,
      fk_user_author TEXT,
      elementtype TEXT,
      fk_element INTEGER,
      FOREIGN KEY (fk_user_author) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
}

export function down(db) {
  db.exec(`DROP TRIGGER IF EXISTS trigger_scan_profiles_tms;`);
  db.exec(`DROP TABLE IF EXISTS actioncomm;`);
  db.exec(`DROP TABLE IF EXISTS scan_profiles;`);
}
