import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../scripts/datenstand-pruefen.mjs';
import { liesStatus, routinenStand } from '../lib/routinen.mjs';

const JETZT = new Date('2026-10-26T12:00:00Z');
const vor = min => new Date(JETZT.getTime() - min * 60_000).toISOString();

function umgebung(aktualisierung) {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-datenstand-'));
  if (aktualisierung) fs.writeFileSync(path.join(privat, 'aktualisierung.json'), JSON.stringify(aktualisierung));
  return { privat, env: { TP_PRIVAT_DIR: privat } };
}

test('Datenstand frisch: Status ok mit letztem Erfolg, keine Mitteilung', () => {
  const { privat, env } = umgebung({ aktualisiertAm: vor(5), teile: { bestellungen: { zeitpunkt: vor(5), erfolg: true } } });
  const mitteilungen = [];
  assert.equal(main([], { env, jetzt: JETZT, aus: () => {}, melde: (...m) => mitteilungen.push(m) }), 0);
  const s = liesStatus(privat, 'daten-gesundheit');
  assert.equal(s.ok, true);
  assert.equal(s.letzterErfolg, JETZT.toISOString());
  assert.deepEqual(mitteilungen, []);
  assert.ok(fs.existsSync(path.join(privat, 'routinen', 'datenstand', 'status.json')));
});

test('Datenstand alt: Fehler, Mitteilung nur beim ersten Mal; --trocken schreibt nichts', () => {
  const { privat, env } = umgebung({ aktualisiertAm: vor(90), teile: {} });
  const mitteilungen = [];
  const deps = { env, jetzt: JETZT, aus: () => {}, melde: (t, m) => mitteilungen.push([t, m]) };
  assert.equal(main(['--trocken'], deps), 1);
  assert.equal(fs.existsSync(path.join(privat, 'routinen')), false);
  assert.equal(main([], deps), 1);
  assert.equal(main([], { ...deps, jetzt: new Date(JETZT.getTime() + 3_600_000) }), 1);
  assert.equal(mitteilungen.length, 1);
  assert.equal(mitteilungen[0][0], 'Datenstand des Sync-Dienstes');
  assert.equal(liesStatus(privat, 'daten-gesundheit').art, 'alt');
  // Im Control Center: eingerichtet (Plist da) und gestoert.
  const agents = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-agents-'));
  fs.writeFileSync(path.join(agents, 'net.teppich-paradies.datenstand.plist'), '');
  const [r] = routinenStand(privat, { jetzt: JETZT, agentsDir: agents });
  assert.deepEqual([r.id, r.ok, r.art], ['daten-gesundheit', false, 'alt']);
});

test('Datenstand: fehlende Datei ist ein Fehler, unbekanntes Argument Exit 2', () => {
  const { privat, env } = umgebung(null);
  assert.equal(main([], { env, jetzt: JETZT, aus: () => {}, melde: () => {} }), 1);
  assert.equal(liesStatus(privat, 'daten-gesundheit').art, 'fehlt');
  assert.equal(main(['--jetzt'], { env, aus: () => {}, fehler: () => {} }), 2);
});
