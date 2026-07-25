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
 * Update system settings (Scanner config, IP Whitelist/Blacklist)
 */
export function updateSettings(req, res) {
  try {
    const { settings = {} } = req.body;

    const updateStmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        updateStmt.run(key, valueStr);
      }
    })();

    return res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('[Settings Controller] Update settings error:', error);
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
