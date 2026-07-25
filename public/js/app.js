let currentUser = null;
let authToken = localStorage.getItem('eocheck_token') || null;
let currentRawTokenToCopy = '';

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  ensureToastContainer();
  if (authToken) {
    fetchProfile();
  } else {
    renderUserNavbar();
  }
});

/**
 * Discreet Toast Notification System
 */
function ensureToastContainer() {
  if (!document.getElementById('toastContainer')) {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

function showToast(message, type = 'info', duration = 4000) {
  ensureToastContainer();
  const container = document.getElementById('toastContainer');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };

  toast.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.5rem;">
      <span>${iconMap[type] || 'ℹ️'}</span>
      <span>${escapeHtml(message)}</span>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'toastSlideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

/**
 * Fetch current logged-in user profile
 */
async function fetchProfile() {
  try {
    const apiUrl = getApiUrl('/api/v1/auth/me');
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) {
      throw new Error('Session expirée');
    }

    const data = await parseJsonResponse(res);
    currentUser = data.user;

    renderUserNavbar();
  } catch (err) {
    console.warn('Authentication check failed:', err.message);
    logout();
  }
}

/**
 * Render Navbar User Status & Role
 */
function renderUserNavbar() {
  const userNav = document.getElementById('userNav');
  const navTabs = document.getElementById('navTabs');
  
  if (currentUser) {
    if (navTabs) navTabs.style.display = 'flex';
    if (userNav) {
      const displayName = (currentUser.first_name || currentUser.last_name)
        ? `${currentUser.first_name} ${currentUser.last_name}`.trim()
        : currentUser.email;

      userNav.innerHTML = `
        <span class="role-pill ${currentUser.role}">${currentUser.role}</span>
        <span style="font-size: 0.9rem; font-weight: 500;">${escapeHtml(displayName)}</span>
        <button class="btn btn-secondary btn-sm" onclick="logout()">Déconnexion</button>
      `;
    }

    const adminUserSection = document.getElementById('adminUserSection');
    if (adminUserSection) {
      if (currentUser.role === 'admin') {
        adminUserSection.style.display = 'block';
        loadAdminUsers();
      } else {
        adminUserSection.style.display = 'none';
      }
    }
  } else {
    if (userNav) {
      userNav.innerHTML = `<a href="login.html" class="btn btn-primary btn-sm">Se connecter</a>`;
    }
  }
}

/**
 * Switch Settings Page Sub-Tabs
 */
function switchSettingsTab(tabId) {
  const tabs = ['settingsUsersTab', 'settingsScanTab', 'settingsSecurityTab'];
  tabs.forEach(t => {
    const el = document.getElementById(t);
    if (el) el.style.display = (t === tabId) ? 'block' : 'none';
  });

  const btnMap = {
    'settingsUsersTab': 'btnTabUsers',
    'settingsScanTab': 'btnTabScanParams',
    'settingsSecurityTab': 'btnTabSecurity'
  };

  Object.entries(btnMap).forEach(([t, btnId]) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (t === tabId) {
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      } else {
        btn.classList.add('btn-secondary');
        btn.classList.remove('btn-primary');
      }
    }
  });

  if (tabId === 'settingsUsersTab') loadAdminUsers();
  if (tabId === 'settingsScanTab' || tabId === 'settingsSecurityTab') loadSettings();
  if (tabId === 'settingsSecurityTab') loadLoginLogs();
}

/**
 * Toggle between Login and Register forms
 */
function toggleAuthMode(event) {
  event.preventDefault();
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authTitle = document.getElementById('authTitle');
  const toggleBtn = document.getElementById('toggleAuthBtn');

  if (loginForm.style.display === 'none') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    authTitle.textContent = '🔑 Connexion EOCheck';
    toggleBtn.textContent = "Pas encore de compte ? S'inscrire";
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    authTitle.textContent = '✨ Inscription EOCheck';
    toggleBtn.textContent = 'Déjà un compte ? Se connecter';
  }
}

/**
 * Login Submit Handler
 */
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await secureFetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || 'Erreur de connexion');

    authToken = data.token;
    localStorage.setItem('eocheck_token', authToken);
    currentUser = data.user;

    showToast('Connexion réussie !', 'success');
    renderUserNavbar();
    setTimeout(() => { window.location.href = 'scans.html'; }, 500);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Register Submit Handler
 */
async function handleRegister(event) {
  event.preventDefault();
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;

  try {
    const res = await secureFetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || "Erreur lors de l'inscription");

    showToast(`Compte créé avec succès ! (${data.user.role})`, 'success');
    authToken = data.token;
    localStorage.setItem('eocheck_token', authToken);
    currentUser = data.user;

    renderUserNavbar();
    setTimeout(() => { window.location.href = 'scans.html'; }, 500);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Logout Handler
 */
function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('eocheck_token');
  showToast('Déconnexion effectuée', 'info');
  renderUserNavbar();
  setTimeout(() => { window.location.href = 'login.html'; }, 300);
}

/**
 * Load & Render Scans List
 */
async function loadScans() {
  const tbody = document.getElementById('scansTableBody');
  if (!tbody) return;

  try {
    const apiUrl = getApiUrl('/api/v1/scans');
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await parseJsonResponse(res);

    if (!data.scans || data.scans.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-dim);">Aucun scan enregistré.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.scans.map(scan => `
      <tr>
        <td><span class="status-badge ${scan.status}">${scan.status.toUpperCase()}</span></td>
        <td style="font-weight: 500; word-break: break-all;">${escapeHtml(scan.target_url)}</td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(scan.created_at)}</td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${scan.completed_at ? formatDate(scan.completed_at) : 'En cours...'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="viewScanDetails('${scan.id}')">🔍 Inspecter</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--accent-rose);">${escapeHtml(err.message)}</td></tr>`;
  }
}

/**
 * Handle Create Scan Submission
 */
async function handleCreateScan(event) {
  event.preventDefault();
  const url = document.getElementById('scanUrl').value;
  const numPages = parseInt(document.getElementById('scanPages').value, 10);
  const timeout = parseInt(document.getElementById('scanTimeout').value, 10);
  const headless = document.getElementById('scanHeadless').checked;
  const inspectCookies = document.getElementById('scanCookies').checked;
  const inspectTrackers = document.getElementById('scanTrackers').checked;

  try {
    const res = await secureFetch('/api/v1/scans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        url,
        options: { numPages, timeout, headless, inspectCookies, inspectTrackers }
      })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || 'Erreur lors du lancement du scan');

    showToast(`Scan lancé avec succès ! ID: ${data.scan_id}`, 'success', 6000);
    loadScans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * View Detailed Scan Result Modal
 */
async function viewScanDetails(scanId) {
  const modalContent = document.getElementById('scanModalContent');
  if (!modalContent) return;

  modalContent.innerHTML = `<p style="text-align:center; color: var(--text-muted);">Chargement du rapport de scan...</p>`;
  openModal('scanResultModal');

  try {
    const apiUrl = getApiUrl(`/api/v1/scans/${scanId}`);
    const res = await fetch(apiUrl);
    const scan = await parseJsonResponse(res);

    const result = scan.result || {};
    const privacy = result.privacy_inspection || {};

    modalContent.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <div style="font-size: 0.85rem; color: var(--text-muted);">ID du Scan :</div>
        <div style="font-size: 1rem; font-weight: 700; color: var(--accent-emerald); font-family: monospace;">${escapeHtml(scan.id)}</div>
      </div>

      <div style="margin-bottom: 1rem;">
        <div style="font-size: 0.85rem; color: var(--text-muted);">URL Cible :</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-cyan); word-break: break-all;">${escapeHtml(scan.target_url)}</div>
      </div>

      <div class="form-row" style="margin-bottom: 1.25rem;">
        <div>
          <span class="form-label">Statut du Scan</span>
          <span class="status-badge ${scan.status}">${scan.status.toUpperCase()}</span>
        </div>
        <div>
          <span class="form-label">Traqueurs Détectés</span>
          <span style="font-weight: 700; color: ${privacy.trackers_count > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)'}">
            ${privacy.trackers_count || 0} traqueur(s)
          </span>
        </div>
      </div>

      ${privacy.trackers_detected && privacy.trackers_detected.length > 0 ? `
        <div style="margin-bottom: 1rem;">
          <h4 style="font-size: 0.9rem; color: var(--accent-rose); margin-bottom: 0.4rem;">🚨 Traqueurs & Analytics Identifiés :</h4>
          <ul style="padding-left: 1.2rem; color: var(--text-main); font-size: 0.9rem;">
            ${privacy.trackers_detected.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${privacy.session_recorders_detected && privacy.session_recorders_detected.length > 0 ? `
        <div style="margin-bottom: 1rem;">
          <h4 style="font-size: 0.9rem; color: var(--accent-amber); margin-bottom: 0.4rem;">⚠️ Enregistreurs de Session (Session Replay) :</h4>
          <ul style="padding-left: 1.2rem; color: var(--text-main); font-size: 0.9rem;">
            ${privacy.session_recorders_detected.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem;">Fichier / Payload JSON Complet du Scan :</h4>
      <pre class="json-viewer">${escapeHtml(JSON.stringify(scan, null, 2))}</pre>
    `;
  } catch (err) {
    modalContent.innerHTML = `<p style="color: var(--accent-rose);">${escapeHtml(err.message)}</p>`;
  }
}

/**
 * Load System & Security Settings
 */
async function loadSettings() {
  try {
    const apiUrl = getApiUrl('/api/v1/settings');
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await parseJsonResponse(res);
    const s = data.settings || {};

    const timeoutInput = document.getElementById('settingTimeout');
    if (timeoutInput && s.scanner_default_timeout) timeoutInput.value = s.scanner_default_timeout;

    const numPagesInput = document.getElementById('settingNumPages');
    if (numPagesInput && s.scanner_default_num_pages) numPagesInput.value = s.scanner_default_num_pages;

    const maxConcurrentInput = document.getElementById('settingMaxConcurrent');
    if (maxConcurrentInput && s.scanner_max_concurrent) maxConcurrentInput.value = s.scanner_max_concurrent;

    const headlessCheckbox = document.getElementById('settingHeadless');
    if (headlessCheckbox) headlessCheckbox.checked = s.scanner_default_headless !== false;

    const whitelistText = document.getElementById('ipWhitelistText');
    if (whitelistText && Array.isArray(s.ip_whitelist)) whitelistText.value = s.ip_whitelist.join('\n');

    const blacklistText = document.getElementById('ipBlacklistText');
    if (blacklistText && Array.isArray(s.ip_blacklist)) blacklistText.value = s.ip_blacklist.join('\n');
  } catch (err) {
    console.warn('Load settings notice:', err.message);
  }
}

/**
 * Save Scan Settings
 */
async function handleSaveScanSettings(event) {
  event.preventDefault();
  const timeout = parseInt(document.getElementById('settingTimeout').value, 10);
  const numPages = parseInt(document.getElementById('settingNumPages').value, 10);
  const maxConcurrent = parseInt(document.getElementById('settingMaxConcurrent').value, 10);
  const headless = document.getElementById('settingHeadless').checked;

  try {
    const res = await secureFetch('/api/v1/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        settings: {
          scanner_default_timeout: timeout,
          scanner_default_num_pages: numPages,
          scanner_max_concurrent: maxConcurrent,
          scanner_default_headless: headless
        }
      })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || 'Erreur lors de la sauvegarde');

    showToast('Paramètres de scan enregistrés avec succès', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Save IP Whitelist & Blacklist
 */
async function handleSaveIpSettings() {
  const whitelistRaw = document.getElementById('ipWhitelistText').value;
  const blacklistRaw = document.getElementById('ipBlacklistText').value;

  const whitelist = whitelistRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const blacklist = blacklistRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  try {
    const res = await secureFetch('/api/v1/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        settings: {
          ip_whitelist: whitelist,
          ip_blacklist: blacklist
        }
      })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || 'Erreur lors de la sauvegarde');

    showToast("Listes de filtrage d'IP enregistrées avec succès", 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Load Login Audit Trail Logs (IP, ID, Nom, Prénom, Email, Statut)
 */
async function loadLoginLogs() {
  const tbody = document.getElementById('loginLogsTableBody');
  if (!tbody) return;

  try {
    const apiUrl = getApiUrl('/api/v1/admin/login-logs');
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await parseJsonResponse(res);

    if (!data.logs || data.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-dim);">Aucun log de connexion enregistré.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.logs.map(log => {
      const fullName = (log.first_name || log.last_name)
        ? `${log.first_name} ${log.last_name}`.trim()
        : '-';
      const statusBadge = log.status === 'success'
        ? `<span class="status-badge completed">SUCCÈS</span>`
        : `<span class="status-badge failed">ÉCHEC</span>`;

      return `
        <tr>
          <td style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(log.created_at)}</td>
          <td><code style="color: var(--accent-cyan);">${escapeHtml(log.ip_address)}</code></td>
          <td style="font-size: 0.8rem; font-family: monospace; color: var(--text-dim);">${log.user_id ? escapeHtml(log.user_id.substring(0, 8)) + '...' : '-'}</td>
          <td style="font-weight: 500;">${escapeHtml(fullName)}</td>
          <td>${escapeHtml(log.email)}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--accent-rose);">${escapeHtml(err.message)}</td></tr>`;
  }
}

/**
 * Load API Tokens List
 */
async function loadTokens() {
  const tbody = document.getElementById('tokensTableBody');
  if (!tbody) return;

  try {
    const apiUrl = getApiUrl('/api/v1/tokens');
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await parseJsonResponse(res);

    if (!data.tokens || data.tokens.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-dim);">Aucune clé API active.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.tokens.map(token => `
      <tr>
        <td style="font-weight: 600; color: #fff;">${escapeHtml(token.name)}</td>
        <td><span class="role-pill user">${escapeHtml(token.client_app)}</span></td>
        <td><code style="color: var(--accent-cyan);">${escapeHtml(token.token_prefix)}...</code></td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(token.created_at)}</td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${token.last_used_at ? formatDate(token.last_used_at) : 'Jamais'}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="revokeToken('${token.id}')">Révoquer</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--accent-rose);">${escapeHtml(err.message)}</td></tr>`;
  }
}

/**
 * Revoke API Token
 */
async function revokeToken(tokenId) {
  if (!confirm('Êtes-vous sûr de vouloir révoquer cette clé API ?')) return;

  try {
    const res = await secureFetch(`/api/v1/tokens/${tokenId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) throw new Error('Échec de la révocation');
    showToast('Clé API révoquée avec succès', 'info');
    loadTokens();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Load Admin Users (With Nom & Prénom rendering)
 */
async function loadAdminUsers() {
  const tbody = document.getElementById('usersTableBody') || document.getElementById('settingsUsersTableBody');
  if (!tbody) return;

  try {
    const apiUrl = getApiUrl('/api/v1/admin/users');
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await parseJsonResponse(res);

    if (!data.users) return;

    tbody.innerHTML = data.users.map(u => {
      const fullName = (u.first_name || u.last_name)
        ? `${u.first_name} ${u.last_name}`.trim()
        : '-';

      return `
        <tr>
          <td style="font-size: 0.8rem; font-family: monospace; color: var(--text-dim);">${escapeHtml(u.id)}</td>
          <td style="font-weight: 600;">${escapeHtml(fullName)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td><span class="role-pill ${u.role}">${u.role.toUpperCase()}</span></td>
          <td>${u.token_count} clé(s)</td>
          <td style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(u.created_at)}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openAllocateTokenModal('${u.id}', '${escapeHtml(u.email)}')">🔑 Clé API</button>
            ${u.id !== currentUser.id ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Supprimer</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading admin users:', err);
  }
}

/**
 * Admin: Delete User
 */
async function deleteUser(userId) {
  if (!confirm('Supprimer cet utilisateur et ses accès ?')) return;

  try {
    const res = await secureFetch(`/api/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) throw new Error('Échec de la suppression');
    showToast('Utilisateur supprimé', 'info');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Handle Create Token Modal Submit
 */
async function handleCreateToken(event) {
  event.preventDefault();
  const name = document.getElementById('tokenName').value;
  const clientApp = document.getElementById('tokenClientApp').value || 'api_client';
  const expiresDaysVal = document.getElementById('tokenExpiresDays').value;
  const targetUserId = document.getElementById('tokenUserSelect').value;

  const endpoint = (targetUserId && currentUser && currentUser.role === 'admin')
    ? `/api/v1/admin/users/${targetUserId}/tokens`
    : `/api/v1/tokens`;

  try {
    const res = await secureFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name,
        client_app: clientApp,
        expires_in_days: expiresDaysVal ? parseInt(expiresDaysVal, 10) : undefined
      })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || 'Erreur de génération');

    closeModal('createTokenModal');
    currentRawTokenToCopy = data.api_token;
    document.getElementById('rawTokenDisplay').textContent = data.api_token;
    openModal('showKeyModal');

    showToast('Clé API générée avec succès', 'success');
    loadTokens();
    if (currentUser && currentUser.role === 'admin') loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Copy newly generated raw API token
 */
function copyRawToken() {
  if (currentRawTokenToCopy) {
    navigator.clipboard.writeText(currentRawTokenToCopy);
    showToast('Clé API copiée dans le presse-papier !', 'success');
  }
}

/**
 * Admin: Handle Create User / Admin Submit (With Nom and Prénom)
 */
async function handleCreateUserAdmin(event) {
  event.preventDefault();
  const email = document.getElementById('newEmail').value;
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;
  const firstName = document.getElementById('newFirstName') ? document.getElementById('newFirstName').value : '';
  const lastName = document.getElementById('newLastName') ? document.getElementById('newLastName').value : '';

  try {
    const res = await secureFetch('/api/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ email, password, role, first_name: firstName, last_name: lastName })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || 'Erreur lors de la création');

    showToast(`Compte créé avec succès (${data.user.role}) !`, 'success');
    closeModal('createUserModal');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Modal Helpers
 */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function openCreateUserModal() {
  openModal('createUserModal');
}

function openCreateTokenModal() {
  const userGroup = document.getElementById('userSelectGroup');
  if (userGroup) userGroup.style.display = 'none';
  const select = document.getElementById('tokenUserSelect');
  if (select) select.value = '';
  openModal('createTokenModal');
}

function openAllocateTokenModal(userId, userEmail) {
  const select = document.getElementById('tokenUserSelect');
  if (select) select.innerHTML = `<option value="${userId}" selected>${escapeHtml(userEmail)}</option>`;
  const userGroup = document.getElementById('userSelectGroup');
  if (userGroup) userGroup.style.display = 'block';
  openModal('createTokenModal');
}

/**
 * Utility Helpers
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
