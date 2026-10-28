import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

// Rundgang 2026-10-26, #16: "Passend dazu" im Warenkorb zeigte immer vier
// Sockelleisten - auch bei einem losen Teppich und bei einer reinen
// Musterbestellung. Gerendert wird die echte Auswahl aus
// sections/product-list.liquid (Block zwischen den Kommentaren).

const lies = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const ohneDoc = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const section = lies('sections/product-list.liquid');
const start = section.indexOf('{%- liquid\n  assign tp_wk_modus');
const ende = section.indexOf('-%}', start) + 3;
assert.ok(start > 0 && ende > start, 'Auswahlblock nicht gefunden');
const auswahl = section.slice(start, ende) + '{{ tp_wk_modus }}|{{ tp_wk_unterlagen }}';

const engine = new Liquid({ templates: { 'tp-muster-position': ohneDoc(lies('snippets/tp-muster-position.liquid')) } });
const zeile = (type, sku = 'X-1') => ({ sku, properties: {}, product: { type } });
const alle = { available: true };
const all_products = {
  'antirutsch-unterlage-fuer-teppiche-rollenware': alle,
  'teppichbremse-fuer-teppiche-rollenware': alle,
  'teppichbremse-fuer-teppiche-abgepasst': { available: false },
};
const modus = async (items, an = true) => (await engine.parseAndRender(auswahl, {
  section: { settings: { tp_warenkorb_inhalt: an } },
  cart: { items, item_count: items.length },
  all_products,
})).trim();

test('nur Muster: keine Liste', async () => {
  assert.equal(await modus([zeile('Musterservice'), zeile('Teppichboden', 'M-123')]), 'aus|');
});

test('Teppich nach Mass ohne Bodenbelag: lieferbare Unterlagen statt Leisten', async () => {
  const out = await modus([zeile('Teppich nach Maß'), zeile('Service'), zeile('Musterservice')]);
  assert.equal(out, 'unterlagen|antirutsch-unterlage-fuer-teppiche-rollenware,teppichbremse-fuer-teppiche-rollenware,');
  assert.match(await modus([zeile('Wohnteppich')]), /^unterlagen\|/);
  assert.match(await modus([zeile('Läufer nach Maß')]), /^unterlagen\|/);
});

test('Teppichboden, Vinyl oder gemischter Warenkorb: Kollektion wie bisher', async () => {
  assert.equal(await modus([zeile('Teppichboden')]), '|');
  assert.equal(await modus([zeile('Klickvinyl')]), '|');
  assert.equal(await modus([zeile('Teppich nach Maß'), zeile('Teppichboden')]), '|');
  assert.equal(await modus([zeile('Kleber & Fixierung')]), '|');
});

test('ohne Einstellung oder bei leerem Warenkorb aendert sich nichts', async () => {
  assert.equal(await modus([zeile('Musterservice')], false), '|');
  assert.equal(await modus([]), '|');
});

test('der Warenkorb schaltet die Auswahl ein', () => {
  const cart = lies('templates/cart.json');
  assert.match(cart, /"tp_warenkorb_inhalt": true/);
});

test('bei Unterlagen fuehrt kein "Alle ansehen" zu den Leisten', () => {
  assert.match(section, /{% if tp_wk_modus == 'unterlagen' %}tp-wk-unterlagen{% endif %}/);
  assert.match(section, /\.section-resource-list\.tp-wk-unterlagen \.section-resource-list__header a \{ display: none; \}/);
});

// Codex-Review #1729: component-cart-items.js rendert nur die Warenkorb-Sections
// neu. Ohne eigene Aktualisierung blieben nach dem Entfernen der letzten Ware
// die Empfehlungen beim reinen Musterkorb stehen.
test('Marke fuer die Aktualisierung steht auch bei ausgeblendeter Liste', async () => {
  const marke = section.slice(section.indexOf('{%- if section.settings.tp_warenkorb_inhalt -%}'), section.indexOf('{% javascript %}'));
  assert.ok(section.lastIndexOf('{%- endif -%}', section.indexOf('{%- if section.settings.tp_warenkorb_inhalt -%}')) > section.indexOf("{%- elsif tp_wk_modus == 'aus' -%}"),
    'Marke steht nach dem Ende der Ausblend-Bedingung');
  const html = (an) => new Liquid().parseAndRender(marke, { section: { id: 'template--1__product_list_x', settings: { tp_warenkorb_inhalt: an } } });
  assert.match(await html(true), /<span hidden data-tp-wk-inhalt="template--1__product_list_x"><\/span>/);
  assert.equal((await html(false)).trim(), '');
});

test('bei cart:update rendert die Liste sich ueber die Section Rendering API neu', async () => {
  const code = section.split('{% javascript %}')[1].split('{% endjavascript %}')[0];
  const vm = await import('node:vm');
  let horcher = null;
  const marken = [{ getAttribute: () => 'template--1__product_list_x' }];
  const document = {
    querySelectorAll: (sel) => (sel === '[data-tp-wk-inhalt]' ? marken : []),
    addEventListener: (typ, fn) => { if (typ === 'cart:update') horcher = fn; },
  };
  const aufrufe = [];
  const modul = { sectionRenderer: { renderSection: (id, opt) => { aufrufe.push([id, opt]); return Promise.resolve(''); } } };
  // import() ist im vm-Kontext nicht verfuegbar: durch eine Funktion ersetzen.
  const ersetzt = code.replace("import('@theme/section-renderer')", "__import('@theme/section-renderer')");
  assert.notEqual(ersetzt, code, 'laedt den Section-Renderer des Themes');
  vm.runInNewContext(ersetzt, { document, Array, __import: (name) => { assert.equal(name, '@theme/section-renderer'); return Promise.resolve(modul); } });
  assert.equal(typeof horcher, 'function');
  horcher();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(JSON.stringify(aufrufe), JSON.stringify([['template--1__product_list_x', { cache: false }]]));
  // Ohne Marke (andere Seiten) kein Abruf.
  marken.length = 0;
  horcher();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(aufrufe.length, 1);
});

// Pruefung PR #1733: Zwei Warenkorbaenderungen waehrend eines laufenden Abrufs.
// Der echte Section-Renderer (assets/section-renderer.js) gibt fuer dieselbe URL
// die laufende Anfrage zurueck - trotz cache: false. Ohne Vormerken bliebe der
// Stand von vor der zweiten Aenderung stehen ("Passend dazu" beim reinen Musterkorb).
async function warenkorbBuehne() {
  const vm = await import('node:vm');
  const quelle = lies('assets/section-renderer.js').replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '');
  const buehne = { korb: 'mit Ware', abrufe: [], gezeigt: [] };
  const ctx = vm.createContext({
    URL, AbortController,
    Shopify: { designMode: false },
    window: { location: { href: 'https://shop.test/cart' }, addEventListener() {} },
    document: { getElementById: (id) => ({ id }), querySelectorAll: () => [] },
    DOMParser: class { parseFromString(html) { return { getElementById: (id) => ({ id, html }) }; } },
    // Jeder Abruf liefert den Warenkorb vom Zeitpunkt der Anfrage; fertig() beantwortet ihn.
    fetch: (url) => new Promise((antwort) => {
      const stand = buehne.korb;
      buehne.abrufe.push({ url: String(url), fertig: () => antwort({ text: async () => `<div>${stand}</div>` }) });
    }),
    morph: (_alt, neu) => buehne.gezeigt.push(neu.html),
    MORPH_OPTIONS: {},
  });
  vm.runInContext(`${quelle}\nglobalThis.renderer = sectionRenderer;`, ctx);
  let horcher = null;
  const document = {
    querySelectorAll: (sel) => (sel === '[data-tp-wk-inhalt]' ? [{ getAttribute: () => 'template--1__product_list_x' }] : []),
    addEventListener: (typ, fn) => { if (typ === 'cart:update') horcher = fn; },
  };
  const code = section.split('{% javascript %}')[1].split('{% endjavascript %}')[0].replace("import('@theme/section-renderer')", "__import('@theme/section-renderer')");
  vm.runInNewContext(code, { document, Array, __import: () => Promise.resolve({ sectionRenderer: ctx.renderer }) });
  const ruhe = () => new Promise((r) => setTimeout(r, 0));
  buehne.aendern = async (stand) => { buehne.korb = stand; horcher(); await ruhe(); };
  // Beantwortet den aeltesten offenen Abruf.
  buehne.antworten = async () => { const a = buehne.abrufe.find((x) => !x.erledigt); a.erledigt = true; a.fertig(); await ruhe(); await ruhe(); };
  return buehne;
}

test('zweite Warenkorbaenderung waehrend des Abrufs: danach frisch abrufen, der letzte Stand bleibt stehen', async () => {
  const b = await warenkorbBuehne();
  await b.aendern('Ware und Muster');
  await b.aendern('nur Muster');
  await b.aendern('nur Muster');
  assert.equal(b.abrufe.length, 1, 'waehrend ein Abruf laeuft, startet kein zweiter (er bekaeme dieselbe Anfrage)');
  await b.antworten();
  assert.equal(b.abrufe.length, 2, 'nach dem ersten Abruf genau ein neuer fuer alle vorgemerkten Aenderungen');
  await b.antworten();
  assert.equal(b.abrufe.length, 2);
  assert.equal(b.gezeigt.at(-1), '<div>nur Muster</div>');
  // Danach wieder normal: eine Aenderung, ein Abruf.
  await b.aendern('mit Ware');
  assert.equal(b.abrufe.length, 3);
  await b.antworten();
  assert.equal(b.gezeigt.at(-1), '<div>mit Ware</div>');
});
