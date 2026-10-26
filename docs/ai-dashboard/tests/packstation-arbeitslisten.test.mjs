import test from 'node:test';
import assert from 'node:assert/strict';
import { viewKundenMusterPacken } from '../ansichten/kunden/muster-packen.mjs';
import { state } from '../kern/zustand.mjs';
import { kunden } from '../ansichten/kunden/gemeinsam.mjs';

const kunde = (nr, bereich) => ({ name: `Testkunde ${nr}`, schluessel: `kunde${nr}`, packSchluessel: `order${nr}`, bereich,
  adresse: {}, bestellungen: [{ orderId: `order${nr}`, orderName: `#TEST${nr}` }], wartetTage: 1,
  muster: [{ lineItemId: `line${nr}`, bestellt: { titel: 'Testmuster', farbe: 'Sand' }, etikett: { serie: 'Test', farbe: 'Sand' }, fehlt: [], stand: 'bestellt', anzahl: 1 }],
  fehlt: [], aufkleber: 2, gepackt: bereich === 'gepackt' ? { zeit: '2026-10-22T08:00:00Z' } : null });

function ansicht(query, liste, ausserhalb = []) {
  globalThis.document ||= { addEventListener() {} };
  state.route.params = new URLSearchParams(query);
  kunden.musterPacken = { verfuegbar: true, kunden: liste, ausserhalb };
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
  assert.match(html, /Suche berücksichtigt alle Umschläge und auch Musterbestellungen außerhalb der Packliste – auch Hersteller/);
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

test('Packer-Info: Herstelleretiketten ab, ausser bei Vorwerk und JAB (Inhaber 26.10.)', () => {
  for (const query of ['tab=muster', 'tab=muster&mpbereich=gepackt']) {
    const html = ansicht(query, [kunde(1, 'packen'), kunde(2, 'gepackt')]);
    assert.match(html, /<p class="notice mp-packer-info"><strong>Wichtig beim Packen:<\/strong> Herstelleretiketten von den Mustern entfernen – außer bei Vorwerk und JAB\. Dort bleibt das Herstelleretikett dran\.<\/p>/);
    assert.equal((html.match(/mp-packer-info/g) || []).length, 1, 'genau einmal, nicht je Umschlag');
  }
  const k = { ...kunde(6, 'warten'), muster: [{ ...kunde(6, 'warten').muster[0], lieferant: 'Partner A' }] };
  assert.equal((ansicht('tab=muster&mp=laden', [k]).match(/mp-packer-info/g) || []).length, 1, 'auch im Wareneingang wird aufgeklebt');
});

test('Neu etikettieren: jedes Muster hat seinen eigenen Druckknopf, auch gepackte Umschlaege drucken erneut', () => {
  const k = kunde(1, 'warten');
  k.muster = [{ ...k.muster[0], anzahl: 2 }, { ...k.muster[0], lineItemId: 'line1b', fehlt: ['Serie'] }];
  const html = ansicht('tab=muster&umschlag=order1', [k]);
  assert.match(html, /data-mp-drucken-muster="line1">Aufkleber drucken \(2\)</);
  assert.doesNotMatch(html, /data-mp-drucken-muster="line1b"/, 'ohne Zuordnung kein Aufkleber');
  const gepackt = ansicht('tab=muster&umschlag=order2', [kunde(2, 'gepackt')]);
  assert.match(gepackt, /data-mp-drucken-muster="line2">Aufkleber drucken</);
  assert.match(gepackt, /data-mp-drucken="order2">Aufkleber erneut drucken \(2\)</);
});

test('Alle eingelegt – Umschlag gepackt: ein Klick bei offenen Haken, Hauptaktion nur wenn packbereit', () => {
  const packen = ansicht('tab=muster&umschlag=order1', [kunde(1, 'packen')]);
  assert.match(packen, /btn btn-sm btn-primary" data-mp-alle-eingelegt="order1">Alle 1 Muster eingelegt – Umschlag gepackt</);
  const warten = ansicht('tab=muster&umschlag=order2', [kunde(2, 'warten')]);
  assert.match(warten, /class="btn btn-sm" data-mp-alle-eingelegt="order2">/);
  const fertig = kunde(3, 'packen');
  fertig.muster = [{ ...fertig.muster[0], abgehakt: { zeit: '2026-10-26T08:00:00Z' } }];
  const abgehakt = ansicht('tab=muster&umschlag=order3', [fertig]);
  assert.doesNotMatch(abgehakt, /data-mp-alle-eingelegt/);
  assert.match(abgehakt, /data-mp-aktion="gepackt"[^>]*>Umschlag gepackt</);
  assert.doesNotMatch(ansicht('tab=muster&umschlag=order4', [kunde(4, 'klaeren')]), /data-mp-alle-eingelegt/, 'zu klaeren packt nie mit einem Klick');
});

test('Wareneingang: Haken und Aufkleber direkt in der Zeile, Suche auch hier; Wechsel hebt die Suche auf', () => {
  const k = { ...kunde(6, 'warten'), muster: [{ ...kunde(6, 'warten').muster[0], lieferant: 'Partner A' }] };
  const waren = ansicht('tab=muster&mp=laden', [k]);
  assert.match(waren, /mp-sortzeile[\s\S]*data-mp-haken="line6"[\s\S]*data-mp-drucken-muster="line6"/);
  assert.match(waren, /input type="search" data-param="mpq"/);
  assert.match(waren, /aria-current="page">Wareneingang nach Partnerladen</);
  const gesucht = ansicht('tab=muster&mp=laden&mpq=TEST6', [k, kunde(7, 'packen')]);
  assert.match(gesucht, /data-mp-kunde="order6"[^>]* open/);
  assert.doesNotMatch(gesucht, /data-mp-kunde="order7"/);
  assert.match(gesucht, /href="#\/kunden\?tab=muster&amp;mp=laden">Wareneingang nach Partnerladen</, 'Wechsel ohne mpq');
});

test('Suche zeigt passende Musterbestellungen ausserhalb der Packliste mit Grund und Link, ohne Aktion', () => {
  const aussen = [{ orderId: 'order9', orderName: '#TEST9', name: 'Testkunde Neun', datum: '2026-10-20T08:00:00Z', grund: 'erledigt',
    muster: [{ lineItemId: 'line9', bestellt: { titel: 'Testmuster', farbe: 'Grau' }, etikett: { serie: 'Test', farbe: 'Grau', sku: 'T-GR' }, vorher: { produktname: 'Herstellerware Grau', farbnummer: '9G9' }, lieferant: null }] }];
  const html = ansicht('tab=muster&mpq=9G9', [kunde(1, 'packen')], aussen);
  assert.doesNotMatch(html, /data-mp-kunde="order1"/);
  assert.match(html, /Kein offener Umschlag passt – siehe unten/);
  assert.match(html, /Außerhalb der Packliste[\s\S]*#TEST9[\s\S]*schon versandt oder erledigt[\s\S]*Farbnr\. 9G9/);
  assert.match(html, /bq=%23TEST9">#TEST9 – Bestellung ansehen</);
  assert.doesNotMatch(html.slice(html.indexOf('Außerhalb der Packliste')), /data-mp-(haken|drucken|aktion|alle)/);
  assert.match(ansicht('tab=muster&mpq=gibtsnicht', [kunde(1, 'packen')], aussen), /Nichts gefunden – weder in der Packliste noch in anderen Musterbestellungen/);
});
