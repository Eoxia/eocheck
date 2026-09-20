export const version = '004';
export const name = 'user_profile_email';

export function up(db) {
  // Add columns to users table safely if missing
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  
  if (!userColumns.includes('phone')) {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT DEFAULT '';`);
  }
  
  if (!userColumns.includes('email_verified')) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;`);
  }
  
  if (!userColumns.includes('email_verification_code')) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verification_code TEXT;`);
  }
  
  if (!userColumns.includes('email_verification_expires')) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verification_expires DATETIME;`);
  }

  // Set default settings for SMTP and Email templates if not exist
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);
  `);
  
  const defaultSmtpConfig = JSON.stringify({
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: 'eocheck@eoxia.com'
  });
  
  const defaultEmailTemplate = JSON.stringify({
    subject: 'EOCheck - Vérification de votre adresse e-mail',
    body: '<p>Bonjour,</p><p>Voici votre code de vérification : <strong>{CODE}</strong></p><p>Ce code est valable 15 minutes.</p>'
  });

  insertSetting.run('smtp_config', defaultSmtpConfig);
  insertSetting.run('email_template_verification', defaultEmailTemplate);
}

export function down(db) {
  // SQLite does not support DROP COLUMN easily before 3.35.0, so we just leave them.
}
