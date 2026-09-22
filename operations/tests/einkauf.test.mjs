import test from 'node:test';
import assert from 'node:assert/strict';
import { gruppieren, einkaufsId, bestellungAusGruppe, lieferzielSchluessel, EINKAUF_STATUS, EINKAUF_UEBERGAENGE, einkaufUebergangErlaubt } from '../lib/einkauf.mjs';
import { UNGEKLAERT } from '../lib/umrechnung.mjs';

const pos = (orderId, lieferant, route, extra = {}) => ({ orderId, orderName: `#T${orderId}`, lineItemId: `li-${orderId}-${Math.random().toString(36).slice(2, 6)}`, lieferant, route, ...extra });

test('Gruppierung nach Lieferant, Route und Lieferziel; Lagerware verschiedener Kunden wird gebuendelt', () => {
  const g = gruppieren([
    pos(1, 'A', 'SUPPLIER_TO_TP'), pos(2, 'A', 'SUPPLIER_TO_TP'), pos(3, 'A', 'SUPPLIER_TO_TP'),
    pos(1, 'B', 'SUPPLIER_TO_TP'),
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].positionen.length, 3);
  assert.equal(g[0].lieferziel, 'TP');
  assert.equal(g[1].lieferant, 'B');
});

test('Direktversand-Positionen verschiedener Kunden landen nie in einer Gruppe', () => {
  const g = gruppieren([
    pos(10, 'A', 'SUPPLIER_DIRECT'), pos(10, 'A', 'SUPPLIER_DIRECT'),
    pos(11, 'A', 'SUPPLIER_DIRECT'),
    pos(12, 'A', 'SUPPLIER_TO_SITE'),
    pos(13, 'A', 'SUPPLIER_TO_TP'), pos(14, 'A', 'SUPPLIER_TO_TP'),
  ]);
  assert.equal(g.length, 4);
  assert.deepEqual(g.map(x => x.lieferziel), ['KUNDE:10', 'KUNDE:11', 'SITE:12', 'TP']);
  assert.equal(g[0].positionen.length, 2);
  assert.throws(() => lieferzielSchluessel({ route: 'SUPPLIER_DIRECT' }), /ohne orderId/);
});

test('25 Positionen -> 5 Gruppen (07-TESTS.md)', () => {
  const liste = [];
  for (let i = 1; i <= 10; i++) liste.push(pos(i, 'A', 'SUPPLIER_TO_TP'));
  for (let i = 11; i <= 20; i++) liste.push(pos(i, 'B', 'SUPPLIER_TO_TP'));
  for (let i = 21; i <= 23; i++) liste.push(pos(i, 'A', 'SAMPLE_SUPPLIER'));
  liste.push(pos(24, 'A', 'SUPPLIER_DIRECT'));
  liste.push(pos(25, 'B', 'SUPPLIER_DIRECT'));
  assert.equal(gruppieren(liste).length, 5);
});

test('Einkaufs-ID Format TP-EK-JJMMTT-<KUERZEL>-NNN, nur Pseudonyme', () => {
  assert.equal(einkaufsId({ datum: '2026-09-22T10:00:00Z', kuerzel: 'A', laufnummer: 7 }), 'TP-EK-260922-A-007');
  assert.throws(() => einkaufsId({ datum: '2026-09-22', kuerzel: 'Klarname', laufnummer: 1 }), /Pseudonym/);
  assert.throws(() => einkaufsId({ datum: '2026-09-22', kuerzel: 'A', laufnummer: 1000 }));
  assert.throws(() => einkaufsId({ datum: 'kein datum', kuerzel: 'A', laufnummer: 1 }), /datum/);
});

test('bestellungAusGruppe erzeugt Positionen mit allen Spalten und markiert UNGEKLAERT', () => {
  const g = gruppieren([
    pos(1, 'A', 'SUPPLIER_TO_TP', { artikelnummer: 'CVEXPGR04_333', farbe: 'Farbe 333', farbnummer: '333', breite: '4,00 m', menge: 6.4, einheit: 'lfm', bemerkung: 'Kunde: Test Kundin, Raummass' }),
    pos(2, 'A', 'SUPPLIER_TO_TP', { einkauf: { artikelnummer: 'P1', farbnummer: '7', bestelleinheit: 'paket' }, menge: 16 }),
  ]);
  const b = bestellungAusGruppe(g[0], { datum: '2026-09-22T00:00:00Z', laufnummer: 1 });
  assert.equal(b.id, 'TP-EK-260922-A-001');
  assert.equal(b.status, EINKAUF_STATUS.OFFEN);
  assert.equal(b.lieferziel.typ, 'TP');
  assert.equal(b.positionen.length, 2);
  const p1 = b.positionen[0];
  assert.equal(p1.artikelnummer, 'CVEXPGR04_333');
  assert.equal(p1.farbnummer, '333');
  assert.equal(p1.breite, '4,00 m');
  assert.equal(p1.menge, 6.4);
  assert.equal(p1.einheit, 'lfm');
  assert.equal(p1.kundenreferenz, '#T1');
  assert.equal(p1.lieferziel, 'TP');
  assert.equal(p1.bemerkung, 'Kunde: Test Kundin, Raummass');
  const p2 = b.positionen[1];
  assert.equal(p2.artikelnummer, 'P1');
  assert.equal(p2.einheit, 'paket');
  assert.equal(p2.farbe, UNGEKLAERT);
  assert.equal(p2.breite, UNGEKLAERT);
  assert.ok(b.ungeklaert.includes('Position 2: farbe'));
  assert.ok(b.ungeklaert.includes('Position 1: procurementId'));
});

test('Direktversand-Gruppe traegt die Zieladresse nur aus lieferziele, sonst UNGEKLAERT', () => {
  const g = gruppieren([pos(42, 'A', 'SUPPLIER_DIRECT', { menge: 1 })]);
  const ohne = bestellungAusGruppe(g[0], { datum: '2026-09-22', laufnummer: 2 });
  assert.equal(ohne.lieferziel.typ, 'KUNDE');
  assert.equal(ohne.lieferziel.adresse, UNGEKLAERT);
  const mit = bestellungAusGruppe(g[0], { datum: '2026-09-22', laufnummer: 2, lieferziele: { 'KUNDE:42': { name: 'Test Kundin', zip: '00000', city: 'Teststadt' } } });
  assert.equal(mit.lieferziel.name, 'Test Kundin');
});

test('Einkaufsstatus-Enum und Uebergaenge', () => {
  assert.deepEqual(Object.keys(EINKAUF_STATUS), ['OFFEN', 'FREIGEGEBEN', 'BESTELLT', 'BESTAETIGT', 'TEIL_GELIEFERT', 'GELIEFERT', 'STORNIERT', 'PROBLEM']);
  assert.equal(einkaufUebergangErlaubt('OFFEN', 'FREIGEGEBEN'), true);
  assert.equal(einkaufUebergangErlaubt('OFFEN', 'GELIEFERT'), false);
  assert.equal(einkaufUebergangErlaubt('GELIEFERT', 'OFFEN'), false);
  for (const s of Object.keys(EINKAUF_STATUS)) assert.ok(Array.isArray(EINKAUF_UEBERGAENGE[s]));
});
