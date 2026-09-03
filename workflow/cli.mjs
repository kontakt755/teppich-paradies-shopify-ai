import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import {
  APPROVAL_TEXT, DEFAULT_STORE, OFFICIAL_BASE, WorkflowGateError, assertLiveGate, assertPreviewGate, assertPrGate, assertScratchGate,
  commandName, compareThemeMaps, createDryRunSummary, createPreviewTempDir, deriveWorkflowState, fileSha256, findingsAreClear, livePublishArgs, parseArgs, parseThemeList,
  previewPushArgs, requireSuccess, runBounded, runValidation, selectThemeTargets, themeFileMap, TRACKED_EVIDENCE_PATH, verifyPreviewPayload, verifyPreviewSnapshot, writeRuntimeReport, writeTrackedEvidence,
} from './core.mjs';
import { deriveHandoffState, formatRouterOutput, normalizeTaskText, planContinue, routeTask } from './router.mjs';

const root = path.resolve(import.meta.dirname, '..');
const [mode = 'validate', ...rawArgs] = process.argv.slice(2);
const args = parseArgs(rawArgs);
const dryRun = args['dry-run'] === true;

/**
 * Unbekannte Flags wurden bisher stillschweigend verworfen. Ein Tippfehler wie
 * --static-only (statt --static) liess damit die vollstaendige Validierung
 * inklusive Browser-Schritten laufen, obwohl erkennbar der schnelle Lauf
 * gemeint war - der Fehlschlag sah dann nach einem echten Problem aus.
 */
const KNOWN_FLAGS = new Set([
  'approval-text', 'approve-live', 'approve-preview', 'base', 'dry-run', 'execute',
  'local-runner', 'p0', 'p1', 'retry-now', 'static', 'store', 'theme-id', 'title',
]);
const unknownFlags = Object.keys(args).filter(flag => !KNOWN_FLAGS.has(flag));
if (unknownFlags.length > 0) {
  console.error(`Unbekannte Flags: ${unknownFlags.map(flag => `--${flag}`).join(', ')}`);
  console.error(`Bekannt sind: ${[...KNOWN_FLAGS].sort().map(flag => `--${flag}`).join(', ')}`);
  process.exit(2);
}

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
    if (bytes > 20 * 1024 * 1024) throw new WorkflowGateError('Worktree-Fingerprint überschreitet das 20-MB-Limit', 'WORKTREE_TOO_LARGE');
    const content = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(absolute)) : fs.readFileSync(absolute);
    hash.update(file).update('\0').update(content).update('\0');
  }
  return hash.digest('hex');
}

function context() {
  const porcelain = git('status', '--porcelain=v1', '-z');
  return {
    branch: git('branch', '--show-current'),
    head: git('rev-parse', 'HEAD'),
    originMain: git('rev-parse', 'origin/main'),
    clean: porcelain === '',
    worktreeFingerprint: worktreeFingerprint(),
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
    // Beide Guards standen bisher in keiner Zeile: sie liefen zwar, aber ein
    // Fehlschlag zeigte sich nur als "WORKFLOW: FAIL" ohne erkennbare Ursache.
    `LIQUID GUARD: ${byId.LIQUID_GUARD ?? '-'}`,
    `SCHEMA GUARD: ${byId.SCHEMA_GUARD ?? '-'}`,
    `TEMPLATE GUARD: ${byId.TEMPLATE_GUARD ?? '-'}`,
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
  const previous = readRuntimeJson('latest.json');
  const currentPr = previous?.branch === current.branch ? (previous.pr ?? null) : null;
  let summary;
  try {
    summary = runValidation({ root, dryRun, staticOnly, baseUrl });
  } catch (error) {
    if (error.summary) {
      Object.assign(error.summary, current, { commit: current.head, pr: currentPr });
      writeRuntimeReport(root, 'latest.json', error.summary);
    }
    throw error;
  }
  const findingState = {
    p0: args.p0 ?? (previous?.branch === current.branch ? previous.p0 : null),
    p1: args.p1 ?? (previous?.branch === current.branch ? previous.p1 : null),
  };
  const findingsClear = findingsAreClear(findingState);
  Object.assign(summary, current, findingState, { commit: current.head, pr: currentPr, readyForPr: summary.status === 'PASS' && current.branch !== OFFICIAL_BASE && findingsClear, readyForMain: false, readyForPreview: false, readyForLive: false });
  writeRuntimeReport(root, 'latest.json', summary);
  // Only a full (non-static) validation actually runs Compare/SEO/Full QA/Sales;
  // a --static run never touches the browser-dependent evidence the CI gate
  // requires, so it must never produce a committable evidence file.
  if (!dryRun && !staticOnly) writeTrackedEvidence(root, summary);
  printSummary(summary);
  return summary;
}

function readRuntimeJson(name) {
  const target = path.join(root, '.workflow', name);
  try { return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null; } catch { return null; }
}

function changedFilesSince(commit) {
  const files = new Set();
  const collect = result => {
    if (result.exitCode !== 0) return;
    result.stdout.split('\n').map(line => line.trim()).filter(Boolean).filter(file => file !== TRACKED_EVIDENCE_PATH).forEach(file => files.add(file));
  };
  if (commit) collect(run('git', ['diff', '--name-only', commit, 'HEAD'], { timeoutMs: 60_000 }));
  collect(run('git', ['diff', '--name-only'], { timeoutMs: 60_000 }));
  collect(run('git', ['diff', '--name-only', '--cached'], { timeoutMs: 60_000 }));
  collect(run('git', ['ls-files', '--others', '--exclude-standard'], { timeoutMs: 60_000 }));
  return [...files].sort();
}

function currentHandoffState() {
  const repo = context();
  const route = readRuntimeJson('task.json');
  const latest = readRuntimeJson('latest.json');
  const review = readRuntimeJson('review.json');
  const state = deriveHandoffState({
    route, repo, latest, review,
    changedFiles: changedFilesSince(route?.routedAtHead),
    latestChangedFiles: latest?.commit ? changedFilesSince(latest.commit) : null,
    pr: latest?.pr ?? null,
  });
  writeRuntimeReport(root, 'state.json', state);
  return state;
}

function printHandoffState(state) {
  console.log([
    `TASK_ID: ${state.taskId ?? '-'}`,
    `TASK_CLASS: ${state.taskClass ?? '-'}`,
    `BRANCH: ${state.branch ?? '-'}`,
    `IMPLEMENTER: ${state.implementer ?? '-'}`,
    `COMMIT: ${state.commit ?? '-'}`,
    `PR: ${state.pr?.number ?? state.pr?.url ?? state.pr ?? '-'}`,
    `VALIDATION_STATUS: ${state.validationStatus}`,
    `P0: ${state.p0 ?? '-'}`,
    `P1: ${state.p1 ?? '-'}`,
    `REVIEW_REQUIRED: ${state.reviewRequired ? 'JA' : 'NEIN'}`,
    `REVIEW_RECOMMENDED: ${state.reviewRecommended ? 'JA' : 'NEIN'}`,
    `REVIEWER: ${state.reviewer ?? '-'}`,
    `REVIEW_STATUS: ${state.reviewStatus}`,
    `EXTERNAL_BLOCK: ${state.externalBlock ?? '-'}`,
    `NEXT_AGENT: ${state.nextAgent ?? '-'}`,
    `LOCAL_RUNNER_REQUIRED: ${state.localRunnerRequired ? 'JA' : 'NEIN'}`,
    `VALIDATION_SCOPE: ${state.requiredValidationScope ?? 'STATIC'}`,
    `SHOPIFY_WRITE_REQUIRED: ${state.shopifyWriteRequired ? 'JA' : 'NEIN'}`,
    `PROTECTED_ACTIONS: ${state.protectedActions?.length ? state.protectedActions.join(',') : '-'}`,
    `HUMAN_GATE: ${state.humanGate}`,
    `HUMAN_APPROVAL_STORED: NEIN`,
    `NEXT_ALLOWED_ACTION: ${state.nextAllowedAction}`,
    `UPDATED_AT: ${state.updatedAt}`,
  ].join('\n'));
}

function themeList(store) {
  const result = run(commandName('shopify'), ['theme', 'list', '--store', store, '--json'], { timeoutMs: 60_000 });
  return parseThemeList(result);
}

async function main() {
  if (mode === 'validate') return validate({ staticOnly: args.static === true });

  if (mode === 'route') {
    const current = context();
    const taskText = normalizeTaskText(rawArgs.filter(token => !token.startsWith('--')).join(' '));
    const route = routeTask({ text: taskText, branch: current.branch, head: current.head });
    writeRuntimeReport(root, 'task.json', route);
    const state = currentHandoffState();
    console.log(formatRouterOutput(route, state.nextAllowedAction));
    return route;
  }

  if (mode === 'state' || mode === 'status' || mode === 'next' || mode === 'continue') {
    const routedTask = readRuntimeJson('task.json');
    if (routedTask) {
      const state = currentHandoffState();
      if (mode === 'next') {
        console.log(`NEXT_ALLOWED_ACTION: ${state.nextAllowedAction}`);
        return state;
      }
      if (mode === 'continue') {
        const decision = planContinue(state, { localRunner: args['local-runner'] === true || process.platform === 'darwin', retryNow: args['retry-now'] === true });
        if (decision.kind === 'VALIDATE_STATIC') return validate({ staticOnly: true });
        if (decision.kind === 'VALIDATE_FULL') return validate();
        if (decision.kind === 'STOP' && decision.reason === 'NEEDS_LOCAL_RUNNER') console.log('NEEDS_LOCAL_RUNNER: Lokalen Mac-Runner verwenden; Storefront-Browserchecks nicht in der Cloud erzwingen.');
        else if (decision.kind === 'STOP' && decision.reason === 'BLOCKED_EXTERNAL') console.log('BLOCKED_EXTERNAL: Später mit npm run workflow:continue -- --retry-now erneut versuchen; kein Agenten-Retry.');
        else printHandoffState(state);
        if (decision.kind === 'STOP') process.exitCode = 2;
        if (decision.kind === 'STOP') return state;
        printHandoffState(state);
        return state;
      }
      printHandoffState(state);
      return state;
    }
    const current = context();
    const latest = readRuntimeJson('latest.json');
    const state = deriveWorkflowState({ ...current, latest });
    writeRuntimeReport(root, 'state.json', state);
    if (mode === 'next') console.log(`NEXT_ALLOWED_ACTION: ${state.nextAction}`);
    else console.log(`STATE: ${state.status}\nBRANCH: ${state.branch || '-'}\nCOMMIT: ${state.head || '-'}\nREADY FOR LIVE: NEIN\nHUMAN APPROVAL STORED: NEIN\nNEXT ACTION: ${state.nextAction}`);
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
    // Draft PRs are collaboration artifacts, not deployment approvals. CI
    // repeats the same safe static checks; Storefront/Full-QA stays governed
    // by the routed task and is mandatory again before Preview or Live.
    const validation = validate({ staticOnly: true });
    const title = String(args.title ?? current.branch.replace(/^(feature|fix|chore)\//, '').replaceAll('-', ' ')).trim();
    const existing = requireSuccess(run(commandName('gh'), ['pr', 'list', '--head', current.branch, '--base', OFFICIAL_BASE, '--state', 'open', '--json', 'number,url'], { timeoutMs: 60_000 }), 'gh pr list');
    const existingPr = JSON.parse(existing.stdout)[0];
    const pr = existingPr ?? (() => {
      const created = requireSuccess(run(commandName('gh'), ['pr', 'create', '--draft', '--base', OFFICIAL_BASE, '--head', current.branch, '--title', title, '--body', 'Static checks passed via npm run workflow:pr. Routed Storefront/Full-QA remains separate. Human approval is required before merge.'], { timeoutMs: 60_000 }), 'gh pr create');
      return { url: created.stdout.trim() };
    })();
    validation.workflow = 'pr'; validation.pr = pr; validation.readyForPr = true;
    writeRuntimeReport(root, 'latest.json', validation); printSummary(validation); console.log(`PR: ${pr.url}`); return validation;
  }

  if (mode === 'scratch') {
    // Wegwerf-Lane zum Ausprobieren: laeuft aus jedem Branch und auch mit
    // uncommitteten Aenderungen, schreibt dafuer keine Evidence. Siehe
    // assertScratchGate fuer die drei Bedingungen, die trotzdem gelten.
    const store = String(args.store ?? DEFAULT_STORE);
    const themeId = args['theme-id'];
    const previewEvidence = readRuntimeJson('preview.json');
    const themes = dryRun ? [{ id: themeId, role: 'unpublished', name: 'dry-run-scratch' }, { id: 'live', role: 'live' }] : themeList(store);
    const { theme, liveTheme } = selectThemeTargets(themes, themeId);
    assertScratchGate({ themeId, theme, liveTheme, previewEvidence });

    if (dryRun) {
      const summary = createDryRunSummary('scratch', { themeId: String(themeId), themeName: theme.name });
      printSummary(summary);
      return summary;
    }

    // Der eine Check, der auch hier laufen muss: ungueltiges Liquid verwirft
    // Shopify beim Push still, danach fehlt die Datei im Theme.
    requireSuccess(run(process.execPath, ['qa/run-liquid-guard.mjs']), 'Liquid Guard');
    requireSuccess(run(process.execPath, ['qa/run-schema-guard.mjs']), 'Schema Guard');

    const pushed = requireSuccess(
      run(commandName('shopify'), previewPushArgs({ store, themeId, root }), { timeoutMs: 5 * 60_000 }),
      'Shopify scratch push',
    );
    let payload;
    try { payload = JSON.parse(pushed.stdout); } catch { throw new WorkflowGateError('Shopify Scratch Push lieferte ungültiges JSON', 'SCRATCH_OUTPUT'); }
    if (payload?.theme?.role !== 'unpublished') throw new WorkflowGateError('Scratch-Theme ist nach Push nicht unpublished', 'SCRATCH_ROLE');

    const current = context();
    console.log([
      `WORKFLOW: SCRATCH`,
      `BRANCH: ${current.branch}`,
      `COMMIT: ${current.head}${current.clean ? '' : ' (+ uncommittete Aenderungen)'}`,
      `THEME: ${theme.name} (${themeId})`,
      `PREVIEW URL: ${payload?.theme?.preview_url ?? '-'}`,
      `EVIDENCE: KEINE - diese Lane taugt nicht fuer Preview oder Live`,
    ].join('\n'));
    return { workflow: 'scratch', themeId: String(themeId), status: 'PASS' };
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
