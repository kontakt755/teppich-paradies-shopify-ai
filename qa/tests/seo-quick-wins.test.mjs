// SEO-Audit 2026-09-30, Quick Wins im Theme: robots.txt sperrt die interne
// Suche, Angebots-Kollektionen tragen noindex, die Produkt-Brotkrumen laufen
// nicht ueber eine Angebots-Kollektion, und das Unternehmen gilt im Schema
// fuer ganz Deutschland.
//
// Grenze: LiquidJS ist nicht Shopifys Liquid. Gerendert wird nur, was ohne
// Shopify-Objekte auskommt; der Rest ist ein Quelltext-Test.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = rel => readFileSync(join(root, rel), 'utf8');
const eng = new Liquid({ strictFilters: false, strictVariables: false });

const standardGruppen = [
  {
    user_agent: { value: '*', toString: () => 'User-agent: *' },
    rules: ['Allow: /', 'Disallow: /admin', 'Disallow: /cart/'],
    sitemap: 'Sitemap: https://www.teppich-paradies.net/sitemap.xml',
  },
  {
    user_agent: { value: 'adsbot-google', toString: () => 'User-agent: adsbot-google' },
    rules: ['Disallow: /checkout'],
    sitemap: null,
  },
];

test('robots.txt: Standardregeln bleiben, nur die Gruppe * sperrt /search', async () => {
  const out = await eng.parseAndRender(lies('templates/robots.txt.liquid'), {
    robots: { default_groups: standardGruppen },
  });
  const zeilen = out.split('\n').map(z => z.trim()).filter(Boolean);
  for (const regel of ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /cart/',
    'User-agent: adsbot-google', 'Disallow: /checkout',
    'Sitemap: https://www.teppich-paradies.net/sitemap.xml']) {
    assert.ok(zeilen.includes(regel), `Standardregel fehlt: ${regel}\n${out}`);
  }
  const stern = zeilen.indexOf('User-agent: *');
  const ads = zeilen.indexOf('User-agent: adsbot-google');
  const suche = zeilen.indexOf('Disallow: /search');
  assert.ok(suche > stern && suche < ads, `Disallow: /search gehoert in die Gruppe *\n${out}`);
  assert.ok(zeilen.includes('Disallow: /*/search'));
  assert.equal(zeilen.filter(z => z === 'Disallow: /search').length, 1, 'nur einmal, nicht im adsbot-Block');
});

test('Angebots-Kollektionen tragen noindex,follow, echte Aktionsware nicht', () => {
  const src = lies('snippets/meta-tags.liquid');
  const m = src.match(/assign tp_noindex_handles = '([^']+)'/);
  assert.ok(m, 'Handle-Liste fehlt');
  const handles = m[1].split(',');
  assert.deepEqual(handles.sort(), [
    'angebote-leisten-zubehoer', 'angebote-linoleum', 'angebote-teppichboden', 'angebote-vinylboden',
  ]);
  assert.ok(!handles.includes('stark-reduziert'));
  assert.match(src, /tp_noindex_handles contains collection\.handle -%\}\s*<meta\s+name="robots"\s+content="noindex,follow"/);
});

test('Produkt-Brotkrumen ueberspringen Angebots-Kollektionen in allen Zweigen', () => {
  const src = lies('snippets/product-information-content.liquid');
  const treffer = src.match(/if tp_c\.handle contains 'angebote-'\s+continue/g) || [];
  assert.equal(treffer.length, 3, 'Stufe 2, Stufe 1 und Fallback muessen Angebote auslassen');
});

test('Unternehmen gilt deutschlandweit, Verlegung bleibt im 50-km-Kreis', () => {
  const src = lies('sections/header.liquid');
  assert.match(src, /"areaServed": \{ "@type": "Country", "name": "Deutschland", "identifier": "DE" \}/);
  assert.match(src, /"makesOffer": \{[\s\S]*?"serviceType": "Bodenverlegung"[\s\S]*?"geoRadius": 50000/);
});
