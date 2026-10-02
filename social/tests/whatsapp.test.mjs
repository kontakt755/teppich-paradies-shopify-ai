import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { pruefe } from '../lib/freigabe.mjs';
import { findeExport, gruppiere, leseExportText, leseGruppe, liesStand, uebernimmExport, uebernimmWhatsApp, WhatsAppFehler, zuDatum } from '../lib/whatsapp.mjs';
import { testDb, tmpDir } from './_hilfe.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const APPLE = d => new Date(d).getTime() / 1000 - 978307200;

/** Nachbau der Chat-Datenbank der WhatsApp-Mac-App - nur die Spalten, die gelesen werden. */
function waNachbau(t, { gruppen = [['Baustellen-Team', 'g1@g.us']], nachrichten = [], ohnePushname = false, mac26 = false } = {}) {
  const quelle = tmpDir(t);
  const sql = new DatabaseSync(path.join(quelle, 'ChatStorage.sqlite'));
  sql.exec(`CREATE TABLE ZWACHATSESSION (Z_PK INTEGER PRIMARY KEY, ZPARTNERNAME TEXT, ZCONTACTJID TEXT);
    CREATE TABLE ZWAMESSAGE (Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER, ZMESSAGEDATE REAL, ZMESSAGETYPE INTEGER, ZISFROMME INTEGER, ZMEDIAITEM INTEGER, ZGROUPMEMBER INTEGER${mac26 ? ', ZPUSHNAME TEXT' : ''});
    CREATE TABLE ZWAMEDIAITEM (Z_PK INTEGER PRIMARY KEY, ZMEDIALOCALPATH TEXT);
    CREATE TABLE ZWAGROUPMEMBER (Z_PK INTEGER PRIMARY KEY, ZMEMBERJID TEXT, ZCONTACTNAME TEXT);
    ${ohnePushname ? '' : 'CREATE TABLE ZWAPROFILEPUSHNAME (ZJID TEXT, ZPUSHNAME TEXT);'}`);
  gruppen.forEach(([name, jid], i) => sql.prepare('INSERT INTO ZWACHATSESSION VALUES (?, ?, ?)').run(i + 1, name, jid));
  sql.prepare('INSERT INTO ZWACHATSESSION VALUES (?, ?, ?)').run(99, 'Mehmet privat', '49170@s.whatsapp.net');
  if (mac26) {
    // WhatsApp fuer Mac 26: anonyme Kennungen, leere Namensfelder am Mitglied, Namen nur im Adressbuch
    sql.prepare("INSERT INTO ZWAGROUPMEMBER VALUES (1, ?, '')").run('1110001@lid');
    sql.prepare("INSERT INTO ZWAGROUPMEMBER VALUES (2, ?, '')").run('2220002@lid');
    const k = new DatabaseSync(path.join(quelle, 'ContactsV2.sqlite'));
    k.exec('CREATE TABLE ZWAADDRESSBOOKCONTACT (Z_PK INTEGER PRIMARY KEY, ZFULLNAME TEXT, ZGIVENNAME TEXT, ZLID TEXT)');
    // derselbe Kontakt doppelt: darf keine Nachricht verdoppeln
    k.prepare('INSERT INTO ZWAADDRESSBOOKCONTACT VALUES (1, ?, NULL, ?)').run('Mehmet K.', '1110001@lid');
    k.prepare('INSERT INTO ZWAADDRESSBOOKCONTACT VALUES (2, ?, NULL, ?)').run('Mehmet K.', '1110001@lid');
    k.prepare("INSERT INTO ZWAADDRESSBOOKCONTACT VALUES (3, '', '', ?)").run('2220002@lid');
    k.close();
  } else {
    sql.prepare('INSERT INTO ZWAGROUPMEMBER VALUES (1, ?, ?)').run('4917011@s.whatsapp.net', 'Mehmet');
    sql.prepare('INSERT INTO ZWAGROUPMEMBER VALUES (2, ?, NULL)').run('4917022@s.whatsapp.net');
  }
  if (!ohnePushname) sql.prepare('INSERT INTO ZWAPROFILEPUSHNAME VALUES (?, ?)').run('4917022@s.whatsapp.net', 'Jonas');
  for (const n of nachrichten) {
    let medium = null;
    if (n.typ !== 0) {
      const rel = `Media/g1@g.us/a/b/${n.pk}.${n.typ === 2 ? 'mp4' : 'jpg'}`;
      sql.prepare('INSERT INTO ZWAMEDIAITEM VALUES (?, ?)').run(n.pk, rel);
      medium = n.pk;
      if (n.datei !== false) {
        const ziel = path.join(quelle, 'Message', rel);
        fs.mkdirSync(path.dirname(ziel), { recursive: true });
        fs.writeFileSync(ziel, n.inhalt ?? JPEG);
      }
    }
    const werte = [n.pk, n.chat ?? 1, APPLE(n.zeit), n.typ ?? 1, n.vonMir ? 1 : 0, medium, n.vonMir ? null : (n.wer ?? 1)];
    if (mac26) werte.push(n.name ?? '');
    sql.prepare(`INSERT INTO ZWAMESSAGE VALUES (${werte.map(() => '?').join(', ')})`).run(...werte);
  }
  sql.close();
  return quelle;
}

const env = quelle => ({ SOCIAL_WHATSAPP_GRUPPE: 'Baustellen-Team', SOCIAL_WHATSAPP_DIR: quelle });
const ohnePruefung = () => [];

test('Lesen: nur Fotos und Videos der Gruppe, Absender mit Namen, Datei im Medienordner', (t) => {
  const quelle = waNachbau(t, { nachrichten: [
    { pk: 1, zeit: '2026-09-30T08:00:00Z', wer: 1 },
    { pk: 2, zeit: '2026-09-30T08:01:00Z', wer: 2, typ: 2 },
    { pk: 3, zeit: '2026-09-30T08:02:00Z', typ: 0 },
    { pk: 4, zeit: '2026-09-30T08:03:00Z', chat: 99 },
    { pk: 5, zeit: '2026-09-30T08:04:00Z', vonMir: true, datei: false },
  ] });
  const n = leseGruppe({ quelle, gruppe: 'Baustellen-Team' });
  assert.deepEqual(n.map(x => [x.pk, x.art, x.absender]), [[1, 'bild', 'Mehmet'], [2, 'video', 'Jonas'], [5, 'bild', 'Büro']]);
  assert.ok(n[0].datei.endsWith(path.join('Message', 'Media', 'g1@g.us', 'a', 'b', '1.jpg')));
  assert.equal(n[2].datei, null, 'noch nicht heruntergeladen');
  assert.equal(n[0].datum.toISOString(), '2026-09-30T08:00:00.000Z');
  assert.deepEqual(leseGruppe({ quelle, gruppe: 'Baustellen-Team', abPk: 1 }).map(x => x.pk), [2, 5]);
  assert.deepEqual(leseGruppe({ quelle, gruppe: 'Baustellen-Team', seit: new Date('2026-09-30T08:02:00Z') }).map(x => x.pk), [5]);
  assert.equal(zuDatum(0).toISOString(), '2001-01-01T00:00:00.000Z');
});

test('Lesen: ohne Push-Namen-Tabelle bleibt die Nummer, falsche Gruppe und fehlende Daten sind klare Fehler', (t) => {
  const quelle = waNachbau(t, { ohnePushname: true, gruppen: [['Baustellen-Team', 'g1@g.us'], ['Doppelt', 'g2@g.us'], ['Doppelt', 'g3@g.us']], nachrichten: [{ pk: 1, zeit: '2026-09-30T08:00:00Z', wer: 2 }] });
  assert.equal(leseGruppe({ quelle, gruppe: 'Baustellen-Team' })[0].absender, '4917022');
  assert.throws(() => leseGruppe({ quelle, gruppe: 'Gibt es nicht' }), /nicht gefunden/);
  assert.throws(() => leseGruppe({ quelle, gruppe: 'Doppelt' }), /Mehrere/);
  assert.throws(() => leseGruppe({ quelle: path.join(quelle, 'leer'), gruppe: 'x' }), WhatsAppFehler);
});

test('WhatsApp fuer Mac 26: Name aus dem Adressbuch ueber die @lid-Kennung, sonst "Mitglied …1234"', (t) => {
  const quelle = waNachbau(t, { mac26: true, nachrichten: [
    { pk: 1, zeit: '2026-09-30T08:00:00Z', wer: 1, name: 'IAA=' },
    { pk: 2, zeit: '2026-09-30T08:01:00Z', wer: 2, name: 'IAA=' },
  ] });
  assert.deepEqual(leseGruppe({ quelle, gruppe: 'Baustellen-Team' }).map(x => [x.pk, x.absender]), [[1, 'Mehmet K.'], [2, 'Mitglied …0002']]);
});

test('Gruppieren: je Absender, neue Baustelle nach mehr als drei Stunden Pause', () => {
  const n = (pk, absender, zeit) => ({ pk, absender, datum: new Date(zeit) });
  const g = gruppiere([n(1, 'A', '2026-09-30T08:00Z'), n(2, 'B', '2026-09-30T08:05Z'), n(3, 'A', '2026-09-30T10:30Z'), n(4, 'A', '2026-09-30T14:00Z')]);
  assert.deepEqual(g.map(x => [x.absender, x.nachrichten.map(y => y.pk)]), [['A', [1, 3]], ['B', [2]], ['A', [4]]]);
});

test('Uebernahme: Baustelle mit Einwilligung, ohne Sichtung gesperrt, kein zweites Mal', (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const quelle = waNachbau(t, { nachrichten: [
    { pk: 1, zeit: '2026-09-30T08:00:00Z', wer: 1 }, { pk: 2, zeit: '2026-09-30T08:02:00Z', wer: 1 },
    { pk: 3, zeit: '2026-09-30T08:03:00Z', wer: 1, inhalt: Buffer.from('%PDF-1.4 kein Foto') },
    { pk: 4, zeit: '2026-09-30T08:10:00Z', wer: 2 },
  ] });
  const geprueft = [];
  const jetzt = new Date('2026-09-30T12:00:00Z');
  const r = uebernimmWhatsApp(db, { env: env(quelle), dir, jetzt, pruefe: (_db, o) => { geprueft.push(o.nur); return []; } });
  assert.deepEqual(r.neu.map(x => [x.absender, x.dateien]), [['Mehmet', 2], ['Jonas', 1]]);
  assert.equal(r.fehlend, 1, 'die PDF-Datei bleibt draussen');
  const inhalt = db.inhalt(r.neu[0].id);
  assert.equal(inhalt.einwilligung, 1); assert.equal(inhalt.quelle, 'baustelle'); assert.equal(inhalt.eingereicht_von, 'Mehmet');
  assert.equal(inhalt.daten.ortBekannt, false);
  assert.deepEqual(geprueft, r.neu.map(x => x.id), 'jede Baustelle wird sofort geprueft');
  const medien = db.medien(inhalt.id);
  assert.deepEqual(medien.map(m => path.basename(m.pfad)), ['01.jpg', '02.jpg']);
  assert.ok(fs.existsSync(path.join(dir, medien[0].pfad)));
  assert.match(pruefe({ beitrag: { format: 'feed', text: 'x', plattformen: ['instagram'] }, inhalt, medien: [] }).sperren.join(), /^(?!.*Einwilligung)/);
  assert.equal(liesStand(dir).letzterPk, 4);

  const zweiter = uebernimmWhatsApp(db, { env: env(quelle), dir, jetzt, pruefe: ohnePruefung });
  assert.equal(zweiter.neu.length, 0);
  assert.equal(db.inhalte({ quelle: 'baustelle' }).length, 2);
});

test('Uebernahme wartet auf weitere Bilder und auf den Download, ohne andere Absender zu blockieren', (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  const quelle = waNachbau(t, { nachrichten: [
    { pk: 1, zeit: '2026-09-30T10:00:00Z', wer: 1 },
    { pk: 2, zeit: '2026-09-30T11:50:00Z', wer: 2 },
    { pk: 3, zeit: '2026-09-30T06:00:00Z', wer: 2, datei: false },
  ] });
  // 12:00: Mehmet schickte vor zwei Stunden - wartet noch (drei Stunden Ruhe). Jonas' Bild von 11:50 wartet auch,
  // ebenso sein Bild von 06:00, das WhatsApp noch nicht heruntergeladen hat: die Frist laeuft ab dem ersten Lauf.
  let r = uebernimmWhatsApp(db, { env: env(quelle), dir, jetzt: new Date('2026-09-30T12:00:00Z'), pruefe: ohnePruefung });
  assert.equal(r.neu.length, 0); assert.equal(r.fehlend, 0); assert.equal(r.wartet, 3);
  assert.equal(liesStand(dir).letzterPk, 0, 'alles wartet - der Stand darf nicht vorbei');
  assert.equal(liesStand(dir).beginn, '2026-09-30T12:00:00.000Z');

  // 13:30: Mehmets Baustelle ist ruhig, Jonas noch nicht.
  r = uebernimmWhatsApp(db, { env: env(quelle), dir, jetzt: new Date('2026-09-30T13:30:00Z'), pruefe: ohnePruefung });
  assert.deepEqual(r.neu.map(x => x.absender), ['Mehmet']);
  assert.equal(liesStand(dir).letzterPk, 1);

  r = uebernimmWhatsApp(db, { env: env(quelle), dir, jetzt: new Date('2026-09-30T15:00:00Z'), pruefe: ohnePruefung });
  assert.deepEqual(r.neu.map(x => x.absender), ['Jonas'], 'das geladene Bild von 11:50 kommt, das fehlende von 06:00 wartet weiter');
  assert.equal(liesStand(dir).letzterPk, 2, 'bis Nachricht 2 ist alles erledigt, 3 wartet'); assert.deepEqual(liesStand(dir).erledigt, []);

  // Drei Tage nach dem ersten Lauf ist die Frist um: das nie geladene Bild wird uebersprungen.
  r = uebernimmWhatsApp(db, { env: env(quelle), dir, jetzt: new Date('2026-10-03T12:01:00Z'), pruefe: ohnePruefung });
  assert.equal(r.neu.length, 0); assert.equal(r.fehlend, 1);
  assert.equal(liesStand(dir).letzterPk, 3); assert.deepEqual(liesStand(dir).erledigt, []);
});

test('Fehlender Zugriff wird einmal gemeldet, ohne Gruppe passiert nichts', (t) => {
  const db = testDb(t); const dir = tmpDir(t);
  assert.equal(uebernimmWhatsApp(db, { env: {}, dir }), null);
  const lese = () => { throw new WhatsAppFehler('macOS verweigert den Zugriff', { zugriff: true }); };
  const erster = uebernimmWhatsApp(db, { env: env('/x'), dir, lese });
  assert.equal(erster.neuerFehler, true); assert.match(erster.fehler, /verweigert/);
  assert.equal(uebernimmWhatsApp(db, { env: env('/x'), dir, lese }).neuerFehler, false, 'dieselbe Meldung nicht alle 15 Minuten');
});

// --- Chat-Export vom Handy -------------------------------------------------------

test('Export lesen: iPhone deutsch mit Steuerzeichen, nur vorhandene Foto-/Videodateien', () => {
  const text = [
    '[25.09.26, 12:25:31] Ricardo: ‎<Anhang: 00000012-PHOTO-2026-09-25-12-25-31.jpg>',
    '[25.09.26, 12:25:40] Ricardo: Lindenring 25 endschliff fertig',
    '[25.09.26, 12:26:02] Thomas Verleger: ‎<Anhang: 00000013-VIDEO-2026-09-25-12-26-02.mp4>',
    'zweite Zeile einer Nachricht',
    '[25.09.26, 12:27:00] Ricardo: ‎<Anhang: 00000014-PHOTO-fehlt.jpg>',
    '[25.09.26, 12:28:00] Ricardo: ‎<Anhang: 00000015-Angebot.pdf>',
  ].join('\n');
  const n = leseExportText(text, ['00000012-PHOTO-2026-09-25-12-25-31.jpg', '00000013-VIDEO-2026-09-25-12-26-02.mp4', '00000015-Angebot.pdf']);
  assert.deepEqual(n.map(x => [x.absender, x.art, x.datei]), [['Ricardo', 'bild', '00000012-PHOTO-2026-09-25-12-25-31.jpg'], ['Thomas Verleger', 'video', '00000013-VIDEO-2026-09-25-12-26-02.mp4']]);
  assert.equal(n[0].datum.getFullYear(), 2026); assert.equal(n[0].datum.getMonth(), 8); assert.equal(n[0].datum.getHours(), 12); assert.equal(n[0].datum.getSeconds(), 31);
});

test('Export lesen: Android deutsch und amerikanisches Datum', () => {
  const android = '25.09.26, 12:25 - Jonas: IMG-20260925-WA0001.jpg (Datei angehängt)\n25.09.26, 12:26 - Jonas: Text';
  assert.deepEqual(leseExportText(android, ['IMG-20260925-WA0001.jpg']).map(x => [x.absender, x.datei, x.datum.getDate()]), [['Jonas', 'IMG-20260925-WA0001.jpg', 25]]);
  const us = '[9/25/26, 1:05:00 PM] Ben: <attached: 00000001-PHOTO.jpg>';
  const [x] = leseExportText(us, ['00000001-PHOTO.jpg']);
  assert.equal(x.datum.getMonth(), 8); assert.equal(x.datum.getDate(), 25); assert.equal(x.datum.getHours(), 13);
});

test('Export uebernehmen: je Absender eine Baustelle, ZIP oder Ordner, kein zweites Mal', (t) => {
  const db = testDb(t); const dir = tmpDir(t); const quelle = tmpDir(t);
  const ordner = path.join(quelle, 'WhatsApp Chat - Baustellen-Team'); fs.mkdirSync(ordner);
  fs.writeFileSync(path.join(ordner, '_chat.txt'), [
    '[25.09.26, 08:00:00] Ricardo: <Anhang: a.jpg>', '[25.09.26, 08:01:00] Ricardo: <Anhang: b.jpg>',
    '[25.09.26, 08:02:00] Jonas: <Anhang: c.jpg>', '[26.09.26, 15:00:00] Ricardo: <Anhang: d.jpg>',
    '[26.09.26, 15:01:00] Ricardo: <Anhang: kein-foto.jpg>',
  ].join('\n'));
  for (const f of ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']) fs.writeFileSync(path.join(ordner, f), JPEG);
  fs.writeFileSync(path.join(ordner, 'kein-foto.jpg'), 'nur Text');
  const geprueft = [];
  const r = uebernimmExport(db, ordner, { dir, pruefe: (_db, o) => { geprueft.push(o.nur); return []; } });
  assert.equal(r.nachrichten, 5);
  assert.deepEqual(r.neu.map(b => [b.absender, b.dateien]), [['Ricardo', 2], ['Jonas', 1], ['Ricardo', 2 - 1]]);
  assert.equal(r.fehlend, 1, 'die Textdatei mit .jpg-Endung bleibt draussen');
  assert.deepEqual(geprueft, r.neu.map(b => b.id));
  const inhalt = db.inhalt(r.neu[0].id);
  assert.equal(inhalt.einwilligung, 1); assert.match(inhalt.titel, /^WhatsApp · Ricardo · 25\.09\.2026$/);
  assert.equal(inhalt.schluessel, 'whatsapp-export:a.jpg');

  // Derselbe Export noch einmal, diesmal als ZIP: nichts Neues
  const zweiter = uebernimmExport(db, path.join(quelle, 'export.zip'), { dir, pruefe: ohnePruefung, entpacke: (_zip, ziel) => fs.cpSync(ordner, path.join(ziel, 'x'), { recursive: true }) });
  assert.equal(zweiter.neu.length, 0); assert.equal(zweiter.schonDa, 3);
  assert.equal(db.inhalte({ quelle: 'baustelle' }).length, 3);
});

test('Export ohne Chatverlauf ist ein klarer Fehler, Export in Downloads wird gefunden', (t) => {
  const db = testDb(t); const leer = tmpDir(t);
  assert.throws(() => uebernimmExport(db, leer, { dir: tmpDir(t) }), /_chat\.txt/);
  const downloads = tmpDir(t);
  fs.writeFileSync(path.join(downloads, 'WhatsApp Chat - Baustellen-Team.zip'), 'zip');
  fs.writeFileSync(path.join(downloads, 'WhatsApp Chat - Andere Gruppe.zip'), 'zip');
  assert.equal(path.basename(findeExport('Baustellen-Team', downloads)), 'WhatsApp Chat - Baustellen-Team.zip');
  assert.equal(findeExport('Gibt es nicht', downloads), null);
});
