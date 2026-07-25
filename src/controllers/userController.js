import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';

/**
 * Middleware ensuring current user is an admin
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
  }
  next();
}

/**
 * Admin: List all users
 */
export function listUsers(req, res) {
  try {
    const users = db
      .prepare(
        `SELECT users.id, users.email, users.role, users.created_at, 
                COUNT(api_tokens.id) as token_count
         FROM users 
         LEFT JOIN api_tokens ON api_tokens.user_id = users.id 
         GROUP BY users.id 
         ORDER BY users.created_at DESC`
      )
      .all();

    return res.json({ users });
  } catch (error) {
    console.error('[User Controller] List users error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list users' });
  }
}

/**
 * Admin: Create a new user or admin account
 */
export async function createUser(req, res) {
  try {
    const { email, password, role = 'user' } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Bad Request', message: 'Email and password are required' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Conflict', message: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const validRole = role === 'admin' ? 'admin' : 'user';

    db.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      userId,
      email,
      passwordHash,
      validRole
    );

    return res.status(201).json({
      message: `Account (${validRole}) created successfully`,
      user: { id: userId, email, role: validRole }
    });
  } catch (error) {
    console.error('[User Controller] Create user error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create user' });
  }
}

/**
 * Admin: Generate an API token for a specific user
 */
export function createTokenForUser(req, res) {
  try {
    const { userId } = req.params;
    const { name, client_app = 'api_client', expires_in_days } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Bad Request', message: 'API Key name is required' });
    }

    const targetUser = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Not Found', message: 'Target user not found' });
    }

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
    ).run(tokenId, userId, tokenHash, tokenPrefix, name, client_app, expiresAt);

    return res.status(201).json({
      message: 'API Key allocated to user successfully',
      token_id: tokenId,
      user: targetUser,
      name,
      client_app,
      api_token: rawToken,
      token_prefix: tokenPrefix,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error('[User Controller] Create token for user error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to generate API Key for user' });
  }
}

/**
 * Admin: Delete a user
 */
export function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot delete your own account' });
    }

    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    return res.json({ message: 'User account deleted successfully', user_id: id });
  } catch (error) {
    console.error('[User Controller] Delete user error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete user' });
  }
}
