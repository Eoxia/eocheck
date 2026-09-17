import { db } from '../db/index.js';

/**
 * Fetch all system settings (Scanner defaults, IP whitelist, IP blacklist)
 */
export function getSettings(req, res) {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};

    rows.forEach(r => {
      try {
        settings[r.key] = JSON.parse(r.value);
      } catch (e) {
        settings[r.key] = r.value;
      }
    });

    return res.json({ settings });
  } catch (error) {
    console.error('[Settings Controller] Get settings error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch settings' });
  }
}

/**
 * Fetch public configuration (Max limits)
 */
export function getPublicConfig(req, res) {
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('scanner_max_timeout', 'scanner_max_num_pages')").all();
    const config = {};
    rows.forEach(r => config[r.key] = parseInt(r.value, 10));
    
    return res.json({
      scanner_max_timeout: config.scanner_max_timeout || 180,
      scanner_max_num_pages: config.scanner_max_num_pages || 10
    });
  } catch (error) {
    console.error('[Settings Controller] Get public config error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch config' });
  }
}

/**
 * Update system settings (Scanner config, IP Whitelist/Blacklist)
 */
export function updateSettings(req, res) {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Bad Request', message: 'Settings object required' });
    }

    try {
      db.exec('BEGIN');
      const updateStmt = db.prepare(`
        INSERT INTO settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `);

      for (const [key, value] of Object.entries(settings)) {
        let valString = value;
        if (typeof value === 'object') {
          valString = JSON.stringify(value);
        } else {
          valString = String(value);
        }
        updateStmt.run(key, valString);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    return res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('[Settings Controller] Update error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update settings' });
  }
}

/**
 * Admin: Get Login Audit Logs (with IP, ID, Nom, Prénom, Email)
 */
export function getLoginLogs(req, res) {
  try {
    const logs = db
      .prepare(
        `SELECT id, user_id, email, first_name, last_name, ip_address, user_agent, status, created_at 
         FROM login_logs 
         ORDER BY created_at DESC 
         LIMIT 100`
      )
      .all();

    return res.json({ logs });
  } catch (error) {
    console.error('[Settings Controller] Get login logs error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch login logs' });
  }
}
