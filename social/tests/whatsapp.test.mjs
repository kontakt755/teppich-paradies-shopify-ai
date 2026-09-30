import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { pruefe } from '../lib/freigabe.mjs';
import { gruppiere, leseGruppe, liesStand, uebernimmWhatsApp, WhatsAppFehler, zuDatum } from '../lib/whatsapp.mjs';
import { testDb, tmpDir } from './_hilfe.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const APPLE = d => new Date(d).getTime() / 1000 - 978307200;

/** Nachbau der Chat-Datenbank der WhatsApp-Mac-App - nur die Spalten, die gelesen werden. */
function waNachbau(t, { gruppen = [['Baustellen-Team', 'g1@g.us']], nachrichten = [], ohnePushname = false } = {}) {
  const quelle = tmpDir(t);
  const sql = new DatabaseSync(path.join(quelle, 'ChatStorage.sqlite'));
  sql.exec(`CREATE TABLE ZWACHATSESSION (Z_PK INTEGER PRIMARY KEY, ZPARTNERNAME TEXT, ZCONTACTJID TEXT);
    CREATE TABLE ZWAMESSAGE (Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER, ZMESSAGEDATE REAL, ZMESSAGETYPE INTEGER, ZISFROMME INTEGER, ZMEDIAITEM INTEGER, ZGROUPMEMBER INTEGER);
    CREATE TABLE ZWAMEDIAITEM (Z_PK INTEGER PRIMARY KEY, ZMEDIALOCALPATH TEXT);
    CREATE TABLE ZWAGROUPMEMBER (Z_PK INTEGER PRIMARY KEY, ZMEMBERJID TEXT, ZCONTACTNAME TEXT);
    ${ohnePushname ? '' : 'CREATE TABLE ZWAPROFILEPUSHNAME (ZJID TEXT, ZPUSHNAME TEXT);'}`);
  gruppen.forEach(([name, jid], i) => sql.prepare('INSERT INTO ZWACHATSESSION VALUES (?, ?, ?)').run(i + 1, name, jid));
  sql.prepare('INSERT INTO ZWACHATSESSION VALUES (?, ?, ?)').run(99, 'Mehmet privat', '49170@s.whatsapp.net');
  sql.prepare('INSERT INTO ZWAGROUPMEMBER VALUES (1, ?, ?)').run('4917011@s.whatsapp.net', 'Mehmet');
  sql.prepare('INSERT INTO ZWAGROUPMEMBER VALUES (2, ?, NULL)').run('4917022@s.whatsapp.net');
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
    sql.prepare('INSERT INTO ZWAMESSAGE VALUES (?, ?, ?, ?, ?, ?, ?)').run(n.pk, n.chat ?? 1, APPLE(n.zeit), n.typ ?? 1, n.vonMir ? 1 : 0, medium, n.vonMir ? null : (n.wer ?? 1));
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

test('Gruppieren: je Absender, neue Baustelle nach mehr als drei Stunden Pause', () => {
  const n = (pk, absender, zeit) => ({ pk, absender, datum: new Date(zeit) });
  const g = gruppiere([n(1, 'A', '2026-09-30T08:00Z'), n(2, 'B', '2026-09-30T08:05Z'), n(3, 'A', '2026-09-30T10:30Z'), n(4, 'A', '2026-09-30T14:00Z')]);
  assert.deepEqual(g.map(x => [x.absender, x.nachrichten.map(y => y.pk)]), [['A', [1, 3]], ['B', [2]], ['A', [4]]]);
});

test('Uebernahme: Baustelle ohne Einwilligung, Freigabe gesperrt, kein zweites Mal', (t) => {
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
  assert.equal(inhalt.einwilligung, 0); assert.equal(inhalt.quelle, 'baustelle'); assert.equal(inhalt.eingereicht_von, 'Mehmet');
  assert.equal(inhalt.daten.ortBekannt, false);
  assert.deepEqual(geprueft, r.neu.map(x => x.id), 'jede Baustelle wird sofort geprueft');
  const medien = db.medien(inhalt.id);
  assert.deepEqual(medien.map(m => path.basename(m.pfad)), ['01.jpg', '02.jpg']);
  assert.ok(fs.existsSync(path.join(dir, medien[0].pfad)));
  assert.match(pruefe({ beitrag: { format: 'feed', text: 'x', plattformen: ['instagram'] }, inhalt, medien: [] }).sperren.join(), /Einwilligung/);
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
  // 12:00: Mehmet schickte vor zwei Stunden - wartet noch (drei Stunden Ruhe). Jonas' Bild von 11:50 wartet auch.
  let r = uebernimmWhatsApp(db, { env: env(quelle), dir, jetzt: new Date('2026-09-30T12:00:00Z'), pruefe: ohnePruefung });
  assert.equal(r.neu.length, 0); assert.equal(r.fehlend, 1, 'altes Bild ohne Datei wird uebersprungen');
  assert.equal(liesStand(dir).letzterPk, 0, 'Nachricht 1 wartet - der Stand darf nicht an ihr vorbei');
  assert.deepEqual(liesStand(dir).erledigt, [3]);

  // 13:30: Mehmets Baustelle ist ruhig, Jonas noch nicht.
  r = uebernimmWhatsApp(db, { env: env(quelle), dir, jetzt: new Date('2026-09-30T13:30:00Z'), pruefe: ohnePruefung });
  assert.deepEqual(r.neu.map(x => x.absender), ['Mehmet']);
  assert.equal(liesStand(dir).letzterPk, 1);

  r = uebernimmWhatsApp(db, { env: env(quelle), dir, jetzt: new Date('2026-09-30T15:00:00Z'), pruefe: ohnePruefung });
  assert.deepEqual(r.neu.map(x => x.absender), ['Jonas']);
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
