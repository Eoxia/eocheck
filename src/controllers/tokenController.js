import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';

/**
 * Generate a new API token for client apps (e.g. eo-tools)
 */
export function createToken(req, res) {
  try {
    const { name, client_app = 'eo-tools', expires_in_days } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Bad Request', message: 'Token name is required' });
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

    db.prepare(
      `INSERT INTO api_tokens (id, user_id, token_hash, token_prefix, name, client_app, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(tokenId, req.user.id, tokenHash, tokenPrefix, name, client_app, expiresAt);

    return res.status(201).json({
      message: 'API Token generated successfully. Save this token now, it will not be shown again.',
      token_id: tokenId,
      name,
      client_app,
      api_token: rawToken, // Displayed ONLY once upon creation
      token_prefix: tokenPrefix,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error('[Token Controller] Create token error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create API Token' });
  }
}

/**
 * List active API tokens for current user
 */
export function listTokens(req, res) {
  try {
    const tokens = db
      .prepare(
        `SELECT id, name, client_app, token_prefix, created_at, expires_at, last_used_at 
         FROM api_tokens 
         WHERE user_id = ? 
         ORDER BY created_at DESC`
      )
      .all(req.user.id);

    return res.json({ tokens });
  } catch (error) {
    console.error('[Token Controller] List tokens error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list API tokens' });
  }
}

/**
 * Revoke/Delete an API token
 */
export function revokeToken(req, res) {
  try {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'API Token not found or unauthorized' });
    }

    return res.json({ message: 'API Token revoked successfully', token_id: id });
  } catch (error) {
    console.error('[Token Controller] Revoke token error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to revoke API Token' });
  }
}
