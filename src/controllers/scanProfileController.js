import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';
import { logAction } from '../services/actioncommService.js';

const config = getDbConfig();
const db = await getDbConnection();

export async function listProfiles(req, res, next) {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    let profiles;
    if (isAdmin) {
      profiles = (await db.query(`SELECT * FROM ${config.prefix}scan_profiles ORDER BY label ASC`))[0];
    } else {
      profiles = (await db.query(`
        SELECT sp.* 
        FROM ${config.prefix}scan_profiles sp
        LEFT JOIN ${config.prefix}user_group_memberships ugm ON ugm.group_id = sp.fk_usergroup AND ugm.user_id = ?
        WHERE sp.fk_user_owner = ? OR ugm.user_id = ?
        ORDER BY sp.label ASC
      `, [userId, userId, userId]))[0];
    }
    return res.json({ profiles });
  } catch (error) {
    error.code = 'ERR_INTERNAL';
    next(error);
  }
}

export async function getProfile(req, res, next) {
  try {
    const profile = (await db.query(`SELECT * FROM ${config.prefix}scan_profiles WHERE rowid = ?`, [req.params.id]))[0][0];
    if (!profile) return next(Object.assign(new Error('Error'), { code: 'ERR_SCANPROFILECONTROLLER_FIX_108' }));
    return res.json({ profile });
  } catch (error) {
    error.code = 'ERR_INTERNAL';
    next(error);
  }
}

export async function createProfile(req, res, next) {
  try {
    const {
      label, description, max_pages, timeout_secs, max_depth,
      headless, inspect_cookies, detect_trackers, capture_images, cookie_action,
      use_sitemap_only, sitemap_index_scan, sitemap_index_max, fk_usergroup
    } = req.body;

    if (!label) return next(Object.assign(new Error('Error'), { code: 'ERR_SCANPROFILECONTROLLER_FIX_109' }));

    const [info] = await db.query(`
      INSERT INTO ${config.prefix}scan_profiles (
        label, description, max_pages, timeout_secs, max_depth,
        headless, inspect_cookies, detect_trackers, capture_images, cookie_action,
        use_sitemap_only, sitemap_index_scan, sitemap_index_max, fk_user_owner, fk_usergroup
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      label, description, max_pages || 100, timeout_secs || 300, max_depth || 3,
      headless === undefined ? 1 : headless, 
      inspect_cookies === undefined ? 1 : inspect_cookies,
      detect_trackers === undefined ? 1 : detect_trackers,
      capture_images === undefined ? 0 : capture_images,
      cookie_action || 'ignore',
      use_sitemap_only === undefined ? 0 : use_sitemap_only,
      sitemap_index_scan === undefined ? 1 : sitemap_index_scan,
      sitemap_index_max || 5,
      req.user.id, fk_usergroup || null
    ]);

    logAction('CREATE_SCAN_PROFILE', `Created profile "${label}"`, req.user.id, 'scan_profile', info.insertId);

    return res.status(201).json({ message: 'Profile created', id: info.insertId });
  } catch (error) {
    error.code = 'ERR_PROFILE_CREATE';
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const {
      label, description, max_pages, timeout_secs, max_depth,
      headless, inspect_cookies, detect_trackers, capture_images, cookie_action,
      use_sitemap_only, sitemap_index_scan, sitemap_index_max, fk_usergroup
    } = req.body;

    const profileId = req.params.id;
    const existing = (await db.query(`SELECT * FROM ${config.prefix}scan_profiles WHERE rowid = ?`, [profileId]))[0][0];
    if (!existing) return next(Object.assign(new Error('Error'), { code: 'ERR_SCANPROFILECONTROLLER_FIX_110' }));

    await db.query(`
      UPDATE ${config.prefix}scan_profiles SET
        label = ?, description = ?, max_pages = ?, timeout_secs = ?, max_depth = ?,
        headless = ?, inspect_cookies = ?, detect_trackers = ?, capture_images = ?, cookie_action = ?,
        use_sitemap_only = ?, sitemap_index_scan = ?, sitemap_index_max = ?, fk_usergroup = ?
      WHERE rowid = ?
    `, [
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
      use_sitemap_only !== undefined ? use_sitemap_only : existing.use_sitemap_only,
      sitemap_index_scan !== undefined ? sitemap_index_scan : existing.sitemap_index_scan,
      sitemap_index_max !== undefined ? sitemap_index_max : existing.sitemap_index_max,
      fk_usergroup !== undefined ? fk_usergroup : existing.fk_usergroup,
      profileId
    ]);

    logAction('UPDATE_SCAN_PROFILE', `Updated profile "${label || existing.label}"`, req.user.id, 'scan_profile', profileId);

    return res.json({ message: 'Profile updated' });
  } catch (error) {
    error.code = 'ERR_PROFILE_UPDATE';
    next(error);
  }
}

export async function deleteProfile(req, res, next) {
  try {
    const profileId = req.params.id;
    const existing = (await db.query(`SELECT * FROM ${config.prefix}scan_profiles WHERE rowid = ?`, [profileId]))[0][0];
    if (!existing) return next(Object.assign(new Error('Error'), { code: 'ERR_SCANPROFILECONTROLLER_FIX_111' }));

    await db.query(`DELETE FROM ${config.prefix}scan_profiles WHERE rowid = ?`, [profileId]);
    logAction('DELETE_SCAN_PROFILE', `Deleted profile "${existing.label}"`, req.user.id, 'scan_profile', profileId);

    return res.json({ message: 'Profile deleted' });
  } catch (error) {
    error.code = 'ERR_INTERNAL';
    next(error);
  }
}
