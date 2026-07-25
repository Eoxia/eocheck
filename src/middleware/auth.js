import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'local_dev_jwt_secret_eocheck_2026';

/**
 * Middleware to authenticate requests via JWT Bearer token or X-API-Token header (for eo-tools & clients)
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
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing authentication token' });
  }

  // Try verifying as JWT first
  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (!err) {
      req.user = decodedUser;
      return next();
    }

    // If JWT fails, check if it is a static API token
    return authenticateApiToken(token, req, res, next);
  });
}

/**
 * Helper to validate API tokens (used by eo-tools or API integrations)
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

    req.user = { id: row.user_id, email: row.email, role: 'api_client', client_app: row.client_app };
    req.apiToken = row;
    return next();
  } catch (error) {
    console.error('[Auth Middleware] Error validating API Token:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to authenticate token' });
  }
}
