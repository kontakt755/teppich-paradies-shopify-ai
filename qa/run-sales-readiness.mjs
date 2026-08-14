import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveBrowserExecutable } from './browser-resolver.mjs';
import { closeBrowserSafely, closeContextSafely, installHardProcessTimeout, withTimeout } from './browser-lifecycle.mjs';
import { isKnownShopifyLoginXFrameWarning } from './console-classification.mjs';
import { sanitizeDeep, sanitizeText, sanitizeUrl } from '../automation/core/url-sanitizer.mjs';

const root = path.resolve(import.meta.dirname, '..');
const hardTimeout = installHardProcessTimeout({ timeoutMs: 15 * 60_000, label: 'Sales-Check' });
const resultsDir = path.join(root, 'qa', 'results');
const outputPath = path.join(resultsDir, 'sales-readiness.json');
const baseUrl = 'https://www.teppich-paradies.net';
const FLOW_TIMEOUT_MS = 120_000;
const CLEANUP_TIMEOUT_MS = 10_000;
const viewports = {
  Desktop: { width: 1440, height: 1000 },
  Mobile: { width: 390, height: 844 },
};

fs.mkdirSync(resultsDir, { recursive: true });

const args = new Set(process.argv.slice(2));
const viewportFilterActive = args.has('--mobile') || args.has('--desktop');
const flowFilterActive = args.has('--package') || args.has('--roll') || args.has('--sample');
const selectedViewports = Object.entries(viewports).filter(([name]) => !viewportFilterActive || args.has(`--${name.toLowerCase()}`));
const selectedFlows = {
  package: !flowFilterActive || args.has('--package'),
  roll: !flowFilterActive || args.has('--roll'),
  sample: !flowFilterActive || args.has('--sample'),
};

const report = {
  runAt: new Date().toISOString(),
  orderCompleted: false,
  flowTimeoutMs: FLOW_TIMEOUT_MS,
  results: [],
  summary: { passed: 0, failed: 0 },
};

function persistReport() {
  report.summary = {
    passed: report.results.filter(result => result.status === 'PASS').length,
    failed: report.results.filter(result => result.status !== 'PASS').length,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(sanitizeDeep(report), null, 2)}\n`);
}

function isKnownExternalNoise(value = '') {
  return /shop\.app|shopify_pay\/accelerated_checkout|monorail-edge|\/api\/collect|a\.globo\.io\/menu\/track|error-analytics-sessions-production|Required ref "overflowMenu"|chrome-error:\/\/chromewebdata|\/favicon\.ico|ERR_BLOCKED_BY_RESPONSE|Content Security Policy.*frame-ancestors/i.test(value);
}

function attachDiagnostics(page) {
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const sourceUrl = message.location().url || '';
    const event = { type: 'console.error', message: message.text(), url: sourceUrl };
    if (isKnownShopifyLoginXFrameWarning(event, baseUrl)) return;
    const row = `${event.message} ${sourceUrl}`.trim();
    if (!isKnownExternalNoise(row)) consoleErrors.push(sanitizeText(row));
  });
  page.on('pageerror', error => {
    if (!isKnownExternalNoise(error.message)) consoleErrors.push(sanitizeText(error.message));
  });
  page.on('requestfailed', request => {
    const row = `${request.url()} ${request.failure()?.errorText || ''}`;
    if (!isKnownExternalNoise(row)) failedRequests.push(sanitizeText(row));
  });
  return { consoleErrors, failedRequests };
}

async function pageHealth(page) {
  return page.evaluate(() => ({
    brokenImages: [...document.querySelectorAll('main img')]
      .filter(img => img.getBoundingClientRect().width >= 40 && img.complete && img.naturalWidth === 0)
      .map(img => img.currentSrc || img.src),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    shipping: /Deutschlandweiter Versand/i.test(document.body.innerText),
    curbside: /frei Bordsteinkante/i.test(document.body.innerText),
    paymentArea: /Sicher bezahlen/i.test(document.body.innerText),
  }));
}

async function getCart(context) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await context.request.get(`${baseUrl}/cart.js`, { headers: { accept: 'application/json' }, timeout: 10_000 });
    const cart = await response.json();
    if (cart.item_count > 0) return cart;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { item_count: 0, total_price: 0, items: [] };
}

async function reachCheckout(page, setPhase) {
  setPhase('cart');
  const isCart = () => {
    try { return new URL(page.url()).pathname === '/cart'; } catch { return false; }
  };
  if (!isCart()) {
    try {
      await page.goto(`${baseUrl}/cart`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (error) {
      if (!/interrupted by another navigation[\s\S]*\/cart/i.test(error.message)) throw error;
      await page.waitForURL(url => url.pathname === '/cart', { timeout: 15_000 });
    }
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
  const cartHealth = await pageHealth(page);
  const button = page.locator('button[name="checkout"], input[name="checkout"]').first();
  if (!(await button.count())) return { reachable: false, url: sanitizeUrl(page.url()), reason: 'Checkout-Button fehlt', cartHealth };
  setPhase('checkout');
  const navigation = page.waitForURL(/checkout|checkouts/i, { timeout: 15_000 }).catch(() => {});
  await button.click({ noWaitAfter: true, timeout: 10_000 });
  await navigation;
  const url = page.url();
  return { reachable: /checkout|checkouts/i.test(url), url: sanitizeUrl(url), cartHealth };
}

async function packageFlow({ page, context, result, setPhase }) {
  setPhase('navigation');
  await page.goto(`${baseUrl}/products/marlow-eiche-nordisch-klickvinyl-7mm`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  setPhase('calculator');
  const input = page.locator('main input[type="number"]').first();
  await input.fill('10');
  await input.dispatchEvent('input');
  await input.dispatchEvent('change');
  await page.waitForFunction(() => /Gesamtpreis\s+529,90\s*€/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 10_000 });
  const calculatorText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  result.health = await pageHealth(page);
  setPhase('add-to-cart');
  const addResponse = page.waitForResponse(response => response.url().includes('/cart/add') && response.status() === 200, { timeout: 30_000 });
  await page.getByRole('button', { name: 'In den Warenkorb', exact: true }).click({ timeout: 15_000 });
  await addResponse;
  const cart = await getCart(context);
  const line = cart.items[0];
  result.calculator = {
    perSqmVisible: /50,95\s*€\/m²/.test(calculatorText),
    packageContentVisible: /2,08\s*m²/.test(calculatorText),
    packagesVisible: /Pakete\s*−\s*5\s*\+/.test(calculatorText),
    totalVisible: /529,90\s*€/.test(calculatorText),
  };
  result.cart = {
    itemCount: cart.item_count,
    quantity: line?.quantity,
    unitPriceCents: line?.price,
    totalCents: cart.total_price,
    plausible: cart.item_count === 5 && line?.quantity === 5 && line?.price === 10598 && cart.total_price === 52990,
  };
  result.checkout = await reachCheckout(page, setPhase);
  return Object.values(result.calculator).every(Boolean) && result.cart.plausible && result.checkout.reachable && !result.health.overflow && result.health.brokenImages.length === 0;
}

async function rollFlow({ page, context, result, setPhase }) {
  setPhase('navigation');
  await page.goto(`${baseUrl}/products/marano-eiche-braun-vinylboden-von-der-rolle`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  setPhase('calculator');
  await page.locator('main input[type="radio"][value="400 cm"]').check({ timeout: 10_000 });
  await page.waitForTimeout(1000);
  const length = page.locator('main input[name="laenge"]');
  await length.fill('250');
  await length.dispatchEvent('input');
  await length.dispatchEvent('change');
  await page.waitForFunction(() => Number(document.querySelector('main input[name="properties[__ooCustomPrice]"]')?.value) === 259, null, { timeout: 12_000 });
  const formValues = await page.locator('main product-form-component').evaluate(form => ({
    variantId: form.querySelector('input[name="id"]')?.value,
    width: form.querySelector('input[name="properties[Rollenbreite]"]')?.value,
    customPrice: form.querySelector('input[name="properties[__ooCustomPrice]"]')?.value,
  }));
  formValues.length = await length.inputValue();
  result.health = await pageHealth(page);
  setPhase('add-to-cart');
  const addResponse = page.waitForResponse(response => response.url().includes('/cart/add') && response.status() === 200, { timeout: 30_000 });
  await page.locator('main product-form-component button[name="add"]').click({ timeout: 15_000 });
  await addResponse;
  const cart = await getCart(context);
  const line = cart.items[0];
  result.calculator = {
    selectedWidthMeters: formValues.width,
    enteredLengthCm: formValues.length,
    quotedPrice: formValues.customPrice,
    expectedPriceCents: 25900,
    formula: '2.50 m × 4 m × 25.90 €/m²',
    plausible: formValues.width === '4' && formValues.length === '250' && Number(formValues.customPrice) === 259,
  };
  result.cart = {
    itemCount: cart.item_count,
    quantity: line?.quantity,
    totalCents: cart.total_price,
    variantTitle: line?.variant_title,
    widthProperty: line?.properties?.Rollenbreite,
    lengthProperty: line?.properties?.['Gewünschte Länge in cm'],
    plausible: cart.item_count === 1 && line?.quantity === 1 && cart.total_price === 25900 && line?.properties?.Rollenbreite === '4' && line?.properties?.['Gewünschte Länge in cm'] === '250',
  };
  result.checkout = await reachCheckout(page, setPhase);
  return result.calculator.plausible && result.cart.plausible && result.checkout.reachable && !result.health.overflow && result.health.brokenImages.length === 0;
}

async function sampleFlow({ page, result, setPhase }) {
  setPhase('navigation');
  await page.goto(`${baseUrl}/products/marlow-eiche-nordisch-klickvinyl-7mm`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  setPhase('sample-form');
  await page.getByRole('link', { name: /Kostenloses Muster anfragen/i }).click({ timeout: 10_000 });
  await page.waitForURL(/thema=muster/, { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('[data-tp-product-name]')?.textContent?.trim(), null, { timeout: 10_000 });
  result.form = await page.locator('#ContactForm-sample').evaluate(element => ({
    action: element.action,
    product: element.querySelector('input[name="contact[Produkt]"]')?.value,
    handle: element.querySelector('input[name="contact[Produkt-Handle]"]')?.value,
    required: [...element.querySelectorAll('input[required], textarea[required], select[required]')].map(field => field.name),
    submitted: false,
  }));
  result.productImage = await page.locator('[data-tp-product-image]').evaluate(image => ({
    src: image.currentSrc || image.src,
    alt: image.alt,
    visible: image.getBoundingClientRect().width > 0 && image.getBoundingClientRect().height > 0,
    loaded: image.complete && image.naturalWidth > 0,
  }));
  result.health = await pageHealth(page);
  const requiredFields = ['contact[name]', 'contact[email]', 'contact[Straße und Hausnummer]', 'contact[PLZ]', 'contact[Ort]'];
  return result.form.handle === 'marlow-eiche-nordisch-klickvinyl-7mm'
    && requiredFields.every(name => result.form.required.includes(name))
    && result.productImage.visible && result.productImage.loaded
    && /Marlow Eiche Nordisch/.test(result.productImage.alt)
    && !result.health.overflow && result.health.brokenImages.length === 0;
}

async function runFlow(browser, { flow, productType, viewportName, viewport, execute }) {
  const result = {
    flow,
    device: viewportName,
    productType,
    status: 'FAIL',
    phase: 'context',
    errorClass: null,
    sanitizedError: null,
    orderCompleted: false,
    timestamp: new Date().toISOString(),
  };
  let context;
  try {
    context = await browser.newContext({ viewport, locale: 'de-DE' });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(30_000);
    const diagnostics = attachDiagnostics(page);
    result.diagnostics = diagnostics;
    const setPhase = phase => { result.phase = phase; };
    const pass = await withTimeout(() => execute({ page, context, result, setPhase }), FLOW_TIMEOUT_MS, `${viewportName} ${flow}`);
    result.status = pass ? 'PASS' : 'FAIL';
    result.phase = pass ? 'complete' : result.phase;
  } catch (error) {
    result.status = 'FAIL';
    result.errorClass = error?.name || 'Error';
    result.sanitizedError = sanitizeText(error?.message || String(error));
  } finally {
    const cleanup = await closeContextSafely(context, CLEANUP_TIMEOUT_MS);
    if (!cleanup.closed) result.cleanup = sanitizeDeep(cleanup);
  }
  return sanitizeDeep(result);
}

const browserResolution = resolveBrowserExecutable({ playwrightChromium: chromium });
report.browser = { source: browserResolution.source };
let browser;
try {
  if (!browserResolution.executablePath) throw new Error(browserResolution.error);
  browser = await withTimeout(
    () => chromium.launch({ headless: true, executablePath: browserResolution.executablePath }),
    30_000,
    'Browser-Start',
  );
  for (const [viewportName, viewport] of selectedViewports) {
    const flows = [
      selectedFlows.package && { flow: 'Klickvinyl / Paketware', productType: 'package', execute: packageFlow },
      selectedFlows.roll && { flow: 'Rollenware', productType: 'roll', execute: rollFlow },
      selectedFlows.sample && { flow: 'Muster', productType: 'sample', execute: sampleFlow },
    ].filter(Boolean);
    for (const selected of flows) {
      const result = await runFlow(browser, { ...selected, viewportName, viewport });
      report.results.push(result);
      persistReport();
      console.log(`${viewportName} ${selected.productType}: ${result.status}`);
    }
  }
} catch (error) {
  report.results.push({
    flow: 'Browser Harness', device: 'all', productType: 'harness', status: 'FAIL', phase: 'browser-start',
    errorClass: error?.name || 'Error', sanitizedError: sanitizeText(error?.message || String(error)), orderCompleted: false,
    timestamp: new Date().toISOString(),
  });
  persistReport();
} finally {
  const cleanup = await closeBrowserSafely(browser, CLEANUP_TIMEOUT_MS);
  if (!cleanup.closed) report.browser.cleanup = sanitizeDeep(cleanup);
  persistReport();
}

console.log(`Sales readiness: ${report.summary.passed} PASS, ${report.summary.failed} FAIL. Bericht: ${outputPath}`);
if (report.summary.failed) process.exitCode = 1;
hardTimeout.clear();
