import test from 'node:test';
import assert from 'node:assert/strict';
import { warteschlange, auftragskarte, suche, kundenblock, statusband, BAND_STATIONEN } from '../lib/auftragsband.mjs';
import { UNGEKLAERT } from '../lib/umrechnung.mjs';
import { AUFTRAG_STATUS } from '../lib/status.mjs';
import { daten, bestellung, zeile, paketzeile } from './auftragsband-fixtures.mjs';

test('warteschlange sortiert aelteste zuerst', () => {
  const w = warteschlange(daten());
  assert.deepEqual(w.map(a => a.name), ['#T1', '#T2', '#T3']);
});

test('SPAETER nach hinten, PROBLEM zuletzt', () => {
  const staende = new Map([
    ['#T1', { status: AUFTRAG_STATUS.PROBLEM }],
    ['#T2', { status: AUFTRAG_STATUS.SPAETER }],
  ]);
  const w = warteschlange(daten(), staende);
  assert.deepEqual(w.map(a => a.name), ['#T3', '#T2', '#T1']);
});

test('abgeschlossene Auftraege fallen aus der Warteschlange', () => {
  const w = warteschlange(daten(), new Map([['#T1', { status: AUFTRAG_STATUS.ABGESCHLOSSEN }]]));
  assert.deepEqual(w.map(a => a.name), ['#T2', '#T3']);
});

test('auftragskarte liefert Kunde, Wert, Zahlung und Datum', () => {
  const k = auftragskarte(bestellung(1, [paketzeile]));
  assert.equal(k.name, '#T1');
  assert.equal(k.kunde.name, 'Test Kundin');
  assert.equal(k.kunde.email, 'test1@example.invalid');
  assert.match(k.kunde.lieferadresse.text, /Teststadt/);
  assert.match(k.kunde.rechnungsadresse.text, /Teststrasse 1/);
  assert.equal(k.bestellwert.text, '499.00 EUR'.replace('.', ','));
  assert.equal(k.zahlung, 'PAID');
  assert.equal(k.datum, '2026-01-05T10:00:00Z');
});

test('fehlende Kundendaten bleiben UNGEKLAERT, werden nicht geraten', () => {
  const b = bestellung(1, [paketzeile]);
  delete b.customer; delete b.email; delete b.phone; delete b.billingAddress;
  const k = kundenblock(b);
  assert.equal(k.email, UNGEKLAERT);
  assert.equal(k.rechnungsadresse.text, UNGEKLAERT);
  assert.equal(k.name, 'Test Kundin'); // aus der Lieferadresse, nicht erfunden
});

test('fehlender Bestellwert bleibt UNGEKLAERT', () => {
  const b = bestellung(1, [paketzeile]);
  delete b.totalPriceSet;
  assert.equal(auftragskarte(b).bestellwert.text, UNGEKLAERT);
});

test('Positionen tragen Grosshaendler-ID, Mengen, Route und Ampel', () => {
  const p = auftragskarte(bestellung(1, [paketzeile])).positionen[0];
  assert.equal(p.grosshaendlerId, 'B-4711');
  assert.equal(p.lieferant, 'B');
  assert.equal(p.menge, 3);
  assert.equal(p.einkaufsmenge.menge, 3);
  assert.equal(p.route.route, 'SUPPLIER_TO_TP');
  assert.equal(p.ampel, 'gruen');
  assert.equal(p.bild, 'https://cdn.example.invalid/test.jpg');
});

test('Position ohne Stammdaten wird rot und behaelt UNGEKLAERT', () => {
  const k = auftragskarte(daten().orders.find(o => o.name === '#T3'));
  const p = k.positionen[0];
  assert.equal(p.grosshaendlerId, UNGEKLAERT);
  assert.equal(p.ampel, 'rot');
  assert.equal(p.einkaufsmenge.menge, UNGEKLAERT);
  assert.ok(p.idGrund);
});

test('Statusband hat sieben Stationen mit erlaubten Farben', () => {
  const k = auftragskarte(bestellung(1, [paketzeile]));
  assert.deepEqual(k.statusband.map(s => s.station), [...BAND_STATIONEN]);
  for (const s of k.statusband) assert.ok(['gruen', 'gelb', 'rot', 'grau'].includes(s.farbe), s.farbe);
  assert.equal(k.statusband[0].farbe, 'gruen');
});

test('Statusband: PROBLEM faerbt die aktuelle Station rot', () => {
  const k = auftragskarte(bestellung(1, [paketzeile]), { staende: new Map([['#T1', { status: AUFTRAG_STATUS.PROBLEM }]]) });
  assert.equal(k.status, AUFTRAG_STATUS.PROBLEM);
  assert.equal(k.statusQuelle, 'lokaler Zustandsspeicher');
  assert.equal(k.statusband.find(s => s.station === 'Pruefung').farbe, 'rot');
});

test('Statusband: VERSAND macht frueheren Stationen gruen', () => {
  const k = auftragskarte(bestellung(1, [paketzeile]), { staende: { '#T1': { status: AUFTRAG_STATUS.VERSAND } } });
  assert.equal(k.statusband.find(s => s.station === 'Einkauf').farbe, 'gruen');
  assert.equal(k.statusband.find(s => s.station === 'Versand').farbe, 'gelb');
  assert.equal(k.statusband.find(s => s.station === 'abgeschlossen').farbe, 'grau');
});

test('suche findet ueber Bestellnummer, Kunde, E-Mail, SKU und Grosshaendler-ID', () => {
  const d = daten();
  assert.deepEqual(suche(d, '#T1').map(t => t.name), ['#T1']);
  assert.equal(suche(d, 'Test Kundin').length, 3);
  assert.deepEqual(suche(d, 'B-4711').map(t => t.name), ['#T1']);
  assert.deepEqual(suche(d, 'TEST-PAKET-1').map(t => t.name), ['#T1']);
  assert.deepEqual(suche(d, 'test2@example.invalid').map(t => t.name), ['#T2']);
});

test('suche findet Farbnummer und Trackingnummer', () => {
  const b = bestellung(1, [paketzeile], { fulfillments: [{ trackingInfo: [{ number: 'TESTTRACK123' }] }] });
  assert.deepEqual(suche({ orders: [b] }, 'testtrack123').map(t => t.name), ['#T1']);
  assert.deepEqual(suche({ orders: [b] }, '0815').map(t => t.name), ['#T1']);
});

test('suche ohne Begriff liefert nichts, unbekannter Begriff auch nicht', () => {
  assert.deepEqual(suche(daten(), ''), []);
  assert.deepEqual(suche(daten(), 'gibtesnicht'), []);
});

test('UNGEKLAERT ist kein Suchtreffer', () => {
  const t = suche(daten(), 'UNGEKLAERT');
  assert.deepEqual(t, []);
});

test('statusband kennt keine unbekannte Farbe bei unbekanntem Status', () => {
  const band = statusband({ checks: { beratung: 'Nein', masspruefung: 'ok' }, ampel: 'gruen' }, 'NEU');
  assert.equal(band.length, 7);
});
