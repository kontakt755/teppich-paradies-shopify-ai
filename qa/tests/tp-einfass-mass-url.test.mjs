import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const source = read('assets/tp-einfass-konfigurator.js');
const start = source.indexOf('    function massUrlAktualisieren(mass) {');
const end = source.indexOf('    function rechnen() {', start);
assert.ok(start > 0 && end > start);
const functions = source.slice(start, end);
const bandText = source.match(/  function bandText\([^\n]+/)[0];

function browser({ url = 'https://shop.example/products/test?variant=2', art = 'fertig', forms = ['rechteck'], min = 50, maxW = 400, maxL = 1000, bands = [], width = '', length = '', product = '/products/test' } = {}) {
  const location = new URL(url);
  const writes = [];
  let selected = forms[0];
  const radios = new Map(forms.map(value => [value, { get checked() { return selected === value; }, set checked(v) { if (v) selected = value; } }]));
  const bandRadios = bands.map(b => ({ value: b.nr || b.name, checked: false }));
  const bandName = { textContent: '' };
  const context = vm.createContext({
    URL, URLSearchParams, Number,
    d: { produkt_url: product }, art, minCm: min, maxW, maxL,
    bandWahl: bands.length > 0, band: null, baender: bands, target: { id: 2 },
    uid: 'test', q: () => bandName,
    inBreite: { value: width }, inLaenge: { value: length },
    root: { querySelector(selector) { return radios.get(selector.match(/\[value="([^"]+)"\]/)?.[1] || forms[0]) || null; }, querySelectorAll: () => bandRadios },
    window: { location, history: { state: { existing: 1 }, replaceState(state, _, next) { writes.push({ state, next }); location.href = new URL(next, location).href; } } },
  });
  vm.runInContext(bandText + '\n' + functions, context);
  return { context, location, writes, bandRadios, bandName, restore: force => context.massAusUrl(force), write: mass => context.massUrlAktualisieren(mass), form: () => selected };
}

test('Manuelle Masse und aktuelle Variante stehen nach der Berechnung im bestehenden URL-Vertrag', () => {
  const b = browser({ url: 'https://shop.example/products/test?utm_source=test&variant=1#details' });
  b.write({ f: 'rechteck', w: 80, l: 150 });
  assert.equal(b.location.searchParams.get('variant'), '2');
  assert.equal(b.location.searchParams.get('breite'), '80');
  assert.equal(b.location.searchParams.get('laenge'), '150');
  assert.equal(b.location.searchParams.get('form'), 'rechteck');
  assert.equal(b.location.searchParams.get('utm_source'), 'test');
  assert.equal(b.location.hash, '#details');
  assert.equal(b.writes[0].state.existing, 1);
  const reload = browser({ url: b.location.href }); reload.restore();
  assert.equal(reload.context.inBreite.value, '80'); assert.equal(reload.context.inLaenge.value, '150');
});

test('Rund behaelt die angebotene Form und den Durchmesser; keine alte Laenge', () => {
  const b = browser({ forms: ['rechteck', 'rund'], url: 'https://shop.example/products/test?laenge=300' });
  b.write({ f: 'rund', w: 200, l: 200 });
  assert.equal(b.location.searchParams.get('laenge'), null);
  const reload = browser({ forms: ['rechteck', 'rund'], url: b.location.href }); reload.restore();
  assert.equal(reload.form(), 'rund'); assert.equal(reload.context.inBreite.value, '200');
});

test('Oval und die gewaehlte freie Bandfarbe werden ausschliesslich aus den angebotenen Werten restauriert', () => {
  const bands = [{ nr: '17', name: 'Sand' }, { name: 'Schwarz' }];
  const b = browser({ art: 'einfassband', forms: ['rechteck', 'oval'], bands });
  b.context.band = b.context.baender[1];
  b.write({ f: 'oval', w: 180, l: 260 });
  const reload = browser({ art: 'einfassband', forms: ['rechteck', 'oval'], bands, url: b.location.href }); reload.restore();
  assert.equal(reload.form(), 'oval'); assert.equal(reload.context.band.name, 'Schwarz');
  const unknown = browser({ bands, url: 'https://shop.example/products/test?band=Erfunden&form=skizze&breite=80&laenge=150' }); unknown.restore();
  assert.equal(unknown.context.band, null); assert.equal(unknown.form(), 'rechteck');
});

test('Leere oder ungueltige Konfiguration raeumt nur die eigenen Parameter auf', () => {
  const b = browser({ url: 'https://shop.example/products/test?variant=2&breite=80&laenge=150&form=oval&band=Sand&preview_theme_id=123#details' });
  b.write(null);
  for (const key of ['breite', 'laenge', 'form', 'band']) assert.equal(b.location.searchParams.get(key), null);
  assert.equal(b.location.searchParams.get('variant'), '2'); assert.equal(b.location.searchParams.get('preview_theme_id'), '123');
  b.write(null); assert.equal(b.writes.length, 1, 'identischer Zustand schreibt nicht erneut');
});

test('URL-Eingaben muessen vollstaendige ganze Zentimeter im Produktbereich sein', () => {
  for (const raw of ['', '-1', '0', '40', '80foo', '80.5', '80,5', '1e2', '1001', '99999999999999999999']) {
    const b = browser({ url: 'https://shop.example/products/test?breite=' + encodeURIComponent(raw) }); b.restore();
    assert.equal(b.context.inBreite.value, '', raw);
  }
  const matte = browser({ min: 40, url: 'https://shop.example/products/test?breite=40&laenge=60' }); matte.restore();
  assert.equal(matte.context.inBreite.value, '40'); assert.equal(matte.context.inLaenge.value, '60');
});

test('Bestehende Kategorie-Masslinks funktionieren und ueberschreiben keine schon eingegebenen Masse', () => {
  const b = browser({ url: 'https://shop.example/products/test?breite=80&laenge=150', width: '100' }); b.restore();
  assert.equal(b.context.inBreite.value, '100'); assert.equal(b.context.inLaenge.value, '150');
});

test('Zurueck-Navigation restauriert den URL-Zustand statt ihn mit den neueren Feldern zu ueberschreiben', () => {
  const b = browser({ forms: ['rechteck', 'rund'], url: 'https://shop.example/products/test?breite=80&laenge=150', width: '200', length: '300' });
  b.restore(true);
  assert.equal(b.context.inBreite.value, '80'); assert.equal(b.context.inLaenge.value, '150'); assert.equal(b.form(), 'rechteck');
  b.location.href = 'https://shop.example/products/test?variant=2'; b.restore(true);
  assert.equal(b.context.inBreite.value, ''); assert.equal(b.context.inLaenge.value, '');
});

test('Zurueck-Navigation gleicht die freie Bandfarbe mit Radios und Beschriftung ab', () => {
  const b = browser({ bands: [{ nr: '17', name: 'Sand' }, { name: 'Schwarz' }], url: 'https://shop.example/products/test?band=17+Sand&breite=80&laenge=150' });
  b.restore(true);
  assert.equal(b.context.band.name, 'Sand'); assert.equal(b.bandRadios[0].checked, true); assert.equal(b.bandRadios[1].checked, false);
  assert.equal(b.bandName.textContent, '17 · Sand');
  b.location.href = 'https://shop.example/products/test?variant=2'; b.restore(true);
  assert.equal(b.context.band, null); assert.equal(b.bandRadios[0].checked, false); assert.equal(b.bandName.textContent, '');
});

test('Raummass kann durch einen URL-Formwert nicht zu Rund werden; fremde Produktbloecke schreiben nicht', () => {
  const b = browser({ art: 'raummass', forms: ['rechteck', 'rund'], url: 'https://shop.example/products/test?form=rund&breite=80&laenge=150' }); b.restore();
  assert.equal(b.form(), 'rechteck');
  const other = browser({ product: '/products/anderes-produkt' }); other.write({ f: 'rechteck', w: 80, l: 150 });
  assert.equal(other.writes.length, 0);
});

const template = read('snippets/tp-cart-mass-url.liquid').replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const liquid = new Liquid();
const item = (properties = {}, service = 'Fertig') => ({
  url: '/products/test?variant=2', variant: { id: 2 }, properties,
  product: { url: '/products/test', metafields: { service: { einfassung: { value: service } } } },
});
const link = line_item => liquid.parseAndRender(template, { line_item });

test('Warenkorb-Rueckweg nimmt das gespeicherte Wunschmass, nie die abgerechnete Mindestflaeche', async () => {
  const url = await link(item({ Form: 'Rechteck', 'Maße': '80 × 150 cm', 'Fläche (abgerechnet)': '3,00 m² (Mindestpreis)' }));
  assert.equal(url, '/products/test?variant=2&breite=80&laenge=150&form=rechteck');
});

test('Warenkorb-Rueckweg fuer Rund, Oval und Bandfarbe', async () => {
  assert.equal(await link(item({ Form: 'Rund', 'Maße': 'Ø 200 cm' })), '/products/test?variant=2&breite=200&form=rund');
  const url = await link(item({ Form: 'Oval', 'Maße': '180 × 260 cm', Bandfarbe: '17 Sand & Natur' }));
  const parsed = new URL(url, 'https://shop.example');
  assert.equal(parsed.searchParams.get('form'), 'oval'); assert.equal(parsed.searchParams.get('band'), '17 Sand & Natur');
});

test('Alte unlesbare Masse, Laengenware und andere Produkte behalten ihren bisherigen Rueckweg', async () => {
  for (const raw of ['', '80foo × 150 cm', '80,5 × 150 cm', '80.5 × 150 cm', '80 × 150.5 cm', '-80 × 150 cm', '0 × 150 cm']) {
    assert.equal(await link(item({ Form: 'Rechteck', 'Maße': raw })), '/products/test?variant=2', raw);
  }
  assert.equal(await link(item({ Form: 'Rechteck', 'Maße': '80 × 150 cm' }, null)), '/products/test?variant=2');
  assert.equal(await link(item({ 'Länge je Stück': '350 cm' })), '/products/test?variant=2');
});

test('Die bestehende Gueltigkeitspruefung entscheidet weiterhin ueber URL und Massmeldung', () => {
  assert.match(source, /massMelden\(gueltig \? \{ f: f, w: b\.wert, l: l\.wert \} : null\)/);
  assert.match(source, /function massMelden\(mass\) \{\s*massUrlAktualisieren\(mass\)/);
  assert.match(source, /massAusUrl\(\);\s*raeumeAufbauen\(\);/);
  assert.match(read('blocks/tp-einfass-konfigurator.liquid'), /"produkt_url": \{\{ product\.url \| json \}\}/);
});
