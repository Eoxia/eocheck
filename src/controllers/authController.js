import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';
import { sendVerificationEmail } from '../services/emailService.js';
import { getClientIp } from '../middleware/ipFilter.js';

const config = getDbConfig();
const db = await getDbConnection();

const JWT_SECRET = process.env.JWT_SECRET || 'local_dev_jwt_secret_eocheck_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Register a new user (First user automatically gets admin role)
 */
export async function register(req, res, next) {
  try {
    const { email, password, first_name = '', last_name = '', role } = req.body;

    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.code = 'ERR_AUTH_1';
      return next(err);
    }

    const existingUser = (await db.query(`SELECT id FROM ${config.prefix}users WHERE email = ?`, [email]))[0][0];
    if (existingUser) {
      const err = new Error('User with this email already exists');
      err.code = 'ERR_AUTH_2';
      return next(err);
    }

    const countRow = (await db.query(`SELECT COUNT(*) as count FROM ${config.prefix}users`))[0][0];
    const isFirstUser = countRow.count === 0;
    const userRole = isFirstUser ? 'admin' : (role === 'admin' ? 'admin' : 'user');

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await db.query(`INSERT INTO ${config.prefix}users (id, email, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)`, [
      userId,
      email,
      passwordHash,
      userRole,
      first_name,
      last_name
    ]);

    // Assign to default group
    const defaultGroupName = isFirstUser ? 'Administrateurs' : 'Utilisateurs standards';
    const group = (await db.query(`SELECT id FROM ${config.prefix}user_groups WHERE name = ?`, [defaultGroupName]))[0][0];
    if (group) {
      await db.query(`INSERT INTO ${config.prefix}user_group_memberships (user_id, group_id) VALUES (?, ?)`, [userId, group.id]);
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    // Log successful registration/login audit entry
    await db.query(
      `INSERT INTO ${config.prefix}login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
       [uuidv4(), userId, email, first_name, last_name, clientIp, userAgent, 'success']
    );

    const token = jwt.sign({ id: userId, email, role: userRole, first_name, last_name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(201).json({
      message: `Inscription réussie en tant que ${userRole}`,
      user: { id: userId, email, role: userRole, first_name, last_name },
      token
    });
  } catch (error) {
    console.error('[Auth Controller] Registration error:', error);
    const err = new Error('Échec de la création du compte');
    err.code = 'ERR_AUTH_3';
    return next(err);
  }
}

/**
 * User login with Audit Trail recording (IP, ID, Nom, Prénom, Email, Statut)
 */
export async function login(req, res, next) {
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.code = 'ERR_AUTH_4';
      return next(err);
    }

    const user = (await db.query(`SELECT * FROM ${config.prefix}users WHERE email = ?`, [email]))[0][0];
    
    if (!user) {
      // Record failed login attempt
      await db.query(
        `INSERT INTO ${config.prefix}login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
         [uuidv4(), null, email, '', '', clientIp, userAgent, 'failure']
      );

      const err = new Error('Email ou mot de passe incorrect');
      err.code = 'ERR_AUTH_5';
      return next(err);
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      // Record failed login attempt
      await db.query(
        `INSERT INTO ${config.prefix}login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
         [uuidv4(), user.id, email, user.first_name || '', user.last_name || '', clientIp, userAgent, 'failure']
      );

      const err = new Error('Email ou mot de passe incorrect');
      err.code = 'ERR_AUTH_6';
      return next(err);
    }

    // Record successful login audit entry with IP, ID, Nom, Prénom, Email
    await db.query(
      `INSERT INTO ${config.prefix}login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
       [uuidv4(), user.id, user.email, user.first_name || '', user.last_name || '', clientIp, userAgent, 'success']
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, first_name: user.first_name, last_name: user.last_name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: 'Connexion réussie',
      user: { id: user.id, email: user.email, role: user.role, first_name: user.first_name, last_name: user.last_name },
      token
    });
  } catch (error) {
    console.error('[Auth Controller] Login error:', error);
    const err = new Error('Échec de la connexion au serveur');
    err.code = 'ERR_AUTH_7';
    return next(err);
  }
}

/**
 * Get current user profile
 */
export async function getMe(req, res, next) {
  try {
    const user = (await db.query(`SELECT id, email, role, first_name, last_name, phone, email_verified, email_verification_expires, created_at FROM ${config.prefix}users WHERE id = ?`, [req.user.id]))[0][0];
    if (!user) {
      const err = new Error('User not found');
      err.code = 'ERR_AUTH_8';
      return next(err);
    }
    // Inclure les permissions qui ont été chargées par le middleware auth
    user.permissions = req.user.permissions || [];
    // Récupérer les limites maximales selon les groupes de l'utilisateur
    const groupLimits = (await db.query(`
      SELECT 
        MAX(g.max_pages) as max_pages, 
        MAX(g.max_timeout) as max_timeout,
        MAX(g.max_concurrent) as max_concurrent,
        MAX(g.max_depth) as max_depth
      FROM ${config.prefix}user_groups g
      JOIN ${config.prefix}user_group_memberships m ON g.id = m.group_id
      WHERE m.user_id = ?
    `, [req.user.id]))[0][0];

    // Fallback if user is in no groups
    user.limits = {
      max_pages: groupLimits && groupLimits.max_pages !== null ? groupLimits.max_pages : 0,
      max_timeout: groupLimits && groupLimits.max_timeout !== null ? groupLimits.max_timeout : 60,
      max_concurrent: groupLimits && groupLimits.max_concurrent !== null ? groupLimits.max_concurrent : 1,
      max_depth: groupLimits && groupLimits.max_depth !== null ? groupLimits.max_depth : 3
    };

    return res.json({ user });
  } catch (error) {
    const err = new Error('Failed to fetch user profile');
    err.code = 'ERR_AUTH_9';
    return next(err);
  }
}

/**
 * Request email verification
 */
export async function requestEmailVerification(req, res, next) {
  try {
    const user = (await db.query(`SELECT email, email_verified FROM ${config.prefix}users WHERE id = ?`, [req.user.id]))[0][0];
    if (!user) return next(Object.assign(new Error('Utilisateur introuvable'), { code: 'ERR_AUTHCONTROLLER_FIX_100' }));
    if (user.email_verified) return next(Object.assign(new Error('E-mail déjà vérifié'), { code: 'ERR_AUTHCONTROLLER_FIX_101' }));

    // Generate 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Valid for 15 minutes
    await db.query(`
      UPDATE ${config.prefix}users 
      SET email_verification_code = ?, 
          email_verification_expires = DATE_ADD(NOW(), INTERVAL 15 MINUTE) 
      WHERE id = ?
    `, [code, req.user.id]);

    const sent = await sendVerificationEmail(user.email, code);
    if (!sent) {
      const err = new Error('Erreur lors de l\'envoi de l\'email');
      err.code = 'ERR_AUTH_10';
      return next(err);
    }

    return res.json({ message: 'Code de vérification envoyé avec succès' });
  } catch (error) {
    console.error('[Auth Controller] Request verification error:', error);
    const err = new Error('Failed to send verification email');
    err.code = 'ERR_AUTH_11';
    return next(err);
  }
}

/**
 * Confirm email verification
 */
export async function confirmEmailVerification(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return next(Object.assign(new Error('Le code est requis'), { code: 'ERR_AUTHCONTROLLER_FIX_102' }));

    const user = (await db.query(`SELECT email_verification_code, email_verification_expires FROM ${config.prefix}users WHERE id = ?`, [req.user.id]))[0][0];
    if (!user) return next(Object.assign(new Error('Utilisateur introuvable'), { code: 'ERR_AUTHCONTROLLER_FIX_103' }));

    if (!user.email_verification_code) {
      const err = new Error('Aucune vérification en cours');
      err.code = 'ERR_AUTH_12';
      return next(err);
    }

    // Check expiration
    const expiresAt = new Date(user.email_verification_expires).getTime();
    if (Date.now() > expiresAt) {
      const err = new Error('Le code a expiré. Veuillez en demander un nouveau.');
      err.code = 'ERR_AUTH_13';
      return next(err);
    }

    if (user.email_verification_code !== code.toString().trim()) {
      const err = new Error('Code incorrect');
      err.code = 'ERR_AUTH_14';
      return next(err);
    }

    await db.query(`
      UPDATE ${config.prefix}users 
      SET email_verified = 1, 
          email_verification_code = NULL, 
          email_verification_expires = NULL 
      WHERE id = ?
    `, [req.user.id]);

    return res.json({ message: 'E-mail vérifié avec succès !' });
  } catch (error) {
    console.error('[Auth Controller] Confirm verification error:', error);
    const err = new Error('Failed to confirm verification');
    err.code = 'ERR_AUTH_15';
    return next(err);
  }
}
