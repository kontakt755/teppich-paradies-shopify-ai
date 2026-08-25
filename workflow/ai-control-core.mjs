/**
 * Orchestrator-Kern (Phasen 2, 6, 7, 8, 9, 10).
 *
 * Enthaelt ausschliesslich testbare Logik mit injizierbaren Ports. Die
 * CLI-Verdrahtung (git, Prozessstart, Dateisystem) liegt in ai-control.mjs.
 *
 * Wiederverwendet bewusst die vorhandene Architektur:
 * - workflow/router.mjs        -> Klassifizierung, Handoff-State, planContinue
 * - automation/core/runner.mjs -> Lock, State Store, RiskGuard, Review-Cycle
 * - automation/core/review-cycle.mjs -> IMPLEMENT/REVIEW/CORRECT, max. 3 Runden
 */

import { ManifestRunner } from '../automation/core/runner.mjs';
import { DEFAULT_MAX_REVIEW_ROUNDS } from '../automation/core/review-cycle.mjs';
import { HardStopError, RiskGuard } from '../automation/core/risk-guard.mjs';
import { RunLockedError } from '../automation/core/run-lock.mjs';
import { deriveHandoffState, planContinue, requiresHardEscalation } from './router.mjs';
import { SCOPE_STATUS } from './diff-scope.mjs';
import { summarizeAgentResult, toCycleStatus } from './agent-result.mjs';
import { buildCorrectionPrompt, buildImplementerPrompt, buildReviewerPrompt } from './prompts.mjs';

export const MAX_CONTINUE_ITERATIONS = 12;
export const AI_STATE_DIR = '.workflow/ai';
export const STOP_FLAG = '.workflow/ai-stop.flag';

/** Alle Gruende, aus denen der Continue-Loop kontrolliert anhaelt. */
export const STOP_REASONS = Object.freeze({
  DONE: 'DONE',
  HUMAN_GATE: 'HUMAN_GATE',
  NEEDS_AHMET: 'NEEDS_AHMET',
  SECURITY_STOP: 'SECURITY_STOP',
  HARD_FAIL: 'HARD_FAIL',
  REVIEW_LIMIT_REACHED: 'REVIEW_LIMIT_REACHED',
  CORRECTION_REQUIRED: 'CORRECTION_REQUIRED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_AUTH_REQUIRED: 'PROVIDER_AUTH_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  BLOCKED_EXTERNAL: 'BLOCKED_EXTERNAL',
  UNKNOWN_BLOCKER: 'UNKNOWN_BLOCKER',
  NEEDS_LOCAL_RUNNER: 'NEEDS_LOCAL_RUNNER',
  NEEDS_DETERMINISTIC_SCRIPT: 'NEEDS_DETERMINISTIC_SCRIPT',
  DIRTY_WORKTREE: 'DIRTY_WORKTREE',
  STALE_STATE: 'STALE_STATE',
  RUN_LOCKED: 'RUN_LOCKED',
  MANUAL_STOP: 'MANUAL_STOP',
  MAX_ITERATIONS: 'MAX_ITERATIONS',
  NO_TASK: 'NO_TASK',
  NO_PROGRESS: 'NO_PROGRESS',
});

/** Stops, nach denen Ahmet entscheiden muss (nicht einfach "weiter"). */
export const HUMAN_DECISION_STOPS = new Set([
  STOP_REASONS.HUMAN_GATE, STOP_REASONS.NEEDS_AHMET, STOP_REASONS.SECURITY_STOP,
  STOP_REASONS.HARD_FAIL, STOP_REASONS.REVIEW_LIMIT_REACHED, STOP_REASONS.CORRECTION_REQUIRED,
]);

// ---------------------------------------------------------------------------
// Task-Policy: Allowlist, Operationen, Risk
// ---------------------------------------------------------------------------

/**
 * Konservative Default-Allowlist. Bewusst OHNE templates/product*.json und
 * config/settings_data.json - beides ist in der Risk Map HIGH und wuerde einen
 * autonomen Lauf sofort und bei jedem Durchgang hart stoppen.
 */
export const DEFAULT_ALLOWED_FILES = Object.freeze([
  'automation/**', 'qa/**', 'reports/**', 'docs/**', 'locales/**', 'workflow/**',
  'assets/**/*.css', 'snippets/**', 'sections/**', 'blocks/**', 'templates/collection*.json',
]);

// Kumulative, eingefrorene Operationsstufen. Keine dieser Listen enthaelt eine
// HIGH-Operation aus der Risk Map - Shopify Write, Publish, Push und Merge
// bleiben Human Gates und sind fuer den Orchestrator nie ausfuehrbar.
const BASE_OPERATIONS = Object.freeze([
  'read', 'git_status', 'git_diff', 'git_log', 'report_write', 'test_write',
]);

const LIGHT_EDIT_OPERATIONS = Object.freeze([
  ...BASE_OPERATIONS,
  'isolated_css_edit', 'locale_edit', 'accessibility_edit', 'small_snippet_edit', 'multi_file_theme_edit',
]);

const STRUCTURAL_EDIT_OPERATIONS = Object.freeze([
  ...LIGHT_EDIT_OPERATIONS,
  'collection_template_edit', 'navigation_edit',
]);

// Klasse D teilt sich die Operationsliste mit C: die zusaetzliche Kritikalitaet
// von D wird ueber Review-Pflicht und Human Gate abgebildet, nicht ueber
// weitergehende Schreibrechte. Beide verweisen bewusst auf dieselbe
// eingefrorene Konstante - kein nachtraegliches Zuweisen.
const OPERATIONS_BY_CLASS = Object.freeze({
  A: BASE_OPERATIONS,
  B: LIGHT_EDIT_OPERATIONS,
  C: STRUCTURAL_EDIT_OPERATIONS,
  D: STRUCTURAL_EDIT_OPERATIONS,
});

/**
 * Leitet die Ausfuehrungspolicy aus einem Route-Objekt ab.
 *
 * Der Risk der *Implementierungsarbeit* ist maximal MEDIUM. HIGH-Operationen
 * (Shopify Write, Publish, Push, Merge) stehen nie in allowedOperations - sie
 * bleiben Human Gates und werden vom Orchestrator nicht ausgefuehrt.
 */
export function deriveTaskPolicy(route, { files = [], risk = null } = {}) {
  const taskClass = route?.taskClass ?? 'B';
  const allowedFiles = files.length ? [...files] : [...DEFAULT_ALLOWED_FILES];
  const allowedOperations = [...(OPERATIONS_BY_CLASS[taskClass] ?? OPERATIONS_BY_CLASS.B)];
  const effectiveRisk = risk === 'LOW' ? 'LOW' : 'MEDIUM';
  return { allowedFiles, allowedOperations, risk: effectiveRisk, taskClass };
}

/**
 * Router-Rollen, hinter denen kein KI-Provider steht. Sie duerfen niemals einen
 * Agentenlauf ausloesen: SCRIPT bedeutet deterministische Ausfuehrung, HUMAN
 * bedeutet Entscheidung durch Ahmet.
 */
const NON_PROVIDER_ROLES = new Set(['SCRIPT', 'HUMAN']);

export function isModelProviderRole(role) {
  const normalized = String(role ?? '').trim().toUpperCase();
  return normalized.length > 0 && !NON_PROVIDER_ROLES.has(normalized);
}

/**
 * Setzt den Runner-State einer Aufgabe zurueck.
 *
 * Noetig beim erneuten Routing: Der ManifestRunner behandelt Status wie
 * SECURITY_STOP, PASS oder HARD_FAIL als endgueltig. Ohne Reset wuerde ein
 * neuer Lauf mit derselben Task-ID sofort mit dem alten Ergebnis zurueckkehren,
 * ohne dass ein Agent ueberhaupt startet.
 *
 * Loescht ausschliesslich Orchestrator-eigenen State unter stateDir - niemals
 * etwas im Working Tree.
 *
 * @returns {{removed: string[], skipped: string[]}}
 */
export function resetTaskState({ stateDir, taskId, io, pathApi, keepBaseline = false }) {
  const removed = [];
  const skipped = [];
  if (!stateDir || !taskId) return { removed, skipped };
  const targets = [
    pathApi.join(stateDir, 'tasks', `${taskId}.json`),
    pathApi.join(stateDir, 'run-state.json'),
  ];
  // Beim erneuten Routing faellt auch die Baseline weg. Zwischen zwei
  // Loop-Iterationen derselben Aufgabe bleibt sie dagegen bestehen.
  if (!keepBaseline) targets.push(pathApi.join(stateDir, 'baseline', String(taskId)));
  for (const target of targets) {
    try {
      if (!io.existsSync(target)) continue;
      io.rmSync(target, { recursive: true, force: true });
      removed.push(target);
    } catch {
      skipped.push(target);
    }
  }
  return { removed, skipped };
}

/** Baut aus einem Route-Objekt ein gueltiges Ein-Task-Manifest fuer den ManifestRunner. */
export function buildTaskManifest(route, policy) {
  return {
    runId: `AI-${route.taskId}`,
    tasks: [{
      id: route.taskId,
      domain: 'shopify',
      risk: policy.risk,
      dependencies: [],
      allowedFiles: policy.allowedFiles,
      allowedOperations: policy.allowedOperations,
      title: route.taskText,
    }],
  };
}

// ---------------------------------------------------------------------------
// Phase 10: Isolation / Schutz nicht committeter Aenderungen
// ---------------------------------------------------------------------------

/**
 * Prueft, ob ein SCHREIBENDER Agentenlauf sicher ist.
 *
 * Bei schmutzigem Working Tree wird bewusst gestoppt statt automatisch
 * gestasht, committet oder verschoben. Fremde, nicht committete Aenderungen
 * duerfen nie verloren gehen.
 */
export function assertSafeWorkspace({ repo, mode = 'WRITE', allowDirty = false }) {
  if (mode !== 'WRITE') return { safe: true, reason: null };
  if (repo?.clean) return { safe: true, reason: null };
  if (allowDirty) {
    return { safe: true, reason: 'DIRTY_ACCEPTED_BY_OPERATOR', warning: 'Working Tree ist nicht sauber; --allow-dirty wurde ausdruecklich gesetzt.' };
  }
  return {
    safe: false,
    reason: STOP_REASONS.DIRTY_WORKTREE,
    detail: 'Working Tree enthaelt nicht committete Aenderungen. Schreibende Agentenlaeufe sind gesperrt, '
      + 'damit nichts davon verloren geht. Aenderungen selbst sichern (commit oder eigener Branch) '
      + 'oder bewusst mit --allow-dirty starten.',
  };
}

// ---------------------------------------------------------------------------
// Phase 7: Review-Evidence
// ---------------------------------------------------------------------------

export function createReviewEvidence({ route, repo, reviewer, result, scope = null, agentDiffFingerprint = null, now = () => new Date().toISOString() }) {
  const findings = result?.findings ?? [];
  const count = priority => findings.filter(finding => finding.priority === priority).length;
  return {
    schemaVersion: 1,
    taskId: route.taskId,
    taskText: route.taskText,
    branch: repo.branch,
    commit: repo.head,
    worktreeFingerprint: repo.worktreeFingerprint,
    // Bindet die Evidence an genau den Diff, den der Reviewer gesehen hat -
    // nicht an den gesamten Working Tree.
    agentDiffFingerprint,
    reviewedFiles: scope?.agentFiles ?? null,
    reviewer,
    reviewerProvider: result?.provider ?? null,
    status: count('P0') === 0 && count('P1') === 0 ? 'PASS' : 'FINDINGS',
    p0: count('P0'),
    p1: count('P1'),
    p2: count('P2'),
    findings,
    reviewRound: result?.reviewRound ?? null,
    createdAt: now(),
  };
}

/**
 * Stale Evidence wird nie weiterverwendet.
 *
 * Zusaetzlich zur Bindung an Aufgabe, Commit und Working Tree kann der
 * agentenspezifische Diff-Fingerprint geprueft werden. Aendert sich der Diff
 * des Agentenlaufs nachtraeglich, ist das Review nicht mehr gueltig - auch
 * dann, wenn der uebrige Working Tree gleich geblieben waere.
 */
export function isEvidenceCurrent(evidence, { route, repo, agentDiffFingerprint = null }) {
  if (!evidence) return false;
  if (evidence.taskId !== route?.taskId) return false;
  if (evidence.commit !== repo?.head) return false;
  if (evidence.worktreeFingerprint && evidence.worktreeFingerprint !== repo?.worktreeFingerprint) return false;
  if (agentDiffFingerprint && evidence.agentDiffFingerprint && evidence.agentDiffFingerprint !== agentDiffFingerprint) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Phase 6: Router -> Runner -> Provider -> Review-Cycle
// ---------------------------------------------------------------------------

/**
 * Welche Phase ein Handoff ausloest. Der Loop laeuft iterativ: Implementer,
 * Validierung und Review sind getrennte Durchgaenge. Ohne diese Unterscheidung
 * wuerde der ManifestRunner den bereits terminalen Task ueberspringen und der
 * Reviewer nie starten.
 */
export const AGENT_PHASE = Object.freeze({ IMPLEMENT: 'IMPLEMENT', REVIEW: 'REVIEW' });

export function phaseForAction(action) {
  return action === 'HANDOFF_REVIEWER' ? AGENT_PHASE.REVIEW : AGENT_PHASE.IMPLEMENT;
}

export const CANDIDATE_STATUS = Object.freeze({
  VALID: 'VALID',
  MISSING: 'MISSING',
  EMPTY: 'EMPTY',
  STALE_TASK: 'STALE_TASK',
  STALE_COMMIT: 'STALE_COMMIT',
  STALE_DIFF: 'STALE_DIFF',
});

/**
 * Sicherheitsinvariante fuer den Reviewer-Handoff.
 *
 * Ein Reviewer darf nur starten, wenn ein Implementer-Ergebnis existiert, das
 * eindeutig zu genau dieser Aufgabe und diesem Commit gehoert.
 *
 * Wichtig: `deriveHandoffState` leitet "wurde schon implementiert" aus den
 * geaenderten Dateien ab. In einem schmutzigen Working Tree ist das immer
 * wahr - auch ohne jeden Agentenlauf. Diese Pruefung ist deshalb die einzige
 * belastbare Quelle dafuer, ob wirklich ein Candidate vorliegt.
 *
 * MISSING/EMPTY = es wurde noch nicht implementiert -> Implementer zuerst.
 * STALE_*       = widerspruechlicher Zustand -> Mensch entscheidet.
 */
export function assertImplementerCandidate({ candidate, route, repo, agentDiffFingerprint = null }) {
  if (!candidate) {
    return { status: CANDIDATE_STATUS.MISSING, candidate: null, detail: 'Fuer diese Aufgabe liegt noch kein Implementer-Ergebnis vor.' };
  }
  if (candidate.taskId && route?.taskId && candidate.taskId !== route.taskId) {
    return {
      status: CANDIDATE_STATUS.STALE_TASK, candidate: null,
      detail: `Das gespeicherte Implementer-Ergebnis gehoert zu Aufgabe ${candidate.taskId}, aktuell laeuft ${route.taskId}.`,
    };
  }
  if (candidate.commit && repo?.head && candidate.commit !== repo.head) {
    return {
      status: CANDIDATE_STATUS.STALE_COMMIT, candidate: null,
      detail: `Das Implementer-Ergebnis wurde bei Commit ${candidate.commit} erzeugt, aktuell ist ${repo.head}.`,
    };
  }
  if (agentDiffFingerprint && candidate.agentDiffFingerprint && candidate.agentDiffFingerprint !== agentDiffFingerprint) {
    return {
      status: CANDIDATE_STATUS.STALE_DIFF, candidate: null,
      detail: 'Der Agenten-Diff hat sich seit dem Implementer-Lauf veraendert.',
    };
  }
  if (!Array.isArray(candidate.agentFiles) || !candidate.agentFiles.length) {
    return { status: CANDIDATE_STATUS.EMPTY, candidate: null, detail: 'Das gespeicherte Implementer-Ergebnis enthaelt keine gemessenen Dateien.' };
  }
  return { status: CANDIDATE_STATUS.VALID, candidate, detail: null };
}

/** MISSING/EMPTY heisst: einfach zuerst implementieren. Alles andere ist widerspruechlich. */
const CANDIDATE_NEEDS_IMPLEMENTER = new Set([CANDIDATE_STATUS.MISSING, CANDIDATE_STATUS.EMPTY]);

/**
 * Bewertet einen vorhandenen Run Lock.
 *
 * Ein abgebrochener Lauf (Timeout, Strg-C, Crash) laesst die Lock-Datei
 * zurueck und blockiert damit jeden weiteren Lauf. Ein Lock, dessen Prozess
 * nachweislich nicht mehr existiert, ist verwaist.
 *
 * Bewusst nur eine Bewertung, kein automatisches Aufraeumen: Solange
 * unklar ist, ob der Prozess noch laeuft, entscheidet der Mensch.
 */
export function inspectRunLock({ lock, isProcessAlive, now = () => new Date() }) {
  if (!lock) return { present: false, stale: false, reason: 'NO_LOCK', detail: 'Kein Lauf haelt den Lock.' };
  const pid = Number(lock.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return { present: true, stale: false, reason: 'UNKNOWN_PID', detail: 'Der Lock nennt keine brauchbare Prozess-ID. Zustand unklar.', lock };
  }
  let alive;
  try {
    alive = isProcessAlive(pid);
  } catch {
    return { present: true, stale: false, reason: 'PROBE_FAILED', detail: 'Der Prozessstatus liess sich nicht pruefen. Zustand unklar.', lock };
  }
  if (alive) {
    return { present: true, stale: false, reason: 'ACTIVE', detail: `Prozess ${pid} laeuft noch. Zwei gleichzeitige Laeufe sind nicht erlaubt.`, lock };
  }
  const age = lock.acquiredAt ? now().getTime() - Date.parse(lock.acquiredAt) : null;
  return {
    present: true, stale: true, reason: 'STALE',
    detail: `Prozess ${pid} existiert nicht mehr${Number.isFinite(age) ? ` (Lock seit ${Math.round(age / 1000)}s)` : ''}. Der Lock stammt aus einem abgebrochenen Lauf.`,
    lock,
  };
}

/**
 * Synthetischer Implementer-Candidate fuer die Review-Phase.
 *
 * In dieser Phase hat der Implementer bereits in einem frueheren Durchgang
 * gearbeitet. Der Review-Cycle braucht trotzdem einen Startzustand - der wird
 * hier aus dem persistierten Scope rekonstruiert, ohne einen Agenten zu starten.
 */
function candidateFromPriorRun({ priorScope, policy }) {
  const changedFiles = priorScope?.agentFiles ?? [];
  const agentResult = {
    provider: priorScope?.provider ?? 'PRIOR_RUN',
    role: 'IMPLEMENTER',
    status: 'PASS',
    summary: priorScope?.summary ?? 'Ergebnis eines frueheren Implementer-Durchgangs.',
    changedFiles,
    tests: priorScope?.tests ?? { status: 'NOT_RUN', commands: [], passed: null, failed: null, summary: '' },
    findings: [],
    blockers: [],
  };
  return {
    ...agentResult,
    status: 'PASS',
    changedFiles,
    diffEntries: changedFiles.map(file => ({ file })),
    resources: priorScope?.resources ?? [],
    actualOperations: priorScope?.actualOperations ?? policy.allowedOperations,
    agentResult,
  };
}

/**
 * Fuehrt einen Agentendurchgang ueber den vorhandenen ManifestRunner aus:
 * Lock, State Store, RiskGuard-Preflight/Postflight, max. 3 Review-Runden.
 *
 * phase === IMPLEMENT: Implementer laeuft, danach ggf. Review und Korrektur.
 * phase === REVIEW:    kein zweiter Implementer; der Review-Cycle setzt auf dem
 *                      persistierten Ergebnis des frueheren Durchgangs auf.
 */
export async function runAgentCycle({
  route, repo, policy, runRole, riskMap, stateDir, needsAhmetPath,
  testCommands = [], evidence = '', readDiff = () => '', workspace = null,
  maxReviewRounds = DEFAULT_MAX_REVIEW_ROUNDS, io, clock = () => new Date(),
  onEvent = () => {}, diffScope = null,
  phase = AGENT_PHASE.IMPLEMENT,
  // Muss aus dem abgeleiteten State kommen, nicht aus der Route: ein Review
  // kann erst durch den tatsaechlichen Diff noetig werden.
  reviewRequired = route.reviewRequired,
  priorScope = null,
  persistScope = () => {},
  // Der ManifestRunner behandelt PASS/SECURITY_STOP als endgueltig und
  // ueberspringt solche Tasks. Jede Loop-Iteration ist aber ein eigener,
  // frischer Durchgang - ohne diesen Reset wuerde ab dem zweiten Handoff kein
  // Agent mehr starten.
  resetState = () => {},
}) {
  const promptBase = { task: route.taskText, route: { ...route, riskClass: policy.risk }, git: repo };
  const agentContext = { branch: repo.branch, head: repo.head, workspace };
  const lastResults = { implementer: null, reviewer: null, corrector: null };
  // Ergebnis des Diff-Scopings des zuletzt gelaufenen schreibenden Agenten.
  // Der Reviewer bekommt ausschliesslich diesen Diff zu sehen.
  let lastScope = null;
  let scopeStop = null;

  /**
   * Kapselt einen schreibenden Agentenlauf (Implementer oder Corrector) mit
   * Baseline davor und Delta-Zuordnung danach. Ohne diffScope-Port bleibt das
   * bisherige Verhalten erhalten (Agent meldet seine Dateien selbst).
   */
  const runWritingAgent = async ({ agentRole, prompt }) => {
    const baseline = diffScope ? diffScope.capture() : null;
    onEvent({ type: 'AGENT_START', agentRole, role: route.implementer });
    // await ist hier notwendig fuer HTTP-basierte Provider (z. B. Nemotron ueber
    // fetch); bei den bisherigen, synchronen Subprozess-Providern loest await
    // einen bereits vorliegenden Wert sofort auf und aendert nichts am Verhalten.
    const result = await runRole({ role: route.implementer, agentRole, mode: 'WRITE', prompt, context: agentContext });
    onEvent({ type: 'AGENT_END', agentRole, result });

    let changedFiles = result.changedFiles;
    if (diffScope) {
      const scope = diffScope.classify({
        baseline,
        allowedFiles: policy.allowedFiles,
        declaredFiles: result.changedFiles,
      });
      lastScope = scope;
      onEvent({ type: 'SCOPE', agentRole, scope });
      if (scope.status === SCOPE_STATUS.SECURITY_STOP) {
        scopeStop = { stopReason: STOP_REASONS.SECURITY_STOP, detail: scope.detail };
        return {
          ...result, status: 'SECURITY_STOP', changedFiles: scope.agentFiles, diffEntries: [],
          resources: result.resources, actualOperations: result.actualOperations ?? policy.allowedOperations,
          agentResult: result, scope,
        };
      }
      if (scope.status !== SCOPE_STATUS.OK) {
        // NEEDS_AHMET laesst der ManifestRunner als Cycle-Status nicht zu.
        // Der Lauf wird daher als BLOCKED beendet; der echte Stop-Grund reist
        // ueber scopeStop zum Orchestrator.
        scopeStop = { stopReason: STOP_REASONS.NEEDS_AHMET, detail: scope.detail };
        return {
          ...result, status: 'BLOCKED', changedFiles: scope.agentFiles, diffEntries: [],
          resources: result.resources, actualOperations: result.actualOperations ?? policy.allowedOperations,
          agentResult: result, scope,
        };
      }
      // Nur der real gemessene Agenten-Delta zaehlt, nicht die Selbstauskunft.
      changedFiles = scope.agentFiles;
    }

    return {
      ...result,
      status: toCycleStatus(result),
      changedFiles,
      diffEntries: changedFiles.map(file => ({ file })),
      resources: result.resources,
      actualOperations: result.actualOperations ?? policy.allowedOperations,
      agentResult: result,
      scope: lastScope,
    };
  };

  const implement = async () => {
    // In der Review-Phase hat der Implementer bereits gearbeitet. Es wird kein
    // zweiter Implementer gestartet - der Review-Cycle setzt auf dem
    // persistierten Ergebnis auf.
    if (phase === AGENT_PHASE.REVIEW) {
      const candidate = candidateFromPriorRun({ priorScope, policy });
      lastScope = priorScope;
      onEvent({ type: 'PHASE', phase, changedFiles: candidate.changedFiles });
      return candidate;
    }
    const prompt = buildImplementerPrompt({
      ...promptBase,
      allowedFiles: policy.allowedFiles,
      allowedOperations: policy.allowedOperations,
      evidence,
      testCommands,
    });
    const outcome = await runWritingAgent({ agentRole: 'IMPLEMENTER', prompt });
    lastResults.implementer = outcome.agentResult;
    // Der Scope muss den Durchgang ueberleben: der Reviewer laeuft erst in
    // einer spaeteren Iteration und braucht genau diese Dateiliste.
    if (outcome.scope?.status === SCOPE_STATUS.OK) {
      persistScope({
        taskId: route.taskId,
        agentFiles: outcome.scope.agentFiles,
        provider: outcome.agentResult?.provider ?? null,
        summary: outcome.agentResult?.summary ?? '',
        tests: outcome.agentResult?.tests ?? null,
        resources: outcome.agentResult?.resources ?? [],
        actualOperations: outcome.agentResult?.actualOperations ?? null,
        at: clock().toISOString(),
      });
    }
    return outcome;
  };

  /**
   * Uebersetzt ein Reviewer-Agentenresultat in den Review-Cycle-Status.
   * Gemeinsam fuer Nemotron-Erstpass und Codex-Eskalation - beide muessen
   * exakt dieselbe strenge Bewertung durchlaufen, kein Sonderpfad fuer den
   * billigeren Reviewer.
   */
  const finalizeReviewResult = (result, reviewRound, reviewerRole) => {
    lastResults.reviewerRole = reviewerRole;
    let verdict;
    if (result.status === 'SECURITY_STOP') {
      verdict = { status: 'SECURITY_STOP', findings: result.findings };
    } else if (!['PASS', 'FINDINGS'].includes(result.status)) {
      // Ein Reviewer, der nicht laufen konnte, ist KEIN PASS.
      verdict = { status: 'FAIL', findings: [{
        priority: 'P1', file: '-', problem: `Reviewer konnte nicht abschliessen (${result.status})`,
        reason: result.blockers.join(' | ') || 'Kein verwertbares Reviewerergebnis',
        recommendedFix: 'Reviewprovider pruefen und Review erneut anfordern',
      }] };
    } else {
      verdict = { status: result.findings.length ? 'FINDINGS' : 'PASS', findings: result.findings };
    }
    // Sicherheitskritisch: lastResults.reviewer.findings muss exakt dem
    // berechneten Verdict entsprechen, inklusive des synthetischen
    // P1-Findings bei einem gescheiterten Reviewer (BLOCKED/RATE_LIMITED/
    // UNAVAILABLE/...). createReviewEvidence() in ai-control.mjs zaehlt P0/P1
    // ausschliesslich aus diesen findings, um PASS/FINDINGS abzuleiten - ohne
    // diese Angleichung waere ein Reviewer, der nie fertig gelaufen ist (rohe
    // findings = []), faelschlich als PASS mit p0=0/p1=0 dokumentiert worden.
    lastResults.reviewer = { ...result, reviewRound, findings: verdict.findings };
    return verdict;
  };

  const review = async (_task, candidate, { reviewRound, maxReviewRounds: rounds }) => {
    const prompt = buildReviewerPrompt({
      ...promptBase,
      implementerSummary: summarizeAgentResult(candidate.agentResult ?? candidate),
      // Nur der agentenspezifische Diff. Vorher vorhandene, fremde Aenderungen
      // bekommt der Reviewer bewusst nicht zu sehen und bewertet sie nicht.
      diff: diffScope ? diffScope.readScopedDiff(lastScope ?? priorScope) : readDiff(),
      testReport: candidate.agentResult?.tests?.summary ?? '',
      reviewRound,
      maxReviewRounds: rounds,
    });

    // Kostenguenstiger Erstpass (Klasse B, Standardroute): Nemotron prueft
    // zuerst. Nur ein sauberes PASS auf ausschliesslich nicht-sensiblen
    // Dateien ersetzt Codex - jeder Fund, jeder Fehler/Ausfall des Erstpasses
    // und jede sensible Datei eskaliert unveraendert an route.reviewer. Ein
    // ausdruecklicher --reviewer-Override (route.reviewerOverride) schaltet
    // den Erstpass komplett ab: eine bewusste Operator-Wahl bekommt keine
    // automatische Zwischenstufe.
    if (route.preReviewer && !route.reviewerOverride) {
      const agentFiles = (lastScope ?? priorScope)?.agentFiles ?? [];
      // Bewusst die ENGERE requiresHardEscalation-Liste, nicht die breite
      // isSensitiveFile-Liste: die breite Liste zaehlt schon reines
      // Theme-Markup (sections/snippets/templates/layout/config) als
      // "sensibel", nur damit ueberhaupt ein Review stattfindet (siehe
      // deriveHandoffState). Hier geht es um eine andere Frage: darf ein
      // sauberer Nemotron-Erstpass DIESE Datei alleine freigeben? Bei Geld,
      // CI und dem Orchestrator/QA-Harness selbst: nein, immer. Bei reinem
      // Theme-Markup: ja, wenn der Erstpass sauber ist.
      const hardEscalation = agentFiles.some(requiresHardEscalation);
      onEvent({ type: 'AGENT_START', agentRole: 'REVIEWER', role: route.preReviewer, reviewRound, stage: 'PRE' });
      const preResult = await runRole({ role: route.preReviewer, agentRole: 'REVIEWER', mode: 'READ_ONLY', prompt, context: agentContext });
      onEvent({ type: 'AGENT_END', agentRole: 'REVIEWER', result: preResult, reviewRound, stage: 'PRE' });
      if (preResult.status === 'SECURITY_STOP') return finalizeReviewResult(preResult, reviewRound, route.preReviewer);
      if (preResult.status === 'PASS' && !hardEscalation) {
        return finalizeReviewResult(preResult, reviewRound, route.preReviewer);
      }
      onEvent({
        type: 'PRE_REVIEW_ESCALATED',
        reviewRound,
        preReviewer: route.preReviewer,
        preStatus: preResult.status,
        hardEscalation,
        to: route.reviewer,
      });
    }

    onEvent({ type: 'AGENT_START', agentRole: 'REVIEWER', role: route.reviewer, reviewRound });
    const result = await runRole({ role: route.reviewer, agentRole: 'REVIEWER', mode: 'READ_ONLY', prompt, context: agentContext });
    onEvent({ type: 'AGENT_END', agentRole: 'REVIEWER', result, reviewRound });
    return finalizeReviewResult(result, reviewRound, route.reviewer);
  };

  const correct = async (_task, candidate, findings, { reviewRound, maxReviewRounds: rounds }) => {
    const prompt = buildCorrectionPrompt({
      ...promptBase,
      implementerSummary: summarizeAgentResult(candidate.agentResult ?? candidate),
      findings,
      allowedFiles: policy.allowedFiles,
      allowedOperations: policy.allowedOperations,
      testCommands,
      reviewRound,
      maxReviewRounds: rounds,
    });
    const outcome = await runWritingAgent({ agentRole: 'CORRECTOR', prompt });
    lastResults.corrector = outcome.agentResult;
    return outcome;
  };

  const runner = new ManifestRunner({
    manifest: buildTaskManifest(route, policy),
    stateDir,
    executeTask: implement,
    reviewTask: reviewRequired ? review : null,
    correctTask: reviewRequired ? correct : null,
    maxReviewRounds,
    riskGuard: new RiskGuard({ riskMap }),
    needsAhmetPath,
    io,
    clock,
  });

  try {
    resetState({ taskId: route.taskId, phase });
    const outcome = await runner.run();
    const taskState = outcome.tasks[route.taskId];
    return {
      ok: true, status: taskState.status, taskState, runState: outcome.runState, results: lastResults,
      scope: lastScope,
      // Ein unklares Diff-Scoping schlaegt jeden freundlicheren Status.
      ...(scopeStop ?? {}),
    };
  } catch (error) {
    if (error instanceof RunLockedError) return { ok: false, status: 'BLOCKED', stopReason: STOP_REASONS.RUN_LOCKED, error: error.message, results: lastResults, scope: lastScope };
    if (error instanceof HardStopError) return { ok: false, status: 'SECURITY_STOP', stopReason: STOP_REASONS.SECURITY_STOP, error: error.message, evidence: error.evidence, results: lastResults, scope: lastScope };
    return { ok: false, status: 'HARD_FAIL', stopReason: STOP_REASONS.HARD_FAIL, error: error.message, results: lastResults, scope: lastScope };
  }
}

// ---------------------------------------------------------------------------
// Phase 8: Continue-until-gate
// ---------------------------------------------------------------------------

/** Uebersetzt einen Runner-/Cycle-Status in einen Stop-Grund. */
export function stopReasonForStatus(status) {
  switch (status) {
    case 'PASS': return null;
    case 'NEEDS_AHMET': return STOP_REASONS.NEEDS_AHMET;
    case 'SECURITY_STOP': return STOP_REASONS.SECURITY_STOP;
    case 'REVIEW_LIMIT_REACHED': return STOP_REASONS.REVIEW_LIMIT_REACHED;
    case 'CORRECTION_REQUIRED': return STOP_REASONS.CORRECTION_REQUIRED;
    case 'HARD_FAIL':
    case 'FAIL': return STOP_REASONS.HARD_FAIL;
    case 'PARKED':
    case 'BLOCKED': return STOP_REASONS.BLOCKED_EXTERNAL;
    case 'SKIPPED_DEPENDENCY': return STOP_REASONS.BLOCKED_EXTERNAL;
    default: return STOP_REASONS.UNKNOWN_BLOCKER;
  }
}

/** Uebersetzt ein Agentenresultat in einen Stop-Grund (Provider-Ebene). */
export function stopReasonForAgent(result) {
  switch (result?.status) {
    case 'UNAVAILABLE': return STOP_REASONS.PROVIDER_UNAVAILABLE;
    case 'AUTH_REQUIRED': return STOP_REASONS.PROVIDER_AUTH_REQUIRED;
    case 'RATE_LIMITED': return STOP_REASONS.RATE_LIMITED;
    case 'TIMEOUT': return STOP_REASONS.BLOCKED_EXTERNAL;
    case 'SECURITY_STOP': return STOP_REASONS.SECURITY_STOP;
    default: return null;
  }
}

/** Bedienhinweis fuer Ahmet je Stop-Grund. */
export function nextCommandsFor(reason) {
  switch (reason) {
    case STOP_REASONS.HUMAN_GATE:
    case STOP_REASONS.NEEDS_AHMET:
      return ['freigeben (bewusste Freigabe der geschuetzten Aktion)', 'aendern (Aufgabe anpassen und neu routen)', 'stoppen'];
    case STOP_REASONS.REVIEW_LIMIT_REACHED:
    case STOP_REASONS.CORRECTION_REQUIRED:
      return ['pruefen (Findings ansehen)', 'aendern (Aufgabe praezisieren)', 'stoppen'];
    case STOP_REASONS.SECURITY_STOP:
      return ['pruefen (Guard-Evidence ansehen)', 'stoppen'];
    case STOP_REASONS.RATE_LIMITED:
    case STOP_REASONS.BLOCKED_EXTERNAL:
      return ['spaeter erneut: npm run ai:continue -- --retry-now', 'stoppen'];
    case STOP_REASONS.PROVIDER_UNAVAILABLE:
    case STOP_REASONS.PROVIDER_AUTH_REQUIRED:
      return ['Provider pruefen: npm run ai:providers', 'stoppen'];
    case STOP_REASONS.DIRTY_WORKTREE:
      return ['eigene Aenderungen sichern (commit oder eigener Branch)', 'bewusst: npm run ai:continue -- --allow-dirty', 'stoppen'];
    case STOP_REASONS.NEEDS_LOCAL_RUNNER:
      return ['npm run ai:continue -- --local-runner (auf dem Mac)', 'stoppen'];
    case STOP_REASONS.NEEDS_DETERMINISTIC_SCRIPT:
      return ['deterministisches Script ausfuehren (z. B. npm run workflow:validate)', 'npm run ai:status', 'stoppen'];
    case STOP_REASONS.RUN_LOCKED:
      return ['laufenden Prozess beenden', 'npm run ai:status'];
    case STOP_REASONS.DONE:
      return ['npm run ai:status', 'neue Aufgabe: npm run ai:route -- "..."'];
    default:
      return ['npm run ai:status', 'stoppen'];
  }
}

/**
 * Kontrollierter Loop: laeuft selbstaendig weiter, bis ein definierter Stop
 * erreicht ist. Harte Obergrenze fuer Iterationen; kein unbegrenztes Laufen.
 *
 * Ports:
 *  - repo()            => { branch, head, clean, worktreeFingerprint }
 *  - readRoute()       => Route oder null
 *  - readLatest()      => letzte Validierung oder null
 *  - readReview()      => Review-Evidence oder null
 *  - changedFiles(since) => string[]
 *  - stopRequested()   => boolean
 *  - validate({staticOnly}) => { status, p0, p1 }
 *  - runCycle({ route, repo }) => Ergebnis von runAgentCycle
 *  - writeState(state) => void
 */
export async function continueUntilGate({
  repo, readRoute, readLatest, readReview, changedFiles,
  // Persistiertes Implementer-Ergebnis der aktuellen Aufgabe. Einzige
  // belastbare Quelle dafuer, ob wirklich schon implementiert wurde.
  readCandidate = () => null,
  stopRequested = () => false, validate, runCycle, writeState = () => {},
  maxIterations = MAX_CONTINUE_ITERATIONS, localRunner = false, retryNow = false,
  allowDirty = false, onEvent = () => {},
}) {
  const history = [];
  const finish = (reason, state, extra = {}) => {
    const outcome = { stopReason: reason, state: state ?? null, iterations: history.length, history, nextCommands: nextCommandsFor(reason), ...extra };
    onEvent({ type: 'STOP', ...outcome });
    return outcome;
  };

  const route = readRoute();
  if (!route) return finish(STOP_REASONS.NO_TASK, null);

  let lastAction = null;
  let repeatedAction = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (stopRequested()) return finish(STOP_REASONS.MANUAL_STOP, null);

    const current = repo();
    if (route.branch && route.branch !== current.branch) {
      return finish(STOP_REASONS.STALE_STATE, null, { detail: `Aufgabe wurde auf Branch ${route.branch} geroutet, aktuell ist ${current.branch}` });
    }

    const latest = readLatest();
    const review = readReview();
    // Root Cause: ein schmutziger Working Tree darf nicht als "schon
    // implementiert" gelten. Der Orchestrator kennt die Wahrheit - es zaehlt
    // ausschliesslich ein commitgebundenes Implementer-Ergebnis.
    const candidateCheck = assertImplementerCandidate({ candidate: readCandidate(), route, repo: current });
    // Ein widerspruechliches Implementer-Ergebnis (andere Aufgabe, anderer
    // Commit, veraenderter Diff) wird nie stillschweigend verworfen und nie
    // stillschweigend uebernommen. Sonst wuerde hier fremde Arbeit neu
    // implementiert oder falsche Arbeit reviewt.
    if (candidateCheck.status !== CANDIDATE_STATUS.VALID && !CANDIDATE_NEEDS_IMPLEMENTER.has(candidateCheck.status)) {
      return finish(STOP_REASONS.NEEDS_AHMET, null, { detail: candidateCheck.detail, candidateStatus: candidateCheck.status });
    }
    const state = deriveHandoffState({
      route,
      repo: current,
      latest,
      review: isEvidenceCurrent(review, { route, repo: current }) ? review : null,
      changedFiles: changedFiles(route.routedAtHead),
      latestChangedFiles: latest?.commit ? changedFiles(latest.commit) : null,
      implementationObserved: route.implementer === 'SCRIPT' || candidateCheck.status === CANDIDATE_STATUS.VALID,
    });
    writeState(state);

    const decision = planContinue(state, { localRunner, retryNow });
    onEvent({ type: 'ITERATION', iteration, action: state.nextAllowedAction, decision });
    history.push({ iteration, action: state.nextAllowedAction, kind: decision.kind });

    // Endlosschleifenschutz: dieselbe Aktion darf sich nicht unbegrenzt wiederholen.
    if (state.nextAllowedAction === lastAction) repeatedAction += 1;
    else repeatedAction = 0;
    lastAction = state.nextAllowedAction;
    if (repeatedAction >= 2) return finish(STOP_REASONS.NO_PROGRESS, state, { detail: `Aktion ${state.nextAllowedAction} brachte keinen Fortschritt` });

    if (decision.kind === 'STOP') {
      const reason = decision.reason === 'HUMAN_GATE' ? STOP_REASONS.HUMAN_GATE
        : decision.reason === 'NEEDS_LOCAL_RUNNER' ? STOP_REASONS.NEEDS_LOCAL_RUNNER
          : decision.reason === 'BLOCKED_EXTERNAL' ? STOP_REASONS.BLOCKED_EXTERNAL
            : STOP_REASONS.UNKNOWN_BLOCKER;
      return finish(reason, state);
    }

    if (decision.kind === 'VALIDATE_STATIC' || decision.kind === 'VALIDATE_FULL') {
      const validation = await validate({ staticOnly: decision.kind === 'VALIDATE_STATIC' });
      if (validation?.status !== 'PASS') {
        return finish(validation?.externalBlock ? STOP_REASONS.BLOCKED_EXTERNAL : STOP_REASONS.HARD_FAIL, state, { validation });
      }
      continue;
    }

    // planContinue() faellt fuer alles Uebrige auf HANDOFF zurueck. Zwei dieser
    // Faelle sind aber gar keine Agentenaufgabe und duerfen keinen Provider
    // starten:
    //
    // 1. PREPARE_DRAFT_PR ist der Fertig-Zustand des Orchestrators. Die
    //    PR-Erstellung selbst ist ein Human Gate und laeuft nie automatisch.
    // 2. Rollen ohne KI-Provider (SCRIPT, HUMAN) brauchen einen
    //    deterministischen Lauf bzw. eine Entscheidung, keinen Agenten.
    if (state.nextAllowedAction === 'PREPARE_DRAFT_PR') {
      return finish(STOP_REASONS.DONE, state, {
        detail: 'Arbeit abgeschlossen und validiert. Ein Draft-PR bleibt eine bewusste Aktion von Ahmet.',
      });
    }

    const handoffTarget = decision.target ?? state.nextAgent;
    if (!isModelProviderRole(handoffTarget)) {
      const reason = handoffTarget === 'HUMAN' ? STOP_REASONS.NEEDS_AHMET : STOP_REASONS.NEEDS_DETERMINISTIC_SCRIPT;
      return finish(reason, state, {
        detail: handoffTarget === 'HUMAN'
          ? 'Der naechste Schritt ist eine Entscheidung, kein Agentenlauf.'
          : `Rolle ${handoffTarget ?? '-'} ist kein KI-Provider. Der naechste Schritt ist ein deterministisches Script, kein Agentenlauf.`,
      });
    }

    // HANDOFF -> echter Agentenlauf
    const safety = assertSafeWorkspace({ repo: current, mode: 'WRITE', allowDirty });
    if (!safety.safe) return finish(STOP_REASONS.DIRTY_WORKTREE, state, { detail: safety.detail });
    if (safety.warning) onEvent({ type: 'WARNING', message: safety.warning });

    // Reviewer nur mit gebundenem Implementer-Ergebnis. Ohne Candidate wird
    // zuerst implementiert - ein Reviewer ohne Diff hat nichts zu pruefen.
    // Der Candidate wurde oben bereits geprueft: hier ist er entweder gueltig
    // oder es liegt keiner vor. Widerspruechliche Faelle haben den Lauf schon
    // beendet.
    let phase = phaseForAction(state.nextAllowedAction);
    let candidate = null;
    if (phase === AGENT_PHASE.REVIEW) {
      if (candidateCheck.status === CANDIDATE_STATUS.VALID) {
        candidate = candidateCheck.candidate;
      } else {
        phase = AGENT_PHASE.IMPLEMENT;
        onEvent({ type: 'PHASE_FORCED', from: AGENT_PHASE.REVIEW, to: AGENT_PHASE.IMPLEMENT, reason: candidateCheck.status, detail: candidateCheck.detail });
      }
    }
    history[history.length - 1].phase = phase;

    const cycle = await runCycle({ route, repo: current, state, phase, candidate });
    history[history.length - 1].cycleStatus = cycle.status;

    // Ein Reviewer-Handoff, der keinen Reviewer gestartet hat, ist ein Defekt -
    // kein stiller Weiterlauf. Sonst dreht der Loop bis NO_PROGRESS.
    if (phase === AGENT_PHASE.REVIEW && !cycle.results?.reviewer && !cycle.stopReason) {
      return finish(STOP_REASONS.UNKNOWN_BLOCKER, state, {
        cycle,
        detail: 'Der Reviewer-Handoff hat keinen Reviewer gestartet. Kein Ergebnis, kein Fortschritt - der Lauf haelt an, statt im Kreis zu laufen.',
      });
    }

    const agentStop = stopReasonForAgent(cycle.results?.implementer)
      ?? stopReasonForAgent(cycle.results?.reviewer)
      ?? stopReasonForAgent(cycle.results?.corrector);
    if (agentStop) return finish(agentStop, state, { cycle });
    if (cycle.stopReason) return finish(cycle.stopReason, state, { cycle });

    const statusStop = stopReasonForStatus(cycle.status);
    if (statusStop) return finish(statusStop, state, { cycle });
    // PASS -> naechste Iteration entscheidet neu (Validierung, Review, Gate).
  }

  return finish(STOP_REASONS.MAX_ITERATIONS, null, { detail: `Harte Obergrenze von ${maxIterations} Iterationen erreicht` });
}

// ---------------------------------------------------------------------------
// Phase 9: Resume / Crash Recovery
// ---------------------------------------------------------------------------

/**
 * Bewertet, ob ein abgebrochener Lauf sicher fortsetzbar ist.
 * Bei Unsicherheit: NEEDS_AHMET statt automatisch weiterzumachen.
 */
export function assessResumability({ runState, taskStates = [], route, repo, lockPresent = false }) {
  const unfinished = taskStates.filter(state => ['RUNNING', 'IMPLEMENT', 'REVIEW', 'CORRECT', 'REVIEW_FINDINGS'].includes(state?.status));
  const base = {
    lastRunId: runState?.runId ?? null,
    lastRunStatus: runState?.status ?? null,
    lastHeartbeatAt: runState?.heartbeatAt ?? null,
    interrupted: runState?.status === 'RUNNING' || unfinished.length > 0,
    unfinishedTasks: unfinished.map(state => ({ taskId: state.taskId, status: state.status })),
    lockPresent,
  };
  if (lockPresent) {
    return { ...base, resumable: false, decision: 'NEEDS_AHMET', reason: 'RUN_LOCK_PRESENT', detail: 'Ein Run Lock existiert noch. Laeuft ein zweiter Prozess?' };
  }
  if (!route) return { ...base, resumable: false, decision: 'NEEDS_ROUTE', reason: 'NO_TASK', detail: 'Keine geroutete Aufgabe vorhanden.' };
  if (route.branch && repo?.branch && route.branch !== repo.branch) {
    return { ...base, resumable: false, decision: 'NEEDS_AHMET', reason: 'BRANCH_MISMATCH', detail: `Aufgabe gehoert zu Branch ${route.branch}, aktuell ist ${repo.branch}.` };
  }
  if (base.interrupted && repo && route.routedAtHead && repo.head !== route.routedAtHead) {
    return { ...base, resumable: false, decision: 'NEEDS_AHMET', reason: 'HEAD_MOVED_DURING_RUN', detail: 'Der Lauf wurde unterbrochen und HEAD hat sich seither bewegt. Zustand ist nicht eindeutig.' };
  }
  if (base.interrupted) {
    return { ...base, resumable: true, decision: 'RESUMABLE_AFTER_RESET', reason: 'INTERRUPTED_RUN', detail: 'Unterbrochene Tasks werden beim naechsten Lauf auf PENDING zurueckgesetzt.' };
  }
  return { ...base, resumable: true, decision: 'CLEAN', reason: null, detail: 'Kein unterbrochener Lauf gefunden.' };
}
