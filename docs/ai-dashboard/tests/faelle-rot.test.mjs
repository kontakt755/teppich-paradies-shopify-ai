// Kunden › Zu tun (#1996, 06.11.2026): roter Rand nur aus Ampelgruenden (f.rot), "sofort" bleibt als Wort;
// der Reiter sagt "6 sofort". Erfundene Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fallKarte } from '../ansichten/kunden/faelle.mjs';

const fall = extra => ({ schluessel: 'email:k@example.test', name: 'Testkunde', email: 'k@example.test', dringend: 0, summe: 0,
  punkte: [{ quelle: 'bestellung', bezug: '#T1', tage: 5, moechte: ['Muster Test'], produkte: [], schritt: { text: 'Muster labeln und an den Kunden schicken', dringend: 0, art: 'auftrag' } }], ...extra });

test('sofortige Routine ohne roten Rand, roter Fall mit; "sofort" steht in beiden', () => {
  const routine = fallKarte(fall({ rot: false }));
  const rot = fallKarte(fall({ rot: true }));
  assert.doesNotMatch(routine, /fall-sofort/);
  assert.match(rot, /class="card fall fall-sofort"/);
  for (const html of [routine, rot]) assert.match(html, /<span class="small muted">sofort<\/span>/);
  assert.doesNotMatch(fallKarte(fall({ rot: true }), { ausgeblendet: true }), /fall-sofort/, 'ausgeblendet bleibt ruhig');
  assert.doesNotMatch(fallKarte(fall({})), /fall-sofort/, 'alter Server ohne Feld: kein Rand');
});
