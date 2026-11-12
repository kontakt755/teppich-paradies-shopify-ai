// Wegvorschlag vor dem Bestellen: dieselbe Regel wie die Bestellmail (wareMail/wareMailsFuer).
import test from 'node:test';
import assert from 'node:assert/strict';
import { wegVorschlag, markiereWegVorschlag } from '../lib/lieferanten.mjs';
import { UNGEKLAERT } from '../lib/umrechnung.mjs';

const kettler = { strasse: 'Teststr. 1', plz: '10115', ort: 'Berlin' };
const stamm = (lieferanten = {}, absender = { kettelservice: kettler }) => ({ lieferanten, absender });
const ware = (extra = {}) => ({ lieferant: 'A', route: 'SUPPLIER_TO_TP', sku: 'X', ausfuehrung: [], ...extra });
const gekettelt = { ausfuehrung: ['Fertigmaß: 160 × 230 cm', 'Einfassung: Gekettelt, umlaufend'] };

test('Standard: Ware geht direkt an den Kunden; ware.lieferung "laden" heisst ueber uns', () => {
  assert.equal(wegVorschlag(ware(), stamm()), 'hersteller');
  assert.equal(wegVorschlag(ware({ lieferant: 'B' }), stamm({ B: { ware: { lieferung: 'laden' } } })), 'uns');
});

test('Gekettelter Massteppich: zum Kettler - ausser der Lieferant kettelt selbst und verschickt direkt (Frage im Dialog)', () => {
  assert.equal(wegVorschlag(ware(gekettelt), stamm()), 'kettler');
  assert.equal(wegVorschlag(ware({ ...gekettelt, route: 'SUPPLIER_DIRECT' }), stamm()), 'kettler');
  assert.equal(wegVorschlag(ware({ ...gekettelt, route: 'SUPPLIER_DIRECT' }), stamm({ A: { ware: { kettelnMoeglich: true } } })), null);
  // Ohne Anschrift des Kettlers greift die Kettler-Regel nicht (wie in der Mail).
  assert.equal(wegVorschlag(ware(gekettelt), stamm({}, null)), 'hersteller');
});

test('Kein Vorschlag: Stammroute sagt es schon, Lagerware, Muster, Eigenleistung, ungeklaerter Lieferant', () => {
  for (const p of [ware({ route: 'SUPPLIER_DIRECT' }), ware({ route: 'SUPPLIER_TO_SITE' }), ware({ lagerware: true }), ware({ istMuster: true }), ware({ eigenleistung: true }), ware({ lieferant: UNGEKLAERT })]) {
    assert.equal(wegVorschlag(p, stamm()), null);
  }
});

test('markiereWegVorschlag setzt das Feld in Auftraegen und Gruppen', () => {
  const m = { auftraege: [{ positionen: [ware(), ware({ lagerware: true })] }], gruppen: [{ positionen: [ware()] }] };
  markiereWegVorschlag(m, stamm());
  assert.equal(m.auftraege[0].positionen[0].wegVorschlag, 'hersteller');
  assert.equal('wegVorschlag' in m.auftraege[0].positionen[1], false);
  assert.equal(m.gruppen[0].positionen[0].wegVorschlag, 'hersteller');
});
