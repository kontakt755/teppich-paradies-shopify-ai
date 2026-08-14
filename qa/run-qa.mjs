import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildEvidence, formatEvidenceForConsole, writeEvidence } from './evidence-filter.mjs';
import { targetUrl as workflowTargetUrl } from './target-url.mjs';
import { resolveBrowserExecutable } from './browser-resolver.mjs';
import { closeBrowserSafely, closeContextSafely, installHardProcessTimeout } from './browser-lifecycle.mjs';
import { isKnownShopifyLoginXFrameWarning } from './console-classification.mjs';
import { sanitizeDeep, sanitizeText, sanitizeUrl } from '../automation/core/url-sanitizer.mjs';
import { parseJsonProcessOutput, runProcess, shopifyInvocations } from './process-runner.mjs';

const root = path.resolve(import.meta.dirname, '..');
const qaDir = path.join(root, 'qa');
const artifactsDir = path.join(qaDir, 'artifacts');
const resultsDir = path.join(qaDir, 'results');
const workflowReportDir = process.env.WORKFLOW_REPORT_DIR ? path.resolve(process.env.WORKFLOW_REPORT_DIR) : null;
const reportPath = workflowReportDir ? path.join(workflowReportDir, 'QA_REPORT.md') : path.join(root, 'QA_REPORT.md');
const baselinePath = path.join(qaDir, 'theme-check-baseline.json');
const config = JSON.parse(fs.readFileSync(path.join(qaDir, 'qa.config.json'), 'utf8'));
if (process.env.WORKFLOW_BASE_URL) config.baseUrl = process.env.WORKFLOW_BASE_URL;
const args = new Set(process.argv.slice(2));
const takeAllScreenshots = args.has('--screenshots');
const updateBaseline = args.has('--update-baseline');
const startedAt = new Date();
const started = Date.now();
const hardTimeout = installHardProcessTimeout({ timeoutMs: 15 * 60_000, label: 'QA-Gesamtlauf' });

fs.mkdirSync(resultsDir, { recursive: true });
if (workflowReportDir) fs.mkdirSync(workflowReportDir, { recursive: true });
fs.rmSync(artifactsDir, { recursive: true, force: true });
fs.mkdirSync(artifactsDir, { recursive: true });

function fingerprint(file, offense) {
  const relative = path.relative(root, file.path || file).replaceAll('\\', '/');
  return `${offense.severity}|${offense.check}|${relative}|${offense.start_row}:${offense.start_column}|${offense.message}`;
}

// Theme pulls can shift JSON/Liquid lines without changing a finding. Keep the
// recorded position for diagnostics, but exclude it when matching the baseline.
function stableFingerprint(value) {
  return value.replace(/\|\d+:\d+\|/, '|*|');
}

async function runThemeCheck() {
  const themeArgs = ['theme', 'check', '--output', 'json', '--no-color'];
  const attempts = [];
  let parsed;
  for (const invocation of shopifyInvocations()) {
    const result = await runProcess(invocation.command, [...invocation.args, ...themeArgs], { cwd: root });
    parsed = parseJsonProcessOutput(result, { label: `Theme Check (${invocation.label})`, allowedExitCodes: [0, 1] });
    attempts.push({ label: invocation.label, failed: parsed.failed, kind: parsed.kind });
    if (!parsed.failed) break;
  }
  if (parsed?.failed) return { ...parsed, attempts };
  const files = parsed?.value;
  if (!Array.isArray(files)) return { failed: true, kind: 'invalid-output', error: 'Theme Check: JSON-Ausgabe ist kein Datei-Array' };
  const findings = files.flatMap(file => file.offenses.map(offense => ({
    fingerprint: fingerprint(file, offense), file: path.relative(root, file.path).replaceAll('\\', '/'),
    check: offense.check, severity: offense.severity, line: offense.start_row + 1, message: offense.message
  })));
  return {
    failed: false, findings,
    errors: findings.filter(x => x.severity === 'error').length,
    warnings: findings.filter(x => x.severity === 'warning').length,
    recoveredProcessFailures: attempts.filter(attempt => attempt.failed)
  };
}

const themeCheck = await runThemeCheck();
if (updateBaseline && !themeCheck.failed) {
  fs.writeFileSync(baselinePath, JSON.stringify({
    generatedAt: new Date().toISOString(), errors: themeCheck.errors, warnings: themeCheck.warnings,
    fingerprints: themeCheck.findings.map(x => x.fingerprint).sort()
  }, null, 2) + '\n');
}
let baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : { errors: 0, warnings: 0, fingerprints: [] };
const known = new Set((baseline.fingerprints || []).map(stableFingerprint));
themeCheck.newFindings = themeCheck.failed ? [] : themeCheck.findings.filter(x => !known.has(stableFingerprint(x.fingerprint)));

const matchesAny = (value, patterns = []) => patterns.some(pattern => {
  try { return new RegExp(pattern, 'i').test(value); } catch { return value.includes(pattern); }
});
const knownConsoleIssue = (type, message) => (config.knownConsoleIssues || []).find(issue =>
  issue.type === type && issue.exactMessage === message
);
const safeName = value => value.normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const checks = [];
const details = [];
const add = (scope, pageName, viewport, severity, message, data) => {
  const item = sanitizeDeep({ scope, page: pageName, viewport, severity, message, ...(data ? { data } : {}) });
  checks.push(item); return item;
};

async function inspectPage(browser, pageConfig, viewportName, viewport) {
  const context = await browser.newContext({ viewport, locale: 'de-DE', reducedMotion: 'reduce' });
  try {
  const page = await context.newPage();
  const pageErrors = [];
  const knownConsole = [];
  const thirdParty = [];
  const assetErrors = [];
  const targetUrl = workflowTargetUrl(pageConfig.path, config.baseUrl);
  const targetHost = new URL(config.baseUrl).host;

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const sourceUrl = msg.location().url || '';
    const event = { type: 'console.error', message: msg.text(), url: sourceUrl };
    if (isKnownShopifyLoginXFrameWarning(event, config.baseUrl)) {
      knownConsole.push({ ...event, url: sanitizeUrl(sourceUrl), message: sanitizeText(event.message), knownIssueId: 'shop-login-x-frame', reportLabel: 'Shopify Login with Shop / X-Frame-Options' });
      return;
    }
    const rawEntry = `${event.message} (${sourceUrl || 'inline'})`;
    if (matchesAny(rawEntry, config.allowlist.console)) return;
    const host = (() => { try { return new URL(sourceUrl).host; } catch { return targetHost; } })();
    (host === targetHost && !/shop\.app|\/favicon\.ico/i.test(rawEntry) ? pageErrors : thirdParty).push({ type: event.type, message: sanitizeText(rawEntry), url: sanitizeUrl(sourceUrl) });
  });
  page.on('pageerror', error => {
    const knownIssue = knownConsoleIssue('pageerror', error.message);
    (knownIssue ? knownConsole : pageErrors).push({ type: 'pageerror', message: sanitizeText(error.message), knownIssueId: knownIssue?.id, reportLabel: knownIssue?.reportLabel });
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (matchesAny(url, config.allowlist.requests)) return;
    const entry = { type: 'requestfailed', url: sanitizeUrl(url), message: sanitizeText(request.failure()?.errorText || 'Request fehlgeschlagen') };
    let host; try { host = new URL(url).host; } catch { host = targetHost; }
    const important = ['document', 'script', 'stylesheet', 'image', 'font'].includes(request.resourceType());
    (host === targetHost && important ? assetErrors : thirdParty).push(entry);
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    const url = response.url();
    if (matchesAny(url, config.allowlist.requests)) return;
    let host; try { host = new URL(url).host; } catch { host = targetHost; }
    const important = response.request().resourceType() === 'document' || (['script', 'stylesheet', 'image', 'font'].includes(response.request().resourceType()) && !/\/favicon\.ico(?:\?|$)/i.test(url));
    const entry = { type: 'http', status: response.status(), resourceType: response.request().resourceType(), url: sanitizeUrl(url) };
    if (host === targetHost && important) assetErrors.push(entry); else thirdParty.push(entry);
  });

  let response;
  let navigationError;
  try {
    response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 3500 }).catch(() => {});
    if (pageConfig.expect?.pricePerSquareMeter) {
      await page.waitForFunction(() => {
        const visible = element => {
          const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
        };
        const main = document.querySelector('main, #MainContent, [role="main"]');
        const heading = main?.querySelector('h1');
        const productRegion = main?.querySelector('product-information') || heading?.closest('section, .shopify-section') || main;
        return [...(productRegion?.querySelectorAll('*') || [])].some(element =>
          visible(element) && /(?:€\s*\d[\d.,]*|\d[\d.,]*\s*€)\s*(?:\/|pro)\s*m(?:²|2)(?=\s|$|[^a-z0-9])/i.test((element.innerText || element.textContent || '').replace(/\s+/g, ' '))
        );
      }, { timeout: 5000 }).catch(() => {});
    }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Sichtbare responsive Shopify-Bilder koennen beim ersten CDN-Aufruf noch
    // verarbeitet werden. Kurz auf deren echten Ladeabschluss warten, damit
    // ein langsames Bild nicht als defektes Bild gewertet wird. 4xx-Antworten
    // und naturalWidth === 0 bleiben weiterhin echte Errors.
    await page.evaluate(() => new Promise(resolve => {
      const allImages = [...document.images];
      if (!allImages.length) {
        resolve();
        return;
      }
      let settled = false;
      let observer;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        observer?.disconnect();
        resolve();
      };
      const timeout = window.setTimeout(finish, 5000);
      observer = new IntersectionObserver(entries => {
        const images = entries.filter(entry => entry.isIntersecting).map(entry => entry.target);
        if (!images.length || images.every(image => image.complete)) {
          finish();
          return;
        }
        let pending = images.filter(image => !image.complete).length;
        const done = () => {
          pending -= 1;
          if (pending <= 0) finish();
        };
        images.filter(image => !image.complete).forEach(image => {
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
        });
      });
      allImages.forEach(image => observer.observe(image));
    }));
  } catch (error) { navigationError = error.message; }

  let metrics = null;
  if (!navigationError) {
    metrics = await page.evaluate(async () => {
      const visible = element => {
        const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.top < innerHeight
          && rect.right > 0 && rect.left < innerWidth
          && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
      };
      const allImages = [...document.images];
      const intersectingImages = new Set(await new Promise(resolve => {
        if (!allImages.length) {
          resolve([]);
          return;
        }
        let settled = false;
        let observer;
        const finish = images => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          observer?.disconnect();
          resolve(images);
        };
        const timeout = window.setTimeout(() => finish([]), 3000);
        observer = new IntersectionObserver(entries => finish(entries.filter(entry => entry.isIntersecting).map(entry => entry.target)));
        allImages.forEach(image => observer.observe(image));
      }));
      const visibleImages = allImages.filter(image => visible(image) && intersectingImages.has(image));
      const brokenImages = visibleImages.filter(img => img.complete && img.naturalWidth === 0).map(img => img.currentSrc || img.src || img.alt || '(ohne Quelle)');
      const unloadedVisibleImages = visibleImages.filter(img => !img.complete).map(img => img.currentSrc || img.src || img.alt || '(ohne Quelle)');
      const emptyPlaceholders = [...document.querySelectorAll('.placeholder-svg, svg.placeholder, .product-media-container .placeholder')].filter(visible).length;
      const main = document.querySelector('main, #MainContent, [role="main"]');
      const mainRect = main?.getBoundingClientRect();
      const bodyText = document.body?.innerText || '';
      const heading = main?.querySelector('h1');
      const productRegion = main?.querySelector('product-information') || heading?.closest('section, .shopify-section') || main;
      const visibleProductTexts = [...(productRegion?.querySelectorAll('*') || [])]
        .filter(visible).map(element => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim());
      const pricePerSquareMeterMatches = visibleProductTexts.filter(value => /(?:€\s*\d[\d.,]*|\d[\d.,]*\s*€)\s*(?:\/|pro)\s*m(?:²|2)(?=\s|$|[^a-z0-9])/i.test(value));
      const textOf = selector => [...document.querySelectorAll(selector)].filter(visible).map(x => (x.innerText || x.value || x.getAttribute('aria-label') || '').trim()).join(' ');
      const interactiveText = `${textOf('button')} ${textOf('a')} ${textOf('input[type="submit"]')}`;
      const allInteractiveText = [...document.querySelectorAll('button, a, input[type="submit"]')].map(x => (x.innerText || x.value || x.getAttribute('aria-label') || '').trim()).join(' ');
      return {
        title: document.title.trim(), clientWidth: document.documentElement.clientWidth,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
        mainHeight: mainRect?.height || 0, mainTextLength: (main?.innerText || '').trim().length,
        hasHeader: !!document.querySelector('header, [role="banner"], #shopify-section-header'),
        bodyText, interactiveText, allInteractiveText, visibleImageCount: visibleImages.length,
        hasVisiblePricePerSquareMeter: pricePerSquareMeterMatches.length > 0,
        pricePerSquareMeterMatches: pricePerSquareMeterMatches.filter((value, index, values) => values.indexOf(value) === index).slice(0, 5),
        brokenImages, unloadedVisibleImages, emptyPlaceholders
      };
    });
  }

  const failuresBefore = checks.filter(x => x.page === pageConfig.name && x.viewport === viewportName && x.severity === 'error').length;
  if (navigationError) add('Live Shop', pageConfig.name, viewportName, 'error', `Navigation fehlgeschlagen: ${navigationError}`);
  else {
    const status = response?.status() || 0;
    if (!response || status >= 400) add('Live Shop', pageConfig.name, viewportName, 'error', `HTTP ${status || 'ohne Antwort'} für ${targetUrl}`);
    if (page.url().includes('preview_theme_id=')) add('Live Shop', pageConfig.name, viewportName, 'error', 'Unerwarteter Theme-Preview-Parameter');
    if (!metrics.title) add('Live Shop', pageConfig.name, viewportName, 'error', 'Seitentitel fehlt');
    if (!metrics.hasHeader) add('Navigation', pageConfig.name, viewportName, 'error', 'Header fehlt');
    if (metrics.mainHeight < 100 || metrics.mainTextLength < 20) add('Live Shop', pageConfig.name, viewportName, 'error', 'Hauptbereich ist offensichtlich leer');
    const overflow = metrics.scrollWidth - metrics.clientWidth;
    if (overflow > config.overflowTolerancePx) add('Browser', pageConfig.name, viewportName, 'error', `${viewportName}-Overflow: ${overflow}px (scrollWidth ${metrics.scrollWidth}px, Viewport ${metrics.clientWidth}px)`);
    for (const image of metrics.brokenImages) add('Bilder', pageConfig.name, viewportName, 'error', `Sichtbares Bild defekt: ${image}`);
    for (const image of metrics.unloadedVisibleImages) add('Bilder', pageConfig.name, viewportName, 'error', `Sichtbares Bild nach Seitenruhe nicht geladen: ${image}`);
    if ((pageConfig.minVisibleImages || 0) > metrics.visibleImageCount) add('Bilder', pageConfig.name, viewportName, 'error', `Nur ${metrics.visibleImageCount} sichtbare Bilder (erwartet mindestens ${pageConfig.minVisibleImages})`);
    if (metrics.emptyPlaceholders) add('Bilder', pageConfig.name, viewportName, 'error', `${metrics.emptyPlaceholders} sichtbare leere/graue Bild-Platzhalter erkannt`);
    for (const forbidden of pageConfig.forbiddenText || []) if (metrics.bodyText.toLowerCase().includes(forbidden.toLowerCase())) add('Shop-Smoke', pageConfig.name, viewportName, 'error', `Unerwünschter Text sichtbar: „${forbidden}“`);
    const exp = pageConfig.expect || {};
    if (exp.pricePerSquareMeter && !metrics.hasVisiblePricePerSquareMeter) add('Shop-Smoke', pageConfig.name, viewportName, 'error', 'Sichtbarer „€/m²“-Preis im Produkt-Kaufbereich fehlt');
    if (exp.cart && !/(in den warenkorb|zum warenkorb|add to cart)/i.test(metrics.allInteractiveText)) add('Shop-Smoke', pageConfig.name, viewportName, 'error', 'Warenkorbbutton fehlt');
    if (exp.sample && !/(muster|sample)/i.test(metrics.allInteractiveText)) add('Shop-Smoke', pageConfig.name, viewportName, 'error', 'Muster-CTA fehlt');
    if (exp.compare && !/(vergleich|compare)/i.test(metrics.allInteractiveText)) add('Shop-Smoke', pageConfig.name, viewportName, 'error', 'Vergleichsbutton fehlt');
    if (pageConfig.type === 'vinylCollection' && !metrics.bodyText.trim()) add('Shop-Smoke', pageConfig.name, viewportName, 'error', 'Vinylboden-Collection ist leer');
    if (pageConfig.type === 'carpetCollection' && metrics.visibleImageCount < 1) add('Shop-Smoke', pageConfig.name, viewportName, 'error', 'Keine sichtbaren Teppichboden-Bilder');
    pageErrors.slice(0, 10).forEach(x => add('Browser', pageConfig.name, viewportName, 'error', `${x.type}: ${x.message}`));
    knownConsole.forEach(x => add('Known Baseline Console', pageConfig.name, viewportName, 'warning', x.reportLabel, x));
    assetErrors.slice(0, 10).forEach(x => add('Browser', pageConfig.name, viewportName, 'error', `${x.type}${x.status ? ` ${x.status}` : ''}: ${x.url}`, x));
    if (thirdParty.length) add('Drittanbieter', pageConfig.name, viewportName, 'warning', `${thirdParty.length} Drittanbieter-Konsole/Requests separat protokolliert`);
  }

  const hasNewFailure = checks.filter(x => x.page === pageConfig.name && x.viewport === viewportName && x.severity === 'error').length > failuresBefore;
  if ((takeAllScreenshots || hasNewFailure) && !navigationError) {
    await page.screenshot({ path: path.join(artifactsDir, `${safeName(pageConfig.name)}-${viewportName.toLowerCase()}.png`), fullPage: false }).catch(() => {});
  }
  details.push(sanitizeDeep({ page: pageConfig.name, viewport: viewportName, url: targetUrl, finalUrl: page.url(), status: response?.status(), metrics, pageErrors, knownConsole, assetErrors, thirdParty }));
  } finally {
    await closeContextSafely(context);
  }
}

let browserError;
const browserResolution = resolveBrowserExecutable({ configuredPath: config.browserExecutable, playwrightChromium: chromium });
const executablePath = browserResolution.executablePath;
if (!executablePath) browserError = browserResolution.error;
else {
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const jobs = Object.entries(config.viewports).flatMap(([viewportName, viewport]) =>
      config.pages.map(pageConfig => () => inspectPage(browser, pageConfig, viewportName, viewport))
    );
    const workers = Array.from({ length: Math.min(3, jobs.length) }, async () => {
      while (jobs.length) await jobs.shift()();
    });
    await Promise.all(workers);
  } catch (error) { browserError = error.stack || error.message; }
  finally { await closeBrowserSafely(browser); }
}
if (browserError) add('Browser', 'Gesamtlauf', '-', 'error', browserError.split('\n')[0]);

if (themeCheck.failed) add('Theme Check', 'Theme', '-', 'error', themeCheck.error);
else {
  themeCheck.recoveredProcessFailures.forEach(failure => add('QA Harness', 'Theme Check', '-', 'warning', `Theme-Check-Aufruf ${failure.label} fehlgeschlagen (${failure.kind}); begrenzter Fallback lieferte valide Ausgabe`));
  themeCheck.newFindings.forEach(x => add('Theme Check', x.file, '-', 'error', `Neuer ${x.severity}: ${x.check} (Zeile ${x.line}) – ${x.message}`));
}

const errors = checks.filter(x => x.severity === 'error');
const warnings = checks.filter(x => x.severity === 'warning');
const status = errors.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS';
const durationSeconds = Math.round((Date.now() - started) / 100) / 10;
const pageRows = [];
for (const viewportName of Object.keys(config.viewports)) for (const pageConfig of config.pages) {
  const failed = errors.some(x => x.page === pageConfig.name && x.viewport === viewportName);
  const warned = warnings.some(x => x.page === pageConfig.name && x.viewport === viewportName);
  pageRows.push(`${failed ? '✗' : warned ? '⚠' : '✓'} ${pageConfig.name} ${viewportName}`);
}
const tcLine = themeCheck.failed ? `✗ ${themeCheck.error}` : [
  `${themeCheck.newFindings.filter(x => x.severity === 'error').length ? '✗' : '✓'} ${themeCheck.newFindings.filter(x => x.severity === 'error').length} neue Errors`,
  `${themeCheck.newFindings.filter(x => x.severity === 'warning').length ? '✗' : '✓'} ${themeCheck.newFindings.filter(x => x.severity === 'warning').length} neue Warnings`,
  `Baseline: ${baseline.errors} Errors / ${baseline.warnings} Warnings`,
  `Aktuell: ${themeCheck.errors} Errors / ${themeCheck.warnings} Warnings`
].join('\n');
const groupedProblems = [...errors.reduce((map, item) => {
  const key = `${item.scope}|${item.message}`;
  const current = map.get(key) || { ...item, occurrences: [] };
  current.occurrences.push(`${item.page}${item.viewport !== '-' ? ` ${item.viewport}` : ''}`);
  map.set(key, current); return map;
}, new Map()).values()];
const problemLines = groupedProblems.length ? groupedProblems.slice(0, 25).map((x, i) => `${i + 1}. ${x.message}${x.occurrences.length > 1 ? ` (${x.occurrences.length}×)` : ` – ${x.occurrences[0]}`}`).join('\n') : 'Keine neuen relevanten Probleme.';
const knownConsoleWarnings = warnings.filter(x => x.scope === 'Known Baseline Console');
const thirdPartyWarnings = warnings.filter(x => x.scope === 'Drittanbieter');
const knownConsoleLabels = [...new Set(knownConsoleWarnings.map(x => x.message))];
const knownConsoleReport = knownConsoleLabels.length ? `⚠ bekannte Baseline-Console-Issues:\n${knownConsoleLabels.map(label => `  - ${label}`).join('\n')}` : '✓ keine bekannten Console-Baseline-Issues aktiv';
const report = `# TEPPICH PARADIES – QA\n\nStatus: **${status}**\\\nZeitpunkt: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}\\\nLaufzeit: ${durationSeconds} s\n\n## Theme Check\n\n${tcLine}\n\n## Live Shop\n\n${pageRows.join('\n')}\n\n## Browser und Bilder\n\n${errors.some(x => x.scope === 'Browser') ? '✗' : '✓'} keine neuen kritischen Console-/Assetfehler\\\n${knownConsoleReport}\\\n${errors.some(x => x.message.includes('Overflow')) ? '✗' : '✓'} kein horizontaler Overflow\\\n${errors.some(x => x.scope === 'Bilder') ? '✗' : '✓'} sichtbare Bilder geladen\\\n${thirdPartyWarnings.length ? `⚠ ${thirdPartyWarnings.length} Drittanbieterhinweise (Details in qa/results/latest-details.json)` : '✓ keine Drittanbieterhinweise'}\n\n## Probleme\n\n${problemLines}\n`;
fs.writeFileSync(reportPath, report);
const result = { status, exitCode: errors.length ? 1 : 0, startedAt: startedAt.toISOString(), durationSeconds, themeCheck: themeCheck.failed ? themeCheck : { baseline: { errors: baseline.errors, warnings: baseline.warnings }, current: { errors: themeCheck.errors, warnings: themeCheck.warnings }, newFindings: themeCheck.newFindings }, checks, pages: details.map(({ page, viewport, url, finalUrl, status }) => ({ page, viewport, url, finalUrl, status })) };
fs.writeFileSync(path.join(resultsDir, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
fs.writeFileSync(path.join(resultsDir, 'latest-details.json'), JSON.stringify(details, null, 2) + '\n');
const evidence = buildEvidence(result);
writeEvidence(evidence, path.join(qaDir, 'evidence', 'latest-failure.json'));
console.log(`QA ${status} – ${errors.length} relevante Fehler, ${warnings.length} Hinweise – ${durationSeconds} s`);
console.log(`Bericht: ${reportPath}`);
console.log(formatEvidenceForConsole(evidence));
process.exitCode = result.exitCode;
hardTimeout.clear();
