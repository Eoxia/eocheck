import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { sendVerificationEmail } from '../services/emailService.js';
import { getClientIp } from '../middleware/ipFilter.js';

const JWT_SECRET = process.env.JWT_SECRET || 'local_dev_jwt_secret_eocheck_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Register a new user (First user automatically gets admin role)
 */
export async function register(req, res) {
  try {
    const { email, password, first_name = '', last_name = '', role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Bad Request', message: 'Email and password are required' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Conflict', message: 'User with this email already exists' });
    }

    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const isFirstUser = countRow.count === 0;
    const userRole = isFirstUser ? 'admin' : (role === 'admin' ? 'admin' : 'user');

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    db.prepare('INSERT INTO users (id, email, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)').run(
      userId,
      email,
      passwordHash,
      userRole,
      first_name,
      last_name
    );

    // Assign to default group
    const defaultGroupName = isFirstUser ? 'Administrateurs' : 'Utilisateurs standards';
    const group = db.prepare('SELECT id FROM user_groups WHERE name = ?').get(defaultGroupName);
    if (group) {
      db.prepare('INSERT INTO user_group_memberships (user_id, group_id) VALUES (?, ?)').run(userId, group.id);
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    // Log successful registration/login audit entry
    db.prepare(
      `INSERT INTO login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), userId, email, first_name, last_name, clientIp, userAgent, 'success');

    const token = jwt.sign({ id: userId, email, role: userRole, first_name, last_name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(201).json({
      message: `Inscription réussie en tant que ${userRole}`,
      user: { id: userId, email, role: userRole, first_name, last_name },
      token
    });
  } catch (error) {
    console.error('[Auth Controller] Registration error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Échec de la création du compte' });
  }
}

/**
 * User login with Audit Trail recording (IP, ID, Nom, Prénom, Email, Statut)
 */
export async function login(req, res) {
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Bad Request', message: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (!user) {
      // Record failed login attempt
      db.prepare(
        `INSERT INTO login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), null, email, '', '', clientIp, userAgent, 'failure');

      return res.status(401).json({ error: 'Unauthorized', message: 'Email ou mot de passe incorrect' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      // Record failed login attempt
      db.prepare(
        `INSERT INTO login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), user.id, email, user.first_name || '', user.last_name || '', clientIp, userAgent, 'failure');

      return res.status(401).json({ error: 'Unauthorized', message: 'Email ou mot de passe incorrect' });
    }

    // Record successful login audit entry with IP, ID, Nom, Prénom, Email
    db.prepare(
      `INSERT INTO login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), user.id, user.email, user.first_name || '', user.last_name || '', clientIp, userAgent, 'success');

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
    return res.status(500).json({ error: 'Internal Server Error', message: 'Échec de la connexion au serveur' });
  }
}

/**
 * Get current user profile
 */
export function getMe(req, res) {
  try {
    const user = db.prepare('SELECT id, email, role, first_name, last_name, phone, email_verified, email_verification_expires, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }
    // Inclure les permissions qui ont été chargées par le middleware auth
    user.permissions = req.user.permissions || [];
    // Récupérer les limites maximales selon les groupes de l'utilisateur
    const groupLimits = db.prepare(`
      SELECT 
        MAX(g.max_pages) as max_pages, 
        MAX(g.max_timeout) as max_timeout,
        MAX(g.max_concurrent) as max_concurrent,
        MAX(g.max_depth) as max_depth
      FROM user_groups g
      JOIN user_group_memberships m ON g.id = m.group_id
      WHERE m.user_id = ?
    `).get(req.user.id);

    // Fallback if user is in no groups
    user.limits = {
      max_pages: groupLimits && groupLimits.max_pages !== null ? groupLimits.max_pages : 0,
      max_timeout: groupLimits && groupLimits.max_timeout !== null ? groupLimits.max_timeout : 60,
      max_concurrent: groupLimits && groupLimits.max_concurrent !== null ? groupLimits.max_concurrent : 1,
      max_depth: groupLimits && groupLimits.max_depth !== null ? groupLimits.max_depth : 3
    };

    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch user profile' });
  }
}

/**
 * Request email verification
 */
export async function requestEmailVerification(req, res) {
  try {
    const user = db.prepare('SELECT email, email_verified FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not Found', message: 'Utilisateur introuvable' });
    if (user.email_verified) return res.status(400).json({ error: 'Bad Request', message: 'E-mail déjà vérifié' });

    // Generate 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Valid for 15 minutes
    db.prepare(`
      UPDATE users 
      SET email_verification_code = ?, 
          email_verification_expires = datetime('now', '+15 minutes') 
      WHERE id = ?
    `).run(code, req.user.id);

    const sent = await sendVerificationEmail(user.email, code);
    if (!sent) {
      return res.status(500).json({ error: 'Internal Server Error', message: 'Erreur lors de l\'envoi de l\'e-mail. Vérifiez la configuration SMTP.' });
    }

    return res.json({ message: 'Code de vérification envoyé avec succès' });
  } catch (error) {
    console.error('[Auth Controller] Request verification error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to send verification email' });
  }
}

/**
 * Confirm email verification
 */
export function confirmEmailVerification(req, res) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Bad Request', message: 'Le code est requis' });

    const user = db.prepare('SELECT email_verification_code, email_verification_expires FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not Found', message: 'Utilisateur introuvable' });

    if (!user.email_verification_code) {
      return res.status(400).json({ error: 'Bad Request', message: 'Aucune vérification en cours' });
    }

    // Check expiration
    const expiresAt = new Date(user.email_verification_expires + 'Z').getTime(); // sqlite UTC
    if (Date.now() > expiresAt) {
      return res.status(400).json({ error: 'Bad Request', message: 'Le code a expiré. Veuillez en demander un nouveau.' });
    }

    if (user.email_verification_code !== code.toString().trim()) {
      return res.status(400).json({ error: 'Bad Request', message: 'Code incorrect' });
    }

    db.prepare(`
      UPDATE users 
      SET email_verified = 1, 
          email_verification_code = NULL, 
          email_verification_expires = NULL 
      WHERE id = ?
    `).run(req.user.id);

    return res.json({ message: 'E-mail vérifié avec succès !' });
  } catch (error) {
    console.error('[Auth Controller] Confirm verification error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to confirm verification' });
  }
}
