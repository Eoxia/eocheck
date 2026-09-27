import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';

const config = getDbConfig();
const db = await getDbConnection();

/**
 * Middleware ensuring current user is an admin
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    const err = new Error('Admin access required');
    err.code = 'ERR_USER_48';
    return next(err);
  }
  next();
}

/**
 * Admin: List all users with Nom, Prénom, Email, Role
 */
export async function listUsers(req, res, next) {
  try {
    const [users] = await db.query(
        `SELECT users.id, users.email, users.first_name, users.last_name, users.role, users.created_at, 
                COUNT(api_tokens.id) as token_count
         FROM ${config.prefix}users users
         LEFT JOIN ${config.prefix}api_tokens api_tokens ON api_tokens.user_id = users.id 
         GROUP BY users.id 
         ORDER BY users.created_at DESC`
      );

    return res.json({ users });
  } catch (error) {
    console.error('[User Controller] List users error:', error);
    const err = new Error('Failed to list users');
    err.code = 'ERR_USER_49';
    return next(err);
  }
}

/**
 * Admin: Create a new user or admin account with Nom and Prénom
 */
export async function createUser(req, res, next) {
  try {
    const { email, password, first_name = '', last_name = '', role = 'user' } = req.body;

    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.code = 'ERR_USER_50';
      return next(err);
    }

    const existingUser = (await db.query(`SELECT id FROM ${config.prefix}users WHERE email = ?`, [email]))[0][0];
    if (existingUser) {
      const err = new Error('User with this email already exists');
      err.code = 'ERR_USER_51';
      return next(err);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const validRole = role === 'admin' ? 'admin' : 'user';

    await db.query(`INSERT INTO ${config.prefix}users (id, email, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)`, [
      userId,
      email,
      passwordHash,
      validRole,
      first_name,
      last_name
    ]);

    return res.status(201).json({
      message: `Account (${validRole}) created successfully`,
      user: { id: userId, email, first_name, last_name, role: validRole }
    });
  } catch (error) {
    console.error('[User Controller] Create user error:', error);
    const err = new Error('Failed to create user');
    err.code = 'ERR_USER_52';
    return next(err);
  }
}

/**
 * Admin: Generate an API token for a specific user
 */
export async function createTokenForUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { name, client_app = 'api_client', expires_in_days } = req.body;

    if (!name) {
      const err = new Error('API Key name is required');
      err.code = 'ERR_USER_53';
      return next(err);
    }

    const targetUser = (await db.query(`SELECT id, email, first_name, last_name FROM ${config.prefix}users WHERE id = ?`, [userId]))[0][0];
    if (!targetUser) {
      const err = new Error('Target user not found');
      err.code = 'ERR_USER_54';
      return next(err);
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

    await db.query(
      `INSERT INTO ${config.prefix}api_tokens (id, user_id, token_hash, token_prefix, name, client_app, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
       [tokenId, userId, tokenHash, tokenPrefix, name, client_app, expiresAt]
    );

    return res.status(201).json({
      message: 'API Key allocated to user successfully',
      token: rawToken,
      id: tokenId,
      prefix: tokenPrefix
    });
  } catch (error) {
    console.error('[User Controller] Create token for user error:', error);
    const err = new Error('Failed to generate API Key for user');
    err.code = 'ERR_USER_56';
    return next(err);
  }
}

/**
 * Admin: Delete a user
 */
export async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      const err = new Error('Cannot delete your own account');
      err.code = 'ERR_USER_57';
      return next(err);
    }

    const [result] = await db.query(`DELETE FROM ${config.prefix}users WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      const err = new Error('User not found');
      err.code = 'ERR_USER_58';
      return next(err);
    }

    return res.json({ message: 'User account deleted successfully', user_id: id });
  } catch (error) {
    console.error('[User Controller] Delete user error:', error);
    const err = new Error('Failed to delete user');
    err.code = 'ERR_USER_59';
    return next(err);
  }
}

/**
 * Self: Update profile
 */
export async function updateProfile(req, res, next) {
  try {
    const { first_name, last_name, phone, email } = req.body;
    
    // Si l'utilisateur change d'e-mail, on doit s'assurer qu'il n'est pas déjà pris
    if (email && email !== req.user.email) {
      const existing = (await db.query(`SELECT id FROM ${config.prefix}users WHERE email = ?`, [email]))[0][0];
      if (existing) {
        const err = new Error('Cette adresse e-mail est déjà utilisée.');
        err.code = 'ERR_USER_60';
        return next(err);
      }
      
      // Mise à jour complète avec changement d'e-mail : on désactive la vérification
      await db.query(`
        UPDATE ${config.prefix}users 
        SET first_name = ?, last_name = ?, phone = ?, email = ?, email_verified = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [first_name || '', last_name || '', phone || '', email, req.user.id]);
    } else {
      // Simple mise à jour sans toucher à l'e-mail
      await db.query(`
        UPDATE ${config.prefix}users 
        SET first_name = ?, last_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [first_name || '', last_name || '', phone || '', req.user.id]);
    }

    return res.json({ message: 'Profil mis à jour avec succès' });
  } catch (error) {
    console.error('[User Controller] Update profile error:', error);
    const err = new Error('Failed to update profile');
    err.code = 'ERR_USER_61';
    return next(err);
  }
}
