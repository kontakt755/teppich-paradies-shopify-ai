import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { claudeSessionBaselinePath, claudeSessionStatePath, readClaudeSessionBaseline, writeClaudeSessionState } from '../core/claude-session-state.mjs';

// Verdrahtung der beiden Hook-Skripte (Pruefung 2026-09-11: die reinen
// Funktionen waren getestet, die Aufrufstellen nicht). Die Hooks laufen hier
// gegen ein Wegwerf-Repository mit erfundener Sitzungs-ID. Ein Modell wird nie
// aufgerufen: der Prompt-Hook endet vor dem Routing-Gate ("ok"). Der Stop-Hook
// startet statt Codex einen Stub (CODEX_CLI_PATH); `claude` liegt nicht im
// PATH, einen Fallback-Reviewer gibt es also nicht. Der Stub "verboten" schreibt
// nur einen Marker, "pass" schreibt zusaetzlich den erhaltenen Prompt mit und
// legt ein PASS in --output-last-message ab - so ist pruefbar, was beim
// Reviewer ankommt.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROMPT_HOOK = path.join(REPO_ROOT, '.claude', 'hooks', 'openrouter-user-prompt.mjs');
const STOP_HOOK = path.join(REPO_ROOT, '.claude', 'hooks', 'codex-stop-review.mjs');
const SESSION = 'hook-test-session-' + process.pid;
const LEXWARE_ANTWORT = 'Mit der Lexware-API kann ich Angebote erstellen, aber nicht bearbeiten oder löschen.';

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function projekt({ codex = 'verboten' } = {}) {
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
  const promptFile = path.join(stubDir, 'prompt.txt');
  const stub = codex === 'pass'
    ? `#!/bin/sh
echo aufgerufen >> "${marker}"
out=""; prev=""; last=""
for arg in "$@"; do
  if [ "$prev" = "--output-last-message" ]; then out="$arg"; fi
  prev="$arg"; last="$arg"
done
printf '%s' "$last" > "${promptFile}"
printf '%s' '{"status":"PASS","summary":"Stub","findings":[]}' > "$out"
exit 0
`
    : `#!/bin/sh\necho aufgerufen >> "${marker}"\nexit 1\n`;
  fs.writeFileSync(codexStub, stub);
  fs.chmodSync(codexStub, 0o755);
  return { dir, codexStub, marker, promptFile, codex, head: git(dir, 'rev-parse', 'HEAD') };
}

function runHook(script, { dir, codexStub, marker, codex, input }) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, CODEX_CLI_PATH: codexStub, PATH: '/usr/bin:/bin', AI_ROUTER_USAGE_LEDGER: path.join(dir, '.router', 'ai-usage.jsonl') };
  delete env.TP_AGENT_LOOP_ACTIVE;
  delete env.OPENROUTER_USAGE_LEDGER;
  const result = spawnSync(process.execPath, [script], { cwd: dir, env, input: JSON.stringify({ session_id: SESSION, cwd: dir, ...input }), encoding: 'utf8', timeout: 60_000 });
  if (codex !== 'pass') assert.equal(fs.existsSync(marker), false, 'der Codex-Stub darf nie gestartet werden');
  return result;
}

// Session-State eines Implementierungsauftrags (Klasse B) nach `reviews`
// Review-Runden. Das Hand-off liegt unter .router/ (gitignored), damit es den
// Pruefbereich nicht veraendert.
function reviewZustand({ dir, head }, { reviews }) {
  const handoffPath = path.join(dir, '.router', 'handoff.md');
  fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
  fs.writeFileSync(handoffPath, 'AUFTRAG: Kann ich mit der Lexware-API Angebote bearbeiten?\n');
  writeClaudeSessionState({ sessionId: SESSION, projectDir: dir, state: {
    taskId: 'CLAUDE-HOOK-TEST', handoffPath, reviews, status: 'PENDING_REVIEW', taskClass: 'B', startCommit: head,
  } });
}

// Sitzung starten (Baseline mit fremd.py), dann Stop mit Schlussantwort.
function stopNachErstemPrompt(projektDir, { reviews, stopInput, vorStop = () => {} }) {
  const prompt = runHook(PROMPT_HOOK, { ...projektDir, input: { hook_event_name: 'UserPromptSubmit', prompt: 'ok' } });
  assert.equal(prompt.status, 0, prompt.stderr);
  reviewZustand(projektDir, { reviews });
  vorStop();
  return runHook(STOP_HOOK, { ...projektDir, input: { hook_event_name: 'Stop', ...stopInput } });
}

function reviewPrompt({ marker, promptFile }) {
  assert.equal(fs.existsSync(marker), true, 'das Review muss laufen, nie uebersprungen werden');
  return fs.readFileSync(promptFile, 'utf8');
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

// Kern der Runde 3: leerer Pruefbereich nach Abzug der Baseline -> das Review
// laeuft (Runde 1, kein Human Gate) und bekommt die Schlussantwort. Ohne die
// Baseline-Uebergabe waere fremd.py im Scope, der Bereich nicht leer und der
// Abschnitt fehlte; beides haelt dieser Test fest.
test('Stop-Hook: leerer Pruefbereich reicht die Schlussantwort an den Reviewer weiter, das Review laeuft', () => {
  const projektDir = projekt({ codex: 'pass' });
  const result = stopNachErstemPrompt(projektDir, { reviews: 0, stopInput: { last_assistant_message: LEXWARE_ANTWORT } });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /nicht verfuegbar/);
  assert.equal(result.stdout, '', 'PASS vom Reviewer -> kein block');
  const prompt = reviewPrompt(projektDir);
  assert.match(prompt, /SCHLUSSANTWORT DES AGENTEN \(es gibt keinen Diff/);
  assert.ok(prompt.includes(`<<<SCHLUSSANTWORT\n${LEXWARE_ANTWORT}\nSCHLUSSANTWORT>>>`), 'die Antwort steht im Block');
  assert.match(prompt, /Vorbestehend, unverändert seit Sitzungsbeginn: fremd\.py/, 'die Baseline kommt beim Scope an');
  assert.match(prompt, /Lexware-API Angebote bearbeiten\?/, 'der Auftrag aus dem Hand-off');
  assert.equal(fs.existsSync(claudeSessionStatePath({ sessionId: SESSION, projectDir: projektDir.dir })), false, 'PASS loescht den Zustand');
  assert.ok(readClaudeSessionBaseline({ sessionId: SESSION, projectDir: projektDir.dir }), 'die Baseline ueberlebt');
});

test('Stop-Hook: mit eigener Aenderung bleibt die Schlussantwort draussen', () => {
  const projektDir = projekt({ codex: 'pass' });
  const result = stopNachErstemPrompt(projektDir, {
    reviews: 0,
    stopInput: { last_assistant_message: 'Erledigt, alles umgesetzt.' },
    vorStop: () => fs.writeFileSync(path.join(projektDir.dir, 'neu.mjs'), 'export {};\n'),
  });
  assert.equal(result.status, 0, result.stderr);
  const prompt = reviewPrompt(projektDir);
  assert.match(prompt, /uncommitteten Änderungen/);
  assert.doesNotMatch(prompt, /SCHLUSSANTWORT/);
  assert.doesNotMatch(prompt, /Erledigt, alles umgesetzt/);
});

test('Stop-Hook: eine Schlussantwort, die kein String ist, bricht den Hook nicht ab', () => {
  const projektDir = projekt({ codex: 'pass' });
  const result = stopNachErstemPrompt(projektDir, { reviews: 0, stopInput: { last_assistant_message: { kein: 'String' } } });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /nicht verfuegbar/);
  const prompt = reviewPrompt(projektDir);
  assert.doesNotMatch(prompt, /SCHLUSSANTWORT/, 'Review wie bisher, ohne Schlussantwort');
});

// NUL im argv laesst spawnSync werfen; der Hook endete dann ohne Review im
// Infrastrukturfehler-Pfad (Nachpruefung 2026-09-11).
test('Stop-Hook: ein NUL in der Schlussantwort verhindert das Review nicht', () => {
  const projektDir = projekt({ codex: 'pass' });
  const result = stopNachErstemPrompt(projektDir, { reviews: 0, stopInput: { last_assistant_message: 'Antwort\u0000mit NUL' } });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /nicht verfuegbar/);
  assert.equal(result.stdout, '');
  assert.match(reviewPrompt(projektDir), /<<<SCHLUSSANTWORT\nAntwort mit NUL\nSCHLUSSANTWORT>>>/);
});

test('Stop-Hook: nach drei Runden Human Gate ohne Codex-Aufruf, die Baseline ueberlebt', () => {
  const projektDir = projekt();
  const result = stopNachErstemPrompt(projektDir, { reviews: 3, stopInput: { last_assistant_message: LEXWARE_ANTWORT } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"decision":"block"/);
  assert.match(result.stdout, /Human Gate/);
  assert.ok(readClaudeSessionBaseline({ sessionId: SESSION, projectDir: projektDir.dir }), 'die Baseline ueberlebt');
});
