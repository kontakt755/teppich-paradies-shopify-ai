import test from 'node:test';
import assert from 'node:assert/strict';
import { schnittJeBezahlter } from '../lib/kennzahlen.mjs';

// Kachel "Ø je bezahlter Bestellung" auf Heute. Nur erfundene Zahlen: 10 Bestellungen, davon 8
// kostenlose Muster - frueher wurde der Umsatz durch alle 10 geteilt.

test('Schnitt nur ueber Bestellungen mit Betrag - auch bei einem Export ohne mitBetrag', () => {
  assert.equal(schnittJeBezahlter({ bestellungen: 10, kostenlos: 8, umsatz: 300, durchschnitt: 30 }), 150);
  assert.equal(schnittJeBezahlter({ bestellungen: 20, kostenlos: 17, umsatz: 100 }), 33.33);
  // Neuer Export: mitBetrag gewinnt.
  assert.equal(schnittJeBezahlter({ bestellungen: 10, kostenlos: 8, mitBetrag: 2, umsatz: 300 }), 150);
});

test('Nur kostenlose Muster: 0 (die Kachel zeigt einen Strich); ganz alter Export: der gelieferte Schnitt', () => {
  assert.equal(schnittJeBezahlter({ bestellungen: 3, kostenlos: 3, umsatz: 0 }), 0);
  assert.equal(schnittJeBezahlter({ bestellungen: 4, umsatz: 400, durchschnitt: 100 }), 100);
  assert.equal(schnittJeBezahlter({ bestellungen: 0, umsatz: 0 }), 0);
  assert.equal(schnittJeBezahlter(null), null);
  assert.equal(schnittJeBezahlter({ bestellungen: 2 }), null);
});
