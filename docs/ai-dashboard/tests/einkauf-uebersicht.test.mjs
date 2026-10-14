import test from 'node:test';
import assert from 'node:assert/strict';
import { blockGruende, mengeText, ausfuehrungKurz, jeKommission } from '../lib/einkauf-uebersicht.mjs';

// Nur erfundene Daten.
const pos = (extra = {}) => ({ titel: 'Testvelours Teppichboden', farbe: 'Sand', grosshaendlerId: 'TV-100', bestellmenge: { menge: 4, text: '4,00 lfm × 4,00 m' }, ...extra });

test('blockGruende: Artikelnummer und Menge halten auf, fehlender Link nicht', () => {
  assert.deepEqual(blockGruende(pos()), []);
  assert.deepEqual(blockGruende(pos({ lieferantUrl: 'UNGEKLAERT' })), []);
  assert.deepEqual(blockGruende(pos({ grosshaendlerId: 'UNGEKLAERT', bestellmenge: { menge: 'UNGEKLAERT', grund: 'Paketinhalt fehlt' } })),
    ['Artikelnummer beim Lieferanten fehlt', 'Menge ungeklärt (Paketinhalt fehlt)']);
  assert.deepEqual(blockGruende(pos({ bestellmenge: { menge: 'UNGEKLAERT' } })), ['Menge ungeklärt']);
  // Muster werden ueber die Bestellmail mit eigener Pruefung bestellt.
  assert.deepEqual(blockGruende(pos({ istMuster: true, grosshaendlerId: 'UNGEKLAERT' })), []);
});

test('mengeText: ungeklaert und leer ergeben keinen Text', () => {
  assert.equal(mengeText(pos()), '4,00 lfm × 4,00 m');
  assert.equal(mengeText(pos({ bestellmenge: { menge: 'UNGEKLAERT', text: 'UNGEKLAERT' } })), '');
  assert.equal(mengeText({}), '');
});

test('ausfuehrungKurz: Fertigmass und Einfassung bleiben, Rollenbreite faellt weg', () => {
  assert.deepEqual(ausfuehrungKurz(pos({ ausfuehrung: ['Fertigmaß: 200 × 300 cm (Rechteck)', 'Zuschnitt aus Rollenbreite: 400 cm', 'Einfassung: Gekettelt, umlaufend 10,00 m'] })),
    ['Fertigmaß: 200 × 300 cm (Rechteck)', 'Einfassung: Gekettelt, umlaufend 10,00 m']);
  assert.deepEqual(ausfuehrungKurz(pos()), []);
});

test('jeKommission: Muster einer Bestellung zusammen, laengste Wartezeit zuerst, schlimmste Stufe zaehlt', () => {
  const e = (orderId, wartetage, warnstufe = null) => ({ pos: { orderId, orderName: `#${orderId}` }, wartetage, warnstufe });
  const g = jeKommission([e('1', 2), e('2', 9, 'warn'), e('1', 3), e('2', 15, 'crit'), e('3', null)]);
  assert.deepEqual(g.map(k => [k.orderName, k.positionen.length, k.wartetage, k.warnstufe]),
    [['#2', 2, 15, 'crit'], ['#1', 2, 3, null], ['#3', 1, null, null]]);
});
