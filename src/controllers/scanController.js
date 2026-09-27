import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';
import { runScanJob, generateScanReportPdf } from '../services/scannerService.js';

const config = getDbConfig();
const db = await getDbConnection();

export async function downloadScanPdf(req, res, next) {
  try {
    const { id } = req.params;
    // Extract token from either headers or query string
    let token = req.query.token;
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return next(Object.assign(new Error('Token required for PDF generation'), { code: 'ERR_SCAN_PDF_TOKEN' }));
    }

    const pdfBuffer = await generateScanReportPdf(id, token);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="EOCheck_Report_${id}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('[Scan Controller] PDF generation failed:', error);
    return next(Object.assign(new Error('Erreur lors de la génération du PDF'), { code: 'ERR_SCAN_PDF_GEN' }));
  }
}

/**
 * Generate formatted custom scan ID: url-AAAMMJJHHMMSS-0001
 * Example: www.eoxia.com-20260725235008-0001
 */
export async function generateFormattedScanId(targetUrl) {
  let urlSlug = 'url';
  try {
    const parsed = new URL(targetUrl);
    urlSlug = parsed.hostname.toLowerCase().replace(/[^a-z0-9\.-]/g, '');
  } catch (e) {
    urlSlug = 'url';
  }

  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const SS = String(now.getSeconds()).padStart(2, '0');

  const timestamp = `${YYYY}${MM}${DD}${HH}${mm}${SS}`;

  const countRow = (await db.query(`SELECT COUNT(*) as total FROM ${config.prefix}scans`))[0][0];
  const sequenceNum = String((countRow ? countRow.total : 0) + 1).padStart(4, '0');

  return `${urlSlug}-${timestamp}-${sequenceNum}`;
}

/**
 * Submit a website scan request
 */
export async function createScan(req, res, next) {
  try {
    const { url, profile_id } = req.body;
    let { options = {} } = req.body;

    if (!url) {
      const err = new Error('Target URL is required');
      err.code = 'ERR_SCAN_22';
      return next(err);
    }

    try {
      new URL(url);
    } catch (e) {
      const err = new Error('Invalid URL format. Provide a full URL (e.g., https://example.com)');
      err.code = 'ERR_SCAN_23';
      return next(err);
    }

    const userId = req.user ? req.user.id : null;
    let profileLabel = 'Custom';
    
    // Fetch profile if provided
    if (profile_id) {
      const profile = (await db.query(`SELECT * FROM ${config.prefix}scan_profiles WHERE rowid = ?`, [profile_id]))[0][0];
      if (!profile) {
        const err = new Error('Invalid Profile ID');
        err.code = 'ERR_SCAN_24';
        return next(err);
      }
      
      profileLabel = profile.label;
      options = {
        numPages: profile.max_pages,
        timeout: profile.timeout_secs,
        depth: profile.max_depth,
        headless: !!profile.headless,
        inspectCookies: !!profile.inspect_cookies,
        detectTrackers: !!profile.detect_trackers,
        captureImages: !!profile.capture_images,
        useSitemapOnly: !!profile.use_sitemap_only,
        cookieAction: profile.cookie_action || 'ignore'
      };
    }

    // Calculate user limits
    let maxTimeout = 60;
    let maxPages = 0;
    let maxDepth = 3;
    
    if (userId) {
      const groupLimits = (await db.query(`
        SELECT 
          MAX(g.max_pages) as max_pages, 
          MAX(g.max_timeout) as max_timeout,
          MAX(g.max_depth) as max_depth
        FROM ${config.prefix}user_groups g
        JOIN ${config.prefix}user_group_memberships m ON g.id = m.group_id
        WHERE m.user_id = ?
      `, [userId]))[0][0];
      
      if (groupLimits) {
        if (groupLimits.max_pages !== null) maxPages = groupLimits.max_pages;
        if (groupLimits.max_timeout !== null) maxTimeout = groupLimits.max_timeout;
        if (groupLimits.max_depth !== null) maxDepth = groupLimits.max_depth;
      }
    }
    
    // Apply strict server-side limits from RBAC
    options.numPages = Math.min(parseInt(options.numPages || 0, 10), maxPages);
    options.timeout = Math.min(parseInt(options.timeout || 60, 10), maxTimeout);
    options.depth = Math.min(parseInt(options.depth || 3, 10), maxDepth);
    options.profile_id = profile_id;

    const scanId = await generateFormattedScanId(url);

    await db.query(
      `INSERT INTO ${config.prefix}scans (id, user_id, target_url, status, options_json, progress_percent, progress_step) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
       [scanId, userId, url, 'pending', JSON.stringify(options), 5, 'Demande de scan reçue...']
    );

    // Log the action if user is authenticated
    if (userId) {
      try {
        await db.query(`
          INSERT INTO ${config.prefix}actioncomm (label, note, fk_user_author, elementtype, fk_element)
          VALUES (?, ?, ?, ?, ?)
        `, ['LAUNCH_SCAN', `Lancement scan sur ${url} (Profil: ${profileLabel})`, userId, 'scan', scanId]);
      } catch (err) {
        console.error('[ActionComm] Failed to log scan launch:', err);
      }
    }

    // Trigger scan asynchronously in background
    runScanJob(scanId, url, options).catch((err) => {
      console.error(`[Scan Controller] Background scan job error for scan ${scanId}:`, err);
    });

    return res.status(202).json({
      message: 'Scan request submitted and processing',
      scan_id: scanId,
      target_url: url,
      status: 'pending',
      options: options,
      progress_percent: 5,
      progress_step: 'Demande de scan reçue...',
      status_url: `/api/v1/scans/${scanId}`
    });
  } catch (error) {
    console.error('[Scan Controller] Create scan error:', error);
    error.code = 'ERR_SCAN_CREATE';
    return next(error);
  }
}

/**
 * Get scan details & results by ID
 */
export async function getScan(req, res, next) {
  try {
    const { id } = req.params;

    const scan = (await db.query(`SELECT * FROM ${config.prefix}scans WHERE id = ?`, [id]))[0][0];

    if (!scan) {
      const err = new Error('Scan not found');
      err.code = 'ERR_SCAN_25';
      return next(err);
    }

    return res.json({
      id: scan.id,
      target_url: scan.target_url,
      status: scan.status,
      progress_percent: scan.progress_percent || 0,
      progress_step: scan.progress_step || '',
      options: scan.options_json ? (typeof scan.options_json === 'string' ? JSON.parse(scan.options_json) : scan.options_json) : {},
      result: scan.result_json ? (typeof scan.result_json === 'string' ? JSON.parse(scan.result_json) : scan.result_json) : null,
      error_message: scan.error_message,
      created_at: scan.created_at,
      completed_at: scan.completed_at
    });
  } catch (error) {
    console.error('[Scan Controller] Get scan error:', error);
    const err = new Error('Failed to fetch scan details');
    err.code = 'ERR_SCAN_26';
    return next(err);
  }
}

/**
 * List scans (filtered by user if authenticated, preserving options for each row)
 */
export async function listScans(req, res, next) {
  try {
    const userId = req.user ? req.user.id : null;
    let scanRows = [];

    if (userId) {
      scanRows = (await db.query(`SELECT id, target_url, status, options_json, progress_percent, progress_step, created_at, completed_at FROM ${config.prefix}scans WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userId]))[0];
    } else {
      scanRows = (await db.query(`SELECT id, target_url, status, options_json, progress_percent, progress_step, created_at, completed_at FROM ${config.prefix}scans ORDER BY created_at DESC LIMIT 20`))[0];
    }

    const scans = scanRows.map(s => ({
      ...s,
      options: s.options_json ? (typeof s.options_json === 'string' ? JSON.parse(s.options_json) : s.options_json) : {}
    }));

    return res.json({ scans });
  } catch (error) {
    console.error('[Scan Controller] List scans error:', error);
    const err = new Error('Failed to list scans');
    err.code = 'ERR_SCAN_27';
    return next(err);
  }
}

/**
 * Get live logs for active scans
 */
export async function getActiveScanLogs(req, res, next) {
  try {
    const logs = (await db.query(`
      SELECT l.scan_id, l.message, l.created_at, s.target_url
      FROM ${config.prefix}scan_logs l
      JOIN ${config.prefix}scans s ON l.scan_id = s.id
      WHERE s.status IN ('PENDING', 'RUNNING', 'processing')
      ORDER BY l.id DESC
      LIMIT 100
    `))[0];
    
    return res.json({ logs: logs.reverse() });
  } catch (error) {
    console.error('[Scan Controller] Failed to fetch live logs:', error);
    const err = new Error('Error');
    err.code = 'ERR_SCAN_28';
    return next(err);
  }
}
