// Teppich nach Mass waehrend einer zentralen Aktion (Winterdeals 2026): Karte,
// Kopfpreis und Konfigurator zeigen den vollen Preis, abgezogen wird erst im
// Warenkorb. Der Aktionshinweis (blocks/tp-aktion-hinweis.liquid) sagt das und
// nennt, was ausgenommen ist - nur, was wirklich als eigene Zeile berechnet wird.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => readFileSync(path.join(root, datei), 'utf8');
const ohneDoc = (code) => code.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');

const engine = new Liquid({ templates: {
  'tp-aktion-laufend': ohneDoc(lies('snippets/tp-aktion-laufend.liquid')),
} });
const quelle = lies('blocks/tp-aktion-hinweis.liquid');
const block = ohneDoc(quelle.slice(0, quelle.indexOf('{% stylesheet %}')));

const kollektion = { id: 7 };
const aktion = (felder = {}) => ({
  aktiv: { value: true }, start: { value: '2000-01-01' }, ende: { value: '2999-12-14' },
  prozent: { value: 15 }, kollektion: { value: kollektion }, ...felder,
});

function teppich({ art = 'Ketteln', kanteInkl, qm = true, drin = true } = {}) {
  return {
    type: 'Teppich', vendor: 'TeppichParadies', title: 'Beispiel', tags: [],
    collections: drin ? [kollektion] : [],
    metafields: {
      custom: { preis_pro_001_qm: { value: qm } },
      service: {
        einfassung: art == null ? null : { value: art },
        kante_inklusive: kanteInkl == null ? null : { value: kanteInkl },
      },
    },
  };
}

// shop ist in Shopify global; LiquidJS reicht nur globals in {% render %} weiter.
const hinweis = async (product, aktionen = [aktion()]) => (await engine.parseAndRender(block, {
  closest: { product }, product, block: { shopify_attributes: '' }, settings: {}, collections: {},
}, { globals: { shop: { metaobjects: { tp_aktion: { values: aktionen } } } } })).replace(/\s+/g, ' ').trim();

const FLAECHE = 'Der Rabatt gilt für die Teppichfläche und wird im Warenkorb abgezogen.';

test('Gekettelt mit eigenem Kettelservice: Flaeche, Warenkorb, Kettelung ausgenommen', async () => {
  const html = await hinweis(teppich());
  assert.match(html, /Aktion −15&nbsp;% bis 14\.12\.2999/);
  assert.ok(html.includes(`${FLAECHE} Die Kettelung ist vom Rabatt ausgenommen.`), html);
  assert.doesNotMatch(html, /Fertigungspauschale/);
});

test('Wunschmass vom Hersteller: Fertigungspauschale ausgenommen', async () => {
  const html = await hinweis(teppich({ art: 'Fertig' }));
  assert.ok(html.includes(`${FLAECHE} Die Fertigungspauschale ist vom Rabatt ausgenommen.`), html);
  assert.doesNotMatch(html, /Kettelung/);
});

test('Kante im Quadratmeterpreis: nichts als ausgenommen bezeichnen', async () => {
  for (const opt of [{ kanteInkl: true }, { art: 'Paspelband' }, { art: 'Einfassband' }, { art: 'Cover' }, { art: 'Raummass' }]) {
    const html = await hinweis(teppich(opt));
    assert.match(html, /Der Rabatt wird im Warenkorb abgezogen\./, JSON.stringify(opt));
    assert.doesNotMatch(html, /ausgenommen|Teppichfläche/, JSON.stringify(opt));
  }
});

test('Andere Produkte behalten nur Prozent und Enddatum', async () => {
  for (const opt of [{ qm: false }, { art: null }, { art: '' }]) {
    const html = await hinweis(teppich(opt));
    assert.match(html, /Aktion −15&nbsp;% bis 14\.12\.2999/, JSON.stringify(opt));
    assert.doesNotMatch(html, /Warenkorb|ausgenommen/, JSON.stringify(opt));
  }
});

test('Ohne laufende Aktion erscheint nichts', async () => {
  const faelle = [
    [teppich(), []],
    [teppich(), [aktion({ aktiv: { value: false } })]],
    [teppich(), [aktion({ start: { value: '2999-01-01' } })]],
    [teppich({ drin: false }), [aktion()]],
  ];
  for (const [produkt, aktionen] of faelle) assert.equal(await hinweis(produkt, aktionen), '');
});
