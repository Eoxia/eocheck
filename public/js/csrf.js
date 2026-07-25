// Smart API URL Resolver
function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.replace(/^\/api\/v1\/?/, '').replace(/^\//, '');
  
  // If loaded via WAMP/Apache on port 80 or without node proxy, fallback to Node port 3000 if needed
  if (window.location.port !== '3000' && window.location.hostname === 'localhost' && !window.location.pathname.includes('/api/')) {
    // Check if WAMP Apache isn't routing /api/v1 natively
    return `http://localhost:3000/api/v1/${cleanEndpoint}`;
  }

  // Relative path resolution for production or Node.js server
  const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  return `${window.location.origin}${basePath}api/v1/${cleanEndpoint}`;
}

let activeCsrfToken = '';

/**
 * Fetch a fresh CSRF Token from the API safely
 */
async function fetchCsrfToken() {
  try {
    const apiUrl = getApiUrl('/api/v1/csrf-token');
    const res = await fetch(apiUrl, { credentials: 'same-origin' });
    
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      // Secondary fallback try port 3000 directly if WAMP Apache 404
      if (window.location.port !== '3000' && window.location.hostname === 'localhost') {
        const fallbackRes = await fetch('http://localhost:3000/api/v1/csrf-token');
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          activeCsrfToken = fallbackData.csrfToken || '';
          return activeCsrfToken;
        }
      }
      return '';
    }

    const data = await res.json();
    activeCsrfToken = data.csrfToken || '';
    return activeCsrfToken;
  } catch (err) {
    console.warn('[CSRF Manager] Could not fetch fresh CSRF token:', err.message);
    return '';
  }
}

/**
 * Safe Helper to parse JSON or throw clean error if server returned HTML error page
 */
async function parseJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Le serveur a retourné une réponse non-JSON (Code HTTP ${response.status}). Vérifiez que le serveur EOCheck API est bien démarré sur le port 3000.`);
  }
  return await response.json();
}

/**
 * Wrapper around native fetch that injects X-CSRF-Token header on modifying requests
 */
async function secureFetch(url, options = {}) {
  options.headers = options.headers || {};
  const method = (options.method || 'GET').toUpperCase();

  const fullUrl = url.startsWith('http') ? url : getApiUrl(url);

  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    if (!activeCsrfToken) {
      await fetchCsrfToken();
    }
    if (activeCsrfToken) {
      options.headers['X-CSRF-Token'] = activeCsrfToken;
    }
  }

  let response = await fetch(fullUrl, options);

  // If CSRF expired (403), refresh CSRF token once and retry automatically
  if (response.status === 403 && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    console.log('[CSRF Manager] CSRF token rejected. Refreshing token and retrying request...');
    await fetchCsrfToken();
    if (activeCsrfToken) {
      options.headers['X-CSRF-Token'] = activeCsrfToken;
      response = await fetch(fullUrl, options);
    }
  }

  return response;
}

// Fetch CSRF token immediately on page load
document.addEventListener('DOMContentLoaded', () => {
  fetchCsrfToken();
});
