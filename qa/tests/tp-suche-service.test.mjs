// Suche nach Service-Woertern (Rundgang 2026-10-26, Kundin am Handy):
// "Oeffnungszeiten" zeigte Sauberlaufmatten, "Verlegung" Verlegekeile, nie die
// Kontakt- oder Verlegeseite. snippets/tp-suche-service-ziele.liquid liefert feste
// Seitentreffer, Schnellsuche und Ergebnisseite zeigen sie oben.
// Dazu: Bei unsicherer Suche keine "1000 Suchtreffer" in der Filterleiste.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => readFileSync(path.join(root, datei), 'utf8');
const ohneDoc = (code) => code.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const ohneStylesheet = (code) => code.replace(/{%-?\s*stylesheet\s*-?%}[\s\S]*?{%-?\s*endstylesheet\s*-?%}/g, '');

const engine = new Liquid({
  templates: {
    'tp-suche-service-ziele': ohneDoc(lies('snippets/tp-suche-service-ziele.liquid')),
    price: '',
    'tp-suchfarbe-variante': '',
  },
});

const ziele = async (begriff) =>
  (await engine.parseAndRender("{% render 'tp-suche-service-ziele', begriff: b %}", { b: begriff })).trim();

test('Service-Woerter fuehren zu Kontakt und Verlegeservice', async () => {
  for (const b of ['öffnungszeiten', 'Öffnungszeiten', 'oeffnungszeiten', 'wann geöffnet', 'adresse', 'Anfahrt', 'anschrift']) {
    assert.equal(await ziele(b), 'kontakt,', b);
  }
  for (const b of ['verlegung', 'Verlegung Teppichboden', 'teppich verlegen lassen', 'Aufmaß', 'aufmass']) {
    assert.equal(await ziele(b), 'liefer-verlegeservice,', b);
  }
});

test('Produktsuchen bleiben ohne feste Seitentreffer', async () => {
  for (const b of ['teppichboden grau', 'klickvinyl', 'verlegekeile', 'sockelleiste weiß', 'kettelband', '']) {
    assert.equal(await ziele(b), '', b);
  }
});

const seiten = {
  kontakt: { handle: 'kontakt', url: '/pages/kontakt', title: 'Kontakt' },
  'liefer-verlegeservice': { handle: 'liefer-verlegeservice', url: '/pages/liefer-verlegeservice', title: 'Liefer- & Verlegeservice' },
};

async function schnellsuche(begriff, { pages = [], queries = [] } = {}) {
  const code = ohneStylesheet(ohneDoc(lies('snippets/tp-suche-ergebnisse.liquid')));
  return engine.parseAndRender(code, {
    predictive_search: { terms: begriff, resources: { products: [], collections: [], pages, articles: [], queries } },
    pages: seiten,
    collections: {},
    routes: { search_url: '/search' },
  });
}

test('Schnellsuche: Service-Seite steht oben, auch ohne Shopify-Treffer', async () => {
  const html = await schnellsuche('öffnungszeiten', { queries: [{ text: 'öffnungszeiten', styled_text: 'öffnungszeiten', url: '/search?q=x' }] });
  assert.doesNotMatch(html, /nichts Passendes gefunden/);
  const service = html.indexOf('href="/pages/kontakt"');
  const vorschlaege = html.indexOf('>Vorschläge<');
  assert.ok(service > -1, 'Kontaktseite verlinkt');
  assert.ok(vorschlaege > service, 'Service vor den Vorschlaegen');
  const leer = await schnellsuche('verlegung');
  assert.match(leer, /href="\/pages\/liefer-verlegeservice"/);
  assert.doesNotMatch(leer, /nichts Passendes gefunden/);
});

test('Schnellsuche: dieselbe Seite steht nicht doppelt da', async () => {
  const html = await schnellsuche('adresse kontakt', { pages: [seiten.kontakt] });
  assert.equal(html.match(/href="\/pages\/kontakt"/g).length, 1);
  // Kein leerer zweiter Service-Block, wenn Shopify nur die feste Seite fand.
  assert.equal(html.match(/>Service</g).length, 1);
});

test('Ergebnisseite: feste Seiten im Abschnitt Seiten & Service, Trefferzahl nur bei sicherer Suche', () => {
  const sektion = lies('sections/search-results.liquid');
  assert.match(sektion, /render 'tp-suche-service-ziele', begriff: search\.terms/);
  assert.match(sektion, /content_for 'block', type: 'filters'[^%]*tp_unsicher: tp_sr_unsicher/);
  const filter = lies('blocks/filters.liquid');
  assert.equal((filter.match(/request\.page_type == 'search' and tp_unsicher/g) ?? []).length, 2);
});

test('Filterleiste: "Passende Vorschlaege" statt Trefferzahl bei unsicherer Suche', async () => {
  const filter = lies('blocks/filters.liquid');
  const stelle = filter.match(/{% if request\.page_type == 'search' and tp_unsicher %}[\s\S]*?{% endif %}/)[0];
  const r = (tp_unsicher) =>
    engine.parseAndRender(stelle, { request: { page_type: 'search' }, tp_unsicher, results: { results_count: 1000 }, products_count: 24 });
  assert.match(await r(true), /Passende Vorschläge/);
  assert.doesNotMatch(await r(true), /1000/);
  assert.match(await r(false), /1000 Suchtreffer/);
});
