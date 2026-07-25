import crypto from 'crypto';

// In-memory store for active CSRF tokens (Token -> expiration timestamp)
const csrfTokensStore = new Map();

// Clean up expired tokens periodically (every 15 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of csrfTokensStore.entries()) {
    if (expiry < now) {
      csrfTokensStore.delete(token);
    }
  }
}, 15 * 60 * 1000);

/**
 * Generate a new CSRF Token valid for 2 hours
 */
export function generateCsrfToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = Date.now() + 2 * 60 * 60 * 1000; // 2 hours validity
  csrfTokensStore.set(token, expiry);
  return token;
}

/**
 * Express Controller to deliver fresh CSRF Token
 */
export function getCsrfToken(req, res) {
  const csrfToken = generateCsrfToken();
  return res.json({ csrfToken });
}

/**
 * Express Middleware to verify CSRF Token on state-modifying HTTP requests
 */
export function verifyCsrfToken(req, res, next) {
  // Allow safe HTTP methods without CSRF check
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // If request uses API token (from external machine/cron), bypass frontend CSRF
  if (req.headers['x-api-token']) {
    return next();
  }

  const clientToken = req.headers['x-csrf-token'] || (req.body && req.body._csrf);

  if (!clientToken) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CSRF token is missing. Please refresh the page and try again.'
    });
  }

  const expiry = csrfTokensStore.get(clientToken);

  if (!expiry || expiry < Date.now()) {
    csrfTokensStore.delete(clientToken);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or expired CSRF token. Please refresh the page.'
    });
  }

  next();
}
