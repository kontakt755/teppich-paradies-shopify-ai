#!/usr/bin/env node
/**
 * AI Control - Orchestrator-CLI (Phase 2 + Phase 14).
 *
 * Bedienung fuer Ahmet:
 *   npm run ai:route -- "Produktseite verbessern"
 *   npm run ai:continue          -> laeuft selbstaendig bis zum naechsten Gate
 *   npm run ai:status            -> wo stehen wir
 *   npm run ai:next              -> was waere der naechste zulaessige Schritt
 *   npm run ai:stop              -> laufenden/naechsten Lauf kontrolliert stoppen
 *   npm run ai:resume            -> nach Abbruch pruefen, ob sicher fortsetzbar
 *   npm run ai:providers         -> Capability Detection (startet keine Session)
 *
 * Sicherheit: Dieses CLI merged nie main, pusht nie, erstellt keine PRs,
 * fuehrt keinen Shopify Write aus und publiziert nie ein Theme.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';

import { TRACKED_EVIDENCE_PATH, WorkflowGateError, parseArgs, runBounded, requireSuccess, writeRuntimeReport } from './core.mjs';
import { deriveHandoffState, normalizeTaskText, routeTask } from './router.mjs';
import { loadRiskMap } from '../automation/core/risk-guard.mjs';
import { ROLE_MAP, createLazyProviderDetector, detectProviders, resolveRole, runRole as runProviderRole } from './providers/index.mjs';
import { explainAction, explainProvider, explainState, explainStop, explainTaskClass } from './plain-language.mjs';
import { captureBaseline, classifyScope, fingerprintScope, isIgnoredForScope, summarizeScope } from './diff-scope.mjs';
import { createUsageMetrics, readUsageSummary, readUsageRange } from './usage-metrics.mjs';
import {
  AGENT_PHASE, AI_STATE_DIR, MAX_CONTINUE_ITERATIONS, STOP_FLAG, STOP_REASONS,
  assertImplementerCandidate, assertSafeWorkspace, assessResumability, continueUntilGate, createReviewEvidence,
  deriveTaskPolicy, inspectRunLock, isEvidenceCurrent, nextCommandsFor, resetTaskState, runAgentCycle,
} from './ai-control-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const [mode = 'status', ...rawArgs] = process.argv.slice(2);
const args = parseArgs(rawArgs);

const stateDir = path.join(root, AI_STATE_DIR);
const stopFlagPath = path.join(root, STOP_FLAG);
const needsAhmetPath = path.join(root, '.workflow/needs-ahmet.md');
const riskMapPath = path.join(root, 'domains/shopify/risk-map.json');

// ---------------------------------------------------------------------------
// Git-Ports (read-only; dieses CLI schreibt niemals in die Git-Historie)
// ---------------------------------------------------------------------------

function run(command, commandArgs, options = {}) {
  return runBounded(command, commandArgs, { cwd: root, ...options });
}

function git(...gitArgs) {
  return requireSuccess(run('git', gitArgs, { timeoutMs: 60_000 }), `git ${gitArgs.join(' ')}`).stdout.trim();
}

function worktreeFingerprint() {
  const excludeEvidence = `:(exclude)${TRACKED_EVIDENCE_PATH}`;
  const diff = requireSuccess(run('git', ['diff', '--binary', 'HEAD', '--', '.', excludeEvidence], { timeoutMs: 60_000 }), 'git diff fingerprint').stdout;
  const untrackedResult = requireSuccess(run('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', excludeEvidence], { timeoutMs: 60_000 }), 'git untracked fingerprint');
  const untracked = untrackedResult.stdout.split('\0').filter(Boolean).sort();
  const hash = createHash('sha256').update(diff);
  let bytes = Buffer.byteLength(diff);
  for (const file of untracked) {
    const absolute = path.join(root, file);
    const stat = fs.lstatSync(absolute);
    bytes += stat.size;
    if (bytes > 20 * 1024 * 1024) throw new WorkflowGateError('Worktree-Fingerprint ueberschreitet das 20-MB-Limit', 'WORKTREE_TOO_LARGE');
    const content = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(absolute)) : fs.readFileSync(absolute);
    hash.update(file).update('\0').update(content).update('\0');
  }
  return hash.digest('hex');
}

function repoContext() {
  const porcelain = git('status', '--porcelain=v1', '-z');
  return {
    branch: git('branch', '--show-current'),
    head: git('rev-parse', 'HEAD'),
    clean: porcelain === '',
    worktreeFingerprint: worktreeFingerprint(),
  };
}

function changedFilesSince(commit) {
  const files = new Set();
  const collect = result => {
    if (result.exitCode !== 0) return;
    result.stdout.split('\n').map(line => line.trim()).filter(Boolean)
      .filter(file => file !== TRACKED_EVIDENCE_PATH).forEach(file => files.add(file));
  };
  if (commit) collect(run('git', ['diff', '--name-only', commit, 'HEAD'], { timeoutMs: 60_000 }));
  collect(run('git', ['diff', '--name-only'], { timeoutMs: 60_000 }));
  collect(run('git', ['diff', '--name-only', '--cached'], { timeoutMs: 60_000 }));
  collect(run('git', ['ls-files', '--others', '--exclude-standard'], { timeoutMs: 60_000 }));
  return [...files].sort();
}

function clampDiff(diff, maxChars = 60_000) {
  const text = String(diff ?? '');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[... Diff gekuerzt, ${text.length - maxChars} Zeichen ausgelassen]` : text;
}

function readDiffForReview({ maxChars = 60_000 } = {}) {
  const result = run('git', ['diff', 'HEAD', '--', '.', `:(exclude)${TRACKED_EVIDENCE_PATH}`], { timeoutMs: 60_000 });
  return clampDiff(result.exitCode === 0 ? result.stdout : '', maxChars);
}

// ---------------------------------------------------------------------------
// Diff-Scoping: was hat GENAU DIESER Agentenlauf geaendert?
// ---------------------------------------------------------------------------

const BASELINE_DIR = path.join(stateDir, 'baseline');
const MAX_BASELINE_BYTES = 20 * 1024 * 1024;

/** Alle aktuell nicht committeten Dateien mit Inhalts-Hash. */
function dirtyEntries() {
  const porcelain = requireSuccess(run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { timeoutMs: 60_000 }), 'git status').stdout;
  const entries = [];
  // Format: XY<space>path\0 ; bei R/C folgt der alte Pfad als eigener Eintrag.
  const tokens = porcelain.split('\0').filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const status = token.slice(0, 2);
    const file = token.slice(3);
    if (status[0] === 'R' || status[0] === 'C') index += 1; // Quellpfad ueberspringen
    if (isIgnoredForScope(file)) continue;
    entries.push({ path: file, hash: hashWorkingFile(file) });
  }
  return entries;
}

/** sha256 des aktuellen Dateiinhalts; null wenn die Datei nicht (mehr) existiert. */
function hashWorkingFile(file) {
  const absolute = path.join(root, file);
  try {
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) return null;
    const content = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(absolute)) : fs.readFileSync(absolute);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Nimmt vor dem Agentenlauf einen Snapshot auf: Hashes plus Inhaltskopien der
 * bereits geaenderten Dateien. Die Kopien liegen unter .workflow/ai/baseline/
 * und werden nur gelesen - der Working Tree bleibt unangetastet.
 */
function captureScopeBaseline(runId) {
  const head = git('rev-parse', 'HEAD');
  const entries = dirtyEntries();
  const snapshotDir = path.join(BASELINE_DIR, String(runId ?? 'current'));
  fs.rmSync(snapshotDir, { recursive: true, force: true });
  fs.mkdirSync(snapshotDir, { recursive: true });

  let bytes = 0;
  for (const entry of entries) {
    if (entry.hash === null) continue;
    const source = path.join(root, entry.path);
    try {
      const stat = fs.lstatSync(source);
      bytes += stat.size;
      if (bytes > MAX_BASELINE_BYTES) {
        throw new WorkflowGateError('Baseline-Snapshot ueberschreitet das 20-MB-Limit', 'BASELINE_TOO_LARGE');
      }
      const target = path.join(snapshotDir, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    } catch (error) {
      if (error instanceof WorkflowGateError) throw error;
      // Nicht kopierbar (z. B. Symlink oder Rechte): Hash bleibt, Diff faellt
      // auf den Vergleich gegen HEAD zurueck.
    }
  }
  return { ...captureBaseline({ head, entries, runId }), snapshotDir };
}

/** Diff einer einzelnen Datei, ausschliesslich der Anteil des Agentenlaufs. */
function scopedFileDiff(baseline, file) {
  const wasDirtyBefore = Object.hasOwn(baseline?.files ?? {}, file);
  if (!wasDirtyBefore) {
    // Vorher sauber: der Unterschied zu HEAD ist exakt der Agentenanteil.
    const tracked = run('git', ['diff', 'HEAD', '--', file], { timeoutMs: 60_000 });
    if (tracked.exitCode === 0 && tracked.stdout.trim()) return tracked.stdout;
    // Neue, nicht getrackte Datei: als vollstaendige Ergaenzung darstellen.
    const added = run('git', ['diff', '--no-index', '--', '/dev/null', file], { timeoutMs: 60_000 });
    return added.stdout ?? '';
  }
  // Vorher bereits geaendert: gegen die Baseline-Kopie vergleichen, damit die
  // fremden Vorher-Aenderungen nicht im Reviewer-Diff landen.
  const before = path.join(baseline.snapshotDir, file);
  if (!fs.existsSync(before)) {
    return `# Baseline-Kopie fuer ${file} fehlt - Diff kann nicht eindeutig zugeordnet werden.\n`;
  }
  const compared = run('git', ['diff', '--no-index', '--', before, file], { timeoutMs: 60_000 });
  return compared.stdout ?? '';
}

function createDiffScopePort(runId) {
  let currentBaseline = null;
  return {
    capture() {
      currentBaseline = captureScopeBaseline(runId);
      return currentBaseline;
    },
    classify({ baseline, allowedFiles, declaredFiles }) {
      const base = baseline ?? currentBaseline;
      return classifyScope({
        baseline: base,
        head: git('rev-parse', 'HEAD'),
        entries: dirtyEntries(),
        allowedFiles,
        declaredFiles,
      });
    },
    readScopedDiff(scope) {
      if (!scope?.agentFiles?.length) return '(keine Aenderungen durch diesen Agentenlauf)';
      const parts = scope.agentFiles.map(file => scopedFileDiff(currentBaseline, file));
      return clampDiff(parts.filter(Boolean).join('\n'));
    },
    fingerprint(scope) {
      if (!scope) return null;
      return fingerprintScope({ agentFiles: scope.agentFiles, diff: this.readScopedDiff(scope) });
    },
  };
}

// ---------------------------------------------------------------------------
// State-Ports
// ---------------------------------------------------------------------------

function readRuntimeJson(name) {
  const target = path.join(root, '.workflow', name);
  try { return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null; } catch { return null; }
}

const readRoute = () => readRuntimeJson('task.json');
const readLatest = () => readRuntimeJson('latest.json');
const readReview = () => readRuntimeJson('review.json');
const stopRequested = () => fs.existsSync(stopFlagPath);

/**
 * Das gemessene Implementer-Ergebnis der aktuellen Aufgabe.
 * Der Reviewer laeuft in einer spaeteren Iteration und braucht genau diese
 * Dateiliste. Die Bindung an Aufgabe und Commit prueft der Loop ueber
 * assertImplementerCandidate - hier wird nur gelesen, nicht bewertet.
 */
const readCandidateRecord = () => readRuntimeJson('ai-scope.json');

function clearStopFlag() {
  try { fs.rmSync(stopFlagPath, { force: true }); } catch {}
}

function readRunnerState() {
  const runPath = path.join(stateDir, 'run-state.json');
  const tasksDir = path.join(stateDir, 'tasks');
  const runState = fs.existsSync(runPath) ? JSON.parse(fs.readFileSync(runPath, 'utf8')) : null;
  const taskStates = fs.existsSync(tasksDir)
    ? fs.readdirSync(tasksDir).filter(name => name.endsWith('.json'))
      .map(name => { try { return JSON.parse(fs.readFileSync(path.join(tasksDir, name), 'utf8')); } catch { return null; } })
      .filter(Boolean)
    : [];
  return { runState, taskStates, lockPresent: fs.existsSync(path.join(stateDir, 'run.lock')) };
}

// ---------------------------------------------------------------------------
// Validierung (delegiert an das bestehende workflow:validate)
// ---------------------------------------------------------------------------

async function validate({ staticOnly }) {
  const validationArgs = ['run', 'workflow:validate'];
  if (staticOnly) validationArgs.push('--', '--static');
  const result = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', validationArgs, { timeoutMs: 30 * 60_000 });
  const latest = readLatest();
  if (result.exitCode === 0 && latest?.status === 'PASS') return latest;
  return { status: latest?.status ?? 'FAIL', p0: latest?.p0 ?? null, p1: latest?.p1 ?? null, externalBlock: latest?.externalBlock ?? null };
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

// Klartext ist Standard. --raw unterdrueckt ihn fuer Scripting und CI, damit
// die maschinenlesbaren Zeilen allein stehen.
const plainOutput = args.raw !== true;

function line(label, value) { return `${label}: ${value ?? '-'}`; }

/** Gibt eine eingerueckte Klartextzeile aus, sofern nicht --raw gesetzt ist. */
function plain(text) {
  if (plainOutput && text) console.log(`  -> ${text}`);
}

/** Erklaert die Diff-Zuordnung eines Agentenlaufs in Alltagssprache. */
function scopeInPlainWords(scope) {
  if (!scope) return null;
  if (scope.outsideAllowlist.length) {
    return `Der Agent hat Dateien angefasst, die er nicht anfassen darf: ${scope.outsideAllowlist.join(', ')}. Ich stoppe.`;
  }
  if (scope.headMoved) return 'Waehrend des Laufs wurde parallel etwas committet. Ich ordne das nicht auf gut Glueck zu und stoppe.';
  if (scope.undeclared.length) {
    return `Diese Dateien haben sich veraendert, ohne dass der Agent sie gemeldet hat: ${scope.undeclared.join(', ')}. Moeglicherweise war eine zweite Sitzung aktiv. Ich stoppe.`;
  }
  const own = scope.agentFiles.length;
  const kept = scope.preexistingUntouched.length;
  const parts = [`Der Agent hat ${own} ${own === 1 ? 'Datei' : 'Dateien'} geaendert.`];
  if (kept) parts.push(`${kept} ${kept === 1 ? 'Aenderung war' : 'Aenderungen waren'} schon vorher da und ${kept === 1 ? 'wurde' : 'wurden'} nicht angefasst.`);
  return parts.join(' ');
}

function printState(state) {
  console.log([
    line('TASK_ID', state.taskId),
    line('TASK_CLASS', state.taskClass),
    line('BRANCH', state.branch),
    line('COMMIT', state.commit),
    line('IMPLEMENTER', state.implementer),
    line('VALIDATION_STATUS', state.validationStatus),
    line('REVIEW_REQUIRED', state.reviewRequired ? 'JA' : 'NEIN'),
    line('REVIEW_STATUS', state.reviewStatus),
    line('SHOPIFY_WRITE_REQUIRED', state.shopifyWriteRequired ? 'JA' : 'NEIN'),
    line('HUMAN_GATE', state.humanGate),
    'HUMAN_APPROVAL_STORED: NEIN',
    line('NEXT_ALLOWED_ACTION', state.nextAllowedAction),
  ].join('\n'));
  plain(explainState(state));
}

function printStop(outcome) {
  console.log('');
  console.log(`STOP: ${outcome.stopReason}`);
  plain(explainStop(outcome.stopReason).text);
  if (outcome.detail) console.log(`GRUND: ${outcome.detail}`);
  console.log(`ITERATIONEN: ${outcome.iterations}`);
  console.log('NAECHSTE MOEGLICHE BEFEHLE:');
  for (const command of outcome.nextCommands) console.log(`  - ${command}`);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdProviders() {
  const detected = detectProviders({ run, cwd: root });
  for (const entry of Object.values(detected)) {
    console.log(`${entry.provider}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}`);
    plain(explainProvider(entry.status));
  }
  const available = Object.values(detected).filter(entry => entry.status === 'AVAILABLE');
  console.log(`\nVERFUEGBARE_PROVIDER: ${available.length ? available.map(entry => entry.provider).join(', ') : 'KEINE'}`);
  // Reines Diagnosekommando: Die Pruefung selbst ist erfolgreich, auch wenn
  // kein Provider installiert ist. Nur --strict macht daraus einen Fehlerexit
  // (fuer Scripting/CI).
  if (!available.length) {
    console.log('HINWEIS: Ohne verfuegbaren Provider stoppt npm run ai:continue mit PROVIDER_UNAVAILABLE.');
    if (args.strict === true) process.exitCode = 2;
  }
  return detected;
}

function cmdUsage() {
  const day = typeof args.day === 'string' ? args.day : new Date().toISOString().slice(0, 10);
  const summary = readUsageSummary({ root, day });
  console.log([
    line('TAG', summary.day),
    line('ROUTER_LAEUFE', summary.runs),
    line('DAVON_OHNE_MODELL', summary.scriptOnlyRuns),
    line('MODELLAUFRUFE', summary.modelCalls),
    line('INPUT_TOKENS', summary.inputTokens),
    line('OUTPUT_TOKENS', summary.outputTokens),
    line('TOKENWERTE_VOLLSTAENDIG', summary.tokenMetricsComplete ? 'JA' : 'NEIN'),
    line('NACH_PROVIDER', Object.entries(summary.byProvider).map(([provider, count]) => `${provider}=${count}`).join(', ') || '-'),
    line('NACH_KLASSE', Object.entries(summary.byClass).map(([taskClass, count]) => `${taskClass}=${count}`).join(', ') || '-'),
  ].join('\n'));
  if (!summary.tokenMetricsComplete && summary.modelCalls > 0) {
    plain('Mindestens ein CLI hat keine verlaesslichen Tokenmetadaten geliefert. Es werden keine Werte geschaetzt.');
  }
  return summary;
}

function cmdUsageRange() {
  const days = (() => {
    const parsed = Number.parseInt(args.days, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 30;
  })();
  const summary = readUsageRange({ root, days });
  console.log([
    line('TAGE_ANGEFRAG', summary.days),
    line('TAGE_MIT_DATEN', summary.daysWithData),
    line('ROUTER_LAEUFE', summary.runs),
    line('DAVON_OHNE_MODELL', summary.scriptOnlyRuns),
    line('MODELLAUFRUFE', summary.modelCalls),
    line('INPUT_TOKENS', summary.inputTokens),
    line('OUTPUT_TOKENS', summary.outputTokens),
    line('TOKENWERTE_VOLLSTAENDIG', summary.tokenMetricsComplete ? 'JA' : 'NEIN'),
    line('NACH_PROVIDER', Object.entries(summary.byProvider).map(([provider, count]) => `${provider}=${count}`).join(', ') || '-'),
    line('NACH_KLASSE', Object.entries(summary.byClass).map(([taskClass, count]) => `${taskClass}=${count}`).join(', ') || '-'),
    line('NACH_STOPREASON', Object.entries(summary.byStopReason).map(([sr, count]) => `${sr === 'null' ? 'null' : sr}=${count}`).join(', ') || '-'),
    line('REWORK_STOPREASONS', summary.reworkStopReasons.map(({ stopReason, count }) => `${stopReason}=${count}`).join(', ') || '-'),
  ].join('\n'));
  if (!summary.tokenMetricsComplete && summary.modelCalls > 0) {
    plain('Mindestens ein CLI hat keine verlaesslichen Tokenmetadaten geliefert. Es werden keine Werte geschaetzt.');
  }
  return summary;
}

function cmdRoute() {
  const repo = repoContext();
  // Nur die Tokens VOR dem ersten --flag sind Aufgabentext. Sonst wuerde der
  // Wert von z. B. --files faelschlich Teil der Aufgabe werden.
  const flagIndex = rawArgs.findIndex(token => token.startsWith('--'));
  const textTokens = flagIndex === -1 ? rawArgs : rawArgs.slice(0, flagIndex);
  const taskText = normalizeTaskText(textTokens.join(' '));
  const files = typeof args.files === 'string' ? args.files.split(',').map(file => file.trim()).filter(Boolean) : [];
  const route = routeTask({ text: taskText, files, branch: repo.branch, head: repo.head });

  // Ausdrueckliches Operator-Override der Implementer-Rolle.
  // Bewusst KEIN automatischer Fallback: ein erschoepftes Kontingent oder ein
  // Rate Limit wechselt niemals von selbst den Provider (siehe
  // decideProviderSwitch). Nur eine bewusste Entscheidung am Kommando greift,
  // und sie wird in task.json sichtbar festgehalten.
  const overrideRole = typeof args.implementer === 'string' ? args.implementer.trim().toUpperCase() : null;
  if (overrideRole) {
    if (!resolveRole(overrideRole)) {
      throw new WorkflowGateError(`Unbekannte Implementer-Rolle: ${overrideRole}. Erlaubt: ${Object.keys(ROLE_MAP).join(', ')}`, 'UNKNOWN_ROLE');
    }
    route.implementerOverride = { from: route.implementer, to: overrideRole, reason: String(args.reason ?? 'manuell gesetzt'), at: new Date().toISOString() };
    route.implementer = overrideRole;
  }

  // Symmetrisches Override fuer die Reviewer-Rolle - z. B. um bewusst
  // NEMOTRON_REVIEW statt des Standard-Reviewers einzusetzen. Genau wie beim
  // Implementer-Override: keine Automatik, jede Wahl wird in task.json sichtbar
  // festgehalten. Ein erschoepftes Kontingent oder Rate Limit fuehrt weiterhin
  // nie von selbst zu einem Wechsel.
  const overrideReviewer = typeof args.reviewer === 'string' ? args.reviewer.trim().toUpperCase() : null;
  if (overrideReviewer) {
    if (!resolveRole(overrideReviewer)) {
      throw new WorkflowGateError(`Unbekannte Reviewer-Rolle: ${overrideReviewer}. Erlaubt: ${Object.keys(ROLE_MAP).join(', ')}`, 'UNKNOWN_ROLE');
    }
    route.reviewerOverride = { from: route.reviewer, to: overrideReviewer, reason: String(args.reason ?? 'manuell gesetzt'), at: new Date().toISOString() };
    route.reviewer = overrideReviewer;
  }

  // Persistiert den rohen --files-Wert (leer, wenn nicht gesetzt). Ohne das
  // wuerde ai:continue bei jedem Durchgang deriveTaskPolicy() erneut OHNE
  // files aufrufen und stillschweigend auf die breite DEFAULT_ALLOWED_FILES-
  // Liste zurueckfallen - ein per --files ausdruecklich eingeschraenkter Task
  // waere zur Laufzeit gar nicht eingeschraenkt. Siehe cmdContinue() unten.
  route.filesOverride = files;

  writeRuntimeReport(root, 'task.json', route);
  // Ein neues Routing macht jede alte Review-Evidence ungueltig.
  try { fs.rmSync(path.join(root, '.workflow/review.json'), { force: true }); } catch {}
  // Auch das gemessene Implementer-Ergebnis gehoert zur alten Aufgabe.
  try { fs.rmSync(path.join(root, '.workflow/ai-scope.json'), { force: true }); } catch {}
  // Und es startet die Aufgabe frisch: ein alter Endstatus (SECURITY_STOP,
  // PASS, HARD_FAIL) wuerde den naechsten Lauf sonst sofort beenden, ohne dass
  // ein Agent laeuft. Betrifft nur Orchestrator-State, nie den Working Tree.
  const reset = resetTaskState({ stateDir, taskId: route.taskId, io: fs, pathApi: path });
  clearStopFlag();

  const policy = deriveTaskPolicy(route, { files, risk: args.risk });
  // Frisch geroutet heisst: es gibt noch kein Implementer-Ergebnis. Der
  // schmutzige Working Tree darf hier nicht als Implementierung durchgehen.
  const state = deriveHandoffState({
    route, repo, latest: readLatest(), review: null,
    changedFiles: changedFilesSince(route.routedAtHead),
    implementationObserved: route.implementer === 'SCRIPT',
  });
  writeRuntimeReport(root, 'state.json', state);

  console.log([
    line('TASK_ID', route.taskId),
    line('TASK_CLASS', route.taskClass),
    line('IMPLEMENTER', route.implementer),
    line('REVIEWER', route.reviewRequired ? route.reviewer : '-'),
    line('RISK', policy.risk),
    line('SHOPIFY_WRITE_REQUIRED', route.shopifyWriteRequired ? 'JA' : 'NEIN'),
    line('HUMAN_GATE_REQUIRED', route.humanGateRequired ? 'JA' : 'NEIN'),
    line('NEXT_ALLOWED_ACTION', state.nextAllowedAction),
  ].join('\n'));
  plain(`Einstufung: ${explainTaskClass(route.taskClass) ?? route.taskClass}.`);
  if (route.implementerOverride) {
    console.log(`IMPLEMENTER_OVERRIDE: ${route.implementerOverride.from} -> ${route.implementerOverride.to} (${route.implementerOverride.reason})`);
    plain('Die Implementer-Rolle wurde ausdruecklich gesetzt. Automatisch waere das nie passiert.');
  }
  if (route.reviewerOverride) {
    console.log(`REVIEWER_OVERRIDE: ${route.reviewerOverride.from} -> ${route.reviewerOverride.to} (${route.reviewerOverride.reason})`);
    plain('Die Reviewer-Rolle wurde ausdruecklich gesetzt. Automatisch waere das nie passiert.');
  }
  if (reset.removed.length) plain('Alter Laufzustand dieser Aufgabe wurde zurueckgesetzt. Der naechste Lauf startet frisch.');
  plain(explainAction(state.nextAllowedAction));
  if (route.humanGateRequired) plain('Am Ende brauchst du eine ausdrueckliche Freigabe, bevor etwas Geschuetztes passiert.');
  console.log('\nWeiter mit: npm run ai:continue');
  return route;
}

function cmdStatus() {
  const route = readRoute();
  if (!route) {
    console.log('TASK: keine geroutete Aufgabe.\nStart mit: npm run ai:route -- "Beschreibung der Aufgabe"');
    return null;
  }
  const repo = repoContext();
  const review = readReview();
  const candidateCheck = assertImplementerCandidate({ candidate: readCandidateRecord(), route, repo });
  const state = deriveHandoffState({
    route, repo, latest: readLatest(),
    review: isEvidenceCurrent(review, { route, repo }) ? review : null,
    changedFiles: changedFilesSince(route.routedAtHead),
    implementationObserved: route.implementer === 'SCRIPT' || candidateCheck.status === 'VALID',
  });
  writeRuntimeReport(root, 'state.json', state);
  printState(state);
  console.log(line('IMPLEMENTER_ERGEBNIS', candidateCheck.status));
  console.log(line('AUFGABE', route.taskText));
  if (review) console.log(line('REVIEW_EVIDENCE', isEvidenceCurrent(review, { route, repo }) ? 'AKTUELL' : 'STALE (wird ignoriert)'));
  if (stopRequested()) console.log('STOP_FLAG: gesetzt (ai:continue laeuft nicht an)');
  return state;
}

function cmdNext() {
  const state = cmdStatus();
  if (state) console.log(`\nNEXT_ALLOWED_ACTION: ${state.nextAllowedAction}`);
  return state;
}

function cmdStop() {
  fs.mkdirSync(path.dirname(stopFlagPath), { recursive: true });
  fs.writeFileSync(stopFlagPath, `${JSON.stringify({ requestedAt: new Date().toISOString() })}\n`);
  console.log('STOP angefordert. Der naechste ai:continue-Schritt haelt kontrolliert an.');
  console.log('Aufheben mit: npm run ai:continue -- --clear-stop');
}

function cmdResume() {
  const { runState, taskStates, lockPresent } = readRunnerState();
  const route = readRoute();
  const repo = route ? repoContext() : null;
  const assessment = assessResumability({ runState, taskStates, route, repo, lockPresent });
  console.log([
    line('LETZTER_RUN', assessment.lastRunId),
    line('LETZTER_STATUS', assessment.lastRunStatus),
    line('LETZTER_HEARTBEAT', assessment.lastHeartbeatAt),
    line('UNTERBROCHEN', assessment.interrupted ? 'JA' : 'NEIN'),
    line('RUN_LOCK', assessment.lockPresent ? 'VORHANDEN' : 'FREI'),
    line('UNVOLLSTAENDIGE_TASKS', assessment.unfinishedTasks.map(task => `${task.taskId}=${task.status}`).join(', ') || '-'),
    line('FORTSETZBAR', assessment.resumable ? 'JA' : 'NEIN'),
    line('ENTSCHEIDUNG', assessment.decision),
    line('DETAIL', assessment.detail),
  ].join('\n'));
  if (!assessment.resumable) process.exitCode = 2;
  return assessment;
}

async function cmdContinue() {
  if (args['clear-stop'] === true) clearStopFlag();
  const riskMap = loadRiskMap(riskMapPath);
  const routedTask = readRoute();
  const metrics = createUsageMetrics({ root, task: routedTask });
  const providerDetector = createLazyProviderDetector({
    run,
    cwd: root,
    onDetect: result => metrics.recordProviderCheck(result),
  });
  const allowDirty = args['allow-dirty'] === true;

  let outcome = null;
  try {
    outcome = await continueUntilGate({
    repo: repoContext,
    readRoute,
    readLatest,
    readReview,
    changedFiles: changedFilesSince,
    readCandidate: readCandidateRecord,
    stopRequested,
    validate,
    writeState: state => writeRuntimeReport(root, 'state.json', state),
    localRunner: args['local-runner'] === true,
    retryNow: args['retry-now'] === true,
    allowDirty,
    maxIterations: (() => {
      // parseArgs liefert Strings; ungueltige Werte fallen auf den Default zurueck.
      const parsed = Number.parseInt(args['max-iterations'], 10);
      return Number.isInteger(parsed) && parsed > 0 && parsed <= 50 ? parsed : MAX_CONTINUE_ITERATIONS;
    })(),
    onEvent: event => {
      if (event.type === 'ITERATION') {
        console.log(`[${event.iteration}] ${event.action}`);
        plain(explainAction(event.action));
      }
      if (event.type === 'AGENT_START') console.log(`    -> ${event.agentRole} (${event.role})`);
      if (event.type === 'AGENT_END') console.log(`    <- ${event.agentRole}: ${event.result.status}`);
      if (event.type === 'WARNING') console.log(`    ! ${event.message}`);
      if (event.type === 'PHASE_FORCED') {
        console.log(`    ! Noch kein Implementer-Ergebnis (${event.reason}) - es wird zuerst implementiert statt reviewt.`);
        plain(event.detail);
      }
    },
    runCycle: ({ route, repo, state, phase, candidate }) => {
      // route.filesOverride kommt von ai:route --files und muss hier erneut
      // durchgereicht werden - ohne das faellt deriveTaskPolicy() still auf
      // DEFAULT_ALLOWED_FILES zurueck und eine per --files beabsichtigte
      // Einschraenkung greift zur Laufzeit nicht (siehe cmdRoute() oben).
      const policy = deriveTaskPolicy(route, { files: route.filesOverride ?? [], risk: args.risk });
      const diffScope = createDiffScopePort(route.taskId);
      // Der Candidate wurde bereits vom Loop geprueft und an Aufgabe und
      // Commit gebunden. Ohne ihn laeuft nie ein Reviewer.
      const priorScope = phase === AGENT_PHASE.REVIEW ? candidate : null;
      return runAgentCycle({
        route,
        repo,
        policy,
        riskMap,
        stateDir,
        needsAhmetPath,
        workspace: root,
        phase,
        // Aus dem abgeleiteten State, nicht aus der Route: ein Review kann erst
        // durch den tatsaechlichen Diff noetig geworden sein.
        reviewRequired: state?.reviewRequired ?? route.reviewRequired,
        priorScope,
        // An Aufgabe UND Commit gebunden - sonst waere nicht feststellbar, ob
        // das Ergebnis noch zum aktuellen Stand gehoert.
        persistScope: record => writeRuntimeReport(root, 'ai-scope.json', { ...record, commit: repo.head, branch: repo.branch }),
        resetState: () => resetTaskState({ stateDir, taskId: route.taskId, io: fs, pathApi: path, keepBaseline: true }),
        testCommands: route.taskClass === 'A' ? ['npm run workflow:test'] : ['npm test'],
        evidence: `Geaenderte Dateien seit Routing:\n${changedFilesSince(route.routedAtHead).join('\n') || '(keine)'}`,
        readDiff: readDiffForReview,
        diffScope,
        // async: HTTP-basierte Provider (Nemotron) liefern ein Promise, die
        // bisherigen Subprozess-Provider einen bereits fertigen Wert - beides
        // ist unter await gueltig und aendert deren Verhalten nicht.
        runRole: async options => {
          const result = await runProviderRole({
            ...options,
            cwd: root,
            run,
            getCapability: provider => providerDetector.get(provider),
          });
          metrics.recordModelCall({ role: options.role, agentRole: options.agentRole, result });
          return result;
        },
        onEvent: event => {
          if (event.type === 'AGENT_START') console.log(`    -> ${event.agentRole}${event.stage === 'PRE' ? ' (Erstpass)' : ''} (${event.role})`);
          if (event.type === 'AGENT_END') console.log(`    <- ${event.agentRole}${event.stage === 'PRE' ? ' (Erstpass)' : ''}: ${event.result.status}`);
          if (event.type === 'PRE_REVIEW_ESCALATED') {
            console.log(`    ! Erstpass (${event.preReviewer}: ${event.preStatus}) reicht nicht - eskaliert an ${event.to}${event.hardEscalation ? ' (Datei erfordert immer Codex-Review)' : ''}`);
            plain(`${event.preReviewer} hat entweder etwas gefunden, konnte nicht abschliessen, oder eine Datei betroffen, die immer Codex braucht (Geld, CI, Orchestrator). Deshalb pruefe jetzt zusaetzlich ${event.to} unabhaengig.`);
          }
          if (event.type === 'SCOPE') {
            console.log(`    = Diff-Zuordnung (${event.agentRole}): ${summarizeScope(event.scope)}`);
            plain(scopeInPlainWords(event.scope));
          }
        },
      }).then(cycle => {
        // Phase 7: Review-Evidence schreiben, sobald ein Reviewer gelaufen ist.
        if (cycle.results?.reviewer) {
          const evidence = createReviewEvidence({
            // reviewerRole ist der Reviewer, dessen Ergebnis tatsaechlich zaehlt -
            // bei Klasse B kann das der Nemotron-Erstpass ODER die
            // Codex-Eskalation sein. route.reviewer bleibt nur Fallback fuer
            // Klassen ohne Erstpass.
            route, repo, reviewer: cycle.results.reviewerRole ?? route.reviewer, result: cycle.results.reviewer,
            scope: cycle.scope,
            agentDiffFingerprint: cycle.scope ? diffScope.fingerprint(cycle.scope) : null,
          });
          writeRuntimeReport(root, 'review.json', evidence);
        }
        return cycle;
      });
    },
    });
  } catch (error) {
    metrics.finish({ error });
    throw error;
  }

  metrics.finish({ outcome });

  printStop(outcome);
  if (outcome.stopReason !== STOP_REASONS.DONE) process.exitCode = 2;
  return outcome;
}

// ---------------------------------------------------------------------------

async function main() {
  switch (mode) {
    case 'route': return cmdRoute();
    case 'status': case 'state': return cmdStatus();
    case 'next': return cmdNext();
    case 'continue': return cmdContinue();
    case 'stop': return cmdStop();
    case 'resume': return cmdResume();
    case 'providers': return cmdProviders();
    case 'usage': return cmdUsage();
    case 'usage-range': return cmdUsageRange();
    case 'unlock': {
      // Entfernt einen Run Lock ausschliesslich dann, wenn der zugehoerige
      // Prozess nachweislich nicht mehr existiert. Laeuft er noch oder ist der
      // Zustand unklar, passiert nichts.
      const lockPath = path.join(stateDir, 'run.lock');
      let lock = null;
      try { lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : null; } catch {}
      // Eine reine PID-Pruefung reicht nicht: Betriebssysteme vergeben PIDs
      // wieder. Deshalb zusaetzlich pruefen, ob der Prozess ueberhaupt ein
      // ai-control-Lauf ist. Nur wenn beides zutrifft, gilt er als lebendig.
      const verdict = inspectRunLock({
        lock,
        isProcessAlive: pid => {
          try { process.kill(pid, 0); } catch (error) { if (error.code !== 'EPERM') return false; }
          const probe = run(process.platform === 'win32' ? 'tasklist' : 'ps',
            process.platform === 'win32' ? ['/FI', `PID eq ${pid}`, '/FO', 'CSV'] : ['-p', String(pid), '-o', 'command='],
            { timeoutMs: 15_000 });
          if (probe.exitCode !== 0) return false;
          const command = String(probe.stdout ?? '');
          // Fremder Prozess auf recycelter PID -> der Lock ist verwaist.
          return /ai-control\.mjs/.test(command);
        },
      });
      console.log(line('RUN_LOCK', verdict.present ? verdict.reason : 'FREI'));
      console.log(line('DETAIL', verdict.detail));
      if (!verdict.present) return verdict;
      if (!verdict.stale) {
        plain('Der Lock wird nicht angeruehrt, solange nicht sicher ist, dass niemand mehr laeuft.');
        process.exitCode = 2;
        return verdict;
      }
      if (args.force !== true) {
        console.log('Zum Entfernen: npm run ai:unlock -- --force');
        plain('Der Lock ist verwaist. Mit --force wird er entfernt.');
        process.exitCode = 2;
        return verdict;
      }
      fs.rmSync(lockPath, { force: true });
      console.log('RUN_LOCK: entfernt');
      plain('Der verwaiste Lock wurde entfernt. Weiter mit: npm run ai:continue');
      return verdict;
    }
    case 'check-workspace': {
      const repo = repoContext();
      const safety = assertSafeWorkspace({ repo, mode: 'WRITE', allowDirty: args['allow-dirty'] === true });
      console.log(`WORKSPACE_SAFE: ${safety.safe ? 'JA' : 'NEIN'}`);
      if (!safety.safe) { console.log(safety.detail); process.exitCode = 2; }
      return safety;
    }
    default:
      throw new WorkflowGateError(`Unbekannter Befehl: ${mode}. Erlaubt: route, status, next, continue, stop, resume, providers, usage, usage-range, unlock, check-workspace`, 'USAGE');
  }
}

main().catch(error => {
  console.error(`${error.code ?? error.name}: ${error.message}`);
  console.log('\nNAECHSTE MOEGLICHE BEFEHLE:');
  for (const command of nextCommandsFor(STOP_REASONS.UNKNOWN_BLOCKER)) console.log(`  - ${command}`);
  process.exitCode = 1;
});
