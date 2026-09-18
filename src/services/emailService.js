import nodemailer from 'nodemailer';
import { db } from '../db/index.js';

/**
 * Helper to get SMTP settings from the database
 */
function getSmtpConfig() {
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
 * Helper to get Email template from the database
 */
function getEmailTemplate(templateKey) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(templateKey);
    if (row && row.value) {
      return JSON.parse(row.value);
    }
  } catch (err) {
    console.error(`[EmailService] Error fetching template ${templateKey}:`, err);
  }
  return null;
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
  const template = getEmailTemplate('email_template_verification');
  if (!template) {
    console.warn('[EmailService] Verification template is missing. Email not sent.');
    return false;
  }

  const subject = template.subject || 'Code de vérification';
  const html = template.body.replace(/\{CODE\}/g, code);

  return sendEmail(to, subject, html);
}
