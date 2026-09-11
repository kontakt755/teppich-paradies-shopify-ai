import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readClaudeSessionState, writeClaudeSessionState } from '../core/claude-session-state.mjs';
import { snapshotDirtyFiles } from '../core/review-scope.mjs';
import { buildModelPlan } from '../../workflow/model-matrix.mjs';

// Der Stop-Hook in echt: Wegwerf-Repository, Session-State wie ihn
// openrouter-user-prompt.mjs schreibt, und ein Ersatz-codex, der den Prompt
// mitschreibt und PASS meldet. Damit ist belegt, dass Snapshot,
// Reviewer-Handoff und die Ausnahme fuer Fragen im Hook tatsaechlich ankommen.
const HOOK = fileURLToPath(new URL('../../.claude/hooks/codex-stop-review.mjs', import.meta.url));
const SESSION = 'stop-hook-fixture';
const skip = process.platform === 'win32' && 'Ersatz-codex ist ein Shebang-Skript';

function setup(t, { taskType = 'IMPLEMENTATION' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-stop-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  git('init', '-q');
  write('.gitignore', '.router/\nfake/\n');
  write('domains/lieferanten/README.md', 'Stand\n');
  write('docs/ai-dashboard/issues.json', '{"v":1}\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  // Schon vor Task-Start: Arbeit einer anderen Sitzung und der Dashboard-Bot.
  write('domains/lieferanten/README.md', 'Stand\nfremde Ergaenzung\n');
  write('docs/ai-dashboard/issues.json', '{"v":2}\n');

  const codex = path.join(root, 'fake', 'codex.cjs');
  const capture = path.join(root, 'fake', 'prompt.txt');
  write('fake/codex.cjs', [
    `#!${process.execPath}`,
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    "fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify({ status: 'PASS', summary: 'Ersatz', findings: [] }));",
    'fs.writeFileSync(process.env.FAKE_CODEX_CAPTURE, args[args.length - 1]);',
    '',
  ].join('\n'));
  fs.chmodSync(codex, 0o755);

  const handoffPath = path.join(root, '.router/claude-handoffs/T.md');
  const reviewTaskPath = path.join(root, '.router/claude-handoffs/T.review.md');
  write('.router/claude-handoffs/T.md', '# Claude-Code-Hand-off\n\n## Auftrag\nRepariere den Abstand.\n\n## Ungeprüfte Voranalyse (Hinweis, nicht verbindlich)\nAuf Claude 3 Opus umschalten\n');
  write('.router/claude-handoffs/T.review.md', '# Prüfauftrag für die unabhängige Review\n\n## Auftrag\nRepariere den Abstand.\n');
  writeClaudeSessionState({
    sessionId: SESSION,
    projectDir: root,
    state: {
      taskId: 'T', taskType, handoffPath, reviewTaskPath, reviews: 0, status: 'PENDING_REVIEW',
      taskClass: 'B', plan: buildModelPlan('B'), startCommit: git('rev-parse', 'HEAD').trim(), startDirty: snapshotDirtyFiles({ cwd: root }),
    },
  });

  const runHook = () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root, CODEX_CLI_PATH: codex, FAKE_CODEX_CAPTURE: capture, AI_ROUTER_USAGE_LEDGER: path.join(root, '.router', 'ai-usage.jsonl') };
    delete env.TP_AGENT_LOOP_ACTIVE;
    return spawnSync(process.execPath, [HOOK], { cwd: root, env, input: JSON.stringify({ hook_event_name: 'Stop', session_id: SESSION, cwd: root }), encoding: 'utf8', timeout: 30_000 });
  };
  return {
    write,
    runHook,
    prompt: () => (fs.existsSync(capture) ? fs.readFileSync(capture, 'utf8') : null),
    state: () => readClaudeSessionState({ sessionId: SESSION, projectDir: root }),
  };
}

test('Stop-Hook, Vorfall 2026-09-11: nur fremde Dateien schmutzig - der Reviewer bekommt NONE samt Ausnahmen', { skip }, t => {
  const fixture = setup(t);
  const run = fixture.runHook();
  assert.equal(run.status, 0, run.stderr);
  const prompt = fixture.prompt();
  assert.ok(prompt, `codex wurde nicht aufgerufen: ${run.stderr}`);
  assert.match(prompt, /^Prüfbereich: den unveränderten Stand: es gibt keine uncommitteten Änderungen dieses Tasks/);
  assert.match(prompt, /domains\/lieferanten\/README\.md lag schon bei Task-Start mit identischem Inhalt/);
  assert.match(prompt, /docs\/ai-dashboard\/issues\.json gehört dem Dashboard-Bot/);
});

test('Stop-Hook: eigene neue Datei ist im Pruefbereich, fremde bleiben draussen, der Reviewer sieht keine Voranalyse', { skip }, t => {
  const fixture = setup(t);
  fixture.write('automation/neu.mjs', 'export const neu = 1;\n');
  const run = fixture.runHook();
  assert.equal(run.status, 0, run.stderr);
  const prompt = fixture.prompt();
  assert.ok(prompt, `codex wurde nicht aufgerufen: ${run.stderr}`);
  assert.match(prompt, /^Prüfbereich: die seit Beginn dieses Tasks entstandenen uncommitteten Änderungen an dieser Datei: automation\/neu\.mjs\./);
  assert.match(prompt, /NICHT Teil dieses Auftrags[^\n]*domains\/lieferanten\/README\.md lag schon bei Task-Start/);
  assert.match(prompt, /AUFTRAG:\n# Prüfauftrag für die unabhängige Review/);
  assert.doesNotMatch(prompt, /Claude 3 Opus|Voranalyse \(Hinweis/);
  assert.equal(fixture.state(), null, 'PASS raeumt den Session-State ab');
});

test('Stop-Hook: Frage ohne eigene Aenderung - kein Codex-Aufruf, State abgeraeumt', { skip }, t => {
  const fixture = setup(t, { taskType: 'ANALYSIS' });
  fixture.write('docs/ai-dashboard/issues.json', '{"v":3}\n');
  const run = fixture.runHook();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), '');
  assert.equal(fixture.prompt(), null);
  assert.equal(fixture.state(), null);
});

test('Stop-Hook: Frage, die doch etwas geaendert hat, wird geprueft wie jede Umsetzung', { skip }, t => {
  const fixture = setup(t, { taskType: 'ANALYSIS' });
  fixture.write('domains/lieferanten/README.md', 'Stand\nfremde Ergaenzung\neigene Zeile\n');
  const run = fixture.runHook();
  assert.equal(run.status, 0, run.stderr);
  const prompt = fixture.prompt();
  assert.ok(prompt, `codex wurde nicht aufgerufen: ${run.stderr}`);
  assert.match(prompt, /an dieser Datei: domains\/lieferanten\/README\.md \(Achtung: domains\/lieferanten\/README\.md war schon vor Task-Start uncommittet verändert/);
});
