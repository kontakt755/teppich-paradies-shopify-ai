import test from 'node:test';
import assert from 'node:assert/strict';
import { auswahlSignatur, fertigeSeiten, weiterAbFuer, weiterAbSchaetzen, weiterNachAbbruch } from '../lib/druckliste.mjs';

// Nur ausgedachte Aufkleber (Buchstabenpaare wie am 06.11. auf der 50-x-20-Rolle).
const paar = t => ({ art: 'frei', zeilen: [t], serie: t, farbe: '', sku: '', url: '', technik: [], fehlt: [] });
const paare = ['A B', 'C D', 'E F', 'G H', 'I J', 'K L', 'M N', 'O P', 'Q R', 'S T', 'U V', 'W X', 'Y Z'].map(paar);

test('Weiterdrucken: Abbruch beim 13. von 13 setzt beim 13. wieder an', () => {
  // 12 Seiten gingen vollstaendig raus, die 13. warf "Print error 6: DataError".
  assert.equal(weiterAbSchaetzen({ gesendet: 12, gedruckt: null, gesamt: 13 }), 12);
  const weiter = { ab: 12, signatur: auswahlSignatur(paare) };
  assert.equal(weiterAbFuer(paare, weiter), 12);
  assert.deepEqual(paare.slice(weiterAbFuer(paare, weiter)).map(e => e.serie), ['Y Z']);
});

test('Weiterdrucken: lieber einer doppelt als einer zu wenig, nichts bei Fehler vor dem ersten oder nach dem letzten', () => {
  // Der Drucker meldet weniger fertige Seiten als gesendet: es zaehlt die kleinere Zahl.
  assert.equal(weiterAbSchaetzen({ gesendet: 12, gedruckt: 10, gesamt: 13 }), 10);
  // Mehr "gedruckt" als gesendet gibt es nicht.
  assert.equal(weiterAbSchaetzen({ gesendet: 5, gedruckt: 9, gesamt: 13 }), 5);
  assert.equal(weiterAbSchaetzen({ gesendet: 0, gesamt: 13 }), 0);
  assert.equal(weiterAbSchaetzen({ gesendet: 13, gedruckt: 13, gesamt: 13 }), 0);
  assert.equal(weiterAbSchaetzen({}), 0);
});

test('Fertige Seiten: die laufende zaehlt erst, wenn Druck und Vorschub bei 100 % sind', () => {
  assert.equal(fertigeSeiten({ page: 1, pagePrintProgress: 0, pageFeedProgress: 0 }), 0);
  assert.equal(fertigeSeiten({ page: 7, pagePrintProgress: 100, pageFeedProgress: 40 }), 6);
  assert.equal(fertigeSeiten({ page: 7, pagePrintProgress: 100, pageFeedProgress: 100 }), 7);
  assert.equal(fertigeSeiten(), 0);
});

test('Weiterdrucken gilt nur fuer dieselbe Auswahl in derselben Reihenfolge', () => {
  const weiter = { ab: 12, signatur: auswahlSignatur(paare) };
  // Text geaendert, Motiv abgewaehlt oder Reihenfolge anders: wieder alles drucken.
  assert.equal(weiterAbFuer([...paare.slice(0, 12), paar('Y Z!')], weiter), 0);
  assert.equal(weiterAbFuer(paare.slice(1), weiter), 0);
  assert.equal(weiterAbFuer([paare[1], paare[0], ...paare.slice(2)], weiter), 0);
  // Ungueltige Startpunkte fallen weg.
  assert.equal(weiterAbFuer(paare, null), 0);
  assert.equal(weiterAbFuer(paare, { ...weiter, ab: 0 }), 0);
  assert.equal(weiterAbFuer(paare, { ...weiter, ab: 13 }), 0);
  // Kopien desselben Motivs: die Anzahl gehoert zur Kennung.
  const kopien = [paar('A'), paar('A'), paar('A')];
  assert.equal(weiterAbFuer(kopien.slice(0, 2), { ab: 1, signatur: auswahlSignatur(kopien) }), 0);
  assert.equal(weiterAbFuer(kopien, { ab: 1, signatur: auswahlSignatur(kopien) }), 1);
});

test('Zweiter Abbruch beim Weiterdrucken: die Grenze rueckt nur bei lueckenlosem Anschluss mit', () => {
  // Erster Lauf: Abbruch nach 12. Weiter ab 12 bricht nach 3 weiteren ab: jetzt fehlt sicher erst ab 15.
  const erst = weiterNachAbbruch({ basisAb: 0, rest: 12, alt: null, signatur: 's' });
  assert.deepEqual(erst, { ab: 12, signatur: 's', geschaetzt: 12 });
  assert.deepEqual(weiterNachAbbruch({ basisAb: 12, rest: 3, alt: erst, signatur: 's' }), { ab: 15, signatur: 's', geschaetzt: 15 });
  // Wer ab 14 statt 12 weitermacht, laesst 12 und 13 aus: die Grenze bleibt bei 12.
  assert.deepEqual(weiterNachAbbruch({ basisAb: 14, rest: 2, alt: erst, signatur: 's' }), { ab: 16, signatur: 's', geschaetzt: 12 });
  // Ein veralteter Stand aus einer anderen Auswahl zaehlt nicht (basisAb 0).
  assert.deepEqual(weiterNachAbbruch({ basisAb: 0, rest: 5, alt: { geschaetzt: 2 }, signatur: 't' }), { ab: 5, signatur: 't', geschaetzt: 5 });
  assert.equal(weiterNachAbbruch({ basisAb: 3, rest: 0, alt: erst }), null);
});
