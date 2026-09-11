import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveBrowserExecutable } from './browser-resolver.mjs';
import { closeBrowserSafely, closeContextSafely, installHardProcessTimeout, withTimeout } from './browser-lifecycle.mjs';
import { isKnownShopifyLoginXFrameWarning } from './console-classification.mjs';
import { sanitizeDeep, sanitizeText, sanitizeUrl } from '../automation/core/url-sanitizer.mjs';
import { configuredBaseUrl, targetUrl } from './target-url.mjs';

const root = path.resolve(import.meta.dirname, '..');
const hardTimeout = installHardProcessTimeout({ timeoutMs: 15 * 60_000, label: 'Sales-Check' });
const resultsDir = path.join(root, 'qa', 'results');
const outputPath = path.join(resultsDir, 'sales-readiness.json');
const baseUrl = configuredBaseUrl('https://www.teppich-paradies.net');
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
    const response = await context.request.get(targetUrl('/cart.js', baseUrl), { headers: { accept: 'application/json' }, timeout: 10_000 });
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
      await page.goto(targetUrl('/cart', baseUrl), { waitUntil: 'domcontentloaded', timeout: 30_000 });
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
  await page.goto(targetUrl('/products/marlow-eiche-nordisch-klickvinyl-7mm', baseUrl), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  setPhase('calculator');
  // Das Flaechenfeld ist bewusst type="text" mit inputmode="decimal": in einem
  // number-Input ist "1,5" ein ungueltiger Wert und kommt als leerer String an,
  // deutsche Kommaeingabe waere unmoeglich. Deshalb ueber das Datenattribut
  // ansprechen und nicht ueber den Feldtyp.
  const input = page.locator('main [data-sqm-input]').first();
  await input.fill('10');
  await input.dispatchEvent('input');
  await input.dispatchEvent('change');
  await input.dispatchEvent('blur');

  // Erwartung selbst rechnen statt feste Betraege zu verankern: Paketflaeche und
  // Paketpreis stehen als Vertrag am Rechner, der Verschnittzuschlag am
  // Kontrollkaestchen. Aendert sich ein Lieferantenpreis, prueft der Test
  // weiterhin das Richtige - naemlich dass Anzeige und Warenkorb zur selben
  // Rechnung gehoeren.
  const vertrag = await page.evaluate(() => {
    const rechner = document.querySelector('.tp-paket-auswahl');
    const verschnitt = document.querySelector('[data-waste-checkbox]');
    return rechner
      ? {
          flaeche: parseFloat(rechner.dataset.sqmPerPackage),
          preisCent: parseInt(rechner.dataset.packagePriceCents, 10),
          verschnitt: verschnitt ? verschnitt.checked : false,
        }
      : null;
  });
  if (!vertrag) throw new Error('Paket-Rechner nicht gefunden (.tp-paket-auswahl)');

  const faktor = vertrag.verschnitt ? 1.05 : 1;
  const erwartetePakete = Math.max(1, Math.ceil((10 * faktor) / vertrag.flaeche - 1e-9));
  const erwarteterCent = erwartetePakete * vertrag.preisCent;
  const alsEuro = cent => (cent / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  await page.waitForFunction(
    (betrag) => (document.querySelector('[data-total-display]')?.textContent || '').includes(betrag),
    alsEuro(erwarteterCent),
    { timeout: 10_000 }
  );

  const calculatorText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const anzeige = await page.evaluate(() => ({
    pakete: parseInt(document.querySelector('[data-package-display]')?.textContent || '0', 10),
    wort: (document.querySelector('[data-package-word]')?.textContent || '').trim(),
  }));
  result.health = await pageHealth(page);
  setPhase('add-to-cart');
  const addResponse = page.waitForResponse(response => response.url().includes('/cart/add') && response.status() === 200, { timeout: 30_000 });
  await page.getByRole('button', { name: 'In den Warenkorb', exact: true }).click({ timeout: 15_000 });
  await addResponse;
  const cart = await getCart(context);
  const line = cart.items[0];
  result.calculator = {
    perSqmVisible: /\d+,\d{2}\s*€\/m²/.test(calculatorText),
    packageContentVisible: /pro Originalpaket/.test(calculatorText),
    packagesVisible: anzeige.pakete === erwartetePakete && /Originalpaket/.test(anzeige.wort),
    totalVisible: calculatorText.includes(alsEuro(erwarteterCent)),
  };
  result.erwartung = { ...vertrag, eingabeQm: 10, erwartetePakete, erwarteterCent };
  result.cart = {
    itemCount: cart.item_count,
    quantity: line?.quantity,
    unitPriceCents: line?.price,
    totalCents: cart.total_price,
    plausible:
      cart.item_count === erwartetePakete &&
      line?.quantity === erwartetePakete &&
      line?.price === vertrag.preisCent &&
      cart.total_price === erwarteterCent,
  };
  result.checkout = await reachCheckout(page, setPhase);
  return Object.values(result.calculator).every(Boolean) && result.cart.plausible && result.checkout.reachable && !result.health.overflow && result.health.brokenImages.length === 0;
}

async function rollFlow({ page, context, result, setPhase }) {
  // Der Rechner fuer Rollenware ist blocks/tp-rollware-rechner.liquid -
  // eigener Theme-Code, der den frueheren Options-Price-Calculator App-Block
  // ersetzt hat (siehe Doc-Kommentar dort: "ersetzt den App-Preisrechner").
  // Der Kauf-Button ist [data-cta] (.tp-rwc-cta), nicht der generische
  // Shopify-Add-to-cart-Block - der eigene Rechner ruft /cart/add.js selbst
  // mit der berechneten Menge (m², aufgerundet) auf, abgerechnet wird der
  // echte Shopify-Variantenpreis mal dieser Menge.
  setPhase('navigation');
  await page.goto(targetUrl('/products/marano-eiche-braun-vinylboden-von-der-rolle', baseUrl), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  setPhase('calculator');
  // Der Wert kommt direkt aus der Shopify-Produktoption (z.B. "400 cm"),
  // nicht aus einer festen Konstante. Ein exakter Vergleich auf "400" bricht,
  // sobald die Option eine Einheit traegt - deshalb per Praefix matchen.
  const width = page.locator('main input[type="radio"][value^="400"]');
  await width.check({ timeout: 10_000 });
  await page.waitForTimeout(1000);
  const length = page.locator('main input[name="laenge"]');
  await length.fill('250');
  await length.dispatchEvent('input');
  await length.dispatchEvent('change');
  const addToCart = page.locator('main button[data-cta]');
  await addToCart.waitFor({ state: 'visible', timeout: 12_000 });
  await page.waitForFunction(() => /€\s*259,00|259,00\s*€/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 10_000 });
  const calculatorText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  result.health = await pageHealth(page);
  setPhase('add-to-cart');
  const addResponse = page.waitForResponse(response => response.url().includes('/cart/add') && response.status() === 200, { timeout: 30_000 });
  await addToCart.click({ timeout: 15_000 });
  await addResponse;
  const cart = await getCart(context);
  const line = cart.items[0];
  result.calculator = {
    selectedWidthCm: await width.inputValue(),
    enteredLengthCm: await length.inputValue(),
    expectedPriceCents: 25900,
    formula: '2.50 m × 4 m × 25.90 €/m²',
    plausible: /€\s*259,00|259,00\s*€/.test(calculatorText),
  };
  // Menge ist die tatsaechliche Flaeche in m² (aufgerundet), nicht 1 - der
  // Rechner uebergibt quantity: qty an /cart/add.js, damit Shopify selbst
  // variant.price * quantity abrechnet (siehe tp-rollware-rechner.liquid).
  // item_count summiert Mengen ueber alle Zeilen, ist bei einer Zeile also
  // identisch mit deren quantity. Property-Keys kommen jetzt aus dem eigenen
  // Theme-Code, nicht mehr aus einer App - "Rollenbreite" und
  // "Gewünschte Länge" tragen beide die Einheit im Wert (z.B. "400 cm").
  result.cart = {
    itemCount: cart.item_count,
    quantity: line?.quantity,
    totalCents: cart.total_price,
    variantTitle: line?.variant_title,
    widthProperty: line?.properties?.Rollenbreite,
    lengthProperty: line?.properties?.['Gewünschte Länge'],
    plausible: cart.item_count === 10
      && line?.quantity === 10
      && cart.total_price === 25900
      && line?.variant_title === '400 cm'
      && line?.properties?.Rollenbreite === '400 cm'
      && line?.properties?.['Gewünschte Länge'] === '250 cm',
  };
  result.checkout = await reachCheckout(page, setPhase);
  return result.calculator.plausible && result.cart.plausible && result.checkout.reachable && !result.health.overflow && result.health.brokenImages.length === 0;
}

async function sampleFlow({ page, context, result, setPhase }) {
  // Die Musterbestellung ist keine eigene Konfigurator-Seite mehr, sondern das
  // allgemeine Kontaktformular unter /pages/kontakt im Musterbestellungs-Modus
  // (Query-Parameter thema=muster&produkt=<handle>, umgesetzt in
  // assets/tp-sample-request.js). Der Flow schickt das native Shopify-
  // Kontaktformular absichtlich NICHT ab - das wuerde eine echte E-Mail an den
  // Shopbetreiber ausloesen. Geprueft wird stattdessen die Sendebereitschaft:
  // Produktdaten korrekt vorbefuellt, Pflichtfelder korrekt umgeschaltet,
  // Absende-Button vorhanden und aktiv.
  setPhase('navigation');
  const sourceHandle = 'piumera-teppichboden-400cm-500cm';
  await page.goto(targetUrl(`/products/${sourceHandle}`, baseUrl), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  setPhase('sample-configurator');
  await page.getByRole('link', { name: /Kostenloses Muster anfragen/i }).click({ timeout: 10_000 });
  // Seit c1c5185 (snippets/tp-musteroption) entscheidet das Produkt ueber das
  // Ziel: mit Farb- oder Dekoroption der Musterkonfigurator /pages/muster,
  // sonst das Kontaktformular im Musterbestellungs-Modus. Piumera hat eine
  // Farboption und landet damit im Konfigurator. Beide Wege werden geprueft;
  // im Konfigurator wird nur ausgewaehlt, nicht in den Warenkorb gelegt.
  await page.waitForURL(url => url.searchParams.get('produkt') === sourceHandle
    && (url.pathname === '/pages/muster' || (url.pathname === '/pages/kontakt' && url.searchParams.get('thema') === 'muster')), { timeout: 15_000 });
  if (new URL(page.url()).pathname === '/pages/muster') return sampleConfiguratorChecks({ page, result });
  return sampleContactFormChecks({ page, result, sourceHandle });
}

async function sampleConfiguratorChecks({ page, result }) {
  const root = page.locator('[data-tp-sample-checkout]');
  await root.waitFor({ state: 'visible', timeout: 15_000 });
  // Farben kommen per fetch aus /products/<handle>.js; erst danach steht das Raster.
  await page.waitForFunction(() => document.querySelectorAll('[data-sample-color]').length > 0, null, { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('[data-sample-product-name]')?.textContent?.trim(), null, { timeout: 10_000 });
  const productName = (await root.locator('[data-sample-product-name]').textContent())?.trim();
  const colorCount = await root.locator('[data-sample-color]').count();
  const submit = root.locator('[data-sample-submit]');
  const submitDisabledBefore = await submit.isDisabled();
  const firstCheckbox = root.locator('[data-sample-color] input[type="checkbox"]:not([disabled])').first();
  await firstCheckbox.check({ timeout: 10_000 });
  await page.waitForFunction(() => !document.querySelector('[data-sample-submit]')?.disabled, null, { timeout: 10_000 });
  const countText = (await root.locator('[data-sample-count]').textContent())?.trim();
  const errorText = (await root.locator('[data-sample-error]').textContent())?.trim();
  result.health = await pageHealth(page);
  result.sample = { mode: 'konfigurator', productName, colorCount, submitDisabledBefore, countText, errorText };
  return /Piumera Teppichboden/.test(productName || '')
    && colorCount > 0
    && submitDisabledBefore
    && /1 von/.test(countText || '')
    && !errorText
    && !result.health.overflow
    && result.health.brokenImages.length === 0;
}

async function sampleContactFormChecks({ page, result, sourceHandle }) {
  void sourceHandle;
  const root = page.locator('[data-tp-sample-request]');
  await root.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('[data-tp-sample-request]')?.getAttribute('data-mode') === 'sample', null, { timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('[data-tp-product-name]')?.textContent?.trim(), null, { timeout: 10_000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-tp-product-image]');
    return image?.complete && image.naturalWidth > 0;
  }, null, { timeout: 10_000 });
  const productName = (await page.locator('[data-tp-product-name]').textContent())?.trim();
  const introText = (await page.locator('[data-tp-intro]').textContent())?.trim();
  result.productImage = await page.locator('[data-tp-product-image]').evaluate(image => ({
    src: image.currentSrc || image.src,
    visible: image.getBoundingClientRect().width > 0 && image.getBoundingClientRect().height > 0,
    loaded: image.complete && image.naturalWidth > 0,
  }));
  result.health = await pageHealth(page);
  const messageRequired = await page.locator('[data-message-field]').evaluate(el => el.required);
  // [data-sample-field] umschliesst auch das optionale Telefonfeld - deshalb
  // gezielt auf Strasse/PLZ/Ort pruefen, die im Musterbestellungs-Modus
  // verpflichtend werden.
  const addressRequired = await root.locator('input[name="contact[Straße und Hausnummer]"], input[name="contact[PLZ]"], input[name="contact[Ort]"]').evaluateAll(inputs => inputs.length === 3 && inputs.every(input => input.required));
  const submit = root.locator('button[type="submit"]');
  await submit.waitFor({ state: 'visible', timeout: 10_000 });
  const submitDisabled = await submit.isDisabled();
  result.sample = { mode: 'kontaktformular', productName, introText, messageRequired, addressRequired, submitDisabled };
  return /Piumera Teppichboden/.test(productName || '')
    && !messageRequired
    && addressRequired
    && !submitDisabled
    && result.productImage.visible
    && result.productImage.loaded
    && !result.health.overflow
    && result.health.brokenImages.length === 0;
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
