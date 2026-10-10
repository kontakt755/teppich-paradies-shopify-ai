import { chromium } from 'playwright-core';
import { sperreTracking } from './tracking-sperre.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { resolveBrowserExecutable } from './browser-resolver.mjs';
import { closeBrowserSafely, closeContextSafely, dismissPreviewBar, installHardProcessTimeout, withTimeout } from './browser-lifecycle.mjs';
import { sanitizeDeep, sanitizeText } from '../automation/core/url-sanitizer.mjs';
import { configuredBaseUrl, targetUrl, validatePreviewTheme } from './target-url.mjs';
import { auditCompareSources, compareAbsencePass, inspectCompareDom } from './compare-absence.mjs';

const baseUrl = configuredBaseUrl('https://www.teppich-paradies.net');
const hardTimeout = installHardProcessTimeout({ timeoutMs: 9 * 60_000, label: 'Compare-Abwesenheit' });
const root = path.resolve(import.meta.dirname, '..');
const resultsDir = path.join(root, 'qa', 'results');
const outputPath = path.join(resultsDir, 'compare-readiness.json');
const config = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'qa.config.json'), 'utf8'));
const pages = config.pages.filter(page => page.type === 'home' || page.type === 'search'
  || page.path === '/collections/vinylboden-klickvinyl' || page.path === '/collections/teppichboden'
  || page.path.startsWith('/products/'));
const scenarios = [
  { name: 'Ohne gespeicherten Vergleich', items: null },
  { name: 'Alte Vergleichsauswahl', items: JSON.stringify([
    { handle: 'marlow-eiche-nordisch-klickvinyl-7mm', title: 'Klickvinyl', url: '/products/marlow-eiche-nordisch-klickvinyl-7mm', pricePerSqm: '25,00 €' },
    { handle: 'piumera-teppichboden-400cm-500cm', title: 'Teppichboden', url: '/products/piumera-teppichboden-400cm-500cm', pricePerSqm: '20,00 €' },
    { handle: 'alvora-eiche-bernstein-klebevinyl-2-5mm', title: 'Klebevinyl', url: '/products/alvora-eiche-bernstein-klebevinyl-2-5mm', pricePerSqm: '22,00 €' },
  ]) },
];
fs.mkdirSync(resultsDir, { recursive: true });

async function runViewport(browser, name, viewport, scenario) {
  const context = await browser.newContext({ viewport });
  await sperreTracking(context);
  // Init-Skripte laufen in jedem Frame. In abgeschotteten iframes (Startseite)
  // wirft schon der Zugriff auf localStorage - das landete als Seitenfehler im
  // Gate. Die Vergleichsauswahl gehoert nur ins Hauptfenster.
  await context.addInitScript(({ items }) => {
    if (window.top !== window) return;
    if (items === null) localStorage.removeItem('tpCompareItems');
    else localStorage.setItem('tpCompareItems', items);
  }, scenario);
  try {
    const results = [];
    for (const pageConfig of pages) {
      const page = await context.newPage();
      const pageErrors = [];
      const requestedScripts = [];
      page.on('pageerror', error => {
        if (!/overflowMenu|Customer Privacy API/i.test(error.message)) pageErrors.push(sanitizeText(error.message));
      });
      page.on('request', request => {
        if (/tp-compare\.js/i.test(request.url())) requestedScripts.push(sanitizeText(request.url()));
      });
      try {
        const response = await page.goto(targetUrl(pageConfig.path, baseUrl), { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 3500 }).catch(() => {});
        await dismissPreviewBar(page);
        const declineConsent = page.locator('#shopify-pc__banner__btn-decline');
        if (await declineConsent.isVisible().catch(() => false)) await declineConsent.click({ timeout: 5_000 });
        await page.waitForTimeout(500);
        const evidence = await page.evaluate(inspectCompareDom);
        const preview = validatePreviewTheme(baseUrl, evidence.renderedThemeId);
        const status = response?.status() || 0;
        results.push({
          page: pageConfig.name, status, evidence, preview, pageErrors, requestedScripts,
          pass: compareAbsencePass({ status, evidence, pageErrors, requestedScripts, previewStatus: preview.status }),
        });
      } catch (error) {
        results.push({ page: pageConfig.name, pass: false, errorClass: error.name, sanitizedError: sanitizeText(error.message) });
      } finally {
        await page.close();
      }
    }
    return { viewport: name, scenario: scenario.name, pass: results.length === pages.length && results.every(result => result.pass), pages: results };
  } finally {
    await closeContextSafely(context);
  }
}

const sourceAudit = auditCompareSources(root);
const results = [{ viewport: 'Repository', pass: sourceAudit.pass, ...sourceAudit }];
const browserResolution = resolveBrowserExecutable({ playwrightChromium: chromium });
function writeResults() {
  fs.writeFileSync(outputPath, `${JSON.stringify(sanitizeDeep({ runAt: new Date().toISOString(), mode: 'compare-absent', browser: browserResolution.source, results }), null, 2)}\n`);
}
let browser;
try {
  if (!browserResolution.executablePath) throw new Error(browserResolution.error);
  browser = await withTimeout(() => chromium.launch({ headless: true, executablePath: browserResolution.executablePath }), 30_000, 'Compare Browser-Start');
  for (const [name, viewport] of Object.entries(config.viewports)) {
    for (const scenario of scenarios) {
      try {
        results.push(await withTimeout(() => runViewport(browser, name, viewport, scenario), 120_000, `${name} Compare-Abwesenheit`));
      } catch (error) {
        results.push({ viewport: name, scenario: scenario.name, pass: false, errorClass: error.name, sanitizedError: sanitizeText(error.message) });
      }
      writeResults();
    }
  }
} catch (error) {
  results.push({ viewport: 'all', pass: false, errorClass: error.name, sanitizedError: sanitizeText(error.message) });
} finally {
  await closeBrowserSafely(browser);
}
writeResults();
for (const result of results) {
  console.log(`${result.viewport}${result.scenario ? ` / ${result.scenario}` : ''} Vergleich entfernt: ${result.pass ? 'PASS' : 'FAIL'}`);
  if (!result.pass) console.log(JSON.stringify(result, null, 2));
}
if (results.some(result => !result.pass)) process.exitCode = 1;
hardTimeout.clear();
