#!/usr/bin/env node
// Beantwortet in einem Lauf: laeuft der AI-Router in dieser Arbeitskopie oder ist er blind?
// Hintergrund: Am 2026-09-06 meldete eine Dispatch-Session "Router existiert nicht". Ursache war ein
// Worktree auf altem Stand ohne .claude/hooks. Ohne diesen Befehl wird stattdessen geraten.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const at = p => path.join(root, p);
const lines = [];
const problems = [];
const say = (ok, label, detail) => lines.push(`${ok ? '+' : 'x'} ${label}${detail ? ` — ${detail}` : ''}`);

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// 1. Arbeitskopie: main oder Worktree? Ein Worktree ist der haeufigste Grund fuer einen blinden Router.
const gitDir = git('rev-parse', '--git-dir');
const isWorktree = gitDir.includes('/worktrees/');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || '?';
const headDate = git('log', '-1', '--format=%ad', '--date=short') || '?';
lines.push(`Arbeitskopie: ${root}`);
lines.push(`Branch: ${branch} (HEAD vom ${headDate})${isWorktree ? ' [WORKTREE]' : ''}`);
lines.push('');

// 2. Hook-Verdrahtung. Fehlt sie, laeuft in dieser Kopie keine Voranalyse und kein Codex-Review.
const settingsPath = at('.claude/settings.json');
let hookEvents = [];
if (fs.existsSync(settingsPath)) {
  try {
    hookEvents = Object.keys(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).hooks ?? {});
    say(true, '.claude/settings.json', `Hooks: ${hookEvents.join(', ') || 'keine'}`);
  } catch (error) {
    say(false, '.claude/settings.json', `nicht lesbar: ${error.message}`);
    problems.push('settings.json ist beschaedigt');
  }
} else {
  say(false, '.claude/settings.json', 'fehlt');
  problems.push('Ohne settings.json laeuft in dieser Arbeitskopie kein Hook.');
}

for (const [file, zweck] of [
  ['.claude/hooks/openrouter-user-prompt.mjs', 'Gemini-Voranalyse je Prompt'],
  ['.claude/hooks/codex-stop-review.mjs', 'Codex-Review beim Abschluss'],
]) {
  const ok = fs.existsSync(at(file));
  say(ok, file, zweck);
  if (!ok) problems.push(`${file} fehlt — ${zweck} findet nicht statt.`);
}
lines.push('');

// 3. Provider-Keys. Nur Namen ausgeben, nie Werte.
const envPath = at('.env.local');
if (fs.existsSync(envPath)) {
  const names = [...fs.readFileSync(envPath, 'utf8').matchAll(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/gm)].map(m => m[1]);
  say(true, '.env.local', `${names.length} Variablen`);
  for (const key of ['GEMINI_API_KEY', 'OPENROUTER_API_KEY']) {
    const ok = names.includes(key);
    say(ok, `  ${key}`, ok ? 'gesetzt' : 'fehlt');
    if (!ok) problems.push(`${key} fehlt in .env.local`);
  }
} else {
  say(false, '.env.local', 'fehlt');
  problems.push('.env.local fehlt — sie wird pro Rechner neu angelegt, siehe docs/MULTI_MAC_WORKFLOW.md Regel 5.');
}
lines.push('');

// 4. Belege: was der Router zuletzt tatsaechlich getan hat.
const ledger = at('.router/ai-usage.jsonl');
if (fs.existsSync(ledger)) {
  const rows = fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean);
  const last = rows.length ? JSON.parse(rows[rows.length - 1]) : null;
  say(true, '.router/ai-usage.jsonl', `${rows.length} Aufrufe, zuletzt ${last?.timestamp ?? '?'} (${last?.provider ?? '?'} / ${last?.model ?? '?'})`);
} else {
  say(false, '.router/ai-usage.jsonl', 'noch kein Aufruf protokolliert');
  problems.push('Kein Usage-Ledger: der Router hat in dieser Arbeitskopie noch nie einen Provider aufgerufen.');
}

const runState = at('.router/manifest-run/run-state.json');
say(fs.existsSync(runState), '.router/manifest-run/run-state.json', fs.existsSync(runState) ? 'ManifestRunner-Lauf vorhanden' : 'noch kein Lauf');

console.log(lines.join('\n'));

if (problems.length) {
  console.log(`\nBefund: Der Router ist in dieser Arbeitskopie nicht voll aktiv.\n`);
  for (const p of problems) console.log(`  - ${p}`);
  if (isWorktree) {
    console.log(`\n  Diese Kopie ist ein Worktree auf Stand ${headDate}. Sind die Hooks juenger als`);
    console.log(`  dieser Stand, fehlen sie hier zwangslaeufig. Im Hauptverzeichnis pruefen`);
    console.log(`  oder den Worktree auf main aktualisieren.`);
  }
  process.exit(1);
}

console.log('\nBefund: Router aktiv — Voranalyse, Keys und Ledger sind vorhanden.');
