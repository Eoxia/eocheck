import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { register, login, getMe } from '../controllers/authController.js';
import { createToken, listTokens, revokeToken } from '../controllers/tokenController.js';
import { createScan, getScan, listScans } from '../controllers/scanController.js';

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

// API Token Management Routes (for eo-tools and client apps)
router.post('/tokens', authenticateToken, createToken);
router.get('/tokens', authenticateToken, listTokens);
router.delete('/tokens/:id', authenticateToken, revokeToken);

// Scan Routes
router.post('/scans', authenticateToken, createScan);
router.get('/scans/:id', getScan);
router.get('/scans', authenticateToken, listScans);

export default router;
