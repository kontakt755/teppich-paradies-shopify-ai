import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeGrossbrief, GROSSBRIEF } from '../lib/muster-grossbrief.mjs';
import { PRODUKTE } from '../../../operations/lib/internetmarke.mjs';

const kunde = { gepackt: { zeit: '2026-10-22' }, adresse: { land: 'Germany' }, adressAufkleber: { fehlt: [] }, fehlt: [] };
const messung = { gramm: '500', dickeMm: '20', laengeMm: '353', breiteMm: '250', vorOrt: true };
const pruefe = (k = kunde, m = messung, heute = '2026-10-22') => pruefeGrossbrief(k, m, { heute });

test('genaue Hoechstmasse, gedrehtes Format und deutsche Dezimalwerte', () => {
  assert.equal(pruefe().passt, true);
  assert.equal(pruefe(kunde, { ...messung, laengeMm: 250, breiteMm: 353, gramm: '499,5' }).passt, true);
  assert.equal(pruefe(kunde, { ...messung, laengeMm: 100, breiteMm: 70 }).passt, true);
  assert.equal(GROSSBRIEF.maxGramm, PRODUKTE.grossbrief.maxGramm);
  assert.equal(GROSSBRIEF.maxDickeMm, PRODUKTE.grossbrief.maxDickeMm);
  assert.equal(PRODUKTE.grossbrief.centPreis, 180);
});

test('zu schwer, zu dick, zu gross oder zu klein gibt keine passende Vorschau', () => {
  for (const aenderung of [{ gramm: 500.01 }, { dickeMm: 20.01 }, { laengeMm: 353.01 }, { breiteMm: 250.01 }, { laengeMm: 69 }, { laengeMm: 99, breiteMm: 70 }]) {
    assert.equal(pruefe(kunde, { ...messung, ...aenderung }).passt, false, JSON.stringify(aenderung));
  }
});

test('fehlende, ungueltige und nicht positive Messungen bleiben offen', () => {
  for (const name of ['gramm', 'dickeMm', 'laengeMm', 'breiteMm']) for (const wert of ['', ' ', null, undefined, 0, -1, Infinity, NaN, '500g', '1e2']) {
    assert.equal(pruefe(kunde, { ...messung, [name]: wert }).passt, false, `${name}: ${wert}`);
  }
});

test('Gepackt ist keine Versandfreigabe: Herkunft und Inland muessen bestaetigt sein', () => {
  for (const k of [null, { ...kunde, gepackt: null }, { ...kunde, adresse: { land: '' } }, { ...kunde, adresse: { land: 'AT' } }, { ...kunde, adressAufkleber: { fehlt: ['Straße'] } }, { ...kunde, fehlt: ['Zuordnung'] }]) assert.equal(pruefe(k).passt, false);
  for (const vorOrt of [false, undefined, 'true']) assert.equal(pruefe(kunde, { ...messung, vorOrt }).passt, false);
});

test('nach Tarifende keine alte Aussage; Pruefung veraendert weder Kunde noch Messungen', () => {
  const vorher = JSON.stringify({ kunde, messung });
  assert.equal(pruefe(kunde, messung, '2026-12-31').passt, true);
  assert.equal(pruefe(kunde, messung, '2027-01-01').passt, false);
  assert.equal(JSON.stringify({ kunde, messung }), vorher);
});
