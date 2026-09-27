import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';

const config = getDbConfig();
const db = await getDbConnection();

/**
 * Generate a new API token for client apps (e.g. eo-tools)
 */
export async function createToken(req, res, next) {
  try {
    const { name, client_app = 'eo-tools', expires_in_days } = req.body;

    if (!name) {
      const err = new Error('Token name is required');
      err.code = 'ERR_TOKEN_42';
      return next(err);
    }

    // Generate random raw token string e.g. eoc_live_abc123...
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const rawToken = `eoc_live_${randomBytes}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenPrefix = rawToken.substring(0, 12);
    const tokenId = uuidv4();

    let expiresAt = null;
    if (expires_in_days && typeof expires_in_days === 'number') {
      const date = new Date();
      date.setDate(date.getDate() + expires_in_days);
      expiresAt = date.toISOString();
    }

    await db.query(
      `INSERT INTO ${config.prefix}api_tokens (id, user_id, token_hash, token_prefix, name, client_app, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tokenId, req.user.id, tokenHash, tokenPrefix, name, client_app, expiresAt]
    );

    return res.status(201).json({
      message: 'API Token generated successfully. Save this token now, it will not be shown again.',
      token: rawToken,
      id: tokenId,
      prefix: tokenPrefix
    });
  } catch (error) {
    console.error('[Token Controller] Create token error:', error);
    const err = new Error('Failed to create API Token');
    err.code = 'ERR_TOKEN_44';
    return next(err);
  }
}

/**
 * List active API tokens for current user
 */
export async function listTokens(req, res, next) {
  try {
    const [tokens] = await db.query(
      `SELECT id, name, client_app, token_prefix, created_at, expires_at, last_used_at 
       FROM ${config.prefix}api_tokens 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    return res.json({ tokens });
  } catch (error) {
    console.error('[Token Controller] List tokens error:', error);
    const err = new Error('Failed to list API tokens');
    err.code = 'ERR_TOKEN_45';
    return next(err);
  }
}

/**
 * Revoke/Delete an API token
 */
export async function revokeToken(req, res, next) {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      `DELETE FROM ${config.prefix}api_tokens WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      const err = new Error('API Token not found or unauthorized');
      err.code = 'ERR_TOKEN_46';
      return next(err);
    }

    return res.json({ message: 'API Token revoked successfully', token_id: id });
  } catch (error) {
    console.error('[Token Controller] Revoke token error:', error);
    const err = new Error('Failed to revoke API Token');
    err.code = 'ERR_TOKEN_47';
    return next(err);
  }
}
