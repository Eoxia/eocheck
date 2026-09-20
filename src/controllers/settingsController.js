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
    const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('scanner_max_timeout', 'scanner_max_num_pages', 'default_scan_options')").all();
    const config = {};
    rows.forEach(r => {
      if (r.key === 'default_scan_options') {
        try { config[r.key] = JSON.parse(r.value); } catch(e) {}
      } else {
        config[r.key] = parseInt(r.value, 10);
      }
    });
    
    return res.json({
      scanner_max_timeout: config.scanner_max_timeout || 180,
      scanner_max_num_pages: config.scanner_max_num_pages || 10,
      default_scan_options: config.default_scan_options || null
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
    console.error('[Settings Controller] Update settings error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update settings' });
  }
}

import { DEFAULT_TEMPLATES, sendTestEmail } from '../services/emailService.js';

export function listEmailTemplates(req, res) {
  try {
    const templates = {};
    for (const key of Object.keys(DEFAULT_TEMPLATES)) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      const isCustom = !!row;
      const parsed = isCustom ? JSON.parse(row.value) : null;
      
      templates[key] = {
        name: DEFAULT_TEMPLATES[key].name,
        subject: isCustom ? parsed.subject : DEFAULT_TEMPLATES[key].subject,
        body: isCustom ? parsed.body : DEFAULT_TEMPLATES[key].body,
        isCustom
      };
    }
    return res.json({ templates });
  } catch (error) {
    console.error('[Settings Controller] List templates error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list templates' });
  }
}

export function updateEmailTemplate(req, res) {
  try {
    const { key } = req.params;
    if (!DEFAULT_TEMPLATES[key]) {
      return res.status(404).json({ error: 'Not Found', message: 'Template not found' });
    }
    const { subject, body } = req.body;
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
    `).run(key, JSON.stringify({ subject, body }));
    
    return res.json({ message: 'Modèle mis à jour avec succès' });
  } catch (error) {
    console.error('[Settings Controller] Update template error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update template' });
  }
}

export function resetEmailTemplate(req, res) {
  try {
    const { key } = req.params;
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    return res.json({ message: 'Modèle réinitialisé aux valeurs par défaut' });
  } catch (error) {
    console.error('[Settings Controller] Reset template error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to reset template' });
  }
}

export async function testSmtp(req, res) {
  try {
    const success = await sendTestEmail(req.user.email);
    if (success) {
      return res.json({ message: 'E-mail de test envoyé avec succès à ' + req.user.email });
    } else {
      return res.status(500).json({ error: 'SMTP Error', message: 'Échec de l\'envoi. Vérifiez les logs du serveur.' });
    }
  } catch (error) {
    console.error('[Settings Controller] SMTP Test error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to test SMTP' });
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
