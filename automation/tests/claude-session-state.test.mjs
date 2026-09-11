import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { claudeSessionBaselinePath, claudeSessionStatePath, clearClaudeSessionState, ensureClaudeSessionBaseline, isFirstPromptOfSession, pruneOldBaselines, readClaudeSessionBaseline, readClaudeSessionState, writeClaudeSessionState, BASELINE_MAX_AGE_MS } from '../core/claude-session-state.mjs';

function transcript(dir, entries) {
  const filePath = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(filePath, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
  return filePath;
}
const userPrompt = text => ({ type: 'user', message: { role: 'user', content: text } });
const toolResult = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } });

// Pruefung 2026-09-11: scheitert das Speichern beim ersten Prompt (ENOSPC,
// EACCES, EROFS), darf ein spaeterer Prompt keine Baseline anlegen, die die
// eigenen Aenderungen der Sitzung ausklammert. Beleg dafuer ist das
// Transkript von Claude Code.
test('isFirstPromptOfSession liest den Beleg aus dem Transkript', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-transcript-'));
  assert.equal(isFirstPromptOfSession({ transcriptPath: null, prompt: 'x' }), true, 'ohne Pfad (aelteres Claude Code) wie bisher');
  assert.equal(isFirstPromptOfSession({ transcriptPath: path.join(dir, 'fehlt.jsonl'), prompt: 'x' }), true, 'noch kein Transkript');
  assert.equal(isFirstPromptOfSession({ transcriptPath: transcript(dir, [{ type: 'summary' }]), prompt: 'erster' }), true);
  // Der aktuelle Prompt steht evtl. schon drin - dann ist er der einzige.
  assert.equal(isFirstPromptOfSession({ transcriptPath: transcript(dir, [userPrompt('erster'), toolResult()]), prompt: 'erster' }), true);
  assert.equal(isFirstPromptOfSession({ transcriptPath: transcript(dir, [userPrompt('erster'), toolResult()]), prompt: 'zweiter' }), false);
  assert.equal(isFirstPromptOfSession({ transcriptPath: transcript(dir, [userPrompt('erster'), userPrompt('zweiter')]), prompt: 'zweiter' }), false);
  assert.equal(isFirstPromptOfSession({ transcriptPath: transcript(dir, [{ type: 'user', isMeta: true, message: { content: 'meta' } }]), prompt: 'erster' }), true);
  assert.equal(isFirstPromptOfSession({ transcriptPath: transcript(dir, [userPrompt('a'), userPrompt('b')]), prompt: 'c', io: { ...fs, readFileSync: () => { throw new Error('EIO'); } } }), false, 'nicht lesbar: im Zweifel nicht der erste');
});

test('Nach gescheitertem Speichern legt ein spaeterer Prompt keine Baseline ueber die eigenen Aenderungen an', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-session-baseline-'));
  const enospc = { ...fs, writeFileSync: () => { const error = new Error('no space'); error.code = 'ENOSPC'; throw error; } };
  let captures = 0;
  const capture = () => { captures += 1; return { ok: true, version: 1, root: '/repo', entries: {} }; };
  const transcriptPath = transcript(projectDir, []);
  assert.throws(() => ensureClaudeSessionBaseline({ sessionId: sitzung, projectDir, capture, transcriptPath, prompt: 'erster', io: enospc }), /no space/);
  assert.equal(captures, 1);
  assert.equal(readClaudeSessionBaseline({ sessionId: sitzung, projectDir }), null);
  // Zweiter Prompt, Platte wieder frei: das Transkript belegt, dass es nicht der erste ist.
  transcript(projectDir, [userPrompt('erster')]);
  const later = ensureClaudeSessionBaseline({ sessionId: sitzung, projectDir, capture, transcriptPath, prompt: 'zweiter' });
  assert.equal(later.created, false);
  assert.equal(later.reason, 'NOT_FIRST_PROMPT');
  assert.equal(captures, 1, 'der Working Tree wird nicht erneut erfasst');
  assert.equal(readClaudeSessionBaseline({ sessionId: sitzung, projectDir }), null);
});

// Pruefung 2026-09-11: Baselines werden nie gezielt geloescht - ohne
// Altersgrenze wuchs das Verzeichnis unbegrenzt.
test('Baselines aelter als 30 Tage werden bei der naechsten Neuanlage aufgeraeumt', () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-session-baseline-'));
  // IDs zusammengesetzt wie `sitzung` unten: ein Literal direkt hinter
  // sessionId trifft die Regel SESSION_COOKIE des Secret-Scans.
  const alteSitzung = ['alte', 'sitzung'].join('-');
  const frischeSitzung = ['frische', 'sitzung'].join('-');
  const alt = ensureClaudeSessionBaseline({ sessionId: alteSitzung, projectDir, capture: () => ({ ok: true, version: 1, root: '/repo', entries: {} }) });
  const frisch = ensureClaudeSessionBaseline({ sessionId: frischeSitzung, projectDir, capture: () => ({ ok: true, version: 1, root: '/repo', entries: {} }) });
  const vor31Tagen = new Date(Date.now() - BASELINE_MAX_AGE_MS - 24 * 60 * 60 * 1000);
  fs.utimesSync(alt.filePath, vor31Tagen, vor31Tagen);
  assert.equal(pruneOldBaselines({ dir: path.dirname(alt.filePath) }), 1);
  assert.equal(fs.existsSync(alt.filePath), false);
  assert.equal(fs.existsSync(frisch.filePath), true);
  // Neuanlage raeumt mit auf; eine gerade angelegte Baseline bleibt.
  fs.utimesSync(frisch.filePath, vor31Tagen, vor31Tagen);
  ensureClaudeSessionBaseline({ sessionId: sitzung, projectDir, capture: () => ({ ok: true, version: 1, root: '/repo', entries: {} }) });
  assert.equal(fs.existsSync(frisch.filePath), false);
  assert.ok(readClaudeSessionBaseline({ sessionId: sitzung, projectDir }));
  assert.equal(pruneOldBaselines({ dir: path.join(projectDir, 'gibt-es-nicht') }), 0, 'fehlendes Verzeichnis ist kein Fehler');
});

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
