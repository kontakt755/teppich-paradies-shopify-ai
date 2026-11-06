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
const beschreibungBlock = src.match(/{% if page_description %}[\s\S]*{% endif %}/)[0];

const engine = new Liquid();
const shop = { name: 'TeppichParadies', description: '' };

const titel = async (ctx) => {
  const html = await engine.parseAndRender(
    `{%- liquid\n  ${markeZeile}\n-%}${titelBlock}`,
    { shop, current_page: 1, request: { page_type: 'collection' }, ...ctx },
  );
  return html.replace(/<\/?title>/g, '').replace(/\s+/g, ' ').trim();
};

const beschreibung = async (ctx) => engine.parseAndRender(beschreibungBlock, {
  shop, collection: null, ...ctx,
});

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
