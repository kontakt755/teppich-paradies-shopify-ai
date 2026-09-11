import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { claudeSessionBaselinePath, claudeSessionStatePath, readClaudeSessionBaseline, writeClaudeSessionState } from '../core/claude-session-state.mjs';

// Verdrahtung der beiden Hook-Skripte (Pruefung 2026-09-11: die reinen
// Funktionen waren getestet, die Aufrufstellen nicht - ein Stop-Hook, der
// JEDEN leeren Scope ueberspringt, fiel durch keinen Test). Die Hooks laufen
// hier gegen ein Wegwerf-Repository mit erfundener Sitzungs-ID. Ein Modell
// wird nie aufgerufen: der Prompt-Hook endet vor dem Routing-Gate ("ok"),
// der Stop-Hook vor dem Codex-Aufruf (reviews: 3 -> Human Gate); der
// Codex-Stub schreibt einen Marker, falls er doch je gestartet wird.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROMPT_HOOK = path.join(REPO_ROOT, '.claude', 'hooks', 'openrouter-user-prompt.mjs');
const STOP_HOOK = path.join(REPO_ROOT, '.claude', 'hooks', 'codex-stop-review.mjs');
const SESSION = 'hook-test-session-' + process.pid;

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function projekt() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-hook-'));
  git(dir, '-c', 'init.defaultBranch=main', 'init', '-q');
  fs.writeFileSync(path.join(dir, 'README.md'), 'Readme\n');
  // .router/ ist wie im echten Projekt gitignored - sonst machte die
  // Baseline-Datei selbst den Working Tree schmutzig.
  fs.writeFileSync(path.join(dir, '.gitignore'), '.router/\n');
  git(dir, 'add', 'README.md', '.gitignore');
  git(dir, 'commit', '-qm', 'init');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  // vorbestehend unversioniert, wie domains/shopify/bild-qualitaetstest.py am 2026-09-11
  fs.writeFileSync(path.join(dir, 'fremd.py'), 'print("fremd")\n');
  // Der Stub liegt ausserhalb des Repositories, damit er nicht in der Baseline landet.
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-hook-stub-'));
  const codexStub = path.join(stubDir, 'codex');
  const marker = path.join(stubDir, 'CODEX-AUFGERUFEN');
  fs.writeFileSync(codexStub, `#!/bin/sh\necho aufgerufen >> "${marker}"\nexit 1\n`);
  fs.chmodSync(codexStub, 0o755);
  return { dir, codexStub, marker, head: git(dir, 'rev-parse', 'HEAD') };
}

function runHook(script, { dir, codexStub, marker, input }) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, CODEX_CLI_PATH: codexStub, PATH: '/usr/bin:/bin' };
  delete env.TP_AGENT_LOOP_ACTIVE;
  const result = spawnSync(process.execPath, [script], { cwd: dir, env, input: JSON.stringify({ session_id: SESSION, cwd: dir, ...input }), encoding: 'utf8', timeout: 60_000 });
  assert.equal(fs.existsSync(marker), false, 'der Codex-Stub darf nie gestartet werden');
  return result;
}

function fragezustand({ dir, head, extra = {} }) {
  writeClaudeSessionState({ sessionId: SESSION, projectDir: dir, state: {
    taskId: 'CLAUDE-HOOK-TEST', handoffPath: path.join(dir, 'handoff.md'), reviews: 3, status: 'PENDING_REVIEW', taskClass: 'B', startCommit: head,
    taskType: 'ANALYSIS', taskTypeSource: 'QUESTION', reviewOnlyIfChanged: true, ...extra,
  } });
}

test('Prompt-Hook: der erste Prompt legt die Baseline vor dem Routing-Gate an, ein spaeterer nicht', () => {
  const projektDir = projekt();
  const transcriptPath = path.join(projektDir.dir, 'transcript.jsonl');
  const result = runHook(PROMPT_HOOK, { ...projektDir, input: { hook_event_name: 'UserPromptSubmit', prompt: 'ok', transcript_path: transcriptPath } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', '"ok" wird nicht geroutet, also kein Kontext');
  const baseline = readClaudeSessionBaseline({ sessionId: SESSION, projectDir: projektDir.dir });
  assert.equal(baseline?.ok, true);
  assert.deepEqual(Object.keys(baseline.entries), ['fremd.py']);
  assert.equal(fs.existsSync(claudeSessionStatePath({ sessionId: SESSION, projectDir: projektDir.dir })), false);

  // Spaeterer Prompt derselben Sitzung ohne Baseline (z. B. Speichern war
  // gescheitert): das Transkript belegt, dass es nicht der erste ist.
  fs.unlinkSync(claudeSessionBaselinePath({ sessionId: SESSION, projectDir: projektDir.dir }));
  fs.writeFileSync(transcriptPath, `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'ok' } })}\n`);
  fs.writeFileSync(path.join(projektDir.dir, 'sitzung.mjs'), 'export {};\n');
  const later = runHook(PROMPT_HOOK, { ...projektDir, input: { hook_event_name: 'UserPromptSubmit', prompt: 'weiter', transcript_path: transcriptPath } });
  assert.equal(later.status, 0, later.stderr);
  assert.equal(readClaudeSessionBaseline({ sessionId: SESSION, projectDir: projektDir.dir }), null);
});

test('Stop-Hook: reine Frage ohne Aenderung endet ohne Review und loescht den Zustand', () => {
  const projektDir = projekt();
  runHook(PROMPT_HOOK, { ...projektDir, input: { hook_event_name: 'UserPromptSubmit', prompt: 'ok' } });
  fragezustand(projektDir);
  const result = runHook(STOP_HOOK, { ...projektDir, input: { hook_event_name: 'Stop' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', 'kein block, kein Human Gate');
  assert.equal(fs.existsSync(claudeSessionStatePath({ sessionId: SESSION, projectDir: projektDir.dir })), false);
  assert.ok(readClaudeSessionBaseline({ sessionId: SESSION, projectDir: projektDir.dir }), 'die Baseline ueberlebt');
});

test('Stop-Hook: reine Frage mit Aenderung der Sitzung laeuft in das Review (hier: Human Gate nach drei Runden)', () => {
  const projektDir = projekt();
  runHook(PROMPT_HOOK, { ...projektDir, input: { hook_event_name: 'UserPromptSubmit', prompt: 'ok' } });
  // Aenderung aus einem frueheren, nicht abgeschlossenen Auftrag derselben
  // Sitzung - sie zaehlt gegen die Sitzungs-Baseline, nicht gegen einen
  // Schnappschuss bei Eingang der Frage.
  fs.writeFileSync(path.join(projektDir.dir, 'sitzung.mjs'), 'export {};\n');
  fragezustand(projektDir);
  const result = runHook(STOP_HOOK, { ...projektDir, input: { hook_event_name: 'Stop' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"decision":"block"/);
  assert.match(result.stdout, /Human Gate/);
});

test('Stop-Hook: Implementierung wird auch bei leerem Scope nie uebersprungen', () => {
  const projektDir = projekt();
  runHook(PROMPT_HOOK, { ...projektDir, input: { hook_event_name: 'UserPromptSubmit', prompt: 'ok' } });
  fragezustand({ ...projektDir, extra: { taskType: 'IMPLEMENTATION', taskTypeSource: 'HEURISTIC', reviewOnlyIfChanged: undefined } });
  const result = runHook(STOP_HOOK, { ...projektDir, input: { hook_event_name: 'Stop' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"decision":"block"/);
});
