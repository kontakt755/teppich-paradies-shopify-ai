import test from 'node:test';
import assert from 'node:assert/strict';
import { procurementReady, produktgruppe, GRUPPE } from '../lib/ampel.mjs';
import { UNGEKLAERT } from '../lib/umrechnung.mjs';

const rolleOk = { einkauf: { lieferant: 'A', artikelnummer: 'X_1', farbnummer: '1', bestelleinheit: 'lfm', route: 'SUPPLIER_TO_TP' }, produkt: { rollenbreite: 4 } };

test('Rollenware gruen nur mit allen Pflichtfeldern', () => {
  const r = procurementReady(rolleOk);
  assert.equal(r.gruppe, GRUPPE.ROLLE);
  assert.equal(r.ready, true);
  assert.deepEqual(r.fehlend, []);
});

test('Rollenware rot mit konkreten Gruenden', () => {
  const r = procurementReady({ einkauf: { lieferant: UNGEKLAERT, bestelleinheit: 'm2' }, produkt: { rollenbreite: 4 } });
  assert.equal(r.ready, false);
  assert.ok(r.fehlend.some(g => g.includes('einkauf.lieferant')));
  assert.ok(r.fehlend.some(g => g.includes('einkauf.artikelnummer')));
  assert.ok(r.fehlend.some(g => g.includes('einkauf.farbnummer')));
  assert.ok(r.fehlend.some(g => g.includes('muss lfm sein (ist m2)')));
  assert.ok(r.fehlend.some(g => g.includes('einkauf.route')));
});

test('Paketware verlangt qm_pro_paket und Einheit paket', () => {
  const r = procurementReady({ einkauf: { lieferant: 'B', artikelnummer: 'P1', farbnummer: '7', bestelleinheit: 'paket', route: 'SUPPLIER_TO_TP' }, produkt: { qm_pro_paket: 2.18 } });
  assert.equal(r.gruppe, GRUPPE.PAKET);
  assert.equal(r.ready, true);
  const falsch = procurementReady({ gruppe: 'paket', einkauf: { lieferant: 'B', artikelnummer: 'P1', farbnummer: '7', bestelleinheit: 'lfm', route: 'SUPPLIER_TO_TP' }, produkt: {} });
  assert.equal(falsch.ready, false);
  assert.ok(falsch.fehlend.some(g => g.includes('custom.qm_pro_paket')));
  assert.ok(falsch.fehlend.some(g => g.includes('muss paket sein')));
});

test('Leisten: stangenlaenge oder stueck reicht; Farbnummer ist keine Pflicht', () => {
  assert.equal(procurementReady({ einkauf: { lieferant: 'A', artikelnummer: 'L1', route: 'SUPPLIER_TO_TP' }, produkt: { stangenlaenge: 2.5 } }).ready, true);
  assert.equal(procurementReady({ einkauf: { lieferant: 'A', artikelnummer: 'L1', route: 'SUPPLIER_TO_TP', bestelleinheit: 'stueck' }, produkt: {} }).ready, true);
  const rot = procurementReady({ gruppe: 'stueck', einkauf: { lieferant: 'A', artikelnummer: 'L1', route: 'SUPPLIER_TO_TP' }, produkt: {} });
  assert.equal(rot.ready, false);
  assert.ok(rot.fehlend[0].includes('Stangenlaenge'));
});

test('Muster braucht Quellvariante und Musterquelle', () => {
  assert.equal(procurementReady({ istMuster: true, einkauf: { quellvariante: '1', muster_quelle: 'MUSTERLAGER' } }).ready, true);
  const rot = procurementReady({ sku: 'M-X', einkauf: { quellvariante: UNGEKLAERT, muster_quelle: UNGEKLAERT } });
  assert.equal(rot.gruppe, GRUPPE.MUSTER);
  assert.deepEqual(rot.fehlend, ['Musterzuordnung fehlt (einkauf.quellvariante)', 'Musterquelle fehlt (einkauf.muster_quelle)']);
});

test('Dienstleistung: route NO_PROCUREMENT', () => {
  assert.equal(procurementReady({ einkauf: { route: 'NO_PROCUREMENT' } }).ready, true);
  const rot = procurementReady({ gruppe: 'dienstleistung', einkauf: { route: 'SUPPLIER_TO_TP' } });
  assert.equal(rot.ready, false);
});

test('Unbekannte Produktgruppe ist rot mit UNGEKLAERT', () => {
  const r = procurementReady({ einkauf: {}, produkt: {} });
  assert.equal(r.gruppe, UNGEKLAERT);
  assert.equal(r.ready, false);
  assert.match(r.fehlend[0], /UNGEKLAERT/);
  assert.equal(produktgruppe({ gruppe: 'rolle' }), 'rolle');
});
