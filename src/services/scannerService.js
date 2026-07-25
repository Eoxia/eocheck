import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure outputs directory exists
const outputsDir = path.resolve(process.cwd(), 'outputs');
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

/**
 * Queue and execute a site scan with full scanner options
 */
export async function runScanJob(scanId, targetUrl, options = {}) {
  try {
    // Update status to processing
    db.prepare('UPDATE scans SET status = ? WHERE id = ?').run('processing', scanId);

    console.log(`[Scanner Service] Starting scan ${scanId} for URL: ${targetUrl} with options:`, options);

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      throw new Error(`Invalid target URL: ${targetUrl}`);
    }

    const numPages = parseInt(options.numPages || 0, 10);
    const isHeadless = options.headless !== false; // default true
    const timeoutMs = parseInt(options.timeout || 60, 10) * 1000;

    let scanResult = null;

    // Try executing with native @themarkup/blacklight-collector if present
    try {
      const collectorModule = await import('@themarkup/blacklight-collector');
      if (collectorModule && typeof collectorModule.collect === 'function') {
        const scanOutputDir = path.join(outputsDir, `${parsedUrl.hostname}-${Date.now()}`);
        fs.mkdirSync(scanOutputDir, { recursive: true });

        const config = {
          headless: isHeadless,
          outDir: scanOutputDir,
          numPages: numPages,
          timeout: timeoutMs
        };

        const collectorResult = await collectorModule.collect(targetUrl, config);
        scanResult = {
          url: targetUrl,
          hostname: parsedUrl.hostname,
          collector: 'blacklight-collector',
          config,
          data: collectorResult || {}
        };
      }
    } catch (collectorErr) {
      console.log(`[Scanner Service] Native blacklight-collector unavailable (${collectorErr.message}). Running HTTP/Puppeteer inspector wrapper...`);
    }

    // Built-in scanner inspector fallback
    if (!scanResult) {
      const inspectStartTime = Date.now();
      let httpStatus = null;
      let headers = {};
      let htmlBody = '';

      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'EOCheck-Scanner/1.0 (eocheck.eoxia.com)' },
          signal: AbortSignal.timeout(timeoutMs)
        });
        httpStatus = response.status;
        headers = Object.fromEntries(response.headers.entries());
        htmlBody = await response.text();
      } catch (httpErr) {
        console.warn(`[Scanner Service] HTTP fetch notice for ${targetUrl}: ${httpErr.message}`);
      }

      // Detect known trackers, analytics, and session recorders in HTML/headers
      const trackersDetected = [];
      const sessionRecordersDetected = [];
      
      const trackerPatterns = [
        { name: 'Google Analytics / GTAG', regex: /googletagmanager\.com|google-analytics\.com/i },
        { name: 'Meta / Facebook Pixel', regex: /connect\.facebook\.net|fbevents\.js/i },
        { name: 'TikTok Pixel', regex: /analytics\.tiktok\.com/i },
        { name: 'LinkedIn Insight', regex: /snap\.licdn\.com/i }
      ];

      const recorderPatterns = [
        { name: 'Hotjar Session Recorder', regex: /static\.hotjar\.com/i },
        { name: 'Clarity (Microsoft)', regex: /www\.clarity\.ms/i },
        { name: 'FullStory Session Replay', regex: /fullstory\.com/i },
        { name: 'LogRocket', regex: /logrocket\.io/i }
      ];

      trackerPatterns.forEach(p => {
        if (p.regex.test(htmlBody)) trackersDetected.push(p.name);
      });

      recorderPatterns.forEach(p => {
        if (p.regex.test(htmlBody)) sessionRecordersDetected.push(p.name);
      });

      const setCookieHeader = headers['set-cookie'] || '';

      scanResult = {
        url: targetUrl,
        hostname: parsedUrl.hostname,
        scanned_at: new Date().toISOString(),
        duration_ms: Date.now() - inspectStartTime,
        options_applied: {
          numPages,
          headless: isHeadless,
          timeout_sec: timeoutMs / 1000,
          inspectCookies: options.inspectCookies !== false,
          inspectTrackers: options.inspectTrackers !== false
        },
        http_summary: {
          status: httpStatus,
          server: headers['server'] || 'Unknown',
          content_type: headers['content-type'] || 'text/html'
        },
        privacy_inspection: {
          set_cookie_header_present: Boolean(setCookieHeader),
          trackers_count: trackersDetected.length,
          trackers_detected: trackersDetected,
          session_recorders_detected: sessionRecordersDetected,
          security_headers: {
            strict_transport_security: Boolean(headers['strict-transport-security']),
            content_security_policy: Boolean(headers['content-security-policy']),
            x_frame_options: headers['x-frame-options'] || null
          }
        }
      };
    }

    // Save result to DB
    db.prepare(
      `UPDATE scans 
       SET status = ?, result_json = ?, completed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`
    ).run('completed', JSON.stringify(scanResult), scanId);

    console.log(`[Scanner Service] Scan ${scanId} completed successfully.`);
    return scanResult;
  } catch (error) {
    console.error(`[Scanner Service] Scan ${scanId} failed:`, error);
    db.prepare(
      `UPDATE scans 
       SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`
    ).run('failed', error.message, scanId);
    throw error;
  }
}
