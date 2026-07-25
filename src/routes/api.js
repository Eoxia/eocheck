import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { register, login, getMe } from '../controllers/authController.js';
import { createToken, listTokens, revokeToken } from '../controllers/tokenController.js';
import { createScan, getScan, listScans } from '../controllers/scanController.js';
import { requireAdmin, listUsers, createUser, createTokenForUser, deleteUser } from '../controllers/userController.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'EOCheck API',
    domain: 'eocheck.eoxia.com',
    timestamp: new Date().toISOString()
  });
});

// Auth Routes
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', authenticateToken, getMe);

// API Token Management Routes (Self)
router.post('/tokens', authenticateToken, createToken);
router.get('/tokens', authenticateToken, listTokens);
router.delete('/tokens/:id', authenticateToken, revokeToken);

// Admin User Management Routes
router.get('/admin/users', authenticateToken, requireAdmin, listUsers);
router.post('/admin/users', authenticateToken, requireAdmin, createUser);
router.post('/admin/users/:userId/tokens', authenticateToken, requireAdmin, createTokenForUser);
router.delete('/admin/users/:id', authenticateToken, requireAdmin, deleteUser);

// Scan Routes
router.post('/scans', authenticateToken, createScan);
router.get('/scans/:id', getScan);
router.get('/scans', authenticateToken, listScans);

export default router;
