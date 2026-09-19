import nodemailer from 'nodemailer';
import { db } from '../db/index.js';

/**
 * Default System Templates Definition
 */
export const DEFAULT_TEMPLATES = {
  'tpl_account_created': {
    name: 'Création de compte',
    subject: 'Bienvenue sur EOCheck !',
    body: '<p>Bonjour __FIRSTNAME__ __LASTNAME__,</p><p>Votre compte a été créé avec succès.</p><p>Identifiant : __EMAIL__</p>'
  },
  'tpl_scan_finished': {
    name: 'Fin de rapport (Scan terminé)',
    subject: 'EOCheck - Rapport terminé pour __SCAN_URL__',
    body: '<p>Bonjour,</p><p>Le scan de l\'URL <strong>__SCAN_URL__</strong> est terminé.</p><p><a href="__REPORT_LINK__">Cliquez ici pour voir le rapport</a></p>'
  },
  'tpl_send_report': {
    name: 'Envoi du rapport',
    subject: 'EOCheck - Rapport PDF pour __SCAN_URL__',
    body: '<p>Bonjour,</p><p>Veuillez trouver ci-joint le rapport de scan pour __SCAN_URL__.</p>'
  },
  'tpl_password_reset': {
    name: 'Réinitialisation de mot de passe',
    subject: 'EOCheck - Réinitialisation de votre mot de passe',
    body: '<p>Bonjour,</p><p>Vous avez demandé à réinitialiser votre mot de passe.</p><p>Voici votre code ou lien : <strong>__RESET_LINK__</strong></p>'
  },
  'tpl_smtp_test': {
    name: 'Test de configuration SMTP',
    subject: 'EOCheck - Test SMTP Réussi',
    body: '<p>Félicitations !</p><p>Si vous recevez ce message, c\'est que votre serveur SMTP est correctement configuré sur EOCheck.</p>'
  },
  // Keep the old one just in case, but map to new naming convention for consistency if needed. 
  // Actually, let's migrate the old 'email_template_verification' to 'tpl_verify_email'.
  'tpl_verify_email': {
    name: 'Vérification de l\'adresse e-mail',
    subject: 'EOCheck - Vérification de votre adresse e-mail',
    body: '<p>Bonjour,</p><p>Voici votre code de vérification : <strong>__CODE__</strong></p><p>Ce code est valable 15 minutes.</p>'
  }
};

/**
 * Helper to get SMTP settings from the database
 */
export function getSmtpConfig() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('smtp_config');
    if (row && row.value) {
      return JSON.parse(row.value);
    }
  } catch (err) {
    console.error('[EmailService] Error fetching smtp_config:', err);
  }
  return null;
}

/**
 * Helper to get Email template from the database or fallback to default
 */
export function getEmailTemplate(templateKey) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(templateKey);
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return {
        subject: parsed.subject || DEFAULT_TEMPLATES[templateKey]?.subject || '',
        body: parsed.body || DEFAULT_TEMPLATES[templateKey]?.body || ''
      };
    }
  } catch (err) {
    console.error(`[EmailService] Error fetching template ${templateKey}:`, err);
  }
  return {
    subject: DEFAULT_TEMPLATES[templateKey]?.subject || '',
    body: DEFAULT_TEMPLATES[templateKey]?.body || ''
  };
}

/**
 * Parse template variables (replaces __VAR__ with value)
 */
export function parseTemplate(htmlOrText, variables = {}) {
  let result = htmlOrText;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`__${key}__`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * Send an email
 */
export async function sendEmail(to, subject, html) {
  const config = getSmtpConfig();
  if (!config || !config.host) {
    console.warn('[EmailService] SMTP configuration is missing or incomplete. Email not sent.');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port || 587,
      secure: config.secure === true, // true for 465, false for other ports
      auth: {
        user: config.user,
        pass: config.pass
      }
    });

    const info = await transporter.sendMail({
      from: config.from || '"EOCheck" <eocheck@eoxia.com>',
      to,
      subject,
      html
    });

    console.log('[EmailService] Message sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('[EmailService] Error sending email:', error);
    return false;
  }
}

/**
 * Send Verification Email
 */
export async function sendVerificationEmail(to, code) {
  // Use new key
  const template = getEmailTemplate('tpl_verify_email');
  if (!template || !template.body) {
    console.warn('[EmailService] Verification template is missing. Email not sent.');
    return false;
  }

  const subject = template.subject || 'Code de vérification';
  const html = parseTemplate(template.body, { CODE: code });

  return sendEmail(to, subject, html);
}

/**
 * Send Test Email
 */
export async function sendTestEmail(to) {
  const template = getEmailTemplate('tpl_smtp_test');
  return sendEmail(to, template.subject, template.body);
}
