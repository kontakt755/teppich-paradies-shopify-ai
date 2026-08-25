import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadRiskMap } from '../../automation/core/risk-guard.mjs';
import { routeTask } from '../router.mjs';
import { SCOPE_STATUS } from '../diff-scope.mjs';
import {
  AGENT_PHASE, CANDIDATE_STATUS, STOP_REASONS, assertImplementerCandidate,
  continueUntilGate, createReviewEvidence, deriveTaskPolicy, inspectRunLock, phaseForAction, runAgentCycle,
} from '../ai-control-core.mjs';

const riskMap = loadRiskMap(path.resolve(import.meta.dirname, '../../domains/shopify/risk-map.json'));
const repoState = (o = {}) => ({ branch: 'chore/ai', head: 'head-1', clean: false, worktreeFingerprint: 'tree-1', ...o });

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-rev-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const agent = (o = {}) => ({
  schemaVersion: 1, provider: 'FAKE', model: null, role: 'IMPLEMENTER', status: 'PASS',
  summary: 'fake', changedFiles: ['qa/fixture.txt'],
  tests: { status: 'PASS', commands: [], passed: 1, failed: 0, summary: '' },
  findings: [], blockers: [], git: { branch: 'chore/ai', head: 'head-1' },
  actualOperations: ['read', 'test_write'], resources: [],
  startedAt: null, finishedAt: null, durationMs: null, exitCode: 0, retryable: false,
  workspace: null, diffFingerprint: null, output: '', ...o,
});

const finding = (p = 'P1') => ({ priority: p, file: 'qa/fixture.txt', problem: 'Fehler', reason: 'Grund', recommendedFix: 'Fix' });

const okScope = {
  status: SCOPE_STATUS.OK, agentFiles: ['qa/fixture.txt'], preexistingUntouched: ['docs/fremd.md'],
  undeclared: [], outsideAllowlist: [], phantom: [], headMoved: false, reason: null, detail: null,
};

/** Diff-Scope-Port, der ein festes Ergebnis liefert. */
function scopePort(scope = okScope, diff = 'NUR-AGENT-DIFF') {
  return {
    capture: () => ({ head: 'head-1', files: {}, snapshotDir: '/tmp/x' }),
    classify: () => scope,
    readScopedDiff: () => diff,
    fingerprint: () => 'fp-A',
  };
}

const priorScope = {
  taskId: null, agentFiles: ['qa/fixture.txt'], provider: 'CODEX',
  summary: 'Marker gesetzt', tests: { status: 'PASS', commands: [], passed: 1, failed: 0, summary: '' },
  resources: [], actualOperations: ['read', 'test_write'],
};

test('the reviewer handoff maps to the review phase', () => {
  assert.equal(phaseForAction('HANDOFF_REVIEWER'), AGENT_PHASE.REVIEW);
  assert.equal(phaseForAction('HANDOFF_IMPLEMENTER'), AGENT_PHASE.IMPLEMENT);
  assert.equal(phaseForAction('RUN_STATIC_VALIDATION'), AGENT_PHASE.IMPLEMENT);
});

test('1) a real reviewer handoff starts exactly one reviewer and no second implementer', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  // Diese Testfamilie prueft die generische Review-Cycle-Mechanik (nicht den
  // Nemotron-Erstpass) und nutzt qa/fixture.txt als Fixture-Datei - qa/ ist
  // absichtlich eine Hard-Escalation-Datei (siehe requiresHardEscalation),
  // wuerde also hier immer einen zweiten Call ausloesen. Der Erstpass wird
  // deshalb fuer diese Tests bewusst deaktiviert; eigene Tests fuer den
  // Erstpass/die Eskalation stehen weiter unten.
  route.preReviewer = null;
  const calls = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW,
    reviewRequired: true,
    priorScope: { ...priorScope, taskId: route.taskId },
    diffScope: scopePort(),
    runRole: ({ agentRole, prompt }) => {
      calls.push({ agentRole, prompt });
      return agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] });
    },
  });

  assert.equal(outcome.status, 'PASS');
  assert.equal(calls.length, 1, 'genau ein Agentenlauf');
  assert.equal(calls[0].agentRole, 'REVIEWER');
  assert.ok(calls[0].prompt.includes('NUR-AGENT-DIFF'), 'Reviewer sieht den gescopten Diff');
  assert.ok(calls[0].prompt.includes('qa/fixture.txt'), 'Reviewer sieht die gemessene Datei');
  assert.ok(outcome.results.reviewer, 'Reviewer-Ergebnis wird festgehalten');
  assert.equal(outcome.results.implementer, null, 'kein zweiter Implementer');
});

test('2) a reviewer PASS produces evidence that moves the state forward', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const written = [];
  let reviewEvidence = null;

  const outcome = await continueUntilGate({
    repo: () => repoState(),
    readRoute: () => route,
    readLatest: () => ({ status: 'PASS', branch: 'chore/ai', commit: 'head-1', worktreeFingerprint: 'tree-1', p0: 0, p1: 0 }),
    readReview: () => reviewEvidence,
    readCandidate: () => ({ ...priorScope, taskId: route.taskId, commit: 'head-1' }),
    changedFiles: () => ['qa/fixture.txt'],
    validate: async () => ({ status: 'PASS' }),
    writeState: state => written.push(state.nextAllowedAction),
    allowDirty: true,
    maxIterations: 6,
    runCycle: async ({ phase }) => {
      assert.equal(phase, AGENT_PHASE.REVIEW, 'erste Aktion ist der Reviewer-Handoff');
      // Reviewer laeuft, Evidence wird geschrieben - genau wie in der CLI.
      reviewEvidence = {
        status: 'PASS', taskId: route.taskId, commit: 'head-1', worktreeFingerprint: 'tree-1',
        p0: 0, p1: 0, findings: [], agentDiffFingerprint: 'fp-A', reviewedFiles: ['qa/fixture.txt'],
      };
      return { ok: true, status: 'PASS', results: { reviewer: agent({ role: 'REVIEWER' }) }, scope: okScope };
    },
  });

  assert.equal(outcome.stopReason, STOP_REASONS.DONE, 'nach dem Review geht es bis zum Abschluss weiter');
  assert.deepEqual(written, ['HANDOFF_REVIEWER', 'PREPARE_DRAFT_PR'], 'der Zustand bewegt sich wirklich');
  assert.notEqual(outcome.stopReason, STOP_REASONS.NO_PROGRESS);
});

test('3) a P1 finding runs a correction and a second review inside one handoff', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  route.preReviewer = null; // siehe Kommentar in Test 1)
  const calls = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW,
    reviewRequired: true,
    priorScope: { ...priorScope, taskId: route.taskId },
    diffScope: scopePort(),
    runRole: ({ agentRole }) => {
      calls.push(agentRole);
      const reviewerCalls = calls.filter(role => role === 'REVIEWER').length;
      if (agentRole === 'REVIEWER') {
        return reviewerCalls === 1
          ? agent({ role: 'REVIEWER', status: 'FINDINGS', changedFiles: [], findings: [finding('P1')] })
          : agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] });
      }
      return agent({ role: 'CORRECTOR' });
    },
  });

  assert.equal(outcome.status, 'PASS');
  assert.deepEqual(calls, ['REVIEWER', 'CORRECTOR', 'REVIEWER']);
  assert.ok(outcome.results.corrector, 'Korrektur wurde real ausgefuehrt');
});

test('3b) persistent findings stop at the review limit, never at a fourth round', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  route.preReviewer = null; // siehe Kommentar in Test 1)
  const calls = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW, reviewRequired: true,
    priorScope: { ...priorScope, taskId: route.taskId },
    diffScope: scopePort(),
    runRole: ({ agentRole }) => {
      calls.push(agentRole);
      if (agentRole === 'REVIEWER') return agent({ role: 'REVIEWER', status: 'FINDINGS', changedFiles: [], findings: [finding('P1')] });
      return agent({ role: 'CORRECTOR' });
    },
  });
  assert.equal(outcome.status, 'REVIEW_LIMIT_REACHED');
  assert.equal(calls.filter(role => role === 'REVIEWER').length, 3);
  assert.equal(calls.filter(role => role === 'CORRECTOR').length, 2);
});

test('4) a reviewer that cannot run becomes a clean blocker, not a pass', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  route.preReviewer = null; // siehe Kommentar in Test 1)
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW, reviewRequired: true,
    priorScope: { ...priorScope, taskId: route.taskId },
    diffScope: scopePort(),
    runRole: () => agent({ role: 'REVIEWER', status: 'UNAVAILABLE', changedFiles: [], findings: [], blockers: ['claude fehlt'] }),
  });
  assert.notEqual(outcome.status, 'PASS', 'ein ausgefallener Reviewer ist nie ein PASS');
  assert.ok(outcome.results.reviewer, 'der Versuch wird festgehalten');
  assert.equal(outcome.results.reviewer.status, 'UNAVAILABLE');
  // Regression: outcome.results.reviewer.findings speiste vor dem Fix die
  // ROHEN (leeren) Provider-Findings statt des berechneten Verdicts.
  // createReviewEvidence() zaehlt P0/P1 ausschliesslich aus diesen findings -
  // mit leeren findings waere ein nie fertig gelaufener Reviewer faelschlich
  // als PASS mit p0=0/p1=0 dokumentiert worden (echt beobachtet: ein
  // Netzwerkfehler bei Codex fuehrte zu genau dieser falschen PASS-Evidence).
  assert.ok(outcome.results.reviewer.findings.some(f => f.priority === 'P1'), 'der synthetische P1-Fund landet in den Reviewer-Findings');
  const evidence = createReviewEvidence({
    route, repo: repoState(), reviewer: 'CODEX_LIGHT', result: outcome.results.reviewer,
  });
  assert.notEqual(evidence.status, 'PASS', 'Review-Evidence fuer einen ausgefallenen Reviewer ist nie PASS');
  assert.equal(evidence.p1, 1);
});

test('5) a reviewer handoff that starts no reviewer stops instead of looping', async () => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  let cycles = 0;
  const outcome = await continueUntilGate({
    repo: () => repoState(),
    readRoute: () => route,
    readLatest: () => ({ status: 'PASS', branch: 'chore/ai', commit: 'head-1', worktreeFingerprint: 'tree-1', p0: 0, p1: 0 }),
    readReview: () => null,
    readCandidate: () => ({ ...priorScope, taskId: route.taskId, commit: 'head-1' }),
    changedFiles: () => ['qa/fixture.txt'],
    validate: async () => ({ status: 'PASS' }),
    allowDirty: true,
    maxIterations: 6,
    // Genau der alte Defekt: der Zyklus meldet PASS, ohne einen Reviewer zu starten.
    runCycle: async () => { cycles += 1; return { ok: true, status: 'PASS', results: {} }; },
  });

  assert.equal(outcome.stopReason, STOP_REASONS.UNKNOWN_BLOCKER);
  assert.match(outcome.detail, /keinen Reviewer gestartet/);
  assert.equal(cycles, 1, 'es wird nicht dreimal im Kreis gelaufen');
});

// ---------------------------------------------------------------------------
// Sicherheitsinvariante: kein Reviewer ohne gebundenes Implementer-Ergebnis
// ---------------------------------------------------------------------------

const candidateFor = (route, o = {}) => ({ taskId: route.taskId, commit: 'head-1', agentFiles: ['qa/fixture.txt'], ...o });

function loopFor(route, overrides = {}) {
  return {
    repo: () => repoState(),
    readRoute: () => route,
    // Validierung ist aktuell -> ohne Candidate-Pruefung waere der naechste
    // Schritt der Reviewer.
    readLatest: () => ({ status: 'PASS', branch: 'chore/ai', commit: 'head-1', worktreeFingerprint: 'tree-1', p0: 0, p1: 0 }),
    readReview: () => null,
    readCandidate: () => null,
    // Schmutziger Working Tree: deriveHandoffState haelt die Implementierung
    // deshalb faelschlich fuer erledigt. Genau der Fall aus dem Smoke-Test.
    changedFiles: () => ['qa/fixture.txt', 'workflow/router.mjs', 'docs/x.md'],
    validate: async () => ({ status: 'PASS' }),
    allowDirty: true,
    maxIterations: 4,
    ...overrides,
  };
}

test('6a) candidate validation classifies every mismatch', () => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const repo = repoState();
  assert.equal(assertImplementerCandidate({ candidate: null, route, repo }).status, CANDIDATE_STATUS.MISSING);
  assert.equal(assertImplementerCandidate({ candidate: candidateFor(route, { agentFiles: [] }), route, repo }).status, CANDIDATE_STATUS.EMPTY);
  assert.equal(assertImplementerCandidate({ candidate: candidateFor(route, { taskId: 'TASK-ANDERS' }), route, repo }).status, CANDIDATE_STATUS.STALE_TASK);
  assert.equal(assertImplementerCandidate({ candidate: candidateFor(route, { commit: 'head-9' }), route, repo }).status, CANDIDATE_STATUS.STALE_COMMIT);
  assert.equal(assertImplementerCandidate({
    candidate: candidateFor(route, { agentDiffFingerprint: 'fp-A' }), route, repo, agentDiffFingerprint: 'fp-B',
  }).status, CANDIDATE_STATUS.STALE_DIFF);
  assert.equal(assertImplementerCandidate({ candidate: candidateFor(route), route, repo }).status, CANDIDATE_STATUS.VALID);
});

test('6b) a freshly routed class-B task implements first, even with a dirty tree', async () => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const phases = [];
  await continueUntilGate(loopFor(route, {
    maxIterations: 1,
    runCycle: async ({ phase }) => { phases.push(phase); return { ok: true, status: 'PASS', results: { implementer: agent() } }; },
  }));
  assert.deepEqual(phases, [AGENT_PHASE.IMPLEMENT], 'ohne Candidate wird implementiert, nicht reviewt');
});

test('6c) reviewRequired alone never starts a reviewer without a candidate', async () => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  let reviewerStarted = false;
  await continueUntilGate(loopFor(route, {
    maxIterations: 1,
    runCycle: async ({ phase }) => {
      if (phase === AGENT_PHASE.REVIEW) reviewerStarted = true;
      return { ok: true, status: 'PASS', results: { implementer: agent() } };
    },
  }));
  assert.equal(reviewerStarted, false);
});

test('6d) once a valid candidate exists the next step is the reviewer', async () => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const phases = [];
  await continueUntilGate(loopFor(route, {
    readCandidate: () => candidateFor(route),
    maxIterations: 1,
    runCycle: async ({ phase, candidate }) => {
      phases.push(phase);
      assert.deepEqual(candidate.agentFiles, ['qa/fixture.txt'], 'der gepruefte Candidate wird durchgereicht');
      return { ok: true, status: 'PASS', results: { reviewer: agent({ role: 'REVIEWER' }) } };
    },
  }));
  assert.deepEqual(phases, [AGENT_PHASE.REVIEW]);
});

test('6e) a candidate from another task or commit is a fail-safe stop', async () => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  for (const [label, bad] of [['andere Aufgabe', { taskId: 'TASK-ALT' }], ['anderer Commit', { commit: 'head-alt' }]]) {
    let started = false;
    const outcome = await continueUntilGate(loopFor(route, {
      readCandidate: () => candidateFor(route, bad),
      runCycle: async () => { started = true; return { ok: true, status: 'PASS', results: {} }; },
    }));
    assert.equal(outcome.stopReason, STOP_REASONS.NEEDS_AHMET, label);
    assert.equal(started, false, `${label}: kein Agentenlauf`);
    assert.ok(outcome.detail);
  }
});

test('6f) after a real implementer the reviewer resumes without a second implementer', async () => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  let candidate = null;
  const phases = [];
  let reviewEvidence = null;

  const outcome = await continueUntilGate(loopFor(route, {
    readCandidate: () => candidate,
    readReview: () => reviewEvidence,
    maxIterations: 5,
    runCycle: async ({ phase }) => {
      phases.push(phase);
      if (phase === AGENT_PHASE.IMPLEMENT) {
        // Der Implementer persistiert sein Ergebnis - wie in der CLI.
        candidate = candidateFor(route);
        return { ok: true, status: 'PASS', results: { implementer: agent() } };
      }
      reviewEvidence = {
        status: 'PASS', taskId: route.taskId, commit: 'head-1', worktreeFingerprint: 'tree-1',
        p0: 0, p1: 0, findings: [],
      };
      return { ok: true, status: 'PASS', results: { reviewer: agent({ role: 'REVIEWER' }) } };
    },
  }));

  assert.deepEqual(phases, [AGENT_PHASE.IMPLEMENT, AGENT_PHASE.REVIEW], 'genau ein Implementer, dann der Reviewer');
  assert.equal(outcome.stopReason, STOP_REASONS.DONE);
});

test('7) an orphaned run lock is recognised but never cleared automatically', () => {
  const alive = () => true;
  const dead = () => false;
  const now = () => new Date('2026-08-20T20:15:00.000Z');
  const lock = { runId: 'AI-X', pid: 20, acquiredAt: '2026-08-20T20:12:41.000Z' };

  assert.equal(inspectRunLock({ lock: null, isProcessAlive: dead, now }).present, false);

  const running = inspectRunLock({ lock, isProcessAlive: alive, now });
  assert.equal(running.stale, false);
  assert.equal(running.reason, 'ACTIVE');

  const orphaned = inspectRunLock({ lock, isProcessAlive: dead, now });
  assert.equal(orphaned.stale, true);
  assert.equal(orphaned.reason, 'STALE');
  assert.match(orphaned.detail, /abgebrochenen Lauf/);

  // Unklarer Zustand gilt nie als verwaist.
  assert.equal(inspectRunLock({ lock: { ...lock, pid: null }, isProcessAlive: dead, now }).stale, false);
  assert.equal(inspectRunLock({ lock, isProcessAlive: () => { throw new Error('boom'); }, now }).stale, false);
});

// ---------------------------------------------------------------------------
// Nemotron-Erstpass (Klasse B): PASS auf reinem Theme-Markup ersetzt Codex,
// jeder Fund/Ausfall/jede Hard-Escalation-Datei eskaliert wie zuvor.
// ---------------------------------------------------------------------------

const themeScope = {
  status: SCOPE_STATUS.OK, agentFiles: ['snippets/tp-fix.liquid'], preexistingUntouched: [],
  undeclared: [], outsideAllowlist: [], phantom: [], headMoved: false, reason: null, detail: null,
};
const themePriorScope = { ...priorScope, agentFiles: ['snippets/tp-fix.liquid'] };

test('8a) a clean Nemotron pass on plain theme markup replaces Codex entirely', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  assert.equal(route.preReviewer, 'NEMOTRON_REVIEW');
  const calls = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW, reviewRequired: true,
    priorScope: { ...themePriorScope, taskId: route.taskId },
    diffScope: scopePort(themeScope),
    runRole: options => {
      calls.push(options.role);
      assert.equal(options.role, 'NEMOTRON_REVIEW', 'Codex darf hier nie aufgerufen werden');
      return agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] });
    },
  });
  assert.equal(outcome.status, 'PASS');
  assert.deepEqual(calls, ['NEMOTRON_REVIEW']);
  assert.equal(outcome.results.reviewerRole, 'NEMOTRON_REVIEW');
});

test('8b) a Nemotron finding escalates to Codex, not the other way round', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const calls = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW, reviewRequired: true,
    priorScope: { ...themePriorScope, taskId: route.taskId },
    diffScope: scopePort(themeScope),
    runRole: options => {
      calls.push(options.role);
      if (options.role === 'NEMOTRON_REVIEW') return agent({ role: 'REVIEWER', status: 'FINDINGS', changedFiles: [], findings: [finding('P2')] });
      return agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] });
    },
  });
  assert.equal(outcome.status, 'PASS');
  assert.deepEqual(calls, ['NEMOTRON_REVIEW', 'CODEX_LIGHT'], 'ein Fund im Erstpass eskaliert an Codex');
  assert.equal(outcome.results.reviewerRole, 'CODEX_LIGHT');
});

test('8c) files that always need Codex escalate even after a clean Nemotron pass', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const calls = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW, reviewRequired: true,
    // qa/fixture.txt ist eine Hard-Escalation-Datei (QA-Harness).
    priorScope: { ...priorScope, taskId: route.taskId },
    diffScope: scopePort(okScope),
    runRole: options => {
      calls.push(options.role);
      return agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] });
    },
  });
  assert.equal(outcome.status, 'PASS');
  assert.deepEqual(calls, ['NEMOTRON_REVIEW', 'CODEX_LIGHT'], 'qa/ erzwingt Codex auch nach sauberem Erstpass');
  assert.equal(outcome.results.reviewerRole, 'CODEX_LIGHT');
});

test('8d) an unconfigured or failing Nemotron falls back to Codex, never a hard stop', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const calls = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW, reviewRequired: true,
    priorScope: { ...themePriorScope, taskId: route.taskId },
    diffScope: scopePort(themeScope),
    runRole: options => {
      calls.push(options.role);
      if (options.role === 'NEMOTRON_REVIEW') return agent({ role: 'REVIEWER', status: 'AUTH_REQUIRED', changedFiles: [], findings: [], blockers: ['NVIDIA_API_KEY fehlt'] });
      return agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] });
    },
  });
  assert.equal(outcome.status, 'PASS');
  assert.deepEqual(calls, ['NEMOTRON_REVIEW', 'CODEX_LIGHT']);
});

test('8e) a Nemotron SECURITY_STOP stops immediately and never reaches Codex', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const calls = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW, reviewRequired: true,
    priorScope: { ...themePriorScope, taskId: route.taskId },
    diffScope: scopePort(themeScope),
    runRole: options => {
      calls.push(options.role);
      return agent({ role: 'REVIEWER', status: 'SECURITY_STOP', changedFiles: [], findings: [] });
    },
  });
  assert.equal(outcome.status, 'SECURITY_STOP');
  assert.deepEqual(calls, ['NEMOTRON_REVIEW'], 'ein Sicherheitsstop des Erstpasses eskaliert nicht, er stoppt sofort');
});

test('8f) an explicit --reviewer override disables the pre-review entirely', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  route.reviewerOverride = { from: 'CODEX_LIGHT', to: 'CODEX_LIGHT', reason: 'test', at: 'now' };
  const calls = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempDir(t), needsAhmetPath: path.join(tempDir(t), 'needs-ahmet.md'),
    phase: AGENT_PHASE.REVIEW, reviewRequired: true,
    priorScope: { ...themePriorScope, taskId: route.taskId },
    diffScope: scopePort(themeScope),
    runRole: options => {
      calls.push(options.role);
      return agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] });
    },
  });
  assert.equal(outcome.status, 'PASS');
  assert.deepEqual(calls, ['CODEX_LIGHT'], 'eine ausdrueckliche Operator-Wahl bekommt keinen Erstpass');
});

test('the NO_PROGRESS guard stays intact for genuinely stuck states', async () => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const outcome = await continueUntilGate({
    repo: () => repoState({ clean: true }),
    readRoute: () => route,
    readLatest: () => null,
    readReview: () => null,
    changedFiles: () => [],
    validate: async () => ({ status: 'PASS' }),
    maxIterations: 8,
    runCycle: async () => ({ ok: true, status: 'PASS', results: { implementer: agent() } }),
  });
  assert.equal(outcome.stopReason, STOP_REASONS.NO_PROGRESS, 'der Schutz bleibt aktiv');
});
