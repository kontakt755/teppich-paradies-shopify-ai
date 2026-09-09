#!/usr/bin/env node
// Beantwortet in einem Lauf: laeuft der AI-Router in dieser Arbeitskopie oder ist er blind?
// Hintergrund: Am 2026-09-06 meldete eine Dispatch-Session "Router existiert nicht". Ursache war ein
// Worktree auf altem Stand ohne .claude/hooks. Ohne diesen Befehl wird stattdessen geraten.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessAgentRuns, diagnoseRouterRuns, stopHookTimeout } from '../core/router-runs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const at = p => path.join(root, p);
const kurz = process.argv.includes('--kurz');
const lines = [];
const problems = [];
const say = (ok, label, detail) => lines.push(`${ok ? '+' : 'x'} ${label}${detail ? ` — ${detail}` : ''}`);

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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
let letzterAufruf = null;
if (fs.existsSync(ledger)) {
  const rows = fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean);
  const last = rows.length ? JSON.parse(rows[rows.length - 1]) : null;
  letzterAufruf = last ? `${String(last.timestamp ?? '?').slice(0, 16).replace('T', ' ')}, ${last.model ?? '?'}` : null;
  say(true, '.router/ai-usage.jsonl', `${rows.length} Aufrufe, zuletzt ${last?.timestamp ?? '?'} (${last?.provider ?? '?'} / ${last?.model ?? '?'})`);
} else {
  say(false, '.router/ai-usage.jsonl', 'noch kein Aufruf protokolliert');
  problems.push('Kein Usage-Ledger: der Router hat in dieser Arbeitskopie noch nie einen Provider aufgerufen.');
}

// Stop-Hook-Reviews: bis 2026-09-08 verschwand jeder Infrastrukturfehler still.
// Jetzt hinterlaesst er review-error.txt; ohne ein einziges codex-review.json ist
// der Review-Zweig nachweislich nie gelaufen. Leere Ordner sind Abbrueche von aussen
// (bis 2026-09-09: Stop-Hook ohne "timeout", Claude Code killt nach 60 s) - oder ein
// gerade laufendes Review. router-runs.mjs trennt aktuell von historisch.
let settingsJson = null;
try { settingsJson = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { /* oben gemeldet */ }
const timeout = stopHookTimeout(settingsJson);
if (timeout.present) say(timeout.sufficient, 'Stop-Hook timeout', timeout.configured == null ? 'nicht gesetzt (Default 60 s)' : `${timeout.configured} s`);
// Reparaturzeitpunkt = letzter Commit, der das Timeout in settings.json gesetzt hat.
const repairCommit = git('log', '-1', '--format=%ct', '-S', '"timeout": 900', '--', '.claude/settings.json');
const repairedAtMs = repairCommit ? Number(repairCommit) * 1000 : null;
const runsDir = at('.router/agent-runs');
if (fs.existsSync(runsDir)) {
  const runs = fs.readdirSync(runsDir).map(name => {
    const dir = path.join(runsDir, name);
    return { name, files: fs.readdirSync(dir), mtimeMs: fs.statSync(dir).mtimeMs };
  });
  const assessment = assessAgentRuns({ runs, repairedAtMs });
  say(assessment.reviewed > 0 || runs.length === 0, '.router/agent-runs', `${assessment.total} Laeufe, ${assessment.reviewed} mit Review, ${assessment.failed} mit protokolliertem Review-Fehler, ${assessment.running} offen, ${assessment.aborted} abgebrochen`);
  if (runs.length && !assessment.reviewed) problems.push('Kein einziger Stop-Hook-Lauf hat ein Review-Ergebnis: Codex-Binary pruefen (CODEX_CLI_PATH) und review-error.txt lesen.');
  const diagnosis = diagnoseRouterRuns({ assessment, timeout });
  problems.push(...diagnosis.problems);
  for (const note of diagnosis.notes) lines.push(`  ${note}`);
} else {
  const diagnosis = diagnoseRouterRuns({ assessment: assessAgentRuns({ runs: [] }), timeout });
  problems.push(...diagnosis.problems);
}
const codexBinary = ['CODEX_CLI_PATH' in process.env ? process.env.CODEX_CLI_PATH : null, '/Applications/ChatGPT.app/Contents/Resources/codex'].filter(Boolean).find(candidate => fs.existsSync(candidate));
say(Boolean(codexBinary), 'codex-Binary', codexBinary ?? 'nicht gefunden (CODEX_CLI_PATH setzen)');
if (!codexBinary) problems.push('codex-Binary nicht gefunden: der unabhaengige Review kann nicht laufen.');

const runState = at('.router/manifest-run/run-state.json');
say(fs.existsSync(runState), '.router/manifest-run/run-state.json', fs.existsSync(runState) ? 'ManifestRunner-Lauf vorhanden' : 'noch kein Lauf');

// Kurzmodus fuer den SessionStart-Hook: eine Zeile, damit in jeder Sitzung ohne
// Zutun sichtbar ist, ob die Voranalyse ueberhaupt laufen kann.
if (kurz) {
  if (!problems.length) {
    console.log(`Router aktiv — Voranalyse laeuft${letzterAufruf ? ` (zuletzt ${letzterAufruf})` : ''}.`);
    process.exit(0);
  }
  const fehlenKeys = problems.some(p => p.includes('.env.local') || p.includes('API_KEY'));
  const fehlenHooks = problems.some(p => p.includes('settings.json') || p.includes('hooks/'));
  console.log('Router INAKTIV in dieser Arbeitskopie — keine Gemini-Voranalyse, kein Codex-Review.');
  if (fehlenKeys) console.log('  Grund: .env.local mit den Provider-Keys fehlt (liegt nur lokal, wird nie synchronisiert).');
  if (fehlenHooks) console.log('  Grund: die Hook-Verdrahtung unter .claude/ fehlt in dieser Kopie.');
  console.log('  Details: npm run router:status');
  process.exit(0);
}

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
