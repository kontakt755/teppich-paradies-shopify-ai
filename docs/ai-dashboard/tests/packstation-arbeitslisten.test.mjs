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
  assert.match(html, /aria-current="page">Bestellung packen<[\s\S]*>Muster kommt an</);
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

test('Neu etikettieren: einzelnes Muster leise nachdrucken, gepackte Umschlaege alle Aufkleber erneut', () => {
  const k = kunde(1, 'warten');
  k.muster = [{ ...k.muster[0], anzahl: 2 }, { ...k.muster[0], lineItemId: 'line1b', fehlt: ['Serie'] }];
  const html = ansicht('tab=muster&umschlag=order1', [k]);
  assert.match(html, /btn btn-sm btn-ghost mp-druck1" data-mp-drucken-muster="line1">Nur diesen nachdrucken \(2\)</);
  assert.doesNotMatch(html, /data-mp-drucken-muster="line1b"/, 'ohne Zuordnung kein Aufkleber');
  const gepackt = ansicht('tab=muster&umschlag=order2', [kunde(2, 'gepackt')]);
  assert.match(gepackt, /data-mp-drucken-muster="line2">Nur diesen nachdrucken</);
  assert.match(gepackt, /class="mp-mehr"[\s\S]*data-mp-drucken="order2" data-mp-alle-aufkleber="1">Alle Aufkleber erneut drucken \(2\)</);
});

const schritt = html => (html.match(/<li class="mp-jetzt"><span class="mp-schritt-titel">([^<]+)</) || [])[1];
// Nur im Umschlag zaehlen; Ansichtswahl und Arbeitsfilter markieren die Auswahl ebenfalls mit btn-primary.
const hauptknoepfe = html => (html.slice(html.indexOf('<details class="mp-kunde')).match(/class="btn[^"]*btn-primary"[^>]*>[^<]+/g) || []).map(x => x.replace(/^.*>/, ''));

test('Bestellung packen in drei Schritten: drucken, was ist da, zukleben – genau ein Hauptknopf', () => {
  // 1 · Nichts gedruckt, nichts abgehakt: nur "drucken" leuchtet, Packen steht unter "Mehr".
  const neu = kunde(1, 'packen');
  neu.muster = [neu.muster[0], { ...neu.muster[0], lineItemId: 'line1b' }];
  const eins = ansicht('tab=muster&umschlag=order1', [neu]);
  assert.equal(schritt(eins), '1 · Bestellung drucken');
  assert.deepEqual(hauptknoepfe(eins), ['Aufkleber und Adresse drucken (3)']);
  assert.match(eins, /data-mp-gedruckt="order1">Schon gedruckt – weiter</);
  assert.match(eins, /<strong>Da: 0 von 2<\/strong> · Fehlt: Test, Test/);
  assert.doesNotMatch(eins, /data-mp-aktion="gepackt"/);
  assert.match(eins, /class="mp-mehr"[\s\S]*data-mp-alle-eingelegt="order1">Alle 2 da – Umschlag gepackt</);
  // 2 · Ein Muster abgehakt: was ist da / was fehlt, Antworten ohne Hauptknopf.
  const halb = { ...neu, muster: [{ ...neu.muster[0], abgehakt: { zeit: 'x' } }, { ...neu.muster[1], vorher: { produktname: 'Herstellerware', farbnummer: '30' } }] };
  const zwei = ansicht('tab=muster&umschlag=order1', [halb]);
  assert.equal(schritt(zwei), '2 · Was ist da?');
  assert.deepEqual(hauptknoepfe(zwei), []);
  assert.match(zwei, /<strong>Da: 1 von 2<\/strong> · Fehlt: Herstellerware \(Farbnr\. 30\)</);
  assert.match(zwei, /data-mp-aktion="klaeren"[^>]*>Fehlt noch – zurücklegen \(1\)</);
  assert.match(zwei, /data-mp-alle-eingelegt="order1">Alle 2 da – Umschlag gepackt</);
  // 3 · Alles abgehakt: nur noch "Umschlag gepackt".
  const voll = { ...neu, muster: neu.muster.map(m => ({ ...m, abgehakt: { zeit: 'x' } })) };
  const drei = ansicht('tab=muster&umschlag=order1', [voll]);
  assert.equal(schritt(drei), '3 · Zukleben');
  assert.deepEqual(hauptknoepfe(drei), ['Umschlag gepackt']);
  assert.match(drei, /data-mp-drucken="order1">Adressaufkleber drucken</, 'Muster einzeln eingelegt: Adresse fehlt noch');
  assert.match(drei, /class="mp-mehr"[\s\S]*Alle Aufkleber erneut drucken \(2\)/, 'Zahl aus dem Server (Fixture)');
});

test('Umschlag vorbereitet: gedruckt steht fuer alle Geraete in der Kopfzeile, Schritt 1 mit Zeit und Person (#1718)', () => {
  const vermerk = { zeit: '2026-10-25T13:05:00Z', von: 'Laden' };
  const html = ansicht('tab=muster&umschlag=order1', [{ ...kunde(1, 'warten'), gedruckt: vermerk }]);
  assert.match(html, /class="mp-stempel">Umschlag vorbereitet · 25\.10\.</);
  assert.equal(schritt(html), '2 · Was ist da?', 'gedruckt: weiter bei Schritt 2');
  assert.match(html, /1 · Bestellung drucken<\/span><span class="small muted">gedruckt 25\.10\.[^<]* · Laden</);
  assert.match(html, /class="mp-mehr"[\s\S]*data-mp-gedruckt-weg="order1">Druckvermerk zurücknehmen</);
  assert.doesNotMatch(html, /Schon gedruckt/);
  // Ohne Vermerk: keine Marke, Schritt 1 leuchtet.
  const ohne = ansicht('tab=muster&umschlag=order2', [kunde(2, 'warten')]);
  assert.doesNotMatch(ohne, /Umschlag vorbereitet|data-mp-gedruckt-weg/);
  assert.equal(schritt(ohne), '1 · Bestellung drucken');
  // Zu klaeren (Muster fehlen seit Tagen): nachtragen unter "Mehr", der Hauptknopf bleibt.
  const kl = { ...kunde(3, 'klaeren'), klaeren: { fehlt: ['line3'], zeit: '2026-10-22T08:00:00Z' } };
  const klOhne = ansicht('tab=muster&umschlag=order3', [kl]);
  assert.deepEqual(hauptknoepfe(klOhne), ['Fehlendes ist da – weiter packen']);
  assert.match(klOhne, /class="mp-mehr"[\s\S]*data-mp-gedruckt="order3">Schon gedruckt – Umschlag vorbereitet</);
  const klMit = ansicht('tab=muster&umschlag=order3', [{ ...kl, gedruckt: vermerk }]);
  assert.match(klMit, /class="mp-stempel">Umschlag vorbereitet · 25\.10\.</);
  assert.match(klMit, /Umschlag vorbereitet: Aufkleber und Adresse gedruckt 25\.10\.[^<]* · Laden\. Er wartet auf die fehlenden Muster\./);
  assert.match(klMit, /data-mp-gedruckt-weg="order3"/);
  assert.doesNotMatch(klMit, /data-mp-gedruckt="order3"/);
  // In der Liste "Alle offenen" (zugeklappt) ist der Stand ohne Aufklappen zu sehen.
  const liste = ansicht('tab=muster', [{ ...kunde(4, 'warten'), gedruckt: vermerk }, kunde(5, 'warten')]);
  assert.equal((liste.match(/Umschlag vorbereitet · /g) || []).length, 1);
});

test('Muster schon im Umschlag: Bernstein-Marke in der Kopfzeile, Randbalken, oben in der Gruppe (#1720)', () => {
  const vermerk = { zeit: '2026-10-25T13:05:00Z', von: 'Laden' };
  const drei = k => ({ ...k, muster: ['a', 'b', 'c'].map(x => ({ ...k.muster[0], lineItemId: `${k.packSchluessel}${x}` })) });
  const halb = k => ({ ...k, muster: k.muster.map((m, i) => (i ? m : { ...m, abgehakt: { zeit: 'x' } })) });
  const leer = { ...drei(kunde(1, 'warten')), gedruckt: vermerk };
  const angefangen = halb({ ...drei(kunde(2, 'warten')), gedruckt: vermerk });
  const liste = ansicht('tab=muster', [kunde(3, 'klaeren'), leer, angefangen]);
  assert.deepEqual([...liste.matchAll(/data-mp-kunde="(order\d)"/g)].map(m => m[1]), ['order3', 'order2', 'order1'], 'innerhalb der Gruppe zuerst');
  assert.match(liste, /class="mp-kunde mp-warten mp-angefangen"[^>]*data-mp-kunde="order2"/);
  assert.doesNotMatch(liste, /mp-angefangen"[^>]*data-mp-kunde="order1"/);
  assert.match(liste, /data-mp-kunde="order2"[\s\S]*?<div class="mp-stempelzeile"><span class="mp-stempel">Umschlag vorbereitet · 25\.10\.<\/span><span class="mp-stempel mp-stempel-drin">1 von 3 Mustern schon im Umschlag</);
  assert.doesNotMatch(liste, /abgehakt<\/span>/, 'keine stille Zaehlzeile mehr in den Metadaten');
  const nurWarten = ansicht('tab=muster&mpbereich=warten', [leer, angefangen]);
  assert.deepEqual([...nurWarten.matchAll(/data-mp-kunde="(order\d)"/g)].map(m => m[1]), ['order2', 'order1']);
  const voll = { ...kunde(4, 'packen'), muster: [{ ...kunde(4, 'packen').muster[0], abgehakt: { zeit: 'x' } }] };
  assert.match(ansicht('tab=muster', [voll]), /mp-stempel-drin">Muster liegt im Umschlag</);
  assert.doesNotMatch(ansicht('tab=muster&mpbereich=gepackt', [{ ...halb(drei(kunde(5, 'gepackt'))), gedruckt: vermerk }]), /mp-stempel|mp-angefangen/);
  // Schon ein Muster drin, Druck nie vermerkt: Schritt 2 leuchtet, der Vermerk ist unter "Mehr" nachzutragen.
  const ohneVermerk = halb(drei(kunde(6, 'warten')));
  const offen = ansicht('tab=muster&umschlag=order6', [ohneVermerk]);
  assert.equal(schritt(offen), '2 · Was ist da?');
  assert.match(offen, /class="mp-mehr"[\s\S]*data-mp-gedruckt="order6">Schon gedruckt – Umschlag vorbereitet</);
  assert.doesNotMatch(offen, /class="mp-stempel">/);
  // Muster kommt an: die Karte sagt, dass der Ziel-Umschlag schon vorbereitet ist und was drin liegt.
  const mitName = { ...angefangen, muster: angefangen.muster.map(m => ({ ...m, vorher: { produktname: 'Herstellerware Modena', farbnummer: '3N55' } })) };
  const karte = ansicht('tab=muster&mp=laden&mh=3N55', [mitName]);
  assert.match(karte, /mp-karte-ziel[\s\S]*Umschlag vorbereitet · 25\.10\.[\s\S]*1 von 3 Mustern schon im Umschlag/);
});

test('Zu klaeren und Gepackt: ein Hauptknopf fuer das Naechstliegende, Rest unter "Mehr"', () => {
  const kl = { ...kunde(4, 'klaeren'), klaeren: { fehlt: ['line4'], zeit: '2026-10-26T08:00:00Z' } };
  const klaeren = ansicht('tab=muster&umschlag=order4', [kl]);
  assert.deepEqual(hauptknoepfe(klaeren), ['Fehlendes ist da – weiter packen']);
  assert.doesNotMatch(klaeren, /data-mp-alle-eingelegt|mp-schritte/);
  const adresse = { ...kunde(5, 'klaeren'), adressFehlt: ['PLZ'] };
  assert.deepEqual(hauptknoepfe(ansicht('tab=muster&umschlag=order5', [adresse])), ['#TEST5 – Lieferadresse prüfen']);
  const sonst = ansicht('tab=muster&umschlag=order6', [kunde(6, 'klaeren')]);
  assert.deepEqual(hauptknoepfe(sonst), ['#TEST6 – Bestellstand prüfen']);
  const gepackt = ansicht('tab=muster&umschlag=order2', [kunde(2, 'gepackt')]);
  assert.deepEqual(hauptknoepfe(gepackt), ['Großbrief vorbereiten']);
  assert.match(gepackt, /class="mp-mehr"[\s\S]*data-mp-wert="0">Zurücknehmen</);
});

test('Muster kommt an: ein Feld, eine Karte mit Ziel-Umschlag; ohne Eingabe der Wareneingang je Laden', () => {
  const k = { ...kunde(6, 'warten'), muster: [{ ...kunde(6, 'warten').muster[0], lieferant: 'Partner A', vorher: { produktname: 'Herstellerware Modena', farbnummer: '3N55' } }] };
  const leer = ansicht('tab=muster&mp=laden', [k]);
  assert.match(leer, /aria-current="page">Muster kommt an</);
  assert.match(leer, /<label class="mp-hand-label" for="mpHandFeld">Was steht auf dem Muster\?<\/label>[\s\S]*id="mpHandFeld" type="search" class="mp-hand-feld" data-param="mh"/);
  assert.match(leer, /mp-sortzeile[\s\S]*data-mp-haken="line6"[\s\S]*data-mp-drucken-muster="line6">Aufkleber drucken</);
  const andere = { ...kunde(7, 'packen'), muster: [{ ...kunde(7, 'packen').muster[0], vorher: { produktname: 'Herstellerware Modena', farbnummer: '3N55' } }] };
  const gesucht = ansicht('tab=muster&mp=laden&mh=modena%203n55', [k, andere]);
  assert.match(gesucht, /2 offene Muster passen – ältere Bestellung zuerst/);
  assert.equal((gesucht.match(/<article class="mp-karte/g) || []).length, 2);
  assert.match(gesucht, /mp-karte mp-karte-erste[\s\S]*Gehört in · wartet am längsten[\s\S]*#TEST6/);
  assert.match(gesucht, /data-mp-drucken-muster="line6">Aufkleber drucken<[\s\S]*data-mp-eingelegt="line6">Eingelegt ✓</);
  assert.match(gesucht, /letztes offenes Muster – danach komplett/);
  assert.doesNotMatch(gesucht, /mp-sortzeile/, 'mit Eingabe nur die Karten');
  const eingelegt = { ...k, muster: [{ ...k.muster[0], abgehakt: { zeit: 'x' } }] };
  const schon = ansicht('tab=muster&mp=laden&mh=3N55', [eingelegt]);
  assert.match(schon, /Schon eingelegt[\s\S]*#TEST6[\s\S]*liegt schon im Umschlag/);
  assert.doesNotMatch(schon, /data-mp-eingelegt/);
  assert.match(ansicht('tab=muster&mp=laden&mh=gibtsnicht', [k]), /Nichts gefunden\. Weniger Wörter versuchen/);
  // Die alte Suche (mpq) zeigt weiter die Umschlaege; der Wechsel hebt sie auf.
  const alt = ansicht('tab=muster&mp=laden&mpq=TEST6', [k, kunde(7, 'packen')]);
  assert.match(alt, /data-mp-kunde="order6"[^>]* open/);
  assert.match(alt, /href="#\/kunden\?tab=muster&amp;mp=laden">Muster kommt an</);
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

test('Als fehlend gemeldet, laut Bestand aber da: "nicht eingelegt · im Regal suchen" statt "fehlt · angekommen" (Rundgang 26.10.)', () => {
  const k = kunde(11, 'klaeren');
  k.klaeren = { fehlt: ['line11', 'line11b'], zeit: '2026-10-26T08:00:00Z' };
  k.muster = [{ ...k.muster[0], stand: 'da' }, { ...k.muster[0], lineItemId: 'line11b', stand: 'bestellt' }];
  const html = ansicht('tab=muster&umschlag=order11', [k]);
  assert.match(html, /<strong class="mp-fehlt">nicht eingelegt<\/strong> · <span class="muted">laut Bestand da – im Regal suchen<\/span>/);
  assert.match(html, /<strong class="mp-fehlt">fehlt<\/strong> · <span class="muted">beim Lieferanten bestellt<\/span>/);
  assert.doesNotMatch(html, /fehlt<\/strong> · <span class="muted">angekommen/);
  // Ohne Fehlmeldung bleibt es beim gewohnten Stand.
  assert.match(ansicht('tab=muster&umschlag=order12', [{ ...kunde(12, 'packen'), muster: [{ ...kunde(12, 'packen').muster[0], stand: 'da' }] }]), /<span class="muted">angekommen<\/span>/);
});
