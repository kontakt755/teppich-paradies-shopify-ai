// Die gewaehlte Form (rund, oval) muss ueberall mitgehen: beim Wechsel der Kante,
// beim Wechsel Raummass/Gekettelt und im Text fuer den Lieferschein. Vorher kam
// Oval auf der Zielseite still als Rechteck an.
// Kein Netzwerk, kein Shopify-Zugriff, keine Produktdatenaenderung.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { Liquid } from 'liquidjs';

createRequire(import.meta.url)('../../assets/tp-masstepich-rechnung.js');

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const js = read('assets/tp-einfass-konfigurator.js');

function slice(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Fehlende Quelltext-Anker: ${start} / ${end}`);
  return source.slice(a, b);
}

// --- Kantenkacheln ---

function kacheln(formenZiel, mass) {
  const attribute = new Map();
  const summe = { textContent: '', hidden: true };
  const klassen = new Set();
  const kachel = {
    hidden: false,
    getAttribute: () => '0',
    setAttribute: (k, v) => attribute.set(k, v),
    querySelector: (s) => (s === '[data-kante-summe]' ? summe : null),
    classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) },
  };
  const ziel = { art: 'paspelband', url: '/products/paspel', aktiv: false, inkl: true, mindest_cent: 0, max_l: 1000, v: { b1: [22, 100] } };
  if (formenZiel) ziel.formen = formenZiel;
  const context = vm.createContext({
    URL, String, Number, parseInt,
    kd: { eigen: { 11: 'b1' }, kettel_cent: 0 }, kantenListe: [ziel], target: { id: 11, max_breite_cm: 400 },
    art: 'ketteln', minCm: 50, rollenRichtung: false, M: globalThis.TPMass, kantenHinweis: null,
    fmt: (n) => String(n), euro: (c) => c + ' Cent', q: () => null,
    root: { querySelectorAll: (s) => (s === '[data-kante]' ? [kachel] : []) },
    window: { location: { href: 'https://shop.example/products/kettel?variant=11' } },
  });
  vm.runInContext(slice(js, '    function kantenAktualisieren(mass) {', '    // Gueltiges Mass an den Befestigungs-Tipp'), context);
  context.kantenAktualisieren(mass);
  return { url: new URL(attribute.get('href')), summe: summe.textContent, gesperrt: klassen.has('is-zu-gross') };
}

test('Kantenwechsel nimmt Oval und beide Masse mit', () => {
  const r = kacheln(['rechteck', 'oval'], { f: 'oval', w: 200, l: 300 });
  assert.equal(r.url.searchParams.get('form'), 'oval');
  assert.equal(r.url.searchParams.get('breite'), '200');
  assert.equal(r.url.searchParams.get('laenge'), '300');
  assert.equal(r.gesperrt, false);
  assert.match(r.summe, /Cent/);
});

test('Kantenwechsel nimmt Rund mit dem Durchmesser mit, ohne Laenge', () => {
  const r = kacheln(['rechteck', 'rund'], { f: 'rund', w: 200, l: 200 });
  assert.equal(r.url.searchParams.get('form'), 'rund');
  assert.equal(r.url.searchParams.get('breite'), '200');
  assert.equal(r.url.searchParams.get('laenge'), null);
});

test('Kante ohne diese Form zeigt keinen Preis', () => {
  const r = kacheln(['rechteck'], { f: 'rund', w: 200, l: 200 });
  assert.equal(r.summe, 'In dieser Form nicht möglich');
  assert.equal(r.gesperrt, true);
});

test('Ohne Formangabe in den Kachel-Daten bleibt der Preis wie bisher', () => {
  const r = kacheln(null, { f: 'rechteck', w: 200, l: 300 });
  assert.match(r.summe, /Cent/);
});

test('Ohne gueltiges Mass bleibt keine alte Form im Link', () => {
  const r = kacheln(['rechteck'], null);
  assert.equal(r.url.searchParams.get('form'), null);
});

// --- Formen der Zielprodukte im Datenvertrag der Kacheln ---

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
engine.registerFilter('image_url', () => '');
engine.registerFilter('image_tag', () => '');
engine.registerFilter('money_without_currency', (v) => String(v));

const val = (value) => ({ value });

test('Kantendaten nennen die Formen jedes Zielprodukts, ohne Angabe Rechteck', async () => {
  const produkt = (id, art, formen) => ({
    id, url: '/products/p' + id, available: true, vendor: 'Test', variants: [],
    metafields: { service: { einfassung: val(art), ...(formen ? { formen: val(formen) } : {}) } },
  });
  const a = produkt(1, 'Ketteln', ['Rechteck', 'Rund', 'Oval']);
  const b = produkt(2, 'Paspelband');
  a.metafields.service.einfass_gruppe = val([a, b]);
  a.selected_or_first_available_variant = { metafields: { service: {} } };
  const html = await engine.parseAndRender(stripDocs(read('snippets/tp-einfass-kanten.liquid')), { product: a, bilder: {}, kettel_cent: 0 });
  const daten = JSON.parse(html.match(/data-kanten-daten>([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(daten.kanten.filter(Boolean).map((k) => k.formen), [['rechteck', 'rund', 'oval'], ['rechteck']]);
});

// --- Lieferschein-Text ---

function zuschnitt(p) {
  const context = vm.createContext({ d: { produkt: 'Teppich' }, target: { farbe: 'Grau' } });
  const form = js.match(/  var FORM = [^\n]+/)[0];
  vm.runInContext(form + '\n' + slice(js, '    function zuschnittText(p) {', '    function hinzufuegen() {'), context);
  return context.zuschnittText(p);
}

test('Zuschnitt-Text nennt Oval vor dem Mass', () => {
  assert.equal(zuschnitt({ Form: 'Oval', 'Maße': '200 × 300 cm', Einfassung: 'Gekettelt' }), 'Teppich · Grau · Oval · 200 × 300 cm · Gekettelt');
});

test('Zuschnitt-Text bleibt beim Rechteck unveraendert', () => {
  assert.equal(zuschnitt({ Form: 'Rechteck', 'Maße': '200 × 300 cm', Einfassung: 'Gekettelt' }), 'Teppich · Grau · 200 × 300 cm · Gekettelt');
});

// --- Wechsel Raummass / Gekettelt (Restrollen) ---

function wechselLink({ form, search = '' }) {
  const block = read('blocks/tp-einfass-wechsel.liquid');
  const script = slice(block, '        function aktualisieren() {', "        document.addEventListener('change'")
    .replace(/{% if tp_ew_rollenmodus %}|{% endif %}/g, '');
  const attribute = { href: '/products/ziel', 'data-ew-ziel': '12' };
  const link = { style: {}, getAttribute: (n) => attribute[n], setAttribute: (n, v) => { attribute[n] = v; } };
  const konfig = {
    querySelector: (s) => {
      if (s.startsWith('input[name^="tp-ek-form-"]')) return form ? { value: form } : null;
      return { value: s === '[data-breite]' ? '123' : '456' };
    },
  };
  const context = vm.createContext({
    URL, URLSearchParams, Number,
    d: { selected_id: 111, eigen: { 111: 'b' }, ziele: { 12: { b: '121' } } },
    nav: { querySelectorAll: () => [link], querySelector: () => null },
    document: { querySelector: () => konfig },
    window: { location: { href: 'https://shop.example/products/start' + search, search } },
  });
  vm.runInContext(script + '\naktualisieren();', context);
  return new URL(attribute.href);
}

test('Wechsel-Block nimmt Oval mit', () => {
  const url = wechselLink({ form: 'oval' });
  assert.equal(url.searchParams.get('form'), 'oval');
  assert.equal(url.searchParams.get('laenge'), '456');
});

test('Wechsel-Block nimmt Rund ohne die ausgeblendete Laenge mit', () => {
  const url = wechselLink({ form: 'rund' });
  assert.equal(url.searchParams.get('form'), 'rund');
  assert.equal(url.searchParams.get('laenge'), null);
});

test('Wechsel-Block: Rechteck ohne Form-Parameter', () => {
  assert.equal(wechselLink({ form: 'rechteck' }).searchParams.get('form'), null);
});
