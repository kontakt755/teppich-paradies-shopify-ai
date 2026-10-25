import test from 'node:test';
import assert from 'node:assert/strict';
import { blockGruende, mengeText, ausfuehrungKurz, jeKommission, musterSchritt } from '../lib/einkauf-uebersicht.mjs';

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

test('musterSchritt: je Kunde ein gemeinsamer Schritt statt Klick je Muster (Innendienst 15.10.)', () => {
  const m = (id, extra = {}) => ({ orderId: 'O', lineItemId: id, istMuster: true, ...extra });
  const stand = map => p => map[p.lineItemId] || null;
  // Drei Muster beim Lieferanten bestellt: alle drei auf einmal angekommen.
  const drei = [m('A'), m('B'), m('C')];
  const s1 = musterSchritt(drei, stand({ A: 'bestellt', B: 'bestellt', C: 'bestellt' }));
  assert.equal(s1.schritt, 'angekommen');
  assert.deepEqual(s1.positionen.map(p => p.lineItemId), ['A', 'B', 'C']);
  // Eins schon da, zwei noch unterwegs: nur die bestellten.
  assert.deepEqual(musterSchritt(drei, stand({ A: 'geliefert', B: 'bestellt', C: 'bestellt' })).positionen.map(p => p.lineItemId), ['B', 'C']);
  // Alle da: verschicken, alle drei.
  const s2 = musterSchritt(drei, stand({ A: 'geliefert', B: 'geliefert', C: 'geliefert' }));
  assert.equal(s2.schritt, 'verschicken');
  assert.equal(s2.positionen.length, 3);
  assert.equal(s2.uebergabe, false);
  // Lagermuster plus angekommenes Lieferanten-Muster gehen zusammen raus.
  const gemischt = [m('A'), m('L', { musterHerkunft: 'eigen_versand' })];
  assert.deepEqual(musterSchritt(gemischt, stand({ A: 'geliefert' })).positionen.map(p => p.lineItemId), ['A', 'L']);
  // Noch nicht beim Lieferanten bestellt: kein gemeinsamer Schritt (erst bestellen).
  assert.equal(musterSchritt(gemischt, stand({})), null);
  // Persoenlich vorbeibringen: Uebergabe.
  assert.equal(musterSchritt([m('V', { musterHerkunft: 'eigen_vorbei' })], stand({})).uebergabe, true);
  // Schon raus oder Ware: nichts zu tun.
  assert.equal(musterSchritt([m('A')], stand({ A: 'raus' })), null);
  assert.equal(musterSchritt([{ orderId: 'O', lineItemId: 'W' }], stand({ W: 'bestellt' })), null);
  // Direkt vom Lieferanten zum Kunden: kein "angekommen", sondern "raus" fuer alle bestellten.
  const direkt = p => p.lineItemId !== 'C';
  const s3 = musterSchritt(drei.slice(0, 2), stand({ A: 'bestellt', B: 'bestellt' }), { direktVon: direkt });
  assert.equal(s3.schritt, 'direkt');
  assert.deepEqual(s3.positionen.map(p => p.lineItemId), ['A', 'B']);
  // Eins davon kommt doch zu uns: zuerst dessen "angekommen".
  assert.deepEqual(musterSchritt(drei, stand({ A: 'bestellt', B: 'bestellt', C: 'bestellt' }), { direktVon: direkt }).positionen.map(p => p.lineItemId), ['C']);
});
