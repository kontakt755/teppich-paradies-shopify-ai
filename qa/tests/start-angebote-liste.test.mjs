import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

// Startseite "Aktuelle Angebote" (sections/product-list, Einstellung "Nur sichtbare
// Angebote", Rundgang 2026-10-26 #69). Pruefung PR #1732: Nach 48 abgelaufenen
// Kandidaten brach die Suche ab - ein gueltiges Angebot an Stelle 49 fiel weg und
// Liste samt Reiter verschwanden. Am 02.11.2026 endet der Dauerrabatt von rund
// 480 Produkten auf einmal; genau dann waere das passiert.
// Gerendert wird die echte Schleife aus sections/product-list.liquid (Block
// innerhalb von paginate), die Karte ist durch den Handle ersetzt.

const lies = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const ohneDoc = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const section = lies('sections/product-list.liquid');
const start = section.indexOf('{%- paginate section.settings.collection.products by 250 -%}');
const ende = section.indexOf('{%- endpaginate -%}', start);
assert.ok(start > 0 && ende > start, 'Schleife "je Linie eins" nicht gefunden');
const schleife = section
  .slice(start, ende)
  .replace('{%- paginate section.settings.collection.products by 250 -%}', '')
  .replace(/{%\s*content_for 'block', type: '_product-card'[^%]*%}/g, '[{{ product.handle }}]');
assert.match(schleife, /\[\{\{ product\.handle \}\}\]/, 'Produktkarte ersetzt');

// Wie oft lief die eigentliche Angebotspruefung? (Renderzeit der Startseite)
let pruefungen = 0;
const engine = new Liquid({
  templates: {
    'tp-angebot-sichtbar': "{{ '' | gezaehlt }}" + ohneDoc(lies('snippets/tp-angebot-sichtbar.liquid')),
    'tp-rabatt-sichtbar': ohneDoc(lies('snippets/tp-rabatt-sichtbar.liquid')),
    'tp-aktion-aktiv': ohneDoc(lies('snippets/tp-aktion-aktiv.liquid')),
    'tp-aktion-laufend': ohneDoc(lies('snippets/tp-aktion-laufend.liquid')),
    'tp-ist-sonderposten': ohneDoc(lies('snippets/tp-ist-sonderposten.liquid')),
    'tp-sonderposten-preisbeleg': ohneDoc(lies('snippets/tp-sonderposten-preisbeleg.liquid')),
  },
});
engine.registerFilter('gezaehlt', () => { pruefungen += 1; return ''; });

// Tage weit weg von Mitternacht, damit Zeitzonen von Testrechner und Shop egal sind.
const tagPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const wert = (o) => Object.fromEntries(Object.entries(o).map(([k, w]) => [k, { value: w }]));

// Alle Varianten tragen einen Vergleichspreis: liquidjs vergleicht nil anders als Shopify.
function produkt(handle, { aktion = {}, preis = 2000, vergleich = 2500, typ = 'Klickvinyl', tags = [], kollektionen = [] } = {}) {
  const v = { title: 'Default Title', option1: 'Default Title', option2: '', option3: '', price: preis, compare_at_price: vergleich };
  return {
    handle, title: `${handle} Eiche`, type: typ, tags, template_suffix: '',
    metafields: { aktion: wert(aktion), sonderposten: {} },
    variants: [v], selected_or_first_available_variant: v,
    collections: kollektionen.map((id) => ({ id })),
  };
}

async function liste(produkte, { zentral = [] } = {}) {
  pruefungen = 0;
  // shop ist in Shopify global, auch in Snippets; liquidjs reicht nur globals in render hinein.
  const shop = { metaobjects: { tp_aktion: { values: zentral } } };
  const html = await engine.parseAndRender(schleife, {
    max_items: 4,
    section: { settings: { collection: { products: produkte, template_suffix: '' }, tp_nur_vorlage: '', tp_nur_angebote: true } },
    routes: { search_url: '/search' },
  }, { globals: { shop } });
  return [...html.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
}

const abgelaufen = (i) => produkt(`vorbei-${i}`, { aktion: { klasse: 'preisanker', ende: tagPlus(-3) } });

test('48 abgelaufene Dauerrabatte vorn: das gueltige Angebot an Stelle 49 erscheint', async () => {
  const produkte = [...Array.from({ length: 48 }, (_, i) => abgelaufen(i)), produkt('gueltig', { aktion: { klasse: 'preisanker' } })];
  assert.deepEqual(await liste(produkte), ['gueltig']);
});

test('alle geladenen Produkte zaehlen (bis 250), ohne fuer jedes die Angebotspruefung zu rechnen', async () => {
  const produkte = [...Array.from({ length: 249 }, (_, i) => abgelaufen(i)), produkt('letztes', { aktion: { start: tagPlus(-3), ende: tagPlus(3) } })];
  assert.deepEqual(await liste(produkte), ['letztes']);
  assert.equal(pruefungen, 1, 'abgelaufene Aktionen fallen vor tp-angebot-sichtbar heraus');
  // Stehen gebliebener Streichpreis ohne Aktionsfelder (S-20): ebenfalls ohne teure Pruefung.
  assert.deepEqual(await liste([...Array.from({ length: 60 }, (_, i) => produkt(`ohne-${i}`)), produkt('reduziert', { aktion: { klasse: 'preisanker' } })]), ['reduziert']);
  assert.equal(pruefungen, 1);
});

// Der Vorfilter darf nie ein sichtbares Angebot verlieren: Liste zeigt das Produkt
// genau dann, wenn snippets/tp-angebot-sichtbar "ja" sagt.
const ZENTRAL = [{ aktiv: { value: true }, start: { value: tagPlus(-3) }, ende: { value: tagPlus(3) }, kollektion: { value: { id: 5 } }, prozent: { value: 10 } }];
const FAELLE = {
  'Dauerrabatt unbefristet': [true, { aktion: { klasse: 'preisanker' } }],
  'Dauerrabatt vorbei': [false, { aktion: { klasse: 'preisanker', ende: tagPlus(-3) } }],
  'Dauerrabatt endet bald': [true, { aktion: { klasse: 'preisanker', ende: tagPlus(3) } }],
  'befristet laeuft': [true, { aktion: { start: tagPlus(-3), ende: tagPlus(3) } }],
  'befristet kuenftig': [false, { aktion: { start: tagPlus(3), ende: tagPlus(9) } }],
  'befristet vorbei': [false, { aktion: { start: tagPlus(-9), ende: tagPlus(-3) } }],
  'ohne Aktion': [false, {}],
  'Streichpreis nicht unter Preis': [false, { aktion: { klasse: 'preisanker' }, vergleich: 2000 }],
  'andere Rabattklasse ohne Start': [false, { aktion: { klasse: 'aktion', ende: tagPlus(3) } }],
  'andere Rabattklasse mit Start': [true, { aktion: { klasse: 'aktion', start: tagPlus(-3), ende: tagPlus(3) } }],
  'zentrale Aktion ohne Streichpreis': [true, { vergleich: 2000, kollektionen: [5] }, ZENTRAL],
  'zentrale Aktion, eigene Aktion abgelaufen': [true, { aktion: { klasse: 'preisanker', ende: tagPlus(-3) }, kollektionen: [5] }, ZENTRAL],
  'zentrale Aktion fuer andere Kollektion': [false, { aktion: { klasse: 'preisanker', ende: tagPlus(-3) }, kollektionen: [6] }, ZENTRAL],
  'zentrale Aktion abgelaufen': [false, { vergleich: 2000, kollektionen: [5] }, [{ ...ZENTRAL[0], ende: { value: tagPlus(-3) } }]],
  'Sonderposten mit Dauerrabatt': [false, { aktion: { klasse: 'preisanker' }, typ: 'Sonderposten' }],
};

for (const [name, [erwartet, daten, zentral = []]] of Object.entries(FAELLE)) {
  test(`Vorfilter und tp-angebot-sichtbar entscheiden gleich: ${name}`, async () => {
    const p = produkt('x', daten);
    const sichtbar = (await engine.parseAndRender("{% render 'tp-angebot-sichtbar', product: product %}", { product: p }, { globals: { shop: { metaobjects: { tp_aktion: { values: zentral } } } } })).trim() === 'ja';
    assert.equal(sichtbar, erwartet, 'tp-angebot-sichtbar');
    assert.deepEqual(await liste([p], { zentral }), sichtbar ? ['x'] : [], 'Liste');
  });
}
