/**
 * Provider-Registry (Phase 3 + Phase 6).
 *
 * Bildet die Router-Rollen (SCRIPT, CODEX_LIGHT, CODEX_MEDIUM, CLAUDE_STRONG,
 * CLAUDE_HAIKU, CLAUDE_SONNET) auf konkrete lokale Provider ab und kapselt die
 * Regeln fuer einen zulaessigen Providerwechsel.
 *
 * Harte Regel: Ein Rate Limit (429) loest NIEMALS einen automatischen
 * Providerwechsel aus. Der Lauf stoppt und Ahmet entscheidet.
 */

import * as claudeCode from './claude-code.mjs';
import * as codex from './codex.mjs';
import * as nemotron from './nemotron.mjs';
import { PROVIDER_STATUS } from './base.mjs';

export { PROVIDER_STATUS } from './base.mjs';
export { detectCapability, classifyProviderOutput, runAgentProcess, DEFAULT_AGENT_TIMEOUT_MS } from './base.mjs';

export const ADAPTERS = Object.freeze({
  [claudeCode.PROVIDER_ID]: claudeCode,
  [codex.PROVIDER_ID]: codex,
  [nemotron.PROVIDER_ID]: nemotron,
});

/**
 * Router-Rolle -> Provider + Modellklasse.
 * ChatGPT Work kommt hier bewusst nicht vor: keine Laufzeit-Abhaengigkeit.
 *
 * NEMOTRON_REVIEW ist bewusst NICHT Teil eines automatischen Klassenprofils
 * in router.mjs. Es ist ein reiner Cloud-Chat-Endpoint ohne Datei-Werkzeuge
 * und ohne SLA (Free-Tier-Ratelimit ~40 req/min) - eine neue Vertrauens- und
 * Datenabfluss-Grenze gegenueber den lokalen CLIs. Die Rolle wird deshalb nur
 * ueber eine ausdrueckliche `--reviewer NEMOTRON_REVIEW`-Operator-Entscheidung
 * aktiv (siehe ai-control.mjs cmdRoute, analog zum `--implementer`-Override),
 * niemals automatisch. Siehe docs/AI_ROUTER.md.
 */
export const ROLE_MAP = Object.freeze({
  SCRIPT: { provider: null, model: null },
  CODEX_LIGHT: { provider: 'CODEX', model: null },
  CODEX_MEDIUM: { provider: 'CODEX', model: null },
  CLAUDE_STRONG: { provider: 'CLAUDE_CODE', model: null },
  CLAUDE_HAIKU: { provider: 'CLAUDE_CODE', model: 'haiku' },
  CLAUDE_SONNET: { provider: 'CLAUDE_CODE', model: 'sonnet' },
  NEMOTRON_REVIEW: { provider: 'NEMOTRON', model: nemotron.DEFAULT_MODEL },
});

/** Fallback-Partner fuer einen regelbasierten Wechsel (nicht bei 429). */
const SWITCH_PARTNER = Object.freeze({ CODEX: 'CLAUDE_CODE', CLAUDE_CODE: 'CODEX' });

/** Fehlerklassen, die ueberhaupt einen Providerwechsel rechtfertigen koennen. */
const SWITCH_ELIGIBLE_STATUSES = new Set(['FAILED']);

export function resolveRole(role) {
  return ROLE_MAP[String(role ?? '').toUpperCase()] ?? null;
}

export function detectProvider(provider, { run, cwd } = {}) {
  const id = String(provider ?? '').toUpperCase();
  const adapter = ADAPTERS[id];
  if (!adapter) {
    return { provider: id || 'UNKNOWN', status: PROVIDER_STATUS.UNAVAILABLE, reason: `Unbekannter Provider: ${id || '-'}`, missingFlags: [], helpSeen: false };
  }
  try {
    return adapter.detect({ run, cwd });
  } catch (error) {
    return { provider: id, status: PROVIDER_STATUS.FAILED, reason: `Capability-Pruefung fehlgeschlagen: ${error.message}`, missingFlags: [], helpSeen: false };
  }
}

/**
 * Fuehrt fuer alle bekannten Provider eine ungefaehrliche Capability-Pruefung aus.
 * @returns {Record<string, {provider: string, status: string, reason: string|null}>}
 */
export function detectProviders({ run, cwd, providers = Object.keys(ADAPTERS) } = {}) {
  const detected = {};
  for (const provider of [...new Set(providers.map(value => String(value).toUpperCase()))]) {
    detected[provider] = detectProvider(provider, { run, cwd });
  }
  return detected;
}

/**
 * Pro Orchestrator-Lauf wird ein Provider erst beim ersten echten Bedarf
 * geprueft. Weitere Phasen desselben Laufs verwenden das Ergebnis erneut.
 */
export function createLazyProviderDetector({ run, cwd, onDetect = () => {} } = {}) {
  const detected = {};
  return {
    get(provider, { fresh = false } = {}) {
      const id = String(provider ?? '').toUpperCase();
      if (fresh) delete detected[id];
      if (!Object.hasOwn(detected, id)) {
        detected[id] = detectProvider(id, { run, cwd });
        onDetect(detected[id]);
      }
      return detected[id];
    },
    snapshot() { return { ...detected }; },
  };
}

/**
 * Entscheidet, ob nach einem Fehlversuch ein Providerwechsel zulaessig ist.
 *
 * Zulaessig NUR wenn:
 * - der Fehler eine echte fachliche/technische Fehlklasse ist (FAILED),
 * - der Zielprovider verfuegbar ist,
 * - und die Versuche fuer den aktuellen Provider ausgeschoepft sind.
 *
 * Nicht zulaessig bei RATE_LIMITED, TIMEOUT, AUTH_REQUIRED, UNAVAILABLE,
 * SECURITY_STOP oder BLOCKED.
 */
export function decideProviderSwitch({ currentProvider, result, attempts, maxAttempts, detected = {} }) {
  const status = result?.status;
  if (status === 'RATE_LIMITED') {
    return { allowed: false, reason: 'RATE_LIMIT_NO_SWITCH', detail: '429/Quota wird nicht durch Providerwechsel geloest' };
  }
  if (status === 'SECURITY_STOP') return { allowed: false, reason: 'SECURITY_STOP', detail: 'Sicherheitsstop wird nie umgangen' };
  if (status === 'AUTH_REQUIRED') return { allowed: false, reason: 'AUTH_REQUIRED', detail: 'Login fehlt; Wechsel loest das nicht' };
  if (status === 'TIMEOUT' || status === 'BLOCKED') {
    return { allowed: false, reason: 'EXTERNAL_BLOCK_NO_SWITCH', detail: 'Netzwerk-/Upstream-Fehler rechtfertigen keinen Wechsel' };
  }
  if (!SWITCH_ELIGIBLE_STATUSES.has(status)) return { allowed: false, reason: 'STATUS_NOT_ELIGIBLE', detail: `Status ${status ?? '-'} erlaubt keinen Wechsel` };
  if (attempts < maxAttempts) return { allowed: false, reason: 'ATTEMPTS_REMAINING', detail: 'Erst die Versuche des aktuellen Providers ausschoepfen' };

  const target = SWITCH_PARTNER[currentProvider];
  if (!target) return { allowed: false, reason: 'NO_PARTNER', detail: `Kein Wechselpartner fuer ${currentProvider}` };
  if (detected[target]?.status !== PROVIDER_STATUS.AVAILABLE) {
    return { allowed: false, reason: 'TARGET_UNAVAILABLE', detail: `${target} ist nicht verfuegbar` };
  }
  return { allowed: true, reason: 'ELIGIBLE_AFTER_EXHAUSTED_ATTEMPTS', target };
}

/**
 * Startet einen Agenten fuer eine Router-Rolle.
 * Ist der Provider nicht verfuegbar, wird KEIN Ersatz gewaehlt - der Aufrufer
 * bekommt ein UNAVAILABLE-Resultat und stoppt sauber.
 */
export function runRole({ role, prompt, agentRole, mode = 'READ_ONLY', cwd, timeoutMs, run, context = {}, detected = null, getCapability = null }) {
  const mapping = resolveRole(role);
  if (!mapping || !mapping.provider) {
    return {
      schemaVersion: 1, provider: 'SCRIPT', role: agentRole ?? 'IMPLEMENTER', status: 'BLOCKED',
      summary: '', changedFiles: [], tests: { status: 'NOT_RUN', commands: [], passed: null, failed: null, summary: '' },
      findings: [], blockers: [`Rolle ${role} ist kein KI-Provider (deterministisches Script erforderlich)`],
      git: { branch: context.branch ?? null, head: context.head ?? null }, actualOperations: null, resources: [],
      startedAt: null, finishedAt: null, durationMs: null, exitCode: null, retryable: false,
      workspace: cwd ?? null, diffFingerprint: null, output: '',
    };
  }
  const adapter = ADAPTERS[mapping.provider];
  const capability = detected?.[mapping.provider]
    ?? (typeof getCapability === 'function' ? getCapability(mapping.provider) : adapter.detect({ run, cwd }));
  if (capability.status !== PROVIDER_STATUS.AVAILABLE) {
    return {
      schemaVersion: 1, provider: mapping.provider, role: agentRole ?? 'IMPLEMENTER',
      status: capability.status === PROVIDER_STATUS.AUTH_REQUIRED ? 'AUTH_REQUIRED' : 'UNAVAILABLE',
      summary: '', changedFiles: [], tests: { status: 'NOT_RUN', commands: [], passed: null, failed: null, summary: '' },
      findings: [], blockers: [capability.reason ?? `${mapping.provider} ist nicht verfuegbar`],
      git: { branch: context.branch ?? null, head: context.head ?? null }, actualOperations: null, resources: [],
      startedAt: null, finishedAt: null, durationMs: null, exitCode: null, retryable: false,
      workspace: cwd ?? null, diffFingerprint: null, output: '',
    };
  }
  return adapter.run({ prompt, role: agentRole, mode, model: mapping.model, cwd, timeoutMs, run, context });
}
