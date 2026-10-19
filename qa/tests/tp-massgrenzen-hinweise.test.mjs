import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

createRequire(import.meta.url)('../../assets/tp-rollware-art.js');
const ART = globalThis.TPRollwareArt;
const source = readFileSync(new URL('../../blocks/tp-rollware-rechner.liquid', import.meta.url), 'utf8');
const start = source.indexOf('  function syncArtUi() {');
const end = source.indexOf('\n  // Im Raummass sagen', start);
assert.ok(start >= 0 && end > start);

function auswahl({ widths = [400, 500], farbBreiten = widths, raum = true } = {}) {
  const element = () => ({ hidden: false, disabled: false, textContent: '' });
  const chipByWidth = Object.fromEntries(widths.map((w, i) => [w, { input: { ...element(), checked: i === 0 }, label: element() }]));
  const context = vm.createContext({
    ART, widths, farbBreiten, chipByWidth, WUNSCH_MIN_CM: 50, wIdx: 0, raumAnfrage: false,
    artField: element(), widthField: element(), widthStep: element(), widthLabel: element(), lengthNumber: element(),
    artRaumCard: element(), artRadios: [], artSubMeter: element(), artSubRaum: element(),
    artTitleMeter: element(), artTitleRaum: element(), wunschBox: element(), wunschHint: element(),
    root: { querySelector: () => Object.values(chipByWidth).find(c => c.input.checked)?.input },
    baseOptions: () => [], byWidth: w => w, variantFor: (_t, w) => context.verfuegbar.includes(w) ? { price: 1 } : null,
    raumVariant: () => ({}), raumMoeglich: () => context.raumMoeglichWert,
    artMode: () => context.modus, setArt: mode => { context.modus = mode; },
    selectedMeterWidth: () => 400, artTitel() {}, rateOf: () => 1, compareRateOf: () => 0,
    maxRaumBreite: () => ART.maxRaumBreite(context.farbBreiten),
    verfuegbar: farbBreiten, raumMoeglichWert: raum, modus: raum ? 'raum' : 'meter',
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, sync: () => context.syncArtUi() };
}

test('Raumbreite zeigt die aktuelle 495-cm-Grenze bereits ohne Eingabe', () => {
  const p = auswahl();
  p.sync();
  assert.equal(p.context.wunschBox.hidden, false);
  assert.equal(p.context.wunschHint.hidden, false);
  assert.equal(p.context.wunschHint.textContent, 'Breite von 50 bis 495 cm.');
  assert.equal(ART.pruefeBreite(495, 50, 495), '');
  assert.match(ART.pruefeBreite(500, 50, 495), /495 cm/);
});

test('Farbwechsel aktualisiert den sichtbaren Hinweis auf die vorhandenen Rollen', () => {
  const p = auswahl();
  p.sync();
  p.context.verfuegbar = [400];
  p.sync();
  assert.equal(p.context.wunschHint.textContent, 'Breite von 50 bis 395 cm.');
  assert.equal(p.context.chipByWidth[500].input.disabled, true);
  p.context.verfuegbar = [400, 500];
  p.sync();
  assert.equal(p.context.wunschHint.textContent, 'Breite von 50 bis 495 cm.');
});

test('Meterware und Farbe ohne Raummaß zeigen keinen Raumbreitenhinweis', () => {
  const p = auswahl();
  p.context.modus = 'meter';
  p.sync();
  assert.equal(p.context.wunschBox.hidden, true);
  p.context.modus = 'raum';
  p.context.raumMoeglichWert = false;
  p.sync();
  assert.equal(p.context.modus, 'meter');
  assert.equal(p.context.wunschBox.hidden, true);
});

test('Ohne passende Rolle erscheint keine unmoegliche Massspanne', () => {
  const p = auswahl({ farbBreiten: [] });
  p.sync();
  assert.equal(p.context.wunschHint.textContent, 'Für diese Farbe ist kein Raummaß verfügbar.');
});

test('Grenzhinweise sind den jeweiligen Eingabefeldern als Beschreibung zugeordnet', () => {
  assert.match(source, /aria-describedby="tp-rwc-wb-grenze-\{\{ tp_rc_id \}\} tp-rwc-wb-echo-/);
  assert.match(source, /aria-describedby="tp-rwc-len-grenze-\{\{ tp_rc_id \}\} tp-rwc-len-echo-/);
  assert.equal((source.match(/data-wunsch-hint/g) || []).length, 2);
  const hint = source.match(/<p[^>]+data-wunsch-hint[^>]*>/)?.[0];
  assert.ok(hint && !hint.includes('hidden'));
});

const lengthStart = source.indexOf('      <p class="tp-rwc-note" id="tp-rwc-len-grenze-');
const lengthEnd = source.indexOf('</p>', lengthStart) + 4;
const engine = new Liquid();
const laenge = (max, min = 0) => engine.parseAndRender(source.slice(lengthStart, lengthEnd), {
  tp_rc_id: 'test', tp_rc_max_laenge_cm: max, tp_rc_min_laenge_cm: min,
});

test('Laengenhinweis verwendet das bestehende Produkt- oder Bestandslimit', async () => {
  assert.match(await laenge(5000), /Länge von 100 bis 5000 cm\./);
  assert.match(await laenge(1800), /Länge von 100 bis 1800 cm\./);
  assert.match(await laenge(175), /Länge von 100 bis 175 cm\./);
});

test('Mindestbestellmenge bleibt eigener Hinweis; nicht bestellbarer Rest hat keine falsche Spanne', async () => {
  assert.match(await laenge(2000, 800), /Länge bis 2000 cm\./);
  assert.doesNotMatch(await laenge(2000, 800), /von 100/);
  assert.match(await laenge(25), / hidden>/);
  assert.doesNotMatch(await laenge(25), /Länge/);
});
