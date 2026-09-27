import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';

const config = getDbConfig();
const db = await getDbConnection();

/**
 * Fetch all system settings (Scanner defaults, IP whitelist, IP blacklist)
 */
export async function getSettings(req, res, next) {
  try {
    const [rows] = await db.query(`SELECT key, value FROM ${config.prefix}settings`);
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
    const err = new Error('Failed to fetch settings');
    err.code = 'ERR_SETTINGS_30';
    return next(err);
  }
}

/**
 * Fetch public configuration (Max limits)
 */
export async function getPublicConfig(req, res, next) {
  try {
    const [rows] = await db.query(`SELECT key, value FROM ${config.prefix}settings WHERE key IN ('scanner_max_timeout', 'scanner_max_num_pages', 'default_scan_options')`);
    const configData = {};
    rows.forEach(r => {
      if (r.key === 'default_scan_options') {
        try { configData[r.key] = JSON.parse(r.value); } catch(e) {}
      } else {
        configData[r.key] = parseInt(r.value, 10);
      }
    });
    
    return res.json({
      scanner_max_timeout: configData.scanner_max_timeout || 180,
      scanner_max_num_pages: configData.scanner_max_num_pages || 10,
      default_scan_options: configData.default_scan_options || null
    });
  } catch (error) {
    console.error('[Settings Controller] Get public config error:', error);
    const err = new Error('Failed to fetch config');
    err.code = 'ERR_SETTINGS_31';
    return next(err);
  }
}

/**
 * Update system settings (Scanner config, IP Whitelist/Blacklist)
 */
export async function updateSettings(req, res, next) {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      const err = new Error('Settings object required');
      err.code = 'ERR_SETTINGS_32';
      return next(err);
    }

    try {
      await db.query('START TRANSACTION');

      for (const [key, value] of Object.entries(settings)) {
        let valString = value;
        if (typeof value === 'object') {
          valString = JSON.stringify(value);
        } else {
          valString = String(value);
        }
        await db.query(`
          INSERT INTO ${config.prefix}settings (\`key\`, value, updated_at) 
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP
        `, [key, valString]);
      }
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }

    return res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('[Settings Controller] Update settings error:', error);
    const err = new Error('Failed to update settings');
    err.code = 'ERR_SETTINGS_33';
    return next(err);
  }
}

import { DEFAULT_TEMPLATES, sendTestEmail } from '../services/emailService.js';

export async function listEmailTemplates(req, res, next) {
  try {
    const templates = {};
    for (const key of Object.keys(DEFAULT_TEMPLATES)) {
      const [rows] = await db.query(`SELECT value FROM ${config.prefix}settings WHERE \`key\` = ?`, [key]);
      const row = rows[0];
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
    const err = new Error('Failed to list templates');
    err.code = 'ERR_SETTINGS_34';
    return next(err);
  }
}

export async function updateEmailTemplate(req, res, next) {
  try {
    const { key } = req.params;
    if (!DEFAULT_TEMPLATES[key]) {
      const err = new Error('Template not found');
      err.code = 'ERR_SETTINGS_35';
      return next(err);
    }
    const { subject, body } = req.body;
    await db.query(`
      INSERT INTO ${config.prefix}settings (\`key\`, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=CURRENT_TIMESTAMP
    `, [key, JSON.stringify({ subject, body })]);
    
    return res.json({ message: 'Modèle mis à jour avec succès' });
  } catch (error) {
    console.error('[Settings Controller] Update template error:', error);
    const err = new Error('Failed to update template');
    err.code = 'ERR_SETTINGS_36';
    return next(err);
  }
}

export async function resetEmailTemplate(req, res, next) {
  try {
    const { key } = req.params;
    await db.query(`DELETE FROM ${config.prefix}settings WHERE \`key\` = ?`, [key]);
    return res.json({ message: 'Modèle réinitialisé aux valeurs par défaut' });
  } catch (error) {
    console.error('[Settings Controller] Reset template error:', error);
    const err = new Error('Failed to reset template');
    err.code = 'ERR_SETTINGS_37';
    return next(err);
  }
}

export async function testSmtp(req, res, next) {
  try {
    const success = await sendTestEmail(req.user.email);
    if (success) {
      return res.json({ message: 'E-mail de test envoyé avec succès à ' + req.user.email });
    } else {
      const err = new Error('Échec de l\'envoi de l\'email');
      err.code = 'ERR_SETTINGS_38';
      return next(err);
    }
  } catch (error) {
    console.error('[Settings Controller] SMTP Test error:', error);
    const err = new Error('Failed to test SMTP');
    err.code = 'ERR_SETTINGS_39';
    return next(err);
  }
}

/**
 * Admin: Get Login Audit Logs (with IP, ID, Nom, Prénom, Email)
 */
export async function getLoginLogs(req, res, next) {
  try {
    const [logs] = await db.query(
        `SELECT id, user_id, email, first_name, last_name, ip_address, user_agent, status, created_at 
         FROM ${config.prefix}login_logs 
         ORDER BY created_at DESC 
         LIMIT 100`
      );

    return res.json({ logs });
  } catch (error) {
    console.error('[Settings Controller] Get login logs error:', error);
    const err = new Error('Failed to fetch login logs');
    err.code = 'ERR_SETTINGS_40';
    return next(err);
  }
}
