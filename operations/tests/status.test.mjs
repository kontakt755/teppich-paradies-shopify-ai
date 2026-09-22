import test from 'node:test';
import assert from 'node:assert/strict';
import { AUFTRAG_STATUS, AUFTRAG_STATI, UEBERGAENGE, uebergangErlaubt, sperrtEinkauf, ableiten, beratungGewuenscht } from '../lib/status.mjs';

test('Enum und Uebergangstabelle sind konsistent', () => {
  assert.deepEqual(AUFTRAG_STATI, ['NEU', 'PRUEFUNG', 'BERATUNG_OFFEN', 'MASS_PRUEFUNG_OFFEN', 'FREIGEGEBEN', 'EINKAUF', 'WARENEINGANG', 'VERSAND', 'ABGESCHLOSSEN', 'SPAETER', 'PROBLEM']);
  for (const s of AUFTRAG_STATI) {
    assert.ok(Array.isArray(UEBERGAENGE[s]), s);
    for (const z of UEBERGAENGE[s]) assert.ok(AUFTRAG_STATI.includes(z), `${s} -> ${z}`);
  }
  assert.equal(uebergangErlaubt('NEU', 'PRUEFUNG'), true);
  assert.equal(uebergangErlaubt('NEU', 'VERSAND'), false);
  assert.equal(uebergangErlaubt('ABGESCHLOSSEN', 'PROBLEM'), false);
  assert.equal(uebergangErlaubt('FREIGEGEBEN', 'EINKAUF'), true);
});

test('Beratung, Masspruefung und Problem sperren den Einkauf', () => {
  assert.equal(sperrtEinkauf(AUFTRAG_STATUS.BERATUNG_OFFEN), true);
  assert.equal(sperrtEinkauf(AUFTRAG_STATUS.MASS_PRUEFUNG_OFFEN), true);
  assert.equal(sperrtEinkauf(AUFTRAG_STATUS.PROBLEM), true);
  assert.equal(sperrtEinkauf(AUFTRAG_STATUS.FREIGEGEBEN), false);
});

test('ableiten: Beratung = ja -> BERATUNG_OFFEN mit Kontaktdaten', () => {
  const order = { customAttributes: [{ key: 'Beratung', value: 'ja' }, { key: 'Telefon', value: '0000 000000' }, { key: 'Zeitfenster', value: 'vormittags' }], positionen: [] };
  const r = ableiten(order);
  assert.equal(r.status, AUFTRAG_STATUS.BERATUNG_OFFEN);
  assert.equal(r.beratung.telefon, '0000 000000');
  assert.equal(r.beratung.zeitfenster, 'vormittags');
  assert.equal(r.beratung.anliegen, null);
  assert.equal(beratungGewuenscht({ customAttributes: [{ key: 'Beratung', value: 'nein' }] }), false);
  assert.equal(beratungGewuenscht({ attributes: [{ name: 'beratung', value: 'JA' }] }), true);
});

test('ableiten: Masspruefung schlaegt Beratung; ohne Befund NEU', () => {
  const mass = { customAttributes: [{ key: 'Beratung', value: 'ja' }], positionen: [{ sku: 'X', masspruefung: { status: 'abweichung' } }, { sku: 'Y', masspruefung: { status: 'ok' } }] };
  const r = ableiten(mass);
  assert.equal(r.status, AUFTRAG_STATUS.MASS_PRUEFUNG_OFFEN);
  assert.equal(r.gruende.length, 2);
  assert.match(r.gruende[0], /abweichung: X/);
  assert.equal(ableiten({ positionen: [{ masspruefung: { status: 'ok' } }] }).status, AUFTRAG_STATUS.NEU);
  assert.equal(ableiten({ positionen: [{ masspruefung: { status: 'waise' } }] }).status, AUFTRAG_STATUS.MASS_PRUEFUNG_OFFEN);
  assert.equal(ableiten({}).status, AUFTRAG_STATUS.NEU);
});

test('ableiten dreht einen gesetzten spaeten Status nicht zurueck', () => {
  const r = ableiten({ ops: { status: 'EINKAUF' }, customAttributes: [{ key: 'Beratung', value: 'ja' }] });
  assert.equal(r.status, 'EINKAUF');
  assert.equal(ableiten({ ops: { status: 'PRUEFUNG' } }).status, 'PRUEFUNG');
});
