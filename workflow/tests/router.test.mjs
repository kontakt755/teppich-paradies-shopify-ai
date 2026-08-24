import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import os from 'node:os';
import {
  EXTERNAL_BLOCKS, MAX_AUTONOMOUS_REPAIR_ROUNDS, MAX_IMMEDIATE_SCRIPT_RETRIES,
  assertProtectedAction, classifyFailure, classifyTask, deriveHandoffState, isSensitiveFile,
  matchesAnyGlob, normalizeAllowedFiles, normalizeTaskText, planContinue, routeTask, runWithExternalRetry,
} from '../router.mjs';
import { runValidation } from '../core.mjs';

const repo = (overrides = {}) => ({
  branch: 'chore/router', head: 'head-1', originMain: 'main-1', clean: true, worktreeFingerprint: 'clean', ...overrides,
});
const latest = (overrides = {}) => ({
  status: 'PASS', branch: 'chore/router', commit: 'head-1', worktreeFingerprint: 'clean', validationScope: 'FULL', p0: 0, p1: 0, ...overrides,
});

test('CLASS A/B/C/D routing follows cost-aware defaults', () => {
  const cases = [
    ['Dateien prüfen und Report erstellen', 'A', 'SCRIPT', false],
    ['Kleinen CSS Theme-Fix umsetzen', 'B', 'CODEX_LIGHT', false],
    ['Performance und größere Theme-Logik verbessern', 'C', 'CODEX_MEDIUM', true],
    ['Checkout Payment und Shipping ändern', 'D', 'CLAUDE_STRONG', true],
  ];
  for (const [text, taskClass, implementer, reviewRequired] of cases) {
    const route = routeTask({ text, branch: 'chore/router', head: 'head-1' });
    assert.equal(route.taskClass, taskClass);
    assert.equal(route.implementer, implementer);
    assert.equal(route.reviewRequired, reviewRequired);
  }
});

test('CLASS B becomes review-required when actual sensitive files are touched', () => {
  const route = routeTask({ text: 'Kleinen CSS Fix umsetzen', branch: 'chore/router', head: 'head-1' });
  assert.equal(route.reviewRequired, false);
  const state = deriveHandoffState({ route, repo: repo(), latest: latest(), changedFiles: ['sections/card.liquid'] });
  assert.equal(state.reviewRequired, true);
  assert.equal(state.reviewer, 'CLAUDE_HAIKU');
  assert.equal(state.nextAllowedAction, 'HANDOFF_REVIEWER');
  assert.ok(isSensitiveFile('docs/WORKFLOW.md'));
  assert.ok(isSensitiveFile('.github/workflows/pr-validation.yml'));
  assert.ok(isSensitiveFile('AGENTS.md'));
});

test('CLASS D always requires independent review and a human gate', () => {
  for (const text of ['SKU ändern', 'CI Security Gate ändern', 'Produkte in Shopify schreiben']) {
    const route = routeTask({ text, branch: 'chore/router', head: 'head-1' });
    assert.equal(route.taskClass, 'D');
    assert.equal(route.reviewRequired, true);
    assert.equal(route.humanGateRequired, true);
  }
});

test('product bulk preparation starts with scripts and gates every future Shopify write', () => {
  const route = routeTask({ text: '22 Odense-Produkte vorbereiten und später in Shopify schreiben', branch: 'chore/router', head: 'head-1' });
  assert.equal(route.taskClass, 'D');
  assert.equal(route.implementer, 'SCRIPT');
  assert.equal(route.executionMode, 'SCRIPT_PIPELINE_THEN_STRONG_JUDGMENT');
  assert.equal(route.shopifyWriteRequired, true);
  assert.equal(route.humanGateRequired, true);
});

test('routeTask allowedFiles defaults to null (no scope declared, hook fails open)', () => {
  const route = routeTask({ text: 'Kleinen CSS Fix umsetzen', branch: 'chore/router', head: 'head-1' });
  assert.equal(route.allowedFiles, null);
});

test('routeTask normalizes and exposes a declared allowedFiles scope', () => {
  const route = routeTask({ text: 'Kleinen CSS Fix umsetzen', branch: 'chore/router', head: 'head-1', allowedFiles: [' sections/**', 'snippets/card.liquid '] });
  assert.deepEqual(route.allowedFiles, ['sections/**', 'snippets/card.liquid']);
});

test('normalizeAllowedFiles rejects empty arrays and blank entries', () => {
  assert.equal(normalizeAllowedFiles(null), null);
  assert.throws(() => normalizeAllowedFiles([]), TypeError);
  assert.throws(() => normalizeAllowedFiles(['sections/**', '  ']), TypeError);
  assert.throws(() => normalizeAllowedFiles('sections/**'), TypeError);
});

test('matchesAnyGlob supports **, * and is path-portable', () => {
  assert.equal(matchesAnyGlob('sections/card.liquid', ['sections/**']), true);
  assert.equal(matchesAnyGlob('sections/nested/card.liquid', ['sections/**']), true);
  assert.equal(matchesAnyGlob('snippets/card.liquid', ['sections/**']), false);
  assert.equal(matchesAnyGlob('snippets\\card.liquid', ['snippets/*.liquid']), true);
  assert.equal(matchesAnyGlob('snippets/card.liquid', ['snippets/card.liquid']), true);
  assert.equal(matchesAnyGlob('snippets/card.liquid', ['snippets/other.liquid']), false);
});

test('external blocker classification is explicit', () => {
  assert.equal(classifyFailure({ stderr: 'HTTP 429 Cloudflare rate limit' }), EXTERNAL_BLOCKS.RATE_LIMIT);
  assert.equal(classifyFailure({ stderr: 'HTTP 503 Service Unavailable' }), EXTERNAL_BLOCKS.UPSTREAM);
  assert.equal(classifyFailure({ stderr: "Fetch to https://error-analytics-sessions-production.shopifysvc.com/observeonly was blocked by CORS policy" }), EXTERNAL_BLOCKS.UPSTREAM);
  assert.equal(classifyFailure({ stderr: 'Claude Cloud Agent Proxy returned 403 for storefront' }), EXTERNAL_BLOCKS.LOCAL_RUNNER);
  assert.equal(classifyFailure({ stderr: 'Storefront image returned 403\nLater request returned HTTP 503 Service Unavailable' }), EXTERNAL_BLOCKS.UPSTREAM);
  assert.equal(classifyFailure({ stderr: 'AssertionError: expected 2 to equal 3' }), EXTERNAL_BLOCKS.CODE_DEFECT);
  assert.equal(classifyFailure({ stderr: 'something unexplained' }), EXTERNAL_BLOCKS.UNKNOWN);
});

test('external script retry is bounded to one and never changes agent', () => {
  let calls = 0;
  const external = runWithExternalRetry(() => ({ exitCode: 1, stderr: `HTTP 503 attempt ${++calls}`, stdout: '', timedOut: false, spawnError: null }));
  assert.equal(calls, 2);
  assert.equal(external.attempts, 2);
  assert.equal(external.blocker, EXTERNAL_BLOCKS.UPSTREAM);
  assert.equal(MAX_IMMEDIATE_SCRIPT_RETRIES, 1);
  calls = 0;
  const defect = runWithExternalRetry(() => ({ exitCode: 1, stderr: `AssertionError ${++calls}`, stdout: '', timedOut: false, spawnError: null }));
  assert.equal(calls, 1);
  assert.equal(defect.blocker, EXTERNAL_BLOCKS.CODE_DEFECT);
  calls = 0;
  const cors = runWithExternalRetry(() => ({ exitCode: 1, stderr: `CORS blocked https://error-analytics-sessions-production.shopifysvc.com/observeonly ${++calls}`, stdout: '', timedOut: false, spawnError: null }));
  assert.equal(calls, 1);
  assert.equal(cors.blocker, EXTERNAL_BLOCKS.UPSTREAM);
});

test('fresh structured 503 report triggers exactly one immediate script retry', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-router-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['qa/tests', 'automation/tests', 'workflow/tests', 'qa/results']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  let seoCalls = 0;
  const run = (_command, args) => {
    if (args.includes('qa/run-seo-check.mjs')) {
      seoCalls += 1;
      fs.writeFileSync(path.join(root, 'qa/results/seo-latest.json'), JSON.stringify({ status: 'FAIL', findings: [
        { severity: 'WARN', message: 'unrelated rate limit documentation' },
        { severity: 'ERROR', message: 'HTTP 503 Service Unavailable' },
      ] }));
      return { exitCode: 1, stdout: 'SEO FAIL', stderr: '', timedOut: false, spawnError: null };
    }
    return { exitCode: 0, stdout: '', stderr: '', timedOut: false, spawnError: null };
  };
  assert.throws(
    () => runValidation({ root, run }),
    error => error.code === EXTERNAL_BLOCKS.UPSTREAM && error.summary.externalBlock === EXTERNAL_BLOCKS.UPSTREAM,
  );
  assert.equal(seoCalls, 2);
});

test('stale validation and generated state are not trusted', () => {
  const route = routeTask({ text: 'Dateien prüfen', branch: 'chore/router', head: 'head-1' });
  const staleCommit = deriveHandoffState({ route, repo: repo(), latest: latest({ commit: 'old' }) });
  const staleTree = deriveHandoffState({ route, repo: repo(), latest: latest({ worktreeFingerprint: 'old-tree' }) });
  assert.equal(staleCommit.validationStatus, 'STALE_OR_NOT_RUN');
  assert.equal(staleTree.validationStatus, 'STALE_OR_NOT_RUN');
  assert.equal(staleCommit.nextAllowedAction, 'RUN_STATIC_VALIDATION');
});

test('full validation remains current only across the tracked evidence-only commit gap', () => {
  const route = routeTask({ text: 'Dateien prüfen', branch: 'chore/router', head: 'validated-parent' });
  const afterEvidenceCommit = repo({ head: 'evidence-commit' });
  const validation = latest({ commit: 'validated-parent' });
  const accepted = deriveHandoffState({ route, repo: afterEvidenceCommit, latest: validation, latestChangedFiles: ['qa/evidence/local-verification.json'] });
  const rejected = deriveHandoffState({ route, repo: afterEvidenceCommit, latest: validation, latestChangedFiles: ['qa/evidence/local-verification.json', 'workflow/router.mjs'] });
  assert.equal(accepted.validationStatus, 'PASS');
  assert.equal(rejected.validationStatus, 'STALE_OR_NOT_RUN');
});

test('approval is never persisted in handoff state', () => {
  const route = routeTask({ text: 'Checkout ändern', branch: 'chore/router', head: 'head-1' });
  const review = { status: 'PASS', taskId: route.taskId, commit: 'head-1', p0: 0, p1: 0, approved: true };
  const state = deriveHandoffState({ route, repo: repo(), latest: latest(), review, changedFiles: ['checkout/change.mjs'] });
  assert.equal(state.humanApprovalStored, false);
  assert.equal(state.nextAllowedAction, 'STOP_HUMAN_GATE');
  assert.deepEqual(planContinue(state), { kind: 'STOP', reason: 'HUMAN_GATE' });
});

test('Shopify writes and main merges are refused without commit-bound human approval', () => {
  for (const action of ['SHOPIFY_WRITE', 'MERGE_MAIN']) {
    assert.throws(() => assertProtectedAction({ action, currentCommit: 'head-1' }), /verweigert/);
    assert.throws(() => assertProtectedAction({ action, approved: true, approvalCommit: 'old', currentCommit: 'head-1' }), /aktuellen Commit/);
    assert.equal(assertProtectedAction({ action, approved: true, approvalCommit: 'head-1', currentCommit: 'head-1' }), true);
  }
});

test('external blocks hand off without AI retries and offer only a later script retry', () => {
  const route = routeTask({ text: 'Dateien prüfen', branch: 'chore/router', head: 'head-1' });
  const state = deriveHandoffState({ route, repo: repo(), latest: latest({ status: 'FAIL', externalBlock: EXTERNAL_BLOCKS.RATE_LIMIT }) });
  assert.equal(state.nextAllowedAction, 'RETRY_SCRIPT_LATER');
  assert.equal(state.nextAgent, null);
  assert.deepEqual(planContinue(state), { kind: 'STOP', reason: 'BLOCKED_EXTERNAL' });
  assert.deepEqual(planContinue(state, { retryNow: true }), { kind: 'VALIDATE_STATIC' });
});

test('local runner handoff distinguishes cloud-safe code from Storefront QA', () => {
  const route = routeTask({ text: 'Storefront Browser Compare durchführen', branch: 'chore/router', head: 'head-1' });
  const state = deriveHandoffState({ route, repo: repo(), latest: latest({ status: 'FAIL', externalBlock: EXTERNAL_BLOCKS.LOCAL_RUNNER }) });
  assert.equal(state.nextAllowedAction, 'USE_LOCAL_MAC_RUNNER');
  assert.deepEqual(planContinue(state), { kind: 'STOP', reason: 'NEEDS_LOCAL_RUNNER' });
  assert.deepEqual(planContinue(state, { localRunner: true }), { kind: 'VALIDATE_FULL' });
});

test('task text is data, bounded, and never interpreted as a shell command', () => {
  const payload = 'Docs prüfen; $(touch SHOULD_NOT_EXIST) && rm -rf nowhere';
  assert.equal(normalizeTaskText(`Neue Aufgabe: ${payload}`), payload);
  assert.equal(classifyTask(payload), 'A');
  assert.throws(() => normalizeTaskText('x'.repeat(4001)), /4000/);
  assert.throws(() => normalizeTaskText('bad\u0000text'), /Steuerzeichen/);
});

test('CURRENT_STATE and NEXT_ACTION remain derived pointers without stored approvals', () => {
  const root = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
  const current = fs.readFileSync(path.join(root, 'CURRENT_STATE.md'), 'utf8');
  const next = fs.readFileSync(path.join(root, 'NEXT_ACTION.md'), 'utf8');
  assert.match(current, /speichert absichtlich keinen Branch, Commit, PASS-Status oder Human Approval/);
  assert.match(next, /speichert niemals eine Merge-, Preview- oder Live-Freigabe/);
  assert.equal(MAX_AUTONOMOUS_REPAIR_ROUNDS, 3);
});
