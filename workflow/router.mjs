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

// --- Shopify-Write-Erkennung -------------------------------------------------
// Bewusst fail-safe: Im Zweifel lieber ein Human Gate zu viel als eines zu
// wenig. Negationen ("niemals veroeffentlichen") werden absichtlich NICHT
// ausgewertet - eine Aufgabe, die Schreiboperationen beschreibt, bleibt eine
// Schreibaufgabe, auch wenn Teile davon ausgeschlossen sind.
// Komposita bewusst eingeschlossen ("Produktdaten", "Variantenpreis",
// "Preisliste"), damit deutsche Zusammenschreibung nicht am Gate vorbeilaeuft.
const WRITE_OBJECT = String.raw`produkt\w*|product\w*|artikel\w*|listing(?:s)?|variant\w*|sku(?:s)?|ean(?:s)?|gtin(?:s)?|preis\w*|price(?:s)?|bestand\w*|lagerbestand\w*|inventar\w*|inventory|kollektion\w*|collection(?:s)?|metafeld\w*|metafield(?:s)?|entwurf|entwuerfe|entwürfe|draft(?:s)?`;
// "verbessern", "optimieren", "pruefen" sind bewusst NICHT enthalten: das sind
// Theme-/Analyseaufgaben und duerfen nicht jedes Mal ein Gate ausloesen.
const WRITE_VERB = String.raw`anlegen|anzulegen|anlage|erstellen|zu erstellen|erstellung|erzeugen|zu erzeugen|hinzufuegen|hinzuzufuegen|hinzufügen|hinzuzufügen|einpflegen|einzupflegen|pflegen|importieren|zu importieren|import|imports|hochladen|hochzuladen|upload(?:en|s)?|schreiben|zu schreiben|write(?:s)?|aendern|zu aendern|ändern|zu ändern|abaendern|abändern|veraendern|verändern|zu verändern|bearbeiten|zu bearbeiten|aktualisieren|zu aktualisieren|updaten|update(?:n|s)?|ueberschreiben|überschreiben|anpassen|anzupassen|loeschen|löschen|zu löschen|entfernen|publizieren|veroeffentlichen|veröffentlichen|synchronisieren|sync(?:en|s)?|befuellen|befüllen|migrieren`;
// Kontextsignale, die eine Objekt+Verb-Kombination eindeutig zu einer
// Shopify-/Datenschreibaufgabe machen.
const WRITE_CONTEXT = /\b(shopify|myshopify|admin[- ]?api|storefront[- ]?api|graphql|rest[- ]?api|csv|feed|katalog|catalog|bulk|massen\w*|draft|entwurf|entwuerfe|entwürfe|backend|shop[- ]?system)\b/i;
// Objekte, die auch ohne weiteren Kontext immer ein Gate ausloesen.
const ALWAYS_GATED_OBJECT = /\b(preis\w*|price(?:s)?|sku(?:s)?|ean(?:s)?|gtin(?:s)?|variant\w*|bestand\w*|lagerbestand\w*|inventar\w*|inventory)\b/i;
const EXPLICIT_WRITE = /\b(shopify[- ]?write|product[- ]?write|price[- ]?write|bulk[- ]?(?:product[- ]?)?(?:write|import|create)|massen(?:anlage|import|write)|produkt(?:e|en)?[- ]?(?:anlage|import))\b/i;
const OBJECT_THEN_VERB = new RegExp(String.raw`\b(?:${WRITE_OBJECT})\b[\s\S]{0,80}?\b(?:${WRITE_VERB})\b`, 'i');
const VERB_THEN_OBJECT = new RegExp(String.raw`\b(?:${WRITE_VERB})\b[\s\S]{0,80}?\b(?:${WRITE_OBJECT})\b`, 'i');

/**
 * Erkennt, ob eine Aufgabe einen Shopify-/Produktdaten-Write beschreibt.
 * Bewusst robust gegenueber deutschen Formulierungen und Wortstellungen
 * ("Shopify-Produkte als DRAFT anlegen", "Produkte importieren",
 * "Preise aendern", "neue Artikel hochladen", "SKU bearbeiten").
 */
export function detectShopifyWrite(value) {
  const text = String(value ?? '');
  if (!text.trim()) return false;
  if (EXPLICIT_WRITE.test(text)) return true;
  const objectVerb = OBJECT_THEN_VERB.test(text) || VERB_THEN_OBJECT.test(text);
  if (!objectVerb) return false;
  return ALWAYS_GATED_OBJECT.test(text) || WRITE_CONTEXT.test(text);
}

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

// Teilmenge von SENSITIVE_PATTERNS, die einen sauberen Nemotron-Erstpass NIE
// ersetzen darf, egal wie klar das PASS ausfaellt - Geld, CI und der
// Orchestrator/QA-Harness selbst. Bewusst OHNE layout/sections/snippets/
// templates/config: reines Theme-Markup, fuer das ein Nemotron-PASS die
// Codex-Eskalation ersparen darf (siehe review() in ai-control-core.mjs).
const HARD_ESCALATION_PATTERNS = [
  /^\.github\/workflows\//i,
  /^scripts\/workflow[^/]*\/?/i,
  /^workflow\//i,
  /^qa\//i,
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

export function requiresHardEscalation(file) {
  const portable = String(file ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  return HARD_ESCALATION_PATTERNS.some(pattern => pattern.test(portable));
}

export function classifyTask(text, files = []) {
  const normalized = normalizeTaskText(text);
  // Ein erkannter Shopify-/Produktdaten-Write ist per Definition kritisch.
  if (detectShopifyWrite(normalized)) return 'D';
  if (CLASS_D.some(pattern => pattern.test(normalized))) return 'D';
  if (CLASS_C.some(pattern => pattern.test(normalized))) return 'C';
  if (CLASS_B.some(pattern => pattern.test(normalized))) return 'B';
  // Eine mechanisch klingende Aufgabe wird nicht als CLASS A behandelt, wenn
  // sie tatsaechlich Router-, QA-, Layout- oder andere sensible Dateien aendert.
  if (files.some(isSensitiveFile)) return 'B';
  if (CLASS_A.some(pattern => pattern.test(normalized))) return 'A';
  return 'B';
}

export function routeTask({ text, files = [], branch = null, head = null, now = () => new Date().toISOString() }) {
  const taskText = normalizeTaskText(text);
  const taskClass = classifyTask(taskText, files);
  const sensitive = files.some(isSensitiveFile);
  const productPreparation = PRODUCT_PIPELINE.test(taskText) && PRODUCT_PREPARATION.test(taskText);
  const profiles = {
    A: { executionMode: 'DETERMINISTIC_SCRIPT_FIRST', implementer: 'SCRIPT', modelTier: 'NONE', reviewer: 'HUMAN' },
    // preReviewer: Klasse B bekommt zuerst einen kostenlosen Nemotron-Pass.
    // CODEX_LIGHT bleibt reviewer (Eskalationsziel) - siehe review() in
    // ai-control-core.mjs: Nemotron-PASS auf nicht-sensiblen Dateien ersetzt
    // Codex, jeder Fund oder jede sensible Datei eskaliert wie bisher.
    B: { executionMode: 'LIGHT_AGENT_WITH_STANDARD_TESTS', implementer: 'CLAUDE_HAIKU', modelTier: 'LIGHT', reviewer: 'CODEX_LIGHT', preReviewer: 'NEMOTRON_REVIEW' },
    C: { executionMode: 'STRONG_IMPLEMENTER_FULL_QA', implementer: 'CLAUDE_SONNET', modelTier: 'STRONG', reviewer: 'CODEX_MEDIUM' },
    D: { executionMode: 'CRITICAL_STRONG_IMPLEMENTER', implementer: 'CLAUDE_STRONG', modelTier: 'STRONG', reviewer: 'CODEX_MEDIUM' },
  };
  const profile = { ...profiles[taskClass] };
  if (taskClass === 'D' && productPreparation) {
    profile.executionMode = 'SCRIPT_PIPELINE_THEN_STRONG_JUDGMENT';
    profile.implementer = 'SCRIPT';
    profile.modelTier = 'STRONG_ONLY_FOR_AMBIGUITY';
  }
  const reviewRequired = taskClass === 'D' || taskClass === 'C' || (taskClass === 'B' && sensitive);
  const shopifyWriteRequired = detectShopifyWrite(taskText);
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
    // Optionaler, kostenguenstiger Erstpass vor dem eigentlichen reviewer.
    // null fuer alle Klassen ausser B - siehe review() in ai-control-core.mjs.
    preReviewer: profile.preReviewer ?? null,
    localRunnerRequired,
    shopifyWriteRequired,
    humanGateRequired,
    sensitiveFiles: files.filter(isSensitiveFile),
    maxAutonomousRepairRounds: MAX_AUTONOMOUS_REPAIR_ROUNDS,
    maxImmediateScriptRetries: MAX_IMMEDIATE_SCRIPT_RETRIES,
    routedAt: now(),
  };
}

/**
 * networkCapable = false (Default: true) unterdrueckt LOCAL_RUNNER/RATE_LIMIT/
 * UPSTREAM vollstaendig, auch wenn der Text zufaellig passt.
 *
 * Grund: Schritte wie UNIT/AUTOMATION/WORKFLOW_TESTS/QA_EVIDENCE/SECRET_SCAN
 * fuehren nie einen echten Netzwerkaufruf aus (alles gemockt) - sie koennen
 * also niemals legitim an einem externen Rate Limit oder Upstream-Fehler
 * scheitern. Trotzdem enthalten ihre eigenen, bestandenen Testnamen oft
 * woertlich "429" oder "rate limit" (z. B. Tests, die genau diese
 * Klassifizierung pruefen). Ohne diese Sperre klassifiziert ein simpler
 * Text-Scan einen echten lokalen Fehlschlag (real beobachtet, Ursache
 * unklar - vermutlich Ressourcen-Kontention bei vielen parallelen
 * Node-Prozessen) faelschlich als "externer Blocker" und der Lauf wartet auf
 * ein Rate Limit, das nie existierte, statt den echten Fehler zu melden.
 */
export function classifyFailure(result = {}, { networkCapable = true } = {}) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.message ?? ''}`;
  if (networkCapable) {
    if (/\b403\b.{0,120}(?:claude (?:cloud agent )?proxy|cloud agent proxy)|(?:claude (?:cloud agent )?proxy|cloud agent proxy).{0,120}\b403\b|cloud (?:environment|agent).{0,120}(?:cannot|can't|darf nicht|forbidden).{0,120}storefront/i.test(output)) return EXTERNAL_BLOCKS.LOCAL_RUNNER;
    if (/\b429\b|too many requests|rate limit|cloudflare.{0,80}(?:limit|block)|temporar(?:y|ily|e).{0,40}waf/is.test(output)) return EXTERNAL_BLOCKS.RATE_LIMIT;
    if (/shopifysvc\.com\/(?:observeonly|error).{0,240}(?:cors|blocked)|(?:cors|blocked).{0,240}shopifysvc\.com\/(?:observeonly|error)/is.test(output)) return EXTERNAL_BLOCKS.UPSTREAM;
    if (result.timedOut || /\b503\b|service unavailable|upstream.{0,40}(?:unavailable|error)|network timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/is.test(output)) return EXTERNAL_BLOCKS.UPSTREAM;
  }
  if (/AssertionError|assertion failed|expected .+ (?:to|but)|\btest(?:s)? failed\b|SyntaxError|TypeError:\s(?!fetch|network)/is.test(output)) return EXTERNAL_BLOCKS.CODE_DEFECT;
  return EXTERNAL_BLOCKS.UNKNOWN;
}

export function runWithExternalRetry(run, { maxImmediateRetries = MAX_IMMEDIATE_SCRIPT_RETRIES, networkCapable = true } = {}) {
  const boundedRetries = Math.min(MAX_IMMEDIATE_SCRIPT_RETRIES, Math.max(0, Number(maxImmediateRetries) || 0));
  let attempts = 0;
  while (attempts <= boundedRetries) {
    attempts += 1;
    const result = run();
    if (result.exitCode === 0 && !result.spawnError && !result.timedOut) return { result, attempts, blocker: null };
    const blocker = classifyFailure(result, { networkCapable });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.message ?? ''}`;
    const retryable = blocker === EXTERNAL_BLOCKS.RATE_LIMIT || (blocker === EXTERNAL_BLOCKS.UPSTREAM
      && (result.timedOut || /\b503\b|service unavailable|network timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/is.test(output)));
    if (!retryable || attempts > boundedRetries) return { result, attempts, blocker };
  }
  throw new Error('Unreachable bounded retry state');
}

function reviewIsCurrent(review, route, repo) {
  if (review?.status !== 'PASS' || review?.taskId !== route.taskId || review?.commit !== repo.head) return false;
  if (String(review.p0) !== '0' || String(review.p1) !== '0') return false;
  // Zusaetzliche Bindung an den Worktree-Zustand. Aeltere Evidence ohne
  // Fingerprint bleibt kompatibel; sobald ein Fingerprint hinterlegt ist, muss
  // er exakt zum aktuellen Working Tree passen, sonst ist die Evidence stale.
  if (review.worktreeFingerprint && review.worktreeFingerprint !== repo.worktreeFingerprint) return false;
  return true;
}

export function deriveHandoffState({ route, repo, latest = null, review = null, changedFiles = [], latestChangedFiles = null, pr = null, implementationObserved: observedOverride = null, now = () => new Date().toISOString() }) {
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
  // Ohne Override wird aus den geaenderten Dateien geschlossen, ob schon
  // implementiert wurde. Das ist eine Heuristik: in einem bereits schmutzigen
  // Working Tree ist sie immer wahr, auch wenn nie ein Agent lief.
  // Ein Aufrufer, der es besser weiss - etwa der Orchestrator mit seinem
  // commitgebundenen Implementer-Ergebnis - reicht den echten Wert durch.
  const implementationObserved = typeof observedOverride === 'boolean'
    ? observedOverride
    : (route.implementer === 'SCRIPT' || changedFiles.length > 0 || repo.head !== route.routedAtHead);
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
