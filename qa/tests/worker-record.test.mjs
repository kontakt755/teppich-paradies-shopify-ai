import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { WORKER_RECORD_MAX_CHARS, writeWorkerRecord } from '../../automation/core/cli-agent-cycle.mjs';

// Schreibt nichts auf die Platte: io wird eingesetzt, damit der Test keine
// Laufverzeichnisse hinterlaesst.
function fakeIo() {
  const dateien = new Map();
  const verzeichnisse = [];
  return {
    dateien,
    verzeichnisse,
    mkdirSync: (dir) => { verzeichnisse.push(dir); },
    writeFileSync: (datei, inhalt) => { dateien.set(datei, inhalt); },
  };
}

function schreibe(candidate, extra = {}) {
  const io = fakeIo();
  const datei = writeWorkerRecord({ cwd: '/repo', taskId: 'AGENT-1', candidate, io, now: () => '2026-09-14T12:00:00.000Z', ...extra });
  return { io, datei, inhalt: datei ? JSON.parse(io.dateien.get(datei)) : null };
}

test('legt je Schritt eine Datei mit Phase und Runde an', () => {
  const { datei, inhalt } = schreibe({ status: 'PASS' }, { phase: 'CORRECT', round: 2 });
  assert.equal(path.basename(datei), 'worker-correct-r2.json');
  assert.equal(inhalt.phase, 'CORRECT');
  assert.equal(inhalt.round, 2);
  assert.equal(inhalt.timestamp, '2026-09-14T12:00:00.000Z');
});

test('haelt fest, welche Dateien der Schritt veraendert hat', () => {
  const { inhalt } = schreibe({ status: 'PASS', changes: [{ file: 'bin/tp' }, { file: 'qa/tests/tp.test.mjs' }] });
  assert.deepEqual(inhalt.changedFiles, ['bin/tp', 'qa/tests/tp.test.mjs']);
});

// Der Unterschied ist bei der Fehlersuche entscheidend: [] heisst belegt
// "nichts veraendert", null heisst "nicht ermittelt" (Guards abgeschaltet).
test('leere Liste und fehlende Ermittlung sind unterscheidbar', () => {
  assert.deepEqual(schreibe({ status: 'PASS', changes: [] }).inhalt.changedFiles, []);
  assert.equal(schreibe({ status: 'PASS' }).inhalt.changedFiles, null);
});

test('uebernimmt Status, Grund, Modell und Guard-Urteil', () => {
  const { inhalt } = schreibe({
    status: 'BLOCKED',
    reason: 'RISK_EXCEEDED',
    authMode: 'API',
    model: 'fable',
    effort: 'high',
    guard: { status: 'RISK_EXCEEDED', message: 'zu viele Dateien' },
  });
  assert.equal(inhalt.status, 'BLOCKED');
  assert.equal(inhalt.reason, 'RISK_EXCEEDED');
  assert.equal(inhalt.authMode, 'API');
  assert.equal(inhalt.model, 'fable');
  assert.equal(inhalt.effort, 'high');
  assert.equal(inhalt.guardStatus, 'RISK_EXCEEDED');
  assert.equal(inhalt.guardMessage, 'zu viele Dateien');
});

test('Geheimnisse im Worker-Text werden unkenntlich gemacht', () => {
  const { inhalt } = schreibe({ status: 'PASS', result: 'Token: sk-ant-api03-GEHEIMWERT123 benutzt' });
  assert.doesNotMatch(inhalt.result, /GEHEIMWERT123/);
  assert.match(inhalt.result, /geschützt/);
});

test('langer Worker-Text wird gekuerzt', () => {
  const { inhalt } = schreibe({ status: 'PASS', result: 'x'.repeat(WORKER_RECORD_MAX_CHARS + 500) });
  assert.ok(inhalt.result.length <= WORKER_RECORD_MAX_CHARS);
});

// Protokollieren ist Nebensache: ein Schreibfehler darf den Lauf nie stoppen.
test('ein Schreibfehler wirft nicht, sondern liefert null', () => {
  const io = {
    mkdirSync: () => { throw new Error('ENOSPC: kein Platz'); },
    writeFileSync: () => { throw new Error('darf nicht erreicht werden'); },
  };
  assert.doesNotThrow(() => {
    assert.equal(writeWorkerRecord({ cwd: '/repo', taskId: 'AGENT-1', candidate: { status: 'PASS' }, io }), null);
  });
});
