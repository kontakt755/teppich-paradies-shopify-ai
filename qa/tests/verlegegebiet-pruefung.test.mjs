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

const TABELLE = {
  plz: { 16515: 2, 14199: 29, 39104: 120 },
  orte: { berlin: [11.2, 47] },
};

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
function aufbauen({ ohneCta = false } = {}) {
  const ctaUrl = ohneCta ? undefined : '/pages/kontakt';
  const ctaText = ohneCta ? undefined : 'Verlegung anfragen';
  const eingabe = new Knoten({ value: '' });
  const ausgabe = new Knoten();
  const weg = new Knoten();
  weg.hidden = true;
  const sektion = new Knoten({ dataset: { radius: '50', orte: 'tp-verlegegebiet-orte.json' } });
  const formular = new Knoten({ dataset: { ctaUrl, ctaText } });
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
  const dokument = {
    readyState: 'complete',
    addEventListener() {},
    createElement: () => new Knoten(),
    querySelectorAll: (wahl) => (wahl === '[data-tp-verlegegebiet-form]' ? [formular] : []),
  };

  // Das Skript ist ein IIFE fuers Browserfenster; hier bekommt es genau die
  // Umgebung gereicht, die es anfasst.
  new Function('window', 'document', 'fetch', SKRIPT)(fenster, dokument, holen);

  return { eingabe, ausgabe, weg, formular, offen };
}

/** Antwortet auf die n-te noch offene Abfrage. */
async function antworten(offen, index, daten = TABELLE) {
  offen[index].aufloesen({ ok: true, status: 200, json: () => Promise.resolve(daten) });
  await new Promise((fertig) => setImmediate(fertig));
  await new Promise((fertig) => setImmediate(fertig));
}

test('das Formular wird erst durch das Skript sichtbar', () => {
  const { formular } = aufbauen();
  assert.equal(formular.hidden, false, 'Ohne JavaScript muss das Feld verborgen bleiben.');
});

test('eine Postleitzahl im Gebiet fuehrt zu Zusage und Anfrage-Link', async () => {
  const { eingabe, ausgabe, weg, formular, offen } = aufbauen();
  eingabe.value = '16515';
  formular.ausloesen('submit');
  await antworten(offen, 0);

  assert.equal(ausgabe.attribute['data-status'], 'innen');
  assert.match(ausgabe.textContent, /16515 liegt in unserem/);
  assert.equal(weg.hidden, false);
  assert.equal(weg.kinder[0].href, '/pages/kontakt');
  assert.match(weg.kinder[0].textContent, /Verlegung anfragen/);
});

test('ausserhalb und unbekannt zeigen keinen Anfrage-Link', async () => {
  for (const [wert, status] of [['39104', 'aussen'], ['Hamburg', 'unbekannt']]) {
    const { eingabe, ausgabe, weg, formular, offen } = aufbauen();
    eingabe.value = wert;
    formular.ausloesen('submit');
    await antworten(offen, 0);
    assert.equal(ausgabe.attribute['data-status'], status, `${wert} sollte ${status} sein.`);
    assert.equal(weg.hidden, true, `${wert} darf keinen Anfrage-Link zeigen.`);
  }
});

test('ohne hinterlegten Anfrage-Link bleibt das Ergebnis eine Zeile', async () => {
  const { eingabe, weg, formular, offen } = aufbauen({ ohneCta: true });
  eingabe.value = '16515';
  formular.ausloesen('submit');
  await antworten(offen, 0);
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
  assert.equal(weg.hidden, true, 'Die alte Abfrage hat eine Zusage nachgeliefert.');
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
  for (const name of ['page.teppichboden-verlegen', 'page.vinylboden-verlegen', 'page.treppenverlegung']) {
    const roh = readFileSync(path.join(WURZEL, 'templates', `${name}.json`), 'utf8');
    const vorlage = JSON.parse(roh.slice(roh.indexOf('{')));
    const abschnitt = vorlage.sections.tp_verlegegebiet;
    assert.ok(abschnitt, `${name} bindet die Sektion nicht ein.`);
    assert.equal(
      abschnitt.settings.route_link,
      undefined,
      `${name} traegt eine eigene Kopie des Routenziels - genau so laufen die Adressen auseinander.`,
    );
  }
});

test('der Link oeffnet in einem neuen Tab und sagt das auch an', () => {
  const block = SEKTION.slice(SEKTION.indexOf('class="tp-vg__route"'));
  const link = block.slice(0, block.indexOf('</a>'));
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener/, 'Ohne rel=noopener bekommt das Ziel Zugriff auf die Seite.');
  assert.match(link, /tp-vg__weg/, 'Der Hinweis fuer Screenreader fehlt.');
});
