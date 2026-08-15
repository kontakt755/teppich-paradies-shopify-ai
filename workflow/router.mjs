import { createHash } from 'node:crypto';

export const TASK_CLASSES = Object.freeze(['A', 'B', 'C', 'D']);
export const EXTERNAL_BLOCKS = Object.freeze({
  RATE_LIMIT: 'BLOCKED_EXTERNAL_RATE_LIMIT',
  UPSTREAM: 'BLOCKED_EXTERNAL_UPSTREAM',
  LOCAL_RUNNER: 'NEEDS_LOCAL_RUNNER',
  CODE_DEFECT: 'CODE_DEFECT',
  UNKNOWN: 'UNKNOWN_BLOCKER',
});
export const MAX_AUTONOMOUS_REPAIR_ROUNDS = 3;
export const MAX_IMMEDIATE_SCRIPT_RETRIES = 1;

const CLASS_D = [
  /\b(preis(?:e|en)?|price|sku|variant(?:e|en|s)?|checkout|payment|zahlung|shipping|versand|dns)\b/i,
  /\b(shopify[- ]?write|theme publish|live publish|deployment|deploy|security gate|ci gate)\b/i,
  /\b(massen(?:anlage|import)|bulk (?:product|import)|produkte? (?:anlegen|importieren|schreiben))\b/i,
  /\bprodukte?\b.{0,60}\bshopify\b.{0,30}\b(?:write|schreiben|anlegen|importieren)\b/i,
  /\b\d+\s+[\p{L}0-9_-]*produkte?\s+(?:vorbereiten|anlegen|importieren)\b/iu,
];
const CLASS_C = [
  /\b(performance|architektur|architecture|komplex|complex|größere? (?:theme[- ]?)?logik|datenlogik|produktlogik|refactor)\b/i,
];
const CLASS_B = [
  /\b(css|theme[- ]?fix|bugfix|bug fix|komponente|component|liquid|layout[- ]?fix|kleiner? fix|code[- ]?änderung)\b/i,
];
const CLASS_A = [
  /\b(dateien? prüfen|format(?:ierung)?|docs?|dokumentation|tests? (?:ausführen|laufen lassen)|reports?|datenvalidierung|validieren|lint)\b/i,
];

const SENSITIVE_PATTERNS = [
  /^\.github\/workflows\//i,
  /^scripts\/workflow[^/]*\/?/i,
  /^workflow\//i,
  /^qa\//i,
  /^config\//i,
  /^layout\//i,
  /^sections\//i,
  /^snippets\//i,
  /^templates\//i,
  /(^|\/)(checkout|payment|shipping|zahlung|versand)[-_./]/i,
  /(^|\/)(product|produkt)[-_./]?(import|write|sync|bulk|mass)/i,
  /(^|\/)shopify[-_./]?(write|product|import)/i,
  /^AGENTS\.md$/i,
  /^docs\/WORKFLOW\.md$/i,
];

const PRODUCT_PIPELINE = /\b(produkt|product|odense|supplier|lieferant)\w*\b/i;
const PRODUCT_PREPARATION = /\b(vorbereiten|normalize|normalisieren|validate|validieren|import)\b/i;

export function normalizeTaskText(value) {
  const text = String(value ?? '').replace(/^\s*(?:neue aufgabe|task)\s*:\s*/i, '').trim();
  if (!text) throw new TypeError('Task-Text fehlt. Beispiel: npm run workflow:route -- "Neue Aufgabe: CSS-Fix"');
  if (text.length > 4_000) throw new TypeError('Task-Text ist auf 4000 Zeichen begrenzt');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw new TypeError('Task-Text enthält unzulässige Steuerzeichen');
  return text;
}

export function isSensitiveFile(file) {
  const portable = String(file ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(portable));
}

export function classifyTask(text, files = []) {
  const normalized = normalizeTaskText(text);
  if (CLASS_D.some(pattern => pattern.test(normalized))) return 'D';
  if (CLASS_C.some(pattern => pattern.test(normalized))) return 'C';
  if (CLASS_B.some(pattern => pattern.test(normalized))) return 'B';
  if (CLASS_A.some(pattern => pattern.test(normalized))) return 'A';
  if (files.some(isSensitiveFile)) return 'B';
  return 'B';
}

export function routeTask({ text, files = [], branch = null, head = null, now = () => new Date().toISOString() }) {
  const taskText = normalizeTaskText(text);
  const taskClass = classifyTask(taskText, files);
  const sensitive = files.some(isSensitiveFile);
  const productPreparation = PRODUCT_PIPELINE.test(taskText) && PRODUCT_PREPARATION.test(taskText);
  const profiles = {
    A: { executionMode: 'DETERMINISTIC_SCRIPT_FIRST', implementer: 'SCRIPT', modelTier: 'NONE', reviewer: 'HUMAN' },
    B: { executionMode: 'LIGHT_AGENT_WITH_STANDARD_TESTS', implementer: 'CODEX_LIGHT', modelTier: 'LIGHT', reviewer: 'CLAUDE_HAIKU' },
    C: { executionMode: 'STRONG_IMPLEMENTER_FULL_QA', implementer: 'CODEX_MEDIUM', modelTier: 'STRONG', reviewer: 'CLAUDE_SONNET' },
    D: { executionMode: 'CRITICAL_STRONG_IMPLEMENTER', implementer: 'CLAUDE_STRONG', modelTier: 'STRONG', reviewer: 'CODEX_MEDIUM' },
  };
  const profile = { ...profiles[taskClass] };
  if (taskClass === 'D' && productPreparation) {
    profile.executionMode = 'SCRIPT_PIPELINE_THEN_STRONG_JUDGMENT';
    profile.implementer = 'SCRIPT';
    profile.modelTier = 'STRONG_ONLY_FOR_AMBIGUITY';
  }
  const reviewRequired = taskClass === 'D' || taskClass === 'C' || (taskClass === 'B' && sensitive);
  const shopifyWriteRequired = /\b(shopify[- ]?write|produkte?\b.{0,60}\bshopify\b.{0,30}\b(?:write|schreiben|anlegen|importieren)|produkte? (?:anlegen|importieren|schreiben)|preis(?:e|en)? (?:schreiben|ändern)|sku\w* (?:schreiben|ändern)|variant\w* (?:schreiben|ändern))\b/i.test(taskText);
  const humanGateRequired = taskClass === 'D' || shopifyWriteRequired || /\b(merge|publish|live|dns|irreversibel|irreversible)\b/i.test(taskText);
  const storefrontRelated = /\b(storefront|browser|compare|sales readiness|teppich-paradies\.net|preview)\b/i.test(taskText);
  const localRunnerRequired = taskClass === 'C' || taskClass === 'D' || storefrontRelated || files.some(file => /^(sections|snippets|templates|layout)\//i.test(file));
  const idMaterial = `${taskText}\0${branch ?? ''}\0${head ?? ''}`;
  return {
    schemaVersion: 1,
    taskId: `TASK-${createHash('sha256').update(idMaterial).digest('hex').slice(0, 12).toUpperCase()}`,
    taskText,
    taskClass,
    branch,
    routedAtHead: head,
    executionMode: profile.executionMode,
    implementer: profile.implementer,
    modelTier: profile.modelTier,
    reviewRequired,
    // Keep the recommended model even when review is not initially required:
    // an actual CLASS-B diff can later touch a sensitive file and elevate it.
    reviewer: profile.reviewer,
    localRunnerRequired,
    shopifyWriteRequired,
    humanGateRequired,
    sensitiveFiles: files.filter(isSensitiveFile),
    maxAutonomousRepairRounds: MAX_AUTONOMOUS_REPAIR_ROUNDS,
    maxImmediateScriptRetries: MAX_IMMEDIATE_SCRIPT_RETRIES,
    routedAt: now(),
  };
}

export function classifyFailure(result = {}) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.message ?? ''}`;
  if (/\b403\b.{0,120}(?:claude (?:cloud agent )?proxy|cloud agent proxy)|(?:claude (?:cloud agent )?proxy|cloud agent proxy).{0,120}\b403\b|cloud (?:environment|agent).{0,120}(?:cannot|can't|darf nicht|forbidden).{0,120}storefront/i.test(output)) return EXTERNAL_BLOCKS.LOCAL_RUNNER;
  if (/\b429\b|too many requests|rate limit|cloudflare.{0,80}(?:limit|block)|temporar(?:y|ily|e).{0,40}waf/is.test(output)) return EXTERNAL_BLOCKS.RATE_LIMIT;
  if (/shopifysvc\.com\/(?:observeonly|error).{0,240}(?:cors|blocked)|(?:cors|blocked).{0,240}shopifysvc\.com\/(?:observeonly|error)/is.test(output)) return EXTERNAL_BLOCKS.UPSTREAM;
  if (result.timedOut || /\b503\b|service unavailable|upstream.{0,40}(?:unavailable|error)|network timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/is.test(output)) return EXTERNAL_BLOCKS.UPSTREAM;
  if (/AssertionError|assertion failed|expected .+ (?:to|but)|\btest(?:s)? failed\b|SyntaxError|TypeError:\s(?!fetch|network)/is.test(output)) return EXTERNAL_BLOCKS.CODE_DEFECT;
  return EXTERNAL_BLOCKS.UNKNOWN;
}

export function runWithExternalRetry(run, { maxImmediateRetries = MAX_IMMEDIATE_SCRIPT_RETRIES } = {}) {
  const boundedRetries = Math.min(MAX_IMMEDIATE_SCRIPT_RETRIES, Math.max(0, Number(maxImmediateRetries) || 0));
  let attempts = 0;
  while (attempts <= boundedRetries) {
    attempts += 1;
    const result = run();
    if (result.exitCode === 0 && !result.spawnError && !result.timedOut) return { result, attempts, blocker: null };
    const blocker = classifyFailure(result);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.message ?? ''}`;
    const retryable = blocker === EXTERNAL_BLOCKS.RATE_LIMIT || (blocker === EXTERNAL_BLOCKS.UPSTREAM
      && (result.timedOut || /\b503\b|service unavailable|network timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/is.test(output)));
    if (!retryable || attempts > boundedRetries) return { result, attempts, blocker };
  }
  throw new Error('Unreachable bounded retry state');
}

function reviewIsCurrent(review, route, repo) {
  return review?.status === 'PASS' && review?.taskId === route.taskId && review?.commit === repo.head
    && String(review.p0) === '0' && String(review.p1) === '0';
}

export function deriveHandoffState({ route, repo, latest = null, review = null, changedFiles = [], latestChangedFiles = null, pr = null, now = () => new Date().toISOString() }) {
  if (!route || route.branch !== repo.branch) {
    return {
      schemaVersion: 1, taskId: null, taskClass: null, branch: repo.branch, implementer: null, commit: repo.head,
      pr: null, validationStatus: 'NOT_RUN', p0: null, p1: null, reviewRequired: false, reviewer: null,
      reviewStatus: 'NOT_REQUIRED', externalBlock: null, nextAgent: 'HUMAN', humanGate: 'ROUTE_TASK',
      localRunnerRequired: false, shopifyWriteRequired: false, humanApprovalStored: false,
      nextAllowedAction: 'ROUTE_TASK', updatedAt: now(),
    };
  }
  const actualSensitive = changedFiles.filter(isSensitiveFile);
  const effectiveReviewRequired = route.reviewRequired || (route.taskClass === 'B' && actualSensitive.length > 0);
  const evidenceOnlyCommitGap = latest?.commit && latest?.commit !== repo.head && Array.isArray(latestChangedFiles)
    && latestChangedFiles.every(file => file === 'qa/evidence/local-verification.json');
  const latestCurrent = latest?.branch === repo.branch && (latest?.commit === repo.head || evidenceOnlyCommitGap)
    && latest?.worktreeFingerprint === repo.worktreeFingerprint;
  const validationStatus = latestCurrent ? latest.status : 'STALE_OR_NOT_RUN';
  const externalBlock = latestCurrent && latest?.status === 'FAIL' ? (latest.externalBlock ?? EXTERNAL_BLOCKS.UNKNOWN) : null;
  const implementationObserved = route.implementer === 'SCRIPT' || changedFiles.length > 0 || repo.head !== route.routedAtHead;
  const fullValidation = latestCurrent && latest.status === 'PASS' && latest.validationScope === 'FULL';
  const requiredValidationPassed = latestCurrent && latest.status === 'PASS' && (!route.localRunnerRequired || fullValidation);
  const currentReview = effectiveReviewRequired && reviewIsCurrent(review, route, repo);
  let nextAllowedAction;
  let nextAgent = null;
  if (externalBlock === EXTERNAL_BLOCKS.RATE_LIMIT || externalBlock === EXTERNAL_BLOCKS.UPSTREAM) nextAllowedAction = 'RETRY_SCRIPT_LATER';
  else if (externalBlock === EXTERNAL_BLOCKS.LOCAL_RUNNER) nextAllowedAction = 'USE_LOCAL_MAC_RUNNER';
  else if (externalBlock === EXTERNAL_BLOCKS.CODE_DEFECT) { nextAllowedAction = 'HANDOFF_IMPLEMENTER'; nextAgent = route.implementer; }
  else if (externalBlock) { nextAllowedAction = 'STOP_UNKNOWN_BLOCKER'; nextAgent = 'HUMAN'; }
  else if (!implementationObserved) { nextAllowedAction = 'HANDOFF_IMPLEMENTER'; nextAgent = route.implementer; }
  else if (!requiredValidationPassed) nextAllowedAction = route.localRunnerRequired ? 'USE_LOCAL_MAC_RUNNER' : 'RUN_STATIC_VALIDATION';
  else if (effectiveReviewRequired && !currentReview) { nextAllowedAction = 'HANDOFF_REVIEWER'; nextAgent = route.reviewer; }
  else if (route.humanGateRequired) { nextAllowedAction = 'STOP_HUMAN_GATE'; nextAgent = 'HUMAN'; }
  else nextAllowedAction = 'PREPARE_DRAFT_PR';
  return {
    schemaVersion: 1,
    taskId: route.taskId,
    taskClass: route.taskClass,
    branch: repo.branch,
    executionMode: route.executionMode,
    implementer: route.implementer,
    modelTier: route.modelTier,
    commit: repo.head,
    pr: latestCurrent ? (pr ?? latest?.pr?.number ?? latest?.pr?.url ?? null) : null,
    validationStatus,
    p0: latestCurrent ? (latest.p0 ?? null) : null,
    p1: latestCurrent ? (latest.p1 ?? null) : null,
    reviewRequired: effectiveReviewRequired,
    reviewer: effectiveReviewRequired ? route.reviewer : null,
    reviewStatus: effectiveReviewRequired ? (currentReview ? 'PASS' : 'REQUIRED') : 'NOT_REQUIRED',
    reviewerContext: effectiveReviewRequired ? 'DIFF_TEST_REPORT_FINDINGS_ONLY' : null,
    externalBlock,
    nextAgent,
    humanGate: route.humanGateRequired ? 'REQUIRED_FOR_PROTECTED_ACTION' : 'NOT_REQUIRED',
    localRunnerRequired: route.localRunnerRequired,
    shopifyWriteRequired: route.shopifyWriteRequired,
    humanApprovalStored: false,
    maxAutonomousRepairRounds: MAX_AUTONOMOUS_REPAIR_ROUNDS,
    nextAllowedAction,
    sensitiveFiles: [...new Set([...route.sensitiveFiles, ...actualSensitive])].sort(),
    updatedAt: now(),
  };
}

export function assertProtectedAction({ action, approved = false, approvalCommit = null, currentCommit = null }) {
  const protectedActions = new Set(['MERGE_MAIN', 'SHOPIFY_LIVE_PUBLISH', 'SHOPIFY_WRITE', 'MASS_PRODUCT_CREATE', 'CHECKOUT_CHANGE', 'PAYMENT_CHANGE', 'SHIPPING_CHANGE', 'DNS_CHANGE', 'IRREVERSIBLE_CHANGE']);
  if (!protectedActions.has(action)) return true;
  if (!approved || !approvalCommit || approvalCommit !== currentCommit) throw new Error(`${action} verweigert: frische Human-Freigabe für den aktuellen Commit erforderlich`);
  return true;
}

export function planContinue(state, { localRunner = false, retryNow = false } = {}) {
  switch (state.nextAllowedAction) {
    case 'RUN_STATIC_VALIDATION': return { kind: 'VALIDATE_STATIC' };
    case 'USE_LOCAL_MAC_RUNNER': return localRunner ? { kind: 'VALIDATE_FULL' } : { kind: 'STOP', reason: 'NEEDS_LOCAL_RUNNER' };
    case 'RETRY_SCRIPT_LATER': return retryNow ? { kind: state.localRunnerRequired ? 'VALIDATE_FULL' : 'VALIDATE_STATIC' } : { kind: 'STOP', reason: 'BLOCKED_EXTERNAL' };
    case 'STOP_HUMAN_GATE': return { kind: 'STOP', reason: 'HUMAN_GATE' };
    case 'STOP_UNKNOWN_BLOCKER': return { kind: 'STOP', reason: 'UNKNOWN_BLOCKER' };
    default: return { kind: 'HANDOFF', target: state.nextAgent, action: state.nextAllowedAction };
  }
}

export function formatRouterOutput(route, nextAllowedAction = null) {
  return [
    `TASK_ID: ${route.taskId}`,
    `TASK_CLASS: ${route.taskClass}`,
    `EXECUTION_MODE: ${route.executionMode}`,
    `IMPLEMENTER: ${route.implementer}`,
    `MODEL_TIER: ${route.modelTier}`,
    `REVIEW_REQUIRED: ${route.reviewRequired ? 'JA' : 'NEIN'}`,
    `REVIEWER: ${route.reviewRequired ? route.reviewer : '-'}`,
    `LOCAL_RUNNER_REQUIRED: ${route.localRunnerRequired ? 'JA' : 'NEIN'}`,
    `SHOPIFY_WRITE_REQUIRED: ${route.shopifyWriteRequired ? 'JA' : 'NEIN'}`,
    `HUMAN_GATE_REQUIRED: ${route.humanGateRequired ? 'JA' : 'NEIN'}`,
    `NEXT_ALLOWED_ACTION: ${nextAllowedAction ?? (route.implementer === 'SCRIPT' ? (route.localRunnerRequired ? 'USE_LOCAL_MAC_RUNNER' : 'RUN_STATIC_VALIDATION') : 'HANDOFF_IMPLEMENTER')}`,
  ].join('\n');
}
