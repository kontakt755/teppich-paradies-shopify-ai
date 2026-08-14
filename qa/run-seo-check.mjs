import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveBrowserExecutable } from './browser-resolver.mjs';
import { closeBrowserSafely, closeContextSafely, installHardProcessTimeout } from './browser-lifecycle.mjs';
import { isKnownShopifyLoginXFrameWarning } from './console-classification.mjs';
import { sanitizeDeep, sanitizeText, sanitizeUrl } from '../automation/core/url-sanitizer.mjs';

const root = path.resolve(import.meta.dirname, '..');
const hardTimeout = installHardProcessTimeout({ timeoutMs: 5 * 60_000, label: 'SEO-Check' });
const qaDir = path.join(root, 'qa');
const resultsDir = path.join(qaDir, 'results');
const workflowReportDir = process.env.WORKFLOW_REPORT_DIR ? path.resolve(process.env.WORKFLOW_REPORT_DIR) : null;
const seoReportPath = workflowReportDir ? path.join(workflowReportDir, 'SEO_REPORT.md') : path.join(root, 'SEO_REPORT.md');
const seoAdminPath = workflowReportDir ? path.join(workflowReportDir, 'SEO_ADMIN_RECOMMENDATIONS.md') : path.join(root, 'SEO_ADMIN_RECOMMENDATIONS.md');
const merchantReportPath = workflowReportDir ? path.join(workflowReportDir, 'MERCHANT_READINESS_REPORT.md') : path.join(qaDir, 'MERCHANT_READINESS_REPORT.md');
const trackingReportPath = workflowReportDir ? path.join(workflowReportDir, 'TRACKING_READINESS.md') : path.join(qaDir, 'TRACKING_READINESS.md');
const config = JSON.parse(fs.readFileSync(path.join(qaDir, 'seo.config.json'), 'utf8'));
const startedAt = new Date();
const started = Date.now();
const args = new Set(process.argv.slice(2));
const takeScreenshots = args.has('--screenshots');
const artifactsDir = path.join(qaDir, 'seo-artifacts');
fs.mkdirSync(resultsDir, { recursive: true });
if (workflowReportDir) fs.mkdirSync(workflowReportDir, { recursive: true });
if (takeScreenshots) fs.mkdirSync(artifactsDir, { recursive: true });

const findings = [];
const pageResults = [];
const internalLinks = new Map();
const trackingSignals = { ga4: new Set(), ads: new Set(), meta: new Set(), merchant: new Set(), scripts: new Set() };
const genericTexts = [
  'Ein markanter Stil, der überall wiedererkannt wird',
  'Meisterhafte Konstruktion und ein makelloses Finish',
  'Stücke, die mit der Zeit nur noch schöner werden',
  'Authentische Materialien, keine Kompromisse'
];

function add(severity, code, page, viewport, message, data) {
  findings.push(sanitizeDeep({ severity, code, page, viewport, message, ...(data ? { data } : {}) }));
}

function safeName(value) {
  return value.normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function decodeHtmlAttribute(value = '') {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function metaDescriptionsFromHtml(html = '') {
  return [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map(match => match[0])
    .filter(tag => /\bname\s*=\s*(["'])description\1/i.test(tag))
    .map(tag => decodeHtmlAttribute(tag.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2] || '').trim());
}

function nodesFromJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(nodesFromJsonLd);
  if (!value || typeof value !== 'object') return [];
  const graph = Array.isArray(value['@graph']) ? value['@graph'].flatMap(nodesFromJsonLd) : [];
  return [value, ...graph];
}

function typeIncludes(node, expected) {
  const values = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
  return values.some(value => String(value).toLowerCase() === expected.toLowerCase());
}

function collectTracking(text, scriptUrls = []) {
  for (const match of text.matchAll(/\bG-[A-Z0-9]{6,}\b/g)) trackingSignals.ga4.add(match[0]);
  for (const match of text.matchAll(/\bAW-[0-9]{6,}\b/g)) trackingSignals.ads.add(match[0]);
  if (/\bgtag\s*\(|googletagmanager\.com|google-analytics\.com/i.test(text)) trackingSignals.ga4.add('Google tag/gtag erkannt');
  if (/\bfbq\s*\(|connect\.facebook\.net\/.+fbevents/i.test(text)) trackingSignals.meta.add('Meta Pixel erkannt');
  if (/google.{0,20}(shopping|merchant|youtube)|merchant.?center/i.test(text)) trackingSignals.merchant.add('Google-/Merchant-Signal erkannt');
  scriptUrls.forEach(url => trackingSignals.scripts.add(url));
}

async function inspectPage(browser, pageConfig, viewportName, viewport) {
  const context = await browser.newContext({ viewport, locale: 'de-DE', reducedMotion: 'reduce' });
  try {
  await context.addInitScript(() => {
    window.__tpLayoutShifts = [];
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__tpLayoutShifts.push(entry.value);
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({ type: 'console.error', message: sanitizeText(message.text()), url: sanitizeUrl(message.location().url || '') });
  });
  page.on('pageerror', error => consoleErrors.push({ type: 'pageerror', message: sanitizeText(error.message), url: '' }));
  page.on('requestfailed', request => failedRequests.push({ url: sanitizeUrl(request.url()), type: request.resourceType(), message: sanitizeText(request.failure()?.errorText || '') }));

  const targetUrl = new URL(pageConfig.path, config.baseUrl).href;
  let response;
  let navigationError;
  try {
    response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    await page.waitForSelector('footer a[href*="/pages/versand-lieferung"]', { state: 'attached', timeout: 1800 }).catch(() => {});
    if (pageConfig.type === 'product') await page.waitForSelector('main a[href*="/pages/versand-lieferung"]', { state: 'attached', timeout: 1800 }).catch(() => {});
    await page.waitForTimeout(350);
  } catch (error) {
    navigationError = error.message;
  }

  if (navigationError) {
    add('ERROR', 'HTTP_NAVIGATION', pageConfig.name, viewportName, `Navigation fehlgeschlagen: ${navigationError}`);
    return;
  }

  let sourceDescriptions = [];
  try {
    sourceDescriptions = metaDescriptionsFromHtml(await response.text());
  } catch {}

  const data = await page.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    };
    const accessibleName = element => [element.getAttribute('aria-label'), element.getAttribute('title'), element.innerText, element.textContent, element.value, element.querySelector('img')?.alt]
      .map(value => String(value || '').replace(/\s+/g, ' ').trim()).find(Boolean) || '';
    const relevantImages = [...document.querySelectorAll('main img, footer img')].filter(img => visible(img) && img.getBoundingClientRect().width >= 40 && img.getBoundingClientRect().height >= 40);
    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map(script => script.textContent.trim()).filter(Boolean);
    const links = [...document.querySelectorAll('a[href]')].map(link => ({ href: link.href, text: accessibleName(link), visible: visible(link), area: Math.round(link.getBoundingClientRect().width * link.getBoundingClientRect().height) }));
    const interactive = [...document.querySelectorAll('main button, main a[href], main input, main select, main textarea')].filter(visible);
    const unnamedButtons = interactive.filter(el => el.matches('button') && !accessibleName(el)).map(el => el.outerHTML.slice(0, 240));
    const unnamedLinks = interactive.filter(el => el.matches('a[href]') && !accessibleName(el)).map(el => el.outerHTML.slice(0, 240));
    const unlabeledInputs = interactive.filter(el => {
      if (!el.matches('input, select, textarea') || ['hidden', 'submit', 'button'].includes(el.type)) return false;
      return !accessibleName(el) && !el.labels?.length && !el.closest('label');
    }).map(el => el.outerHTML.slice(0, 240));
    const smallTargets = interactive.filter(el => {
      if (!el.matches('button, input, select, textarea, a.button, a[role="button"], a[class*="button"], summary')) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 40 || rect.height < 40);
    }).slice(0, 12).map(el => ({ name: accessibleName(el).slice(0, 80), tag: el.tagName, width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height) }));
    const resourceEntries = performance.getEntriesByType('resource').map(entry => ({ name: entry.name, initiatorType: entry.initiatorType, transferSize: entry.transferSize || 0, duration: Math.round(entry.duration) }));
    const scripts = [...document.scripts].map(script => script.src).filter(Boolean);
    const bodyText = document.body?.innerText || '';
    const mainText = document.querySelector('main')?.innerText || '';
    const facets = [...document.querySelectorAll('details.facets__panel')].map(panel => ({
      label: panel.querySelector('.facets__label')?.textContent.trim() || '',
      inputs: [...panel.querySelectorAll('input[type="checkbox"]')].map(input => ({ name: input.name, value: input.value, label: input.getAttribute('data-label') || input.getAttribute('aria-label') || input.labels?.[0]?.textContent.trim() || '' }))
    }));
    const compareBar = document.querySelector('[data-tp-compare-bar]');
    return {
      title: document.title.trim(),
      description: document.querySelector('meta[name="description"]')?.content?.trim() || '',
      descriptionTagCount: document.querySelectorAll('meta[name="description"]').length,
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      robots: document.querySelector('meta[name="robots"]')?.content?.trim() || '',
      h1: [...document.querySelectorAll('h1')].filter(visible).map(x => x.textContent.replace(/\s+/g, ' ').trim()),
      bodyText, mainText, jsonLd, links, facets, scripts,
      images: relevantImages.map(img => ({ src: img.currentSrc || img.src, alt: img.getAttribute('alt'), broken: img.complete && img.naturalWidth === 0, loading: img.loading || '', naturalWidth: img.naturalWidth, renderedWidth: Math.round(img.getBoundingClientRect().width), top: Math.round(img.getBoundingClientRect().top) })),
      unnamedButtons, unnamedLinks, unlabeledInputs, smallTargets, resourceEntries,
      visiblePriceTexts: [...document.querySelectorAll('main product-price, main .price, main [class*="price"]')].filter(visible).map(el => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 160),
      visibleComparePrices: [...document.querySelectorAll('main s, main del, main [class*="compare-at"]')].filter(visible).map(el => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
      footerShipping: !!document.querySelector('footer a[href*="/pages/versand-lieferung"]'),
      productShipping: !!document.querySelector('main a[href*="/pages/versand-lieferung"]'),
      breadcrumbVisible: [...document.querySelectorAll('nav[aria-label*="readcrumb" i]')].filter(visible).map(el => el.textContent.replace(/\s+/g, ' ').trim()),
      compareBar: compareBar ? { hidden: compareBar.hidden, ariaHidden: compareBar.getAttribute('aria-hidden'), count: compareBar.querySelector('[data-tp-compare-count]')?.textContent.trim() || '' } : null,
      layoutShift: (window.__tpLayoutShifts || []).reduce((sum, value) => sum + value, 0),
      htmlLang: document.documentElement.lang,
      wordCount: mainText.trim() ? mainText.trim().split(/\s+/).length : 0
    };
  });

  // The server-rendered head is the SEO source of truth. A late third-party DOM
  // mutation must not turn a valid native Shopify description into a false error.
  if (!data.description && sourceDescriptions[0]) data.description = sourceDescriptions[0];
  data.descriptionTagCount = Math.max(data.descriptionTagCount, sourceDescriptions.length);

  let descriptionRecoveredFromFreshResponse = false;
  if (!data.description && pageConfig.type !== 'cart' && pageConfig.type !== 'search') {
    for (let attempt = 1; attempt <= 2 && !data.description; attempt += 1) {
      try {
        const retryUrl = new URL(targetUrl);
        retryUrl.searchParams.set('_tp_seo_check', `${Date.now()}-${attempt}`);
        const retryResponse = await context.request.get(retryUrl.href, {
          headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
          timeout: config.navigationTimeoutMs
        });
        const retryDescriptions = metaDescriptionsFromHtml(await retryResponse.text());
        if (retryDescriptions[0]) {
          data.description = retryDescriptions[0];
          data.descriptionTagCount = Math.max(data.descriptionTagCount, retryDescriptions.length);
          descriptionRecoveredFromFreshResponse = true;
        }
      } catch {}
    }

    // A browser context can remain pinned to one stale Shopify page-cache
    // variant. Verify through an independent HTTP client before declaring a
    // technical error; a genuinely missing description still fails all tries.
    for (let attempt = 1; attempt <= 3 && !data.description; attempt += 1) {
      try {
        const retryUrl = new URL(targetUrl);
        retryUrl.searchParams.set('_tp_seo_http_check', `${Date.now()}-${attempt}`);
        const retryResponse = await fetch(retryUrl, {
          headers: {
            accept: 'text/html',
            'cache-control': 'no-cache',
            pragma: 'no-cache',
            'user-agent': `TeppichParadies-SEO-QA/${attempt}`,
          },
        });
        const retryDescriptions = metaDescriptionsFromHtml(await retryResponse.text());
        if (retryResponse.ok && retryDescriptions[0]) {
          data.description = retryDescriptions[0];
          data.descriptionTagCount = Math.max(data.descriptionTagCount, retryDescriptions.length);
          descriptionRecoveredFromFreshResponse = true;
        }
      } catch {}
    }
  }

  if (!data.footerShipping || (pageConfig.type === 'product' && !data.productShipping) || data.unnamedLinks.length) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs }).catch(() => {});
    await page.waitForTimeout(300);
    data.footerShipping = await page.locator('footer a[href*="/pages/versand-lieferung"]').count().then(count => count > 0).catch(() => data.footerShipping);
    if (pageConfig.type === 'product') data.productShipping = await page.locator('main a[href*="/pages/versand-lieferung"]').count().then(count => count > 0).catch(() => data.productShipping);
    if (data.unnamedLinks.length) {
      data.unnamedLinks = await page.evaluate(() => {
        const visible = element => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
        };
        const accessibleName = element => [element.getAttribute('aria-label'), element.getAttribute('title'), element.innerText, element.textContent, element.querySelector('img')?.alt]
          .map(value => String(value || '').replace(/\s+/g, ' ').trim()).find(Boolean) || '';
        return [...document.querySelectorAll('main a[href]')].filter(visible).filter(link => !accessibleName(link)).map(link => link.outerHTML.slice(0, 240));
      }).catch(() => data.unnamedLinks);
    }
  }

  const status = response?.status() || 0;
  const headers = response ? await response.allHeaders() : {};
  const pageRecord = sanitizeDeep({ ...pageConfig, viewport: viewportName, targetUrl, finalUrl: page.url(), status, headers, ...data, consoleErrors, failedRequests });
  pageResults.push(pageRecord);

  if (viewportName === 'Desktop') {
    for (const link of data.links) {
      try {
        const url = new URL(link.href);
        if (url.origin !== new URL(config.baseUrl).origin || !['http:', 'https:'].includes(url.protocol)) continue;
        url.hash = '';
        url.search = '';
        if (!internalLinks.has(url.href)) internalLinks.set(url.href, { sources: new Set(), text: link.text });
        internalLinks.get(url.href).sources.add(pageConfig.name);
      } catch {}
    }
    collectTracking(`${data.bodyText}\n${JSON.stringify(data.scripts)}\n${JSON.stringify(headers)}`, data.scripts);
  }

  if (status < 200 || status >= 400) add('ERROR', 'HTTP_STATUS', pageConfig.name, viewportName, `HTTP ${status || 'ohne Antwort'} für ${targetUrl}`);
  if (viewportName === 'Desktop' && !data.title) add('ERROR', 'TITLE_MISSING', pageConfig.name, viewportName, 'HTML-Title fehlt');
  else if (viewportName === 'Desktop' && (data.title.length < 25 || data.title.length > 70)) add('WARN', 'TITLE_LENGTH', pageConfig.name, viewportName, `Title-Länge ${data.title.length} Zeichen: „${data.title}“`);
  if (viewportName === 'Desktop' && !data.description && pageConfig.type !== 'cart' && pageConfig.type !== 'search') add('ERROR', 'META_DESCRIPTION_MISSING', pageConfig.name, viewportName, 'Meta Description fehlt');
  else if (viewportName === 'Desktop' && data.description && (data.description.length < 70 || data.description.length > 170)) add('WARN', 'META_DESCRIPTION_LENGTH', pageConfig.name, viewportName, `Meta-Description-Länge ${data.description.length} Zeichen`);
  if (viewportName === 'Desktop' && descriptionRecoveredFromFreshResponse) add('WARN', 'META_DESCRIPTION_STALE_RESPONSE', pageConfig.name, viewportName, 'Erster Abruf ohne Description; frischer Cache-Buster-Abruf lieferte die native Shopify-Meta-Description');
  if (viewportName === 'Desktop' && data.descriptionTagCount > 1) add('ERROR', 'META_DESCRIPTION_DUPLICATE', pageConfig.name, viewportName, `${data.descriptionTagCount} Meta-Description-Tags gefunden`);
  if (data.h1.length !== 1) add('ERROR', 'H1_COUNT', pageConfig.name, viewportName, `${data.h1.length} sichtbare H1 gefunden (erwartet: genau 1)`, { h1: data.h1 });
  if (viewportName === 'Desktop' && !data.canonical) add('ERROR', 'CANONICAL_MISSING', pageConfig.name, viewportName, 'Canonical fehlt');
  else if (viewportName === 'Desktop') {
    try {
      const canonical = new URL(data.canonical);
      if (canonical.origin !== new URL(config.baseUrl).origin) add('ERROR', 'CANONICAL_ORIGIN', pageConfig.name, viewportName, `Canonical verweist auf fremden Origin: ${data.canonical}`);
      const finalPath = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
      const canonicalPath = canonical.pathname.replace(/\/$/, '') || '/';
      if (finalPath !== canonicalPath) add('WARN', 'CANONICAL_PATH', pageConfig.name, viewportName, `Canonical-Pfad weicht ab: ${canonicalPath} statt ${finalPath}`);
    } catch { add('ERROR', 'CANONICAL_INVALID', pageConfig.name, viewportName, `Canonical ist keine valide URL: ${data.canonical}`); }
  }
  const robots = `${data.robots} ${headers['x-robots-tag'] || ''}`.toLowerCase();
  if (viewportName === 'Desktop' && pageConfig.indexExpected && robots.includes('noindex')) add('ERROR', 'UNEXPECTED_NOINDEX', pageConfig.name, viewportName, `Unerwartetes noindex: ${robots.trim()}`);
  if (viewportName === 'Desktop' && !pageConfig.indexExpected && !robots.includes('noindex')) add('WARN', 'NOINDEX_UNCLEAR', pageConfig.name, viewportName, 'Kein explizites noindex im HTML/Header; robots.txt-Verhalten separat prüfen');
  data.images.filter(img => img.broken).forEach(img => add('ERROR', 'BROKEN_IMAGE', pageConfig.name, viewportName, `Sichtbares Bild defekt: ${img.src}`));
  const missingAltImages = data.images.filter(img => img.alt === null || img.alt.trim() === '');
  if (missingAltImages.length) add('WARN', 'IMAGE_ALT_MISSING', pageConfig.name, viewportName, `${missingAltImages.length} relevante sichtbare Bilder ohne Alt-Text`, { examples: missingAltImages.slice(0, 5).map(img => img.src) });
  const oversizedImages = data.images.filter(img => img.naturalWidth > 1600 && img.renderedWidth > 0 && img.naturalWidth / img.renderedWidth > 2.7);
  if (oversizedImages.length) add('WARN', 'IMAGE_OVERSIZED', pageConfig.name, viewportName, `${oversizedImages.length} Bilder deutlich größer als ihre Darstellung`, { examples: oversizedImages.slice(0, 5) });
  const eagerBelowFold = data.images.filter(img => img.loading !== 'lazy' && img.top > viewport.height * 1.5);
  if (eagerBelowFold.length) add('WARN', 'IMAGE_EAGER_BELOW_FOLD', pageConfig.name, viewportName, `${eagerBelowFold.length} Bilder weit unterhalb des Folds ohne Lazy Loading`, { examples: eagerBelowFold.slice(0, 5).map(img => img.src) });
  if (!data.htmlLang) add('ERROR', 'HTML_LANG_MISSING', pageConfig.name, viewportName, 'html[lang] fehlt');

  const parsedNodes = [];
  data.jsonLd.forEach((text, index) => {
    try { parsedNodes.push(...nodesFromJsonLd(JSON.parse(text))); }
    catch (error) { add('ERROR', 'JSONLD_INVALID', pageConfig.name, viewportName, `JSON-LD #${index + 1} syntaktisch ungültig: ${error.message}`); }
  });
  const products = parsedNodes.filter(node => typeIncludes(node, 'Product') || typeIncludes(node, 'ProductGroup'));
  const breadcrumbs = parsedNodes.filter(node => typeIncludes(node, 'BreadcrumbList'));
  if (breadcrumbs.length > 1) add('ERROR', 'BREADCRUMB_SCHEMA_DUPLICATE', pageConfig.name, viewportName, `${breadcrumbs.length} BreadcrumbList-Ausgaben gefunden`);
  if (pageConfig.type === 'product' && viewportName === 'Desktop') {
    // tp-product-structured-data.liquid unterdrueckt Product-JSON-LD absichtlich fuer
    // Rollenware (custom.rollenbreite > 0) und OPC-Rechner-Varianten, damit deren
    // nicht kaufbarer Paketpreis nie als Google-Merchant-Offer erscheint. Fuer als
    // productKind "roll" markierte Seiten ist ein fehlendes Schema daher erwartet.
    const schemaIntentionallySuppressed = pageConfig.productKind === 'roll' && !products.length;
    if (!products.length && !schemaIntentionallySuppressed) add('ERROR', 'PRODUCT_SCHEMA_MISSING', pageConfig.name, viewportName, 'Product-JSON-LD fehlt');
    else if (schemaIntentionallySuppressed) add('WARN', 'PRODUCT_SCHEMA_SUPPRESSED_ROLL', pageConfig.name, viewportName, 'Product-JSON-LD erwartungsgemäß unterdrückt (Rollenware/OPC-Sicherheitslogik in tp-product-structured-data.liquid)');
    for (const product of products) {
      const variants = Array.isArray(product.hasVariant) ? product.hasVariant : product.hasVariant ? [product.hasVariant] : [];
      for (const key of ['name', 'url']) if (!product[key]) add('ERROR', 'PRODUCT_SCHEMA_FIELD', pageConfig.name, viewportName, `Product-JSON-LD ohne ${key}`);
      if (!product.image && !variants.some(variant => variant.image)) add('ERROR', 'PRODUCT_SCHEMA_FIELD', pageConfig.name, viewportName, 'Product-/Variant-JSON-LD ohne image');
      const directOffers = Array.isArray(product.offers) ? product.offers : product.offers ? [product.offers] : [];
      const offers = [...directOffers, ...variants.flatMap(variant => Array.isArray(variant.offers) ? variant.offers : variant.offers ? [variant.offers] : [])];
      if (!offers.length) add('ERROR', 'OFFER_MISSING', pageConfig.name, viewportName, 'Product-JSON-LD ohne Offer');
      offers.forEach((offer, index) => {
        for (const key of ['price', 'priceCurrency', 'availability']) if (offer[key] === undefined || offer[key] === '') add('ERROR', 'OFFER_FIELD', pageConfig.name, viewportName, `Offer #${index + 1} ohne ${key}`);
        if (offer.price !== undefined && !/^\d+(?:[.,]\d{1,2})?$/.test(String(offer.price))) add('ERROR', 'OFFER_PRICE_FORMAT', pageConfig.name, viewportName, `Ungültiges Offer-Preisformat: ${offer.price}`);
        if (/opc-/i.test(JSON.stringify(offer))) add('WARN', 'OFFER_OPC_VARIANT', pageConfig.name, viewportName, 'OPC-generierte Variante im öffentlichen Offer-Markup erkennbar');
      });
      if (variants.some(variant => /opc-/i.test(JSON.stringify(variant)))) add('WARN', 'OFFER_OPC_VARIANT', pageConfig.name, viewportName, 'OPC-generierte Variante im öffentlichen ProductGroup-Markup erkennbar');
    }
    if (!data.productShipping) add('ERROR', 'PDP_SHIPPING_LINK', pageConfig.name, viewportName, 'PDP-Link zu Versand & Lieferung fehlt');
    if (!data.breadcrumbVisible.length) add('WARN', 'BREADCRUMB_VISIBLE_MISSING', pageConfig.name, viewportName, 'Kein sichtbarer Breadcrumb gefunden');
  }
  if (viewportName === 'Desktop' && !data.footerShipping) add('ERROR', 'FOOTER_SHIPPING_LINK', pageConfig.name, viewportName, 'Footer-Link zu Versand & Lieferung fehlt');
  if (/€\s*\/\s*m(?:²|2)\s*€\s*\/\s*m(?:²|2)|€\/m(?:²|2)\s*€\/m(?:²|2)/i.test(data.visiblePriceTexts.join(' '))) add('ERROR', 'DUPLICATE_SQM_UNIT', pageConfig.name, viewportName, 'Doppelte €/m²-Einheit sichtbar');
  if (pageConfig.type === 'product' && !data.visiblePriceTexts.some(text => /\d[\d.,]*\s*€|€\s*\d/.test(text))) add('ERROR', 'VISIBLE_PRICE_MISSING', pageConfig.name, viewportName, 'Kein plausibles sichtbares Preisformat im Produktbereich');
  if (viewportName === 'Desktop') genericTexts.forEach(text => { if (data.bodyText.includes(text)) add('ERROR', 'GENERIC_THEME_TEXT', pageConfig.name, viewportName, `Generischer Theme-Text sichtbar: „${text}“`); });
  data.unnamedButtons.slice(0, 5).forEach(html => add('ERROR', 'BUTTON_NAME_MISSING', pageConfig.name, viewportName, 'Sichtbarer Button ohne zugänglichen Namen', { html }));
  data.unnamedLinks.slice(0, 5).forEach(html => add('ERROR', 'LINK_NAME_MISSING', pageConfig.name, viewportName, 'Sichtbarer Link ohne zugänglichen Namen', { html }));
  data.unlabeledInputs.slice(0, 5).forEach(html => add('ERROR', 'INPUT_LABEL_MISSING', pageConfig.name, viewportName, 'Sichtbares Eingabefeld ohne Label', { html }));
  if (data.smallTargets.length) add('WARN', 'TOUCH_TARGET', pageConfig.name, viewportName, `${data.smallTargets.length} kleine sichtbare Touch-Ziele (Stichprobe)`, { targets: data.smallTargets });
  if (data.layoutShift > 0.25) add('WARN', 'LAYOUT_SHIFT', pageConfig.name, viewportName, `Hoher beobachteter Layout Shift: ${data.layoutShift.toFixed(3)}`);
  const largeResources = data.resourceEntries.filter(entry => entry.transferSize > 700000).sort((a, b) => b.transferSize - a.transferSize).slice(0, 6);
  largeResources.forEach(entry => add('WARN', 'LARGE_RESOURCE', pageConfig.name, viewportName, `Große Ressource (${Math.round(entry.transferSize / 1024)} KiB): ${entry.name}`));
  const duplicateCustomScripts = [...new Set(data.scripts.filter(src => new URL(src, page.url()).origin === new URL(config.baseUrl).origin).filter((src, i, all) => all.indexOf(src) !== i))];
  if (viewportName === 'Desktop' && duplicateCustomScripts.length) add('WARN', 'DUPLICATE_SCRIPT', pageConfig.name, viewportName, `${duplicateCustomScripts.length} eigene Theme-Scripts mehrfach eingebunden`, { scripts: duplicateCustomScripts });
  const platformHeaderWarnings = consoleErrors.filter(item => isKnownShopifyLoginXFrameWarning(item, config.baseUrl));
  platformHeaderWarnings.slice(0, 1).forEach(item => add(
    'WARN',
    'PLATFORM_HEADER_WARNING',
    pageConfig.name,
    viewportName,
    'Transiente/veraltete X-Frame-Options-Direktive in einer Shopify-Edge-Antwort; kein On-Page-SEO-Fehler',
    item,
  ));
  const relevantConsoleErrors = consoleErrors.filter(item => {
    if (isKnownShopifyLoginXFrameWarning(item, config.baseUrl)) return false;
    if (/Required ref "overflowMenu"|favicon|shop\.app|chrome-error:\/\/chromewebdata|Content Security Policy/i.test(`${item.message} ${item.url}`)) return false;
    try { return !item.url || new URL(item.url).origin === new URL(config.baseUrl).origin; } catch { return false; }
  });
  relevantConsoleErrors.slice(0, 6).forEach(item => add('ERROR', 'CONSOLE_ERROR', pageConfig.name, viewportName, item.message, item));
  failedRequests.filter(item => ['document', 'script', 'stylesheet', 'image', 'font'].includes(item.type) && new URL(item.url).origin === new URL(config.baseUrl).origin).slice(0, 6).forEach(item => add('ERROR', 'REQUEST_FAILED', pageConfig.name, viewportName, `${item.type} fehlgeschlagen: ${item.url}`, item));
  if (data.compareBar && data.compareBar.count === '0' && !data.compareBar.hidden && data.compareBar.ariaHidden !== 'true') add('ERROR', 'COMPARE_ZERO_ACCESSIBLE', pageConfig.name, viewportName, '„Vergleich 0“ ist im zugänglichen DOM nicht verborgen');

  if (pageConfig.rollFacetExpected) {
    const rollFacets = data.facets.filter(facet => facet.inputs.some(input => input.name === 'filter.v.m.custom.rollenbreite'));
    if (!rollFacets.length && viewportName === 'Desktop') add('WARN', 'ROLL_WIDTH_FILTER_ADMIN', pageConfig.name, viewportName, 'Nativer Varianten-Metafeldfilter custom.rollenbreite ist nicht aktiviert/verfügbar');
    rollFacets.flatMap(facet => facet.inputs).filter(input => input.name === 'filter.v.m.custom.rollenbreite' && !/^\d+ cm$/.test(input.label)).forEach(input => add('ERROR', 'ROLL_WIDTH_FILTER_LABEL', pageConfig.name, viewportName, `Rollenbreitenwert nicht kundenfreundlich: „${input.label}“`));
  }
  if (pageConfig.type === 'collection' && data.wordCount < 80) add('WARN', 'COLLECTION_CONTENT_THIN', pageConfig.name, viewportName, `Collection-Hauptbereich hat nur ca. ${data.wordCount} Wörter`);

  if (takeScreenshots && findings.some(item => item.page === pageConfig.name && item.viewport === viewportName && item.severity === 'ERROR')) {
    await page.screenshot({ path: path.join(artifactsDir, `${safeName(pageConfig.name)}-${viewportName.toLowerCase()}.png`), fullPage: false }).catch(() => {});
  }
  } finally {
    await closeContextSafely(context);
  }
}

async function checkUrl(url, method = 'HEAD') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    let response = await fetch(url, { method, redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'TeppichParadies-SEO-QA/1.0' } });
    if (method === 'HEAD' && [400, 405, 501].includes(response.status)) response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'TeppichParadies-SEO-QA/1.0' } });
    return { status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') || '' };
  } catch (error) { return { status: 0, error: error.message }; }
  finally { clearTimeout(timeout); }
}

async function checkInfrastructure() {
  for (const resourcePath of config.infrastructure) {
    const url = new URL(resourcePath, config.baseUrl).href;
    const result = await checkUrl(url, 'GET');
    if (result.status === 429) add('WARN', 'INFRASTRUCTURE_RATE_LIMIT', resourcePath, '-', `HTTP 429 beim automatischen Abruf; separat erneut prüfen: ${url}`, result);
    else if (result.status !== 200) add('ERROR', 'INFRASTRUCTURE_HTTP', resourcePath, '-', `HTTP ${result.status || 'Fehler'} für ${url}`, result);
    else add('PASS', 'INFRASTRUCTURE_HTTP', resourcePath, '-', `HTTP 200 für ${url}`);
  }
}

async function checkInternalLinks() {
  const urls = [...internalLinks.keys()].filter(url => !/\.(?:jpg|jpeg|png|webp|gif|svg|pdf)(?:\?|$)/i.test(url)).slice(0, config.maxInternalLinks);
  let cursor = 0;
  let rateLimited = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const result = await checkUrl(url);
      if (result.status >= 400 && ![401, 403, 429].includes(result.status)) add('ERROR', 'BROKEN_INTERNAL_LINK', [...internalLinks.get(url).sources].join(', '), '-', `Interner Link liefert HTTP ${result.status}: ${url}`, result);
      else if (result.status === 429) rateLimited += 1;
      else if (!result.status || [401, 403].includes(result.status)) add('WARN', 'INTERNAL_LINK_UNCLEAR', [...internalLinks.get(url).sources].join(', '), '-', `Interner Link konnte nicht verlässlich geprüft werden (${result.status || result.error}): ${url}`, result);
    }
  });
  await Promise.all(workers);
  if (rateLimited) add('WARN', 'INTERNAL_LINK_RATE_LIMIT', 'Gesamtlauf', '-', `${rateLimited} interne Links erhielten beim mechanischen Lauf HTTP 429; keine Aussage als Broken Link`);
  return urls.length;
}

function productPageForPath(productPath) {
  return pageResults.find(result => result.viewport === 'Desktop' && result.path === productPath);
}

async function merchantAudit() {
  const configured = config.pages.filter(page => page.type === 'product').slice(0, config.merchantProductLimit);
  const rows = [];
  for (const pageConfig of configured) {
    const handle = pageConfig.path.split('/').filter(Boolean).pop();
    const apiUrl = new URL(`/products/${handle}.js`, config.baseUrl).href;
    let product;
    let fetchError;
    try {
      const response = await fetch(apiUrl, { headers: { accept: 'application/json', 'user-agent': 'TeppichParadies-Merchant-QA/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      product = await response.json();
    } catch (error) { fetchError = error.message; }
    const landing = productPageForPath(pageConfig.path);
    const issues = [];
    const blockers = [];
    if (fetchError || !product) blockers.push(`Produktdaten nicht öffentlich lesbar: ${fetchError || 'unbekannt'}`);
    if (landing?.status !== 200) blockers.push(`Landingpage HTTP ${landing?.status || 'nicht geprüft'}`);
    if (product) {
      if (!product.title?.trim()) blockers.push('Produktname fehlt');
      if (!product.featured_image) blockers.push('Hauptbild fehlt');
      if (!product.vendor?.trim()) issues.push('Brand/Vendor fehlt');
      if (!product.type?.trim()) issues.push('Produkttyp fehlt');
      if (!product.variants?.length) blockers.push('Varianten fehlen');
      if (!product.variants?.some(variant => Number(variant.price) > 0)) blockers.push('Kein positiver Verkaufspreis');
      if (!product.variants?.some(variant => variant.available)) issues.push('Aktuell keine verfügbare Variante');
      if (!product.variants?.some(variant => String(variant.sku || '').trim())) issues.push('SKU öffentlich nicht gepflegt');
      if (!product.variants?.some(variant => String(variant.barcode || '').trim())) issues.push('GTIN/EAN öffentlich nicht gepflegt');
      if (product.variants?.some(variant => /opc-/i.test(`${variant.title} ${variant.sku}`))) issues.push('OPC-generierte Variante im öffentlichen Produkt-JSON');
      if (pageConfig.productKind === 'package') issues.push('Paketware: Feed-/Landingpage-Abgleich muss Paketpreis vs. sichtbaren €/m²-Preis berücksichtigen');
      if (pageConfig.productKind === 'roll') issues.push('Rollenware: Varianten-/Rollenbreitenzuordnung im Feed manuell gegenprüfen');
    }
    rows.push({ name: pageConfig.name, path: pageConfig.path, handle, productKind: pageConfig.productKind, status: blockers.length ? 'BLOCKER' : issues.length ? 'NEEDS ATTENTION' : 'READY', blockers, issues, product: product ? { title: product.title, vendor: product.vendor, type: product.type, available: product.available, featuredImage: product.featured_image, variantCount: product.variants?.length || 0, variantsWithSku: product.variants?.filter(v => String(v.sku || '').trim()).length || 0, variantsWithBarcode: product.variants?.filter(v => String(v.barcode || '').trim()).length || 0 } : null });
  }
  return rows;
}

function localTrackingSignals() {
  const files = ['layout/theme.liquid', ...fs.readdirSync(path.join(root, 'assets')).filter(name => name.endsWith('.js')).map(name => `assets/${name}`)];
  const hits = [];
  for (const relative of files) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    if (/gtag\s*\(|dataLayer|fbq\s*\(|analytics\.publish|Shopify\.analytics|begin_checkout|purchase/i.test(text)) hits.push(relative);
  }
  return hits;
}

function writeReports(internalLinkCount, merchantRows) {
  const errors = findings.filter(item => item.severity === 'ERROR');
  const warnings = findings.filter(item => item.severity === 'WARN');
  const passes = findings.filter(item => item.severity === 'PASS');
  const status = errors.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS';
  const exitCode = errors.length ? 1 : 0;
  const durationSeconds = Math.round((Date.now() - started) / 100) / 10;
  const json = { status, exitCode, startedAt: startedAt.toISOString(), durationSeconds, summary: { errors: errors.length, warnings: warnings.length, passes: passes.length, pages: pageResults.length, internalLinksChecked: internalLinkCount }, findings, pages: pageResults.map(({ bodyText, mainText, jsonLd, links, resourceEntries, scripts, ...page }) => page), merchant: merchantRows, tracking: { ga4: [...trackingSignals.ga4], ads: [...trackingSignals.ads], meta: [...trackingSignals.meta], merchant: [...trackingSignals.merchant], localThemeSignals: localTrackingSignals() } };
  fs.writeFileSync(path.join(resultsDir, 'seo-latest.json'), JSON.stringify(json, null, 2) + '\n');

  const grouped = severity => findings.filter(item => item.severity === severity);
  const rows = items => items.length ? items.map(item => `- [${item.code}] ${item.page}${item.viewport !== '-' ? ` / ${item.viewport}` : ''}: ${item.message}`).join('\n') : '- Keine';
  const seoMarkdown = `# TEPPICH PARADIES – SEO CHECK\n\nStatus: **${status}**  \nZeitpunkt: ${startedAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}  \nLaufzeit: ${durationSeconds} s  \nExit-Code: ${exitCode}\n\n## Zusammenfassung\n\n- ${errors.length} ERROR\n- ${warnings.length} WARN\n- ${passes.length} PASS\n- ${pageResults.length} Seiten-/Viewport-Prüfungen\n- ${internalLinkCount} eindeutige interne Links geprüft\n\n## ERROR\n\n${rows(grouped('ERROR'))}\n\n## WARN\n\n${rows(grouped('WARN'))}\n\n## PASS\n\n${rows(grouped('PASS'))}\n\n## Bewertungslogik\n\nERROR sind technische, reproduzierbare SEO-/Accessibility-Fehler und führen zu Exit-Code 1. WARN sind redaktionelle, Performance- oder Admin-Hinweise und verändern den Exit-Code nicht.\n`;
  fs.writeFileSync(seoReportPath, seoMarkdown);

  const adminPages = config.pages.filter(page => page.recommendation);
  const adminRows = adminPages.map(page => {
    const current = pageResults.find(result => result.path === page.path && result.viewport === 'Desktop');
    return `## ${page.name}\n\n- URL: ${new URL(page.path, config.baseUrl).href}\n- Aktueller Title: ${current?.title || 'nicht ermittelt'}\n- Empfohlener Title: ${page.recommendation.title}\n- Aktuelle Description: ${current?.description || 'fehlt'}\n- Empfohlene Description: ${page.recommendation.description}`;
  }).join('\n\n');
  fs.writeFileSync(seoAdminPath, `# SEO-Admin-Empfehlungen\n\nDiese Resource-Daten wurden nicht automatisch verändert. Empfohlene Titel und Beschreibungen sind redaktionell vor Veröffentlichung zu prüfen.\n\n${adminRows}\n`);

  const merchantGroups = ['READY', 'NEEDS ATTENTION', 'BLOCKER'].map(group => {
    const items = merchantRows.filter(row => row.status === group);
    return `## ${group}\n\n${items.length ? items.map(row => `### ${row.name}\n\n- URL: ${new URL(row.path, config.baseUrl).href}\n- Typ: ${row.productKind}\n- Produkt: ${row.product?.title || 'nicht lesbar'}\n- Vendor: ${row.product?.vendor || 'fehlt'}\n- Produkttyp: ${row.product?.type || 'fehlt'}\n- Varianten: ${row.product?.variantCount ?? '—'}; mit SKU: ${row.product?.variantsWithSku ?? '—'}; mit GTIN/EAN: ${row.product?.variantsWithBarcode ?? '—'}\n${[...row.blockers, ...row.issues].map(issue => `- Hinweis: ${issue}`).join('\n') || '- Keine mechanischen Auffälligkeiten'}`).join('\n\n') : '- Keine'}\n`;
  }).join('\n');
  fs.writeFileSync(merchantReportPath, `# Merchant Center / Google Shopping Readiness\n\nÖffentlicher mechanischer Stichprobentest; es wurden keine Produktdaten und kein Merchant-Konto verändert.\n\n${merchantGroups}\n## Nächster manueller Schritt\n\nGoogle & YouTube in Shopify sowie Merchant Center öffnen und Feed-Diagnose, Kontoverknüpfung, Versand-/Rückgaberichtlinien und Paketpreis-Darstellung gegen diese Landingpages prüfen.\n`);

  const ga4Status = trackingSignals.ga4.size ? 'READY' : 'UNKLAR';
  const adsStatus = trackingSignals.ads.size ? 'READY' : 'UNKLAR';
  const metaStatus = trackingSignals.meta.size ? 'READY' : 'UNKLAR';
  const merchantStatus = trackingSignals.merchant.size ? 'READY' : 'UNKLAR';
  fs.writeFileSync(trackingReportPath, `# Tracking Readiness\n\nNur öffentliche Seiten und Theme-Dateien wurden gelesen; Checkout, Bestellungen und Werbekonten blieben unverändert.\n\n- Google Ads Conversion: **${adsStatus}** – ${[...trackingSignals.ads].join(', ') || 'Kein eindeutiger öffentlicher AW-Identifier. In Google & YouTube/Google Ads den Conversion-Status und enhanced conversions prüfen.'}\n- GA4: **${ga4Status}** – ${[...trackingSignals.ga4].join(', ') || 'Kein eindeutiger GA4-Identifier im öffentlichen DOM. In Shopify Customer Events bzw. Google & YouTube prüfen.'}\n- Merchant Center: **${merchantStatus}** – ${[...trackingSignals.merchant].join(', ') || 'Kontoverknüpfung ist öffentlich nicht verlässlich erkennbar. Google & YouTube-App und Merchant Center Diagnosen öffnen.'}\n- Meta: **${metaStatus}** – ${[...trackingSignals.meta].join(', ') || 'Kein eindeutiges Meta-Pixel-Signal im öffentlichen DOM. Shopify Customer Events/Meta-App prüfen.'}\n\n## Event-Abdeckung\n\n- Add to cart: ohne Mutation nur Code/DOM prüfbar; keine Testposition in den Warenkorb gelegt.\n- Begin checkout: ohne Checkout-Manipulation nicht vollständig verifiziert.\n- Purchase: **UNKLAR**, bis ein vollständiger genehmigter Testkauf samt GA4-/Ads-Debug-Ansicht durchgeführt wurde.\n- Theme-Dateien mit Tracking-Begriffen: ${localTrackingSignals().join(', ') || 'keine eigenen Theme-Hits'}\n\n## Nächster manueller Schritt\n\nNach dem genehmigten Testkauf parallel GA4 DebugView, Google Ads Tag-Diagnose und Shopify Customer Events kontrollieren; Transaktions-ID, Wert, Währung und genau ein Purchase-Event abgleichen.\n`);
  return { status, exitCode, errors: errors.length, warnings: warnings.length };
}

const browserResolution = resolveBrowserExecutable({ configuredPath: config.browserExecutable ?? 'auto', playwrightChromium: chromium });
const executablePath = browserResolution.executablePath;
if (!executablePath) {
  add('ERROR', 'BROWSER_MISSING', 'Gesamtlauf', '-', browserResolution.error);
} else {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const jobs = Object.entries(config.viewports).flatMap(([viewportName, viewport]) => config.pages.map(pageConfig => ({ pageConfig, viewportName, viewport })));
    let cursor = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        await inspectPage(browser, job.pageConfig, job.viewportName, job.viewport);
      }
    }));
  } finally { await closeBrowserSafely(browser); }
}

await checkInfrastructure();
const merchantRows = await merchantAudit();
const internalLinkCount = await checkInternalLinks();
const summary = writeReports(internalLinkCount, merchantRows);
console.log(`SEO ${summary.status}: ${summary.errors} Errors, ${summary.warnings} Warnings. Bericht: ${seoReportPath}`);
process.exitCode = summary.exitCode;
hardTimeout.clear();
