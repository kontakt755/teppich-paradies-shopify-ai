// Rundgang 2026-10-26, #20: Dasselbe Mass zweimal in den Warenkorb. Shopify
// fasst beide Zeilen zusammen und verdoppelt still die Menge (380 x 420:
// 32 statt 16 m², 1.596,80 EUR). Der Rechner fragt jetzt beim ersten Klick
// auf ein Mass, das schon im Warenkorb liegt, nach; erst der zweite Klick
// bestellt ein weiteres Stueck. Echte Funktionen aus dem Block (vm, wie
// tp-rollware-mindestlaenge).
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

createRequire(import.meta.url)('../../assets/tp-rollware-art.js');
const rechner = readFileSync(new URL('../../blocks/tp-rollware-rechner.liquid', import.meta.url), 'utf8');

function slice(a, b) {
  const s = rechner.indexOf(a);
  const e = rechner.indexOf(b, s);
  assert.ok(s >= 0 && e > s, 'Funktionsgrenzen nicht gefunden: ' + a);
  return rechner.slice(s, e);
}

const tick = () => new Promise((r) => setImmediate(r));

// korb: Zeilen fuer /cart.js oder 'fehler' (Netz weg).
function aufbau(korb) {
  const adds = [];
  const listeners = {};
  const cta = { textContent: '', disabled: false, addEventListener: (t, f) => { listeners[t] = f; }, setAttribute() {}, removeAttribute() {},
    classList: { add() {}, remove() {}, toggle() {} }, getBoundingClientRect: () => ({ top: 10, bottom: 50 }), scrollIntoView() {} };
  const ctaHint = { hidden: true, textContent: '' };
  const context = vm.createContext({
    ART: globalThis.TPRollwareArt, einheitAktiv: 'cm', MIN_BESTELL_CM: 0, MAX_LENGTH_CM: 5000,
    lengthInput: { value: '420' }, wunschInput: { value: '380' }, widthSeg: {},
    fmt: (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    fmtArea: (n) => String(n),
    selectedWidth: () => 380, artMode: () => 'raum', raumMoeglich: () => true, maxRaumBreite: () => 500, WUNSCH_MIN_CM: 50,
    cmExact: false, bahnenAktiv: () => null, laengeAngehoben: () => null,
    target: { id: 4711, price: 4990, available: true }, data: {}, farbBreiten: [400, 500],
    updateExtras: () => ({ items: [], rows: [], sum: 0 }),
    inFlight: false, cta, ctaHint, cartLink: { hidden: true }, errMin: { hidden: true }, errMax: null,
    holzBox: null, markInvalid() {}, zeigeFehlerfeld() {}, calculate() {}, setTimeout() {},
    window: { innerHeight: 800 },
    document: { dispatchEvent() {}, querySelector: () => null }, CustomEvent: class {},
    fetch: async (url, options) => {
      if (url === '/cart.js') {
        if (korb === 'fehler') throw new Error('offline');
        return { ok: true, json: async () => ({ items: korb }) };
      }
      adds.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({}) };
    },
  });
  vm.runInContext(slice('  function getEffectiveLengthCm() {', '\n  var SVG_NS'), context);
  vm.runInContext(slice('  function clearInvalid() {', '\n  // Welches Pflichtfeld fehlt?'), context);
  vm.runInContext("var doppeltFreigabe = '';", context);
  vm.runInContext(slice('  function fehlendesFeld() {', '\n  var target ='), context);
  vm.runInContext(slice("  cta.addEventListener('click', function () {", '\n\n  // Eine direkt geoeffnete Varianten-URL'), context);
  return { adds, ctaHint, klick: async () => { listeners.click(); await tick(); } };
}

const gleicheZeile = { variant_id: 4711, quantity: 16, properties: { 'Art': 'Raummaß', 'Ihre Breite': '380 cm', 'Aus Rolle': '400 cm', 'Gewünschte Länge': '420 cm', 'Fläche (aufgerundet)': '16,00 m²' } };

test('leerer Warenkorb: der erste Klick legt das Stueck hinein', async () => {
  const r = aufbau([]);
  await r.klick();
  assert.equal(r.adds.length, 1);
  assert.equal(r.adds[0].quantity, 16);
  assert.equal(r.ctaHint.hidden, true);
});

test('gleiches Mass liegt schon im Korb: Hinweis statt Bestellung, zweiter Klick bestellt', async () => {
  const r = aufbau([gleicheZeile]);
  await r.klick();
  assert.equal(r.adds.length, 0, 'erster Klick bestellt nicht still ein zweites Stueck');
  assert.equal(r.ctaHint.hidden, false);
  assert.match(r.ctaHint.textContent, /380 × 420 cm\) liegt schon im Warenkorb/);
  await r.klick();
  assert.equal(r.adds.length, 1, 'nach dem Hinweis ist ein zweites Stueck bewusst moeglich');
  // Danach fragt der Rechner beim naechsten Mal wieder.
  await r.klick();
  assert.equal(r.adds.length, 1);
});

test('Zubehoer-Gruppe zaehlt nicht: gleiches Mass mit _Gruppe wird ebenfalls erkannt', async () => {
  const r = aufbau([{ ...gleicheZeile, properties: { ...gleicheZeile.properties, _Gruppe: 'Tabc' } }]);
  await r.klick();
  assert.equal(r.adds.length, 0);
});

test('anderes Mass oder andere Farbe: kein Hinweis', async () => {
  const lang = { ...gleicheZeile, properties: { ...gleicheZeile.properties, 'Gewünschte Länge': '430 cm' } };
  const farbe = { ...gleicheZeile, variant_id: 4712 };
  const r = aufbau([lang, farbe]);
  await r.klick();
  assert.equal(r.adds.length, 1);
});

test('/cart.js nicht erreichbar: Kauf geht ohne Hinweis weiter', async () => {
  const r = aufbau('fehler');
  await r.klick();
  assert.equal(r.adds.length, 1);
});

test('#3 Verlegung steht unter dem Kaufknopf, nicht zwischen Zubehoer und Preis', () => {
  // Inhaber 2026-09-21/2026-10-05: nach den Massen sofort Preis und Kaufknopf.
  const verlegung = rechner.indexOf('<p class="tp-rwc-verlegung"');
  const zubehoer = rechner.indexOf('data-zubehoer hidden');
  const preis = rechner.indexOf('<div class="tp-rwc-calc"');
  const cta = rechner.indexOf('data-cta data-add-to-cart');
  const warenkorbLink = rechner.indexOf('data-cart-link hidden');
  assert.ok(zubehoer > 0 && preis > zubehoer && cta > preis, 'Grundreihenfolge Zubehoer > Preis > Kaufknopf');
  assert.ok(verlegung > warenkorbLink && warenkorbLink > cta, 'Verlegung erst nach Kaufknopf und Warenkorb-Link');
});

test('#56 Bestellfelder sagen Bestellmass, die Zugabe passt zum Raummass-Helfer', () => {
  assert.match(rechner, />Breite des Stücks \(Bestellmaß\)</);
  assert.match(rechner, />Länge des Stücks</);
  // tp-raummass.js rechnet ZUGABE_CM = 10 auf Breite und Laenge (350 -> 360).
  assert.match(rechner, /Zimmermaß gemessen\? Breite und Länge je etwa 10&nbsp;cm zugeben/);
  assert.match(readFileSync(new URL('../../assets/tp-raummass.js', import.meta.url), 'utf8'), /var ZUGABE_CM = 10;/);
});
