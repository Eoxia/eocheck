import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';
import crypto from 'crypto';

const config = getDbConfig();
const db = await getDbConnection();

// Liste de toutes les permissions système (pourrait être dans un fichier constant, mais simple ici)
export const SYSTEM_PERMISSIONS = [
  'page:scans', 'page:settings', 'page:users', 'page:groups', 'page:system',
  'scan:launch', 'scan:delete',
  'settings:edit',
  'users:manage',
  'groups:manage'
];

export async function listGroups(req, res, next) {
  try {
    const [groups] = await db.query(`SELECT * FROM ${config.prefix}user_groups ORDER BY name ASC`);
    
    // Pour chaque groupe, récupérer ses permissions
    for (let group of groups) {
      const [perms] = await db.query(`SELECT permission_code FROM ${config.prefix}group_permissions WHERE group_id = ?`, [group.id]);
      group.permissions = perms.map(p => p.permission_code);
    }

    res.json(groups);
  } catch (error) {
    console.error('[Groups] Erreur listGroups:', err);
    const err = new Error('Error');
    err.code = 'ERR_GROUP_16';
    return next(err);
  }
}

export async function createGroup(req, res, next) {
  try {
    const { name, description, permissions, max_pages = 0, max_timeout = 60, max_concurrent = 1, max_depth = 3 } = req.body;
    if (!name) return next(Object.assign(new Error('Error'), { code: 'ERR_GROUPCONTROLLER_FIX_104' }));

    const id = crypto.randomUUID();
    
    await db.query(`INSERT INTO ${config.prefix}user_groups (id, name, description, max_pages, max_timeout, max_concurrent, max_depth) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, name, description || '', max_pages, max_timeout, max_concurrent, max_depth]);
    
    if (Array.isArray(permissions)) {
      for (const perm of permissions) {
        if (SYSTEM_PERMISSIONS.includes(perm)) {
          await db.query(`INSERT INTO ${config.prefix}group_permissions (group_id, permission_code) VALUES (?, ?)`, [id, perm]);
        }
      }
    }

    const err = new Error('Error');
    err.code = 'ERR_GROUP_17';
    return next(err);
  } catch (error) {
    console.error('[Groups] Erreur createGroup:', err);
    const err = new Error('Error');
    err.code = 'ERR_GROUP_18';
    return next(err);
  }
}

export async function updateGroup(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, permissions, max_pages = 0, max_timeout = 60, max_concurrent = 1, max_depth = 3 } = req.body;

    if (!name) return next(Object.assign(new Error('Error'), { code: 'ERR_GROUPCONTROLLER_FIX_105' }));

    const [groupRows] = await db.query(`SELECT id FROM ${config.prefix}user_groups WHERE id = ?`, [id]);
    const group = groupRows[0];
    if (!group) return next(Object.assign(new Error('Error'), { code: 'ERR_GROUPCONTROLLER_FIX_106' }));

    try {
      await db.query('BEGIN');
      // Update info
      await db.query(`UPDATE ${config.prefix}user_groups SET name = ?, description = ?, max_pages = ?, max_timeout = ?, max_concurrent = ?, max_depth = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [name, description || '', max_pages, max_timeout, max_concurrent, max_depth, id]);
      
      // Update permissions (delete all then insert)
      if (Array.isArray(permissions)) {
        await db.query(`DELETE FROM ${config.prefix}group_permissions WHERE group_id = ?`, [id]);
        for (const perm of permissions) {
          if (SYSTEM_PERMISSIONS.includes(perm)) {
            await db.query(`INSERT INTO ${config.prefix}group_permissions (group_id, permission_code) VALUES (?, ?)`, [id, perm]);
          }
        }
      }
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Groups] Erreur updateGroup:', err);
    const err = new Error('Error');
    err.code = 'ERR_GROUP_19';
    return next(err);
  }
}

export async function deleteGroup(req, res, next) {
  try {
    const { id } = req.params;
    
    // Protection: Ne pas supprimer les groupes s'ils sont encore assignés, ou juste CASCADE ?
    // Le CASCADE est configuré en DB. Mais évitons de supprimer le dernier admin.
    const [groupRows] = await db.query(`SELECT id, name FROM ${config.prefix}user_groups WHERE id = ?`, [id]);
    const group = groupRows[0];
    if (!group) return next(Object.assign(new Error('Error'), { code: 'ERR_GROUPCONTROLLER_FIX_107' }));

    // Optional: add a check if it's the "Administrateurs" group
    if (group.name === 'Administrateurs') {
      const err = new Error('Error');
      err.code = 'ERR_GROUP_20';
      return next(err);
    }

    await db.query(`DELETE FROM ${config.prefix}user_groups WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[Groups] Erreur deleteGroup:', err);
    const err = new Error('Error');
    err.code = 'ERR_GROUP_21';
    return next(err);
  }
}

export async function listSystemPermissions(req, res, next) {
  res.json(SYSTEM_PERMISSIONS);
}
