let currentUser = null;
let authToken = localStorage.getItem('eocheck_token') || null;
let currentRawTokenToCopy = '';
let scanPollingTimer = null;
let loadedScansCache = {};

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
 * Calculate human-readable duration between start and end dates
 */
function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return 'En cours...';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const diffSec = Math.max(0, Math.round((end - start) / 1000));

  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
}

/**
 * Re-launch a scan using the EXACT PRESERVED options of a specific scan row
 */
async function rescanTargetByScanId(scanId) {
  try {
    let originalScan = loadedScansCache[scanId];

    if (!originalScan) {
      const apiUrl = getApiUrl(`/api/v1/scans/${scanId}`);
      const detailRes = await fetch(apiUrl);
      originalScan = await parseJsonResponse(detailRes);
    }

    if (!originalScan || !originalScan.target_url) {
      throw new Error('Impossible de récupérer la ligne de scan d\'origine');
    }

    const targetUrl = originalScan.target_url;
    const preservedOptions = originalScan.options || {};

    const res = await secureFetch('/api/v1/scans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        url: targetUrl,
        options: preservedOptions
      })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || 'Erreur lors du relancement du scan');

    showToast(`Scan relancé avec les MÊMES paramètres conservés ! (ID: ${data.scan_id})`, 'success', 5000);
    loadScans();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Open image in a full-size preview Lightbox Modal
 */
function openImageLightbox(imgSrc, title) {
  let modal = document.getElementById('imageLightboxModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imageLightboxModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal" style="max-width: 900px; text-align: center; background: #0b0f19;">
        <div class="modal-header">
          <h3 class="modal-title" id="lightboxTitle">Aperçu de la Capture d'Écran</h3>
          <button class="close-btn" onclick="closeModal('imageLightboxModal')">&times;</button>
        </div>
        <img id="lightboxImg" src="" style="width: 100%; max-height: 75vh; object-fit: contain; border-radius: 8px; border: 1px solid var(--border-color);" />
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('lightboxTitle').textContent = title || 'Aperçu de la capture d\'écran';
  document.getElementById('lightboxImg').src = imgSrc;
  openModal('imageLightboxModal');
}

/**
 * Load & Render Scans List
 */
async function loadScans() {
  const tbody = document.getElementById('scansTableBody');
  const pollingBadge = document.getElementById('livePollingBadge');
  if (!tbody) return;

  try {
    const apiUrl = getApiUrl('/api/v1/scans');
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await parseJsonResponse(res);

    if (!data.scans || data.scans.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-dim);">Aucun scan enregistré.</td></tr>`;
      if (pollingBadge) pollingBadge.style.display = 'none';
      return;
    }

    let hasActiveScans = false;

    data.scans.forEach(s => {
      loadedScansCache[s.id] = s;
    });

    tbody.innerHTML = data.scans.map(scan => {
      const isProcessing = scan.status === 'processing' || scan.status === 'pending';
      if (isProcessing) hasActiveScans = true;

      const pct = Math.min(100, Math.max(0, scan.progress_percent || (scan.status === 'completed' ? 100 : (scan.status === 'pending' ? 10 : 50))));
      const stepText = scan.progress_step || (isProcessing ? 'Analyse en cours...' : scan.status.toUpperCase());

      const statusCell = isProcessing
        ? `<div class="progress-track" title="${escapeHtml(stepText)}">
             <div class="progress-bar-fill" style="width: ${pct}%;"></div>
             <span class="progress-bar-text">${pct}% - ${escapeHtml(stepText)}</span>
           </div>`
        : `<span class="status-badge ${scan.status}">${scan.status.toUpperCase()}</span>`;

      return `
        <tr>
          <td>${statusCell}</td>
          <td style="font-weight: 500; word-break: break-all;">${escapeHtml(scan.target_url)}</td>
          <td style="color: var(--text-muted); font-size: 0.85rem;">${formatDate(scan.created_at)}</td>
          <td style="color: var(--text-muted); font-size: 0.85rem;">${scan.completed_at ? formatDate(scan.completed_at) : 'En cours...'}</td>
          <td style="font-weight: 600; color: var(--accent-cyan); font-size: 0.85rem;">${formatDuration(scan.created_at, scan.completed_at)}</td>
          <td>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              <button class="btn btn-secondary btn-sm" onclick="viewScanDetails('${scan.id}')">🔍 Inspecter</button>
              <a href="scan-report.html?id=${scan.id}" target="_blank" class="btn btn-secondary btn-sm">📄 Rapport PDF</a>
            </div>
          </td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="rescanTargetByScanId('${scan.id}')">🔄 Relancer</button>
          </td>
        </tr>
      `;
    }).join('');

    if (hasActiveScans) {
      if (pollingBadge) pollingBadge.style.display = 'inline';
      if (scanPollingTimer) clearTimeout(scanPollingTimer);
      scanPollingTimer = setTimeout(loadScans, 2000);
    } else {
      if (pollingBadge) pollingBadge.style.display = 'none';
      if (scanPollingTimer) clearTimeout(scanPollingTimer);
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--accent-rose);">${escapeHtml(err.message)}</td></tr>`;
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
  const takeScreenshots = document.getElementById('scanScreenshots') ? document.getElementById('scanScreenshots').checked : true;

  try {
    const res = await secureFetch('/api/v1/scans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        url,
        options: { numPages, timeout, headless, inspectCookies, inspectTrackers, takeScreenshots }
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
    const opts = scan.options || {};
    const privacy = result.privacy_inspection || {};
    const scannedUrls = result.scanned_urls || [scan.target_url];
    const screenshots = result.screenshots || [];

    modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
        <div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">ID du Scan :</div>
          <div style="font-size: 1rem; font-weight: 700; color: var(--accent-emerald); font-family: monospace;">${escapeHtml(scan.id)}</div>
        </div>
        <div>
          <a href="scan-report.html?id=${scan.id}" target="_blank" class="btn btn-primary btn-sm">📄 Ouvrir la Page Rapport PDF ↗</a>
        </div>
      </div>

      <div style="margin-bottom: 1.25rem;">
        <div style="font-size: 0.85rem; color: var(--text-muted);">URL Cible :</div>
        <div style="font-size: 1.15rem; font-weight: 700; color: var(--accent-cyan); word-break: break-all;">${escapeHtml(scan.target_url)}</div>
      </div>

      <div class="form-row" style="margin-bottom: 1.25rem;">
        <div>
          <span class="form-label">Statut du Scan</span>
          <span class="status-badge ${scan.status}">${scan.status.toUpperCase()}</span>
        </div>
        <div>
          <span class="form-label">Date Début / Fin</span>
          <span style="font-size: 0.85rem; color: #fff;">${formatDate(scan.created_at)} ➔ ${scan.completed_at ? formatDate(scan.completed_at) : 'En cours'}</span>
        </div>
        <div>
          <span class="form-label">Durée d'Analyse</span>
          <span style="font-weight: 700; color: var(--accent-cyan);">${formatDuration(scan.created_at, scan.completed_at)}</span>
        </div>
      </div>

      <!-- Preserved Scan Options Summary Box -->
      <div style="margin-bottom: 1.25rem; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); padding: 0.85rem; border-radius: var(--radius-sm);">
        <h4 style="font-size: 0.88rem; color: var(--primary); margin-bottom: 0.4rem;">🎛️ Paramètres Demandés pour ce Scan :</h4>
        <div style="font-size: 0.82rem; color: var(--text-main); display: flex; flex-wrap: wrap; gap: 1rem;">
          <span>📄 <b>Pages secondaires (crawl) :</b> ${opts.numPages !== undefined ? opts.numPages : 0}</span>
          <span>⏱️ <b>Timeout :</b> ${opts.timeout || 60}s</span>
          <span>🕶️ <b>Headless :</b> ${opts.headless !== false ? 'Oui' : 'Non'}</span>
          <span>📸 <b>Captures d'écran :</b> ${opts.takeScreenshots !== false ? 'Oui' : 'Non'}</span>
          <span>🍪 <b>Cookies :</b> ${opts.inspectCookies !== false ? 'Oui' : 'Non'}</span>
          <span>🚨 <b>Traqueurs :</b> ${opts.inspectTrackers !== false ? 'Oui' : 'Non'}</span>
        </div>
      </div>

      <!-- Scanned URLs List Section -->
      <div style="margin-bottom: 1.5rem; background: rgba(0, 0, 0, 0.3); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <h4 style="font-size: 0.95rem; color: var(--accent-cyan); margin-bottom: 0.5rem;">🔗 Liste des URLs Explorées & Scannées (${scannedUrls.length}) :</h4>
        <ul style="padding-left: 1.2rem; color: var(--text-main); font-size: 0.88rem; word-break: break-all;">
          ${scannedUrls.map(u => `<li><a href="${escapeHtml(u)}" target="_blank" style="color: var(--accent-cyan); text-decoration: none;">${escapeHtml(u)}</a></li>`).join('')}
        </ul>
      </div>

      <!-- Page Screenshots Gallery Section (Clickable Lightbox Preview) -->
      ${screenshots && screenshots.length > 0 ? `
        <div style="margin-bottom: 1.5rem;">
          <h4 style="font-size: 0.95rem; color: var(--accent-emerald); margin-bottom: 0.5rem;">📸 Captures d'Écran des Pages Scannées (${screenshots.length}) - <i>Cliquez pour agrandir</i> :</h4>
          <div class="screenshot-grid">
            ${screenshots.map(s => `
              <div class="screenshot-card" style="cursor: pointer;" onclick="openImageLightbox('${s.preview}', '${escapeHtml(s.title)}')">
                <div style="font-size: 0.82rem; font-weight: 600; color: #fff; word-break: break-all;">${escapeHtml(s.title || s.url)}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 0.4rem; word-break: break-all;">${escapeHtml(s.url)}</div>
                <img src="${s.preview}" alt="${escapeHtml(s.title)}" class="screenshot-img" />
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

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

      <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem;">Payload JSON Complet du Scan :</h4>
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
 * Load Login Audit Trail Logs
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
 * Load Admin Users
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
 * Handle Create User / Admin Account
 */
async function handleCreateUserAdmin(event) {
  event.preventDefault();
  const email = document.getElementById('newEmail').value;
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole') ? document.getElementById('newRole').value : 'user';
  const firstName = document.getElementById('newFirstName') ? document.getElementById('newFirstName').value : '';
  const lastName = document.getElementById('newLastName') ? document.getElementById('newLastName').value : '';

  if (!email || !password) {
    showToast('L\'adresse e-mail et le mot de passe sont requis.', 'error');
    return;
  }

  const isUserAdmin = currentUser && currentUser.role === 'admin' && authToken;
  const endpoint = isUserAdmin ? '/api/v1/admin/users' : '/api/v1/auth/register';

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    let res = await secureFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, role, first_name: firstName, last_name: lastName })
    });

    if ((res.status === 401 || res.status === 403) && endpoint !== '/api/v1/auth/register') {
      res = await secureFetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role, first_name: firstName, last_name: lastName })
      });
    }

    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.message || 'Erreur lors de la création du compte');

    showToast(`Compte pour ${email} créé avec succès (${data.user.role}) !`, 'success');
    closeModal('createUserModal');

    if (document.getElementById('newEmail')) document.getElementById('newEmail').value = '';
    if (document.getElementById('newPassword')) document.getElementById('newPassword').value = '';
    if (document.getElementById('newFirstName')) document.getElementById('newFirstName').value = '';
    if (document.getElementById('newLastName')) document.getElementById('newLastName').value = '';

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
