import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  meldungenPfad, abgleichPfad, meldungAnlegen, alleMeldungen, abgleichSetzen, sichtbareMeldungen,
  standAusWerkbank, statusText, bildAusUpload, bildDatei, bilderOrdner, FehlermeldungFehler,
} from '../lib/fehlermeldungen.mjs';
import { main, abgleichDaten, werkbankStand } from '../scripts/fehlermeldungen.mjs';

const MONA = { name: 'Mona Mitarbeiter', kuerzel: 'mona', rolle: 'mitarbeiter' };
const LENA = { name: 'Lena Lesend', kuerzel: 'lena', rolle: 'lesen' };
const T0 = new Date('2026-10-12T08:00:00.000Z');
const spaeter = (min) => new Date(T0.getTime() + min * 60_000);

function ordner() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-fehlermeldungen-'));
  return { dir, md: meldungenPfad(dir), ad: abgleichPfad(dir) };
}

test('anlegen: fortlaufende Nummer, Name aus der Sitzung, Text bereinigt', () => {
  const { md, ad } = ordner();
  assert.deepEqual(alleMeldungen(md, ad), [], 'fehlende Datei = noch nichts gemeldet');
  const a = meldungAnlegen(md, { text: '  Knopf „→ Bestellt“ tut nichts \r\n', ort: 'Einkauf', dringend: true }, { von: MONA, jetzt: T0 });
  const b = meldungAnlegen(md, { text: 'Lexikon zeigt keine Bilder' }, { von: LENA, jetzt: spaeter(1) });
  assert.equal(a.meldung.id, 'F-001');
  assert.equal(b.meldung.id, 'F-002');
  assert.equal(a.meldung.text, 'Knopf „→ Bestellt“ tut nichts');
  assert.deepEqual(a.meldung.von, { name: 'Mona Mitarbeiter', kuerzel: 'mona' });
  assert.equal(a.meldung.dringend, true);
  assert.equal(b.meldung.dringend, false);
  const liste = alleMeldungen(md, ad);
  assert.deepEqual(liste.map(m => m.id), ['F-002', 'F-001'], 'neueste zuerst');
  assert.ok(liste.every(m => m.status === 'neu'));
  assert.equal((fs.statSync(md).mode & 0o777), 0o600, 'nur fuer den Dienst lesbar');
});

test('anlegen: zu kurz abgelehnt, Doppelklick legt nichts doppelt an', () => {
  const { md, ad } = ordner();
  assert.throws(() => meldungAnlegen(md, { text: ' ok ' }, { von: MONA, jetzt: T0 }), FehlermeldungFehler);
  const erst = meldungAnlegen(md, { text: 'Seite bleibt weiss' }, { von: MONA, jetzt: T0 });
  const zweit = meldungAnlegen(md, { text: 'Seite bleibt weiss' }, { von: MONA, jetzt: spaeter(2) });
  assert.equal(zweit.doppelt, true);
  assert.equal(zweit.meldung.id, erst.meldung.id);
  const spaeterNochmal = meldungAnlegen(md, { text: 'Seite bleibt weiss' }, { von: MONA, jetzt: spaeter(30) });
  assert.equal(spaeterNochmal.doppelt, false, 'nach zehn Minuten ist es eine neue Meldung');
  assert.equal(alleMeldungen(md, ad).length, 2);
});

test('anlegen: Technik-Angaben begrenzt, hoechstens drei Browserfehler', () => {
  const { md } = ordner();
  const { meldung } = meldungAnlegen(md, {
    text: 'Fehler beim Speichern',
    technik: { adresse: '#/einkauf?af=bestellt', browser: 'x'.repeat(500), breite: '390.4', fehler: ['a', 'b', 'c', 'd'] },
  }, { von: MONA, jetzt: T0 });
  assert.equal(meldung.technik.adresse, '#/einkauf?af=bestellt');
  assert.equal(meldung.technik.browser.length, 200);
  assert.equal(meldung.technik.breite, 390);
  assert.deepEqual(meldung.technik.fehler, ['b', 'c', 'd']);
});

test('Notzugang ohne Konto meldet als "Inhaber"', () => {
  const { md } = ordner();
  const { meldung } = meldungAnlegen(md, { text: 'Etwas geht nicht' }, { von: null, jetzt: T0 });
  assert.deepEqual(meldung.von, { name: 'Inhaber', kuerzel: null });
});

test('kaputte Datei: Fehler statt still alles zu ueberschreiben', () => {
  const { md, ad } = ordner();
  fs.writeFileSync(md, '{ kaputt');
  assert.throws(() => meldungAnlegen(md, { text: 'Neue Meldung' }, { von: MONA, jetzt: T0 }), /beschädigt/);
  assert.equal(fs.readFileSync(md, 'utf8'), '{ kaputt', 'Datei bleibt unangetastet');
  assert.throws(() => alleMeldungen(md, ad), /beschädigt/);
});

test('Abgleich: uebernommen braucht Werkbank-Eintrag, behoben behaelt ihn, nie zurueck auf neu', () => {
  const { md, ad } = ordner();
  meldungAnlegen(md, { text: 'Kundenakte laedt nicht' }, { von: MONA, jetzt: T0 });
  assert.throws(() => abgleichSetzen(md, ad, 'F-001', { status: 'uebernommen' }, { jetzt: spaeter(5) }), /Werkbank-Eintrag fehlt/);
  assert.throws(() => abgleichSetzen(md, ad, 'F-009', { status: 'uebernommen', werkbankId: 'F-009' }), /gibt es nicht/);
  assert.throws(() => abgleichSetzen(md, ad, 'F-001', { status: 'neu', werkbankId: 'F-001' }), /Unbekannter Status/);

  abgleichSetzen(md, ad, 'F-001', { status: 'uebernommen', werkbankId: 'F-001' }, { jetzt: spaeter(5) });
  let m = alleMeldungen(md, ad)[0];
  assert.equal(m.status, 'uebernommen');
  assert.equal(m.uebernommenAm, spaeter(5).toISOString());
  assert.equal(m.erledigtAm, null);

  abgleichSetzen(md, ad, 'F-001', { status: 'behoben', ergebnis: 'Laedt wieder (PR #1)' }, { jetzt: spaeter(60) });
  m = alleMeldungen(md, ad)[0];
  assert.equal(m.status, 'behoben');
  assert.equal(m.werkbankId, 'F-001', 'Werkbank-Eintrag bleibt erhalten');
  assert.equal(m.uebernommenAm, spaeter(5).toISOString());
  assert.equal(m.erledigtAm, spaeter(60).toISOString());
  assert.equal(m.ergebnis, 'Laedt wieder (PR #1)');
  assert.equal(JSON.parse(fs.readFileSync(md, 'utf8')).meldungen[0].status, undefined, 'die Meldungsdatei schreibt nur der Server');
});

test('Sichtbarkeit: Mitarbeiter nur eigene, Inhaber und Notzugang alle; keine Technik-Angaben im Browser', () => {
  const { md, ad } = ordner();
  meldungAnlegen(md, { text: 'Von Mona', technik: { browser: 'Safari' } }, { von: MONA, jetzt: T0 });
  meldungAnlegen(md, { text: 'Von Lena' }, { von: LENA, jetzt: spaeter(1) });
  meldungAnlegen(md, { text: 'Vom Notzugang' }, { von: null, jetzt: spaeter(2) });
  const liste = alleMeldungen(md, ad);
  assert.deepEqual(sichtbareMeldungen(liste, MONA).map(m => m.text), ['Von Mona']);
  assert.deepEqual(sichtbareMeldungen(liste, LENA).map(m => m.text), ['Von Lena']);
  assert.equal(sichtbareMeldungen(liste, { name: 'Ina', kuerzel: 'ina', rolle: 'inhaber' }).length, 3);
  assert.equal(sichtbareMeldungen(liste, null).length, 3);
  assert.equal(sichtbareMeldungen(liste, { name: 'Ohne', kuerzel: null, rolle: 'mitarbeiter' }).length, 0, 'ohne Kuerzel keine fremden Meldungen');
  // Gemeinsamer Zugang: die Sitzung liefert "Inhaber" ohne Kuerzel - eigen sind die ohne Kuerzel.
  const gemeinsam = sichtbareMeldungen(liste, { name: 'Inhaber', kuerzel: null, rolle: 'inhaber' });
  assert.equal(gemeinsam.length, 3);
  assert.deepEqual(gemeinsam.filter(m => m.eigen).map(m => m.text), ['Vom Notzugang']);
  assert.deepEqual(sichtbareMeldungen(liste, MONA).map(m => m.eigen), [true]);
  const eine = sichtbareMeldungen(liste, MONA)[0];
  assert.equal(eine.statusLabel, 'Gemeldet');
  assert.equal(eine.technik, undefined);
});

test('Skript: abgleich liefert neue (aelteste zuerst) und laufende; Statuswechsel per Befehl', () => {
  const { dir, md, ad } = ordner();
  const vorher = process.env.TP_PRIVAT_DIR;
  process.env.TP_PRIVAT_DIR = dir;
  try {
    meldungAnlegen(md, { text: 'Erste Meldung', ort: 'Heute' }, { von: MONA, jetzt: T0 });
    meldungAnlegen(md, { text: 'Zweite Meldung' }, { von: LENA, jetzt: spaeter(1) });
    const ausgabe = [];
    const io = { aus: t => ausgabe.push(t), fehler: t => ausgabe.push(`FEHLER ${t}`) };

    assert.equal(main(['abgleich'], io), 0);
    let d = JSON.parse(ausgabe.pop());
    assert.deepEqual(d.neu.map(m => m.id), ['F-001', 'F-002']);
    assert.equal(d.neu[0].von, 'Mona Mitarbeiter');
    assert.equal(d.neu[0].ort, 'Heute');
    assert.deepEqual(d.laufend, []);

    assert.equal(main(['uebernommen', 'F-001', '--werkbank', 'F-001'], io), 0);
    assert.equal(main(['uebernommen', 'F-002'], io), 1, 'ohne --werkbank abgelehnt');
    assert.match(ausgabe.pop(), /FEHLER Werkbank-Eintrag fehlt/);
    main(['abgleich'], io);
    d = JSON.parse(ausgabe.pop());
    assert.deepEqual(d.neu.map(m => m.id), ['F-002']);
    assert.deepEqual(d.laufend, [{ id: 'F-001', werkbankId: 'F-001' }]);

    assert.equal(main(['behoben', 'F-001', '--ergebnis', 'Geht wieder'], io), 0);
    const nachher = abgleichDaten(alleMeldungen(md, ad));
    assert.deepEqual(nachher.laufend, []);
    assert.deepEqual(nachher.kuerzlichErledigt, [{ id: 'F-001', werkbankId: 'F-001', status: 'behoben' }]);
    const inVierTagen = new Date(Date.now() + 4 * 86_400_000);
    assert.deepEqual(abgleichDaten(alleMeldungen(md, ad), inVierTagen).kuerzlichErledigt, [], 'nach drei Tagen nicht mehr pruefen');
    // In der Werkbank wieder geoeffnet: zurueck auf "Bei der Technik", Ergebnis weg.
    assert.equal(main(['uebernommen', 'F-001'], io), 0);
    const wieder = alleMeldungen(md, ad).find(m => m.id === 'F-001');
    assert.equal(wieder.status, 'uebernommen');
    assert.equal(wieder.ergebnis, '');
    assert.equal(main(['behoben', 'F-001', '--ergebnis', 'Geht wieder'], io), 0);
    assert.equal(main(['zeige', 'F-002'], io), 0);
    assert.equal(JSON.parse(ausgabe.pop()).text, 'Zweite Meldung');
    assert.equal(main(['zeige', 'F-099'], io), 1);
    assert.equal(main(['quatsch'], io), 2);
    assert.equal(main(['liste'], io), 0);
    assert.ok(ausgabe.some(z => /F-001 .*Behoben/.test(z)));
  } finally {
    if (vorher === undefined) delete process.env.TP_PRIVAT_DIR; else process.env.TP_PRIVAT_DIR = vorher;
  }
});

test('Stand aus der Werkbank: erledigt, kein Fehler, wieder geoeffnet, gestartet, unveraendert', () => {
  const m = (status, ergebnis = '', werkbankStatus = null) => ({ status, ergebnis, werkbankStatus });
  assert.deepEqual(standAusWerkbank(m('uebernommen', '', 'in-arbeit'), { status: 'in-arbeit' }), null);
  assert.deepEqual(standAusWerkbank(m('uebernommen', '', 'als-naechstes'), { status: 'in-arbeit' }), { status: 'uebernommen', ergebnis: '', werkbankStatus: 'in-arbeit' }, 'Starten in der Werkbank');
  assert.deepEqual(standAusWerkbank(m('uebernommen'), { status: 'erledigt', ergebnis: ' Geht wieder ' }), { status: 'behoben', ergebnis: 'Geht wieder', werkbankStatus: 'erledigt' });
  assert.deepEqual(standAusWerkbank(m('uebernommen'), { status: 'erledigt' }), { status: 'behoben', ergebnis: 'Behoben.', werkbankStatus: 'erledigt' });
  assert.deepEqual(standAusWerkbank(m('uebernommen'), { status: 'verworfen' }), { status: 'verworfen', ergebnis: 'Geprüft, keine Änderung nötig.', werkbankStatus: 'verworfen' });
  assert.deepEqual(standAusWerkbank(m('behoben', 'Geht wieder'), { status: 'erledigt', ergebnis: 'Geht wieder' }), null, 'schon eingetragen');
  assert.deepEqual(standAusWerkbank(m('behoben', 'Geht wieder'), { status: 'erledigt', ergebnis: 'Geht wieder, PR #5' }), { status: 'behoben', ergebnis: 'Geht wieder, PR #5', werkbankStatus: 'erledigt' }, 'Ergebnis nachgebessert');
  assert.deepEqual(standAusWerkbank(m('behoben', 'x'), { status: 'als-naechstes' }), { status: 'uebernommen', ergebnis: '', werkbankStatus: 'als-naechstes' }, 'wieder geoeffnet');
});

test('Statustext fuer den Melder folgt dem Werkbank-Stand', () => {
  assert.equal(statusText({ status: 'neu' }), 'Gemeldet');
  assert.equal(statusText({ status: 'uebernommen', werkbankStatus: 'als-naechstes' }), 'Bei der Technik');
  assert.equal(statusText({ status: 'uebernommen', werkbankStatus: 'in-arbeit' }), 'Wird bearbeitet');
  assert.equal(statusText({ status: 'uebernommen', werkbankStatus: 'wartet-inhaber' }), 'Wartet auf Entscheidung');
  assert.equal(statusText({ status: 'behoben', werkbankStatus: 'erledigt' }), 'Behoben');
  assert.equal(statusText({ status: 'verworfen' }), 'Geprüft, keine Änderung');
});

// Kleinste gueltige Bilddateien: nur die Kopfbytes zaehlen fuer die Erkennung.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPG = Buffer.from('ffd8ffe000104a464946000101', 'hex');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

test('Bildschirmfotos: nur echte Bilder, hoechstens drei, Datei mit eigener Nummer', () => {
  assert.equal(bildAusUpload({ daten: PNG.toString('base64') }).ext, 'png');
  assert.equal(bildAusUpload({ daten: JPG.toString('base64') }).ext, 'jpg');
  assert.equal(bildAusUpload({ daten: WEBP.toString('base64') }).ext, 'webp');
  assert.throws(() => bildAusUpload({ daten: Buffer.from('<svg onload=alert(1)>').toString('base64'), typ: 'image/png' }), /Nur Bilder/, 'Typangabe des Browsers zaehlt nicht');
  assert.throws(() => bildAusUpload({ daten: '' }), /leer/);
  assert.throws(() => bildAusUpload({ daten: Buffer.alloc(4 * 1024 * 1024 + 1, 0xff).toString('base64') }), /zu groß/);

  const { md, ad } = ordner();
  const bilder = [bildAusUpload({ daten: PNG.toString('base64') }), bildAusUpload({ daten: JPG.toString('base64') })];
  const { meldung } = meldungAnlegen(md, { text: 'Mit Bildern', technik: { schritte: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } }, { von: MONA, jetzt: T0, bilder, version: 'abc1234' });
  assert.deepEqual(meldung.bilder, ['F-001-1.png', 'F-001-2.jpg']);
  assert.deepEqual(meldung.technik.schritte, ['b', 'c', 'd', 'e', 'f', 'g'], 'die letzten sechs');
  assert.equal(meldung.technik.version, 'abc1234');
  const datei = bildDatei(md, 'F-001-1.png');
  assert.equal(datei.typ, 'image/png');
  assert.deepEqual(fs.readFileSync(datei.pfad), PNG);
  assert.equal((fs.statSync(datei.pfad).mode & 0o777), 0o600);
  assert.equal(path.dirname(datei.pfad), bilderOrdner(md));
  assert.throws(() => bildDatei(md, '../benutzer.json'), /Unbekanntes Bild/);
  assert.throws(() => bildDatei(md, 'F-001-1.svg'), /Unbekanntes Bild/);
  assert.equal(alleMeldungen(md, ad)[0].bilder.length, 2);
  assert.equal(sichtbareMeldungen(alleMeldungen(md, ad), MONA)[0].bilder, 2);
  assert.throws(() => meldungAnlegen(md, { text: 'Zu viele Bilder' }, { von: MONA, jetzt: spaeter(20), bilder: [...bilder, ...bilder] }), /Höchstens 3/);
});

test('Skript werkbank-stand: liest gespeicherte Eintraege, meldet fehlende, schreibt nur Aenderungen', () => {
  const { dir, md, ad } = ordner();
  const wb = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-werkbank-items-'));
  for (const t of ['Eins', 'Zwei', 'Drei']) meldungAnlegen(md, { text: `Meldung ${t}` }, { von: MONA, jetzt: T0 });
  for (const id of ['F-001', 'F-002', 'F-003']) abgleichSetzen(md, ad, id, { status: 'uebernommen', werkbankId: id });
  fs.writeFileSync(path.join(wb, 'F-001.json'), JSON.stringify({ status: 'erledigt', ergebnis: 'Knopf geht wieder', art: 'fehler' }));
  fs.writeFileSync(path.join(wb, 'F-002.json'), JSON.stringify({ status: 'in-arbeit', art: 'fehler' }));
  const r = werkbankStand(md, ad, wb);
  assert.deepEqual(r, { geaendert: [{ id: 'F-001', status: 'behoben', werkbank: 'erledigt' }, { id: 'F-002', status: 'uebernommen', werkbank: 'in-arbeit' }], unveraendert: [], fehlt: ['F-003'] });
  assert.equal(statusText(alleMeldungen(md, ad).find(x => x.id === 'F-002')), 'Wird bearbeitet');
  const f1 = alleMeldungen(md, ad).find(x => x.id === 'F-001');
  assert.equal(f1.ergebnis, 'Knopf geht wieder');
  assert.deepEqual(werkbankStand(md, ad, wb).geaendert, [], 'zweiter Lauf aendert nichts');
  assert.throws(() => werkbankStand(md, ad, path.join(dir, 'gibtsnicht')), /gibt es nicht/);
});
