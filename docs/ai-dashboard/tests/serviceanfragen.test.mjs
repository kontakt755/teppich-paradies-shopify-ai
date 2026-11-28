// Service-Anfragen (Kunden > Service-Anfragen, Werkbank w-030): Formular-Mail
// lesen, Felder pruefen, Auswertung je Woche und Quelle - und der Server mit
// Rollen. Alle Namen und Adressen sind ausgedacht.
import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ausFormularMail, leistungAus, pruefeFelder, auswertung, kalenderwoche, wochenStart, ServiceanfrageFehler,
  automatischUebernehmbar, istAnzeige, BETREFF_SERVICE, BETREFF_STARTSEITE, BETREFF_KEIN_SERVICE,
  MAILFELDER, ANLIEGEN_SERVICE, ANLIEGEN_KEIN_SERVICE, rueckrufAusMail, BETREFF_PRODUKTSEITE,
} from '../lib/serviceanfragen.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

// Aufbau wie die Mail "Neue Kundennachricht" von Shopify (Klartextteil).
const TREPPEN_MAIL = `Neue Kundennachricht vom 9. Oktober 2026 um 11:34

Du hast eine neue Nachricht über das Kontaktformular deines
Onlineshops erhalten.

Ländercode:
DE

Betreff:
Anfrage Treppenverlegung

Name:
Erika Beispiel

Plz:
16515

E-Mail:
erika@example.com

Telefon:

Anliegen:
Aufmaß und Angebot

Text:
Wir haben 15 Stufen, U-Form.
Folgendes:
Bilder schicke ich per Mail.`;

test('Formular-Mail: Treppenseite -> Treppe, auch wenn "Aufmaß und Angebot" gewaehlt ist', () => {
  const r = ausFormularMail(TREPPEN_MAIL);
  assert.equal(r.erkannt, true);
  assert.deepEqual(r.felder, {
    datum: '2026-10-09', name: 'Erika Beispiel', telefon: '', email: 'erika@example.com', plz: '16515',
    herkunft: 'Anfrage Treppenverlegung', leistung: 'treppe', quelle: 'formular',
    notiz: 'Anliegen: Aufmaß und Angebot\nWir haben 15 Stufen, U-Form.\nFolgendes:\nBilder schicke ich per Mail.',
  });
});

test('Formular-Mail: Feld und Wert in einer Zeile (aus der Gmail-Ansicht kopiert)', () => {
  const r = ausFormularMail('Betreff: Anfrage von der Startseite\nName: Max Muster\nE-Mail: max@example.com\nTelefon: 03301 123\nAnliegen: Boden verlegen lassen\nText: Wohnzimmer 25 m²');
  assert.equal(r.erkannt, true);
  assert.equal(r.felder.leistung, 'verlegeservice');
  assert.equal(r.felder.telefon, '03301 123');
  assert.equal(r.felder.datum, null, 'ohne Betreffzeile kein Datum - der Dialog nimmt dann heute');
});

test('Formular-Mail: Musteranfrage und fremder Text werden nicht uebernommen', () => {
  const muster = ausFormularMail('Ländercode:\nDE\n\nId:\nContactForm-sample\n\nBetreff:\n\nProdukt:\nX\n\nName:\nA B\n\nE-Mail:\na@example.com');
  assert.equal(muster.erkannt, false);
  assert.match(muster.grund, /Musteranfrage/);
  assert.equal(ausFormularMail('Hallo, bitte rufen Sie zurück.').erkannt, false);
});

// Formular im Mass-Konfigurator (blocks/tp-einfass-konfigurator.liquid): kein
// Betreff, dafuer Produkt, Farbe und Form. Das Telefonfeld contact[phone]
// nennt Shopify in der Mail "Phone".
const MASS_MAIL = `Neue Kundennachricht vom 28. November 2026 um 10:12

Du hast eine neue Nachricht über das Kontaktformular deines
Onlineshops erhalten.

Ländercode:
DE

Id:
TPEinfassAnfrage-abc123

Produkt:
Beispielteppich nach Maß

Farbe:
Grau 12

Form:
Schablone · Kettelteppich

Name:
Erika Beispiel

E-Mail:
erika@example.com

Phone:
03301 000000

Text:
Ungefähr 3 x 2 m mit Aussparung.
Form: wie ein L`;

test('Mass-Konfigurator: Schablone und Skizze sind Service-Anfragen, mit Produkt, Farbe und Form in der Notiz', () => {
  const r = ausFormularMail(MASS_MAIL);
  assert.equal(r.erkannt, true);
  assert.deepEqual(r.felder, {
    datum: '2026-11-28', name: 'Erika Beispiel', telefon: '03301 000000', email: 'erika@example.com', plz: '',
    herkunft: 'Maß-Konfigurator', leistung: 'sonstiges', quelle: 'formular',
    notiz: 'Produkt: Beispielteppich nach Maß\nFarbe: Grau 12\nForm: Schablone · Kettelteppich\nUngefähr 3 x 2 m mit Aussparung.\nForm: wie ein L',
  });
  assert.deepEqual(automatischUebernehmbar(r), { ok: true });
  assert.equal(rueckrufAusMail(r), null);
  const skizze = ausFormularMail(MASS_MAIL.replace('Schablone · Kettelteppich', 'Skizze · Einfassband'));
  assert.deepEqual(automatischUebernehmbar(skizze), { ok: true });
  assert.match(skizze.felder.notiz, /^Produkt: .*\nFarbe: Grau 12\nForm: Skizze · Einfassband\n/);
  // ohne Farbwahl keine leere Zeile
  assert.match(ausFormularMail(MASS_MAIL.replace('Grau 12', '')).felder.notiz, /^Produkt: Beispielteppich nach Maß\nForm: Schablone/);
  // aus der Gmail-Ansicht kopiert: Feld und Wert in einer Zeile
  const zeile = ausFormularMail('Produkt: Beispielteppich\nFarbe: Beige\nForm: Skizze · Paspel\nName: A B\nE-Mail: a@example.com\nPhone: 030 12345\nText: Erker');
  assert.equal(zeile.erkannt, true);
  assert.equal(zeile.felder.email, 'a@example.com');
  assert.equal(zeile.felder.telefon, '030 12345');
  assert.equal(zeile.felder.notiz, 'Produkt: Beispielteppich\nFarbe: Beige\nForm: Skizze · Paspel\nErker');
});

test('Mass-Konfigurator: Musteranfragen bleiben abgewiesen', () => {
  const abgewiesen = mail => {
    const r = ausFormularMail(mail);
    assert.equal(r.erkannt, false);
    assert.match(r.grund, /Musteranfrage/);
    assert.equal(automatischUebernehmbar(r).ok, false);
  };
  // Musterformular: Produktfeld ohne Form
  abgewiesen('Id:\nContactForm-sample\n\nProdukt:\nX\n\nName:\nA B\n\nE-Mail:\na@example.com\n\nPhone:\n\nText:\nForm: Skizze');
  abgewiesen('Produkt:\nX\n\nName:\nA B\n\nE-Mail:\na@example.com');
  // Die Muster-Kennung gewinnt immer; eine andere Form (Rechteck) macht keine Service-Anfrage daraus.
  abgewiesen(MASS_MAIL.replace('TPEinfassAnfrage-abc123', 'ContactForm-sample'));
  abgewiesen(MASS_MAIL.replace('Schablone · Kettelteppich', 'Rechteck · Kettelteppich'));
});

test('Theme: Mail-Leser kennt die Felder und Anfrage-Formen des Mass-Konfigurators', () => {
  const quelle = fs.readFileSync(path.join(REPO, 'blocks/tp-einfass-konfigurator.liquid'), 'utf8');
  const standard = { id: 'Id', name: 'Name', email: 'E-Mail', phone: 'Phone', body: 'Text' };
  const felder = [...quelle.matchAll(/name="contact\[([^\]]+)\]"/g)].map(m => standard[m[1]] || m[1]);
  assert.ok(['Produkt', 'Farbe', 'Form', 'Phone'].every(f => felder.includes(f)), felder.join(', '));
  for (const f of felder) assert.ok(MAILFELDER.includes(f), `Formularfeld „${f}“ in MAILFELDER (lib/serviceanfragen.mjs) eintragen`);
  assert.equal(felder.at(-1), 'Text', 'Nachricht bleibt das letzte Feld');
  const skript = fs.readFileSync(path.join(REPO, 'assets/tp-einfass-konfigurator.js'), 'utf8');
  assert.match(skript, /q\('\[data-anfrage-form\]'\)\.value = FORM\[f\] \+/, 'das Feld „Form“ beginnt mit dem Namen der Form');
  const anfrage = /var ANFRAGE = \{([\s\S]*?)\n  \};/.exec(skript)[1];
  const formen = [...anfrage.matchAll(/^    (\w+): \{/gm)].map(m => m[1]);
  assert.ok(formen.length >= 2, formen.join(', '));
  const namen = /var FORM = \{([^}]*)\}/.exec(skript)[1];
  for (const f of formen) {
    const name = new RegExp(`${f}: '([^']+)'`).exec(namen)[1];
    const r = ausFormularMail(MASS_MAIL.replace('Schablone · Kettelteppich', `${name} · Kettelteppich`));
    assert.equal(r.erkannt, true, `Anfrage-Form „${name}“ in lib/serviceanfragen.mjs einordnen`);
  }
});

test('Formular-Mail: fremde Felder vor dem Text haengen nicht am vorigen Wert', () => {
  const r = ausFormularMail('Betreff:\nAnfrage Treppenverlegung\n\nName:\nA B\n\nE-Mail:\na@example.com\n\nStraße Und Hausnummer:\nWeg 1\n\nPhone:\n\nText:\nHinweis:\nzweite Zeile');
  assert.equal(r.felder.email, 'a@example.com');
  assert.equal(r.felder.notiz, 'Hinweis:\nzweite Zeile', 'im Kundentext bleibt "Hinweis:" Text');
});

test('Formular-Mail mit Herkunft aus dem Formular: Anzeige zaehlt als Werbung', () => {
  const r = ausFormularMail(TREPPEN_MAIL.replace('Name:\n', 'Herkunft:\nGoogle-Anzeige · Kampagne Treppen\n\nName:\n'));
  assert.equal(r.felder.quelle, 'werbung');
  assert.equal(r.felder.herkunft, 'Anfrage Treppenverlegung · Google-Anzeige · Kampagne Treppen');
  assert.equal(r.felder.name, 'Erika Beispiel');
  const link = ausFormularMail(TREPPEN_MAIL.replace('Name:\n', 'Herkunft:\nLink (newsletter)\n\nName:\n'));
  assert.equal(link.felder.quelle, 'formular', 'ein Kampagnenlink ohne Anzeige bleibt Formular');
  assert.equal(istAnzeige('Anzeige (facebook)'), true);
  assert.equal(istAnzeige(''), false);
});

test('Automatisch nur die festen Service-Betreffe, Startseite nur mit Service-Anliegen', () => {
  assert.deepEqual(automatischUebernehmbar(ausFormularMail(TREPPEN_MAIL)), { ok: true });
  const start = anliegen => automatischUebernehmbar(ausFormularMail(`Betreff:\n${BETREFF_STARTSEITE}\n\nName:\nA B\n\nE-Mail:\na@example.com\n\nAnliegen:\n${anliegen}`));
  assert.equal(start('Boden verlegen lassen').ok, true);
  assert.equal(start('Aufmaß und Angebot').ok, true);
  assert.equal(start('Muster bestellen').ok, false);
  assert.match(start('Rückruf').grund, /kein Service/);
  assert.equal(automatischUebernehmbar(ausFormularMail(TREPPEN_MAIL.replace('Anfrage Treppenverlegung', 'Anfrage Teppichreinigung'))).ok, false);
  assert.equal(automatischUebernehmbar(ausFormularMail('Hallo')).ok, false);
});

test('Jeder Betreff aus den Theme-Templates ist eingeordnet (Service oder bewusst nicht)', () => {
  const bekannt = new Set([...BETREFF_SERVICE, BETREFF_STARTSEITE, ...BETREFF_KEIN_SERVICE]);
  const gefunden = [];
  for (const datei of fs.readdirSync(path.join(REPO, 'templates')).filter(d => d.endsWith('.json'))) {
    const roh = fs.readFileSync(path.join(REPO, 'templates', datei), 'utf8').replace(/^\/\*[\s\S]*?\*\//, '');
    for (const s of Object.values(JSON.parse(roh).sections || {})) {
      if (s.type === 'tp-start-kontakt' && s.settings?.betreff) gefunden.push([datei, s.settings.betreff]);
    }
  }
  assert.ok(gefunden.length >= 5, 'die Serviceseiten tragen ihren Betreff');
  for (const [datei, betreff] of gefunden) assert.ok(bekannt.has(betreff), `${datei}: Betreff „${betreff}“ in lib/serviceanfragen.mjs einordnen`);
  // Feste Betreffe anderer Formulare im Theme
  const theme = ['sections/tp-boden-finder.liquid', 'snippets/tp-muster-beratungsanfrage.liquid'].map(d => fs.readFileSync(path.join(REPO, d), 'utf8')).join('\n');
  for (const [, wert] of theme.matchAll(/name="contact\[Betreff\]" value="([^"{]+)"/g)) assert.ok(bekannt.has(wert), `Betreff „${wert}“ einordnen`);
});

// Produktseite -> /pages/kontakt?thema=… (assets/tp-sample-request.js): dieselbe
// Formular-Kennung wie die Musteranfrage und ein Feld "Produkt", aber mit Betreff.
const PRODUKT_MAIL = `Neue Kundennachricht vom 17. Oktober 2026 um 14:33

Du hast eine neue Nachricht über das Kontaktformular deines
Onlineshops erhalten.

Ländercode:
DE

Id:
ContactForm-sample

Betreff:
Verlegeanfrage

Produkt:
Beispielvinyl Beton Mittelgrau –
Klickvinyl 4,5mm

Produkt Handle:
beispielvinyl-beton-mittelgrau

Produkt Link:
https://shop.example/products/beispielvinyl-beton-mittelgrau

Name:
Erika Beispiel

E-Mail:
erika@example.com

Straße Und Hausnummer:

Plz:
16515

Ort:

Phone:
03301 000000

Text:
Ich interessiere mich für die Verlegung.
Fläche / Raum: Küche, ca. 15 qm`;
const mitBetreff = betreff => PRODUKT_MAIL.replace('Verlegeanfrage', betreff);

test('Produktseite: Verlegeanfrage ist eine Service-Anfrage, das Produkt steht in der Notiz', () => {
  const r = ausFormularMail(PRODUKT_MAIL);
  assert.equal(r.erkannt, true);
  assert.deepEqual(r.felder, {
    datum: '2026-10-17', name: 'Erika Beispiel', telefon: '03301 000000', email: 'erika@example.com', plz: '16515',
    herkunft: 'Verlegeanfrage', leistung: 'verlegeservice', quelle: 'formular',
    notiz: 'Produkt: Beispielvinyl Beton Mittelgrau – Klickvinyl 4,5mm\nIch interessiere mich für die Verlegung.\nFläche / Raum: Küche, ca. 15 qm',
  });
  assert.deepEqual(automatischUebernehmbar(r), { ok: true });
  assert.equal(rueckrufAusMail(r), null);
});

test('Produktseite: Angebot und Beratungstermin sind Service, auch ohne Produkt', () => {
  for (const betreff of ['Angebotsanfrage', 'Beratungstermin']) {
    const r = ausFormularMail(mitBetreff(betreff));
    assert.equal(r.erkannt, true, betreff);
    assert.equal(r.felder.leistung, 'sonstiges');
    assert.equal(r.felder.herkunft, betreff);
    assert.match(r.felder.notiz, /^Produkt: Beispielvinyl /);
    assert.deepEqual(automatischUebernehmbar(r), { ok: true });
  }
  // Link der Serviceseiten ohne Produkt (?thema=verlegung): keine leere Zeile in der Notiz
  const ohne = ausFormularMail(PRODUKT_MAIL.replace('Beispielvinyl Beton Mittelgrau –\nKlickvinyl 4,5mm', ''));
  assert.equal(ohne.erkannt, true);
  assert.match(ohne.felder.notiz, /^Ich interessiere mich/);
  // mit Kampagne aus dem Formular
  const werbung = ausFormularMail(PRODUKT_MAIL.replace('Produkt:\n', 'Herkunft:\nGoogle-Anzeige · Kampagne Vinyl\n\nProdukt:\n'));
  assert.equal(werbung.felder.quelle, 'werbung');
  assert.equal(werbung.felder.herkunft, 'Verlegeanfrage · Google-Anzeige · Kampagne Vinyl');
  // aus der Gmail-Ansicht kopiert: Feld und Wert in einer Zeile
  const zeile = ausFormularMail('Id: ContactForm-sample\nBetreff: Angebotsanfrage\nProdukt: Beispielboden\nName: A B\nE-Mail: a@example.com\nStraße Und Hausnummer: Weg 1\nPlz: 16515\nOrt: Beispielort\nTelefon: 030 12345\nText: 40 m²');
  assert.equal(zeile.felder.email, 'a@example.com');
  assert.equal(zeile.felder.plz, '16515');
  assert.equal(zeile.felder.telefon, '030 12345');
  assert.equal(zeile.felder.notiz, 'Produkt: Beispielboden\n40 m²');
});

test('Produktseite: Musteranfrage, Reklamation und Anfrage ohne Thema bleiben abgewiesen', () => {
  for (const [betreff, grund] of [
    ['Musteranfrage', /Musteranfrage/],
    ['Kostenlose Musteranfrage', /Musteranfrage/],
    ['', /Musteranfrage/],
    ['Reklamation', /Reklamation/],
    ['Anfrage zum Produkt', /Anfrage zum Produkt/],
  ]) {
    const r = ausFormularMail(mitBetreff(betreff));
    assert.equal(r.erkannt, false, betreff);
    assert.match(r.grund, grund);
    assert.equal(automatischUebernehmbar(r).ok, false);
  }
  // Der Betreff zaehlt, nicht der Kundentext.
  assert.equal(ausFormularMail(`${mitBetreff('Reklamation')}\nBetreff: Verlegeanfrage`).erkannt, false);
});

test('Theme: jeder Betreff und jedes Feld des Kontaktformulars ist im Mail-Leser eingeordnet', () => {
  const skript = fs.readFileSync(path.join(REPO, 'assets/tp-sample-request.js'), 'utf8');
  const themen = /var themen = \{([\s\S]*?)\};/.exec(skript);
  assert.ok(themen, 'Themen der Produktseite gefunden');
  const betreffe = [
    ...[...themen[1].matchAll(/\w+: '([^']+)'/g)].map(m => m[1]),
    /feld\('Betreff', betreff \|\| '([^']+)'\)/.exec(skript)[1],
    ...[...skript.matchAll(/setHiddenField\('Betreff', '([^']+)'\)/g)].map(m => m[1]),
  ];
  assert.ok(betreffe.length >= 7, betreffe.join(', '));
  for (const b of betreffe) {
    assert.ok(BETREFF_PRODUKTSEITE.includes(b) !== BETREFF_KEIN_SERVICE.includes(b), `Betreff „${b}“ in lib/serviceanfragen.mjs einordnen`);
  }
  for (const b of BETREFF_PRODUKTSEITE) assert.ok(betreffe.includes(b), `„${b}“ setzt das Theme nicht mehr`);

  const quelle = fs.readFileSync(path.join(REPO, 'sections/contact-form.liquid'), 'utf8');
  const standard = { id: 'Id', name: 'Name', email: 'E-Mail', phone: 'Phone', body: 'Text' };
  const mailName = feld => standard[feld] || feld.split(/[ -]/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  const felder = [...quelle.matchAll(/name="contact\[([^\]]+)\]"/g)].map(m => mailName(m[1]));
  assert.ok(felder.includes('Produkt Handle') && felder.includes('Ort'), felder.join(', '));
  for (const f of felder) assert.ok(MAILFELDER.includes(f), `Formularfeld „${f}“ in MAILFELDER (lib/serviceanfragen.mjs) eintragen`);
  assert.equal(felder.at(-1), 'Text', 'Nachricht bleibt das letzte Feld');
});

test('Formular-Mail: Wunschzeitraum landet in der Notiz, "mehrere Wohnungen" ist Verlegeservice', () => {
  const mail = `Betreff:\n${BETREFF_STARTSEITE}\n\nName:\nA B\n\nPlz:\n16515\n\nE-Mail:\na@example.com\n\nTelefon:\n\nAnliegen:\nMieterwechsel / mehrere Wohnungen\n\nWunschzeitraum:\nab 1. Dezember\n\nText:\nDrei Wohnungen, je 60 m².`;
  const r = ausFormularMail(mail);
  assert.equal(r.felder.leistung, 'verlegeservice');
  assert.equal(r.felder.notiz, 'Anliegen: Mieterwechsel / mehrere Wohnungen\nWunschzeitraum: ab 1. Dezember\nDrei Wohnungen, je 60 m².');
  assert.equal(r.felder.email, 'a@example.com');
  assert.deepEqual(automatischUebernehmbar(r), { ok: true });
  // leer gelassen: keine leere Zeile in der Notiz
  const leer = ausFormularMail(mail.replace('ab 1. Dezember', ''));
  assert.equal(leer.felder.notiz, 'Anliegen: Mieterwechsel / mehrere Wohnungen\nDrei Wohnungen, je 60 m².');
  // aus der Gmail-Ansicht kopiert: Feld und Wert in einer Zeile
  const zeile = ausFormularMail('Betreff: Anfrage Treppenverlegung\nName: A B\nE-Mail: a@example.com\nWunschzeitraum: KW 50\nText: 12 Stufen');
  assert.equal(zeile.felder.notiz, 'Wunschzeitraum: KW 50\n12 Stufen');
});

test('Theme: jedes Feld und jedes Anliegen des Anfrageformulars kennt der Mail-Leser', () => {
  const quelle = fs.readFileSync(path.join(REPO, 'sections/tp-start-kontakt.liquid'), 'utf8');
  // So benennt Shopify die Felder in der Mail "Neue Kundennachricht".
  const standard = { name: 'Name', email: 'E-Mail', body: 'Text' };
  const mailName = feld => standard[feld] || feld.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  const felder = [...quelle.matchAll(/name="contact\[([^\]]+)\]"/g)].map(m => mailName(m[1]));
  assert.ok(felder.includes('Wunschzeitraum') && felder.includes('Plz') && felder.includes('Telefon'), felder.join(', '));
  for (const f of felder) assert.ok(MAILFELDER.includes(f), `Formularfeld „${f}“ in MAILFELDER (lib/serviceanfragen.mjs) eintragen`);
  // Body steht in der Mail zuletzt; ein Feld dahinter laege im Kundentext.
  assert.equal(felder.at(-1), 'Text', 'Nachricht bleibt das letzte Feld');
  const liste = /assign tp_kon_anliegen = '([^']+)'/.exec(quelle);
  assert.ok(liste, 'Auswahl "Ich möchte" gefunden');
  for (const a of liste[1].split('|')) {
    assert.ok(ANLIEGEN_SERVICE.includes(a) || ANLIEGEN_KEIN_SERVICE.includes(a), `Anliegen „${a}“ in lib/serviceanfragen.mjs einordnen`);
  }
});

test('Theme: Herkunft-Feld merkt nur den Text, nur mit Einwilligung, und schickt keine Klick-ID', () => {
  const formular = fs.readFileSync(path.join(REPO, 'sections/tp-start-kontakt.liquid'), 'utf8');
  assert.match(formular, /<input type="hidden" name="contact\[Herkunft\]" value="" data-tp-herkunft>/);
  const snippet = fs.readFileSync(path.join(REPO, 'snippets/tp-herkunft.liquid'), 'utf8');
  const code = /<script>([\s\S]*?)<\/script>/.exec(snippet)[1];
  assert.doesNotMatch(code, /cookie|localStorage/i);
  const lauf = (suche, { referrer = '', erlaubt = false, speicher = new Map() } = {}) => {
    const feld = { value: '', disabled: true };
    const document = { referrer, querySelectorAll: () => [feld], addEventListener() {} };
    const window = {
      location: { search: suche, origin: 'https://shop.example' },
      Shopify: { customerPrivacy: { analyticsProcessingAllowed: () => erlaubt } },
    };
    const sessionStorage = {
      getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
      setItem: (k, v) => speicher.set(k, v),
      removeItem: (k) => speicher.delete(k),
    };
    new Function('window', 'document', 'URLSearchParams', 'sessionStorage', code)(window, document, URLSearchParams, sessionStorage);
    return { wert: feld.value, feld, speicher };
  };
  assert.equal(lauf('?gclid=abc123&utm_campaign=Treppen').wert, 'Google-Anzeige · Kampagne Treppen');
  assert.equal(lauf('?utm_source=facebook&utm_medium=paid_social').wert, 'Anzeige (facebook)');
  assert.equal(lauf('?fbclid=xyz').wert, 'Link von Facebook/Instagram');
  assert.equal(lauf('?utm_source=newsletter').wert, 'Link (newsletter)');
  assert.equal(lauf('').wert, '');
  assert.equal(lauf('').feld.disabled, true, 'ohne Kennung bleibt ein abgeschaltetes Feld aus der Mail');
  assert.equal(lauf('?gclid=x').feld.disabled, false);
  assert.doesNotMatch(lauf('?gclid=geheim-123').wert, /geheim/);
  for (const w of ['Google-Anzeige · Kampagne Treppen', 'Anzeige (facebook)']) assert.equal(istAnzeige(w), true);
  assert.equal(istAnzeige(lauf('?fbclid=xyz').wert), false);

  // Ohne Einwilligung bleibt das Geraet leer.
  assert.equal(lauf('?gclid=abc').speicher.size, 0);
  // Mit Einwilligung: nur der fertige Text, nie die Klick-ID; die naechste Seite liest ihn.
  const mit = lauf('?gclid=geheim-123&utm_campaign=Vinyl', { erlaubt: true });
  assert.deepEqual([...mit.speicher.values()], ['Google-Anzeige · Kampagne Vinyl']);
  assert.equal(lauf('', { erlaubt: true, speicher: mit.speicher }).wert, 'Google-Anzeige · Kampagne Vinyl');
  // Spaeteres Nein loescht den Eintrag.
  assert.equal(lauf('', { erlaubt: false, speicher: new Map(mit.speicher) }).speicher.size, 0);
  // Ohne Einwilligung: die Vorseite im selben Shop traegt einen Wechsel weit, fremde Seiten nicht.
  assert.equal(lauf('', { referrer: 'https://shop.example/pages/a?gclid=x&utm_campaign=Vinyl#tp-anfrage' }).wert, 'Google-Anzeige · Kampagne Vinyl');
  assert.equal(lauf('', { referrer: 'https://fremd.example/?gclid=x' }).wert, '');
  assert.equal(lauf('', { referrer: 'https://shop.example/pages/a' }).wert, '');
  assert.equal(lauf('', { referrer: 'https://shop.example/pages/a?gclid=x' }).speicher.size, 0);
});

test('Leistung: Betreff der Serviceseite gewinnt, sonst das Anliegen', () => {
  assert.equal(leistungAus({ betreff: 'Anfrage Liefer- und Verlegeservice', anliegen: 'Rückruf' }), 'verlegeservice');
  assert.equal(leistungAus({ betreff: 'Anfrage Vinylboden verlegen' }), 'verlegeservice');
  assert.equal(leistungAus({ betreff: 'Anfrage von der Startseite', anliegen: 'Aufmaß und Angebot' }), 'aufmass');
  assert.equal(leistungAus({ betreff: 'Anfrage Teppichreinigung', anliegen: 'Teppichreinigung' }), 'sonstiges');
  assert.equal(leistungAus({ betreff: '', anliegen: 'Treppe belegen lassen' }), 'treppe');
});

test('Felder: Pflicht, erlaubte Werte, und unbekannte Felder fallen weg', () => {
  const f = pruefeFelder({ datum: '2026-10-16', leistung: 'treppe', quelle: 'telefon', telefon: ' 0171 1 ', id: 'S-999', verlauf: [] });
  assert.deepEqual(f, { telefon: '0171 1', datum: '2026-10-16', leistung: 'treppe', quelle: 'telefon', status: 'neu' });
  assert.throws(() => pruefeFelder({ datum: '16.10.2026', leistung: 'treppe', quelle: 'telefon', name: 'A' }), /JJJJ-MM-TT/);
  assert.throws(() => pruefeFelder({ datum: '2026-10-16', leistung: 'parkett', quelle: 'telefon', name: 'A' }), ServiceanfrageFehler);
  assert.throws(() => pruefeFelder({ datum: '2026-10-16', leistung: 'treppe', quelle: 'telefon' }), /mindestens eins/);
  assert.deepEqual(pruefeFelder({ status: 'termin' }, { teil: true }), { status: 'termin' });
});

test('Kalenderwoche und Wochenbeginn (montags)', () => {
  assert.equal(wochenStart('2026-10-16'), '2026-10-12');
  assert.equal(wochenStart('2026-10-12'), '2026-10-12');
  assert.equal(wochenStart('2026-10-18'), '2026-10-12');
  assert.equal(kalenderwoche('2026-10-16'), 42);
  assert.equal(kalenderwoche('2027-01-01'), 53);
  assert.equal(kalenderwoche('2026-01-01'), 1);
});

test('Auswertung: je Woche und je Quelle zaehlen dieselbe Menge', () => {
  const e = [
    { datum: '2026-10-16', quelle: 'formular', status: 'neu' },
    { datum: '2026-10-13', quelle: 'telefon', status: 'gewonnen' },
    { datum: '2026-10-05', quelle: 'formular', status: 'verloren' },
    { datum: '2026-08-24', quelle: 'formular', status: 'neu' }, // erster Tag des Zeitraums (8 Wochen ab KW 35)
    { datum: '2026-08-23', quelle: 'werbung', status: 'gewonnen' }, // davor - zaehlt nicht
    { datum: '2026-10-17', quelle: 'laden', status: 'neu' }, // nach "heute" - zaehlt nicht
  ];
  const a = auswertung(e, { heute: '2026-10-16', wochen: 8 });
  assert.equal(a.ab, '2026-08-24');
  assert.equal(a.wochen.length, 8);
  assert.deepEqual(a.wochen.map(w => w.kw), [35, 36, 37, 38, 39, 40, 41, 42]);
  assert.deepEqual(a.wochen.map(w => w.anzahl), [1, 0, 0, 0, 0, 0, 1, 2]);
  assert.equal(a.gesamt, 4);
  assert.equal(a.gewonnen, 1);
  assert.equal(a.wochen.reduce((s, w) => s + w.anzahl, 0), a.quellen.reduce((s, q) => s + q.anzahl, 0));
  assert.deepEqual(a.quellen.map(q => [q.quelle, q.anzahl, q.gewonnen, q.verloren]), [['formular', 3, 0, 1], ['telefon', 1, 1, 0]]);
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: Mitarbeiter legt an und aendert, Rolle "lesen" darf nur lesen', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-serviceanfragen-'));
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(privat, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=serviceanfragen');
  delete process.env.TP_DASHBOARD_PASSWORT;
  try {
    await mitServer(mod.requestHandler, async base => {
      const anmelden = async (name, passwort) => {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
        assert.equal(r.status, 200);
        return r.headers.get('set-cookie').split(';')[0];
      };
      const schreiben = (keks, rumpf) => fetch(`${base}/api/kunden/serviceanfragen`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify(rumpf),
      });
      const lesen = async keks => (await fetch(`${base}/api/kunden/serviceanfragen`, { headers: { cookie: keks } })).json();
      const lena = await anmelden('lena', 'platzhalter-lesen-1');
      const mona = await anmelden('mona', 'platzhalter-mitarbeiter-1');
      assert.equal((await fetch(`${base}/api/version`)).status, 401, 'Versionsabfrage bleibt angemeldet');
      for (const cookie of [lena, mona]) assert.equal((await fetch(`${base}/api/version`, { headers: { cookie } })).status, 200, 'Versionshinweis ist fuer alle Rollen verfuegbar');

      assert.deepEqual(await lesen(mona), { verfuegbar: true, eintraege: [] }, 'fehlende Datei = leere Liste');
      const neu = { datum: '2026-10-15', leistung: 'treppe', quelle: 'telefon', name: 'Erika Beispiel', telefon: '0171 000' };
      assert.equal((await schreiben(lena, neu)).status, 403, 'lesen darf nichts anlegen');
      const r1 = await schreiben(mona, neu);
      assert.equal(r1.status, 200);
      const a = (await r1.json()).eintrag;
      assert.equal(a.id, 'S-001');
      assert.equal(a.erstelltVon, 'Mona Mitarbeiter', 'Name aus der Sitzung');
      assert.equal(a.status, 'neu');

      const fehlt = await schreiben(mona, { datum: '2026-10-15', leistung: 'treppe', quelle: 'fax', name: 'X' });
      assert.equal(fehlt.status, 400);
      assert.match((await fehlt.json()).error, /Quelle/);

      const r2 = await schreiben(mona, { id: 'S-001', status: 'termin', naechsterSchritt: 'Aufmaß Do 10 Uhr' });
      assert.equal(r2.status, 200);
      assert.equal((await schreiben(lena, { id: 'S-001', status: 'verloren' })).status, 403);
      assert.equal((await schreiben(mona, { id: 'S-404', status: 'termin' })).status, 400);

      const stand = await lesen(lena);
      assert.equal(stand.eintraege.length, 1);
      assert.equal(stand.eintraege[0].status, 'termin');
      assert.equal(stand.eintraege[0].naechsterSchritt, 'Aufmaß Do 10 Uhr');
      assert.deepEqual(stand.eintraege[0].verlauf.map(v => v.was), ['angelegt (Neu)', 'Neu → Termin']);
      assert.ok(fs.existsSync(path.join(privat, 'serviceanfragen.json')), 'Ablage im privaten Ordner');
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});
