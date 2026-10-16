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

test('Theme: Herkunft-Feld liest nur die Adresse, speichert nichts, schickt keine Klick-ID', () => {
  const quelle = fs.readFileSync(path.join(REPO, 'sections/tp-start-kontakt.liquid'), 'utf8');
  assert.match(quelle, /<input type="hidden" name="contact\[Herkunft\]" value="" data-tp-herkunft>/);
  const start = quelle.indexOf('Herkunft fuer die Anfrage-Mail');
  const code = quelle.slice(quelle.indexOf('(function', start), quelle.indexOf('})();', start) + 5);
  assert.doesNotMatch(code, /Storage|cookie/i);
  const lauf = suche => {
    const feld = { value: '' };
    const document = { querySelectorAll: () => [feld] };
    new Function('window', 'document', 'URLSearchParams', code)({ location: { search: suche } }, document, URLSearchParams);
    return feld.value;
  };
  assert.equal(lauf('?gclid=abc123&utm_campaign=Treppen'), 'Google-Anzeige · Kampagne Treppen');
  assert.equal(lauf('?utm_source=facebook&utm_medium=paid_social'), 'Anzeige (facebook)');
  assert.equal(lauf('?fbclid=xyz'), 'Link von Facebook/Instagram');
  assert.equal(lauf('?utm_source=newsletter'), 'Link (newsletter)');
  assert.equal(lauf(''), '');
  assert.doesNotMatch(lauf('?gclid=geheim-123'), /geheim/);
  for (const w of ['Google-Anzeige · Kampagne Treppen', 'Anzeige (facebook)']) assert.equal(istAnzeige(w), true);
  assert.equal(istAnzeige(lauf('?fbclid=xyz')), false);
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
