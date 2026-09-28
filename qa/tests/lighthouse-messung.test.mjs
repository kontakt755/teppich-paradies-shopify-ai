import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  median, reihenfolge, themePfad, kennzahlen, zusammenfassen, schluessel, SEITEN,
} from '../../scripts/lighthouse-messung.mjs';

test('median: ungerade, gerade, leer und nicht endliche Werte', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median([5, NaN, null, undefined]), 5);
});

test('reihenfolge: reihum statt seitenweise', () => {
  const plan = reihenfolge([{ id: 'a' }, { id: 'b' }], 2);
  assert.deepEqual(plan.map((p) => `${p.runde}${p.seite.id}`), ['1a', '1b', '2a', '2b']);
});

test('reihenfolge: beide Banner-Varianten stehen nebeneinander, nicht in getrennten Bloecken', () => {
  const plan = reihenfolge([{ id: 'a' }, { id: 'b' }], 2, ['mit', 'ohne']);
  assert.equal(plan.length, 8);
  assert.deepEqual(plan.slice(0, 4).map((p) => `${p.seite.id}-${p.variante}`), ['a-mit', 'a-ohne', 'b-mit', 'b-ohne']);
  assert.ok(plan.slice(0, 4).every((p) => p.runde === 1));
});

test('themePfad: nimmt den haeufigsten Pfad, null ohne Treffer', () => {
  const html = '<link href="/cdn/shop/t/53/assets/a.css"><script src="/cdn/shop/t/53/assets/b.js"><img src="/cdn/shop/t/9/x.png">';
  assert.equal(themePfad(html), '53');
  assert.equal(themePfad('<p>nichts</p>'), null);
});

function lhr(overrides = {}) {
  return {
    finalDisplayedUrl: 'https://www.teppich-paradies.net/',
    runWarnings: [],
    categories: { performance: { score: 0.61 } },
    audits: {
      'first-contentful-paint': { numericValue: 2100 },
      'largest-contentful-paint': { numericValue: 5200 },
      'total-blocking-time': { numericValue: 380 },
      'cumulative-layout-shift': { numericValue: 0 },
      'speed-index': { numericValue: 4100 },
      'total-byte-weight': { numericValue: 2400000 },
      'dom-size': { numericValue: 1800 },
      redirects: { numericValue: 0 },
      // Format aus einer echten Lighthouse-13.5-Rohdatei (2026-09-26)
      'lcp-breakdown-insight': { details: { type: 'list', items: [
        { type: 'table', items: [{ subpart: 'timeToFirstByte', duration: 95 }, { subpart: 'elementRenderDelay', duration: 4100 }] },
        { type: 'node', selector: 'div.hero > p', nodeLabel: 'Willkommen im Shop' },
      ] } },
    },
    ...overrides,
  };
}

test('kennzahlen: sauberer Lauf', () => {
  const k = kennzahlen(lhr(), 'https://www.teppich-paradies.net/');
  assert.equal(k.score, 61);
  assert.equal(k.lcp, 5200);
  assert.equal(k.lcpElement, 'div.hero > p');
  assert.equal(k.lcpRenderDelay, 4100);
  assert.equal(k.lcpIstBanner, false);
  assert.equal(k.sauber, true);
});

test('kennzahlen: erkennt den Shopify-Cookie-Banner als LCP-Element', () => {
  const banner = { 'lcp-breakdown-insight': { details: { items: [
    { type: 'table', items: [{ subpart: 'elementRenderDelay', duration: 6295 }] },
    { type: 'node', selector: 'section#shopify-pc__banner > div.shopify-pc__banner__wrapper > div > p', nodeLabel: 'Wir und unsere Partner, einschliesslich Shopify, verwenden Cookies' },
  ] } } };
  const k = kennzahlen(lhr({ audits: { ...lhr().audits, ...banner } }), 'https://www.teppich-paradies.net/');
  assert.equal(k.lcpIstBanner, true);
  assert.equal(k.lcpRenderDelay, 6295);
});

test('kennzahlen: fehlt der LCP-Insight, bleibt das Element null statt zu werfen', () => {
  const a = { ...lhr().audits }; delete a['lcp-breakdown-insight'];
  const k = kennzahlen(lhr({ audits: a }), 'https://www.teppich-paradies.net/');
  assert.equal(k.lcpElement, null);
  assert.equal(k.lcpIstBanner, false);
});

test('kennzahlen: Umleitung, Warnung und fremde Ziel-URL machen den Lauf unsauber', () => {
  const url = 'https://www.teppich-paradies.net/';
  assert.equal(kennzahlen(lhr({ audits: { ...lhr().audits, redirects: { numericValue: 860 } } }), url).sauber, false);
  assert.equal(kennzahlen(lhr({ runWarnings: ['The page may not have loaded as expected'] }), url).sauber, false);
  assert.equal(kennzahlen(lhr({ finalDisplayedUrl: 'https://www.teppich-paradies.net/password' }), url).sauber, false);
});

test('kennzahlen: Schraegstrich am Ende zaehlt nicht als Umleitung', () => {
  const k = kennzahlen(lhr({ finalDisplayedUrl: 'https://www.teppich-paradies.net/collections/teppichboden/' }),
    'https://www.teppich-paradies.net/collections/teppichboden');
  assert.equal(k.sauber, true);
});

test('zusammenfassen: nur saubere Laeufe, Min/Median/Max, haeufigstes LCP-Element', () => {
  const l = (runde, lcp, sauber = true) => ({ seiteId: 'start', variante: 'mit', runde, score: 50 + runde, lcp, fcp: 2000, tbt: 300, cls: 0, si: 4000, bytes: 1e6, dom: 1000, lcpElement: 'p', sauber });
  const z = zusammenfassen([l(1, 4400), l(2, 11600), l(3, 4800), l(4, 99999, false)]);
  const r = z[schluessel('start', 'mit')];
  assert.equal(r.laeufe, 4);
  assert.equal(r.sauber, 3);
  assert.deepEqual(r.lcp, { min: 4400, median: 4800, max: 11600 });
  assert.deepEqual(r.lcpElemente, [['p', 3]]);
});

test('zusammenfassen: mit und ohne Banner werden nie vermischt', () => {
  const l = (variante, lcp, banner) => ({ seiteId: 'start', variante, runde: 1, lcp, sauber: true, lcpElement: 'x', lcpIstBanner: banner });
  const z = zusammenfassen([l('mit', 6400, true), l('mit', 6600, true), l('ohne', 2900, false), l('ohne', 3100, false)]);
  assert.deepEqual(Object.keys(z).sort(), ['start|mit', 'start|ohne']);
  assert.equal(z['start|mit'].lcp.median, 6500);
  assert.equal(z['start|ohne'].lcp.median, 3000);
  assert.equal(z['start|mit'].bannerLcp, 2);
  assert.equal(z['start|ohne'].bannerLcp, 0);
});

test('SEITEN: eindeutige IDs und Pfade beginnen mit /', () => {
  assert.equal(new Set(SEITEN.map((s) => s.id)).size, SEITEN.length);
  for (const s of SEITEN) assert.ok(s.pfad.startsWith('/'));
});
