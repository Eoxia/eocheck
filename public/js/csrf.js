let activeCsrfToken = '';

/**
 * Fetch a fresh CSRF Token from the API
 */
async function fetchCsrfToken() {
  try {
    const res = await fetch('/api/v1/csrf-token', { credentials: 'same-origin' });
    if (!res.ok) {
      // Fallback try relative URL
      const relRes = await fetch('./api/v1/csrf-token', { credentials: 'same-origin' });
      const relData = await relRes.json();
      activeCsrfToken = relData.csrfToken || '';
      return activeCsrfToken;
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
 * Wrapper around native fetch that injects X-CSRF-Token header on modifying requests
 */
async function secureFetch(url, options = {}) {
  options.headers = options.headers || {};
  const method = (options.method || 'GET').toUpperCase();

  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    if (!activeCsrfToken) {
      await fetchCsrfToken();
    }
    if (activeCsrfToken) {
      options.headers['X-CSRF-Token'] = activeCsrfToken;
    }
  }

  let response = await fetch(url, options);

  // If CSRF expired (403), refresh CSRF token once and retry automatically
  if (response.status === 403 && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    console.log('[CSRF Manager] CSRF token rejected. Refreshing token and retrying request...');
    await fetchCsrfToken();
    if (activeCsrfToken) {
      options.headers['X-CSRF-Token'] = activeCsrfToken;
      response = await fetch(url, options);
    }
  }

  return response;
}

// Fetch CSRF token immediately on page load
document.addEventListener('DOMContentLoaded', () => {
  fetchCsrfToken();
});
