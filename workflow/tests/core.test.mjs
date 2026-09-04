import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  APPROVAL_TEXT, GATE_REMEDIATION, REQUIRED_LOCAL_EVIDENCE_STEPS, TRACKED_EVIDENCE_PATH, WorkflowGateError, assertLiveGate, assertPreviewGate, assertPrGate, assertScratchGate, commandName, compareThemeMaps, createDryRunSummary,
  deriveWorkflowState, fileSha256, findingsAreClear, parseThemeList, previewPushArgs, runValidation, selectThemeTargets, verifyLocalEvidence, verifyPreviewPayload,
  remediationFor, verifyPreviewSnapshot, verifySalesReport,
} from '../core.mjs';
import { targetUrl } from '../../qa/target-url.mjs';

const cleanContext = { branch: 'chore/test', base: 'main', p0: '0', p1: '0', clean: true, head: 'abc', remoteHead: 'abc' };
const unpublished = { id: '22', role: 'unpublished' };
const live = { id: '11', role: 'live' };

test('PR gate refuses work on main', () => {
  assert.throws(() => assertPrGate({ ...cleanContext, branch: 'main' }), error => error instanceof WorkflowGateError && error.code === 'BRANCH_BLOCK');
});

test('PR gate refuses failed tests represented by P0/P1 blockers', () => {
  assert.throws(() => assertPrGate({ ...cleanContext, p1: '1' }), /P0 und P1/);
});

test('readiness remains false until P0 and P1 are explicitly zero', () => {
  assert.equal(findingsAreClear({}), false);
  assert.equal(findingsAreClear({ p0: '0', p1: '0' }), true);
  assert.equal(findingsAreClear({ p0: '0', p1: '1' }), false);
});

test('PR gate refuses unpushed HEAD and invalid branch convention', () => {
  assert.throws(() => assertPrGate({ ...cleanContext, remoteHead: 'def' }), /Remote-Branch/);
  assert.throws(() => assertPrGate({ ...cleanContext, branch: 'random/name' }), /Branch-Namen/);
});

test('preview gate only accepts current main and unpublished non-live theme', () => {
  assert.equal(assertPreviewGate({ branch: 'main', head: 'abc', originMain: 'abc', clean: true, p0: '0', p1: '0', approved: true, theme: unpublished, liveTheme: live }), true);
  assert.throws(() => assertPreviewGate({ branch: 'main', head: 'old', originMain: 'abc', clean: true, p0: '0', p1: '0', approved: true, theme: unpublished, liveTheme: live }), /origin\/main/);
  assert.throws(() => assertPreviewGate({ branch: 'main', head: 'abc', originMain: 'abc', clean: true, p0: '0', p1: '0', approved: true, theme: live, liveTheme: live }), /unpublished/);
  assert.throws(() => assertPreviewGate({ branch: 'main', head: 'abc', originMain: 'abc', clean: true, p0: '0', p1: '0', approved: true, theme: null, liveTheme: live }), /unpublished/);
  assert.throws(() => assertPreviewGate({ branch: 'main', head: 'abc', originMain: 'abc', clean: true, p0: '0', p1: '0', approved: true, theme: { id: '33', role: 'published' }, liveTheme: live }), /unpublished/);
});

test('preview push is settings-safe and can never publish', () => {
  const args = previewPushArgs({ store: 'example.myshopify.com', themeId: 22, root: '/repo' });
  assert.deepEqual(args.slice(0, 2), ['theme', 'push']);
  assert.ok(args.includes('--ignore'));
  assert.ok(args.includes('config/settings_data.json'));
  assert.ok(args.includes('--nodelete'));
  assert.ok(!args.includes('--publish'));
  assert.ok(!args.includes('--live'));
  assert.ok(!args.includes('--allow-live'));
});

test('preview output must bind an HTTPS URL to the unpublished theme ID', () => {
  assert.equal(verifyPreviewPayload({ theme: { id: 22, role: 'unpublished', preview_url: 'https://example.myshopify.com/?preview_theme_id=22' } }, 22), 'https://example.myshopify.com/?preview_theme_id=22');
  assert.throws(() => verifyPreviewPayload({ theme: { id: 22, role: 'live', preview_url: 'https://example.myshopify.com/?preview_theme_id=22' } }, 22), /unpublished/);
  assert.throws(() => verifyPreviewPayload({ theme: { id: 22, role: 'unpublished', preview_url: 'https://example.myshopify.com/' } }, 22), /Theme-ID/);
});

test('live gate refuses missing approval, dry execution and mismatched preview evidence', () => {
  const base = { branch: 'main', head: 'abc', originMain: 'abc', clean: true, p0: '0', p1: '0', approved: true, approvalText: APPROVAL_TEXT, execute: true, previewEvidence: { status: 'PASS', commit: 'abc', themeId: '22', settingsDataProtected: true, previewDiffCount: 0 }, theme: unpublished, liveTheme: live };
  assert.equal(assertLiveGate(base), true);
  assert.throws(() => assertLiveGate({ ...base, approved: false }), /Live bleibt gesperrt/);
  assert.throws(() => assertLiveGate({ ...base, execute: false }), /Live bleibt gesperrt/);
  assert.throws(() => assertLiveGate({ ...base, approvalText: 'yes' }), /Live bleibt gesperrt/);
  assert.throws(() => assertLiveGate({ ...base, previewEvidence: { ...base.previewEvidence, commit: 'old' } }), /Preview-Evidence/);
  assert.throws(() => assertLiveGate({ ...base, p1: '1' }), /P0 und P1/);
  assert.throws(() => assertLiveGate({ ...base, previewEvidence: null }), /Preview-Evidence/);
});

test('live snapshot verification rejects theme and settings drift', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-workflow-test-'));
  const root = path.join(fixture, 'root');
  const pulled = path.join(fixture, 'pulled');
  for (const directory of [root, pulled]) {
    fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'config'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'assets/app.js'), 'same');
    fs.writeFileSync(path.join(directory, 'config/settings_data.json'), '{"safe":true}');
  }
  const evidence = { status: 'PASS', settingsDataProtected: true, previewDiffCount: 0, settingsDataSha256: fileSha256(path.join(pulled, 'config/settings_data.json')) };
  try {
    assert.equal(verifyPreviewSnapshot({ root, pulledRoot: pulled, evidence }), true);
    fs.writeFileSync(path.join(pulled, 'assets/app.js'), 'changed');
    assert.throws(() => verifyPreviewSnapshot({ root, pulledRoot: pulled, evidence }), error => error.code === 'PREVIEW_DRIFT');
    fs.writeFileSync(path.join(pulled, 'assets/app.js'), 'same');
    fs.writeFileSync(path.join(pulled, 'config/settings_data.json'), '{"safe":false}');
    assert.throws(() => verifyPreviewSnapshot({ root, pulledRoot: pulled, evidence }), error => error.code === 'PREVIEW_SETTINGS_DRIFT');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('preview target URLs retain the verified preview theme ID', () => {
  assert.equal(targetUrl('/cart', 'https://shop.example/?preview_theme_id=22'), 'https://shop.example/cart?preview_theme_id=22');
});

test('preview tree comparison blocks missing, extra and changed remote files', () => {
  const expected = new Map([['assets/a.js', 'one'], ['sections/a.liquid', 'two']]);
  assert.deepEqual(compareThemeMaps(expected, new Map(expected)), { mainOnly: [], previewOnly: [], different: [], differenceCount: 0 });
  const result = compareThemeMaps(expected, new Map([['assets/a.js', 'changed'], ['snippets/extra.liquid', 'x']]));
  assert.deepEqual(result.mainOnly, ['sections/a.liquid']);
  assert.deepEqual(result.previewOnly, ['snippets/extra.liquid']);
  assert.deepEqual(result.different, ['assets/a.js']);
  assert.equal(result.differenceCount, 3);
});

test('missing Shopify CLI and missing auth fail closed', () => {
  assert.throws(() => parseThemeList({ exitCode: null, stdout: '', stderr: '', spawnError: { code: 'ENOENT' } }), error => error.code === 'MISSING_SHOPIFY');
  assert.throws(() => parseThemeList({ exitCode: 1, stdout: 'To run this command, log in to Shopify.', stderr: '', spawnError: null }), error => error.code === 'MISSING_SHOPIFY_AUTH');
});

test('theme selection requires one exact target and one unique live theme', () => {
  assert.deepEqual(selectThemeTargets([unpublished, live], '22'), { theme: unpublished, liveTheme: live });
  assert.throws(() => selectThemeTargets([unpublished], '22'), error => error.code === 'LIVE_THEME_AMBIGUOUS');
  assert.throws(() => selectThemeTargets([unpublished, live, { id: '12', role: 'live' }], '22'), error => error.code === 'LIVE_THEME_AMBIGUOUS');
  assert.throws(() => selectThemeTargets([live], '22'), error => error.code === 'THEME_ID_AMBIGUOUS');
});

test('GitHub PR validation has minimal read-only permissions and no sensitive execution', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/pr-validation.yml', import.meta.url), 'utf8');
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(workflow, /pull_request_target|permissions:[\s\S]*?write|secrets\.|shopify theme (push|publish)/i);
});

test('sales report requires six PASS flows and orderCompleted false', () => {
  const results = Array.from({ length: 6 }, () => ({ status: 'PASS', orderCompleted: false }));
  assert.equal(verifySalesReport({ orderCompleted: false, results, summary: { passed: 6, failed: 0 } }), true);
  assert.throws(() => verifySalesReport({ orderCompleted: true, results, summary: { passed: 6, failed: 0 } }), error => error.code === 'ORDER_COMPLETED');
  assert.throws(() => verifySalesReport({ orderCompleted: false, results: results.slice(1), summary: { passed: 5, failed: 0 } }), /6 Flows/);
});

test('validation dry-run executes no subprocess and cannot report PASS', () => {
  let calls = 0;
  const summary = runValidation({ root: new URL('../..', import.meta.url).pathname, dryRun: true, run: () => { calls += 1; } });
  assert.equal(calls, 0);
  assert.equal(summary.status, 'DRY_RUN');
  assert.ok(summary.results.every(item => item.status === 'SKIPPED_DRY_RUN'));
});

test('PR and preview dry-runs never report readiness', () => {
  for (const workflow of ['pr', 'preview']) {
    const summary = createDryRunSummary(workflow, { branch: 'chore/test', commit: 'abc' });
    assert.equal(summary.status, 'DRY_RUN');
    assert.equal(summary.readyForPr, false);
    assert.equal(summary.readyForPreview, false);
    assert.equal(summary.readyForLive, false);
  }
});

test('workflow state fails closed for stale evidence and never stores approval', () => {
  const stale = deriveWorkflowState({ branch: 'chore/test', head: 'new', originMain: 'main', clean: true, latest: { status: 'PASS', branch: 'chore/test', commit: 'old' } });
  assert.equal(stale.status, 'STOP_REVIEW');
  assert.match(stale.nextAction, /STOP\/REVIEW/);
  assert.equal(stale.readyForLive, false);
  assert.equal(stale.humanApprovalStored, false);
  const current = deriveWorkflowState({ branch: 'chore/test', head: 'new', originMain: 'main', clean: true, latest: { status: 'PASS', branch: 'chore/test', commit: 'new' } });
  assert.equal(current.status, 'VALIDATED_BRANCH');
  assert.equal(current.readyForLive, false);
  assert.equal(current.humanApprovalStored, false);
});

test('failed validation step stops without a false PASS', () => {
  assert.throws(() => runValidation({ root: new URL('../..', import.meta.url).pathname, run: () => ({ exitCode: 1, timedOut: false, spawnError: null }) }), error => error.code === 'VALIDATION_FAILED' && error.summary.status === 'FAIL');
});

function passingEvidence(overrides = {}) {
  return {
    status: 'PASS',
    commit: 'c0ffee',
    branch: 'feature/x',
    p0: '0',
    p1: '0',
    orderCompleted: false,
    results: REQUIRED_LOCAL_EVIDENCE_STEPS.map(id => ({ id, status: 'PASS' })),
    ...overrides,
  };
}

test('local evidence gate refuses a missing or unreadable evidence file (closes the echo-only false-PASS gate)', () => {
  assert.throws(() => verifyLocalEvidence({ evidence: null, expectedCommit: 'c0ffee' }), error => error.code === 'EVIDENCE_MISSING');
  assert.throws(() => verifyLocalEvidence({ evidence: undefined, expectedCommit: 'c0ffee' }), error => error.code === 'EVIDENCE_MISSING');
});

test('local evidence gate refuses evidence bound to a different commit (blocks stale/replayed evidence)', () => {
  assert.equal(verifyLocalEvidence({ evidence: passingEvidence(), expectedCommit: 'c0ffee' }), true);
  assert.throws(
    () => verifyLocalEvidence({ evidence: passingEvidence({ commit: 'old-commit' }), expectedCommit: 'c0ffee' }),
    error => error.code === 'EVIDENCE_STALE',
  );
  assert.throws(
    () => verifyLocalEvidence({ evidence: passingEvidence(), expectedCommit: null }),
    error => error.code === 'EVIDENCE_NO_TARGET',
  );
});

test('local evidence gate accepts an ancestor commit only when nothing but the evidence file itself changed since (fixes the self-referential commit deadlock)', () => {
  // evidence.commit is stamped BEFORE the evidence file is committed, so
  // committing it always produces a new HEAD one commit ahead of what was
  // recorded - an exact-match requirement can never be satisfied by any
  // normal commit sequence. The gate must tolerate that specific gap.
  assert.equal(
    verifyLocalEvidence({
      evidence: passingEvidence({ commit: 'parent-sha' }),
      expectedCommit: 'evidence-commit-sha',
      changedFilesSinceEvidence: [TRACKED_EVIDENCE_PATH],
    }),
    true,
  );
  // Same shape as above but a second, unrelated file also changed since the
  // evidence commit - the evidence no longer provably covers HEAD's code.
  assert.throws(
    () => verifyLocalEvidence({
      evidence: passingEvidence({ commit: 'parent-sha' }),
      expectedCommit: 'evidence-commit-sha',
      changedFilesSinceEvidence: [TRACKED_EVIDENCE_PATH, 'sections/hero_split.liquid'],
    }),
    error => error.code === 'EVIDENCE_STALE' && error.message.includes('hero_split'),
  );
  // git could not compute the diff (unreachable commit, shallow history) -
  // must fail closed, not silently pass an unverifiable ancestor.
  assert.throws(
    () => verifyLocalEvidence({
      evidence: passingEvidence({ commit: 'unreachable-sha' }),
      expectedCommit: 'evidence-commit-sha',
      changedFilesSinceEvidence: null,
    }),
    error => error.code === 'EVIDENCE_STALE',
  );
});

test('local evidence gate refuses evidence from a different branch when a branch is expected', () => {
  assert.throws(
    () => verifyLocalEvidence({ evidence: passingEvidence({ branch: 'other-branch' }), expectedCommit: 'c0ffee', expectedBranch: 'feature/x' }),
    error => error.code === 'EVIDENCE_BRANCH_MISMATCH',
  );
});

test('local evidence gate refuses non-PASS status, non-zero findings and completed orders', () => {
  assert.throws(() => verifyLocalEvidence({ evidence: passingEvidence({ status: 'FAIL' }), expectedCommit: 'c0ffee' }), error => error.code === 'EVIDENCE_NOT_PASS');
  assert.throws(() => verifyLocalEvidence({ evidence: passingEvidence({ p1: '1' }), expectedCommit: 'c0ffee' }), error => error.code === 'EVIDENCE_FINDINGS');
  assert.throws(() => verifyLocalEvidence({ evidence: passingEvidence({ orderCompleted: true }), expectedCommit: 'c0ffee' }), error => error.code === 'EVIDENCE_ORDER_COMPLETED');
});

test('local evidence gate requires every network-dependent step to be individually PASS (blocks the missing-SEO false-PASS gap)', () => {
  for (const missingId of REQUIRED_LOCAL_EVIDENCE_STEPS) {
    const results = REQUIRED_LOCAL_EVIDENCE_STEPS.filter(id => id !== missingId).map(id => ({ id, status: 'PASS' }));
    assert.throws(
      () => verifyLocalEvidence({ evidence: passingEvidence({ results }), expectedCommit: 'c0ffee' }),
      error => error.code === 'EVIDENCE_STEP_MISSING' && error.message.includes(missingId),
      `expected missing ${missingId} to be rejected`,
    );
    const failedResults = REQUIRED_LOCAL_EVIDENCE_STEPS.map(id => ({ id, status: id === missingId ? 'FAIL' : 'PASS' }));
    assert.throws(
      () => verifyLocalEvidence({ evidence: passingEvidence({ results: failedResults }), expectedCommit: 'c0ffee' }),
      error => error.code === 'EVIDENCE_STEP_MISSING',
    );
  }
});

test('draft PR CI stays static and cannot execute Storefront or Shopify writes', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/pr-validation.yml', import.meta.url), 'utf8');
  assert.match(workflow, /safe-static-checks:/);
  assert.match(workflow, /npm run workflow:test/);
  assert.match(workflow, /npm run secret:scan/);
  assert.doesNotMatch(workflow, /local-verification-gate|verify-local-checks|run-(?:seo-check|qa|sales-readiness)|shopify theme (?:push|publish)/i);
});

test('tracked evidence directory is not blanket-gitignored (evidence must be able to reach CI)', () => {
  const gitignore = fs.readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.doesNotMatch(gitignore, /^qa\/evidence\/?\s*$/m, 'qa/evidence/ must stay trackable so committed evidence reaches CI');
});

test('Windows command selection is portable without absolute tool paths', () => {
  assert.equal(commandName('shopify', 'win32'), 'shopify.cmd');
  assert.equal(commandName('gh', 'win32'), 'gh.cmd');
  assert.equal(commandName('shopify', 'darwin'), 'shopify');
});

test('Scratch-Gate: laesst WIP zu, schuetzt aber Live und Preview-Evidence', () => {
  const scratch = { id: '999', role: 'unpublished', name: 'Scratch' };
  const live = { id: 'live', role: 'live' };

  // Kern der Lane: kein origin/main, kein sauberer Tree, keine Null-Findings -
  // genau deshalb ist sie zum Ausprobieren brauchbar.
  assert.equal(assertScratchGate({ themeId: '999', theme: scratch, liveTheme: live, previewEvidence: null }), true);
  assert.equal(assertScratchGate({ themeId: '999', theme: scratch, liveTheme: live, previewEvidence: { themeId: '203558781262' } }), true);

  assert.throws(() => assertScratchGate({ themeId: null, theme: scratch, liveTheme: live }), /--theme-id/);
  assert.throws(() => assertScratchGate({ themeId: 'live', theme: live, liveTheme: live }), /unpublished/);
  assert.throws(() => assertScratchGate({ themeId: '999', theme: { id: '999', role: 'live' }, liveTheme: live }), /unpublished/);

  // Ein Scratch-Push auf das Preview-Theme wuerde genau die Drift erzeugen,
  // die PREVIEW_DRIFT abfangen soll.
  assert.throws(
    () => assertScratchGate({ themeId: '777', theme: { id: '777', role: 'unpublished' }, liveTheme: live, previewEvidence: { themeId: '777' } }),
    /Preview-Evidence/,
  );
});

test('jeder geworfene Gate-Code hat einen Loesungshinweis', () => {
  // Ein Gate, das nur das Problem nennt, hat in der Praxis sechs Fehlschlaege
  // nacheinander erzeugt. Dieser Test liest die tatsaechlich geworfenen Codes
  // aus dem Quelltext und erzwingt fuer jeden einen Eintrag - eine neue
  // WorkflowGateError ohne Loesungstext laesst die Suite fehlschlagen. Damit
  // kann die Tabelle nicht vom Code wegdriften.
  const workflowDir = path.join(import.meta.dirname, '..');
  const sources = fs.readdirSync(workflowDir)
    .filter(name => name.endsWith('.mjs'))
    .map(name => fs.readFileSync(path.join(workflowDir, name), 'utf8'))
    .join('\n');

  const thrown = new Set();
  for (const match of sources.matchAll(/WorkflowGateError\([^)]*?,\s*'([A-Z_]+)'/g)) thrown.add(match[1]);
  // Wird nicht direkt geworfen, sondern in runValidation aus dem Blocker abgeleitet.
  thrown.add('VALIDATION_FAILED');

  assert.ok(thrown.size > 20, `Codes wurden nicht erkannt, gefunden: ${thrown.size}`);

  const ohneHinweis = [...thrown].filter(code => !remediationFor(code)).sort();
  assert.deepEqual(ohneHinweis, [], `Gate-Codes ohne Eintrag in GATE_REMEDIATION: ${ohneHinweis.join(', ')}`);

  // Jeder Hinweis muss auch etwas sagen - ein leerer String wuerde den Test
  // oben bestehen, aber niemandem helfen.
  for (const [code, hint] of Object.entries(GATE_REMEDIATION)) {
    assert.ok(hint.fix && hint.fix.length > 20, `Loesungstext zu ${code} ist zu duenn`);
  }
});
