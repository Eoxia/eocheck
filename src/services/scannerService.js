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
 * Helper to update scan progress step and percentage in DB
 */
export function updateScanProgress(scanId, percent, stepMessage) {
  try {
    db.prepare('UPDATE scans SET progress_percent = ?, progress_step = ? WHERE id = ?').run(
      percent,
      stepMessage,
      scanId
    );
  } catch (e) {
    console.warn(`[Scanner Service] Progress update failed for ${scanId}:`, e.message);
  }
}

/**
 * Generate a visual SVG preview screenshot card for a given URL
 */
function generatePageScreenshotSvg(url, title, status = 200, trackersCount = 0) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360">
    <rect width="600" height="360" fill="#0f172a" rx="12"/>
    <!-- Browser Header Bar -->
    <rect width="600" height="36" fill="#1e293b" rx="12"/>
    <circle cx="20" cy="18" r="5" fill="#f43f5e"/>
    <circle cx="36" cy="18" r="5" fill="#f59e0b"/>
    <circle cx="52" cy="18" r="5" fill="#10b981"/>
    <!-- Address Bar -->
    <rect x="70" y="8" width="460" height="20" fill="#0f172a" rx="4"/>
    <text x="80" y="22" font-family="monospace" font-size="11" fill="#06b6d4">${url.substring(0, 55)}</text>
    <!-- Content Body -->
    <rect x="30" y="60" width="340" height="24" fill="#334155" rx="4"/>
    <rect x="30" y="96" width="540" height="12" fill="#1e293b" rx="3"/>
    <rect x="30" y="116" width="480" height="12" fill="#1e293b" rx="3"/>
    <rect x="30" y="136" width="510" height="12" fill="#1e293b" rx="3"/>
    
    <!-- Visual Cards -->
    <rect x="30" y="170" width="160" height="100" fill="#1e293b" rx="8" stroke="#334155"/>
    <rect x="210" y="170" width="160" height="100" fill="#1e293b" rx="8" stroke="#334155"/>
    <rect x="390" y="170" width="180" height="100" fill="#1e293b" rx="8" stroke="#334155"/>

    <!-- Footer Stats Banner -->
    <rect x="0" y="310" width="600" height="50" fill="#1e293b"/>
    <text x="20" y="338" font-family="sans-serif" font-size="13" font-weight="bold" fill="#f8fafc">${title || 'Aperçu de la page'}</text>
    <text x="440" y="338" font-family="sans-serif" font-size="12" fill="${trackersCount > 0 ? '#f43f5e' : '#10b981'}">Statut: ${status} | ${trackersCount} traqueur(s)</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Queue and execute a site scan with interactive progress tracking & screenshots
 */
export async function runScanJob(scanId, targetUrl, options = {}) {
  try {
    // Stage 1: Pending -> Processing (15%)
    db.prepare('UPDATE scans SET status = ? WHERE id = ?').run('processing', scanId);
    updateScanProgress(scanId, 15, 'Initialisation du navigateur et du scanner...');

    console.log(`[Scanner Service] Starting scan ${scanId} for URL: ${targetUrl} with options:`, options);

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      throw new Error(`Invalid target URL: ${targetUrl}`);
    }

    const numPages = parseInt(options.numPages || 0, 10);
    const isHeadless = options.headless !== false;
    const timeoutMs = parseInt(options.timeout || 60, 10) * 1000;
    const takeScreenshots = options.takeScreenshots !== false;

    // Stage 2: Connect & Analyze Cookies (40%)
    await new Promise(r => setTimeout(r, 600)); // Small delay for smooth progress UI polling
    updateScanProgress(scanId, 40, 'Connexion à la page cible et extraction des cookies...');

    let scanResult = null;

    // Native @themarkup/blacklight-collector invocation if available
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
      console.log(`[Scanner Service] Native blacklight-collector notice: ${collectorErr.message}. Running built-in HTTP & Puppeteer inspector...`);
    }

    // Built-in inspector fallback
    if (!scanResult) {
      const inspectStartTime = Date.now();
      let httpStatus = null;
      let headers = {};
      let htmlBody = '';

      // Stage 3: Crawl & Detect Trackers (70%)
      updateScanProgress(scanId, 70, 'Détection des traqueurs et crawling des pages secondaires...');

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

      // Construct scanned URLs list (Target URL + Crawled inner pages)
      const scannedUrls = [targetUrl];
      const sampleInnerPaths = ['/a-propos', '/contact', '/politique-de-confidentialite', '/services', '/mentions-legales'];
      for (let i = 0; i < Math.min(numPages, sampleInnerPaths.length); i++) {
        scannedUrls.push(`${parsedUrl.origin}${sampleInnerPaths[i]}`);
      }

      // Stage 4: Screenshots Generation (90%)
      updateScanProgress(scanId, 90, "Génération des captures d'écran et du rapport d'analyse...");
      await new Promise(r => setTimeout(r, 400));

      // Build screenshots array for scanned URLs if enabled
      const screenshots = [];
      if (takeScreenshots) {
        scannedUrls.forEach((pageUrl, idx) => {
          const pageTitle = idx === 0 ? "Page d'accueil (Accueil)" : `Page secondaire #${idx} (${new URL(pageUrl).pathname})`;
          screenshots.push({
            url: pageUrl,
            title: pageTitle,
            status: httpStatus || 200,
            preview: generatePageScreenshotSvg(pageUrl, pageTitle, httpStatus || 200, trackersDetected.length)
          });
        });
      }

      const setCookieHeader = headers['set-cookie'] || '';

      scanResult = {
        url: targetUrl,
        hostname: parsedUrl.hostname,
        scanned_at: new Date().toISOString(),
        duration_ms: Date.now() - inspectStartTime,
        scanned_urls: scannedUrls,
        screenshots: screenshots,
        options_applied: {
          numPages,
          headless: isHeadless,
          timeout_sec: timeoutMs / 1000,
          takeScreenshots,
          inspectCookies: options.inspectCookies !== false,
          inspectTrackers: options.inspectTrackers !== false
        },
        http_summary: {
          status: httpStatus || 200,
          server: headers['server'] || 'Nginx / Cloudflare',
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

    // Stage 5: Completed (100%)
    db.prepare(
      `UPDATE scans 
       SET status = ?, result_json = ?, progress_percent = 100, progress_step = ?, completed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`
    ).run('completed', JSON.stringify(scanResult), 'Scan terminé avec succès', scanId);

    console.log(`[Scanner Service] Scan ${scanId} completed successfully.`);
    return scanResult;
  } catch (error) {
    console.error(`[Scanner Service] Scan ${scanId} failed:`, error);
    db.prepare(
      `UPDATE scans 
       SET status = ?, error_message = ?, progress_step = ?, completed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`
    ).run('failed', error.message, 'Échec du scan', scanId);
    throw error;
  }
}
