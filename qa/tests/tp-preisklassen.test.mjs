import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';
import { LABELS, NAMESPACE, KEY } from '../../scripts/preisfilter-abgleich.mjs';

// Preisklassen Teppichboden (Inhaber 2026-11-04): fuenf Kacheln unter dem Kopf
// der Kategorie. Klassen buendeln die Bereiche des Filters "Preis je m2"
// (custom.meterpreis_bereich); die Zuordnung steht nur in
// snippets/tp-preisklassen-def.liquid und muss zu BEREICHE im Abgleich-Skript passen.
const root = path.resolve(import.meta.dirname, '../..');
const lies = (d) => fs.readFileSync(path.join(root, d), 'utf8');
const ohneDoc = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/, '');
const ohneScript = (s) => s.replace(/<script[^>]*tp-preisklassen\.js[^>]*><\/script>/, '');
const ohneBloecke = (s) => s
  .replace(/{%-?\s*stylesheet\s*-?%}[\s\S]*?{%-?\s*endstylesheet\s*-?%}/, '')
  .replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/, '');

const DEF = ohneDoc(lies('snippets/tp-preisklassen-def.liquid'));
const SECTION = ohneScript(ohneBloecke(lies('sections/tp-preisklassen.liquid')));
const PARAM = `filter.p.m.${NAMESPACE}.${KEY}`;

const engine = new Liquid({
  fs: {
    readFileSync: (f) => { if (f.endsWith('tp-preisklassen-def.liquid')) return DEF; throw new Error(`unbekannt: ${f}`); },
    existsSync: (f) => f.endsWith('tp-preisklassen-def.liquid'),
    exists: async (f) => f.endsWith('tp-preisklassen-def.liquid'),
    readFile: async (f) => DEF,
    resolve: (_dir, file, ext) => file + ext,
  },
  extname: '.liquid',
});

async function klassen() {
  const roh = (await engine.parseAndRender(DEF)).trim();
  return roh.split(';').map((k) => {
    const [name, bereich, werte] = k.split('|');
    return { name, bereich, werte: werte.split(',') };
  });
}

test('jeder Filterbereich gehoert zu genau einer Klasse, in Preisreihenfolge', async () => {
  const k = await klassen();
  assert.deepEqual(k.map((x) => x.name), ['Preiswert', 'Komfort', 'Gehoben', 'Premium', 'Exklusiv']);
  const alle = k.flatMap((x) => x.werte);
  assert.deepEqual(alle, LABELS, 'Klassenwerte muessen exakt BEREICHE aus scripts/preisfilter-abgleich.mjs sein');
});

test('die Section liest genau den Filter des Abgleich-Skripts', () => {
  assert.match(SECTION, new RegExp(`'${PARAM.replace(/\./g, '\\.')}'`));
});

const wert = (value, count, active = false) => ({ value, label: value, count, active, param_name: PARAM });
function sammlung({ werte, andere = [], sort = 'manual' }) {
  return {
    url: '/collections/teppichboden',
    sort_by: sort,
    default_sort_by: 'manual',
    filters: [
      ...andere,
      { param_name: PARAM, type: 'list', values: werte, active_values: werte.filter((w) => w.active) },
    ],
  };
}
const SETTINGS = { heading: 'Ihre Preisklasse', text: 'Preis je m²', wort_mehrzahl: 'Teppichböden', wort_einzahl: 'Teppichboden', color_scheme: 'scheme-1', padding_top: 8, padding_bottom: 16 };
async function render(collection) {
  return engine.parseAndRender(SECTION, { collection, section: { id: 'template--1__tp_preisklassen', settings: SETTINGS } });
}
const kacheln = (html) => [...html.matchAll(/<a class="tp-pk__kachel([^"]*)" href="([^"]*)"[^>]*>\s*<span class="tp-pk__name">([^<]*)<\/span>\s*<span class="tp-pk__bereich">([^<]*)<\/span>\s*<span class="tp-pk__anzahl">(\d+)/g)]
  .map((m) => ({ aktiv: m[1].includes('aktiv'), href: m[2].replace(/&amp;/g, '&'), name: m[3], bereich: m[4], anzahl: Number(m[5]) }));

test('Klassen summieren ihre Bereiche, leere Klassen entfallen', async () => {
  const html = await render(sammlung({ werte: [
    wert('unter 30 €/m²', 7), wert('30 bis 40 €/m²', 36), wert('40 bis 60 €/m²', 60),
    wert('60 bis 80 €/m²', 0), wert('100 bis 150 €/m²', 30), wert('ab 150 €/m²', 9),
  ] }));
  const k = kacheln(html);
  assert.deepEqual(k.map((x) => [x.name, x.anzahl]), [['Preiswert', 43], ['Komfort', 60], ['Exklusiv', 39]]);
  const preiswert = new URL(k[0].href, 'https://x.test');
  assert.deepEqual(preiswert.searchParams.getAll(PARAM), ['unter 30 €/m²', '30 bis 40 €/m²']);
});

test('andere aktive Filter und Sortierung bleiben erhalten; aktive Klasse nimmt sich beim Klick heraus', async () => {
  const farbe = { param_name: 'filter.v.t.shopify.color-pattern', type: 'list', values: [], active_values: [{ param_name: 'filter.v.t.shopify.color-pattern', value: 'gid://shopify/TaxonomyValue/8' }] };
  const html = await render(sammlung({
    andere: [farbe], sort: 'price-ascending',
    werte: [wert('unter 30 €/m²', 3, true), wert('30 bis 40 €/m²', 5, true), wert('40 bis 60 €/m²', 12)],
  }));
  const k = kacheln(html);
  const [preiswert, komfort] = k;
  assert.equal(preiswert.aktiv, true);
  const weg = new URL(preiswert.href, 'https://x.test');
  assert.deepEqual(weg.searchParams.getAll(PARAM), [], 'aktive Klasse verlinkt ohne ihre Bereiche');
  assert.equal(weg.searchParams.get('filter.v.t.shopify.color-pattern'), 'gid://shopify/TaxonomyValue/8');
  assert.equal(weg.searchParams.get('sort_by'), 'price-ascending');
  const hin = new URL(komfort.href, 'https://x.test');
  assert.deepEqual(hin.searchParams.getAll(PARAM), ['40 bis 60 €/m²']);
  assert.equal(hin.searchParams.get('filter.v.t.shopify.color-pattern'), 'gid://shopify/TaxonomyValue/8');
  assert.match(html, /Alle Preise zeigen/);
});

test('ohne Filter oder mit weniger als zwei Klassen erscheint nichts, die leere Huelle bleibt fuer die naechste Filteraenderung', async () => {
  const leer = '<tp-preisklassen section-id="template--1__tp_preisklassen"></tp-preisklassen>';
  assert.equal((await render({ url: '/collections/x', filters: [], sort_by: 'manual', default_sort_by: 'manual' })).trim(), leer);
  assert.equal((await render(sammlung({ werte: [wert('40 bis 60 €/m²', 12)] }))).trim(), leer);
});

test('der Verfuegbarkeitsfilter bleibt in den Kachellinks und zaehlt mit', async () => {
  const verfuegbar = { param_name: 'filter.v.availability', type: 'list', values: [], active_values: [{ param_name: 'filter.v.availability', value: '1' }] };
  const k = kacheln(await render(sammlung({ andere: [verfuegbar], werte: [wert('unter 30 €/m²', 2), wert('40 bis 60 €/m²', 4)] })));
  assert.deepEqual(k.map((x) => x.anzahl), [2, 4]);
  for (const kachel of k) assert.equal(new URL(kachel.href, 'https://x.test').searchParams.get('filter.v.availability'), '1');
});

// Ablauf in assets/tp-preisklassen.js ohne Browser: DOM und Renderer sind Attrappen,
// die Importe werden durch die Attrappen ersetzt. Der echte Morph steht im PR als Browser-Beleg.
function kachelElement(renderSection, href = 'https://x.test/collections/teppichboden?filter.v.availability=1') {
  const js = lies('assets/tp-preisklassen.js').replace(/^import .*$/gm, '');
  const dokument = new EventTarget();
  const navigationen = [];
  const location = { href, replace: (u) => navigationen.push(u) };
  const definiert = new Map();
  class HTMLElement extends EventTarget {
    attribute = new Map([['section-id', 'tp-pk-id']]);
    getAttribute(n) { return this.attribute.get(n) ?? null; }
    setAttribute(n, v) { this.attribute.set(n, v); }
    removeAttribute(n) { this.attribute.delete(n); }
    hasAttribute(n) { return this.attribute.has(n); }
  }
  const kontext = vm.createContext({
    HTMLElement, document: dokument, window: { location }, ThemeEvents: { FilterUpdate: 'filter:update' },
    sectionRenderer: { renderSection },
    customElements: { get: (n) => definiert.get(n), define: (n, k) => definiert.set(n, k) },
  });
  vm.runInContext(js, kontext);
  const el = new (definiert.get('tp-preisklassen'))();
  el.connectedCallback();
  const klick = () => {
    const ev = new Event('click', { cancelable: true });
    Object.defineProperty(ev, 'target', { value: { closest: () => ({}) } });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  const filterUpdate = () => dokument.dispatchEvent(new Event('filter:update'));
  return { el, dokument, location, navigationen, klick, filterUpdate };
}
const ruheLauf = () => new Promise((fertig) => setImmediate(fertig));

test('filter:update rendert die Section mit; waehrend des Ladens wird dem alten Link nicht gefolgt', async () => {
  const aufrufe = [];
  let fertig;
  const t = kachelElement((id) => { aufrufe.push(id); return new Promise((res) => { fertig = res; }); });
  assert.equal(t.klick(), false, 'ohne laufende Aktualisierung bleibt der Link normal');
  t.filterUpdate();
  assert.deepEqual(aufrufe, ['tp-pk-id']);
  assert.equal(t.el.getAttribute('aria-busy'), 'true');
  assert.equal(t.klick(), true, 'noch alte Kachellinks: Tipp wird nicht ausgefuehrt');
  fertig('<section></section>');
  await ruheLauf();
  assert.equal(t.el.hasAttribute('aria-busy'), false);
  assert.equal(t.klick(), false);
  assert.deepEqual(t.navigationen, []);
});

test('schnelle Filterwechsel: erst der neueste Lauf gibt die Kacheln wieder frei', async () => {
  const offen = [];
  const t = kachelElement(() => new Promise((res) => offen.push(res)));
  t.filterUpdate();
  t.filterUpdate();
  offen[0]('alt');
  await ruheLauf();
  assert.equal(t.el.getAttribute('aria-busy'), 'true', 'der aeltere Lauf darf nicht freigeben');
  offen[1]('neu');
  await ruheLauf();
  assert.equal(t.el.hasAttribute('aria-busy'), false);
});

test('Fehler beim Mitrendern laedt die gewaehlte Adresse normal, Abbruch und spaete Antwort nicht', async () => {
  const fehler = kachelElement(async () => { throw new TypeError('Failed to fetch'); });
  fehler.filterUpdate();
  await ruheLauf();
  assert.deepEqual(fehler.navigationen, [fehler.location.href]);
  assert.equal(fehler.el.hasAttribute('aria-busy'), false);

  const abbruch = kachelElement(async () => { throw new DOMException('Abgebrochen', 'AbortError'); });
  abbruch.filterUpdate();
  await ruheLauf();
  assert.deepEqual(abbruch.navigationen, []);

  let scheitere;
  const spaet = kachelElement(() => new Promise((_, rej) => { scheitere = rej; }));
  spaet.filterUpdate();
  spaet.location.href = 'https://x.test/collections/teppichboden?filter.v.availability=0';
  scheitere(new Error('Section not found'));
  await ruheLauf();
  assert.deepEqual(spaet.navigationen, []);
});

test('nach dem Entfernen aus dem DOM hoert das Element nicht mehr auf filter:update', async () => {
  let aufrufe = 0;
  const t = kachelElement(async () => { aufrufe += 1; });
  t.el.disconnectedCallback();
  t.filterUpdate();
  await ruheLauf();
  assert.equal(aufrufe, 0);
});

test('die Section laedt das Skript und traegt ihre ID an der Huelle', () => {
  const roh = lies('sections/tp-preisklassen.liquid');
  assert.match(roh, /<script src="{{ 'tp-preisklassen\.js' \| asset_url }}" type="module"/);
  assert.match(roh, /<tp-preisklassen section-id="{{ section\.id }}">/);
});

test('die Teppichboden-Vorlagen zeigen die Leiste direkt nach dem Kopf', () => {
  const vorlagen = ['teppichboden', 'teppichboden-marke', 'teppichboden-buero-gewerbe', 'teppichboden-hochflor', 'teppichboden-kurzflor',
    'teppichboden-mittelflor', 'teppichboden-schlinge', 'teppichboden-sisal', 'teppichboden-velours', 'teppichboden-wolle'];
  for (const v of vorlagen) {
    const roh = lies(`templates/collection.${v}.json`).replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
    const t = JSON.parse(roh);
    assert.equal(t.sections.tp_preisklassen?.type, 'tp-preisklassen', v);
    assert.equal(t.order.indexOf('tp_preisklassen'), 1, `${v}: Preisklassen direkt nach dem Kopf`);
  }
});
