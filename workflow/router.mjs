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

// Produkte/Kollektionen aus dem Shop nehmen ist ein Shopify-Write und nicht
// zurückrollbar, sobald gelöscht wurde. Beide Leserichtungen abdecken, damit
// weder "Produkt löschen" noch "lösche das Produkt" durchrutscht.
const PRODUCT_REMOVAL_TARGET = 'produkt(?:e|s|en)?|product(?:s)?|artikel|kollektion(?:en)?|collection(?:s)?';
const PRODUCT_REMOVAL_VERB = '(?:lösch|loesch|entfern|archivier|verbann|sperr|deaktivier|depublizier)(?:e|en|st|t)?|delete[dsn]?|unpublish(?:ed)?';
const PRODUCT_REMOVAL_FORWARD = new RegExp(`\\b(?:${PRODUCT_REMOVAL_TARGET})\\b.{0,60}\\b(?:${PRODUCT_REMOVAL_VERB})\\b`, 'i');
const PRODUCT_REMOVAL_REVERSE = new RegExp(`\\b(?:${PRODUCT_REMOVAL_VERB})\\b.{0,60}\\b(?:${PRODUCT_REMOVAL_TARGET})\\b`, 'i');
const PRODUCT_DELETE_FORWARD = new RegExp(`\\b(?:${PRODUCT_REMOVAL_TARGET})\\b.{0,60}\\b(?:(?:lösch|loesch)(?:e|en|st|t)?|delete[dsn]?)\\b`, 'i');
// Auch ohne Loeschung sind Massenaenderungen an Produktdaten Shopify-Writes.
// Das SHOPIFY_WRITE-Muster kannte bisher nur anlegen/importieren/schreiben, das
// PRICE_SKU_VARIANT_WRITE-Muster nur Preise, SKUs und Varianten. Marken-, Vendor-
// und Beschreibungsfelder fielen durch beide Raster.
const PRODUCT_DATA_TARGET = 'vendor|marke(?:n(?:name|feld))?|brand|hersteller|produktdaten|produkttitel|produktbeschreibung|metafeld(?:er)?|alt-?text(?:e)?';
const PRODUCT_DATA_VERB = '(?:vereinheitlich|umbenenn|umstell|setz|pflege|aktualisier|nachzieh|ueberschreib|überschreib)(?:e|en|st|t)?|update[ns]?';
// Deutsche Pluralendungen zulassen, sonst greift "Produktbeschreibungen" nicht.
const PRODUCT_DATA_SUFFIX = '(?:en|er|e|n|s)?';
const PRODUCT_DATA_FORWARD = new RegExp(`\\b(?:${PRODUCT_DATA_TARGET})${PRODUCT_DATA_SUFFIX}\\b.{0,60}\\b(?:${PRODUCT_DATA_VERB})\\b`, 'i');
const PRODUCT_DATA_REVERSE = new RegExp(`\\b(?:${PRODUCT_DATA_VERB})\\b.{0,60}\\b(?:${PRODUCT_DATA_TARGET})${PRODUCT_DATA_SUFFIX}\\b`, 'i');

const PRODUCT_DELETE_REVERSE = new RegExp(`\\b(?:(?:lösch|loesch)(?:e|en|st|t)?|delete[dsn]?)\\b.{0,60}\\b(?:${PRODUCT_REMOVAL_TARGET})\\b`, 'i');

const CLASS_D = [
  /\b(?:preis(?:e|en)?|price|sku|variant(?:e|en|s)?)\b.{0,50}(?:ändern|schreiben|setzen|aktualisieren|update|löschen|importieren)/i,
  /(?:ändern|schreiben|setzen|aktualisieren|update|löschen|importieren).{0,50}\b(?:preis(?:e|en)?|price|sku|variant(?:e|en|s)?)\b/i,
  /\b(?:checkout|payment|zahlung|shipping|versand|dns)\b.{0,50}(?:ändern|schreiben|setzen|konfigurieren|umstellen|löschen)/i,
  /\b(?:shopify[- ]?write|theme publish|live publish|live schalten|in shopify (?:schreiben|anlegen|importieren))\b/i,
  /\b(?:massen(?:anlage|import)|bulk (?:product|import)|produkte? (?:anlegen|importieren|schreiben))\b/i,
  PRODUCT_REMOVAL_FORWARD,
  PRODUCT_REMOVAL_REVERSE,
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
  /^automation\/(?:scripts|write|import|sync)/i,
  /^config\/settings_data\.json$/i,
  /(^|\/)(checkout|payment|shipping|zahlung|versand)[-_./]/i,
  /(^|\/)(product|produkt)[-_./]?(import|write|sync|bulk|mass)/i,
  /(^|\/)shopify[-_./]?(write|product|import)/i,
  /^AGENTS\.md$/i,
  /^docs\/WORKFLOW\.md$/i,
];

const PRODUCT_PIPELINE = /\b(produkt|product|odense|supplier|lieferant)\w*\b/i;
const PRODUCT_PREPARATION = /\b(vorbereiten|normalize|normalisieren|validate|validieren|import)\b/i;

const PROTECTED_ACTION_PATTERNS = Object.freeze([
  ['MERGE_MAIN', /\b(?:merge|mergen|zusammenführen)\b.{0,30}\bmain\b|\bmain\b.{0,30}\b(?:merge|mergen|zusammenführen)\b/i],
  ['SHOPIFY_LIVE_PUBLISH', /\b(?:live (?:publish|schalten|veröffentlichen)|(?:publish|veröffentlichen).{0,30}\blive\b|theme publish)\b/i],
  ['SHOPIFY_WRITE', /\b(?:shopify[- ]?write|in shopify (?:schreiben|anlegen|importieren)|produkte? (?:anlegen|importieren|schreiben))\b/i],
  ['PRICE_SKU_VARIANT_WRITE', /\b(?:preis(?:e|en)?|price|sku|variant(?:e|en|s)?)\b.{0,50}(?:ändern|schreiben|setzen|aktualisieren|update|löschen|importieren)/i],
  ['PRICE_SKU_VARIANT_WRITE', /(?:ändern|schreiben|setzen|aktualisieren|update|löschen|importieren).{0,50}\b(?:preis(?:e|en)?|price|sku|variant(?:e|en|s)?)\b/i],
  ['CHECKOUT_PAYMENT_SHIPPING_CHANGE', /\b(?:checkout|payment|zahlung|shipping|versand)\b.{0,50}(?:ändern|schreiben|setzen|konfigurieren|umstellen|löschen)/i],
  ['DNS_CHANGE', /\bdns\b.{0,40}(?:ändern|schreiben|setzen|konfigurieren|umstellen|löschen)/i],
  ['IRREVERSIBLE_CHANGE', /\b(?:irreversibel\w*|irreversible)\b.{0,40}(?:ausführen|ändern|löschen|überschreiben)/i],
  ['SHOPIFY_WRITE', PRODUCT_REMOVAL_FORWARD],
  ['SHOPIFY_WRITE', PRODUCT_REMOVAL_REVERSE],
  ['IRREVERSIBLE_CHANGE', PRODUCT_DELETE_FORWARD],
  ['IRREVERSIBLE_CHANGE', PRODUCT_DELETE_REVERSE],
  ['SHOPIFY_WRITE', PRODUCT_DATA_FORWARD],
  ['SHOPIFY_WRITE', PRODUCT_DATA_REVERSE],
]);

const STOREFRONT_VALIDATION = /\b(?:storefront|browser[- ]?qa|sales readiness|compare[- ]?check|live[- ]?shop)\b.{0,50}\b(?:testen|prüfen|ausführen|validieren|check)\b|\b(?:testen|prüfen|ausführen|validieren|check)\b.{0,50}\b(?:storefront|browser[- ]?qa|sales readiness|live[- ]?shop)\b/i;

function withoutNegatedActions(text) {
  return text
    .replace(/\bohne\b.{0,70}(?:zu\s+)?(?:ändern|schreiben|setzen|aktualisieren|updaten|löschen|importieren|veröffentlichen|publishen|mergen|ausführen)/giu, '')
    .replace(/\b(?:nicht|nie|keine(?:n|r|s)?)\b.{0,50}(?:ändern|schreiben|setzen|aktualisieren|updaten|löschen|importieren|veröffentlichen|publishen|mergen|ausführen)/giu, '')
    .replace(/\b(?:ändern|schreiben|setzen|aktualisieren|updaten|löschen|importieren|veröffentlichen|publishen|mergen|ausführen)\b.{0,30}\b(?:nicht|nie)\b/giu, '');
}

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

export function protectedActionsForTask(text) {
  const normalized = withoutNegatedActions(normalizeTaskText(text));
  return [...new Set(PROTECTED_ACTION_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(([action]) => action))];
}

export function classifyTask(text, files = []) {
  const normalized = withoutNegatedActions(normalizeTaskText(text));
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
  const protectedActions = protectedActionsForTask(taskText);
  const productPreparation = PRODUCT_PIPELINE.test(taskText) && PRODUCT_PREPARATION.test(taskText);
  const profiles = {
    A: { executionMode: 'SCRIPT_FIRST', implementer: 'SCRIPT', modelTier: 'NONE', reviewer: 'REVIEWER' },
    B: { executionMode: 'STANDARD_IMPLEMENTATION', implementer: 'AGENT', modelTier: 'STANDARD', reviewer: 'REVIEWER' },
    C: { executionMode: 'STRONG_IMPLEMENTATION', implementer: 'STRONG_AGENT', modelTier: 'STRONG', reviewer: 'INDEPENDENT_REVIEWER' },
    D: { executionMode: 'PROTECTED_CHANGE_PREPARATION', implementer: 'STRONG_AGENT', modelTier: 'STRONG', reviewer: 'INDEPENDENT_REVIEWER' },
  };
  const profile = { ...profiles[taskClass] };
  if (taskClass === 'D' && productPreparation) {
    profile.executionMode = 'SCRIPT_PIPELINE_THEN_STRONG_JUDGMENT';
    profile.implementer = 'SCRIPT';
    profile.modelTier = 'STRONG_ONLY_FOR_AMBIGUITY';
  }
  const reviewRequired = protectedActions.length > 0;
  const reviewRecommended = reviewRequired || taskClass === 'C' || taskClass === 'D' || sensitive;
  const shopifyWriteRequired = protectedActions.some(action => ['SHOPIFY_WRITE', 'PRICE_SKU_VARIANT_WRITE', 'CHECKOUT_PAYMENT_SHIPPING_CHANGE'].includes(action));
  const humanGateRequired = protectedActions.length > 0;
  const localRunnerRequired = STOREFRONT_VALIDATION.test(taskText) || protectedActions.includes('SHOPIFY_LIVE_PUBLISH');
  const requiredValidationScope = localRunnerRequired ? 'FULL' : 'STATIC';
  const idMaterial = `${taskText}\0${branch ?? ''}\0${head ?? ''}`;
  return {
    schemaVersion: 2,
    taskId: `TASK-${createHash('sha256').update(idMaterial).digest('hex').slice(0, 12).toUpperCase()}`,
    taskText,
    taskClass,
    branch,
    routedAtHead: head,
    executionMode: profile.executionMode,
    implementer: profile.implementer,
    modelTier: profile.modelTier,
    reviewRequired,
    reviewRecommended,
    reviewer: profile.reviewer,
    localRunnerRequired,
    requiredValidationScope,
    shopifyWriteRequired,
    humanGateRequired,
    protectedActions,
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
      schemaVersion: 2, taskId: null, taskClass: null, branch: repo.branch, implementer: null, commit: repo.head,
      pr: null, validationStatus: 'NOT_RUN', p0: null, p1: null, reviewRequired: false, reviewer: null,
      reviewRecommended: false, reviewStatus: 'NOT_REQUIRED', externalBlock: null, nextAgent: 'AGENT', humanGate: 'ROUTE_TASK',
      localRunnerRequired: false, requiredValidationScope: 'STATIC', shopifyWriteRequired: false, protectedActions: [], humanApprovalStored: false,
      nextAllowedAction: 'ROUTE_TASK', updatedAt: now(),
    };
  }
  const actualSensitive = changedFiles.filter(isSensitiveFile);
  const effectiveReviewRequired = route.reviewRequired;
  const effectiveReviewRecommended = route.reviewRecommended || actualSensitive.length > 0;
  const evidenceOnlyCommitGap = latest?.commit && latest?.commit !== repo.head && Array.isArray(latestChangedFiles)
    && latestChangedFiles.every(file => file === 'qa/evidence/local-verification.json');
  const latestCurrent = latest?.branch === repo.branch && (latest?.commit === repo.head || evidenceOnlyCommitGap)
    && latest?.worktreeFingerprint === repo.worktreeFingerprint;
  const validationStatus = latestCurrent ? latest.status : 'STALE_OR_NOT_RUN';
  const externalBlock = latestCurrent && latest?.status === 'FAIL' ? (latest.externalBlock ?? EXTERNAL_BLOCKS.CODE_DEFECT) : null;
  const implementationObserved = route.implementer === 'SCRIPT' || changedFiles.length > 0 || repo.head !== route.routedAtHead;
  const fullValidation = latestCurrent && latest.status === 'PASS' && latest.validationScope === 'FULL';
  const requiredScope = route.requiredValidationScope ?? (route.localRunnerRequired ? 'FULL' : 'STATIC');
  const requiredValidationPassed = latestCurrent && latest.status === 'PASS' && (requiredScope !== 'FULL' || fullValidation);
  const currentReview = effectiveReviewRecommended && reviewIsCurrent(review, route, repo);
  let nextAllowedAction;
  let nextAgent = null;
  if (externalBlock === EXTERNAL_BLOCKS.RATE_LIMIT || externalBlock === EXTERNAL_BLOCKS.UPSTREAM) nextAllowedAction = 'RETRY_SCRIPT_LATER';
  else if (externalBlock === EXTERNAL_BLOCKS.LOCAL_RUNNER) nextAllowedAction = 'USE_LOCAL_MAC_RUNNER';
  else if (externalBlock === EXTERNAL_BLOCKS.CODE_DEFECT) { nextAllowedAction = 'FIX_VALIDATION_FAILURE'; nextAgent = route.implementer; }
  else if (externalBlock) { nextAllowedAction = 'INSPECT_VALIDATION_FAILURE'; nextAgent = route.implementer; }
  else if (!implementationObserved) { nextAllowedAction = 'HANDOFF_IMPLEMENTER'; nextAgent = route.implementer; }
  else if (!requiredValidationPassed) nextAllowedAction = requiredScope === 'FULL' ? 'RUN_FULL_VALIDATION' : 'RUN_STATIC_VALIDATION';
  else if (!pr) nextAllowedAction = 'PREPARE_DRAFT_PR';
  else if (effectiveReviewRequired && !currentReview) { nextAllowedAction = 'HANDOFF_REVIEWER'; nextAgent = route.reviewer; }
  else if (effectiveReviewRecommended && !currentReview) { nextAllowedAction = 'REVIEW_DRAFT_PR'; nextAgent = route.reviewer; }
  else nextAllowedAction = 'DRAFT_PR_READY';
  return {
    schemaVersion: 2,
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
    reviewRecommended: effectiveReviewRecommended,
    reviewer: effectiveReviewRecommended ? route.reviewer : null,
    reviewStatus: effectiveReviewRequired ? (currentReview ? 'PASS' : 'REQUIRED') : effectiveReviewRecommended ? (currentReview ? 'PASS' : 'RECOMMENDED') : 'NOT_REQUIRED',
    reviewerContext: effectiveReviewRecommended ? 'DIFF_TEST_REPORT_FINDINGS_ONLY' : null,
    externalBlock,
    nextAgent,
    humanGate: route.humanGateRequired ? 'REQUIRED_BEFORE_PROTECTED_ACTION' : 'NOT_REQUIRED',
    localRunnerRequired: route.localRunnerRequired,
    requiredValidationScope: requiredScope,
    shopifyWriteRequired: route.shopifyWriteRequired,
    protectedActions: route.protectedActions ?? [],
    humanApprovalStored: false,
    maxAutonomousRepairRounds: MAX_AUTONOMOUS_REPAIR_ROUNDS,
    nextAllowedAction,
    sensitiveFiles: [...new Set([...route.sensitiveFiles, ...actualSensitive])].sort(),
    updatedAt: now(),
  };
}

export function assertProtectedAction({ action, approved = false, approvalCommit = null, currentCommit = null }) {
  const protectedActions = new Set(['MERGE_MAIN', 'SHOPIFY_LIVE_PUBLISH', 'SHOPIFY_WRITE', 'PRICE_SKU_VARIANT_WRITE', 'MASS_PRODUCT_CREATE', 'CHECKOUT_PAYMENT_SHIPPING_CHANGE', 'CHECKOUT_CHANGE', 'PAYMENT_CHANGE', 'SHIPPING_CHANGE', 'DNS_CHANGE', 'IRREVERSIBLE_CHANGE']);
  if (!protectedActions.has(action)) return true;
  if (!approved || !approvalCommit || approvalCommit !== currentCommit) throw new Error(`${action} verweigert: frische Human-Freigabe für den aktuellen Commit erforderlich`);
  return true;
}

export function planContinue(state, { localRunner = false, retryNow = false } = {}) {
  switch (state.nextAllowedAction) {
    case 'RUN_STATIC_VALIDATION': return { kind: 'VALIDATE_STATIC' };
    case 'RUN_FULL_VALIDATION': return localRunner ? { kind: 'VALIDATE_FULL' } : { kind: 'STOP', reason: 'NEEDS_LOCAL_RUNNER' };
    case 'USE_LOCAL_MAC_RUNNER': return localRunner ? { kind: 'VALIDATE_FULL' } : { kind: 'STOP', reason: 'NEEDS_LOCAL_RUNNER' };
    case 'RETRY_SCRIPT_LATER': return retryNow ? { kind: state.localRunnerRequired ? 'VALIDATE_FULL' : 'VALIDATE_STATIC' } : { kind: 'STOP', reason: 'BLOCKED_EXTERNAL' };
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
    `REVIEW_RECOMMENDED: ${route.reviewRecommended ? 'JA' : 'NEIN'}`,
    `REVIEWER: ${route.reviewRecommended ? route.reviewer : '-'}`,
    `LOCAL_RUNNER_REQUIRED: ${route.localRunnerRequired ? 'JA' : 'NEIN'}`,
    `VALIDATION_SCOPE: ${route.requiredValidationScope}`,
    `SHOPIFY_WRITE_REQUIRED: ${route.shopifyWriteRequired ? 'JA' : 'NEIN'}`,
    `HUMAN_GATE_REQUIRED: ${route.humanGateRequired ? 'JA' : 'NEIN'}`,
    `PROTECTED_ACTIONS: ${route.protectedActions.length ? route.protectedActions.join(',') : '-'}`,
    `NEXT_ALLOWED_ACTION: ${nextAllowedAction ?? (route.implementer === 'SCRIPT' ? (route.requiredValidationScope === 'FULL' ? 'RUN_FULL_VALIDATION' : 'RUN_STATIC_VALIDATION') : 'HANDOFF_IMPLEMENTER')}`,
  ].join('\n');
}
