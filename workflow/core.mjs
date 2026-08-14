import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const OFFICIAL_BASE = 'main';
export const BRANCH_PATTERN = /^(feature|fix|chore)\/[a-z0-9][a-z0-9._-]*$/;
export const APPROVAL_TEXT = 'PUBLISH LIVE';
export const DEFAULT_STORE = 'sjjyq1-6w.myshopify.com';
export const THEME_PATHS = Object.freeze(['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates']);
export const DEFAULT_TIMEOUT_MS = 20 * 60_000;

export class WorkflowGateError extends Error {
  constructor(message, code = 'WORKFLOW_GATE') {
    super(message);
    this.name = 'WorkflowGateError';
    this.code = code;
  }
}

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawName, inline] = token.slice(2).split(/=(.*)/s, 2);
    if (inline !== undefined) values[rawName] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) values[rawName] = argv[++index];
    else values[rawName] = true;
  }
  return values;
}

export function commandName(name, platform = process.platform) {
  return platform === 'win32' && ['gh', 'npm', 'shopify'].includes(name) ? `${name}.cmd` : name;
}

export function runBounded(command, args, { cwd, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS, maxBuffer = 20 * 1024 * 1024 } = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, { cwd, env, timeout: timeoutMs, maxBuffer, encoding: 'utf8', shell: false, windowsHide: true });
  return {
    command,
    args,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal ?? null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    spawnError: result.error ? { name: result.error.name, code: result.error.code ?? null, message: result.error.message } : null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function requireSuccess(result, label) {
  if (result.spawnError?.code === 'ENOENT') throw new WorkflowGateError(`${label} fehlt oder ist nicht im PATH`, 'MISSING_COMMAND');
  if (result.timedOut) throw new WorkflowGateError(`${label} überschritt den Hard-Timeout`, 'TIMEOUT');
  if (result.exitCode !== 0) throw new WorkflowGateError(`${label} fehlgeschlagen (Exit ${result.exitCode ?? 'unknown'})`, 'COMMAND_FAILED');
  return result;
}

function testFiles(root, directory) {
  return fs.readdirSync(path.join(root, directory)).filter(name => name.endsWith('.test.mjs')).sort().map(name => path.join(directory, name));
}

export function validationSteps(root) {
  return [
    { id: 'UNIT', label: 'QA Unit Tests', command: process.execPath, args: ['--test', ...testFiles(root, 'qa/tests')] },
    { id: 'AUTOMATION', label: 'Automation Tests', command: process.execPath, args: ['--test', ...testFiles(root, 'automation/tests')] },
    { id: 'WORKFLOW_TESTS', label: 'Workflow Tests', command: process.execPath, args: ['--test', ...testFiles(root, 'workflow/tests')] },
    { id: 'QA_EVIDENCE', label: 'QA Evidence', command: process.execPath, args: ['--test', 'qa/tests/evidence-filter.test.mjs', 'qa/tests/url-sanitizer.test.mjs', 'qa/tests/console-classification.test.mjs', 'qa/tests/browser-infra.test.mjs'] },
    { id: 'SECRET_SCAN', label: 'Secret Scan', command: process.execPath, args: ['automation/scripts/secret-scan.mjs'] },
    { id: 'COMPARE', label: 'Compare', command: process.execPath, args: ['qa/run-compare-check.mjs'], browser: true },
    { id: 'SEO', label: 'SEO', command: process.execPath, args: ['qa/run-seo-check.mjs'], browser: true },
    { id: 'FULL_QA', label: 'Full QA', command: process.execPath, args: ['qa/run-qa.mjs'], browser: true },
    { id: 'SALES', label: 'Sales', command: process.execPath, args: ['qa/run-sales-readiness.mjs'], browser: true, sales: true },
  ];
}

export const REQUIRED_LOCAL_EVIDENCE_STEPS = Object.freeze(['COMPARE', 'SEO', 'FULL_QA', 'SALES']);

// The gate that blocks merge on missing local-only evidence (Compare/SEO/Full
// QA/Sales require live-storefront network access CI does not have) must bind
// evidence to the exact commit under review. Without this, one real local run
// could be committed once and silently replayed as "proof" for every future
// commit on the branch, including commits that never actually re-ran the
// checks it claims to cover.
export function verifyLocalEvidence({ evidence, expectedCommit, expectedBranch = null, requiredSteps = REQUIRED_LOCAL_EVIDENCE_STEPS }) {
  if (!expectedCommit) throw new WorkflowGateError('Erwarteter Commit (PR HEAD SHA) fehlt für die Evidence-Prüfung', 'EVIDENCE_NO_TARGET');
  if (!evidence || typeof evidence !== 'object') throw new WorkflowGateError('Evidence-Datei fehlt oder ist ungültig', 'EVIDENCE_MISSING');
  if (evidence.commit !== expectedCommit) throw new WorkflowGateError(`Evidence-Commit (${evidence.commit ?? '-'}) stimmt nicht mit dem aktuellen HEAD (${expectedCommit}) überein - Evidence ist veraltet oder gehört zu einem anderen Commit`, 'EVIDENCE_STALE');
  if (expectedBranch && evidence.branch !== expectedBranch) throw new WorkflowGateError(`Evidence-Branch (${evidence.branch ?? '-'}) stimmt nicht mit dem erwarteten Branch (${expectedBranch}) überein`, 'EVIDENCE_BRANCH_MISMATCH');
  if (evidence.status !== 'PASS') throw new WorkflowGateError(`Evidence-Status ist nicht PASS: ${evidence.status ?? '-'}`, 'EVIDENCE_NOT_PASS');
  if (String(evidence.p0) !== '0' || String(evidence.p1) !== '0') throw new WorkflowGateError(`Evidence P0/P1 sind nicht explizit 0 (P0=${evidence.p0 ?? '-'}, P1=${evidence.p1 ?? '-'})`, 'EVIDENCE_FINDINGS');
  if (evidence.orderCompleted !== false) throw new WorkflowGateError('Evidence orderCompleted ist nicht false', 'EVIDENCE_ORDER_COMPLETED');
  const byId = Object.fromEntries((Array.isArray(evidence.results) ? evidence.results : []).map(item => [item.id, item.status]));
  const missing = requiredSteps.filter(id => byId[id] !== 'PASS');
  if (missing.length > 0) throw new WorkflowGateError(`Evidence fehlt PASS für erforderliche Schritte: ${missing.join(', ')}`, 'EVIDENCE_STEP_MISSING');
  return true;
}

export function verifySalesReport(report, expectedFlows = 6) {
  if (!report || typeof report !== 'object') throw new WorkflowGateError('Sales-Report fehlt', 'SALES_EVIDENCE');
  if (report.orderCompleted !== false) throw new WorkflowGateError('Sales-Report ist nicht fail-closed: orderCompleted muss false sein', 'ORDER_COMPLETED');
  if (!Array.isArray(report.results) || report.results.length !== expectedFlows) throw new WorkflowGateError(`Sales-Report muss ${expectedFlows} Flows enthalten`, 'SALES_EVIDENCE');
  if (report.results.some(item => item.status !== 'PASS' || item.orderCompleted !== false)) throw new WorkflowGateError('Mindestens ein Sales-Flow ist nicht PASS oder meldet orderCompleted != false', 'SALES_FAILED');
  if (report.summary?.passed !== expectedFlows || report.summary?.failed !== 0) throw new WorkflowGateError('Sales-Zusammenfassung ist nicht 6/6 PASS', 'SALES_FAILED');
  return true;
}

export function runValidation({ root, dryRun = false, staticOnly = false, baseUrl = null, run = runBounded, now = () => Date.now() }) {
  const selected = validationSteps(root).filter(step => !staticOnly || !step.browser);
  const summary = { workflow: 'validate', status: dryRun ? 'DRY_RUN' : 'PASS', commit: null, branch: null, orderCompleted: false, results: [] };
  for (const step of selected) {
    if (dryRun) {
      summary.results.push({ id: step.id, status: 'SKIPPED_DRY_RUN' });
      continue;
    }
    const salesPath = path.join(root, 'qa/results/sales-readiness.json');
    const salesStarted = now();
    const env = { ...process.env, WORKFLOW_REPORT_DIR: path.join(root, '.workflow/reports') };
    if (baseUrl) env.WORKFLOW_BASE_URL = baseUrl;
    const result = run(step.command, step.args, { cwd: root, env });
    const status = result.exitCode === 0 && !result.spawnError && !result.timedOut ? 'PASS' : 'FAIL';
    summary.results.push({ id: step.id, status, exitCode: result.exitCode, timedOut: result.timedOut, errorClass: result.spawnError?.name ?? null });
    if (status !== 'PASS') {
      summary.status = 'FAIL';
      throw Object.assign(new WorkflowGateError(`${step.label} fehlgeschlagen`, 'VALIDATION_FAILED'), { summary, commandResult: result });
    }
    if (step.sales) {
      const stat = fs.existsSync(salesPath) ? fs.statSync(salesPath) : null;
      if (!stat || stat.mtimeMs + 1000 < salesStarted) throw new WorkflowGateError('Sales-Evidence wurde nicht frisch erzeugt', 'SALES_EVIDENCE');
      verifySalesReport(JSON.parse(fs.readFileSync(salesPath, 'utf8')));
    }
  }
  return summary;
}

export function requireZeroFindings({ p0, p1 }) {
  if (String(p0) !== '0' || String(p1) !== '0') throw new WorkflowGateError('P0 und P1 müssen explizit 0 sein', 'FINDINGS_BLOCK');
}

export function findingsAreClear({ p0, p1 }) {
  return String(p0) === '0' && String(p1) === '0';
}

export function createDryRunSummary(workflow, values = {}) {
  return { workflow, status: 'DRY_RUN', ...values, orderCompleted: false, results: [], readyForPr: false, readyForMain: false, readyForPreview: false, readyForLive: false };
}

export function assertPrGate({ branch, base = OFFICIAL_BASE, p0, p1, clean, head, remoteHead }) {
  if (!BRANCH_PATTERN.test(branch) || branch === OFFICIAL_BASE) throw new WorkflowGateError('PR-Workflow verweigert main oder ungültigen Branch-Namen', 'BRANCH_BLOCK');
  if (base !== OFFICIAL_BASE) throw new WorkflowGateError('PR-Base muss main sein', 'BASE_BLOCK');
  requireZeroFindings({ p0, p1 });
  if (!clean) throw new WorkflowGateError('PR-Erstellung erfordert einen sauberen Working Tree', 'DIRTY_TREE');
  if (!head || head !== remoteHead) throw new WorkflowGateError('Lokaler HEAD muss vollständig auf dem gleichnamigen Remote-Branch liegen', 'UNPUSHED_HEAD');
  return true;
}

export function parseThemeList(result) {
  if (result.spawnError?.code === 'ENOENT') throw new WorkflowGateError('Shopify CLI fehlt', 'MISSING_SHOPIFY');
  if (result.exitCode !== 0) {
    const text = `${result.stdout}\n${result.stderr}`;
    if (/log in|login|auth/i.test(text)) throw new WorkflowGateError('Shopify-Authentifizierung fehlt', 'MISSING_SHOPIFY_AUTH');
    throw new WorkflowGateError('Shopify Theme-Liste konnte nicht gelesen werden', 'SHOPIFY_LIST_FAILED');
  }
  try {
    const themes = JSON.parse(result.stdout);
    if (!Array.isArray(themes)) throw new Error('not array');
    return themes;
  } catch {
    throw new WorkflowGateError('Shopify Theme-Liste lieferte ungültiges JSON', 'SHOPIFY_OUTPUT');
  }
}

export function selectThemeTargets(themes, themeId) {
  const targets = themes.filter(item => String(item.id) === String(themeId));
  const liveThemes = themes.filter(item => item.role === 'live');
  if (targets.length !== 1) throw new WorkflowGateError('Theme-ID ist nicht eindeutig vorhanden', 'THEME_ID_AMBIGUOUS');
  if (liveThemes.length !== 1) throw new WorkflowGateError('Live-Theme ist nicht eindeutig bestimmbar', 'LIVE_THEME_AMBIGUOUS');
  return { theme: targets[0], liveTheme: liveThemes[0] };
}

export function assertPreviewGate({ branch, head, originMain, clean, p0, p1, approved, theme, liveTheme }) {
  if (branch !== OFFICIAL_BASE || head !== originMain) throw new WorkflowGateError('Preview muss exakt aus aktuellem origin/main entstehen', 'PREVIEW_SOURCE');
  if (!clean) throw new WorkflowGateError('Preview erfordert einen sauberen Working Tree', 'DIRTY_TREE');
  requireZeroFindings({ p0, p1 });
  if (!approved) throw new WorkflowGateError('Preview benötigt --approve-preview', 'PREVIEW_APPROVAL');
  if (!theme || theme.role !== 'unpublished') throw new WorkflowGateError('Preview-Theme muss eindeutig unpublished sein', 'PREVIEW_ROLE');
  if (liveTheme && String(theme.id) === String(liveTheme.id)) throw new WorkflowGateError('Live-Theme darf niemals Preview-Ziel sein', 'LIVE_THEME_BLOCK');
  return true;
}

export function assertLiveGate({ branch, head, originMain, clean, p0, p1, approved, approvalText, execute, previewEvidence, theme, liveTheme }) {
  if (branch !== OFFICIAL_BASE || head !== originMain) throw new WorkflowGateError('Live-Publish muss exakt aus aktuellem origin/main erfolgen', 'LIVE_SOURCE');
  if (!clean) throw new WorkflowGateError('Live-Publish erfordert einen sauberen Working Tree', 'DIRTY_TREE');
  requireZeroFindings({ p0, p1 });
  if (!approved || approvalText !== APPROVAL_TEXT || !execute) throw new WorkflowGateError(`Live bleibt gesperrt: --approve-live --approval-text "${APPROVAL_TEXT}" --execute erforderlich`, 'LIVE_APPROVAL');
  if (!previewEvidence || previewEvidence.status !== 'PASS' || previewEvidence.commit !== originMain || !previewEvidence.settingsDataProtected || previewEvidence.previewDiffCount !== 0) throw new WorkflowGateError('Passende Preview-Evidence für origin/main fehlt', 'PREVIEW_EVIDENCE');
  if (!theme || theme.role !== 'unpublished' || String(theme.id) !== String(previewEvidence.themeId)) throw new WorkflowGateError('Freigegebenes Preview-Theme ist nicht mehr unpublished', 'PREVIEW_ROLE');
  if (liveTheme && String(theme.id) === String(liveTheme.id)) throw new WorkflowGateError('Aktuelles Live-Theme kann nicht als Preview-Evidence dienen', 'LIVE_THEME_BLOCK');
  return true;
}

export function previewPushArgs({ store, themeId, root }) {
  return ['theme', 'push', '--store', store, '--theme', String(themeId), '--path', root, '--strict', '--nodelete', '--ignore', 'config/settings_data.json', '--json'];
}

export function verifyPreviewPayload(payload, themeId) {
  if (!payload?.theme || String(payload.theme.id) !== String(themeId) || payload.theme.role !== 'unpublished') throw new WorkflowGateError('Shopify Push-Ausgabe bestätigt kein passendes unpublished Theme', 'PREVIEW_OUTPUT');
  let url;
  try { url = new URL(payload.theme.preview_url); } catch { throw new WorkflowGateError('Shopify Push-Ausgabe enthält keine gültige Preview-URL', 'PREVIEW_OUTPUT'); }
  if (url.protocol !== 'https:' || url.searchParams.get('preview_theme_id') !== String(themeId)) throw new WorkflowGateError('Preview-URL ist nicht eindeutig an die Theme-ID gebunden', 'PREVIEW_OUTPUT');
  return url.href;
}

export function livePublishArgs({ store, themeId, root }) {
  return ['theme', 'publish', '--store', store, '--theme', String(themeId), '--path', root, '--force'];
}

export function writeJsonAtomic(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, name);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, target);
  return target;
}

export function writeRuntimeReport(root, name, value) {
  return writeJsonAtomic(path.join(root, '.workflow'), name, value);
}

// Unlike writeRuntimeReport (.workflow/, gitignored, local-only), this writes
// into qa/evidence/, which is tracked by git. A full non-static validation
// PASS is copied here so it can be committed and reach CI, where the
// local-verification-gate job checks it against the exact PR HEAD commit.
export function writeTrackedEvidence(root, value) {
  return writeJsonAtomic(path.join(root, 'qa', 'evidence'), 'local-verification.json', value);
}

export function createPreviewTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tp-preview-'));
}

export function themeFileMap(root, { ignored = [] } = {}) {
  const ignoredSet = new Set(ignored);
  const map = new Map();
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(root, absolute).replaceAll('\\', '/');
        if (!ignoredSet.has(relative)) map.set(relative, createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'));
      }
    }
  };
  THEME_PATHS.forEach(directory => visit(path.join(root, directory)));
  return map;
}

export function compareThemeMaps(expected, actual) {
  const mainOnly = [...expected.keys()].filter(file => !actual.has(file)).sort();
  const previewOnly = [...actual.keys()].filter(file => !expected.has(file)).sort();
  const different = [...expected.keys()].filter(file => actual.has(file) && expected.get(file) !== actual.get(file)).sort();
  return { mainOnly, previewOnly, different, differenceCount: mainOnly.length + previewOnly.length + different.length };
}

export function verifyPreviewSnapshot({ root, pulledRoot, evidence }) {
  if (!evidence || evidence.status !== 'PASS' || !evidence.settingsDataProtected || evidence.previewDiffCount !== 0) {
    throw new WorkflowGateError('Verifizierte Preview-Evidence fehlt', 'PREVIEW_EVIDENCE');
  }
  const ignored = ['config/settings_data.json'];
  const comparison = compareThemeMaps(themeFileMap(root, { ignored }), themeFileMap(pulledRoot, { ignored }));
  if (comparison.differenceCount !== 0) {
    throw Object.assign(new WorkflowGateError('Preview ist seit der Verifikation von origin/main abgewichen', 'PREVIEW_DRIFT'), { comparison });
  }
  const currentSettingsHash = fileSha256(path.join(pulledRoot, 'config/settings_data.json'));
  if (!evidence.settingsDataSha256 || currentSettingsHash !== evidence.settingsDataSha256) {
    throw new WorkflowGateError('Preview settings_data.json ist seit der Verifikation abgewichen', 'PREVIEW_SETTINGS_DRIFT');
  }
  return true;
}

export function deriveWorkflowState({ branch, head, originMain, clean, latest }) {
  const evidenceCurrent = latest?.status === 'PASS' && latest?.commit === head && latest?.branch === branch;
  const base = { branch, head, originMain, clean, evidenceCurrent, readyForLive: false, humanApprovalStored: false };
  if (!clean || !head || !branch) return { ...base, status: 'STOP_REVIEW', nextAction: 'STOP/REVIEW: Repository-Zustand ist unklar oder nicht sauber.' };
  if (!evidenceCurrent) return { ...base, status: 'STOP_REVIEW', nextAction: 'STOP/REVIEW: Validierung für den aktuellen Branch und Commit fehlt oder ist veraltet.' };
  if (branch !== OFFICIAL_BASE) return { ...base, status: 'VALIDATED_BRANCH', nextAction: 'Draft-PR gegen main vorbereiten; Human Approval vor Merge erforderlich.' };
  if (head !== originMain) return { ...base, status: 'STOP_REVIEW', nextAction: 'STOP/REVIEW: Lokales main entspricht nicht origin/main.' };
  return { ...base, status: 'VALIDATED_MAIN', nextAction: 'Preview separat vorbereiten; Human Approval vor Preview und erneut vor Live erforderlich.' };
}

export function fileSha256(filePath) {
  if (!fs.existsSync(filePath)) throw new WorkflowGateError(`Erwartete Datei fehlt: ${path.basename(filePath)}`, 'PREVIEW_SETTINGS');
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
