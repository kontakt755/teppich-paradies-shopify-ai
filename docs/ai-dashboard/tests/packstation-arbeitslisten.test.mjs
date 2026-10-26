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

test('Standard zeigt alle offenen Umschlaege sofort, Packbereit zuerst, Gepacktes nicht (Inhaber 26.10.)', () => {
  const html = ansicht('tab=muster', [kunde(1, 'warten'), kunde(2, 'klaeren'), kunde(3, 'packen'), kunde(4, 'gepackt')]);
  const reihe = [...html.matchAll(/data-mp-kunde="(order\d)"/g)].map(m => m[1]);
  assert.deepEqual(reihe, ['order3', 'order2', 'order1']);
  assert.match(html, /aria-current="page">Alle offenen <span class="mp-filterzahl">3</);
  assert.match(html, /Wareneingang nach Partnerladen/);
  assert.equal((html.match(/mp-filterzahl/g) || []).length, 5);
  assert.doesNotMatch(html, /data-mp-kunde="[^"]*"[^>]* open/, 'ohne Suche oder Direktlink bleibt alles zu');
  const leer = ansicht('tab=muster', [kunde(5, 'gepackt')]);
  assert.match(leer, /Gerade keine offene Musterbestellung/);
});

test('Wartender Umschlag traegt die Anmerkung mit Bestelldatum und Automatik, das Muster seinen Stand', () => {
  const k = kunde(7, 'warten');
  k.muster = [{ ...k.muster[0], bestelltAm: '2026-10-24T07:00:00.000Z', automatisch: true },
    { ...k.muster[0], lineItemId: 'line7b', stand: 'da' }];
  const html = ansicht('tab=muster', [k]);
  assert.match(html, /Noch nicht da:<\/strong> 1 von 2 Mustern\. Beim Lieferanten bestellt am 24\.10\., automatisch per Mail\./);
  assert.match(html, /beim Lieferanten bestellt am 24\.10\. \(automatisch\)/);
  assert.match(html, /Sind alle abgehakt, ist der Umschlag packbereit/);
  const ohneBestellung = kunde(8, 'warten');
  ohneBestellung.muster = [{ ...ohneBestellung.muster[0], stand: 'offen' }];
  assert.match(ansicht('tab=muster', [ohneBestellung]), /1 Muster ist noch nicht bestellt/);
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
  assert.match(html, /Suche berücksichtigt alle vier Arbeitslisten – auch Hersteller/);
});

test('Suche nach dem Herstelleretikett klappt den Umschlag auf und markiert das Muster', () => {
  const k = kunde(9, 'warten');
  k.muster = [{ ...k.muster[0], lineItemId: 'line9a', vorher: { produktname: 'Herstellerware Modena 3N55 400 cm', farbnummer: '3N55', hersteller: 'Testwerk' } },
    { ...k.muster[0], lineItemId: 'line9b', vorher: { produktname: 'Herstellerware Modena 1B28 400 cm', farbnummer: '1B28', hersteller: 'Testwerk' } }];
  const html = ansicht('tab=muster&mpq=Testwerk%20Modena%20TSU%203N55', [kunde(1, 'packen'), k]);
  assert.match(html, /data-mp-kunde="order9"[^>]* open/);
  assert.doesNotMatch(html, /data-mp-kunde="order1"/);
  assert.equal((html.match(/mp-treffer"/g) || []).length, 1);
  assert.match(html, /Nicht gefunden: „tsu“ – gezeigt ist der Umschlag, der zu den übrigen Wörtern am besten passt/);
});

test('gebuendelter Umschlag verlinkt jede Bestellung und behaelt gewaehlten Partnerladen als Rueckweg', () => {
  const k = kunde(4, 'gepackt');
  k.bestellungen.push({ orderId: 'order5', orderName: '#TEST5' });
  const html = ansicht('tab=muster&umschlag=order4&laden=Partner%20A', [k]);
  assert.match(html, /auftrag=order4/);
  assert.match(html, /auftrag=order5/);
  assert.match(html, /mp=laden&amp;laden=Partner%20A/);
  const waren = ansicht('tab=muster&mp=laden&laden=Partner%20A', [{ ...kunde(6, 'warten'), muster: [{ ...kunde(6, 'warten').muster[0], lieferant: 'Partner A' }] }]);
  assert.match(waren, /umschlag=order6&amp;laden=Partner%20A/);
});
