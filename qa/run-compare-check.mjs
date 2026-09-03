import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { resolveBrowserExecutable } from './browser-resolver.mjs';
import { closeBrowserSafely, closeContextSafely, dismissPreviewBar, installHardProcessTimeout, withTimeout } from './browser-lifecycle.mjs';
import { sanitizeDeep, sanitizeText } from '../automation/core/url-sanitizer.mjs';
import { configuredBaseUrl, targetUrl } from './target-url.mjs';

const baseUrl = configuredBaseUrl('https://www.teppich-paradies.net');
const hardTimeout = installHardProcessTimeout({ timeoutMs: 5 * 60_000, label: 'Compare-Check' });
const collectionUrl = targetUrl('/collections/vinylboden-klickvinyl', baseUrl);
const root = path.resolve(import.meta.dirname, '..');
const resultsDir = path.join(root, 'qa', 'results');
const outputPath = path.join(resultsDir, 'compare-readiness.json');
const viewports = {
  Desktop: { width: 1440, height: 900 },
  Mobile: { width: 390, height: 844 },
};

fs.mkdirSync(resultsDir, { recursive: true });

async function runViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  try {
    const page = await context.newPage();
    const pageErrors = [];

    page.on('pageerror', (error) => {
      if (!/overflowMenu|Customer Privacy API/i.test(error.message)) pageErrors.push(sanitizeText(error.message));
    });
    await page.goto(collectionUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(800);
    await dismissPreviewBar(page);

    const declineConsent = page.locator('#shopify-pc__banner__btn-decline');
    if (await declineConsent.isVisible().catch(() => false)) {
      await declineConsent.click({ timeout: 5_000 });
      await page.waitForTimeout(200);
    }

    const bar = page.locator('[data-tp-compare-bar]');
    await bar.waitFor({ state: 'attached', timeout: 5_000 });
    const initial = await bar.evaluate((element) => ({
      hidden: element.hidden,
      display: getComputedStyle(element).display,
    }));

    const selectedHandles = [];
    for (let count = 1; count <= 3; count += 1) {
      const handle = await page.evaluate((usedHandles) => {
        const button = [...document.querySelectorAll('[data-tp-compare-toggle]')].find((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0 && !usedHandles.includes(element.dataset.tpCompareHandle);
        });
        button?.click();
        return button?.dataset.tpCompareHandle || null;
      }, selectedHandles);
      if (!handle) throw new Error(`Nur ${selectedHandles.length} sichtbare Vergleichsprodukte gefunden`);
      selectedHandles.push(handle);
      await page.waitForTimeout(100);
      const storedCount = await page.evaluate(() => JSON.parse(localStorage.getItem('tpCompareItems') || '[]').length);
      if (storedCount !== count) throw new Error(`Nach Auswahl ${count}: ${storedCount} statt ${count} Produkte gespeichert`);
    }

    const afterThree = await bar.evaluate((element) => ({
      hidden: element.hidden,
      collapsed: element.dataset.collapsed,
      count: JSON.parse(localStorage.getItem('tpCompareItems') || '[]').length,
    }));

    const collapseButton = page.locator('[data-tp-compare-collapse]');
    await collapseButton.waitFor({ state: 'visible', timeout: 5_000 });
    const collapseBounds = await collapseButton.boundingBox();
    await collapseButton.click({ timeout: 5_000 });
    const collapsed = await bar.evaluate((element) => {
      const compactButton = element.querySelector('[data-tp-compare-expand]');
      const bounds = compactButton.getBoundingClientRect();
      return {
        collapsed: element.dataset.collapsed,
        storedCount: JSON.parse(localStorage.getItem('tpCompareItems') || '[]').length,
        focused: document.activeElement === compactButton,
        ariaExpanded: compactButton.getAttribute('aria-expanded'),
        compactWidth: Math.round(bounds.width),
        compactHeight: Math.round(bounds.height),
      };
    });

    const expandButton = page.locator('[data-tp-compare-expand]');
    await expandButton.click({ timeout: 5_000 });
    const reopened = await bar.getAttribute('data-collapsed');

    await page.locator('[data-tp-compare-open]').click({ timeout: 5_000 });
    const dialogOpen = await page.locator('[data-tp-compare-dialog]').evaluate((dialog) => dialog.open);
    await page.locator('[data-tp-compare-close]').click({ timeout: 5_000 });

    await page.evaluate((handle) => {
      [...document.querySelectorAll('[data-tp-compare-toggle]')]
        .find((element) => element.dataset.tpCompareHandle === handle)
        ?.click();
    }, selectedHandles[0]);
    await page.waitForTimeout(100);
    const afterRemove = await page.evaluate(() => JSON.parse(localStorage.getItem('tpCompareItems') || '[]').length);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(500);
    const afterReload = await page.locator('[data-tp-compare-bar]').evaluate((element) => ({
      hidden: element.hidden,
      count: JSON.parse(localStorage.getItem('tpCompareItems') || '[]').length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));

    const pass = initial.hidden
      && initial.display === 'none'
      && afterThree.count === 3
      && afterThree.collapsed === 'false'
      && collapseBounds?.width >= 44
      && collapseBounds?.height >= 44
      && collapsed.collapsed === 'true'
      && collapsed.storedCount === 3
      && collapsed.focused
      && collapsed.ariaExpanded === 'false'
      && collapsed.compactHeight >= 44
      && reopened === 'false'
      && dialogOpen
      && afterRemove === 2
      && !afterReload.hidden
      && afterReload.count === 2
      && !afterReload.overflow
      && pageErrors.length === 0;

    return {
      viewport: name,
      pass,
      initial,
      afterThree,
      collapseButton: collapseBounds ? { width: Math.round(collapseBounds.width), height: Math.round(collapseBounds.height) } : null,
      collapsed,
      reopened,
      dialogOpen,
      afterRemove,
      afterReload,
      pageErrors,
    };
  } finally {
    await closeContextSafely(context);
  }
}

const results = [];
const browserResolution = resolveBrowserExecutable({ playwrightChromium: chromium });
let browser;
try {
  if (!browserResolution.executablePath) throw new Error(browserResolution.error);
  browser = await withTimeout(
    () => chromium.launch({ headless: true, executablePath: browserResolution.executablePath }),
    30_000,
    'Compare Browser-Start',
  );
  for (const [name, viewport] of Object.entries(viewports)) {
    try {
      results.push(await withTimeout(() => runViewport(browser, name, viewport), 90_000, `${name} Compare`));
    } catch (error) {
      results.push({ viewport: name, pass: false, errorClass: error.name, sanitizedError: sanitizeText(error.message) });
    }
    fs.writeFileSync(outputPath, `${JSON.stringify(sanitizeDeep({ runAt: new Date().toISOString(), browser: browserResolution.source, results }), null, 2)}\n`);
  }
} catch (error) {
  results.push({ viewport: 'all', pass: false, errorClass: error.name, sanitizedError: sanitizeText(error.message) });
} finally {
  await closeBrowserSafely(browser);
}

fs.writeFileSync(outputPath, `${JSON.stringify(sanitizeDeep({ runAt: new Date().toISOString(), browser: browserResolution.source, results }), null, 2)}\n`);

for (const result of results) {
  console.log(`${result.viewport} Vergleich: ${result.pass ? 'PASS' : 'FAIL'}`);
  if (!result.pass) console.log(JSON.stringify(result, null, 2));
}

if (results.some((result) => !result.pass)) process.exitCode = 1;
hardTimeout.clear();
