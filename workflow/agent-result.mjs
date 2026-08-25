/**
 * Maschinenlesbares Agentenresultat (Phase 4).
 *
 * Jeder Provideradapter liefert exakt dieses Format zurueck. Der Orchestrator
 * kennt keine providerspezifischen Formate; Uebersetzung passiert im Adapter.
 *
 * Sicherheitsregeln:
 * - Keine Secrets in Reports (Redaction unten).
 * - stdout/stderr werden nur als gekuerzte Zusammenfassung uebernommen.
 * - Unbekannte Status werden zu FAILED normalisiert, niemals zu PASS.
 */

export const AGENT_RESULT_SCHEMA_VERSION = 1;

export const AGENT_ROLES = Object.freeze(['IMPLEMENTER', 'REVIEWER', 'CORRECTOR', 'ANALYZER']);

/** Provider-unabhaengige Ergebnisstatus. */
export const AGENT_STATUSES = Object.freeze([
  'PASS',            // Arbeit erledigt, keine Blocker
  'FINDINGS',        // Reviewer hat verwertbare Findings gemeldet
  'FAILED',          // Agent ist fachlich gescheitert
  'BLOCKED',         // Agent kam nicht weiter (fehlende Info, Guard)
  'RATE_LIMITED',    // 429/Quota - NIE automatisch durch Providerwechsel "loesen"
  'UNAVAILABLE',     // Provider nicht startbar
  'AUTH_REQUIRED',   // Provider braucht Login
  'TIMEOUT',         // Bounded Timeout gerissen
  'SECURITY_STOP',   // Guard/Allowlist-Verstoss
]);

/** Status, nach denen der Orchestrator niemals automatisch weiterlaeuft. */
export const NON_RETRYABLE_STATUSES = new Set(['SECURITY_STOP', 'AUTH_REQUIRED', 'UNAVAILABLE']);

const MAX_SUMMARY_CHARS = 2_000;
const MAX_OUTPUT_CHARS = 4_000;
const MAX_LIST_ENTRIES = 200;

const SECRET_PATTERNS = [
  /\bshp(?:at|ca|pa|ss)_[A-Za-z0-9]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{16,}/gi,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/gi,
  /\bnvapi-[A-Za-z0-9_-]{16,}/gi,
  /\bxox[abprs]-[A-Za-z0-9-]{8,}/gi,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b(?:api[_-]?key|token|secret|password|passwort|authorization|bearer)\b\s*[:=]\s*["']?[^\s"',;]{8,}/gi,
];

/** Entfernt bekannte Secret-Formen aus beliebigem Text. */
export function redactSecrets(value) {
  let text = String(value ?? '');
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[REDACTED]');
  return text;
}

function clamp(value, maxChars) {
  const text = redactSecrets(value).trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[... ${text.length - maxChars} Zeichen gekuerzt]`;
}

function toStringList(value, { maxEntries = MAX_LIST_ENTRIES } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => redactSecrets(entry).trim())
    .filter(Boolean)
    .slice(0, maxEntries);
}

function normalizeStatus(value) {
  const status = String(value ?? '').trim().toUpperCase();
  return AGENT_STATUSES.includes(status) ? status : 'FAILED';
}

function normalizeTests(value) {
  if (!value || typeof value !== 'object') return { status: 'NOT_RUN', commands: [], passed: null, failed: null, summary: '' };
  const status = ['PASS', 'FAIL', 'NOT_RUN', 'SKIPPED'].includes(String(value.status ?? '').toUpperCase())
    ? String(value.status).toUpperCase()
    : 'NOT_RUN';
  const toCount = count => (Number.isInteger(count) && count >= 0 ? count : null);
  return {
    status,
    commands: toStringList(value.commands, { maxEntries: 20 }),
    passed: toCount(value.passed),
    failed: toCount(value.failed),
    summary: clamp(value.summary ?? '', 500),
  };
}

const FINDING_FIELDS = ['priority', 'file', 'problem', 'reason', 'recommendedFix'];
const FINDING_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);

/**
 * Findings werden hier tolerant normalisiert (fehlende Felder aufgefuellt),
 * damit ein schlecht formatierender Agent keinen harten Crash ausloest.
 * Die strikte Validierung bleibt in review-cycle.mjs.
 */
function normalizeFindings(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_LIST_ENTRIES).map(raw => {
    const finding = raw && typeof raw === 'object' ? raw : {};
    const priority = String(finding.priority ?? '').trim().toUpperCase();
    const normalized = {
      priority: FINDING_PRIORITIES.has(priority) ? priority : 'P2',
      file: clamp(finding.file ?? 'unbekannt', 300) || 'unbekannt',
      problem: clamp(finding.problem ?? 'ohne Beschreibung', 800) || 'ohne Beschreibung',
      reason: clamp(finding.reason ?? 'ohne Begruendung', 800) || 'ohne Begruendung',
      recommendedFix: clamp(finding.recommendedFix ?? 'ohne Vorschlag', 800) || 'ohne Vorschlag',
    };
    for (const field of FINDING_FIELDS) if (!normalized[field]) normalized[field] = 'unbekannt';
    return normalized;
  });
}

/**
 * Normalisiert ein rohes Adapterergebnis in das kanonische Agentenresultat.
 *
 * @returns {{
 *   schemaVersion: number, provider: string, role: string, status: string,
 *   summary: string, changedFiles: string[], tests: object, findings: object[],
 *   blockers: string[], git: {branch: string|null, head: string|null},
 *   actualOperations: string[]|null, resources: string[],
 *   startedAt: string|null, finishedAt: string|null, durationMs: number|null,
 *   exitCode: number|null, retryable: boolean, workspace: string|null,
 *   diffFingerprint: string|null, output: string
 * }}
 */
export function normalizeAgentResult(raw, context = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const status = normalizeStatus(source.status);
  const startedAt = source.startedAt ?? context.startedAt ?? null;
  const finishedAt = source.finishedAt ?? context.finishedAt ?? null;
  const durationMs = Number.isFinite(source.durationMs)
    ? source.durationMs
    : (startedAt && finishedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : null);
  const role = AGENT_ROLES.includes(String(source.role ?? context.role ?? '').toUpperCase())
    ? String(source.role ?? context.role).toUpperCase()
    : 'IMPLEMENTER';

  return {
    schemaVersion: AGENT_RESULT_SCHEMA_VERSION,
    provider: String(source.provider ?? context.provider ?? 'UNKNOWN'),
    model: source.model ? String(source.model) : (context.model ?? null),
    role,
    status,
    summary: clamp(source.summary ?? '', MAX_SUMMARY_CHARS),
    changedFiles: toStringList(source.changedFiles),
    tests: normalizeTests(source.tests),
    findings: normalizeFindings(source.findings),
    blockers: toStringList(source.blockers, { maxEntries: 50 }),
    git: {
      branch: source.git?.branch ?? context.branch ?? null,
      head: source.git?.head ?? context.head ?? null,
    },
    // Fuer den RiskGuard-Postflight. null = Adapter konnte es nicht ermitteln;
    // der Aufrufer faellt dann auf die Task-Allowlist zurueck.
    actualOperations: Array.isArray(source.actualOperations) ? toStringList(source.actualOperations, { maxEntries: 50 }) : null,
    resources: toStringList(source.resources, { maxEntries: 50 }),
    startedAt,
    finishedAt,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    exitCode: Number.isInteger(source.exitCode) ? source.exitCode : null,
    retryable: NON_RETRYABLE_STATUSES.has(status) ? false : Boolean(source.retryable ?? (status === 'RATE_LIMITED' || status === 'TIMEOUT')),
    workspace: source.workspace ?? context.workspace ?? null,
    diffFingerprint: source.diffFingerprint ?? null,
    output: clamp(source.output ?? '', MAX_OUTPUT_CHARS),
  };
}

/**
 * Uebersetzt ein Agentenresultat in den Status, den review-cycle.mjs erwartet.
 * review-cycle kennt nur PASS/PARKED/BLOCKED/SECURITY_STOP - alles andere wird
 * dort zu HARD_FAIL. Diese Abbildung ist bewusst konservativ.
 */
export function toCycleStatus(result) {
  switch (result?.status) {
    case 'PASS': return 'PASS';
    case 'FINDINGS': return 'PASS';
    case 'SECURITY_STOP': return 'SECURITY_STOP';
    case 'BLOCKED':
    case 'RATE_LIMITED':
    case 'UNAVAILABLE':
    case 'AUTH_REQUIRED':
    case 'TIMEOUT':
      return 'BLOCKED';
    default: return 'HARD_FAIL';
  }
}

/** Kompakte, promptfreundliche Darstellung fuer den naechsten Agenten. */
export function summarizeAgentResult(result) {
  const lines = [
    `PROVIDER: ${result.provider}`,
    `ROLE: ${result.role}`,
    `STATUS: ${result.status}`,
    `TESTS: ${result.tests.status}${result.tests.failed ? ` (${result.tests.failed} failed)` : ''}`,
    `CHANGED_FILES (${result.changedFiles.length}): ${result.changedFiles.slice(0, 40).join(', ') || '-'}`,
  ];
  if (result.blockers.length) lines.push(`BLOCKERS: ${result.blockers.join(' | ')}`);
  if (result.summary) lines.push(`SUMMARY: ${result.summary}`);
  return lines.join('\n');
}
