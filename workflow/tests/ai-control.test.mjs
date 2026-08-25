import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadRiskMap } from '../../automation/core/risk-guard.mjs';
import { EXTERNAL_BLOCKS, deriveHandoffState, detectShopifyWrite, routeTask } from '../router.mjs';
import {
  DEFAULT_ALLOWED_FILES, STOP_REASONS,
  assertSafeWorkspace, assessResumability, buildTaskManifest, continueUntilGate,
  createReviewEvidence, deriveTaskPolicy, isEvidenceCurrent, isModelProviderRole,
  nextCommandsFor, runAgentCycle, stopReasonForAgent, stopReasonForStatus,
} from '../ai-control-core.mjs';
import { buildCorrectionPrompt, buildImplementerPrompt, buildReviewerPrompt } from '../prompts.mjs';
import { SEVERITY, explainAction, explainProvider, explainState, explainStop, explainTaskClass } from '../plain-language.mjs';

const riskMap = loadRiskMap(path.resolve(import.meta.dirname, '../../domains/shopify/risk-map.json'));

const repoState = (overrides = {}) => ({ branch: 'chore/ai', head: 'head-1', clean: true, worktreeFingerprint: 'tree-1', ...overrides });

/** Minimales, vollstaendiges Agentenresultat fuer Fake-Provider. */
const agent = (overrides = {}) => ({
  schemaVersion: 1, provider: 'FAKE', model: null, role: 'IMPLEMENTER', status: 'PASS',
  summary: 'fake', changedFiles: ['automation/demo.mjs'],
  tests: { status: 'PASS', commands: ['npm test'], passed: 1, failed: 0, summary: '' },
  findings: [], blockers: [], git: { branch: 'chore/ai', head: 'head-1' },
  actualOperations: ['read', 'report_write'], resources: [],
  startedAt: null, finishedAt: null, durationMs: null, exitCode: 0, retryable: false,
  workspace: null, diffFingerprint: null, output: '', ...overrides,
});

const finding = (priority = 'P1') => ({
  priority, file: 'automation/demo.mjs', problem: 'Fehler', reason: 'Grund', recommendedFix: 'Fix',
});

function tempStateDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ai-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * Fuehrt runAgentCycle mit einem scriptbaren Fake-Provider aus.
 * `script` bildet agentRole (+ Runde) auf Agentenresultate ab.
 */
async function cycleWith(t, { route, script, repo = repoState() }) {
  const stateDir = tempStateDir(t);
  const calls = [];
  const counters = { IMPLEMENTER: 0, REVIEWER: 0, CORRECTOR: 0 };
  const runRole = ({ agentRole, role }) => {
    counters[agentRole] += 1;
    calls.push({ agentRole, role, nth: counters[agentRole] });
    const entry = script[`${agentRole}#${counters[agentRole]}`] ?? script[agentRole];
    if (!entry) throw new Error(`Kein Fake-Resultat fuer ${agentRole}#${counters[agentRole]}`);
    return typeof entry === 'function' ? entry(counters[agentRole]) : entry;
  };
  const policy = deriveTaskPolicy(route);
  const result = await runAgentCycle({
    route, repo, policy, runRole, riskMap, stateDir,
    needsAhmetPath: path.join(stateDir, 'needs-ahmet.md'),
    testCommands: ['npm test'],
  });
  return { ...result, calls, counters, stateDir };
}

// ---------------------------------------------------------------------------
// Phase 11 / Szenario I
// ---------------------------------------------------------------------------

test('I) German Shopify product wording is recognised as a write', () => {
  const cases = [
    'Neue Shopify-Produkte als DRAFT anlegen',
    'ASTRA/Golze und DEKOWE: ausschliesslich neue Shopify-Produkte als DRAFT per Admin API anlegen; vorher Dubletten pruefen',
    'Produkte in Shopify importieren',
    'Artikel per CSV hochladen',
    'Produkte als Entwurf erstellen',
    'Neue Produkte hinzufuegen im Shopify Backend',
    'Preise aendern',
    'SKU bearbeiten',
    'Varianten aktualisieren',
    'Produktdaten in Shopify einpflegen',
    'Massenanlage von Produkten',
    'Bestand im Shopify Admin API aktualisieren',
  ];
  for (const text of cases) {
    assert.equal(detectShopifyWrite(text), true, `sollte Write sein: ${text}`);
    const route = routeTask({ text, branch: 'main', head: 'head-1' });
    assert.equal(route.shopifyWriteRequired, true, `shopifyWriteRequired fuer: ${text}`);
    assert.equal(route.taskClass, 'D', `Klasse D fuer: ${text}`);
    assert.equal(route.humanGateRequired, true, `Human Gate fuer: ${text}`);
  }
});

test('I) the exact task from .workflow/task.json no longer slips past the gate', () => {
  const text = 'ASTRA/Golze und DEKOWE: ausschliesslich neue Shopify-Produkte als DRAFT per Admin API anlegen; '
    + 'vorher Dubletten pruefen; keine erfundenen Preise, SKU, EAN, Varianten oder Bilder; Read-after-write; '
    + 'niemals veroeffentlichen oder bestehende Produkte veraendern';
  const route = routeTask({ text, branch: 'main', head: 'head-1' });
  assert.equal(route.shopifyWriteRequired, true);
  assert.equal(route.humanGateRequired, true);
});

test('theme and analysis wording does not trigger a false Shopify write gate', () => {
  const cases = [
    'Produktseite verbessern',
    'Kleinen CSS Theme-Fix umsetzen',
    'Dateien pruefen und Report erstellen',
    'Performance und groessere Theme-Logik verbessern',
    'Storefront Browser Compare durchfuehren',
    'Dokumentation aktualisieren',
    'Tests ausfuehren',
  ];
  for (const text of cases) {
    assert.equal(detectShopifyWrite(text), false, `sollte kein Write sein: ${text}`);
  }
});

test('existing router expectations stay intact', () => {
  assert.equal(routeTask({ text: '22 Odense-Produkte vorbereiten und spaeter in Shopify schreiben', branch: 'b', head: 'h' }).shopifyWriteRequired, true);
  assert.equal(routeTask({ text: 'Produkte in Shopify schreiben', branch: 'b', head: 'h' }).taskClass, 'D');
  assert.equal(routeTask({ text: 'Dateien pruefen und Report erstellen', branch: 'b', head: 'h' }).taskClass, 'A');
  assert.equal(routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'b', head: 'h' }).taskClass, 'B');
});

// ---------------------------------------------------------------------------
// Policy / Manifest
// ---------------------------------------------------------------------------

test('the derived task policy never allows HIGH operations or HIGH default paths', () => {
  const route = routeTask({ text: 'Checkout Payment und Shipping aendern', branch: 'b', head: 'h' });
  const policy = deriveTaskPolicy(route);
  assert.equal(policy.risk, 'MEDIUM', 'autonome Arbeit laeuft nie mit HIGH');
  for (const forbidden of ['git_push', 'theme_publish', 'live_theme_push', 'product_change', 'price_change', 'sku_change', 'merge_main', 'pull_request_merge', 'existing_live_product_write']) {
    assert.ok(!policy.allowedOperations.includes(forbidden), `${forbidden} darf nicht erlaubt sein`);
  }
  assert.ok(!DEFAULT_ALLOWED_FILES.some(pattern => pattern.includes('product')), 'templates/product*.json bleibt draussen');
  assert.ok(!DEFAULT_ALLOWED_FILES.includes('config/settings_data.json'));
  assert.doesNotThrow(() => buildTaskManifest(route, policy));
});

// ---------------------------------------------------------------------------
// Szenarien A / B / C / G ueber den echten ManifestRunner
// ---------------------------------------------------------------------------

test('A) low risk: route -> implementer -> tests -> done, without a reviewer', async t => {
  const route = routeTask({ text: 'Dateien pruefen und Report erstellen', branch: 'chore/ai', head: 'head-1' });
  assert.equal(route.reviewRequired, false);
  const outcome = await cycleWith(t, { route, script: { IMPLEMENTER: agent() } });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, 'PASS');
  assert.equal(outcome.counters.REVIEWER, 0, 'ohne Reviewpflicht laeuft kein Reviewer');
  assert.equal(outcome.counters.IMPLEMENTER, 1);
});

test('B) medium risk: route -> implementer -> reviewer -> done', async t => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  assert.equal(route.reviewRequired, true);
  const outcome = await cycleWith(t, {
    route,
    script: { IMPLEMENTER: agent(), REVIEWER: agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] }) },
  });
  assert.equal(outcome.status, 'PASS');
  assert.equal(outcome.counters.IMPLEMENTER, 1);
  assert.equal(outcome.counters.REVIEWER, 1);
  assert.equal(outcome.counters.CORRECTOR, 0);
});

test('C) a P1 finding triggers exactly one correction and a second review', async t => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  const outcome = await cycleWith(t, {
    route,
    script: {
      IMPLEMENTER: agent(),
      'REVIEWER#1': agent({ role: 'REVIEWER', status: 'FINDINGS', changedFiles: [], findings: [finding('P1')] }),
      'REVIEWER#2': agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] }),
      CORRECTOR: agent({ role: 'CORRECTOR' }),
    },
  });
  assert.equal(outcome.status, 'PASS');
  assert.equal(outcome.counters.CORRECTOR, 1);
  assert.equal(outcome.counters.REVIEWER, 2);
});

test('a P0 finding stops hard and never corrects', async t => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  const outcome = await cycleWith(t, {
    route,
    script: {
      IMPLEMENTER: agent(),
      REVIEWER: agent({ role: 'REVIEWER', status: 'FINDINGS', changedFiles: [], findings: [finding('P0')] }),
    },
  });
  assert.equal(outcome.status, 'HARD_FAIL');
  assert.equal(outcome.counters.CORRECTOR, 0);
  assert.equal(stopReasonForStatus(outcome.status), STOP_REASONS.HARD_FAIL);
});

test('G) three review rounds end in REVIEW_LIMIT_REACHED instead of a fourth agent call', async t => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  const outcome = await cycleWith(t, {
    route,
    script: {
      IMPLEMENTER: agent(),
      REVIEWER: agent({ role: 'REVIEWER', status: 'FINDINGS', changedFiles: [], findings: [finding('P1')] }),
      CORRECTOR: agent({ role: 'CORRECTOR' }),
    },
  });
  assert.equal(outcome.status, 'REVIEW_LIMIT_REACHED');
  assert.equal(outcome.counters.REVIEWER, 3);
  assert.equal(outcome.counters.CORRECTOR, 2, 'nach der letzten Runde folgt keine weitere Korrektur');
  assert.equal(stopReasonForStatus(outcome.status), STOP_REASONS.REVIEW_LIMIT_REACHED);
});

test('a security stop from the reviewer is never downgraded', async t => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  const outcome = await cycleWith(t, {
    route,
    script: { IMPLEMENTER: agent(), REVIEWER: agent({ role: 'REVIEWER', status: 'SECURITY_STOP', changedFiles: [], findings: [] }) },
  });
  assert.equal(outcome.status, 'SECURITY_STOP');
});

test('a file outside the allowlist is a hard stop, not a warning', async t => {
  const route = routeTask({ text: 'Dateien pruefen und Report erstellen', branch: 'chore/ai', head: 'head-1' });
  const outcome = await cycleWith(t, {
    route,
    script: { IMPLEMENTER: agent({ changedFiles: ['config/settings_data.json'] }) },
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 'SECURITY_STOP');
  assert.equal(outcome.stopReason, STOP_REASONS.SECURITY_STOP);
});

test('HIGH risk work never runs autonomously', async t => {
  const stateDir = tempStateDir(t);
  const route = routeTask({ text: 'Dateien pruefen', branch: 'chore/ai', head: 'head-1' });
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: { ...deriveTaskPolicy(route), risk: 'HIGH' },
    runRole: () => { throw new Error('HIGH darf keinen Agenten starten'); },
    riskMap, stateDir, needsAhmetPath: path.join(stateDir, 'needs-ahmet.md'),
  });
  assert.equal(outcome.status, 'NEEDS_AHMET');
  assert.equal(stopReasonForStatus(outcome.status), STOP_REASONS.NEEDS_AHMET);
});

// ---------------------------------------------------------------------------
// Szenario E / F auf Loop-Ebene, Szenario D (Human Gate)
// ---------------------------------------------------------------------------

function loopPorts(overrides = {}) {
  return {
    repo: () => repoState(),
    // Klasse B mit echtem Provider-Implementer: fuehrt zu HANDOFF_IMPLEMENTER,
    // also genau dem Pfad, auf dem ein Agent wirklich gestartet wuerde.
    readRoute: () => routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' }),
    readLatest: () => null,
    readReview: () => null,
    changedFiles: () => [],
    validate: async () => ({ status: 'PASS' }),
    runCycle: async () => ({ ok: true, status: 'PASS', results: {} }),
    ...overrides,
  };
}

test('E) an unavailable provider stops the loop cleanly instead of falling back', async () => {
  const outcome = await continueUntilGate(loopPorts({
    runCycle: async () => ({ ok: true, status: 'BLOCKED', results: { implementer: { status: 'UNAVAILABLE', blockers: ['codex fehlt'] } } }),
  }));
  assert.equal(outcome.stopReason, STOP_REASONS.PROVIDER_UNAVAILABLE);
  assert.ok(outcome.nextCommands.some(command => command.includes('ai:providers')));
});

test('F) a rate limited agent stops the loop and is not retried by switching providers', async () => {
  let cycles = 0;
  const outcome = await continueUntilGate(loopPorts({
    runCycle: async () => { cycles += 1; return { ok: true, status: 'BLOCKED', results: { implementer: { status: 'RATE_LIMITED' } } }; },
  }));
  assert.equal(outcome.stopReason, STOP_REASONS.RATE_LIMITED);
  assert.equal(cycles, 1, 'kein automatischer zweiter Anlauf');
  assert.equal(stopReasonForAgent({ status: 'RATE_LIMITED' }), STOP_REASONS.RATE_LIMITED);
});

test('D) high-risk work runs up to the gate and then stops with NEEDS_AHMET semantics', async () => {
  const route = routeTask({ text: 'Neue Shopify-Produkte als DRAFT anlegen', branch: 'chore/ai', head: 'head-1' });
  assert.equal(route.humanGateRequired, true);
  const review = {
    status: 'PASS', taskId: route.taskId, commit: 'head-1', worktreeFingerprint: 'tree-1', p0: 0, p1: 0, findings: [],
  };
  const outcome = await continueUntilGate(loopPorts({
    readRoute: () => route,
    readLatest: () => ({ status: 'PASS', branch: 'chore/ai', commit: 'head-1', worktreeFingerprint: 'tree-1', validationScope: 'FULL', p0: 0, p1: 0 }),
    readReview: () => review,
    // Der Implementer hat bereits gearbeitet - sonst waere der naechste Schritt
    // die Implementierung und nicht das Gate.
    readCandidate: () => ({ taskId: route.taskId, commit: 'head-1', agentFiles: ['automation/demo.mjs'] }),
    changedFiles: () => ['automation/demo.mjs'],
    runCycle: async () => { throw new Error('am Gate darf kein Agent mehr starten'); },
  }));
  assert.equal(outcome.stopReason, STOP_REASONS.HUMAN_GATE);
  assert.equal(outcome.state.humanGate, 'REQUIRED_FOR_PROTECTED_ACTION');
  assert.equal(outcome.state.humanApprovalStored, false);
  assert.deepEqual(nextCommandsFor(STOP_REASONS.HUMAN_GATE)[0], 'freigeben (bewusste Freigabe der geschuetzten Aktion)');
});

test('PREPARE_DRAFT_PR is the DONE state and never starts an agent or opens a PR', async () => {
  // Klasse A: Implementer SCRIPT, kein Review, kein Gate. Nach einer gueltigen
  // Validierung ist die Arbeit fertig - planContinue liefert hier HANDOFF,
  // was frueher faelschlich einen Provider gestartet hat.
  const route = routeTask({ text: 'Dateien pruefen und Report erstellen', branch: 'chore/ai', head: 'head-1' });
  assert.equal(route.implementer, 'SCRIPT');
  assert.equal(route.humanGateRequired, false);
  let started = false;
  const outcome = await continueUntilGate(loopPorts({
    readRoute: () => route,
    readLatest: () => ({ status: 'PASS', branch: 'chore/ai', commit: 'head-1', worktreeFingerprint: 'tree-1', p0: 0, p1: 0 }),
    runCycle: async () => { started = true; return { ok: true, status: 'PASS', results: {} }; },
  }));
  assert.equal(outcome.state.nextAllowedAction, 'PREPARE_DRAFT_PR');
  assert.equal(outcome.stopReason, STOP_REASONS.DONE);
  assert.equal(started, false, 'im Fertig-Zustand darf kein Agent starten');
  assert.match(outcome.detail, /bewusste Aktion/);
});

test('a handoff to a non-model role never starts a provider', async () => {
  const route = routeTask({ text: 'Dateien pruefen und Report erstellen', branch: 'chore/ai', head: 'head-1' });
  let started = false;
  const outcome = await continueUntilGate(loopPorts({
    readRoute: () => route,
    // CODE_DEFECT reicht den Task zurueck an den Implementer - der ist hier SCRIPT.
    readLatest: () => ({
      status: 'FAIL', branch: 'chore/ai', commit: 'head-1', worktreeFingerprint: 'tree-1',
      externalBlock: EXTERNAL_BLOCKS.CODE_DEFECT, p0: 0, p1: 0,
    }),
    runCycle: async () => { started = true; return { ok: true, status: 'PASS', results: {} }; },
  }));
  assert.equal(outcome.state.nextAllowedAction, 'HANDOFF_IMPLEMENTER');
  assert.equal(outcome.state.nextAgent, 'SCRIPT');
  assert.equal(outcome.stopReason, STOP_REASONS.NEEDS_DETERMINISTIC_SCRIPT);
  assert.equal(started, false);
  assert.match(outcome.detail, /kein KI-Provider/);
});

test('only real model roles are treated as providers', () => {
  for (const role of ['CODEX_LIGHT', 'CODEX_MEDIUM', 'CLAUDE_STRONG', 'CLAUDE_HAIKU', 'CLAUDE_SONNET']) {
    assert.equal(isModelProviderRole(role), true, role);
  }
  for (const role of ['SCRIPT', 'HUMAN', 'script', null, undefined, '', '   ']) {
    assert.equal(isModelProviderRole(role), false, String(role));
  }
});

test('the loop stops on request and never runs unbounded', async () => {
  const stopped = await continueUntilGate(loopPorts({ stopRequested: () => true }));
  assert.equal(stopped.stopReason, STOP_REASONS.MANUAL_STOP);

  let cycles = 0;
  const bounded = await continueUntilGate(loopPorts({
    // Jede Iteration meldet Erfolg, aber der Zustand bewegt sich nie weiter.
    runCycle: async () => { cycles += 1; return { ok: true, status: 'PASS', results: {} }; },
    maxIterations: 5,
  }));
  assert.ok([STOP_REASONS.NO_PROGRESS, STOP_REASONS.MAX_ITERATIONS].includes(bounded.stopReason));
  assert.ok(cycles <= 5, 'harte Obergrenze greift');
});

test('the loop refuses to run when the task belongs to a different branch', async () => {
  const outcome = await continueUntilGate(loopPorts({ repo: () => repoState({ branch: 'main' }) }));
  assert.equal(outcome.stopReason, STOP_REASONS.STALE_STATE);
});

test('the loop reports NO_TASK instead of guessing', async () => {
  const outcome = await continueUntilGate(loopPorts({ readRoute: () => null }));
  assert.equal(outcome.stopReason, STOP_REASONS.NO_TASK);
});

// ---------------------------------------------------------------------------
// Phase 10: Isolation
// ---------------------------------------------------------------------------

test('a dirty working tree blocks writing agent runs and never stashes anything', () => {
  const blocked = assertSafeWorkspace({ repo: repoState({ clean: false }), mode: 'WRITE' });
  assert.equal(blocked.safe, false);
  assert.equal(blocked.reason, STOP_REASONS.DIRTY_WORKTREE);
  assert.match(blocked.detail, /verloren/);

  assert.equal(assertSafeWorkspace({ repo: repoState({ clean: false }), mode: 'READ_ONLY' }).safe, true);
  const forced = assertSafeWorkspace({ repo: repoState({ clean: false }), mode: 'WRITE', allowDirty: true });
  assert.equal(forced.safe, true);
  assert.ok(forced.warning);
  assert.equal(assertSafeWorkspace({ repo: repoState(), mode: 'WRITE' }).safe, true);
});

test('the loop stops on a dirty tree before any agent starts', async () => {
  let started = false;
  const outcome = await continueUntilGate(loopPorts({
    repo: () => repoState({ clean: false }),
    runCycle: async () => { started = true; return { ok: true, status: 'PASS', results: {} }; },
  }));
  assert.equal(outcome.stopReason, STOP_REASONS.DIRTY_WORKTREE);
  assert.equal(started, false);
});

// ---------------------------------------------------------------------------
// Szenario H: Phase 7 Review-Evidence
// ---------------------------------------------------------------------------

test('H) review evidence is bound to task, commit and worktree and goes stale', () => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  const repo = repoState();
  const evidence = createReviewEvidence({
    route, repo, reviewer: route.reviewer,
    result: { provider: 'CODEX', findings: [], reviewRound: 1 },
    now: () => '2026-01-01T00:00:00.000Z',
  });
  assert.equal(evidence.status, 'PASS');
  assert.equal(evidence.p0, 0);
  assert.equal(evidence.commit, 'head-1');
  assert.equal(evidence.worktreeFingerprint, 'tree-1');
  assert.equal(isEvidenceCurrent(evidence, { route, repo }), true);

  assert.equal(isEvidenceCurrent(evidence, { route, repo: repoState({ head: 'head-2' }) }), false, 'HEAD geaendert');
  assert.equal(isEvidenceCurrent(evidence, { route, repo: repoState({ worktreeFingerprint: 'tree-2' }) }), false, 'Diff geaendert');
  assert.equal(isEvidenceCurrent(evidence, { route: { ...route, taskId: 'TASK-OTHER' }, repo }), false, 'andere Aufgabe');
  assert.equal(isEvidenceCurrent(null, { route, repo }), false);
});

test('H) stale evidence is not accepted by the handoff state', () => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  const repo = repoState();
  const latest = { status: 'PASS', branch: 'chore/ai', commit: 'head-1', worktreeFingerprint: 'tree-1', validationScope: 'FULL', p0: 0, p1: 0 };
  const fresh = { status: 'PASS', taskId: route.taskId, commit: 'head-1', worktreeFingerprint: 'tree-1', p0: 0, p1: 0 };
  const stale = { ...fresh, worktreeFingerprint: 'tree-old' };

  assert.equal(deriveHandoffState({ route, repo, latest, review: fresh, changedFiles: ['automation/demo.mjs'] }).reviewStatus, 'PASS');
  assert.equal(deriveHandoffState({ route, repo, latest, review: stale, changedFiles: ['automation/demo.mjs'] }).reviewStatus, 'REQUIRED');
});

test('review evidence counts findings by priority', () => {
  const route = routeTask({ text: 'Performance verbessern', branch: 'chore/ai', head: 'head-1' });
  const evidence = createReviewEvidence({
    route, repo: repoState(), reviewer: 'CLAUDE_SONNET',
    result: { findings: [finding('P0'), finding('P1'), finding('P2'), finding('P2')] },
  });
  assert.equal(evidence.status, 'FINDINGS');
  assert.deepEqual([evidence.p0, evidence.p1, evidence.p2], [1, 1, 2]);
});

// ---------------------------------------------------------------------------
// Phase 9: Resume
// ---------------------------------------------------------------------------

test('resume assessment escalates to NEEDS_AHMET whenever the state is ambiguous', () => {
  const route = routeTask({ text: 'Dateien pruefen', branch: 'chore/ai', head: 'head-1' });
  const repo = repoState();

  assert.equal(assessResumability({ runState: null, taskStates: [], route, repo, lockPresent: true }).decision, 'NEEDS_AHMET');
  assert.equal(assessResumability({ runState: null, taskStates: [], route: null, repo }).decision, 'NEEDS_ROUTE');
  assert.equal(assessResumability({ runState: null, taskStates: [], route, repo: repoState({ branch: 'main' }) }).decision, 'NEEDS_AHMET');

  const movedHead = assessResumability({
    runState: { runId: 'r1', status: 'RUNNING' },
    taskStates: [{ taskId: route.taskId, status: 'IMPLEMENT' }],
    route, repo: repoState({ head: 'head-9' }),
  });
  assert.equal(movedHead.decision, 'NEEDS_AHMET');
  assert.equal(movedHead.reason, 'HEAD_MOVED_DURING_RUN');

  const interrupted = assessResumability({
    runState: { runId: 'r1', status: 'RUNNING' },
    taskStates: [{ taskId: route.taskId, status: 'REVIEW' }],
    route, repo,
  });
  assert.equal(interrupted.resumable, true);
  assert.equal(interrupted.decision, 'RESUMABLE_AFTER_RESET');

  const clean = assessResumability({ runState: { runId: 'r1', status: 'COMPLETE' }, taskStates: [{ taskId: route.taskId, status: 'PASS' }], route, repo });
  assert.equal(clean.decision, 'CLEAN');
  assert.equal(clean.interrupted, false);
});

// ---------------------------------------------------------------------------
// Klartext-Ausgabe
// ---------------------------------------------------------------------------

test('every stop reason has a plain-language explanation', () => {
  for (const reason of Object.values(STOP_REASONS)) {
    const explained = explainStop(reason);
    assert.ok(explained.text.length > 20, `Klartext fehlt fuer ${reason}`);
    assert.ok(Object.values(SEVERITY).includes(explained.severity), `Einstufung fehlt fuer ${reason}`);
    assert.ok(!/Unbekannter Grund/.test(explained.text), `${reason} faellt auf den Fallback zurueck`);
  }
  // Der Fallback greift nur fuer echte Unbekannte und beschoenigt nichts.
  assert.equal(explainStop('GIBT_ES_NICHT').severity, SEVERITY.BROKEN);
});

test('plain language separates external blockers from real breakage', () => {
  assert.equal(explainStop(STOP_REASONS.DONE).severity, SEVERITY.OK);
  assert.equal(explainStop(STOP_REASONS.RATE_LIMITED).severity, SEVERITY.EXTERNAL);
  assert.equal(explainStop(STOP_REASONS.HUMAN_GATE).severity, SEVERITY.WAITING);
  assert.equal(explainStop(STOP_REASONS.SECURITY_STOP).severity, SEVERITY.BROKEN);
  assert.match(explainStop(STOP_REASONS.RATE_LIMITED).text, /nicht dein Fehler/i);
  assert.match(explainStop(STOP_REASONS.DIRTY_WORKTREE).text, /verloren/i);
});

test('plain language covers the actions the loop can report', () => {
  for (const action of ['ROUTE_TASK', 'HANDOFF_IMPLEMENTER', 'HANDOFF_REVIEWER', 'RUN_STATIC_VALIDATION',
    'USE_LOCAL_MAC_RUNNER', 'RETRY_SCRIPT_LATER', 'STOP_HUMAN_GATE', 'STOP_UNKNOWN_BLOCKER', 'PREPARE_DRAFT_PR']) {
    assert.ok(explainAction(action), `Klartext fehlt fuer ${action}`);
  }
  assert.equal(explainAction('GIBT_ES_NICHT'), null, 'kein erfundener Text fuer Unbekanntes');
  for (const status of ['AVAILABLE', 'UNAVAILABLE', 'AUTH_REQUIRED', 'RATE_LIMITED', 'FAILED']) {
    assert.ok(explainProvider(status), `Klartext fehlt fuer Provider ${status}`);
  }
  for (const taskClass of ['A', 'B', 'C', 'D']) assert.ok(explainTaskClass(taskClass));
});

test('the state summary stays truthful when nothing is running', () => {
  assert.match(explainState(null), /keine Aufgabe/);
  assert.match(explainState({}), /keine Aufgabe/);
  const summary = explainState({
    taskId: 'TASK-1', validationStatus: 'STALE_OR_NOT_RUN', reviewRequired: true,
    reviewStatus: 'REQUIRED', humanGate: 'REQUIRED_FOR_PROTECTED_ACTION', nextAllowedAction: 'HANDOFF_IMPLEMENTER',
  });
  assert.match(summary, /veraltet|nie/);
  assert.match(summary, /zweiter Blick/);
  assert.match(summary, /Freigabe/);
  assert.match(summary, /KI-Agent/);
});

// ---------------------------------------------------------------------------
// Phase 5: Prompts
// ---------------------------------------------------------------------------

test('prompts carry the safety boundaries and the required result contract', () => {
  const route = routeTask({ text: 'Kleinen CSS Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const policy = deriveTaskPolicy(route);
  const implementer = buildImplementerPrompt({
    task: route.taskText, route, allowedFiles: policy.allowedFiles, allowedOperations: policy.allowedOperations,
    evidence: 'nichts', testCommands: ['npm test'], git: repoState(),
  });
  for (const needle of ['AGENT_RESULT', 'KEIN git commit', 'KEIN Shopify Write', 'KEIN Theme Publish', 'Allowlist']) {
    assert.ok(implementer.includes(needle), `Implementer-Prompt braucht: ${needle}`);
  }

  const reviewer = buildReviewerPrompt({
    task: route.taskText, route, implementerSummary: 'STATUS: PASS', diff: 'diff --git a b', testReport: 'ok',
  });
  assert.ok(reviewer.includes('P0'));
  assert.ok(reviewer.includes('recommendedFix'));
  assert.ok(reviewer.includes('Du aenderst nichts'));

  const corrector = buildCorrectionPrompt({
    task: route.taskText, route, implementerSummary: 'STATUS: PASS', findings: [finding('P1')],
    allowedFiles: policy.allowedFiles, allowedOperations: policy.allowedOperations,
  });
  assert.ok(corrector.includes('AUSSCHLIESSLICH'));
  assert.ok(corrector.includes('Refactorings, die kein Finding verlangt'));
  assert.ok(corrector.includes('automation/demo.mjs'));
});

test('prompts never leak secrets that were passed in as evidence', () => {
  const route = routeTask({ text: 'Dateien pruefen', branch: 'chore/ai', head: 'head-1' });
  const prompt = buildImplementerPrompt({
    task: route.taskText, route, allowedFiles: ['qa/**'], allowedOperations: ['read'],
    evidence: 'SHOPIFY_TOKEN=shpat_0123456789abcdef', testCommands: [],
  });
  assert.ok(!prompt.includes('shpat_0123456789abcdef'));
  assert.ok(prompt.includes('[REDACTED]'));
});
