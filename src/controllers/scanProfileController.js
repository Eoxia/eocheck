import { db } from '../db/index.js';
import { logAction } from '../services/actioncommService.js';

export function listProfiles(req, res) {
  try {
    const userId = req.user.id;
    // For now, let's fetch all profiles if admin, else profiles owned by user or their group
    const isAdmin = req.user.role === 'admin';
    
    let profiles;
    if (isAdmin) {
      profiles = db.prepare(`SELECT * FROM scan_profiles ORDER BY label ASC`).all();
    } else {
      // Need to find user groups if we support them, for now just owner and public maybe?
      // Assuming fk_user_owner matches user or they are in the group.
      // EOCheck uses `user_groups` table (from RBAC schema)? Let's just fetch by owner for now.
      profiles = db.prepare(`
        SELECT sp.* 
        FROM scan_profiles sp
        LEFT JOIN user_group_memberships ugm ON ugm.group_id = sp.fk_usergroup AND ugm.user_id = ?
        WHERE sp.fk_user_owner = ? OR ugm.user_id = ?
        ORDER BY sp.label ASC
      `).all(userId, userId, userId);
    }
    return res.json({ profiles });
  } catch (error) {
    console.error('[Scan Profiles] Error listing:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export function getProfile(req, res) {
  try {
    const profile = db.prepare('SELECT * FROM scan_profiles WHERE rowid = ?').get(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    return res.json({ profile });
  } catch (error) {
    console.error('[Scan Profiles] Error getting:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export function createProfile(req, res) {
  try {
    const {
      label, description, max_pages, timeout_secs, max_depth,
      headless, inspect_cookies, detect_trackers, capture_images, cookie_action,
      fk_usergroup
    } = req.body;

    if (!label) return res.status(400).json({ error: 'Label is required' });

    const info = db.prepare(`
      INSERT INTO scan_profiles (
        label, description, max_pages, timeout_secs, max_depth,
        headless, inspect_cookies, detect_trackers, capture_images, cookie_action,
        fk_user_owner, fk_usergroup, fk_user_creat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      label, description, max_pages || 100, timeout_secs || 300, max_depth || 3,
      headless === undefined ? 1 : headless, 
      inspect_cookies === undefined ? 1 : inspect_cookies,
      detect_trackers === undefined ? 1 : detect_trackers,
      capture_images === undefined ? 0 : capture_images,
      cookie_action || 'ignore',
      req.user.id, fk_usergroup || null, req.user.id
    );

    logAction('CREATE_SCAN_PROFILE', `Created profile "${label}"`, req.user.id, 'scan_profile', info.lastInsertRowid);

    return res.status(201).json({ message: 'Profile created', id: info.lastInsertRowid });
  } catch (error) {
    console.error('[Scan Profiles] Error creating:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export function updateProfile(req, res) {
  try {
    const {
      label, description, max_pages, timeout_secs, max_depth,
      headless, inspect_cookies, detect_trackers, capture_images, cookie_action,
      fk_usergroup
    } = req.body;

    const profileId = req.params.id;
    const existing = db.prepare('SELECT * FROM scan_profiles WHERE rowid = ?').get(profileId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    db.prepare(`
      UPDATE scan_profiles SET
        label = ?, description = ?, max_pages = ?, timeout_secs = ?, max_depth = ?,
        headless = ?, inspect_cookies = ?, detect_trackers = ?, capture_images = ?, cookie_action = ?,
        fk_usergroup = ?, fk_user_modif = ?
      WHERE rowid = ?
    `).run(
      label || existing.label,
      description !== undefined ? description : existing.description,
      max_pages !== undefined ? max_pages : existing.max_pages,
      timeout_secs !== undefined ? timeout_secs : existing.timeout_secs,
      max_depth !== undefined ? max_depth : existing.max_depth,
      headless !== undefined ? headless : existing.headless,
      inspect_cookies !== undefined ? inspect_cookies : existing.inspect_cookies,
      detect_trackers !== undefined ? detect_trackers : existing.detect_trackers,
      capture_images !== undefined ? capture_images : existing.capture_images,
      cookie_action || existing.cookie_action,
      fk_usergroup !== undefined ? fk_usergroup : existing.fk_usergroup,
      req.user.id,
      profileId
    );

    logAction('UPDATE_SCAN_PROFILE', `Updated profile "${label || existing.label}"`, req.user.id, 'scan_profile', profileId);

    return res.json({ message: 'Profile updated' });
  } catch (error) {
    console.error('[Scan Profiles] Error updating:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export function deleteProfile(req, res) {
  try {
    const profileId = req.params.id;
    const existing = db.prepare('SELECT * FROM scan_profiles WHERE rowid = ?').get(profileId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    db.prepare('DELETE FROM scan_profiles WHERE rowid = ?').run(profileId);
    logAction('DELETE_SCAN_PROFILE', `Deleted profile "${existing.label}"`, req.user.id, 'scan_profile', profileId);

    return res.json({ message: 'Profile deleted' });
  } catch (error) {
    console.error('[Scan Profiles] Error deleting:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
