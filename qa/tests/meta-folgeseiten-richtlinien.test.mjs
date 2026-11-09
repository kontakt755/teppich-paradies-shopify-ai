// Rundgang 2026-11-06: Seitenkopf in snippets/meta-tags.liquid.
// SEO-04: Folgeseiten trugen "… | Teppich Paradies – Page 2" und Filter
//         "tagged" im <title>. Jetzt deutsch, Seitenzahl vor der Marke.
// SEO-06: /policies/* hatten kein <meta name="description">. Jetzt je
//         Richtlinie ein fester, neutraler Satz.
// Der Test rendert die echten Abschnitte des Snippets mit LiquidJS.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const src = readFileSync(path.join(root, 'snippets', 'meta-tags.liquid'), 'utf8');

const markeZeile = src.match(/assign tp_marke = [^\n]+/)[0];
const titelBlock = src.match(/^<title>[\s\S]*?^<\/title>/m)[0];
const beschreibungBlock = src.match(/{% if tp_beschreibung != blank %}[\s\S]*{% endif %}/)[0];
// Aufbau von tp_beschreibung (Theme-Audit 2026-11-09): eigener Text statt
// Shopifys zusammengeklebter 320-Zeichen-Vorgabe, Kuerzung an der Wortgrenze.
const beschreibungAufbau = src.match(/ {2}assign tp_beschreibung = page_description[\s\S]*?(?= {2}assign og_description)/)[0];

const engine = new Liquid();
const shop = { name: 'TeppichParadies', description: '' };

const titel = async (ctx) => {
  const html = await engine.parseAndRender(
    `{%- liquid\n  ${markeZeile}\n-%}${titelBlock}`,
    { shop, current_page: 1, request: { page_type: 'collection' }, ...ctx },
  );
  return html.replace(/<\/?title>/g, '').replace(/\s+/g, ' ').trim();
};

const beschreibung = async (ctx) => engine.parseAndRender(
  `{%- liquid\n${beschreibungAufbau}\n-%}${beschreibungBlock}`,
  { shop, collection: null, ...ctx },
);
const descInhalt = (html) => [...html.matchAll(/name="description"\s+content="([^"]+)"/g)].map((m) => m[1]);

const KAT = 'Teppichboden kaufen – Meterware nach Maß | Teppich Paradies';

test('Folgeseite: "Seite 2" vor der Marke, kein "Page"', async () => {
  const t = await titel({ page_title: KAT, current_page: 2 });
  assert.equal(t, 'Teppichboden kaufen – Meterware nach Maß &ndash; Seite 2 | Teppich Paradies');
  assert.doesNotMatch(t, /Page/);
});

test('Folgeseite mit Shopnamen in alter Schreibweise: Marke wird angeglichen', async () => {
  const t = await titel({ page_title: 'Black Week 2026 | TeppichParadies', current_page: 12 });
  assert.equal(t, 'Black Week 2026 &ndash; Seite 12 | Teppich Paradies');
});

test('Folgeseite ohne Marke im Titel: Seitenzahl, dann Marke wie bisher', async () => {
  const t = await titel({ page_title: 'Teppichfliesen', current_page: 3 });
  assert.equal(t, 'Teppichfliesen &ndash; Seite 3 &ndash; Teppich Paradies');
});

test('Filter statt "tagged"', async () => {
  const t = await titel({ page_title: 'Ratgeber', current_tags: ['Pflege'], request: { page_type: 'blog' } });
  assert.match(t, /&ndash; Filter: Pflege/);
  assert.doesNotMatch(t, /tagged/);
});

test('Erste Seite bleibt unveraendert', async () => {
  assert.equal(await titel({ page_title: KAT }), KAT);
  assert.equal(await titel({ page_title: 'Teppichfliesen' }), 'Teppichfliesen &ndash; Teppich Paradies');
});

const RICHTLINIEN = {
  'legal-notice': /^Impressum der Teppich Paradies Oranienburg GmbH/,
  'privacy-policy': /^Datenschutzerklärung der Teppich Paradies Oranienburg GmbH/,
  'refund-policy': /^Widerrufsrecht /,
  'terms-of-service': /^Allgemeine Geschäftsbedingungen \(AGB\)/,
};

for (const [handle, erwartet] of Object.entries(RICHTLINIEN)) {
  test(`/policies/${handle}: genau eine Description`, async () => {
    const html = await beschreibung({ request: { page_type: 'policy', path: `/policies/${handle}` } });
    const treffer = [...html.matchAll(/name="description"\s+content="([^"]+)"/g)];
    assert.equal(treffer.length, 1);
    assert.match(treffer[0][1], erwartet);
  });
}

test('Unbekannte Richtlinie bekommt keinen Text', async () => {
  const html = await beschreibung({ request: { page_type: 'policy', path: '/policies/shipping-policy' } });
  assert.doesNotMatch(html, /name="description"/);
});

test('Gepflegte Description bleibt vorrangig (Produkt, Kollektion, Startseite)', async () => {
  for (const page_type of ['product', 'collection', 'index']) {
    const html = await beschreibung({ page_description: 'Eigener Text', request: { page_type, path: '/' } });
    const treffer = [...html.matchAll(/name="description"\s+content="([^"]+)"/g)];
    assert.equal(treffer.length, 1);
    assert.equal(treffer[0][1], 'Eigener Text');
  }
});

test('Produkt ohne SEO-Beschreibung: Absaetze mit Leerzeichen, an der Wortgrenze gekuerzt', async () => {
  const body = '<p>Teppich nach Ihrem Maß aus unserer Restrolle Broadway 05 grau: rechteckig zugeschnitten und rundum gekettelt. Rollenbreite 500 cm, Florhöhe ca. 12 mm.</p>\n<p>Altbestand aus unserem Lager in Oranienburg, solange der Vorrat reicht. Technische Daten sind nicht belegt.</p>';
  const html = await beschreibung({
    page_description: 'Shopify-Vorgabe mm.Altbestand',
    product: { description: body, metafields: { global: {} } },
    request: { page_type: 'product', path: '/products/x' },
  });
  const [d] = descInhalt(html);
  assert.ok(d.length <= 156, `zu lang: ${d.length}`);
  assert.match(d, /12 mm\.$/, 'endet auf Satzende, ohne Auslassungszeichen');
  assert.doesNotMatch(d, /<|mm\.Altbestand/);

  const kurz = await beschreibung({
    page_description: 'x',
    product: { description: '<p>Florhöhe ca. 12 mm.</p>\n<p>Altbestand aus dem Lager.</p>', metafields: { global: {} } },
    request: { page_type: 'product', path: '/products/x' },
  });
  assert.deepEqual(descInhalt(kurz), ['Florhöhe ca. 12 mm. Altbestand aus dem Lager.']);
});

test('Produkt mit SEO-Beschreibung: unveraendert, auch ueber 160 Zeichen', async () => {
  const gepflegt = 'Gepflegter Text mit Lieferung in ganz Deutschland. '.repeat(4).trim();
  const html = await beschreibung({
    page_description: gepflegt,
    product: { description: '<p>Langer Produkttext</p>', metafields: { global: { description_tag: gepflegt } } },
    request: { page_type: 'product', path: '/products/x' },
  });
  assert.deepEqual(descInhalt(html), [gepflegt]);
});

test('Kollektion ohne SEO-Beschreibung: lange Beschreibung wird gekuerzt', async () => {
  const lang = 'Restrollen und Reststücke aus unserem Lager in Oranienburg, solange der Vorrat reicht. '.repeat(4);
  const html = await beschreibung({
    page_description: lang.slice(0, 320),
    collection: { description: `<p>${lang}</p>`, metafields: { global: {} } },
    request: { page_type: 'collection', path: '/collections/x' },
  });
  const [d] = descInhalt(html);
  assert.ok(d.length <= 156 && d.startsWith('Restrollen und Reststücke'));
  assert.match(d, /Oranienburg, solange/, 'Kommas im Text bleiben erhalten');
  assert.doesNotMatch(d, /[,:;]…$/);
});
