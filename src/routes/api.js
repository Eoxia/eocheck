import express from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { getCsrfToken, verifyCsrfToken } from '../middleware/csrf.js';
import { enforceIpFilter } from '../middleware/ipFilter.js';
import { register, login, getMe, requestEmailVerification, confirmEmailVerification } from '../controllers/authController.js';
import { createToken, listTokens, revokeToken } from '../controllers/tokenController.js';
import { createScan, getScan, listScans, getActiveScanLogs, downloadScanPdf } from '../controllers/scanController.js';
import { listUsers, createUser, createTokenForUser, deleteUser, updateProfile } from '../controllers/userController.js';
import { getSettings, updateSettings, getLoginLogs, getPublicConfig, listEmailTemplates, updateEmailTemplate, resetEmailTemplate, testSmtp } from '../controllers/settingsController.js';
import { listGroups, createGroup, updateGroup, deleteGroup, listSystemPermissions } from '../controllers/groupController.js';

const router = express.Router();

// Enforce IP Whitelist / Blacklist filtering
router.use(enforceIpFilter);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'EOCheck API',
    domain: 'eocheck.eoxia.com',
    timestamp: new Date().toISOString()
  });
});

// Endpoint to obtain fresh CSRF token
router.get('/csrf-token', getCsrfToken);

// Special case: active logs doesn't strictly need auth for viewing running stuff if they are just reading, but we should secure it.
// Actually scans list is secured, so this should be too.
router.get('/scans/active/logs', authenticateToken, getActiveScanLogs);

// PDF Generation
router.get('/scans/:id/pdf', authenticateToken, downloadScanPdf);

// Apply CSRF Token verification to all state-modifying POST/PUT/DELETE API calls
router.use(verifyCsrfToken);

// Auth Routes
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', authenticateToken, getMe);
router.post('/auth/verify-email/request', authenticateToken, requestEmailVerification);
router.post('/auth/verify-email/confirm', authenticateToken, confirmEmailVerification);

// API Token Management Routes (Self)
router.post('/tokens', authenticateToken, createToken);
router.get('/tokens', authenticateToken, listTokens);
router.delete('/tokens/:id', authenticateToken, revokeToken);

// Settings Routes
router.get('/public-config', authenticateToken, getPublicConfig);
router.get('/settings', authenticateToken, requirePermission('page:settings'), getSettings);
router.put('/settings', authenticateToken, requirePermission('settings:edit'), updateSettings);
router.get('/settings/email-templates', authenticateToken, requirePermission('page:settings'), listEmailTemplates);
router.put('/settings/email-templates/:key', authenticateToken, requirePermission('settings:edit'), updateEmailTemplate);
router.delete('/settings/email-templates/:key', authenticateToken, requirePermission('settings:edit'), resetEmailTemplate);
router.post('/settings/smtp-test', authenticateToken, requirePermission('settings:edit'), testSmtp);

// Admin User & Security Management Routes
router.get('/admin/users', authenticateToken, requirePermission('page:users'), listUsers);
router.post('/admin/users', authenticateToken, requirePermission('users:manage'), createUser);
router.post('/admin/users/:userId/tokens', authenticateToken, requirePermission('users:manage'), createTokenForUser);
router.delete('/admin/users/:id', authenticateToken, requirePermission('users:manage'), deleteUser);

// Self User Route
router.put('/users/me', authenticateToken, updateProfile);

// Groups Management
router.get('/admin/groups', authenticateToken, requirePermission('page:groups'), listGroups);
router.post('/admin/groups', authenticateToken, requirePermission('groups:manage'), createGroup);
router.put('/admin/groups/:id', authenticateToken, requirePermission('groups:manage'), updateGroup);
router.delete('/admin/groups/:id', authenticateToken, requirePermission('groups:manage'), deleteGroup);
router.get('/admin/permissions', authenticateToken, requirePermission('page:groups'), listSystemPermissions);

// Admin Security Audit Trail Logs
router.get('/admin/login-logs', authenticateToken, requirePermission('page:system'), getLoginLogs);

// Scan Routes
router.post('/scans', authenticateToken, requirePermission('scan:launch'), createScan);
router.get('/scans/:id', authenticateToken, requirePermission('page:scans'), getScan);
router.get('/scans', authenticateToken, requirePermission('page:scans'), listScans);

export default router;
