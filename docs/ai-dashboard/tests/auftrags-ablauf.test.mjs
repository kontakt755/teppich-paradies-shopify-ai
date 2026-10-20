import test from 'node:test';
import assert from 'node:assert/strict';
import { auftragsAblauf, fehlendeAngaben } from '../lib/auftrags-ablauf.mjs';

// Erfundene Testdaten - keine Kunden, keine Lieferantennamen.
const pos = (id, extra = {}) => ({ orderId: 'o1', orderName: '#T1', lineItemId: id, titel: `Artikel ${id}`, farbe: 'Grau', grosshaendlerId: `A-${id}`, bestellmenge: { menge: 1 }, ...extra });
const daten = () => ({
  gruppen: [
    { lieferant: 'A', positionen: [pos('a1'), pos('a2'), pos('x1', { orderId: 'o2' })] },
    { lieferant: 'B', positionen: [pos('b1', { grosshaendlerId: 'UNGEKLAERT' })] },
    { lieferant: 'UNGEKLAERT', positionen: [pos('u1')] },
  ],
  musterGruppen: [{ lieferant: 'A', positionen: [pos('m1', { istMuster: true })] }],
});
const stand = map => p => (map[p.lineItemId] ? { status: map[p.lineItemId], bestelltAm: '2026-10-19T08:00:00Z' } : null);
const schritt = ab => Object.fromEntries(ab.schritte.map(s => [s.key, s.stand]));

test('neuer Auftrag: Schritt "vorbereiten", je Lieferant und Art eine Nachricht, Ungeklaertes getrennt', () => {
  const ab = auftragsAblauf({ id: 'o1' }, daten());
  assert.equal(ab.jetzt, 'vorbereiten');
  assert.deepEqual(schritt(ab), { eingegangen: 'fertig', vorbereiten: 'jetzt', bestellt: 'offen', lieferung: 'offen', erledigt: 'offen' });
  assert.deepEqual(ab.lieferanten.map(g => `${g.lieferant}|${g.art}|${g.positionen.length}`), ['A|muster|1', 'A|ware|2']);
  // Fremder Auftrag (o2) zaehlt nicht mit.
  assert.equal(ab.positionen.length, 5);
  assert.deepEqual(ab.ungeklaert.map(x => x.pos.lineItemId).sort(), ['b1', 'u1']);
  assert.deepEqual(ab.ungeklaert.find(x => x.pos.lineItemId === 'u1').fehlt, ['Lieferant ungeklärt']);
});

test('fehlende Angaben in Alltagssprache, nichts geraten', () => {
  assert.deepEqual(fehlendeAngaben({ grosshaendlerId: 'UNGEKLAERT', bestellmenge: { menge: 'UNGEKLAERT' } }, 'A'),
    ['Artikelnummer beim Lieferanten fehlt', 'Bestellmenge ungeklärt']);
  assert.deepEqual(fehlendeAngaben(pos('ok'), 'A'), []);
});

test('alles bestellt -> Schritt Lieferung, Datum der Bestellung bekannt', () => {
  const d = { gruppen: [{ lieferant: 'A', positionen: [pos('a1'), pos('a2')] }] };
  const ab = auftragsAblauf({ id: 'o1' }, d, stand({ a1: 'bestellt', a2: 'geliefert' }));
  assert.equal(ab.jetzt, 'lieferung');
  assert.equal(schritt(ab).bestellt, 'fertig');
  assert.equal(ab.unterwegs.length, 1);
  assert.equal(ab.beiUns.length, 1);
  assert.equal(ab.bestelltAm, '2026-10-19T08:00:00Z');
});

test('teilweise bestellt bleibt bei "vorbereiten"; an Kunden raus -> erledigt ist dran', () => {
  const d = { gruppen: [{ lieferant: 'A', positionen: [pos('a1'), pos('a2')] }] };
  assert.equal(auftragsAblauf({ id: 'o1' }, d, stand({ a1: 'bestellt' })).jetzt, 'vorbereiten');
  assert.equal(auftragsAblauf({ id: 'o1' }, d, stand({ a1: 'raus', a2: 'raus' })).jetzt, 'erledigt');
});

test('Muster aus eigenem Bestand brauchen keine Lieferantenbestellung', () => {
  const d = { musterGruppen: [{ lieferant: 'A', positionen: [pos('m1', { istMuster: true, musterHerkunft: 'eigen_versand' })] }] };
  const ab = auftragsAblauf({ id: 'o1' }, d);
  assert.equal(ab.lieferanten.length, 0);
  assert.equal(ab.ungeklaert.length, 0);
});
