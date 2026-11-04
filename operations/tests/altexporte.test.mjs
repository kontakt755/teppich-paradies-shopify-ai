import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PAPIERKORB, PROTOKOLL, inPapierkorb, nameSperre, papierkorbLeeren, papierkorbStand, pruefeListe, zurueckholen } from '../lib/altexporte.mjs';
import { NICHT_GESICHERT, SICHERUNGSPFADE } from '../scripts/sicherung.mjs';

const JETZT = new Date('2026-11-04T12:00:00Z');
const vor = tage => new Date(JETZT.getTime() - tage * 86_400_000);
const SKRIPT = fileURLToPath(new URL('../scripts/altexporte.mjs', import.meta.url));
const LISTE = JSON.parse(fs.readFileSync(new URL('../altexporte-ordner.json', import.meta.url), 'utf8'));

function aufbau() {
  const privatDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-altexporte-'));
  const ordner = (name, tage) => {
    const d = path.join(privatDir, name);
    fs.mkdirSync(path.join(d, 'unter'), { recursive: true });
    const f = path.join(d, 'unter', 'orders.json');
    fs.writeFileSync(f, '{"testdaten":true}');
    for (const p of [f, path.join(d, 'unter'), d]) fs.utimesSync(p, vor(tage), vor(tage));
  };
  ordner('alt', 40); ordner('jung', 5); ordner('nicht-gelistet', 200);
  return { privatDir, ordner };
}
const befund = (privatDir, liste = ['alt', 'jung', 'fehlt-hier']) => pruefeListe({ privatDir, liste, geschuetzt: SICHERUNGSPFADE, jetzt: JETZT });

test('Das Protokoll ist gesichert, der Papierkorb bewusst nicht', () => {
  assert.ok(SICHERUNGSPFADE.includes(PROTOKOLL));
  assert.ok(NICHT_GESICHERT[PAPIERKORB]);
});

test('Pruefen aendert nichts und trennt faellig, zu jung und fehlend', () => {
  const { privatDir } = aufbau();
  const vorher = fs.readdirSync(privatDir).sort();
  const b = befund(privatDir);
  assert.deepEqual(b.map(x => [x.name, x.stand]), [['alt', 'faellig'], ['jung', 'zu-jung'], ['fehlt-hier', 'fehlt']]);
  assert.equal(b[0].dateien, 1);
  assert.deepEqual(fs.readdirSync(privatDir).sort(), vorher);
});

test('Eine einzige junge Datei haelt den ganzen Ordner zurueck', () => {
  const { privatDir } = aufbau();
  fs.writeFileSync(path.join(privatDir, 'alt', 'unter', 'neu.txt'), 'x');
  fs.utimesSync(path.join(privatDir, 'alt', 'unter', 'neu.txt'), vor(2), vor(2));
  assert.equal(befund(privatDir, ['alt'])[0].stand, 'zu-jung');
});

test('Gesperrt: Pfade, Verknuepfungen, Dateien, gesicherte Betriebsdaten und der Papierkorb', () => {
  const { privatDir } = aufbau();
  for (const n of ['../alt', 'a/b', '.', '..', '', '.versteckt', PAPIERKORB, 'bestelluebersicht', 'kennzahlen', 'auftragsstatus.json']) {
    assert.ok(nameSperre(n, SICHERUNGSPFADE), n);
  }
  fs.symlinkSync(path.join(privatDir, 'alt'), path.join(privatDir, 'verweis'));
  fs.writeFileSync(path.join(privatDir, 'datei.json'), '{}');
  assert.deepEqual(befund(privatDir, ['verweis', 'datei.json']).map(x => x.stand), ['gesperrt', 'gesperrt']);
  assert.ok(fs.existsSync(path.join(privatDir, 'alt')));
});

test('Eine Verknuepfung im Ordner wird nicht verfolgt', () => {
  const { privatDir } = aufbau();
  const zielDatei = path.join(privatDir, 'jung', 'unter', 'orders.json');
  fs.symlinkSync(zielDatei, path.join(privatDir, 'alt', 'link.json'));
  fs.lutimesSync(path.join(privatDir, 'alt', 'link.json'), vor(40), vor(40));
  fs.utimesSync(path.join(privatDir, 'alt'), vor(40), vor(40));
  assert.equal(befund(privatDir, ['alt'])[0].stand, 'faellig');
});

test('Rueckweg: Papierkorb und zurueck ergibt denselben Inhalt, Nicht-Gelistetes bleibt', () => {
  const { privatDir } = aufbau();
  const r = inPapierkorb({ privatDir, befund: befund(privatDir), jetzt: JETZT });
  assert.deepEqual(r, ['alt']);
  assert.ok(!fs.existsSync(path.join(privatDir, 'alt')));
  assert.ok(fs.existsSync(path.join(privatDir, PAPIERKORB, 'alt', 'unter', 'orders.json')));
  assert.equal(fs.statSync(path.join(privatDir, PAPIERKORB)).mode & 0o777, 0o700);
  assert.ok(fs.existsSync(path.join(privatDir, 'jung')) && fs.existsSync(path.join(privatDir, 'nicht-gelistet')));
  zurueckholen({ privatDir, name: 'alt', jetzt: JETZT });
  assert.equal(fs.readFileSync(path.join(privatDir, 'alt', 'unter', 'orders.json'), 'utf8'), '{"testdaten":true}');
  assert.throws(() => zurueckholen({ privatDir, name: 'alt' }), /Nicht im Papierkorb/);
  const protokoll = fs.readFileSync(path.join(privatDir, PROTOKOLL), 'utf8').trim().split('\n').map(z => JSON.parse(z).was);
  assert.deepEqual(protokoll, ['papierkorb', 'zurueck']);
});

test('Zurueckholen ueberschreibt nichts und nimmt keine Pfade an', () => {
  const { privatDir, ordner } = aufbau();
  inPapierkorb({ privatDir, befund: befund(privatDir), jetzt: JETZT });
  ordner('alt', 1);
  assert.throws(() => zurueckholen({ privatDir, name: 'alt' }), /schon etwas/);
  assert.throws(() => zurueckholen({ privatDir, name: '../alt' }), /kein einfacher/);
});

test('Endgueltig entfernt nur Abgelaufenes aus dem Papierkorb, sonst nichts', () => {
  const { privatDir } = aufbau();
  inPapierkorb({ privatDir, befund: befund(privatDir), jetzt: JETZT });
  const naechsteWoche = tage => new Date(JETZT.getTime() + tage * 86_400_000);
  assert.deepEqual(papierkorbLeeren({ privatDir, jetzt: naechsteWoche(6) }), []);
  assert.ok(fs.existsSync(path.join(privatDir, PAPIERKORB, 'alt')));
  assert.deepEqual(papierkorbLeeren({ privatDir, jetzt: naechsteWoche(7) }), ['alt']);
  assert.deepEqual(papierkorbStand({ privatDir }), []);
  assert.ok(fs.existsSync(path.join(privatDir, 'jung')) && fs.existsSync(path.join(privatDir, 'nicht-gelistet')));
});

test('Aufruf ohne Flag ist Trockenlauf; unbekannte Flags brechen ab', () => {
  const { privatDir } = aufbau();
  const vorher = fs.readdirSync(privatDir).sort();
  const lauf = (...a) => spawnSync(process.execPath, [SKRIPT, ...a], { env: { ...process.env, TP_PRIVAT_DIR: privatDir }, encoding: 'utf8' });
  const r = lauf();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Trockenlauf: nichts geaendert/);
  assert.deepEqual(fs.readdirSync(privatDir).sort(), vorher);
  assert.equal(lauf('--loeschen').status, 2);
  assert.equal(lauf('--verschieben', '--endgueltig').status, 2);
  assert.equal(lauf('--zurueck').status, 2);
  assert.deepEqual(fs.readdirSync(privatDir).sort(), vorher);
});

test('Die Ordnerliste enthaelt nur einfache Namen und keine gesicherten Betriebsdaten', () => {
  assert.ok(LISTE.ordner.length > 0);
  assert.equal(new Set(LISTE.ordner).size, LISTE.ordner.length);
  for (const n of LISTE.ordner) assert.equal(nameSperre(n, SICHERUNGSPFADE), null, n);
});
