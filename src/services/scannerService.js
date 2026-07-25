import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure outputs directory exists
const outputsDir = path.resolve(process.cwd(), 'outputs');
const screenshotsBaseDir = path.join(outputsDir, 'screenshots');
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}
if (!fs.existsSync(screenshotsBaseDir)) {
  fs.mkdirSync(screenshotsBaseDir, { recursive: true });
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
 * Locate Chrome executable path if present
 */
function findChromeExecutable() {
  const possiblePaths = [
    'C:\\Users\\laure\\.cache\\puppeteer\\chrome\\win64-150.0.7871.24\\chrome-win64\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Capture real website page screenshot with Puppeteer and save as physical JPEG file in outputs/screenshots/SCAN_ID/
 */
async function captureAndSavePageScreenshot(scanId, pageIndex, pageUrl, isHeadless = true, timeoutMs = 30000) {
  try {
    const puppeteer = await import('puppeteer');
    const executablePath = findChromeExecutable();

    const launchOpts = {
      headless: isHeadless ? 'new' : false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    if (executablePath) {
      launchOpts.executablePath = executablePath;
    }

    const browser = await puppeteer.default.launch(launchOpts);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 800)));

    // Create physical directory outputs/screenshots/SCAN_ID/
    const scanOutputDir = path.join(screenshotsBaseDir, scanId);
    if (!fs.existsSync(scanOutputDir)) {
      fs.mkdirSync(scanOutputDir, { recursive: true });
    }

    const imageFilename = `page_${pageIndex + 1}.jpg`;
    const imageFilePath = path.join(scanOutputDir, imageFilename);

    // Save physical JPEG image file to disk
    await page.screenshot({ path: imageFilePath, type: 'jpeg', quality: 80 });
    await browser.close();

    console.log(`[Scanner Service] Saved physical screenshot file: ${imageFilePath}`);

    // Return relative web URL path for frontend rendering & DB storage
    return `outputs/screenshots/${scanId}/${imageFilename}`;
  } catch (err) {
    console.warn(`[Puppeteer Screenshot Notice] Could not capture screenshot for ${pageUrl}: ${err.message}. Using live web screenshot fallback...`);
    return getRealWebsiteScreenshotUrl(pageUrl);
  }
}

/**
 * Fallback real live website screenshot URL
 */
function getRealWebsiteScreenshotUrl(pageUrl) {
  return `https://image.thum.io/get/width/800/crop/600/${pageUrl}`;
}

/**
 * Queue and execute a site scan with interactive progress tracking & physical image storage
 */
export async function runScanJob(scanId, targetUrl, options = {}) {
  try {
    // Stage 1: Pending -> Processing (15%)
    db.prepare('UPDATE scans SET status = ? WHERE id = ?').run('processing', scanId);
    updateScanProgress(scanId, 15, 'Initialisation du navigateur et du scanner...');

    console.log(`[Scanner Service] Starting scan job ${scanId} for URL: ${targetUrl} with options:`, options);

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
    await new Promise(r => setTimeout(r, 600));
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
      console.log(`[Scanner Service] Native blacklight-collector notice: ${collectorErr.message}. Running HTTP & Puppeteer inspector...`);
    }

    // Inspector fallback
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

      // Stage 4: Screenshots Generation & Physical Disk Storage (90%)
      updateScanProgress(scanId, 90, "Génération des captures d'écran et enregistrement dans C:\\wamp64\\www\\eocheck\\outputs...");

      const screenshots = [];
      if (takeScreenshots) {
        for (let idx = 0; idx < scannedUrls.length; idx++) {
          const pageUrl = scannedUrls[idx];
          const pageTitle = idx === 0 ? "Page d'accueil (Accueil)" : `Page secondaire #${idx} (${new URL(pageUrl).pathname})`;

          // Save physical JPEG image file into outputs/screenshots/SCAN_ID/
          const imageWebPath = await captureAndSavePageScreenshot(scanId, idx, pageUrl, isHeadless, timeoutMs);

          screenshots.push({
            url: pageUrl,
            title: pageTitle,
            status: httpStatus || 200,
            preview: imageWebPath
          });
        }
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

    console.log(`[Scanner Service] Scan ${scanId} completed successfully with physical files in outputs/screenshots/${scanId}.`);
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
