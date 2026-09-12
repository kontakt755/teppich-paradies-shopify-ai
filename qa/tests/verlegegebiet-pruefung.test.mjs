/*
 * Die Ortspruefung der Verlegegebiet-Sektion, gefahren mit dem echten
 * ausgelieferten assets/tp-verlegegebiet.js.
 *
 * Der Anlass ist ein Wettlauf: die Ortstabelle wird erst beim ersten Absenden
 * geladen. Wer waehrenddessen weitertippt oder erneut absendet, bekam die
 * Antwort auf seine alte Eingabe nachgeliefert - im schlimmsten Fall eine
 * Zusage samt Anfrage-Link fuer eine Postleitzahl, die gar nicht mehr im Feld
 * stand. Die Tests loesen die Abfragen deshalb bewusst verzoegert und in
 * verkehrter Reihenfolge auf.
 *
 * Seit 2026-09-11 nennt die Pruefung auf Teppichboden-Seiten auch Zone und
 * Preis des Rollenware-Service (data-basis, data-mitte, data-preis-*).
 * Kostenlos ist es nur ab der Schwelle in der ersten Zone. Ausserhalb des
 * Gebiets gibt es weder Absage noch Zusage, sondern zuerst die Anfrage.
 *
 * Statt eines Browsers steht hier ein sehr kleines DOM: die Sektion braucht
 * nur eine Handvoll Eigenschaften, und der Rest der Suite laeuft ohne Browser.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WURZEL = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SKRIPT = readFileSync(path.join(WURZEL, 'assets', 'tp-verlegegebiet.js'), 'utf8');
const SEKTION = readFileSync(path.join(WURZEL, 'sections', 'tp-verlegegebiet.liquid'), 'utf8');

// Dasselbe Format wie assets/tp-verlegegebiet-orte.json: Spannen je PLZ und
// Name, eine angehaengte 1 fuer mehrere Orte gleichen Namens, und die gueltigen
// Anfaenge deutscher Postleitzahlen als Kette von Dreiergruppen.
// 16816 Neuruppin liegt in Zone 3, 13469 Berlin-Waidmannslust knapp hinter der ersten Zone.
const TABELLE = {
  plz: { 16515: [1.9, 2.1], 14199: [29, 29], 16816: [42, 42], 39104: [120, 120], 16999: [48, 53], 13469: [15.4, 15.4] },
  orte: {
    berlin: [11.2, 47],
    werderhavel: [46.7, 46.7],
    werder: [46.7, 480, 1],
    neuendorf: [12, 31, 1],
  },
  praefixe: '141165169391803',
};
const ECHTE_TABELLE = JSON.parse(readFileSync(path.join(WURZEL, 'assets', 'tp-verlegegebiet-orte.json'), 'utf8'));

const VERLEGESEITEN = [
  'page.teppichboden-verlegen',
  'page.vinylboden-verlegen',
  'page.treppenverlegung',
  'page.verlegeservice',
];

function abschnittVon(name) {
  const roh = readFileSync(path.join(WURZEL, 'templates', `${name}.json`), 'utf8');
  return JSON.parse(roh.slice(roh.indexOf('{'))).sections.tp_verlegegebiet;
}

class Knoten {
  constructor(merkmale = {}) {
    Object.assign(this, merkmale);
    this.dataset = merkmale.dataset || {};
    this.textContent = '';
    this.hidden = false;
    this.kinder = [];
    this.horcher = {};
    this.attribute = {};
  }

  addEventListener(name, ruf) {
    (this.horcher[name] = this.horcher[name] || []).push(ruf);
  }

  ausloesen(name, ereignis = {}) {
    for (const ruf of this.horcher[name] || []) ruf.call(this, { preventDefault() {}, ...ereignis });
  }

  setAttribute(name, wert) { this.attribute[name] = wert; }

  appendChild(kind) { this.kinder.push(kind); return kind; }

  querySelector(wahl) { return this.treffer.get(wahl) || null; }

  closest() { return this.sektion; }
}

/** Baut Sektion und Formular auf und laesst das echte Skript darauf los. */
function aufbauen({ ohneCta = false, ohneVersand = false, stufen = false } = {}) {
  const ctaUrl = ohneCta ? undefined : '/pages/kontakt';
  const ctaText = ohneCta ? undefined : 'Verlegung anfragen';
  const versandUrl = ohneVersand ? undefined : '/collections/all';
  const versandText = ohneVersand ? undefined : 'Zum Sortiment';
  const eingabe = new Knoten({ value: '' });
  const ausgabe = new Knoten();
  const weg = new Knoten();
  weg.hidden = true;
  const daten = { radius: '50', orte: 'tp-verlegegebiet-orte.json' };
  // So gibt die Sektion die Stufen nur auf Teppichboden-Seiten weiter.
  if (stufen) {
    Object.assign(daten, {
      basis: '15', mitte: '30', schwelle: '649',
      preisNah: '39 €', preisMitte: '49 €', preisFern: '69 €', lose: '4,95 €/m²', loseMindest: '49 €',
    });
  }
  const sektion = new Knoten({ dataset: daten });
  const formular = new Knoten({ dataset: { ctaUrl, ctaText, versandUrl, versandText } });
  formular.hidden = true;
  formular.sektion = sektion;
  formular.treffer = new Map([
    ['[data-tp-verlegegebiet-input]', eingabe],
    ['[data-tp-verlegegebiet-result]', ausgabe],
    ['[data-tp-verlegegebiet-cta]', weg],
  ]);

  const offen = [];
  // Das Skript ruft fetch ohne Praefix auf - es muss also als eigene Bindung
  // hereingereicht werden, nicht nur als Eigenschaft von window.
  const holen = () => new Promise((aufloesen, ablehnen) => offen.push({ aufloesen, ablehnen }));
  const fenster = { fetch: holen };
  const dokument = new Knoten({ readyState: 'complete' });
  dokument.createElement = () => new Knoten();
  dokument.querySelectorAll = (wahl) => (wahl === '[data-tp-verlegegebiet-form]' ? [formular] : []);

  // Das Skript ist ein IIFE fuers Browserfenster; hier bekommt es genau die
  // Umgebung gereicht, die es anfasst.
  const laden = () => new Function('window', 'document', 'fetch', SKRIPT)(fenster, dokument, holen);
  laden();

  return { eingabe, ausgabe, weg, formular, offen, dokument, laden };
}

/** Faehrt eine Eingabe gegen die echte Tabelle und liefert Status, Text, Weg. */
async function echtPruefen(wert) {
  const { eingabe, ausgabe, weg, formular, offen } = aufbauen();
  eingabe.value = wert;
  formular.ausloesen('submit');
  await antworten(offen, 0, ECHTE_TABELLE);
  return {
    status: ausgabe.attribute['data-status'],
    text: ausgabe.textContent,
    weg: weg.hidden ? null : weg.kinder.at(-1).href,
  };
}

/** Antwortet auf die n-te noch offene Abfrage. */
async function antworten(offen, index, daten = TABELLE) {
  offen[index].aufloesen({ ok: true, status: 200, json: () => Promise.resolve(daten) });
  await new Promise((fertig) => setImmediate(fertig));
  await new Promise((fertig) => setImmediate(fertig));
}

/** Sendet eine Eingabe ab und wartet die Antwort ab. */
async function pruefen(aufbau, wert) {
  aufbau.eingabe.value = wert;
  aufbau.formular.ausloesen('submit');
  await antworten(aufbau.offen, 0);
  return aufbau;
}

test('das Formular wird erst durch das Skript sichtbar', () => {
  const { formular } = aufbauen();
  assert.equal(formular.hidden, false, 'Ohne JavaScript muss das Feld verborgen bleiben.');
});

test('eine Postleitzahl im Gebiet fuehrt zu Zusage und Anfrage-Link', async () => {
  const { ausgabe, weg } = await pruefen(aufbauen(), '16515');

  assert.equal(ausgabe.attribute['data-status'], 'innen');
  assert.match(ausgabe.textContent, /16515 liegt in unserem/);
  assert.equal(weg.hidden, false);
  assert.equal(weg.kinder[0].href, '/pages/kontakt');
  assert.match(weg.kinder[0].textContent, /Verlegung anfragen/);
});

test('ohne Stufen verspricht die Pruefung keinen Rollenware-Service', async () => {
  // Vinyl- und Treppenseiten: dort gilt die kostenlose lose Verlegung nicht.
  const { ausgabe } = await pruefen(aufbauen(), '16515');
  assert.doesNotMatch(ausgabe.textContent, /Warenwert|lose Verlegung|kostenlos|€/);
});

test('mit Stufen, erste Zone: kostenlos erst ab der Schwelle, darunter die Pauschale', async () => {
  // Szenario A (400 EUR, nah): nicht kostenlos. Szenario B (700 EUR, nah): kostenlos.
  const { ausgabe } = await pruefen(aufbauen({ stufen: true }), '16515');
  assert.equal(ausgabe.attribute['data-status'], 'innen');
  assert.match(ausgabe.textContent, /Ab 649 € Warenwert sind Lieferung und lose Verlegung hier kostenlos/);
  assert.match(ausgabe.textContent, /darunter berechnen wir 39 € für Lieferung und Anfahrt und 4,95 €\/m² \(mind\. 49 €\) für die lose Verlegung/);
});

test('mit Stufen: knapp hinter der ersten Zone steht keine Entfernung, die nach Zone 1 aussieht', async () => {
  // 15,4 km wurden als "rund 15 km" angezeigt - daneben der Preis der zweiten
  // Zone, obwohl die Seite "bis 15 km kostenlos" sagt.
  const { ausgabe } = await pruefen(aufbauen({ stufen: true }), '13469');
  assert.match(ausgabe.textContent, /rund 16 km/);
  assert.match(ausgabe.textContent, /kosten hier 49 €/);
  assert.doesNotMatch(ausgabe.textContent, /kostenlos/);
});

test('mit Stufen, zweite Zone: nie kostenlos, Pauschale und lose Verlegung', async () => {
  // Der Kunde aus 29 km Entfernung darf "kostenlos" nicht lesen - auch nicht ab 649 EUR.
  const { ausgabe } = await pruefen(aufbauen({ stufen: true }), '14199');
  assert.equal(ausgabe.attribute['data-status'], 'innen');
  assert.match(ausgabe.textContent, /Lieferung und Anfahrt kosten hier 49 €, die lose Verlegung 4,95 €\/m²/);
  assert.doesNotMatch(ausgabe.textContent, /kostenlos/);
});

test('mit Stufen, dritte Zone: die hoehere Pauschale', async () => {
  const { ausgabe } = await pruefen(aufbauen({ stufen: true }), '16816');
  assert.equal(ausgabe.attribute['data-status'], 'innen');
  assert.match(ausgabe.textContent, /kosten hier 69 €/);
  assert.doesNotMatch(ausgabe.textContent, /kostenlos/);
});

test('mit Stufen: ein Ort ueber mehrere Zonen bekommt keinen Preis zugesagt', async () => {
  // Berlin reicht von 11 bis 47 km - "kostenlos" stimmt nur fuer einen Teil
  // der Stadt. Die Pruefung fragt dann nach der Postleitzahl.
  const { ausgabe } = await pruefen(aufbauen({ stufen: true }), 'Berlin');
  assert.equal(ausgabe.attribute['data-status'], 'innen');
  assert.match(ausgabe.textContent, /hängt vom Ortsteil ab/);
  assert.doesNotMatch(ausgabe.textContent, /kostenlos|€/);
});

test('Ergebnis und Weg liegen im selben vorgelesenen Bereich', () => {
  const box = SEKTION.slice(SEKTION.indexOf('class="tp-vg__ergebnis-box"'));
  const bereich = box.slice(0, box.indexOf('</div>'));
  assert.match(SEKTION, /class="tp-vg__ergebnis-box" role="status" aria-live="polite"/);
  assert.match(bereich, /data-tp-verlegegebiet-result/);
  assert.match(bereich, /data-tp-verlegegebiet-cta/, 'Der Link im Ergebnis wird nicht vorgelesen.');
});

test('ausserhalb des Gebiets: zuerst die Anfrage, dann der Shop - keine Absage', async () => {
  const { ausgabe, weg } = await pruefen(aufbauen(), '39104');

  assert.equal(ausgabe.attribute['data-status'], 'aussen');
  assert.match(ausgabe.textContent, /prüfen individuell/, 'Der Einzelfall wird nicht angeboten.');
  // Versand und Anfahrt sind zwei Dinge. Versandkostenfrei geht ueberall hin,
  // anfahren koennen die Bodenleger nur im Gebiet. "Ausserhalb unseres Liefer-
  // und Verlegegebiets" las sich fuer einen Kunden in Muenchen wie: wir
  // beliefern Sie nicht.
  assert.match(ausgabe.textContent, /versandkostenfrei in ganz Deutschland/,
    'Der kostenfreie Versand wird nicht genannt.');
  assert.match(ausgabe.textContent, /Paketdienst oder Spedition/,
    'Womit versendet wird, steht nicht da.');
  assert.doesNotMatch(ausgabe.textContent, /Liefer- und Verlegegebiet/,
    'Die Antwort stellt Versand und Anfahrt wieder in einen Topf.');
  assert.doesNotMatch(ausgabe.textContent, /keine Verlegung|nicht möglich/,
    'Die Antwort darf nicht wie eine Absage klingen.');
  assert.equal(weg.hidden, false);
  assert.equal(weg.kinder.length, 2);
  assert.equal(weg.kinder[0].href, '/pages/kontakt');
  assert.match(weg.kinder[0].textContent, /Individuell anfragen/);
  assert.equal(weg.kinder[1].href, '/collections/all');
  assert.match(weg.kinder[1].textContent, /Zum Sortiment/);
});

test('ausserhalb des Gebiets wird auch mit Stufen nichts zugesagt', async () => {
  const { ausgabe } = await pruefen(aufbauen({ stufen: true }), '39104');
  assert.equal(ausgabe.attribute['data-status'], 'aussen');
  assert.doesNotMatch(ausgabe.textContent, /inklusive|kostenlos/);
});

test('eine unverstandene Eingabe bietet gar nichts an', async () => {
  // Dort ist noch nichts entschieden - ein Angebot waere geraten.
  const { ausgabe, weg } = await pruefen(aufbauen(), 'Hamburg');
  assert.equal(ausgabe.attribute['data-status'], 'unbekannt');
  assert.equal(weg.hidden, true);
});

test('ohne hinterlegten Versandweg fuehrt ausserhalb nur zur Anfrage', async () => {
  const { weg } = await pruefen(aufbauen({ ohneVersand: true }), '39104');
  assert.equal(weg.hidden, false);
  assert.equal(weg.kinder.length, 1);
  assert.equal(weg.kinder[0].href, '/pages/kontakt');
});

test('ohne Anfrage- und Versandweg bleibt das Ergebnis ausserhalb eine Zeile', async () => {
  const { weg } = await pruefen(aufbauen({ ohneCta: true, ohneVersand: true }), '39104');
  assert.equal(weg.hidden, true);
});

test('ohne hinterlegten Anfrage-Link bleibt das Ergebnis im Gebiet eine Zeile', async () => {
  const { weg } = await pruefen(aufbauen({ ohneCta: true }), '16515');
  assert.equal(weg.hidden, true);
});

test('zweimal absenden laesst nur die zweite Antwort anzeigen', async () => {
  // Die Tabelle wird nur einmal geladen und danach gemerkt, beide Abfragen
  // haengen also an derselben Zusage. Geprueft wird deshalb die Reihenfolge
  // der Rueckmeldungen, nicht die des Netzes: der Rueckruf der ersten Abfrage
  // laeuft zuerst und darf nichts mehr setzen.
  const { eingabe, ausgabe, weg, formular, offen } = aufbauen();

  eingabe.value = '16515';
  formular.ausloesen('submit');          // waere eine Zusage samt Anfrage-Link
  eingabe.value = '39104';
  formular.ausloesen('submit');          // ist ausserhalb
  assert.equal(offen.length, 1, 'Die Tabelle wurde mehr als einmal geladen.');

  await antworten(offen, 0);

  assert.equal(ausgabe.attribute['data-status'], 'aussen',
    'Die alte Abfrage hat das Ergebnis der neuen ueberschrieben.');
  assert.match(ausgabe.textContent, /39104/);
  // Die Wege gehoeren zu "ausserhalb" - der Zusage-Link der alten Abfrage
  // ("Verlegung anfragen") darf nicht stehengeblieben sein.
  const texte = weg.kinder.map((kind) => kind.textContent).join(' | ');
  assert.doesNotMatch(texte, /Verlegung anfragen/, 'Die alte Abfrage hat ihren Anfrage-Link nachgeliefert.');
  assert.equal(weg.kinder.at(-1).href, '/collections/all');
});

test('Weitertippen verwirft eine laufende Abfrage', async () => {
  const { eingabe, ausgabe, weg, formular, offen } = aufbauen();

  eingabe.value = '16515';
  formular.ausloesen('submit');          // laeuft noch, nichts angezeigt
  eingabe.value = '1651';
  eingabe.ausloesen('input');            // Nutzer tippt weiter
  await antworten(offen, 0);

  assert.equal(ausgabe.textContent, '', 'Die verworfene Abfrage hat doch angezeigt.');
  assert.equal(weg.hidden, true, 'Die verworfene Abfrage hat einen Anfrage-Link gezeigt.');
});

test('eine leere Eingabe fragt die Tabelle gar nicht erst ab', () => {
  const { eingabe, ausgabe, offen, formular } = aufbauen();
  eingabe.value = '   ';
  formular.ausloesen('submit');
  assert.equal(offen.length, 0, 'Fuer eine leere Eingabe wurde geladen.');
  assert.match(ausgabe.textContent, /Postleitzahl oder einen Ort/);
});

test('gleichnamige Orte fuehren zur Postleitzahl statt zu einer geratenen Antwort', async () => {
  // Aus dem Peer-Review: "Bernau" war fuer Bernau am Chiemsee "im Gebiet",
  // "Werder" fuer Werder (Havel) "ausserhalb". Gegen die echte Tabelle.
  for (const name of ['Werder', 'Neuenhagen', 'Bernau', 'Schönwalde']) {
    const e = await echtPruefen(name);
    assert.equal(e.status, 'mehrdeutig', `${name}: ${e.status} - ${e.text}`);
    assert.match(e.text, /Postleitzahl/, `${name}: keine Bitte um die Postleitzahl.`);
    assert.equal(e.weg, null, `${name}: bei einem mehrdeutigen Namen darf nichts angeboten werden.`);
  }
});

test('der volle Name eines Ortes wird eindeutig erkannt', async () => {
  for (const name of ['Werder (Havel)', 'Neuenhagen bei Berlin', 'Bernau bei Berlin']) {
    const e = await echtPruefen(name);
    assert.equal(e.status, 'innen', `${name}: ${e.status} - ${e.text}`);
  }
});

test('Ortsteile und Gemeinden ohne eigenen Postort werden gefunden', async () => {
  // GeoNames kennt nur Postorte; diese kamen frueher als "kennen wir nicht".
  for (const name of ['Spandau', 'Panketal', 'Mühlenbecker Land']) {
    const e = await echtPruefen(name);
    assert.equal(e.status, 'innen', `${name}: ${e.status} - ${e.text}`);
  }
});

test('Hoppegarten und Glienicke fragen nach der Postleitzahl - es gibt sie zweimal', async () => {
  // Kein Fehler der Tabelle: die Gemeinde Hoppegarten liegt bei 36,5 km, ein
  // gleichnamiges Dorf bei Muencheberg bei 58,5 km - auf beiden Seiten der
  // Grenze. Glienicke/Nordbahn liegt bei 12 km, ein anderes Glienicke bei 81.
  // Frueher kamen beide als "kennen wir nicht"; jetzt ehrlich als mehrdeutig.
  for (const name of ['Hoppegarten', 'Glienicke']) {
    const e = await echtPruefen(name);
    assert.equal(e.status, 'mehrdeutig', `${name}: ${e.status} - ${e.text}`);
  }
  const voll = await echtPruefen('Glienicke/Nordbahn');
  assert.equal(voll.status, 'innen', 'Der volle Name muss eindeutig sein.');
});

test('Firmennamen der Grosskunden-Postleitzahlen sind keine Orte', async () => {
  const e = await echtPruefen('Daimler Insurance Services GmbH');
  assert.equal(e.status, 'unbekannt');
});

test('eine ausgedachte Postleitzahl gilt als unbekannt, eine ferne als ausserhalb', async () => {
  const falsch = await echtPruefen('00000');
  assert.equal(falsch.status, 'unbekannt', '00000 wurde als echte Postleitzahl behandelt.');
  assert.match(falsch.text, /kennen wir nicht/);
  const fern = await echtPruefen('80331');
  assert.equal(fern.status, 'aussen');
  assert.equal(fern.weg, '/collections/all');
});

test('eine grosse Stadt nennt ihre Spanne statt der naechsten Ecke', async () => {
  // Frueher: "Berlin ... rund 11 km" - Berlin reicht aber bis 47 km. Die
  // Kilometer sind aufgerundet (#191): 11,2 steht als 12, damit nie eine Zahl
  // an oder unter einer Zonengrenze neben dem Preis der naechsten Zone steht.
  const e = await echtPruefen('Berlin');
  assert.equal(e.status, 'innen');
  assert.match(e.text, /je nach Lage 12 bis 47 km/, e.text);
});

test('eine Postleitzahl am Rand bittet ums Fragen und bietet die Anfrage an', async () => {
  const { eingabe, ausgabe, weg, formular, offen } = aufbauen();
  eingabe.value = '16999';
  formular.ausloesen('submit');
  await antworten(offen, 0);
  assert.equal(ausgabe.attribute['data-status'], 'rand');
  assert.match(ausgabe.textContent, /16999 liegt am Rand/);
  assert.doesNotMatch(ausgabe.textContent, /Postleitzahl ein/, 'Wer schon eine PLZ eingab, soll nicht um eine gebeten werden.');
  assert.equal(weg.kinder.at(-1).href, '/pages/kontakt');
});

test('gleichnamige Orte, die alle im Gebiet liegen, bekommen eine Antwort', async () => {
  // Zwei Neuendorf zwischen 12 und 31 km: egal welches gemeint ist, wir kommen.
  const { eingabe, ausgabe, formular, offen } = aufbauen();
  eingabe.value = 'Neuendorf';
  formular.ausloesen('submit');
  await antworten(offen, 0);
  assert.equal(ausgabe.attribute['data-status'], 'innen');
});

test('ein fehlgeschlagener Abruf wird beim naechsten Pruefen wiederholt', async () => {
  const { eingabe, ausgabe, formular, offen } = aufbauen();
  eingabe.value = '16515';
  formular.ausloesen('submit');
  offen[0].ablehnen(new Error('offline'));
  await new Promise((fertig) => setImmediate(fertig));
  await new Promise((fertig) => setImmediate(fertig));
  assert.match(ausgabe.textContent, /gerade nicht möglich/);

  formular.ausloesen('submit');
  assert.equal(offen.length, 2, 'Der Fehlschlag blieb haengen - es wurde nicht neu geladen.');
  await antworten(offen, 1);
  assert.equal(ausgabe.attribute['data-status'], 'innen');
});

test('doppelt eingebunden oder neu angemeldet bleibt es bei einem Horcher', () => {
  // Zwei Sektionen auf einer Seite binden das Skript zweimal ein; der
  // Theme-Editor meldet Sektionen erneut an.
  const { formular, dokument, laden } = aufbauen();
  laden();
  dokument.ausloesen('shopify:section:load', { target: dokument });
  dokument.ausloesen('shopify:section:load', { target: dokument });
  assert.equal(formular.horcher.submit.length, 1, 'Das Formular ist mehrfach verdrahtet.');
});

/** Bildet die Liquid-Ableitung des Ziels nach: Zeilen zu einer Zeile,
 *  Gedankenstrich zu Bindestrich, dann kodieren wie Shopifys url_encode. */
function zielAusAdresse(adresse) {
  const zeile = adresse.split(/\\n|\n/).map((t) => t.trim()).filter(Boolean).join(', ').replace(/–/g, '-');
  return encodeURIComponent(zeile).replace(/%20/g, '+');
}

test('das Ziel fuer "Route planen" entsteht aus der Adresse der Sektion', () => {
  // Vier fertige Kopien der URL hatten die Hausnummer 73 statt 73-81. Seitdem
  // wird sie abgeleitet - dieser Test haelt fest, dass sie es bleibt.
  assert.match(
    SEKTION,
    /assign vg_route = 'https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=' \| append: vg_ziel/,
    'Der Link wird nicht mehr aus der Adresse gebildet.',
  );
  assert.match(SEKTION, /assign vg_ziel = vg_adresszeile \| url_encode/, 'Das Ziel wird nicht kodiert.');
  assert.match(SEKTION, /strip_newlines/,
    'Ohne strip_newlines landen die Zeilenumbrueche der Adresse als %0A im Ziel.');
  assert.match(SEKTION, /replace: '–', '-'/, 'Der Gedankenstrich der Hausnummer wird nicht ersetzt.');

  const adresse = SEKTION.match(/"id": "standort_adresse"[\s\S]*?"default": "([^"]+)"/)[1];
  const ziel = zielAusAdresse(adresse);
  const url = new URL('https://www.google.com/maps/dir/?api=1&destination=' + ziel);

  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'www.google.com');
  assert.equal(url.pathname, '/maps/dir/');
  // api=1 ist die dokumentierte Universal-Link-Form: auf dem Telefon oeffnet
  // sie die Karten-App, sonst den Browser. Ohne sie gibt es keinen Fallback.
  assert.equal(url.searchParams.get('api'), '1');

  const zieladresse = url.searchParams.get('destination');
  assert.match(zieladresse, /Teppich Paradies Oranienburg GmbH/, 'Der Firmenname fehlt im Ziel.');
  assert.match(zieladresse, /Saarlandstraße 73-81/, 'Die Hausnummer weicht von der Geschaeftsadresse ab.');
  assert.match(zieladresse, /16515 Oranienburg/);
  assert.ok(!/[<>"' ]/.test(ziel), 'Das Ziel muss kodiert sein.');
});

test('kein Template setzt ein eigenes, abweichendes Routenziel', () => {
  for (const name of VERLEGESEITEN) {
    const abschnitt = abschnittVon(name);
    assert.ok(abschnitt, `${name} bindet die Sektion nicht ein.`);
    assert.equal(
      abschnitt.settings.route_link,
      undefined,
      `${name} traegt eine eigene Kopie des Routenziels - genau so laufen die Adressen auseinander.`,
    );
  }
});

test('auf den Verlegeseiten bleibt der Weg im Ergebnis, obwohl die Knoepfe aus sind', () => {
  // Auf diesen Seiten folgen eigene Kontaktwege, deshalb sind die Knoepfe der
  // Sektion abgeschaltet. Die Ziele muessen trotzdem gesetzt bleiben: das
  // Ergebnis der Ortspruefung haengt an ihnen, nicht am Haken. Wer cta_link
  // fuer ungenutzt haelt und leert, nimmt dem Kunden genau in dem Moment den
  // Weg, in dem er ihn braucht.
  for (const name of VERLEGESEITEN) {
    const abschnitt = abschnittVon(name);
    assert.equal(abschnitt.settings.cta_zeigen, false, `${name}: Knoepfe unerwartet an.`);
    assert.ok(abschnitt.settings.cta_link, `${name}: ohne cta_link fuehrt ein Treffer nirgendwohin.`);
    assert.ok(abschnitt.settings.versand_link, `${name}: ohne versand_link endet "ausserhalb" in einer Absage.`);
  }
});

test('jede Verlegeseite zeigt Stufen - aus den Einstellungen oder aus Bloecken', () => {
  // Kommen die Stufen aus Bloecken, muss block_order sie nennen - fehlt es,
  // rendert die Sektion sie stillschweigend gar nicht.
  for (const name of VERLEGESEITEN) {
    const abschnitt = abschnittVon(name);
    if (abschnitt.settings.rollenware_stufen === true) continue;
    const ordnung = abschnitt.block_order || [];
    assert.ok(ordnung.length >= 3, `${name}: zu wenige Leistungsstufen.`);
    for (const schluessel of ordnung) {
      assert.ok(abschnitt.blocks[schluessel], `${name}: block_order nennt ${schluessel}, den es nicht gibt.`);
      assert.ok(abschnitt.blocks[schluessel].settings.label, `${name}: ${schluessel} ohne Beschriftung.`);
    }
  }
});

test('Rollenware-Konditionen nur auf Teppichboden-Seiten, nie auf Vinyl oder Treppe', () => {
  for (const name of ['page.teppichboden-verlegen', 'page.verlegeservice']) {
    assert.equal(abschnittVon(name).settings.rollenware_stufen, true, `${name}: Stufen fehlen.`);
  }
  for (const name of ['page.vinylboden-verlegen', 'page.treppenverlegung']) {
    const abschnitt = abschnittVon(name);
    assert.ok(!abschnitt.settings.rollenware_stufen, `${name}: verspricht den Rollenware-Service.`);
    const texte = Object.values(abschnitt.blocks || {})
      .map((block) => `${block.settings.label} ${block.settings.text}`)
      .join(' ');
    assert.doesNotMatch(texte, /649|Warenwert|lose Verlegung/,
      `${name}: nennt Rollenware-Konditionen, die dort nicht gelten.`);
  }
});

test('Basisradius und Schwelle gibt die Sektion nur mit eingeschalteten Stufen weiter', () => {
  const stelle = SEKTION.indexOf('data-basis=');
  assert.ok(stelle > 0, 'data-basis fehlt in der Sektion.');
  for (const attribut of ['data-mitte=', 'data-preis-nah=', 'data-preis-mitte=', 'data-preis-fern=', 'data-lose=']) {
    assert.ok(SEKTION.includes(attribut), `${attribut} fehlt - die Pruefung kann den Preis der Zone nicht nennen.`);
  }
  assert.match(SEKTION.slice(Math.max(0, stelle - 120), stelle), /if vg_stufen/,
    'data-basis steht ohne Bedingung - dann nennt jede Seite die Rollenware-Stufen.');
});

test('der Link oeffnet in einem neuen Tab und sagt das auch an', () => {
  const block = SEKTION.slice(SEKTION.indexOf('class="tp-vg__route"'));
  const link = block.slice(0, block.indexOf('</a>'));
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener/, 'Ohne rel=noopener bekommt das Ziel Zugriff auf die Seite.');
  assert.match(link, /tp-vg__weg/, 'Der Hinweis fuer Screenreader fehlt.');
});
