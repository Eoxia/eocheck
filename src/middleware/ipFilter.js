import { db } from '../db/index.js';

/**
 * Get normalized client IP address
 */
export function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }
  return ip;
}

/**
 * Express Middleware enforcing IP Whitelist and IP Blacklist
 */
export function enforceIpFilter(req, res, next) {
  try {
    const clientIp = getClientIp(req);

    // Fetch IP blacklist and whitelist from database settings
    const blacklistRow = db.prepare("SELECT value FROM settings WHERE key = 'ip_blacklist'").get();
    const whitelistRow = db.prepare("SELECT value FROM settings WHERE key = 'ip_whitelist'").get();

    const blacklist = blacklistRow ? JSON.parse(blacklistRow.value) : [];
    const whitelist = whitelistRow ? JSON.parse(whitelistRow.value) : [];

    // Check Blacklist
    if (blacklist.includes(clientIp)) {
      console.warn(`[IP Filter] Blocked request from blacklisted IP: ${clientIp}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: `L'accès depuis l'adresse IP ${clientIp} a été bloqué par la sécurité.`
      });
    }

    // Check Whitelist if populated
    if (whitelist.length > 0 && !whitelist.includes(clientIp) && !whitelist.includes('127.0.0.1')) {
      console.warn(`[IP Filter] Blocked request from non-whitelisted IP: ${clientIp}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: `L'adresse IP ${clientIp} n'est pas autorisée sur ce serveur.`
      });
    }

    next();
  } catch (error) {
    console.error('[IP Filter] Middleware error:', error);
    next();
  }
}
