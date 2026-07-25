import { db } from '../db/index.js';
import { runScanJob } from '../services/scannerService.js';

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
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Bad Request', message: 'Target URL is required' });
    }

    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid URL format. Provide a full URL (e.g., https://example.com)' });
    }

    const scanId = generateFormattedScanId(url);
    const userId = req.user ? req.user.id : null;

    db.prepare(
      `INSERT INTO scans (id, user_id, target_url, status, options_json, progress_percent, progress_step) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(scanId, userId, url, 'pending', JSON.stringify(options), 5, 'Demande de scan reçue...');

    // Trigger scan asynchronously in background
    runScanJob(scanId, url, options).catch((err) => {
      console.error(`[Scan Controller] Background scan job error for scan ${scanId}:`, err);
    });

    return res.status(202).json({
      message: 'Scan request submitted and processing',
      scan_id: scanId,
      target_url: url,
      status: 'pending',
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
 * List scans (filtered by user if authenticated)
 */
export function listScans(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    let scans = [];

    if (userId) {
      scans = db
        .prepare('SELECT id, target_url, status, progress_percent, progress_step, created_at, completed_at FROM scans WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
        .all(userId);
    } else {
      scans = db
        .prepare('SELECT id, target_url, status, progress_percent, progress_step, created_at, completed_at FROM scans ORDER BY created_at DESC LIMIT 20')
        .all();
    }

    return res.json({ scans });
  } catch (error) {
    console.error('[Scan Controller] List scans error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list scans' });
  }
}
