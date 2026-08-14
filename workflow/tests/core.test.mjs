import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVAL_TEXT, WorkflowGateError, assertLiveGate, assertPreviewGate, assertPrGate, commandName, compareThemeMaps, findingsAreClear,
  parseThemeList, previewPushArgs, runValidation, verifyPreviewPayload, verifySalesReport,
} from '../core.mjs';

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

test('failed validation step stops without a false PASS', () => {
  assert.throws(() => runValidation({ root: new URL('../..', import.meta.url).pathname, run: () => ({ exitCode: 1, timedOut: false, spawnError: null }) }), error => error.code === 'VALIDATION_FAILED' && error.summary.status === 'FAIL');
});

test('Windows command selection is portable without absolute tool paths', () => {
  assert.equal(commandName('shopify', 'win32'), 'shopify.cmd');
  assert.equal(commandName('gh', 'win32'), 'gh.cmd');
  assert.equal(commandName('shopify', 'darwin'), 'shopify');
});
