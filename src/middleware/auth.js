import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';

const config = getDbConfig();
const db = await getDbConnection();

const JWT_SECRET = process.env.JWT_SECRET || 'local_dev_jwt_secret_eocheck_2026';

export async function getUserPermissions(userId) {
  try {
    const [perms] = await db.query(`
      SELECT DISTINCT gp.permission_code
      FROM ${config.prefix}user_group_memberships ugm
      JOIN ${config.prefix}group_permissions gp ON ugm.group_id = gp.group_id
      WHERE ugm.user_id = ?
    `, [userId]);
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
    const err = new Error('Missing authentication token');
    err.code = 'ERR_AUTH_62';
    return next(err);
  }

  // Try verifying as JWT first
  jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
    if (!err) {
      decodedUser.permissions = await getUserPermissions(decodedUser.id);
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
async function authenticateApiToken(rawToken, req, res, next) {
  try {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const [rows] = await db.query(
      `SELECT a.*, u.email 
       FROM ${config.prefix}api_tokens a
       JOIN ${config.prefix}users u ON u.id = a.user_id 
       WHERE a.token_hash = ?`, [tokenHash]
    );
    const row = rows[0];

    if (!row) {
      const err = new Error('Invalid API Token');
      err.code = 'ERR_AUTH_63';
      return next(err);
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      const err = new Error('API Token has expired');
      err.code = 'ERR_AUTH_64';
      return next(err);
    }

    // Update last used timestamp
    await db.query(`UPDATE ${config.prefix}api_tokens SET last_used_at = NOW() WHERE id = ?`, [row.id]);

    req.user = { 
      id: row.user_id, 
      email: row.email, 
      role: 'api_client', 
      client_app: row.client_app,
      permissions: await getUserPermissions(row.user_id) 
    };
    req.apiToken = row;
    return next();
  } catch (error) {
    console.error('[Auth Middleware] Error validating API Token:', error);
    const err = new Error('Failed to authenticate token');
    err.code = 'ERR_AUTH_65';
    return next(err);
  }
}

/**
 * Middleware pour vérifier une permission spécifique
 */
export function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      const err = new Error('Non authentifié ou permissions introuvables');
      err.code = 'ERR_AUTH_66';
      return next(err);
    }
    if (req.user.permissions.includes(permissionCode) || req.user.permissions.includes('*')) {
      return next();
    }
    return next(Object.assign(new Error(`Permission requise: ${permissionCode}`), { code: 'ERR_AUTH_PERMISSION' }));
  };
}
