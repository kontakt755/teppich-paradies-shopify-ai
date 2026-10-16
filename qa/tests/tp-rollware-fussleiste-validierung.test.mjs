// TP-003: Eine ausgewählte, aber unvollständig konfigurierte Fußleiste
// (Checkbox an, keine gültige Länge) darf die Bestellung nicht als reinen
// Teppichkauf durchlassen. Führt die echten Funktionen aus
// blocks/tp-rollware-rechner.liquid in einem Node-VM-DOM-Adapter aus
// (gleicher Extraktionsansatz wie audit/scripts/reproduce-pricing.mjs).
// Kein Netzwerk, kein Shopify-Zugriff, keine Produktdatenänderung.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rollFile = 'blocks/tp-rollware-rechner.liquid';
const rollSource = readFileSync(path.join(root, rollFile), 'utf8');

const markStart = rollSource.indexOf('  function markInvalid(el, on) {');
const markEnd = rollSource.indexOf('\n  function clearInvalid()', markStart);
const extrasStart = rollSource.indexOf('  function updateExtras(w, len, area) {');
const extrasEnd = rollSource.indexOf('\n  var einfassBox', extrasStart);
const missingStart = rollSource.indexOf('  function fehlendesFeld() {');
const missingEnd = rollSource.indexOf('\n  var target =', missingStart);
const clickStart = rollSource.indexOf("  cta.addEventListener('click', function () {");
const clickEnd = rollSource.indexOf('\n\n  // Eine direkt geoeffnete Varianten-URL', clickStart);
assert.ok([markStart, markEnd, extrasStart, extrasEnd, missingStart, missingEnd, clickStart, clickEnd].every((n) => n >= 0),
  'Funktionsgrenzen nicht gefunden - Quelltext hat sich strukturell verändert');

class Element {
  constructor(value = '') {
    this.value = value;
    this.tagName = 'INPUT';
    this.textContent = '';
    this.hidden = false;
    this.checked = false;
    this.disabled = false;
    this.options = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  emit(type, event = {}) { return this.listeners.get(type)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(node) { this.options.push(node); }
  focus(options) { this.focused = true; this.focusOptions = options; }
  scrollIntoView(options) { this.scrolledIntoView = options; }
}

// Leistenprodukt mit Preisstufen (Inhaber 2026-10-16): Option 1 Hoehe,
// Option 2 "fuer Teppich bis X €/m²", Preis = 5,50 + Hoehe x Obergrenze,
// aufgerundet auf ,45/,95. Hier nur zwei Hoehen als Ausschnitt.
const STUFEN_PREISE = { '6 cm': [695, 745, 845, 945, 1195], '10 cm': [795, 895, 1045, 1245, 1595] };
const STUFEN_LEISTE = Object.entries(STUFEN_PREISE).flatMap(([hoehe, preise]) =>
  [20, 30, 45, 65, 100].map((bis, i) => ({
    id: `leiste-${hoehe.replace(' ', '')}-${bis}`, title: `${hoehe} / für Teppich bis ${bis} €/m²`,
    price: preise[i], options: [hoehe, `für Teppich bis ${bis} €/m²`],
  })));

async function rollCase(raw, checked = true, holz = null, dimensions = { w: 400, len: 200 }, opts = {}) {
  const fields = Object.fromEntries(['hoehe', 'an', 'felder', 'meter', 'hint', 'preis', 'umfang']
    .map((s) => [`[data-leiste-${s}]`, new Element()]));
  fields['[data-leiste-hoehe]'].value = opts.hoehe ?? '5 cm';
  fields['[data-leiste-hoehe]'].options = [{}];
  fields['[data-leiste-an]'].checked = checked;
  fields['[data-leiste-meter]'].value = raw;
  fields['[data-leiste-meter]'].setAttribute('data-touched', '1');
  const leisteBox = { querySelector: (s) => fields[s] ?? null };
  const holzFields = Object.fromEntries(['an', 'felder', 'meter', 'variante', 'preis', 'ergebnis']
    .map((s) => [`[data-holz-${s}]`, new Element()]));
  holzFields['[data-holz-an]'].checked = !!holz;
  holzFields['[data-holz-variante]'].tagName = 'SELECT';
  holzFields['[data-holz-meter]'].value = holz?.meters ?? '';
  if (holz?.touched !== false) holzFields['[data-holz-meter]'].setAttribute('data-touched', '1');
  holzFields['[data-holz-variante]'].value = holz?.variant ?? '';
  const holzBox = holz ? { querySelector: (s) => holzFields[s] ?? null } : null;
  const cta = new Element();
  const requests = [];
  const context = vm.createContext({
    leisteBox, haftBox: null, holzBox, formulaExtras: null,
    leisteVarianten: opts.leiste ?? [{ id: 'audit-leiste', title: '5 cm', price: 1095 }],
    holzVarianten: holz ? [{ id: 'audit-holz', title: 'Eiche', price: 1688 }] : [],
    holzLaenge: holz ? 2.5 : 0,
    haftVarianten: [], extrasAllowed: () => true, farbeText: () => 'Sand Hell – 004',
    fmt: (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    fmtArea: (n) => String(n),
    data: { product_title: holz ? 'Vinyl von der Rolle' : 'Piumera Teppichboden 400cm 500cm' },
    inFlight: false, cta, ctaHint: new Element(), cartLink: new Element(),
    target: { id: 60330695491918, price: opts.preis ?? 6590, available: true,
      farbnummer: '004', farbe_intern: 'Sand Hell – 004' },
    cmExact: opts.cmExact ?? false, selectedWidth: () => dimensions.w, laengeAngehoben: () => null, getEffectiveLengthCm: () => dimensions.len,
    artMode: () => opts.art ?? 'meter', lengthInput: new Element('200'), MAX_LENGTH_CM: 1000,
    // Rollenbreiten der Farbe und ihre Meterware (fuer die Raummass-Leiste).
    wIdx: opts.wIdx ?? 1, widths: opts.breiten ?? [400, 500], farbBreiten: opts.breiten ?? [400, 500],
    maxFarbBreite: () => (opts.breiten ?? [400, 500]).at(-1),
    baseOptions: () => ['Sand Hell', '400 cm'],
    byWidth: (b) => b,
    variantFor: (_t, b) => (opts.meterware ?? {})[b] ?? null,
    roundedHundredthsQty: (w, l) => Math.round((w * l) / 100),
    rateOf: (v) => (v ? ((opts.cmExact ?? false) ? parseFloat(v.price) : parseFloat(v.price) / 100) : 0),
    clearInvalid() {}, calculate() {}, setTimeout() {},
    // Bahnen aus dem Raummass-Helfer: hier keine (Vermerk "Zuschnitt" entfaellt).
    bahnenAktiv: () => null,
    document: { dispatchEvent() {}, querySelector: () => null },
    CustomEvent: class {},
    fetch: async (url, options) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({}) };
    },
  });
  vm.runInContext(rollSource.slice(markStart, markEnd), context, { filename: rollFile, timeout: 1000 });
  vm.runInContext(rollSource.slice(extrasStart, extrasEnd), context, { filename: rollFile, timeout: 1000 });
  vm.runInContext(rollSource.slice(missingStart, missingEnd), context, { filename: rollFile, timeout: 1000 });
  const extras = vm.runInContext(`updateExtras(${dimensions.w}, ${dimensions.len}, 8)`, context, { timeout: 1000 });
  vm.runInContext(rollSource.slice(clickStart, clickEnd), context, { filename: rollFile, timeout: 1000 });
  // Raummass-Klick braucht die ganze Wunschmass-Eingabe; dort zaehlt nur das Zubehoer.
  if (!opts.ohneKlick) cta.emit('click');
  await new Promise((resolve) => setImmediate(resolve));
  return {
    requestCount: requests.length,
    payload: requests[0],
    extraItems: JSON.parse(JSON.stringify(extras.items)),
    leisteInvalid: extras.leisteInvalid,
    holzInvalid: extras.holzInvalid,
    holzMeters: holzFields['[data-holz-meter]'].value,
    holzMeterFocused: !!holzFields['[data-holz-meter]'].focused,
    holzColorFocused: !!holzFields['[data-holz-variante]'].focused,
    holzMeterInvalid: holzFields['[data-holz-meter]'].getAttribute('aria-invalid'),
    holzColorInvalid: holzFields['[data-holz-variante]'].getAttribute('aria-invalid'),
    holzColorFocusWay: JSON.parse(JSON.stringify([holzFields['[data-holz-variante]'].scrolledIntoView, holzFields['[data-holz-variante]'].focusOptions])),
    hint: fields['[data-leiste-hint]'].textContent,
    preisText: fields['[data-leiste-preis]'].textContent,
    umfangText: fields['[data-leiste-umfang]'].textContent,
    hidden: leisteBox.hidden,
  };
}

test('Regression: gültige Fußleistenlänge bleibt kaufbar (2 Positionen)', async () => {
  const result = await rollCase('12');
  assert.equal(result.requestCount, 1);
  assert.equal(result.payload.body.items.length, 2);
  assert.equal(result.payload.body.items[0].quantity, 12);
  assert.equal(result.payload.body.items[1].quantity, 8);
  assert.equal(result.leisteInvalid, false);
});

test('Vinyl-Sockelleiste: 18,5 m ergeben acht Stangen im selben Warenkorb-Aufruf', async () => {
  const result = await rollCase('12', false, { meters: '18,5', variant: 'audit-holz' });
  assert.equal(result.requestCount, 1);
  assert.equal(result.holzInvalid, false);
  assert.equal(result.payload.body.items[0].quantity, 8);
  assert.equal(result.payload.body.items[0].properties['Zu Bodenbelag'], 'Vinyl von der Rolle');
});

test('Holzleisten-Autovorschlag: 400 × 205 cm ergeben 12,1 m und fünf Stangen', async () => {
  const result = await rollCase('12', false, { meters: '', variant: 'audit-holz', touched: false }, { w: 400, len: 205 });
  assert.equal(result.holzMeters, '12,1');
  assert.equal(result.requestCount, 1);
  assert.equal(result.payload.body.items[0].quantity, 5);
});

test('Vinyl-Sockelleiste ohne Farbe stoppt den gesamten Warenkorb-Aufruf', async () => {
  const result = await rollCase('12', false, { meters: '18,5', variant: '' });
  assert.equal(result.holzInvalid, true);
  assert.equal(result.requestCount, 0);
  assert.equal(result.holzColorFocused, true);
  assert.equal(result.holzColorInvalid, 'true');
  // Live-Gegenprobe w-061: erst mittig einblenden, sonst bleibt das Feld
  // knapp unter der Oberkante vom klebenden Kopf verdeckt.
  assert.deepEqual(result.holzColorFocusWay, [{ block: 'center' }, { preventScroll: true }]);
});

test('Vinyl-Sockelleiste mit ungültiger Länge fokussiert das Längenfeld', async () => {
  for (const meters of ['abc', '18 m']) {
    const result = await rollCase('12', false, { meters, variant: 'audit-holz' });
    assert.equal(result.requestCount, 0, meters);
    assert.equal(result.holzMeterFocused, true, meters);
    assert.equal(result.holzColorFocused, false, meters);
    assert.equal(result.holzMeterInvalid, 'true', meters);
  }
});

test('Regression: Checkbox aus -> nur Hauptware, kein Block', async () => {
  const result = await rollCase('12', false);
  assert.equal(result.requestCount, 1);
  assert.equal(result.payload.body.quantity, 8);
  assert.equal(result.leisteInvalid, false);
});

test('Ganze Streifen: "2,5" m aus der 4-m-Rolle ergeben einen Streifen = 4 m', async () => {
  const result = await rollCase('2,5');
  assert.equal(result.requestCount, 1);
  assert.equal(result.payload.body.items[0].quantity, 4);
  assert.equal(result.payload.body.items[0].properties['Länge'], '4 m');
  assert.equal(result.payload.body.items[0].properties['Zuschnitt'], '1 Streifen à 4 m');
  assert.equal(result.leisteInvalid, false);
});

test('Preisstufe: 29,90 €/m², 6 cm, 17 m aus der 4-m-Rolle = 5 Streifen, 20 m × 7,45 €', async () => {
  const result = await rollCase('17', true, null, { w: 400, len: 450 }, { leiste: STUFEN_LEISTE, preis: 2990, hoehe: '6 cm' });
  assert.equal(result.requestCount, 1);
  const leiste = result.payload.body.items[0];
  assert.equal(leiste.id, 'leiste-6cm-30');
  assert.equal(leiste.quantity, 20);
  assert.deepEqual(
    { hoehe: leiste.properties['Höhe'], laenge: leiste.properties['Länge'], zuschnitt: leiste.properties['Zuschnitt'] },
    { hoehe: '6 cm', laenge: '20 m', zuschnitt: '5 Streifen à 4 m' });
  assert.match(result.hint, /^17 m werden als 5 Streifen à 4 m = 20 m gefertigt und berechnet/);
  assert.match(result.hint, /7,45 € je Meter inklusive Material/);
  assert.equal(result.preisText, '149,00 €');
});

test('Beispiel Inhaber: 8 m, 10 cm bei 30 €/m² = 2 Streifen à 4 m, 8,95 € je Meter', async () => {
  const result = await rollCase('8', true, null, { w: 400, len: 300 }, { leiste: STUFEN_LEISTE, preis: 3000, hoehe: '10 cm' });
  const leiste = result.payload.body.items[0];
  assert.equal(leiste.id, 'leiste-10cm-30', 'genau 30,00 €/m² bleibt in der Stufe bis 30');
  assert.equal(leiste.quantity, 8);
  assert.match(result.hint, /^2 Streifen à 4 m = 8 m gefertigt/);
});

test('Stufengrenze: 30,01 €/m² springt in die Stufe bis 45', async () => {
  const result = await rollCase('8', true, null, { w: 400, len: 300 }, { leiste: STUFEN_LEISTE, preis: 3001, hoehe: '6 cm' });
  assert.equal(result.payload.body.items[0].id, 'leiste-6cm-45');
});

test('5-m-Rolle: 17 m = 4 Streifen à 5 m = 20 m', async () => {
  const result = await rollCase('17', true, null, { w: 500, len: 400 }, { leiste: STUFEN_LEISTE, preis: 1990, hoehe: '6 cm' });
  const leiste = result.payload.body.items[0];
  assert.equal(leiste.id, 'leiste-6cm-20');
  assert.equal(leiste.quantity, 20);
  assert.equal(leiste.properties['Zuschnitt'], '4 Streifen à 5 m');
});

test('Über 100 €/m²: keine Fußleiste, auch wenn sie angehakt war (fail closed)', async () => {
  const result = await rollCase('17', true, null, { w: 400, len: 450 }, { leiste: STUFEN_LEISTE, preis: 18600, hoehe: '6 cm' });
  assert.equal(result.leisteInvalid, false);
  assert.equal(result.extraItems.length, 0);
  assert.equal(result.requestCount, 1);
  assert.equal(result.payload.body.items, undefined, 'nur der Teppichboden geht in den Warenkorb');
});

test('Raummaß: Stufe nach dem Meterwarepreis der tragenden Rolle, nicht nach dem Raummaß-Aufschlag', async () => {
  // Wunschmass-Variante 61,90 €/m² (Stufe bis 65), Meterware 400 cm 45,90 €/m²
  // (Stufe bis 65), Meterware 500 cm 44,90 (Stufe bis 45). Stueck 450 cm
  // breit -> getragen von der 500er-Rolle.
  const meterware = { 400: { id: 'm400', price: 4590 }, 500: { id: 'm500', price: 4490 } };
  const result = await rollCase('17', true, null, { w: 450, len: 380 }, { leiste: STUFEN_LEISTE, preis: 6190, hoehe: '6 cm', art: 'raum', meterware, ohneKlick: true });
  const leiste = result.extraItems[0];
  assert.equal(leiste.id, 'leiste-6cm-45');
  assert.equal(leiste.properties['Zuschnitt'], '4 Streifen à 5 m');
  const schmal = await rollCase('17', true, null, { w: 350, len: 380 }, { leiste: STUFEN_LEISTE, preis: 6190, hoehe: '6 cm', art: 'raum', meterware, ohneKlick: true });
  assert.equal(schmal.extraItems[0].id, 'leiste-6cm-65', '350 cm breit -> 400er-Rolle, 45,90 €/m²');
  assert.equal(schmal.extraItems[0].quantity, 20);
});

test('cm-genaue Preise (je 0,01 m²): Stufe nach dem m²-Preis', async () => {
  // 0,3290 € je 0,01 m² in Cent = 32,90 €/m² -> Stufe bis 45
  const result = await rollCase('8', true, null, { w: 400, len: 300 }, { leiste: STUFEN_LEISTE, preis: 32.9, cmExact: true, hoehe: '6 cm' });
  assert.equal(result.payload.body.items[0].id, 'leiste-6cm-45');
});

test('Vorschlag ohne Haken: Umfang in ganzen Streifen mit Preis', async () => {
  const result = await rollCase('', false, null, { w: 400, len: 450 }, { leiste: STUFEN_LEISTE, preis: 2990, hoehe: '6 cm' });
  assert.equal(result.umfangText, 'Umfang 17 m · 20 m × 7,45 €');
  assert.equal(result.preisText, '149,00 €');
});

test('TP-003: angehakte Fußleiste ohne Länge blockiert den gesamten Request', async () => {
  for (const raw of ['', '0', '-1']) {
    const result = await rollCase(raw);
    assert.equal(result.requestCount, 0, `raw=${raw}: es darf kein Cart-Request stattfinden`);
    assert.equal(result.leisteInvalid, true, `raw=${raw}`);
    assert.match(result.hint, /Bitte Höhe und Länge/, `raw=${raw}`);
  }
});
