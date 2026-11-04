import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kopieren, alteKopienAufraeumen, entschluesseln, neuestesArchiv, pruefsumme, fehlerVermerken, gpgPfad, STAND_DATEI } from '../scripts/sicherung-ausser-haus.mjs';
import { ausserHausStand } from '../lib/betriebszustand.mjs';

const hatGpg = (() => { try { return Boolean(gpgPfad()); } catch { return false; } })();
const SCHLUESSEL = 'test-platzhalter';
const JETZT = new Date('2026-11-04T22:00:00Z');

function aufbau() {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ausser-haus-'));
  // Kurzer Pfad fuer den gpg-agent-Socket: eigenes GNUPGHOME, nie das des Benutzers.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tpg-'));
  fs.chmodSync(home, 0o700);
  process.env.GNUPGHOME = home;
  const privatDir = path.join(wurzel, 'privat');
  const zielDir = path.join(wurzel, 'dropbox');
  fs.mkdirSync(path.join(privatDir, 'sicherungen'), { recursive: true });
  fs.mkdirSync(zielDir);
  fs.writeFileSync(path.join(privatDir, 'sicherungen', '2026-11-03.tar.gz'), 'alt');
  fs.writeFileSync(path.join(privatDir, 'sicherungen', '2026-11-04.tar.gz'), 'kundendaten-im-klartext');
  fs.writeFileSync(path.join(privatDir, 'sicherungen', 'audit-wip.tar.gz'), 'fremd');
  return { privatDir, zielDir };
}

test('neuestesArchiv nimmt nur Tagesarchive', () => {
  const { privatDir } = aufbau();
  assert.equal(path.basename(neuestesArchiv(path.join(privatDir, 'sicherungen'))), '2026-11-04.tar.gz');
});

test('Kopie ist verschluesselt, laesst sich wiederherstellen und braucht den richtigen Schluessel', { skip: !hatGpg }, () => {
  const { privatDir, zielDir } = aufbau();
  const e = kopieren({ privatDir, zielDir, schluessel: SCHLUESSEL, jetzt: JETZT });
  assert.equal(e.datei, '2026-11-04.tar.gz.gpg');
  assert.deepEqual(fs.readdirSync(zielDir), ['2026-11-04.tar.gz.gpg']);
  const ziel = path.join(zielDir, e.datei);
  assert.ok(!fs.readFileSync(ziel).includes('kundendaten-im-klartext'), 'Klartext in der Kopie');

  const zurueck = path.join(privatDir, 'zurueck.tar.gz');
  entschluesseln(ziel, zurueck, SCHLUESSEL);
  assert.equal(pruefsumme(zurueck), pruefsumme(path.join(privatDir, 'sicherungen', '2026-11-04.tar.gz')));
  assert.throws(() => entschluesseln(ziel, path.join(privatDir, 'falsch.tar.gz'), 'falscher-platzhalter'));

  const stand = fs.readFileSync(path.join(privatDir, STAND_DATEI), 'utf8');
  assert.ok(!stand.includes(SCHLUESSEL), 'Schluessel im Stand');
  assert.equal(fs.readdirSync(privatDir).filter((n) => n.startsWith('.ausser-haus-')).length, 0, 'Zwischendateien bleiben liegen');
});

test('unveraendertes Archiv wird nicht neu abgelegt, ein neuer Stand desselben Tages schon', { skip: !hatGpg }, () => {
  const { privatDir, zielDir } = aufbau();
  kopieren({ privatDir, zielDir, schluessel: SCHLUESSEL, jetzt: JETZT });
  assert.equal(kopieren({ privatDir, zielDir, schluessel: SCHLUESSEL, jetzt: JETZT }).uebersprungen, true);
  fs.writeFileSync(path.join(privatDir, 'sicherungen', '2026-11-04.tar.gz'), 'neuer-stand');
  assert.equal(kopieren({ privatDir, zielDir, schluessel: SCHLUESSEL, jetzt: JETZT }).uebersprungen, false);
});

test('fehlender Zielordner ist ein Fehler und legt nichts an', () => {
  const { privatDir, zielDir } = aufbau();
  const fehlt = path.join(zielDir, 'gibt-es-nicht');
  assert.throws(() => kopieren({ privatDir, zielDir: fehlt, schluessel: SCHLUESSEL, jetzt: JETZT, gpg: '/bin/false' }), /nicht erreichbar/);
  assert.equal(fs.existsSync(fehlt), false);
});

test('Aufraeumen loescht nur eigene Kopien jenseits der Frist', () => {
  const { zielDir } = aufbau();
  for (const n of ['2026-10-01.tar.gz.gpg', '2026-11-01.tar.gz.gpg', 'notiz.txt']) fs.writeFileSync(path.join(zielDir, n), 'x');
  assert.deepEqual(alteKopienAufraeumen(zielDir, 14, JETZT), ['2026-10-01.tar.gz.gpg']);
  assert.deepEqual(fs.readdirSync(zielDir).sort(), ['2026-11-01.tar.gz.gpg', 'notiz.txt']);
});

test('Stand: ohne Datei null, Fehlschlag sichtbar, letzter Erfolg bleibt', () => {
  const { privatDir } = aufbau();
  const datei = path.join(privatDir, STAND_DATEI);
  assert.equal(ausserHausStand(datei, JETZT), null);
  fs.writeFileSync(datei, JSON.stringify({ letzterErfolg: '2026-11-04T10:00:00.000Z' }));
  assert.equal(ausserHausStand(datei, JETZT).status, 'ok');
  fehlerVermerken(privatDir, JETZT, 'Zielordner nicht erreichbar');
  const s = ausserHausStand(datei, JETZT);
  assert.equal(s.letzterErfolg, '2026-11-04T10:00:00.000Z');
  assert.equal(s.letzterFehler.meldung, 'Zielordner nicht erreichbar');
});
