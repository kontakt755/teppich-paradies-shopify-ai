// Warenkennzahl oben auf der Shop-Übersicht (Prüfung 05.11.). Nur erfundene Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { warenkennzahlBlock, veraenderungText } from '../ansichten/heute/warenkennzahl.mjs';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const DATEN = {
  verfuegbar: true,
  zeitraeume: {
    7: { umsatz: 1050, waehrung: 'EUR', ware: { umsatz: 1000, kunden: 4, bestellungen: 5 }, muster: { bestellungen: 12, kunden: 9 } },
    30: { umsatz: 4100, waehrung: 'EUR', ware: { umsatz: 4000, kunden: 11, bestellungen: 12 }, muster: { bestellungen: 40, kunden: 30 } },
  },
  vorwoche: { ware: { umsatz: 800, kunden: 3, bestellungen: 3 }, muster: { bestellungen: 8, kunden: 7 } },
};

test('zeigt Warenumsatz ohne Versand, Warenkunden, Vorwoche und Muster getrennt', () => {
  const t = text(warenkennzahlBlock(DATEN));
  assert.match(t, /1\.000 € Warenumsatz, 7 Tage/);
  assert.match(t, /4 Warenkunden/);
  assert.match(t, /Bezahlt, brutto, ohne Versand und Muster/);
  assert.match(t, /Vorwoche 800 € \(\+25 %\) · 3 Warenkunden/);
  assert.match(t, /30 Tage 4\.000 €/);
  assert.match(t, /Muster getrennt: 12 Bestellungen in 7 Tagen/);
  assert.doesNotMatch(t, /1\.050/, 'der Umsatz mit Versand steht hier nicht');
});

test('Einzahl bei einem Warenkunden', () => {
  const d = structuredClone(DATEN);
  d.zeitraeume[7].ware.kunden = 1;
  assert.match(text(warenkennzahlBlock(d)), /1 Warenkunde\b/);
});

test('ehrliche Zustaende statt geratener Zahlen', () => {
  assert.match(text(warenkennzahlBlock(null)), /Warenumsatz lädt/);
  assert.match(text(warenkennzahlBlock({ verfuegbar: false, hinweis: 'Noch kein Export.' })), /Noch kein Export/);
  // Alter Export ohne `ware`: `umsatz` enthaelt Versand und duerfte nicht als Warenumsatz erscheinen.
  const alt = text(warenkennzahlBlock({ verfuegbar: true, zeitraeume: { 7: { umsatz: 500, waehrung: 'EUR' } } }));
  assert.match(alt, /erscheint mit dem nächsten Datenabruf/);
  assert.doesNotMatch(alt, /500/);
});

test('ohne Vorwoche im Export keine Vergleichszeile', () => {
  assert.doesNotMatch(text(warenkennzahlBlock({ ...DATEN, vorwoche: null })), /Vorwoche/);
});

test('veraenderungText: Vorzeichen, gleich und keine Division durch null', () => {
  assert.equal(veraenderungText(150, 100), ' (+50 %)');
  assert.equal(veraenderungText(50, 100), ' (−50 %)');
  assert.equal(veraenderungText(100, 100), ' (±0 %)');
  assert.equal(veraenderungText(100, 0), '');
});
