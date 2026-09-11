import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { claudeSessionBaselinePath, claudeSessionStatePath, clearClaudeSessionState, ensureClaudeSessionBaseline, readClaudeSessionBaseline, readClaudeSessionState, writeClaudeSessionState } from '../core/claude-session-state.mjs';

// Baseline vorbestehender Dateien (2026-09-11): genau einmal pro Sitzung,
// nie ueberschrieben, ueberlebt das Loeschen des Session-State.
const sitzung = ['baseline', 'session', 'fixture'].join('-');

test('Baseline wird einmal pro Sitzung angelegt und nie ueberschrieben', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-session-baseline-'));
  let captures = 0;
  const first = ensureClaudeSessionBaseline({ sessionId: sitzung, projectDir, capture: () => { captures += 1; return { ok: true, version: 1, root: '/repo', entries: { 'a.py': { codes: ['??'], hash: 'h1' } } }; } });
  assert.equal(first.created, true);
  assert.equal(first.filePath, claudeSessionBaselinePath({ sessionId: sitzung, projectDir }));
  assert.match(first.filePath, /\.router[\\/]claude-baselines[\\/][0-9a-f]{24}\.json$/);
  assert.doesNotMatch(first.filePath, new RegExp(sitzung));

  const second = ensureClaudeSessionBaseline({ sessionId: sitzung, projectDir, capture: () => { captures += 1; return { ok: true, version: 1, root: '/repo', entries: {} }; } });
  assert.equal(second.created, false);
  assert.equal(captures, 1, 'ein spaeterer Prompt erfasst den Working Tree nicht erneut');
  assert.deepEqual(readClaudeSessionBaseline({ sessionId: sitzung, projectDir }).entries, { 'a.py': { codes: ['??'], hash: 'h1' } });

  // Der Session-State wird bei PASS geloescht - die Baseline bleibt.
  writeClaudeSessionState({ sessionId: sitzung, projectDir, state: { status: 'PASS' } });
  clearClaudeSessionState({ sessionId: sitzung, projectDir });
  assert.ok(readClaudeSessionBaseline({ sessionId: sitzung, projectDir }));
});

test('Eine gescheiterte Erfassung wird gespeichert, damit kein spaeterer Prompt eine falsche Baseline anlegt', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-session-baseline-'));
  ensureClaudeSessionBaseline({ sessionId: sitzung, projectDir, capture: () => { throw new Error('git weg'); } });
  const stored = readClaudeSessionBaseline({ sessionId: sitzung, projectDir });
  assert.equal(stored.ok, false);
  assert.match(stored.error, /git weg/);
  const later = ensureClaudeSessionBaseline({ sessionId: sitzung, projectDir, capture: () => ({ ok: true, version: 1, root: '/repo', entries: {} }) });
  assert.equal(later.created, false);
});

test('Baseline lesen: fehlend, kaputt oder ohne Sitzungs-ID ergibt null statt Exception', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-session-baseline-'));
  assert.equal(readClaudeSessionBaseline({ sessionId: sitzung, projectDir }), null);
  const filePath = claudeSessionBaselinePath({ sessionId: sitzung, projectDir });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '{kaputt');
  assert.equal(readClaudeSessionBaseline({ sessionId: sitzung, projectDir }), null);
  assert.equal(readClaudeSessionBaseline({ sessionId: undefined, projectDir }), null);
  const ohneId = ensureClaudeSessionBaseline({ sessionId: undefined, projectDir, capture: () => { throw new Error('darf nicht laufen'); } });
  assert.equal(ohneId.created, false);
  assert.equal(ohneId.filePath, null);
});

test('Claude session review state uses a hashed filename and supports write-read-clear', () => {
  const files = new Map();
  const io = {
    mkdirSync: () => {},
    writeFileSync: (file, value) => files.set(file, value),
    readFileSync: file => files.get(file),
    existsSync: file => files.has(file),
    unlinkSync: file => files.delete(file),
  };
  // Aus Teilen gebaut, damit der Secret-Scan nicht auf dem eigenen Fixture
  // anschlaegt - gleiches Muster wie in secret-scan.test.mjs.
  const sessionId = ['private', 'session', 'id'].join('-');
  const input = { sessionId, projectDir: '/project' };
  const filePath = claudeSessionStatePath(input);
  assert.doesNotMatch(filePath, new RegExp(sessionId));
  writeClaudeSessionState({ ...input, state: { status: 'PENDING_REVIEW' }, io });
  assert.equal(readClaudeSessionState({ ...input, io }).state.status, 'PENDING_REVIEW');
  clearClaudeSessionState({ ...input, io });
  assert.equal(readClaudeSessionState({ ...input, io }), null);
});
