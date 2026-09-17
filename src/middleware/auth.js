import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'local_dev_jwt_secret_eocheck_2026';

export function getUserPermissions(userId) {
  try {
    const perms = db.prepare(`
      SELECT DISTINCT gp.permission_code
      FROM user_group_memberships ugm
      JOIN group_permissions gp ON ugm.group_id = gp.group_id
      WHERE ugm.user_id = ?
    `).all(userId);
    return perms.map(p => p.permission_code);
  } catch (err) {
    console.error('[Auth] Erreur récupération permissions:', err);
    return [];
  }
}

/**
 * Middleware to authenticate requests via JWT Bearer token or X-API-Token header
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const apiTokenHeader = req.headers['x-api-token'];

  let token = null;
  if (apiTokenHeader) {
    return authenticateApiToken(apiTokenHeader, req, res, next);
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing authentication token' });
  }

  // Try verifying as JWT first
  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (!err) {
      decodedUser.permissions = getUserPermissions(decodedUser.id);
      req.user = decodedUser;
      return next();
    }

    // If JWT fails, check if it is a static API token
    return authenticateApiToken(token, req, res, next);
  });
}

/**
 * Helper to validate API tokens
 */
function authenticateApiToken(rawToken, req, res, next) {
  try {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const row = db
      .prepare(
        `SELECT api_tokens.*, users.email 
         FROM api_tokens 
         JOIN users ON users.id = api_tokens.user_id 
         WHERE token_hash = ?`
      )
      .get(tokenHash);

    if (!row) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API Token' });
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Unauthorized', message: 'API Token has expired' });
    }

    // Update last used timestamp
    db.prepare('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);

    req.user = { 
      id: row.user_id, 
      email: row.email, 
      role: 'api_client', 
      client_app: row.client_app,
      permissions: getUserPermissions(row.user_id) 
    };
    req.apiToken = row;
    return next();
  } catch (error) {
    console.error('[Auth Middleware] Error validating API Token:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to authenticate token' });
  }
}

/**
 * Middleware pour vérifier une permission spécifique
 */
export function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      return res.status(403).json({ error: 'Accès interdit', message: 'Non authentifié ou permissions introuvables' });
    }
    if (req.user.permissions.includes(permissionCode) || req.user.permissions.includes('*')) {
      return next();
    }
    return res.status(403).json({ error: 'Accès interdit', message: `Permission requise: ${permissionCode}` });
  };
}
