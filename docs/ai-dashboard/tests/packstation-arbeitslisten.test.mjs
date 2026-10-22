import test from 'node:test';
import assert from 'node:assert/strict';
import { viewKundenMusterPacken } from '../ansichten/kunden/muster-packen.mjs';
import { state } from '../kern/zustand.mjs';
import { kunden } from '../ansichten/kunden/gemeinsam.mjs';

const kunde = (nr, bereich) => ({ name: `Testkunde ${nr}`, schluessel: `kunde${nr}`, packSchluessel: `order${nr}`, bereich,
  adresse: {}, bestellungen: [{ orderId: `order${nr}`, orderName: `#TEST${nr}` }], wartetTage: 1,
  muster: [{ lineItemId: `line${nr}`, bestellt: { titel: 'Testmuster', farbe: 'Sand' }, etikett: { serie: 'Test', farbe: 'Sand' }, fehlt: [], stand: 'bestellt', anzahl: 1 }],
  fehlt: [], aufkleber: 2, gepackt: bereich === 'gepackt' ? { zeit: '2026-10-22T08:00:00Z' } : null });

function ansicht(query, liste) {
  globalThis.document ||= { addEventListener() {} };
  state.route.params = new URLSearchParams(query);
  kunden.musterPacken = { verfuegbar: true, kunden: liste };
  return viewKundenMusterPacken();
}

test('Standard zeigt ausschliesslich Packbereit und klappt wartende Umschlaege bei Null nicht auf', () => {
  const html = ansicht('tab=muster', [kunde(1, 'warten'), kunde(2, 'klaeren')]);
  assert.match(html, /Gerade kein Umschlag packbereit/);
  assert.match(html, /Wareneingang nach Partnerladen/);
  assert.doesNotMatch(html, /data-mp-kunde=/);
  assert.equal((html.match(/mp-filterzahl/g) || []).length, 4);
});

test('Arbeitsfilter zeigt nur gewaehlten Bereich; Umschlagdirektlink oeffnet auch andere Bereiche', () => {
  const liste = [kunde(1, 'packen'), kunde(2, 'klaeren'), kunde(3, 'gepackt')];
  const html = ansicht('tab=muster&mpbereich=klaeren', liste);
  assert.match(html, /data-mp-kunde="order2"/);
  assert.doesNotMatch(html, /data-mp-kunde="order1"|data-mp-kunde="order3"/);
  const direkt = ansicht('tab=muster&umschlag=order3', liste);
  assert.match(direkt, /data-mp-kunde="order3"[^>]* open/);
  assert.doesNotMatch(direkt, /data-mp-kunde="order1"/);
  assert.match(direkt, /Großbrief vorbereiten/);
});

test('Suche findet Umschlaege ueber alle Arbeitslisten und erklaert den Umfang', () => {
  const html = ansicht('tab=muster&mpbereich=packen&mpq=TEST2', [kunde(1, 'packen'), kunde(2, 'warten')]);
  assert.match(html, /data-mp-kunde="order2"/);
  assert.doesNotMatch(html, /data-mp-kunde="order1"/);
  assert.match(html, /Suche berücksichtigt alle vier Arbeitslisten/);
});
