let systemPermissions = [];

document.addEventListener('DOMContentLoaded', () => {
  // Attendre un peu que currentUser soit chargé par app.js
  setTimeout(() => {
    if (authToken && currentUser) {
      loadSystemPermissions().then(() => {
        loadGroups();
      });
    }
  }, 300);
});

async function loadSystemPermissions() {
  try {
    const res = await fetch(getApiUrl('/api/v1/admin/permissions'), {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      systemPermissions = await res.json();
    }
  } catch (err) {
    console.error('Erreur chargement permissions', err);
  }
}

async function loadGroups() {
  const tbody = document.getElementById('groupsTableBody');
  if (!tbody) return;

  try {
    const res = await fetch(getApiUrl('/api/v1/admin/groups'), {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const groups = await res.json();

    if (!groups || groups.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Aucun groupe trouvé.</td></tr>`;
      return;
    }

    tbody.innerHTML = groups.map(g => `
      <tr>
        <td style="font-weight: bold;">${escapeHtml(g.name)}</td>
        <td style="color: var(--text-muted);">${escapeHtml(g.description)}</td>
        <td>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${g.permissions.map(p => `<span style="background: rgba(99,102,241,0.2); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">${p}</span>`).join('')}
          </div>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick='openEditGroupModal(${JSON.stringify(g).replace(/'/g, "&#39;")})' data-permission="groups:manage">Éditer</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGroup('${g.id}')" data-permission="groups:manage">Supprimer</button>
        </td>
      </tr>
    `).join('');

    applyPermissionsUI(); // Rafraîchir les UI RBAC sur les boutons ajoutés dynamiquement
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

function renderPermissionsCheckboxes(selectedPerms = []) {
  const container = document.getElementById('permissionsList');
  container.innerHTML = systemPermissions.map(p => `
    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer;">
      <input type="checkbox" name="permissions" value="${p}" ${selectedPerms.includes(p) ? 'checked' : ''}>
      ${p}
    </label>
  `).join('');
}

function openCreateGroupModal() {
  document.getElementById('groupId').value = '';
  document.getElementById('groupName').value = '';
  document.getElementById('groupDescription').value = '';
  document.getElementById('groupMaxPages').value = '0';
  document.getElementById('groupMaxTimeout').value = '60';
  document.getElementById('groupMaxConcurrent').value = '1';
  document.getElementById('groupMaxDepth').value = '3';
  document.getElementById('groupModalTitle').innerText = 'Nouveau Groupe';
  renderPermissionsCheckboxes([]);
  openModal('groupModal');
}

function openEditGroupModal(group) {
  document.getElementById('groupId').value = group.id;
  document.getElementById('groupName').value = group.name;
  document.getElementById('groupDescription').value = group.description;
  document.getElementById('groupMaxPages').value = group.max_pages !== undefined ? group.max_pages : 0;
  document.getElementById('groupMaxTimeout').value = group.max_timeout !== undefined ? group.max_timeout : 60;
  document.getElementById('groupMaxConcurrent').value = group.max_concurrent !== undefined ? group.max_concurrent : 1;
  document.getElementById('groupMaxDepth').value = group.max_depth !== undefined ? group.max_depth : 3;
  document.getElementById('groupModalTitle').innerText = 'Modifier le Groupe';
  renderPermissionsCheckboxes(group.permissions);
  openModal('groupModal');
}

async function handleSaveGroup(event) {
  event.preventDefault();
  
  if (!hasPermission('groups:manage')) {
    showToast('Permission refusée', 'error');
    return;
  }

  const id = document.getElementById('groupId').value;
  const name = document.getElementById('groupName').value;
  const description = document.getElementById('groupDescription').value;
  const max_pages = parseInt(document.getElementById('groupMaxPages').value, 10);
  const max_timeout = parseInt(document.getElementById('groupMaxTimeout').value, 10);
  const max_concurrent = parseInt(document.getElementById('groupMaxConcurrent').value, 10);
  const max_depth = parseInt(document.getElementById('groupMaxDepth').value, 10);
  
  const checkboxes = document.querySelectorAll('input[name="permissions"]:checked');
  const permissions = Array.from(checkboxes).map(cb => cb.value);

  const endpoint = id ? getApiUrl(`/api/v1/admin/groups/${id}`) : getApiUrl('/api/v1/admin/groups');
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await secureFetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ name, description, permissions, max_pages, max_timeout, max_concurrent, max_depth })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || data.error || 'Erreur lors de la sauvegarde');
    }

    closeModal('groupModal');
    showToast(id ? 'Groupe mis à jour' : 'Groupe créé', 'success');
    loadGroups();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteGroup(id) {
  if (!hasPermission('groups:manage')) return;
  if (!confirm('Voulez-vous vraiment supprimer ce groupe ?')) return;

  try {
    const res = await secureFetch(getApiUrl(`/api/v1/admin/groups/${id}`), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    
    showToast('Groupe supprimé', 'info');
    loadGroups();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
