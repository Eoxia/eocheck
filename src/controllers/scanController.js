import { db } from '../db/index.js';
import { runScanJob, generateScanReportPdf } from '../services/scannerService.js';

export async function downloadScanPdf(req, res) {
  try {
    const { id } = req.params;
    // Extract token from either headers or query string
    let token = req.query.token;
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).send('Token required for PDF generation');
    }

    const pdfBuffer = await generateScanReportPdf(id, token);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="EOCheck_Report_${id}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('[Scan Controller] PDF generation failed:', error);
    res.status(500).send('Erreur lors de la génération du PDF');
  }
}

/**
 * Generate formatted custom scan ID: url-AAAMMJJHHMMSS-0001
 * Example: www.eoxia.com-20260725235008-0001
 */
export function generateFormattedScanId(targetUrl) {
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

  const countRow = db.prepare('SELECT COUNT(*) as total FROM scans').get();
  const sequenceNum = String((countRow ? countRow.total : 0) + 1).padStart(4, '0');

  return `${urlSlug}-${timestamp}-${sequenceNum}`;
}

/**
 * Submit a website scan request
 */
export function createScan(req, res) {
  try {
    const { url, profile_id } = req.body;
    let { options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Bad Request', message: 'Target URL is required' });
    }

    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid URL format. Provide a full URL (e.g., https://example.com)' });
    }

    const userId = req.user ? req.user.id : null;
    let profileLabel = 'Custom';
    
    // Fetch profile if provided
    if (profile_id) {
      const profile = db.prepare('SELECT * FROM scan_profiles WHERE rowid = ?').get(profile_id);
      if (!profile) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid Profile ID' });
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
        cookieAction: profile.cookie_action || 'ignore'
      };
    }

    // Calculate user limits
    let maxTimeout = 60;
    let maxPages = 0;
    let maxDepth = 3;
    
    if (userId) {
      const groupLimits = db.prepare(`
        SELECT 
          MAX(g.max_pages) as max_pages, 
          MAX(g.max_timeout) as max_timeout,
          MAX(g.max_depth) as max_depth
        FROM user_groups g
        JOIN user_group_memberships m ON g.id = m.group_id
        WHERE m.user_id = ?
      `).get(userId);
      
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

    const scanId = generateFormattedScanId(url);

    db.prepare(
      `INSERT INTO scans (id, user_id, target_url, status, options_json, progress_percent, progress_step) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(scanId, userId, url, 'pending', JSON.stringify(options), 5, 'Demande de scan reçue...');

    // Log the action if user is authenticated
    if (userId) {
      try {
        db.prepare(`
          INSERT INTO actioncomm (label, note, fk_user_author, elementtype, fk_element)
          VALUES (?, ?, ?, ?, ?)
        `).run('LAUNCH_SCAN', `Lancement scan sur ${url} (Profil: ${profileLabel})`, userId, 'scan', scanId);
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
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create scan request' });
  }
}

/**
 * Get scan details & results by ID
 */
export function getScan(req, res) {
  try {
    const { id } = req.params;

    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(id);

    if (!scan) {
      return res.status(404).json({ error: 'Not Found', message: 'Scan not found' });
    }

    return res.json({
      id: scan.id,
      target_url: scan.target_url,
      status: scan.status,
      progress_percent: scan.progress_percent || 0,
      progress_step: scan.progress_step || '',
      options: scan.options_json ? JSON.parse(scan.options_json) : {},
      result: scan.result_json ? JSON.parse(scan.result_json) : null,
      error_message: scan.error_message,
      created_at: scan.created_at,
      completed_at: scan.completed_at
    });
  } catch (error) {
    console.error('[Scan Controller] Get scan error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch scan details' });
  }
}

/**
 * List scans (filtered by user if authenticated, preserving options for each row)
 */
export function listScans(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    let scanRows = [];

    if (userId) {
      scanRows = db
        .prepare('SELECT id, target_url, status, options_json, progress_percent, progress_step, created_at, completed_at FROM scans WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
        .all(userId);
    } else {
      scanRows = db
        .prepare('SELECT id, target_url, status, options_json, progress_percent, progress_step, created_at, completed_at FROM scans ORDER BY created_at DESC LIMIT 20')
        .all();
    }

    const scans = scanRows.map(s => ({
      ...s,
      options: s.options_json ? JSON.parse(s.options_json) : {}
    }));

    return res.json({ scans });
  } catch (error) {
    console.error('[Scan Controller] List scans error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list scans' });
  }
}

/**
 * Get live logs for active scans
 */
export function getActiveScanLogs(req, res) {
  try {
    const logs = db.prepare(`
      SELECT l.scan_id, l.message, l.created_at, s.target_url
      FROM scan_logs l
      JOIN scans s ON l.scan_id = s.id
      WHERE s.status IN ('PENDING', 'RUNNING', 'processing')
      ORDER BY l.id DESC
      LIMIT 100
    `).all();
    
    return res.json({ logs: logs.reverse() });
  } catch (error) {
    console.error('[Scan Controller] Failed to fetch live logs:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
