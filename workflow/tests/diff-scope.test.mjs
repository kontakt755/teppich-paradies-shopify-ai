import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadRiskMap } from '../../automation/core/risk-guard.mjs';
import { routeTask } from '../router.mjs';
import {
  SCOPE_STATUS, captureBaseline, classifyScope, fingerprintScope, isIgnoredForScope, summarizeScope,
} from '../diff-scope.mjs';
import {
  STOP_REASONS, createReviewEvidence, deriveTaskPolicy, isEvidenceCurrent, resetTaskState, runAgentCycle,
} from '../ai-control-core.mjs';

const riskMap = loadRiskMap(path.resolve(import.meta.dirname, '../../domains/shopify/risk-map.json'));
const repoState = (overrides = {}) => ({ branch: 'chore/ai', head: 'head-1', clean: false, worktreeFingerprint: 'tree-1', ...overrides });

const ALLOWED = ['qa/**', 'docs/**', 'automation/**'];

/** Eine fremde, bereits vor dem Lauf geaenderte Datei. */
const PREEXISTING = { path: 'docs/fremde-notiz.md', hash: 'hash-fremd-alt' };

function baselineWith(entries, head = 'head-1') {
  return captureBaseline({ head, entries, runId: 'RUN-1', now: () => '2026-01-01T00:00:00.000Z' });
}

// ---------------------------------------------------------------------------
// A + B: bereits vorhandene Aenderungen werden nicht dem Agenten zugerechnet
// ---------------------------------------------------------------------------

test('A) with a dirty tree the agent is credited only with the file it actually touched', () => {
  const baseline = baselineWith([PREEXISTING]);
  const scope = classifyScope({
    baseline,
    head: 'head-1',
    entries: [PREEXISTING, { path: 'qa/fixture.txt', hash: 'hash-fixture-neu' }],
    allowedFiles: ALLOWED,
    declaredFiles: ['qa/fixture.txt'],
  });
  assert.equal(scope.status, SCOPE_STATUS.OK);
  assert.deepEqual(scope.agentFiles, ['qa/fixture.txt']);
  assert.deepEqual(scope.undeclared, []);
  assert.deepEqual(scope.outsideAllowlist, []);
});

test('B) a pre-existing change that stays untouched is never attributed to the agent', () => {
  const baseline = baselineWith([PREEXISTING]);
  const scope = classifyScope({
    baseline,
    head: 'head-1',
    entries: [PREEXISTING, { path: 'qa/fixture.txt', hash: 'hash-fixture-neu' }],
    allowedFiles: ALLOWED,
    declaredFiles: ['qa/fixture.txt'],
  });
  assert.ok(!scope.agentFiles.includes(PREEXISTING.path), 'fremde Aenderung darf nicht im Agenten-Diff landen');
  assert.deepEqual(scope.preexistingUntouched, [PREEXISTING.path]);

  // Auch wenn der Agent sie faelschlich fuer sich reklamiert, bleibt sie draussen:
  // sie hat sich real nicht veraendert.
  const claimed = classifyScope({
    baseline,
    head: 'head-1',
    entries: [PREEXISTING],
    allowedFiles: ALLOWED,
    declaredFiles: [PREEXISTING.path],
  });
  assert.equal(claimed.status, SCOPE_STATUS.OK);
  assert.deepEqual(claimed.agentFiles, []);
  assert.deepEqual(claimed.phantom, [PREEXISTING.path]);
});

test('a file that was clean before and is dirty now belongs to the agent', () => {
  const scope = classifyScope({
    baseline: baselineWith([]),
    head: 'head-1',
    entries: [{ path: 'qa/neu.txt', hash: 'h1' }],
    allowedFiles: ALLOWED,
    declaredFiles: ['qa/neu.txt'],
  });
  assert.deepEqual(scope.agentFiles, ['qa/neu.txt']);
});

test('a deletion is detected as an agent change', () => {
  const scope = classifyScope({
    baseline: baselineWith([{ path: 'qa/weg.txt', hash: 'h1' }]),
    head: 'head-1',
    entries: [{ path: 'qa/weg.txt', hash: null }],
    allowedFiles: ALLOWED,
    declaredFiles: ['qa/weg.txt'],
  });
  assert.equal(scope.status, SCOPE_STATUS.OK);
  assert.deepEqual(scope.agentFiles, ['qa/weg.txt']);
});

// ---------------------------------------------------------------------------
// C: parallele Sitzung / concurrent modification
// ---------------------------------------------------------------------------

test('C) a change from another session during the run is a fail-safe stop', () => {
  const baseline = baselineWith([PREEXISTING]);
  const scope = classifyScope({
    baseline,
    head: 'head-1',
    entries: [
      { ...PREEXISTING, hash: 'hash-fremd-NEU' }, // parallel veraendert
      { path: 'qa/fixture.txt', hash: 'hash-fixture-neu' },
    ],
    allowedFiles: ALLOWED,
    declaredFiles: ['qa/fixture.txt'],
  });
  assert.equal(scope.status, SCOPE_STATUS.NEEDS_AHMET);
  assert.equal(scope.reason, 'UNDECLARED_CHANGE');
  assert.deepEqual(scope.undeclared, [PREEXISTING.path]);
  assert.match(scope.detail, /nicht stillschweigend uebernommen/);
});

test('C) a commit during the run is a fail-safe stop', () => {
  const scope = classifyScope({
    baseline: baselineWith([], 'head-1'),
    head: 'head-2',
    entries: [{ path: 'qa/fixture.txt', hash: 'h1' }],
    allowedFiles: ALLOWED,
    declaredFiles: ['qa/fixture.txt'],
  });
  assert.equal(scope.status, SCOPE_STATUS.NEEDS_AHMET);
  assert.equal(scope.reason, 'HEAD_MOVED_DURING_RUN');
  assert.equal(scope.headMoved, true);
});

test('a missing baseline never silently passes', () => {
  const scope = classifyScope({ baseline: null, head: 'head-1', entries: [], allowedFiles: ALLOWED, declaredFiles: [] });
  assert.equal(scope.status, SCOPE_STATUS.NEEDS_AHMET);
  assert.equal(scope.reason, 'NO_BASELINE');
});

// ---------------------------------------------------------------------------
// D: Allowlist
// ---------------------------------------------------------------------------

test('D) a change outside the allowlist is a security stop, even if declared', () => {
  const scope = classifyScope({
    baseline: baselineWith([]),
    head: 'head-1',
    entries: [{ path: 'config/settings_data.json', hash: 'h1' }],
    allowedFiles: ALLOWED,
    declaredFiles: ['config/settings_data.json'],
  });
  assert.equal(scope.status, SCOPE_STATUS.SECURITY_STOP);
  assert.equal(scope.reason, 'CHANGED_OUTSIDE_ALLOWLIST');
  assert.deepEqual(scope.outsideAllowlist, ['config/settings_data.json']);
  assert.deepEqual(scope.agentFiles, [], 'nichts davon gilt als sauberer Agenten-Diff');
});

test('a security stop outranks every softer finding', () => {
  const scope = classifyScope({
    baseline: baselineWith([], 'head-1'),
    head: 'head-2', // wuerde allein NEEDS_AHMET ergeben
    entries: [{ path: 'config/settings_data.json', hash: 'h1' }, { path: 'qa/x.txt', hash: 'h2' }],
    allowedFiles: ALLOWED,
    declaredFiles: [],
  });
  assert.equal(scope.status, SCOPE_STATUS.SECURITY_STOP);
});

test('orchestrator-owned paths are never attributed to an agent', () => {
  for (const file of ['.workflow/state.json', '.workflow/ai/baseline/x', 'node_modules/foo/index.js', 'qa/evidence/local-verification.json']) {
    assert.equal(isIgnoredForScope(file), true, file);
  }
  assert.equal(isIgnoredForScope('qa/fixture.txt'), false);

  const scope = classifyScope({
    baseline: baselineWith([]),
    head: 'head-1',
    entries: [{ path: '.workflow/state.json', hash: 'h1' }, { path: 'qa/fixture.txt', hash: 'h2' }],
    allowedFiles: ALLOWED,
    declaredFiles: ['qa/fixture.txt'],
  });
  assert.equal(scope.status, SCOPE_STATUS.OK);
  assert.deepEqual(scope.agentFiles, ['qa/fixture.txt']);
});

// ---------------------------------------------------------------------------
// E: Evidence-Bindung an den agentenspezifischen Diff
// ---------------------------------------------------------------------------

test('E) review evidence becomes invalid when the agent-specific diff changes', () => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  const repo = repoState();
  const scope = { agentFiles: ['qa/fixture.txt'], preexistingUntouched: [PREEXISTING.path], undeclared: [], outsideAllowlist: [], phantom: [] };
  const evidence = createReviewEvidence({
    route, repo, reviewer: route.reviewer, result: { findings: [] },
    scope, agentDiffFingerprint: 'fingerprint-A',
  });

  assert.equal(evidence.agentDiffFingerprint, 'fingerprint-A');
  assert.deepEqual(evidence.reviewedFiles, ['qa/fixture.txt'], 'Evidence haelt fest, was tatsaechlich reviewt wurde');
  assert.equal(isEvidenceCurrent(evidence, { route, repo, agentDiffFingerprint: 'fingerprint-A' }), true);
  assert.equal(isEvidenceCurrent(evidence, { route, repo, agentDiffFingerprint: 'fingerprint-B' }), false);
  // Ohne uebergebenen Fingerprint bleiben die bisherigen Bindungen wirksam.
  assert.equal(isEvidenceCurrent(evidence, { route, repo }), true);
  assert.equal(isEvidenceCurrent(evidence, { route, repo: repoState({ head: 'head-2' }) }), false);
});

test('the diff fingerprint reacts to both file set and diff content', () => {
  const a = fingerprintScope({ agentFiles: ['a.txt'], diff: 'X' });
  assert.equal(a, fingerprintScope({ agentFiles: ['a.txt'], diff: 'X' }), 'stabil');
  assert.notEqual(a, fingerprintScope({ agentFiles: ['a.txt'], diff: 'Y' }), 'Inhalt zaehlt');
  assert.notEqual(a, fingerprintScope({ agentFiles: ['a.txt', 'b.txt'], diff: 'X' }), 'Dateimenge zaehlt');
  assert.equal(
    fingerprintScope({ agentFiles: ['b.txt', 'a.txt'], diff: 'X' }),
    fingerprintScope({ agentFiles: ['a.txt', 'b.txt'], diff: 'X' }),
    'Reihenfolge egal',
  );
});

// ---------------------------------------------------------------------------
// Integration: runAgentCycle mit Diff-Scoping
// ---------------------------------------------------------------------------

function tempStateDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-scope-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const agent = (overrides = {}) => ({
  schemaVersion: 1, provider: 'FAKE', model: null, role: 'IMPLEMENTER', status: 'PASS',
  summary: 'fake', changedFiles: ['qa/fixture.txt'],
  tests: { status: 'PASS', commands: [], passed: 1, failed: 0, summary: '' },
  findings: [], blockers: [], git: { branch: 'chore/ai', head: 'head-1' },
  actualOperations: ['read', 'test_write'], resources: [],
  startedAt: null, finishedAt: null, durationMs: null, exitCode: 0, retryable: false,
  workspace: null, diffFingerprint: null, output: '', ...overrides,
});

/** Fake-Port, der ein vorgegebenes Scope-Ergebnis liefert. */
function fakeDiffScope(scope, { diff = 'diff --git a/qa/fixture.txt b/qa/fixture.txt' } = {}) {
  const seen = { captures: 0, diffs: [] };
  return {
    port: {
      capture() { seen.captures += 1; return { head: 'head-1', files: {}, snapshotDir: '/tmp/none' }; },
      classify() { return scope; },
      readScopedDiff(given) { seen.diffs.push(given); return diff; },
      fingerprint() { return 'fingerprint-A'; },
    },
    seen,
  };
}

test('A) the reviewer only receives the agent-specific diff, never the foreign changes', async t => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  assert.equal(route.reviewRequired, true);
  const scope = {
    status: SCOPE_STATUS.OK, agentFiles: ['qa/fixture.txt'], preexistingUntouched: [PREEXISTING.path],
    undeclared: [], outsideAllowlist: [], phantom: [], headMoved: false, reason: null, detail: null,
  };
  const { port } = fakeDiffScope(scope, { diff: 'NUR-FIXTURE-DIFF' });

  const prompts = [];
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempStateDir(t), needsAhmetPath: path.join(tempStateDir(t), 'needs-ahmet.md'),
    diffScope: port,
    // Der ungescopte Diff enthaelt die fremde Aenderung - er darf nicht ankommen.
    readDiff: () => 'FREMDER-DIFF-DARF-NICHT-ANKOMMEN',
    runRole: ({ agentRole, prompt }) => {
      prompts.push({ agentRole, prompt });
      if (agentRole === 'REVIEWER') return agent({ role: 'REVIEWER', status: 'PASS', changedFiles: [], findings: [] });
      return agent({ changedFiles: ['qa/fixture.txt', PREEXISTING.path] });
    },
  });

  assert.equal(outcome.status, 'PASS');
  const reviewerPrompt = prompts.find(entry => entry.agentRole === 'REVIEWER').prompt;
  assert.match(reviewerPrompt, /NUR-FIXTURE-DIFF/);
  assert.ok(!reviewerPrompt.includes('FREMDER-DIFF-DARF-NICHT-ANKOMMEN'), 'ungescopter Diff darf den Reviewer nie erreichen');
  assert.deepEqual(outcome.scope.agentFiles, ['qa/fixture.txt']);
});

test('D) a scoped allowlist violation stops the cycle before any review', async t => {
  const route = routeTask({ text: 'Performance und groessere Theme-Logik verbessern', branch: 'chore/ai', head: 'head-1' });
  const scope = {
    status: SCOPE_STATUS.SECURITY_STOP, agentFiles: [], preexistingUntouched: [], undeclared: [],
    outsideAllowlist: ['config/settings_data.json'], phantom: [], headMoved: false,
    reason: 'CHANGED_OUTSIDE_ALLOWLIST', detail: 'Aenderungen ausserhalb der erlaubten Dateien',
  };
  const { port } = fakeDiffScope(scope);
  let reviewerRan = false;

  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempStateDir(t), needsAhmetPath: path.join(tempStateDir(t), 'needs-ahmet.md'),
    diffScope: port,
    runRole: ({ agentRole }) => {
      if (agentRole === 'REVIEWER') { reviewerRan = true; return agent({ role: 'REVIEWER', status: 'PASS' }); }
      return agent({ changedFiles: ['config/settings_data.json'] });
    },
  });

  assert.equal(outcome.status, 'SECURITY_STOP');
  assert.equal(outcome.stopReason, STOP_REASONS.SECURITY_STOP);
  assert.equal(reviewerRan, false, 'nach einem Sicherheitsstop wird nicht mehr reviewt');
});

test('C) an unattributable parallel change escalates to NEEDS_AHMET', async t => {
  const route = routeTask({ text: 'Kleinen CSS Theme-Fix umsetzen', branch: 'chore/ai', head: 'head-1' });
  const scope = {
    status: SCOPE_STATUS.NEEDS_AHMET, agentFiles: ['qa/fixture.txt'], preexistingUntouched: [],
    undeclared: ['docs/fremde-notiz.md'], outsideAllowlist: [], phantom: [], headMoved: false,
    reason: 'UNDECLARED_CHANGE', detail: 'nicht stillschweigend uebernommen',
  };
  const { port } = fakeDiffScope(scope);

  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempStateDir(t), needsAhmetPath: path.join(tempStateDir(t), 'needs-ahmet.md'),
    diffScope: port,
    runRole: () => agent(),
  });

  assert.equal(outcome.stopReason, STOP_REASONS.NEEDS_AHMET);
  assert.match(outcome.detail, /stillschweigend/);
});

test('without a diff-scope port the previous behaviour is preserved', async t => {
  const route = routeTask({ text: 'Dateien pruefen und Report erstellen', branch: 'chore/ai', head: 'head-1' });
  const outcome = await runAgentCycle({
    route, repo: repoState(), policy: deriveTaskPolicy(route), riskMap,
    stateDir: tempStateDir(t), needsAhmetPath: path.join(tempStateDir(t), 'needs-ahmet.md'),
    runRole: () => agent({ changedFiles: ['automation/demo.mjs'], actualOperations: ['read', 'report_write'] }),
  });
  assert.equal(outcome.status, 'PASS');
  assert.equal(outcome.scope, null);
});

test('re-routing resets a terminal task state so the next run really starts', t => {
  const stateDir = tempStateDir(t);
  const taskId = 'TASK-ABC123';
  const taskFile = path.join(stateDir, 'tasks', `${taskId}.json`);
  const baselineDir = path.join(stateDir, 'baseline', taskId);
  fs.mkdirSync(path.dirname(taskFile), { recursive: true });
  fs.writeFileSync(taskFile, JSON.stringify({ taskId, status: 'SECURITY_STOP' }));
  fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(path.join(baselineDir, 'kopie.txt'), 'alt');
  fs.writeFileSync(path.join(stateDir, 'run-state.json'), JSON.stringify({ runId: 'alt', status: 'COMPLETE' }));

  const result = resetTaskState({ stateDir, taskId, io: fs, pathApi: path });

  assert.equal(fs.existsSync(taskFile), false, 'alter Endstatus ist weg');
  assert.equal(fs.existsSync(baselineDir), false, 'alte Baseline ist weg');
  assert.equal(fs.existsSync(path.join(stateDir, 'run-state.json')), false);
  assert.equal(result.removed.length, 3);
  assert.deepEqual(result.skipped, []);
});

test('resetting is a no-op when there is nothing to reset', t => {
  const stateDir = tempStateDir(t);
  assert.deepEqual(resetTaskState({ stateDir, taskId: 'TASK-NEU', io: fs, pathApi: path }), { removed: [], skipped: [] });
  assert.deepEqual(resetTaskState({ stateDir: null, taskId: 'X', io: fs, pathApi: path }), { removed: [], skipped: [] });
  assert.deepEqual(resetTaskState({ stateDir, taskId: null, io: fs, pathApi: path }), { removed: [], skipped: [] });
});

test('an untracked fixture is visible to the reviewer as an addition', () => {
  // Regressionsschutz fuer den Smoke-Test-Befund: eine neue, noch nicht
  // getrackte Datei taucht in `git diff HEAD` nicht auf. Sie muss trotzdem als
  // Aenderung des Agenten erkannt werden.
  const scope = classifyScope({
    baseline: baselineWith([]),
    head: 'head-1',
    entries: [{ path: 'qa/fixtures/ai-smoke-test.md', hash: 'hash-v2' }],
    allowedFiles: ALLOWED,
    declaredFiles: ['qa/fixtures/ai-smoke-test.md'],
  });
  assert.equal(scope.status, SCOPE_STATUS.OK);
  assert.deepEqual(scope.agentFiles, ['qa/fixtures/ai-smoke-test.md']);
});

test('the scope summary stays readable', () => {
  assert.match(summarizeScope({
    agentFiles: ['a'], preexistingUntouched: ['b', 'c'], undeclared: [], outsideAllowlist: [], phantom: [],
  }), /vom Agenten: 1.*vorher vorhanden und unberuehrt: 2/);
  assert.equal(summarizeScope(null), 'kein Diff-Scoping aktiv');
});
