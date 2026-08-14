import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  APPROVAL_TEXT, DEFAULT_STORE, OFFICIAL_BASE, WorkflowGateError, assertLiveGate, assertPreviewGate, assertPrGate,
  commandName, compareThemeMaps, createDryRunSummary, createPreviewTempDir, deriveWorkflowState, fileSha256, findingsAreClear, livePublishArgs, parseArgs, parseThemeList,
  previewPushArgs, requireSuccess, runBounded, runValidation, selectThemeTargets, themeFileMap, verifyPreviewPayload, verifyPreviewSnapshot, writeRuntimeReport,
} from './core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const [mode = 'validate', ...rawArgs] = process.argv.slice(2);
const args = parseArgs(rawArgs);
const dryRun = args['dry-run'] === true;

function run(command, commandArgs, options = {}) {
  return runBounded(command, commandArgs, { cwd: root, ...options });
}

function git(...gitArgs) {
  return requireSuccess(run('git', gitArgs, { timeoutMs: 60_000 }), `git ${gitArgs.join(' ')}`).stdout.trim();
}

function context() {
  return {
    branch: git('branch', '--show-current'),
    head: git('rev-parse', 'HEAD'),
    originMain: git('rev-parse', 'origin/main'),
    clean: git('status', '--porcelain') === '',
  };
}

function findings() {
  return { p0: args.p0, p1: args.p1 };
}

function printSummary(summary) {
  const byId = Object.fromEntries((summary.results ?? []).map(item => [item.id, item.status]));
  console.log([
    `WORKFLOW: ${summary.status}`,
    `BRANCH: ${summary.branch ?? '-'}`,
    `COMMIT: ${summary.commit ?? '-'}`,
    `UNIT/AUTOMATION: ${byId.UNIT === 'PASS' && byId.AUTOMATION === 'PASS' ? 'PASS' : summary.status === 'DRY_RUN' ? 'DRY_RUN' : 'FAIL'}`,
    `QA EVIDENCE: ${byId.QA_EVIDENCE ?? '-'}`,
    `SECRET SCAN: ${byId.SECRET_SCAN ?? '-'}`,
    `COMPARE: ${byId.COMPARE ?? '-'}`,
    `SEO: ${byId.SEO ?? '-'}`,
    `FULL QA: ${byId.FULL_QA ?? '-'}`,
    `SALES: ${byId.SALES ?? '-'}`,
    `ORDER COMPLETED: ${summary.orderCompleted === false ? 'FALSE' : 'TRUE'}`,
    `P0: ${summary.p0 ?? '-'}`,
    `P1: ${summary.p1 ?? '-'}`,
    `READY FOR PR: ${summary.readyForPr ? 'JA' : 'NEIN'}`,
    `READY FOR MAIN: ${summary.readyForMain ? 'JA' : 'NEIN'}`,
    `READY FOR PREVIEW: ${summary.readyForPreview ? 'JA' : 'NEIN'}`,
    `READY FOR LIVE: ${summary.readyForLive ? 'JA' : 'NEIN'}`,
  ].join('\n'));
}

function validate({ staticOnly = false, baseUrl = null } = {}) {
  const current = context();
  const summary = runValidation({ root, dryRun, staticOnly, baseUrl });
  const findingState = findings();
  const findingsClear = findingsAreClear(findingState);
  Object.assign(summary, current, findingState, { commit: current.head, readyForPr: summary.status === 'PASS' && current.branch !== OFFICIAL_BASE && findingsClear, readyForMain: false, readyForPreview: false, readyForLive: false });
  writeRuntimeReport(root, 'latest.json', summary);
  printSummary(summary);
  return summary;
}

function themeList(store) {
  const result = run(commandName('shopify'), ['theme', 'list', '--store', store, '--json'], { timeoutMs: 60_000 });
  return parseThemeList(result);
}

async function main() {
  if (mode === 'validate') return validate({ staticOnly: args.static === true });

  if (mode === 'state') {
    const current = context();
    const latestPath = path.join(root, '.workflow/latest.json');
    let latest = null;
    try { latest = fs.existsSync(latestPath) ? JSON.parse(fs.readFileSync(latestPath, 'utf8')) : null; } catch {}
    const state = deriveWorkflowState({ ...current, latest });
    writeRuntimeReport(root, 'state.json', state);
    console.log(`STATE: ${state.status}\nBRANCH: ${state.branch || '-'}\nCOMMIT: ${state.head || '-'}\nREADY FOR LIVE: NEIN\nHUMAN APPROVAL STORED: NEIN\nNEXT ACTION: ${state.nextAction}`);
    if (state.status === 'STOP_REVIEW') process.exitCode = 1;
    return state;
  }

  if (mode === 'pr') {
    const current = context();
    const branchRemote = `origin/${current.branch}`;
    const remoteHeadResult = run('git', ['rev-parse', '--verify', branchRemote], { timeoutMs: 60_000 });
    const remoteHead = remoteHeadResult.exitCode === 0 ? remoteHeadResult.stdout.trim() : null;
    assertPrGate({ ...current, ...findings(), base: args.base ?? OFFICIAL_BASE, remoteHead });
    if (dryRun) {
      const summary = createDryRunSummary('pr', { ...current, ...findings() });
      writeRuntimeReport(root, 'latest.json', summary); printSummary(summary); return summary;
    }
    const validation = validate();
    const title = String(args.title ?? current.branch.replace(/^(feature|fix|chore)\//, '').replaceAll('-', ' ')).trim();
    const existing = requireSuccess(run(commandName('gh'), ['pr', 'list', '--head', current.branch, '--base', OFFICIAL_BASE, '--state', 'open', '--json', 'number,url'], { timeoutMs: 60_000 }), 'gh pr list');
    const existingPr = JSON.parse(existing.stdout)[0];
    const pr = existingPr ?? (() => {
      const created = requireSuccess(run(commandName('gh'), ['pr', 'create', '--draft', '--base', OFFICIAL_BASE, '--head', current.branch, '--title', title, '--body', 'Validated by npm run workflow:pr. Human approval is required before merge.'], { timeoutMs: 60_000 }), 'gh pr create');
      return { url: created.stdout.trim() };
    })();
    validation.workflow = 'pr'; validation.pr = pr; validation.readyForPr = true;
    writeRuntimeReport(root, 'latest.json', validation); printSummary(validation); console.log(`PR: ${pr.url}`); return validation;
  }

  if (mode === 'preview') {
    const current = context();
    const store = String(args.store ?? DEFAULT_STORE);
    const themeId = args['theme-id'];
    if (!themeId) throw new WorkflowGateError('Preview benötigt --theme-id einer vorhandenen unpublished Theme-ID', 'PREVIEW_THEME');
    assertPreviewGate({ ...current, ...findings(), approved: args['approve-preview'] === true, theme: { id: themeId, role: 'unpublished' }, liveTheme: { id: '__live__', role: 'live' } });
    const themes = dryRun ? [{ id: themeId, role: 'unpublished', name: 'dry-run-preview' }, { id: 'live', role: 'live' }] : themeList(store);
    const { theme, liveTheme } = selectThemeTargets(themes, themeId);
    assertPreviewGate({ ...current, ...findings(), approved: args['approve-preview'] === true, theme, liveTheme });
    if (dryRun) {
      const summary = createDryRunSummary('preview', { ...current, ...findings(), themeId: String(themeId) });
      writeRuntimeReport(root, 'latest.json', summary); printSummary(summary); return summary;
    }
    validate({ staticOnly: true });
    const beforeDir = createPreviewTempDir();
    const afterDir = createPreviewTempDir();
    try {
      requireSuccess(run(commandName('shopify'), ['theme', 'pull', '--store', store, '--theme', String(themeId), '--path', beforeDir], { timeoutMs: 5 * 60_000 }), 'Shopify preview preflight pull');
      const settingsBefore = fileSha256(path.join(beforeDir, 'config/settings_data.json'));
      const pushed = requireSuccess(run(commandName('shopify'), previewPushArgs({ store, themeId, root })), 'Shopify unpublished preview push');
      let payload;
      try { payload = JSON.parse(pushed.stdout); } catch { throw new WorkflowGateError('Shopify Preview Push lieferte ungültiges JSON', 'PREVIEW_OUTPUT'); }
      const previewUrl = verifyPreviewPayload(payload, themeId);
      const after = themeList(store).find(item => String(item.id) === String(themeId));
      if (after?.role !== 'unpublished' || payload?.theme?.role !== 'unpublished') throw new WorkflowGateError('Preview ist nach Push nicht eindeutig unpublished', 'PREVIEW_ROLE');
      requireSuccess(run(commandName('shopify'), ['theme', 'pull', '--store', store, '--theme', String(themeId), '--path', afterDir], { timeoutMs: 5 * 60_000 }), 'Shopify preview verification pull');
      const settingsAfter = fileSha256(path.join(afterDir, 'config/settings_data.json'));
      if (settingsBefore !== settingsAfter) throw new WorkflowGateError('Preview settings_data.json wurde trotz Schutz verändert', 'PREVIEW_SETTINGS');
      const ignored = ['config/settings_data.json'];
      const comparison = compareThemeMaps(themeFileMap(root, { ignored }), themeFileMap(afterDir, { ignored }));
      if (comparison.differenceCount !== 0) throw Object.assign(new WorkflowGateError('Preview-Dateien entsprechen nicht exakt origin/main', 'PREVIEW_DIFF'), { comparison });
      const response = await fetch(previewUrl, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new WorkflowGateError(`Preview-URL antwortet mit HTTP ${response.status}`, 'PREVIEW_HTTP');
      const validation = validate({ baseUrl: previewUrl });
      const evidence = { status: 'PASS', commit: current.originMain, themeId: String(themeId), themeName: after.name, previewUrl, previewHttpStatus: response.status, settingsDataProtected: true, settingsDataSha256: settingsAfter, previewDiffCount: 0, validationStatus: validation.status, createdAt: new Date().toISOString() };
      writeRuntimeReport(root, 'preview.json', evidence);
      const summary = { ...validation, workflow: 'preview', themeId: String(themeId), previewUrl: evidence.previewUrl, readyForPreview: true, readyForLive: false };
      writeRuntimeReport(root, 'latest.json', summary); printSummary(summary); console.log(`PREVIEW URL: ${evidence.previewUrl}`); return summary;
    } finally {
      fs.rmSync(beforeDir, { recursive: true, force: true });
      fs.rmSync(afterDir, { recursive: true, force: true });
    }
  }

  if (mode === 'live') {
    const current = context();
    const store = String(args.store ?? DEFAULT_STORE);
    const themeId = args['theme-id'];
    const evidencePath = path.join(root, '.workflow/preview.json');
    const previewEvidence = fs.existsSync(evidencePath) ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) : null;
    if (args['approve-live'] !== true || args['approval-text'] !== APPROVAL_TEXT || args.execute !== true) throw new WorkflowGateError(`Live bleibt gesperrt: --approve-live --approval-text "${APPROVAL_TEXT}" --execute erforderlich`, 'LIVE_APPROVAL');
    if (dryRun) throw new WorkflowGateError('Live-Publish wird auch im Dry-Run niemals ausgeführt', 'LIVE_DRY_RUN_BLOCK');
    const validation = validate();
    const themes = themeList(store);
    const { theme, liveTheme } = selectThemeTargets(themes, themeId);
    assertLiveGate({ ...current, ...findings(), approved: args['approve-live'] === true, approvalText: args['approval-text'], execute: args.execute === true, previewEvidence, theme, liveTheme });
    const verificationDir = createPreviewTempDir();
    try {
      requireSuccess(run(commandName('shopify'), ['theme', 'pull', '--store', store, '--theme', String(themeId), '--path', verificationDir], { timeoutMs: 5 * 60_000 }), 'Shopify live pre-publish verification pull');
      verifyPreviewSnapshot({ root, pulledRoot: verificationDir, evidence: previewEvidence });
      const immediatelyBeforePublish = themeList(store);
      const { theme: currentTheme, liveTheme: currentLiveTheme } = selectThemeTargets(immediatelyBeforePublish, themeId);
      assertLiveGate({ ...current, ...findings(), approved: true, approvalText: args['approval-text'], execute: true, previewEvidence, theme: currentTheme, liveTheme: currentLiveTheme });
      requireSuccess(run(commandName('shopify'), livePublishArgs({ store, themeId, root }), { timeoutMs: 5 * 60_000 }), 'Shopify live publish');
    } finally {
      fs.rmSync(verificationDir, { recursive: true, force: true });
    }
    const after = themeList(store).find(item => String(item.id) === String(themeId));
    if (after?.role !== 'live') throw new WorkflowGateError('Shopify bestätigt das Theme nicht als live', 'LIVE_VERIFY');
    const summary = { ...validation, workflow: 'live', themeId: String(themeId), readyForLive: true, publishedAt: new Date().toISOString() };
    writeRuntimeReport(root, 'latest.json', summary); printSummary(summary); return summary;
  }

  throw new WorkflowGateError(`Unbekannter Workflow: ${mode}`, 'USAGE');
}

main().catch(error => {
  const summary = error.summary ?? { workflow: mode, status: 'FAIL', orderCompleted: false, readyForPr: false, readyForMain: false, readyForPreview: false, readyForLive: false, error: { code: error.code ?? error.name, message: error.message } };
  try { writeRuntimeReport(root, 'latest.json', summary); } catch {}
  printSummary(summary);
  console.error(`${error.code ?? error.name}: ${error.message}`);
  process.exitCode = 1;
});
