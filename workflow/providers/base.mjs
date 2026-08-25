/**
 * Gemeinsame Basis fuer alle Provideradapter (Phase 3).
 *
 * Enthaelt Capability Detection, Fehlerklassifikation und die Uebersetzung
 * eines Prozessergebnisses in ein normalisiertes Agentenresultat.
 */

import { runBounded } from '../core.mjs';
import { normalizeAgentResult } from '../agent-result.mjs';
import { extractAgentResult } from './parse-result.mjs';

export const PROVIDER_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  FAILED: 'FAILED',
});

export const DEFAULT_AGENT_TIMEOUT_MS = 15 * 60_000;
const DETECTION_TIMEOUT_MS = 20_000;

const AUTH_PATTERN = /\b(not logged in|nicht angemeldet|please (?:run )?login|authentication required|unauthorized|401|invalid api key|no api key|missing api key|credentials? (?:not found|missing)|run [`'"]?\w+ login)\b/i;
const RATE_LIMIT_PATTERN = /\b(429|rate limit|too many requests|quota (?:exceeded|exhausted)|usage limit|overloaded|capacity)\b/i;
const UPSTREAM_PATTERN = /\b(503|502|504|service unavailable|bad gateway|gateway timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|network (?:error|timeout))\b/i;

/**
 * Klassifiziert die Rohausgabe eines Providerlaufs.
 * Wichtig: RATE_LIMITED wird NIE zu FAILED degradiert - der Orchestrator muss
 * den Unterschied sehen, um keinen unerlaubten Providerwechsel auszuloesen.
 */
export function classifyProviderOutput({ exitCode, stdout = '', stderr = '', timedOut = false, spawnError = null }) {
  if (spawnError?.code === 'ENOENT') return PROVIDER_STATUS.UNAVAILABLE;
  if (timedOut) return 'TIMEOUT';
  const output = `${stdout}\n${stderr}`;
  if (AUTH_PATTERN.test(output)) return PROVIDER_STATUS.AUTH_REQUIRED;
  if (RATE_LIMIT_PATTERN.test(output)) return PROVIDER_STATUS.RATE_LIMITED;
  if (UPSTREAM_PATTERN.test(output)) return 'BLOCKED';
  return exitCode === 0 ? PROVIDER_STATUS.AVAILABLE : PROVIDER_STATUS.FAILED;
}

/**
 * Prueft ungefaehrlich, ob ein CLI vorhanden und nutzbar ist.
 * Installiert nichts. Startet keine Session. Fuehrt nur `--help` aus.
 *
 * @param {object} options
 * @param {string} options.command CLI-Name, z.B. "claude"
 * @param {string[]} [options.requiredFlags] Flags, die im Help-Text vorkommen muessen
 * @param {function} [options.run] Injizierbar fuer Tests
 */
export function detectCapability({ command, requiredFlags = [], run = runBounded, cwd = undefined }) {
  const result = run(command, ['--help'], { cwd, timeoutMs: DETECTION_TIMEOUT_MS });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  if (result.spawnError?.code === 'ENOENT') {
    return { status: PROVIDER_STATUS.UNAVAILABLE, command, reason: `${command} ist nicht im PATH`, missingFlags: [], helpSeen: false };
  }
  if (result.timedOut) {
    return { status: PROVIDER_STATUS.UNAVAILABLE, command, reason: `${command} --help lief in den Timeout`, missingFlags: [], helpSeen: false };
  }
  if (result.spawnError) {
    return { status: PROVIDER_STATUS.UNAVAILABLE, command, reason: `${command} nicht startbar: ${result.spawnError.code ?? result.spawnError.name}`, missingFlags: [], helpSeen: false };
  }
  if (AUTH_PATTERN.test(output)) {
    return { status: PROVIDER_STATUS.AUTH_REQUIRED, command, reason: `${command} verlangt einen Login`, missingFlags: [], helpSeen: true };
  }
  // Manche CLIs geben --help mit Exit != 0 aus. Entscheidend ist brauchbarer Output.
  if (!output.trim()) {
    return { status: PROVIDER_STATUS.UNAVAILABLE, command, reason: `${command} --help lieferte keine Ausgabe`, missingFlags: [], helpSeen: false };
  }
  const missingFlags = requiredFlags.filter(flag => !output.includes(flag));
  if (missingFlags.length) {
    return {
      status: PROVIDER_STATUS.UNAVAILABLE,
      command,
      reason: `${command} unterstuetzt den benoetigten Non-Interactive-Modus nicht (fehlend: ${missingFlags.join(', ')})`,
      missingFlags,
      helpSeen: true,
    };
  }
  return { status: PROVIDER_STATUS.AVAILABLE, command, reason: null, missingFlags: [], helpSeen: true };
}

/**
 * Fuehrt einen Provider-Prozess aus und normalisiert das Ergebnis.
 * Der Adapter liefert `command` und `args`; alles Weitere ist gemeinsam.
 */
export function runAgentProcess({
  provider, role, command, args, cwd, env = process.env,
  timeoutMs = DEFAULT_AGENT_TIMEOUT_MS, run = runBounded, context = {},
  // Prompt ueber stdin statt als Argument - siehe claude-code.mjs.
  input = undefined,
}) {
  const raw = run(command, args, { cwd, env, timeoutMs, input });
  const classification = classifyProviderOutput(raw);
  const rawText = `${raw.stdout ?? ''}\n${raw.stderr ?? ''}`;
  const base = {
    provider, role, exitCode: raw.exitCode, startedAt: raw.startedAt, finishedAt: raw.finishedAt,
    output: rawText,
  };

  if (classification === PROVIDER_STATUS.UNAVAILABLE) {
    return normalizeAgentResult({ ...base, status: 'UNAVAILABLE', blockers: [`${command} ist nicht verfuegbar`] }, context);
  }
  if (classification === PROVIDER_STATUS.AUTH_REQUIRED) {
    return normalizeAgentResult({ ...base, status: 'AUTH_REQUIRED', blockers: [`${command} verlangt einen Login`] }, context);
  }
  if (classification === PROVIDER_STATUS.RATE_LIMITED) {
    // Bewusst KEIN Providerwechsel-Hinweis: 429 wird nicht durch Umschalten geloest.
    return normalizeAgentResult({ ...base, status: 'RATE_LIMITED', retryable: true, blockers: [`${command} meldet ein Rate Limit`] }, context);
  }
  if (classification === 'TIMEOUT') {
    return normalizeAgentResult({ ...base, status: 'TIMEOUT', retryable: true, blockers: [`${command} ueberschritt ${timeoutMs} ms`] }, context);
  }
  if (classification === 'BLOCKED') {
    return normalizeAgentResult({ ...base, status: 'BLOCKED', retryable: true, blockers: [`${command} meldet einen Upstream-/Netzwerkfehler`] }, context);
  }

  const parsed = extractAgentResult(rawText);
  if (!parsed) {
    return normalizeAgentResult({
      ...base,
      status: 'FAILED',
      blockers: ['Agent lieferte kein auswertbares AGENT_RESULT. Kein PASS ohne Resultatblock.'],
    }, context);
  }
  return normalizeAgentResult({ ...parsed, ...base, status: parsed.status }, context);
}
