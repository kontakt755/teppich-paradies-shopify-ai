import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { resolveBrowserExecutable } from './browser-resolver.mjs';
import { closeBrowserSafely, closeContextSafely, installHardProcessTimeout, withTimeout } from './browser-lifecycle.mjs';
import { sanitizeDeep, sanitizeText } from '../automation/core/url-sanitizer.mjs';
import { configuredBaseUrl, targetUrl } from './target-url.mjs';

const baseUrl = configuredBaseUrl('https://www.teppich-paradies.net');
const hardTimeout = installHardProcessTimeout({ timeoutMs: 5 * 60_000, label: 'Compare-Remove-Dialog-Check' });
const collectionUrl = targetUrl('/collections/vinylboden-klickvinyl', baseUrl);
const root = path.resolve(import.meta.dirname, '..');
const resultsDir = path.join(root, 'qa', 'results');
const outputPath = path.join(resultsDir, 'compare-remove-dialog.json');
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

    const declineConsent = page.locator('#shopify-pc__banner__btn-decline');
    if (await declineConsent.isVisible().catch(() => false)) {
      await declineConsent.click({ timeout: 5_000 });
      await page.waitForTimeout(200);
    }

    const bar = page.locator('[data-tp-compare-bar]');
    await bar.waitFor({ state: 'attached', timeout: 5_000 });

    // Drei Produkte hinzufügen
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
    }

    // Dialog öffnen
    await page.locator('[data-tp-compare-open]').click({ timeout: 5_000 });
    const dialog = page.locator('[data-tp-compare-dialog]');
    const dialogOpen = await dialog.evaluate((d) => d.open);

    // Überprüfe, dass alle 3 Spalten mit Entfernen-Buttons vorhanden sind
    const headerCells = await dialog.locator('thead .tp-compare-header-cell').count();
    const removeButtons = await dialog.locator('[data-tp-compare-remove]').count();

    // Entfernen-Button im Dialog für das erste Produkt klicken
    const firstRemoveBtn = dialog.locator('[data-tp-compare-remove]').first();
    const firstHandle = await firstRemoveBtn.getAttribute('data-tp-compare-handle');
    await firstRemoveBtn.click({ timeout: 5_000 });
    await page.waitForTimeout(200);

    // Überprüfe, dass das Produkt aus localStorage entfernt wurde
    const afterRemove = await page.evaluate(() => JSON.parse(localStorage.getItem('tpCompareItems') || '[]'));
    const itemsCount = afterRemove.length;
    const firstHandleExists = afterRemove.some((item) => item.handle === firstHandle);

    // Überprüfe, dass die Dialog-Tabelle aktualisiert wurde (2 Spalten statt 3)
    const headerCellsAfter = await dialog.locator('thead .tp-compare-header-cell').count();
    const removeButtonsAfter = await dialog.locator('[data-tp-compare-remove]').count();

    // Dialog bleibt offen
    const dialogStillOpen = await dialog.evaluate((d) => d.open);

    // Überprüfe, dass verbleibende Entfernen-Buttons funktionieren
    const secondRemoveBtn = dialog.locator('[data-tp-compare-remove]').first();
    if (await secondRemoveBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await secondRemoveBtn.click({ timeout: 5_000 });
      await page.waitForTimeout(200);
    }

    const afterSecondRemove = await page.evaluate(() => JSON.parse(localStorage.getItem('tpCompareItems') || '[]').length);
    const headerCellsAfterSecond = await dialog.locator('thead .tp-compare-header-cell').count();

    const pass = dialogOpen
      && headerCells === 3
      && removeButtons === 3
      && itemsCount === 2
      && !firstHandleExists
      && headerCellsAfter === 2
      && removeButtonsAfter === 2
      && dialogStillOpen
      && afterSecondRemove === 1
      && headerCellsAfterSecond === 1
      && pageErrors.length === 0;

    return {
      viewport: name,
      pass,
      dialogOpen,
      initialHeaders: headerCells,
      initialRemoveButtons: removeButtons,
      afterFirstRemove: {
        itemsCount,
        firstHandleRemoved: !firstHandleExists,
        headerCount: headerCellsAfter,
        removeButtonCount: removeButtonsAfter,
        dialogStillOpen,
      },
      afterSecondRemove: {
        itemsCount: afterSecondRemove,
        headerCount: headerCellsAfterSecond,
      },
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
    'Compare-Remove Browser-Start',
  );
  for (const [name, viewport] of Object.entries(viewports)) {
    try {
      results.push(await withTimeout(() => runViewport(browser, name, viewport), 90_000, `${name} Compare-Remove`));
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
  console.log(`${result.viewport} Compare-Remove-Dialog: ${result.pass ? 'PASS' : 'FAIL'}`);
  if (!result.pass) console.log(JSON.stringify(result, null, 2));
}

if (results.some((result) => !result.pass)) process.exitCode = 1;
hardTimeout.clear();
