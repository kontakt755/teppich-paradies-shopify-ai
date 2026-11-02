import test from 'node:test';
import assert from 'node:assert/strict';
import { lagerEintraegeFuerFarben, lagerMenge } from '../lib/lexikon-musterlager.mjs';

const farben = [{ farbe: 'Greige (097)', schluessel: ['X-097'] }, { farbe: 'Taupe (272)', schluessel: ['X-272'] }];

test('nur Eintraege dieses Produkts, leere fallen weg, Farbe sortiert', () => {
  const r = lagerEintraegeFuerFarben([
    { farbe: 'Taupe (272)', schluessel: ['X-272'] },
    { farbe: 'Fremd', schluessel: ['Y-1'] },
    { farbe: 'Greige (097)', schluessel: ['X-097'] },
    { farbe: 'Leer', schluessel: ['X-097'], leer: true },
  ], farben);
  assert.deepEqual(r.map(e => e.farbe), ['Greige (097)', 'Taupe (272)']);
});

test('Menge: Rest vor Anzahl, Probestueck ohne Rest zeigt die Anzahl', () => {
  assert.equal(lagerMenge({ anzahl: 4, stand: { rest: 3 } }), 3);
  assert.equal(lagerMenge({ anzahl: 1, stand: { rest: null } }), 1);
  assert.equal(lagerMenge({ anzahl: 2 }), 2);
});
