import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
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

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    // Log successful registration/login audit entry
    db.prepare(
      `INSERT INTO login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), userId, email, first_name, last_name, clientIp, userAgent, 'success');

    const token = jwt.sign({ id: userId, email, role: userRole, first_name, last_name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(201).json({
      message: `User registered successfully as ${userRole}`,
      user: { id: userId, email, role: userRole, first_name, last_name },
      token
    });
  } catch (error) {
    console.error('[Auth Controller] Registration error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to register user' });
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

      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      // Record failed login attempt
      db.prepare(
        `INSERT INTO login_logs (id, user_id, email, first_name, last_name, ip_address, user_agent, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), user.id, email, user.first_name || '', user.last_name || '', clientIp, userAgent, 'failure');

      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
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
      message: 'Login successful',
      user: { id: user.id, email: user.email, role: user.role, first_name: user.first_name, last_name: user.last_name },
      token
    });
  } catch (error) {
    console.error('[Auth Controller] Login error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to login' });
  }
}

/**
 * Get current user profile
 */
export function getMe(req, res) {
  try {
    const user = db.prepare('SELECT id, email, role, first_name, last_name, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch user profile' });
  }
}
