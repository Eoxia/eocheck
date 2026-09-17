import { db } from '../db/index.js';
import crypto from 'crypto';

// Liste de toutes les permissions système (pourrait être dans un fichier constant, mais simple ici)
export const SYSTEM_PERMISSIONS = [
  'page:scans', 'page:settings', 'page:users', 'page:groups', 'page:system',
  'scan:launch', 'scan:delete',
  'settings:edit',
  'users:manage',
  'groups:manage'
];

export function listGroups(req, res) {
  try {
    const groups = db.prepare('SELECT * FROM user_groups ORDER BY name ASC').all();
    
    // Pour chaque groupe, récupérer ses permissions
    for (let group of groups) {
      const perms = db.prepare('SELECT permission_code FROM group_permissions WHERE group_id = ?').all(group.id);
      group.permissions = perms.map(p => p.permission_code);
    }

    res.json(groups);
  } catch (err) {
    console.error('[Groups] Erreur listGroups:', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

export function createGroup(req, res) {
  try {
    const { name, description, permissions, max_pages = 0, max_timeout = 60, max_concurrent = 1, max_depth = 3 } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom du groupe est requis' });

    const id = crypto.randomUUID();
    
    db.prepare('INSERT INTO user_groups (id, name, description, max_pages, max_timeout, max_concurrent, max_depth) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, description || '', max_pages, max_timeout, max_concurrent, max_depth);
    
    if (Array.isArray(permissions)) {
      const insertPerm = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)');
      for (const perm of permissions) {
        if (SYSTEM_PERMISSIONS.includes(perm)) {
          insertPerm.run(id, perm);
        }
      }
    }

    res.status(201).json({ id, name, description, permissions, max_pages, max_timeout, max_concurrent });
  } catch (err) {
    console.error('[Groups] Erreur createGroup:', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

export function updateGroup(req, res) {
  try {
    const { id } = req.params;
    const { name, description, permissions, max_pages = 0, max_timeout = 60, max_concurrent = 1, max_depth = 3 } = req.body;

    if (!name) return res.status(400).json({ error: 'Le nom du groupe est requis' });

    const group = db.prepare('SELECT id FROM user_groups WHERE id = ?').get(id);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });

    try {
      db.exec('BEGIN');
      // Update info
      db.prepare('UPDATE user_groups SET name = ?, description = ?, max_pages = ?, max_timeout = ?, max_concurrent = ?, max_depth = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, description || '', max_pages, max_timeout, max_concurrent, max_depth, id);
      
      // Update permissions (delete all then insert)
      if (Array.isArray(permissions)) {
        db.prepare('DELETE FROM group_permissions WHERE group_id = ?').run(id);
        const insertPerm = db.prepare('INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)');
        for (const perm of permissions) {
          if (SYSTEM_PERMISSIONS.includes(perm)) {
            insertPerm.run(id, perm);
          }
        }
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Groups] Erreur updateGroup:', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

export function deleteGroup(req, res) {
  try {
    const { id } = req.params;
    
    // Protection: Ne pas supprimer les groupes s'ils sont encore assignés, ou juste CASCADE ?
    // Le CASCADE est configuré en DB. Mais évitons de supprimer le dernier admin.
    const group = db.prepare('SELECT id, name FROM user_groups WHERE id = ?').get(id);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });

    // Optional: add a check if it's the "Administrateurs" group
    if (group.name === 'Administrateurs') {
      return res.status(403).json({ error: 'Vous ne pouvez pas supprimer le groupe Administrateurs par défaut' });
    }

    db.prepare('DELETE FROM user_groups WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Groups] Erreur deleteGroup:', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

export function listSystemPermissions(req, res) {
  res.json(SYSTEM_PERMISSIONS);
}
