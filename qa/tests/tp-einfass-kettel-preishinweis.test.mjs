// Preishinweis im Mass-Konfigurator (blocks/tp-einfass-konfigurator.liquid):
// - gekettelte Sonderposten ohne service.lieferzeit zeigen dieselbe Lieferzeit
//   wie die uebrigen gekettelten Teppiche nach Mass (Befund 06.11.: 10 aktive
//   Produkte mit Tag sonderposten und Art Ketteln ohne Lieferzeit),
// - gekettelte Produkte sagen "Kettelung rundum", nicht "Einfassung rundum"
//   (Befund 06.11. auf zwei Hausmarken-Qualitaeten).
// Rendert den echten Liquid-Kopf samt Preishinweis mit LiquidJS, wie
// qa/tests/tp-einfass-fertig-pauschale.test.mjs. Kein Netzwerk, kein Shopify.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const block = readFileSync(path.join(root, 'blocks/tp-einfass-konfigurator.liquid'), 'utf8');
const KETTEL = 'ca. 5–8 Werktage inkl. Ketteln';

function slice(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Fehlende Quelltext-Anker: ${start} / ${end}`);
  return source.slice(a, b);
}
const stripDocs = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid({
  relativeReference: false,
  fs: {
    resolve: (_dir, file) => path.join(root, 'snippets', file + '.liquid'),
    exists: async (file) => existsSync(file), existsSync,
    readFile: async (file) => stripDocs(readFileSync(file, 'utf8')),
    readFileSync: (file) => stripDocs(readFileSync(file, 'utf8')),
    contains: () => true,
  },
});
engine.registerFilter('json', (value) => JSON.stringify(value ?? null));

const hinweis = slice(block, '<p class="tp-ek__preishinweis">{% if', '\n        {%- comment -%}');
const quelle = slice(block, '{%- liquid', '\n  <div class="tp-ek') + hinweis + '\n{%- endif -%}';

const val = (value) => ({ value });
function fixture({ art = 'Ketteln', tags = [], handle = 'testteppich-nach-mass', lieferzeit, kanteInklusive } = {}) {
  const variant = {
    id: 'v1', price: 57, available: true, options: ['Grau'], featured_image: null,
    metafields: { service: { einfassen: val('Verfügbar') }, custom: { farbcode: val('005') } },
  };
  const product = {
    id: 7101, handle, title: 'Testteppich', tags, available: true,
    variants: [variant], selected_or_first_available_variant: variant,
    options_with_values: [{ name: 'Farbe', position: 1 }],
    metafields: {
      custom: { preis_pro_001_qm: val(true) },
      service: {
        einfassung: val(art), max_breite_cm: val(400), max_laenge_cm: val(1000), formen: val(['Rechteck']),
        ...(lieferzeit === undefined ? {} : { lieferzeit: val(lieferzeit) }),
        ...(kanteInklusive === undefined ? {} : { kante_inklusive: val(kanteInklusive) }),
      },
    },
  };
  return { product, block: { id: 'kettel_block', settings: {} }, settings: { tp_versand_frei_ab: 50 }, pages: {} };
}
const rendern = (o) => engine.parseAndRender(quelle, fixture(o));
const lieferzeit = (html) => html.match(/Lieferzeit: ([^<]*?)\.<\/p>/)?.[1] ?? null;

test('gekettelter Sonderposten ohne Metafeld: Lieferzeit wie die uebrigen Kettelteppiche', async () => {
  const html = await rendern({ tags: ['gekettelt', 'sonderposten', 'teppich-nach-mass'] });
  assert.equal(lieferzeit(html), KETTEL);
  assert.match(html, /Inklusive Zuschnitt und Kettelung rundum\./);
  assert.doesNotMatch(html, /Einfassung rundum/);
});

test('Rueckfall nur fuer Sonderposten mit Art Ketteln, eigenes Metafeld hat Vorrang', async () => {
  // Normale Ware ohne Metafeld bleibt ohne Zusage (fail closed).
  assert.equal(lieferzeit(await rendern({ tags: ['gekettelt'] })), null);
  // Belegter Wert am Produkt gewinnt.
  assert.equal(lieferzeit(await rendern({ tags: ['sonderposten'], lieferzeit: '3–4 Werktage' })), '3–4 Werktage');
  // Andere Kanten leihen sich den Kettelwert nicht (Raummass: tp-einfass-rollenzuschnitt).
  for (const art of ['Einfassband', 'Paspelband', 'Cover', 'Fertig']) {
    const html = await rendern({ art, tags: ['sonderposten'] });
    assert.match(html, /class="tp-ek__preishinweis"/, `${art}: Block rendert`);
    assert.equal(lieferzeit(html), null, art);
  }
  // Serena-Rueckfall unveraendert.
  assert.equal(lieferzeit(await rendern({ handle: 'serena-teppich-nach-mass' })), KETTEL);
});

test('Preishinweis: Kettelung bei Ketteln, Einfassung nur bei den Bandarten', async () => {
  const kettel = await rendern({ lieferzeit: KETTEL });
  assert.match(kettel, /Inklusive Zuschnitt und Kettelung rundum\. Inkl\. MwSt\./);
  assert.doesNotMatch(kettel, /Einfassung/);
  const inklusive = await rendern({ kanteInklusive: true });
  assert.match(inklusive, /Kettelung rundum – die Kettelung ist im Quadratmeterpreis bereits enthalten\./);
  for (const art of ['Einfassband', 'Paspelband', 'Cover']) {
    const html = await rendern({ art });
    assert.match(html, /Inklusive Zuschnitt und Einfassung rundum\./, art);
    assert.doesNotMatch(html, /Kettelung/, art);
  }
  assert.match(await rendern({ art: 'Fertig' }), /Vom Hersteller nach Ihrem Maß/);
});
