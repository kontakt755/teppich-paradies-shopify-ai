import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deriveHandoffState } from '../workflow/router.mjs';

const UNKNOWN = 'UNKNOWN';
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const SECRET_KEY = /(?:token|secret|password|passwd|authorization|cookie|private[_-]?key|client[_-]?secret|access[_-]?key)/i;

const JSON_SOURCES = Object.freeze({
  task: '.workflow/task.json',
  state: '.workflow/state.json',
  latest: '.workflow/latest.json',
  review: '.workflow/review.json',
  preview: '.workflow/preview.json',
  trackedEvidence: 'qa/evidence/local-verification.json',
  latestFailure: 'qa/evidence/latest-failure.json',
  compare: 'qa/results/compare-readiness.json',
  fullQa: 'qa/results/latest.json',
  sales: 'qa/results/sales-readiness.json',
  seo: 'qa/results/seo-latest.json',
});

const PREVIEW_ROOTS = Object.freeze([
  '.workflow/previews',
  'automation/previews',
  'qa/previews',
  'data/previews',
  'prepared-previews',
]);

const PREVIEW_FILES = Object.freeze([
  '.workflow/write-preview.json',
  '.workflow/planned-writes.json',
  '.workflow/dry-run.json',
  'automation/write-preview.json',
  'automation/planned-writes.json',
  'qa/write-preview.json',
]);

function redactString(value) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:access[_-]?token|token|session|signature|api[_-]?key|secret)=)[^&#\s]*/gi, '$1[REDACTED]')
    .replace(/((?:access[_-]?token|api[_-]?key|client[_-]?secret|password|secret)\s*[:=]\s*["']?)[^"'\s&,}]+/gi, '$1[REDACTED]')
    .replace(/\b(?:shpat_|shpca_|ghp_|github_pat_|sk-)[A-Za-z0-9_-]{12,}\b/gi, '[REDACTED]');
}

function safeResolve(root, relative) {
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, relative);
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Path outside repository: ${relative}`);
  }
  return absolute;
}

function redact(value, seen = new WeakSet()) {
  if (typeof value === 'string') return redactString(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[REDACTED_CYCLE]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => redact(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) ? '[REDACTED]' : redact(item, seen),
  ]));
}

function readJson(root, relative) {
  const absolute = safeResolve(root, relative);
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return null;
    return { data: redact(JSON.parse(fs.readFileSync(absolute, 'utf8'))), relative, mtime: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers = [], ...values] = rows;
  return values.map(cells => Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index] ?? ''])));
}

function readPreview(root, relative) {
  if (!/\.csv$/i.test(relative)) return readJson(root, relative);
  const absolute = safeResolve(root, relative);
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return null;
    return { data: redact(parseCsv(fs.readFileSync(absolute, 'utf8'))), relative, mtime: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

function readTextMeta(root, relative) {
  const absolute = safeResolve(root, relative);
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return null;
    return { relative, mtime: stat.mtime.toISOString(), available: true };
  } catch {
    return null;
  }
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

function gitRaw(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, timeout: 5_000, maxBuffer: 20 * 1024 * 1024 });
  } catch {
    return Buffer.alloc(0);
  }
}

function changedFilesSince(root, commit = null) {
  const files = new Set();
  const collect = value => value.split('\n').map(line => line.trim()).filter(Boolean).forEach(file => files.add(file));
  if (commit) collect(git(root, ['diff', '--name-only', commit, 'HEAD']));
  collect(git(root, ['diff', '--name-only']));
  collect(git(root, ['diff', '--name-only', '--cached']));
  collect(git(root, ['ls-files', '--others', '--exclude-standard']));
  return [...files].sort();
}

function worktreeFingerprint(root) {
  const evidencePath = 'qa/evidence/local-verification.json';
  const diff = gitRaw(root, ['diff', '--binary', 'HEAD', '--', '.', `:(exclude)${evidencePath}`]);
  const untracked = gitRaw(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', `:(exclude)${evidencePath}`]).toString('utf8').split('\0').filter(Boolean).sort();
  const hash = createHash('sha256').update(diff);
  let bytes = diff.length;
  for (const file of untracked) {
    const absolute = safeResolve(root, file);
    const stat = fs.lstatSync(absolute);
    bytes += stat.size;
    if (bytes > 20 * 1024 * 1024) return null;
    const content = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(absolute)) : fs.readFileSync(absolute);
    hash.update(file).update('\0').update(content).update('\0');
  }
  return hash.digest('hex');
}

function cleanStatus(value) {
  const known = new Set(['WAITING', 'RUNNING', 'PASS', 'FAIL', 'BLOCKED_EXTERNAL', 'NEEDS_LOCAL_RUNNER', 'HUMAN_GATE', 'SKIPPED']);
  return known.has(value) ? value : UNKNOWN;
}

function mappedValidationStatus(value) {
  if (value === 'PASS') return 'PASS';
  if (value === 'FAIL') return 'FAIL';
  if (value === 'STALE_OR_NOT_RUN' || value === 'NOT_RUN') return 'WAITING';
  return UNKNOWN;
}

function attemptsFrom(...sources) {
  const attempts = sources.flatMap(source => Array.isArray(source?.results) ? source.results.map(item => Number(item.attempts) || 0) : []);
  return attempts.length ? attempts.reduce((sum, count) => sum + Math.max(0, count - 1), 0) : 0;
}

function evidenceStatus(source, stepId, currentCommit, currentBranch) {
  if (!source) return { status: UNKNOWN, stale: false, timestamp: null, commit: null, file: null };
  const value = stepId
    ? (Array.isArray(source.data?.results) ? source.data.results.find(item => item.id === stepId)?.status : null)
    : source.data?.status;
  const commit = source.data?.commit ?? source.data?.head ?? null;
  const branch = source.data?.branch ?? null;
  const stale = Boolean((commit && commit !== currentCommit) || (branch && branch !== currentBranch));
  return {
    status: value === 'PASS' ? 'PASS' : value === 'FAIL' ? 'FAIL' : UNKNOWN,
    stale,
    timestamp: source.data?.createdAt ?? source.data?.finishedAt ?? source.data?.updatedAt ?? source.mtime,
    commit,
    file: source.relative,
  };
}

function statusFromReport(source) {
  if (!source) return UNKNOWN;
  const status = source.data?.status ?? source.data?.summary?.status;
  return status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : UNKNOWN;
}

function normalizeChange(item, source) {
  if (!item || typeof item !== 'object') return null;
  const current = item.current ?? item.before ?? item.old ?? item.ist ?? item.oldValue ?? null;
  const planned = item.planned ?? item.after ?? item.new ?? item.soll ?? item.newValue ?? item.value ?? null;
  return {
    object: item.object ?? item.product ?? item.productTitle ?? item.title ?? item.handle ?? UNKNOWN,
    sku: item.sku ?? item.variantSku ?? UNKNOWN,
    field: item.field ?? item.path ?? item.attribute ?? item.key ?? UNKNOWN,
    current: current ?? UNKNOWN,
    planned: planned ?? UNKNOWN,
    difference: item.difference ?? item.diff ?? item.delta ?? (typeof current === 'number' && typeof planned === 'number' ? Number((planned - current).toFixed(6)) : UNKNOWN),
    risk: item.risk ?? UNKNOWN,
    status: item.status ?? 'PLANNED',
    source,
  };
}

function extractChanges(data, source) {
  const candidates = [data?.changes, data?.plannedWrites, data?.writes, data?.items, data?.products, Array.isArray(data) ? data : null];
  const list = candidates.find(Array.isArray) ?? [];
  return list.map(item => normalizeChange(item, source)).filter(Boolean);
}

function previewSources(root) {
  const files = new Set(PREVIEW_FILES);
  for (const directory of PREVIEW_ROOTS) {
    const absolute = safeResolve(root, directory);
    try {
      for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        if (entry.isFile() && /\.(json|csv)$/i.test(entry.name)) files.add(`${directory}/${entry.name}`);
      }
    } catch {}
  }
  return [...files].sort().map(relative => readPreview(root, relative)).filter(Boolean);
}

function blockerDetails(state, latest, failure) {
  const blocker = state?.externalBlock ?? latest?.externalBlock ?? failure?.blocker ?? null;
  const allowed = new Set(['BLOCKED_EXTERNAL_RATE_LIMIT', 'BLOCKED_EXTERNAL_UPSTREAM', 'NEEDS_LOCAL_RUNNER', 'CODE_DEFECT', 'UNKNOWN_BLOCKER']);
  const lastError = latest?.error?.message ?? failure?.error?.message ?? failure?.message ?? null;
  return {
    type: blocker && allowed.has(blocker) ? blocker : blocker ? 'UNKNOWN_BLOCKER' : null,
    lastError: lastError ? String(lastError).slice(0, 500) : null,
  };
}

function creditProfile(route, state, review) {
  if (!route) return UNKNOWN;
  if (route.modelTier === 'NONE' && route.implementer === 'SCRIPT') return 'SCRIPT_ONLY';
  if (route.modelTier === 'LIGHT') return 'LOW';
  if (route.modelTier === 'STRONG_ONLY_FOR_AMBIGUITY') return review?.status === 'PASS' ? 'HIGH' : 'MEDIUM';
  if (route.modelTier === 'STRONG') return 'HIGH';
  if (state?.executionMode === 'DETERMINISTIC_SCRIPT_FIRST') return 'SCRIPT_ONLY';
  return UNKNOWN;
}

export function buildControlCenterState(root, now = () => new Date()) {
  const loaded = Object.fromEntries(Object.entries(JSON_SOURCES).map(([key, relative]) => [key, readJson(root, relative)]));
  const task = loaded.task?.data ?? null;
  const latest = loaded.latest?.data ?? null;
  const review = loaded.review?.data ?? null;
  const failure = loaded.latestFailure?.data ?? null;
  const currentBranch = git(root, ['branch', '--show-current']) || UNKNOWN;
  const currentCommit = git(root, ['rev-parse', 'HEAD']) || UNKNOWN;
  const shortCommit = currentCommit === UNKNOWN ? UNKNOWN : currentCommit.slice(0, 10);
  const changedFiles = git(root, ['status', '--porcelain=v1']).split('\n').filter(Boolean).map(line => line.slice(3));
  const fingerprint = currentCommit === UNKNOWN ? null : worktreeFingerprint(root);
  const derivedState = task && currentBranch !== UNKNOWN && currentCommit !== UNKNOWN && fingerprint
    ? deriveHandoffState({
      route: task,
      repo: { branch: currentBranch, head: currentCommit, worktreeFingerprint: fingerprint },
      latest,
      review,
      changedFiles: changedFilesSince(root, task.routedAtHead),
      latestChangedFiles: latest?.commit ? changedFilesSince(root, latest.commit) : null,
      pr: latest?.pr ?? null,
      now: () => now().toISOString(),
    })
    : null;
  const state = derivedState ?? loaded.state?.data ?? null;
  const previews = previewSources(root);
  const changes = previews.flatMap(source => extractChanges(source.data, source.relative));
  const odenseSources = previews.filter(source => /odense/i.test(JSON.stringify(source.data)));
  const validationStatus = mappedValidationStatus(state?.validationStatus ?? latest?.status);
  const blocker = blockerDetails(state, latest, failure);
  const evidence = {
    localVerification: evidenceStatus(loaded.trackedEvidence, null, currentCommit, currentBranch),
    qaCompare: loaded.compare ? evidenceStatus(loaded.compare, null, currentCommit, currentBranch) : evidenceStatus(loaded.trackedEvidence, 'COMPARE', currentCommit, currentBranch),
    fullQa: loaded.fullQa ? evidenceStatus(loaded.fullQa, null, currentCommit, currentBranch) : evidenceStatus(loaded.trackedEvidence, 'FULL_QA', currentCommit, currentBranch),
    salesReadiness: loaded.sales ? evidenceStatus(loaded.sales, null, currentCommit, currentBranch) : evidenceStatus(loaded.trackedEvidence, 'SALES', currentCommit, currentBranch),
    secretScan: evidenceStatus(loaded.trackedEvidence, 'SECRET_SCAN', currentCommit, currentBranch),
    securityReview: review?.type === 'SECURITY' ? evidenceStatus(loaded.review, null, currentCommit, currentBranch) : { status: UNKNOWN, stale: false, timestamp: null, commit: null, file: null },
    secondModelReview: evidenceStatus(loaded.review, null, currentCommit, currentBranch),
  };
  const reviewRequired = Boolean(state?.reviewRequired ?? task?.reviewRequired);
  const reviewStatus = state?.reviewStatus ?? (reviewRequired ? 'REQUIRED' : 'NOT_REQUIRED');
  const executionObserved = changedFiles.length > 0 || (task?.routedAtHead && task.routedAtHead !== currentCommit);
  const humanGateRequired = state?.humanGate === 'REQUIRED_FOR_PROTECTED_ACTION' || Boolean(task?.humanGateRequired);
  const writeRequired = Boolean(state?.shopifyWriteRequired ?? task?.shopifyWriteRequired);
  const timestamp = state?.updatedAt ?? task?.routedAt ?? null;
  const pipeline = [
    { id: 'task', label: 'Task', status: task ? 'PASS' : 'WAITING', description: task?.taskText ?? 'Kein aktueller Task geladen', timestamp: task?.routedAt ?? null, role: 'HUMAN', file: loaded.task?.relative ?? null },
    { id: 'router', label: 'Router', status: task ? 'PASS' : 'WAITING', description: task ? `${task.taskClass ?? UNKNOWN} · ${task.executionMode ?? UNKNOWN}` : 'Router-State fehlt', timestamp: task?.routedAt ?? null, role: 'AI ROUTER', file: loaded.task?.relative ?? null },
    { id: 'execution', label: 'Execution', status: cleanStatus(validationStatus === 'PASS' ? 'PASS' : executionObserved ? 'RUNNING' : 'WAITING'), description: executionObserved ? `${changedFiles.length} lokale Änderung(en) erkannt` : 'Noch keine Implementierung erkannt', timestamp, role: task?.implementer ?? UNKNOWN, file: state ? loaded.state?.relative : loaded.task?.relative },
    { id: 'validation', label: 'Validation', status: blocker.type === 'NEEDS_LOCAL_RUNNER' ? 'NEEDS_LOCAL_RUNNER' : blocker.type?.startsWith('BLOCKED_EXTERNAL') ? 'BLOCKED_EXTERNAL' : cleanStatus(validationStatus), description: state?.validationStatus ?? 'Kein aktueller Testreport', timestamp: latest?.finishedAt ?? latest?.updatedAt ?? null, role: state?.localRunnerRequired ? 'LOCAL RUNNER' : 'SCRIPT', file: loaded.latest?.relative ?? loaded.trackedEvidence?.relative ?? null },
    { id: 'review', label: 'Review', status: reviewRequired ? (reviewStatus === 'PASS' ? 'PASS' : 'WAITING') : 'SKIPPED', description: reviewRequired ? reviewStatus : 'Kein Second Model Review erforderlich', timestamp: review?.updatedAt ?? review?.createdAt ?? null, role: state?.reviewer ?? task?.reviewer ?? UNKNOWN, file: loaded.review?.relative ?? null },
    { id: 'audit', label: 'Admin Audit', status: evidence.securityReview.status === 'PASS' ? 'PASS' : UNKNOWN, description: evidence.securityReview.file ? 'Security-/Admin-Report geladen' : 'Kein separater Admin-Audit-Report', timestamp: evidence.securityReview.timestamp, role: 'ADMIN AUDIT', file: evidence.securityReview.file },
    { id: 'gate', label: 'Human Gate', status: humanGateRequired ? 'HUMAN_GATE' : 'SKIPPED', description: humanGateRequired ? 'Frische Freigabe für den aktuellen Commit erforderlich' : 'Für den aktuellen Task nicht erforderlich', timestamp, role: 'HUMAN', file: loaded.state?.relative ?? null },
    { id: 'write', label: 'Write', status: writeRequired ? 'HUMAN_GATE' : 'SKIPPED', description: writeRequired ? 'Write bleibt in Stufe 1 gesperrt' : 'Kein Shopify-Write geplant', timestamp: null, role: 'DEPLOYMENT', file: previews[0]?.relative ?? null },
    { id: 'verification', label: 'Verification', status: writeRequired ? 'WAITING' : 'SKIPPED', description: writeRequired ? 'Erst nach freigegebenem Write möglich' : 'Keine Nachprüfung nötig', timestamp: null, role: 'READ-ONLY CHECK', file: null },
  ];

  return {
    generatedAt: now().toISOString(),
    readOnly: true,
    repository: { branch: currentBranch, commit: currentCommit, shortCommit, pr: state?.pr ?? latest?.pr ?? null, changedFiles },
    summary: {
      currentTask: task?.taskText ?? UNKNOWN,
      taskId: state?.taskId ?? task?.taskId ?? UNKNOWN,
      taskClass: state?.taskClass ?? task?.taskClass ?? UNKNOWN,
      executionMode: state?.executionMode ?? task?.executionMode ?? UNKNOWN,
      primaryAgent: task?.implementer ?? UNKNOWN,
      modelUsed: UNKNOWN,
      modelTierPlanned: task?.modelTier ?? UNKNOWN,
      secondReviewRequired: reviewRequired,
      secondReviewer: reviewRequired ? (state?.reviewer ?? task?.reviewer ?? UNKNOWN) : 'NOT REQUIRED',
      localRunnerRequired: Boolean(state?.localRunnerRequired ?? task?.localRunnerRequired),
      scriptSteps: latest?.branch === currentBranch && latest?.commit === currentCommit && Array.isArray(latest.results) ? latest.results.length : UNKNOWN,
      aiSteps: UNKNOWN,
      externalBlocks: blocker.type ? 1 : 0,
      p0: state?.p0 ?? UNKNOWN,
      p1: state?.p1 ?? UNKNOWN,
      p2: latest?.p2 ?? review?.p2 ?? UNKNOWN,
      humanGate: humanGateRequired ? 'REQUIRED' : 'NOT REQUIRED',
      nextAllowedAction: state?.nextAllowedAction ?? UNKNOWN,
      validationStatus: state?.validationStatus ?? UNKNOWN,
      shopifyWriteRequired: writeRequired,
      shopifyWriteApproved: false,
      liveStatus: UNKNOWN,
    },
    pipeline,
    agentAudit: {
      intendedAgent: task?.implementer ?? UNKNOWN,
      actualAgent: task?.actualAgent ?? latest?.actualAgent ?? UNKNOWN,
      knownModel: task?.modelUsed ?? latest?.modelUsed ?? UNKNOWN,
      implementer: task?.implementer ?? UNKNOWN,
      reviewer: reviewRequired ? (state?.reviewer ?? task?.reviewer ?? UNKNOWN) : 'NOT REQUIRED',
      localRunner: state?.localRunnerRequired ? (latest?.runner ?? UNKNOWN) : 'NOT REQUIRED',
      aiSteps: UNKNOWN,
      scriptSteps: latest?.branch === currentBranch && latest?.commit === currentCommit && Array.isArray(latest.results) ? latest.results.length : UNKNOWN,
      externalBlockers: blocker.type ? [blocker.type] : [],
      retries: attemptsFrom(latest, failure),
    },
    credit: {
      profile: creditProfile(task, state, review),
      aiSteps: UNKNOWN,
      scriptSteps: latest?.branch === currentBranch && latest?.commit === currentCommit && Array.isArray(latest.results) ? latest.results.length : UNKNOWN,
      secondReviewUsed: review?.status === 'PASS' ? 'JA' : 'NEIN',
      strongModelUsed: task?.modelUsed || latest?.modelUsed ? (/strong|sonnet|opus|gpt-5/i.test(`${task?.modelUsed ?? ''} ${latest?.modelUsed ?? ''}`) ? 'JA' : 'NEIN') : UNKNOWN,
      tokens: UNKNOWN,
      credits: UNKNOWN,
    },
    humanGate: {
      required: humanGateRequired,
      readiness: humanGateRequired ? (validationStatus === 'PASS' && (!reviewRequired || reviewStatus === 'PASS') ? 'READY_FOR_HUMAN_REVIEW' : 'NOT_READY') : 'NOT_REQUIRED',
      reason: humanGateRequired ? 'Geschützte Aktion im aktuellen Router-State' : 'Keine geschützte Aktion im aktuellen Router-State',
      plannedAction: writeRequired ? 'SHOPIFY WRITE' : UNKNOWN,
      affected: changes.map(change => change.object).filter((value, index, list) => value !== UNKNOWN && list.indexOf(value) === index),
      findings: { p0: state?.p0 ?? UNKNOWN, p1: state?.p1 ?? UNKNOWN, p2: latest?.p2 ?? review?.p2 ?? UNKNOWN },
      plannedWrites: changes.length,
      commit: currentCommit,
      reviewStatus,
      evidenceStatus: evidence.localVerification.stale ? 'STALE' : evidence.localVerification.status,
      approvalStored: false,
    },
    plannedChanges: changes,
    odense: {
      loaded: odenseSources.length > 0,
      status: odenseSources.length ? 'LOADED_FROM_PROJECT_FILES' : 'NOT_LOADED',
      sources: odenseSources.map(source => source.relative),
      changes: changes.filter(change => /odense/i.test(JSON.stringify(change))),
    },
    evidence,
    externalBlock: {
      ...blocker,
      retries: attemptsFrom(latest, failure),
      nextAllowedAction: state?.nextAllowedAction ?? UNKNOWN,
    },
    taskHistory: task ? [{ taskId: task.taskId, description: task.taskText, class: task.taskClass, branch: currentBranch, pr: state?.pr ?? null, status: validationStatus, humanGate: humanGateRequired ? 'REQUIRED' : 'NOT REQUIRED', result: state?.nextAllowedAction ?? UNKNOWN }] : [],
    sources: {
      currentState: readTextMeta(root, 'CURRENT_STATE.md'),
      nextAction: readTextMeta(root, 'NEXT_ACTION.md'),
      loaded: Object.values(loaded).filter(Boolean).map(source => source.relative),
      previews: previews.map(source => source.relative),
    },
  };
}

export { safeResolve, redact, evidenceStatus, extractChanges, UNKNOWN };
