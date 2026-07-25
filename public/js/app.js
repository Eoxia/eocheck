let currentUser = null;
let authToken = localStorage.getItem('eocheck_token') || null;
let currentRawTokenToCopy = '';

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    fetchProfile();
  } else {
    showAuthSection();
  }
});

/**
 * Fetch current logged-in user profile
 */
async function fetchProfile() {
  try {
    const res = await fetch('/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) {
      throw new Error('Session expired');
    }

    const data = await res.json();
    currentUser = data.user;

    renderUserNavbar();
    showDashboard();
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
    navTabs.style.display = 'flex';
    userNav.innerHTML = `
      <span class="role-pill ${currentUser.role}">${currentUser.role}</span>
      <span style="font-size: 0.9rem; font-weight: 500;">${escapeHtml(currentUser.email)}</span>
      <button class="btn btn-secondary btn-sm" onclick="logout()">Déconnexion</button>
    `;

    // Show Admin tab panel if user is admin
    const adminUserSection = document.getElementById('adminUserSection');
    if (currentUser.role === 'admin') {
      adminUserSection.style.display = 'block';
      loadAdminUsers();
    } else {
      adminUserSection.style.display = 'none';
    }
  } else {
    navTabs.style.display = 'none';
    userNav.innerHTML = ``;
  }
}

/**
 * Show Auth Section (Login / Register)
 */
function showAuthSection() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('navTabs').style.display = 'none';
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
}

/**
 * Show Dashboard & load initial tab
 */
function showDashboard() {
  document.getElementById('authSection').style.display = 'none';
  switchTab('scansTab');
}

/**
 * Tab Switcher
 */
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add('active');
  }

  // Highlight active nav button
  const indexMap = { 'scansTab': 0, 'usersTab': 1, 'systemTab': 2 };
  const buttons = document.querySelectorAll('.nav-tab');
  if (buttons[indexMap[tabId]]) {
    buttons[indexMap[tabId]].classList.add('active');
  }

  if (tabId === 'scansTab') loadScans();
  if (tabId === 'usersTab') {
    loadTokens();
    if (currentUser && currentUser.role === 'admin') loadAdminUsers();
  }
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
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erreur de connexion');

    authToken = data.token;
    localStorage.setItem('eocheck_token', authToken);
    currentUser = data.user;

    renderUserNavbar();
    showDashboard();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
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
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Erreur lors de l'inscription");

    alert(`Compte créé avec succès ! (${data.user.role})`);
    authToken = data.token;
    localStorage.setItem('eocheck_token', authToken);
    currentUser = data.user;

    renderUserNavbar();
    showDashboard();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  }
}

/**
 * Logout Handler
 */
function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('eocheck_token');
  renderUserNavbar();
  showAuthSection();
}

/**
 * Load & Render Scans List
 */
async function loadScans() {
  const tbody = document.getElementById('scansTableBody');
  try {
    const res = await fetch('/api/v1/scans', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

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
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--accent-rose);">Erreur de chargement des scans.</td></tr>`;
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
    const res = await fetch('/api/v1/scans', {
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

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erreur lors du lancement du scan');

    alert(`Scan lancé avec succès ! (ID: ${data.scan_id})`);
    loadScans();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  }
}

/**
 * View Detailed Scan Result Modal
 */
async function viewScanDetails(scanId) {
  const modalContent = document.getElementById('scanModalContent');
  modalContent.innerHTML = `<p style="text-align:center; color: var(--text-muted);">Chargement du rapport de scan...</p>`;
  openModal('scanResultModal');

  try {
    const res = await fetch(`/api/v1/scans/${scanId}`);
    const scan = await res.json();

    const result = scan.result || {};
    const privacy = result.privacy_inspection || {};

    modalContent.innerHTML = `
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
    modalContent.innerHTML = `<p style="color: var(--accent-rose);">Erreur lors de la récupération des détails.</p>`;
  }
}

/**
 * Load API Tokens List
 */
async function loadTokens() {
  const tbody = document.getElementById('tokensTableBody');
  try {
    const res = await fetch('/api/v1/tokens', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--accent-rose);">Erreur de chargement des clés API.</td></tr>`;
  }
}

/**
 * Revoke API Token
 */
async function revokeToken(tokenId) {
  if (!confirm('Êtes-vous sûr de vouloir révoquer cette clé API ?')) return;

  try {
    const res = await fetch(`/api/v1/tokens/${tokenId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) throw new Error('Échec de la révocation');
    loadTokens();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  }
}

/**
 * Load Admin Users (Admin only)
 */
async function loadAdminUsers() {
  const tbody = document.getElementById('usersTableBody');
  try {
    const res = await fetch('/api/v1/admin/users', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (!data.users) return;

    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(u.email)}</td>
        <td><span class="role-pill ${u.role}">${u.role.toUpperCase()}</span></td>
        <td>${u.token_count} clé(s)</td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(u.created_at)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openAllocateTokenModal('${u.id}', '${escapeHtml(u.email)}')">🔑 Clé API</button>
          ${u.id !== currentUser.id ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Supprimer</button>` : ''}
        </td>
      </tr>
    `).join('');
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
    const res = await fetch(`/api/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) throw new Error('Échec de la suppression');
    loadAdminUsers();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
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

  const endpoint = (targetUserId && currentUser.role === 'admin')
    ? `/api/v1/admin/users/${targetUserId}/tokens`
    : `/api/v1/tokens`;

  try {
    const res = await fetch(endpoint, {
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

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erreur de génération');

    closeModal('createTokenModal');
    currentRawTokenToCopy = data.api_token;
    document.getElementById('rawTokenDisplay').textContent = data.api_token;
    openModal('showKeyModal');

    loadTokens();
    if (currentUser.role === 'admin') loadAdminUsers();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  }
}

/**
 * Copy newly generated raw API token
 */
function copyRawToken() {
  if (currentRawTokenToCopy) {
    navigator.clipboard.writeText(currentRawTokenToCopy);
    alert('Clé API copiée dans le presse-papier !');
  }
}

/**
 * Admin: Handle Create User / Admin Submit
 */
async function handleCreateUserAdmin(event) {
  event.preventDefault();
  const email = document.getElementById('newEmail').value;
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;

  try {
    const res = await fetch('/api/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ email, password, role })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erreur lors de la création');

    alert(`Compte créé avec succès (${data.user.role}) !`);
    closeModal('createUserModal');
    loadAdminUsers();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  }
}

/**
 * Modal Helpers
 */
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function openCreateUserModal() {
  openModal('createUserModal');
}

function openCreateTokenModal() {
  document.getElementById('userSelectGroup').style.display = 'none';
  document.getElementById('tokenUserSelect').value = '';
  openModal('createTokenModal');
}

function openAllocateTokenModal(userId, userEmail) {
  const select = document.getElementById('tokenUserSelect');
  select.innerHTML = `<option value="${userId}" selected>${escapeHtml(userEmail)}</option>`;
  document.getElementById('userSelectGroup').style.display = 'block';
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
