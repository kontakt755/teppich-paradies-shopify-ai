/**
 * Provideradapter: NVIDIA Nemotron (NIM-API, Cloud, HTTP statt lokaler CLI).
 *
 * Anders als Claude Code und Codex ist Nemotron kein lokaler Agent mit
 * eigenen Datei-Werkzeugen (Read/Grep/Glob/Edit) - es ist ein reiner
 * Chat-Completion-Endpoint ohne jeden Repo-Zugriff. Dieser Adapter laeuft
 * deshalb bewusst NUR lesend (READ_ONLY): ein WRITE-Handoff waere ein
 * Verdrahtungsfehler in ROLE_MAP/router.mjs und wird hart abgewiesen statt
 * stillschweigend wie READ_ONLY behandelt zu werden.
 *
 * Neue Vertrauensgrenze: anders als die lokalen CLIs (eigene Abos, kein
 * Netzwerk-Tool) geht der Prompt an einen dritten Cloud-Anbieter ueber das
 * Internet. Der Aufrufer (Router-Profile, `--reviewer`-Override) ist dafuer
 * verantwortlich, dieser Rolle niemals Aufgaben zuzuweisen, deren Diff
 * templates/product*.json, config/settings_data.json oder Kundendaten
 * enthalten koennte - siehe docs/AI_ROUTER.md.
 *
 * Free-Tier-Realitaet (Stand der Recherche): ~40 Requests/Minute, API-Key
 * 6 Monate gueltig, kein SLA. Deshalb NIE ein automatischer Fallback-Partner
 * in providers/index.mjs - ein Rate Limit oder Ausfall stoppt sauber, wie bei
 * jedem anderen Provider auch.
 */

import { PROVIDER_STATUS } from './base.mjs';
import { normalizeAgentResult } from '../agent-result.mjs';
import { extractAgentResult } from './parse-result.mjs';

export const PROVIDER_ID = 'NEMOTRON';
// Per NEMOTRON_MODEL in .env ueberschreibbar, ohne Codeaenderung - z. B. um
// nvidia/nemotron-3.5-lightning-30b-a3b (kleiner, fuer Agent-Workloads
// beworben, Stand 2026-08-11) gegen den bisherigen Standard zu vergleichen.
// Ein einzelner eigener Vergleichslauf war uneindeutig (Lightning langsamer
// als Super), deshalb bleibt der Standard unveraendert - siehe docs/AI_ROUTER.md.
export const DEFAULT_MODEL = process.env.NEMOTRON_MODEL?.trim() || 'nvidia/nemotron-3-super-120b-a12b';
export const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const DEFAULT_TIMEOUT_MS = 5 * 60_000;
export const API_KEY_ENV_VAR = 'NVIDIA_API_KEY';

/**
 * Kredit-freie Capability-Pruefung: es wird nur geprueft, ob ein API-Key
 * gesetzt ist - niemals ein echter Modellaufruf (kostet sonst Free-Tier-
 * Kontingent, nur um "verfuegbar?" zu beantworten). Ein gesetzter Key kann
 * trotzdem ungueltig sein; das zeigt sich erst beim ersten echten Aufruf
 * (dort wird AUTH_REQUIRED aus dem HTTP-Status abgeleitet).
 */
export function detect({ env = process.env } = {}) {
  const key = String(env[API_KEY_ENV_VAR] ?? '').trim();
  if (!key) {
    return {
      provider: PROVIDER_ID,
      status: PROVIDER_STATUS.AUTH_REQUIRED,
      command: null,
      reason: `${API_KEY_ENV_VAR} fehlt (.env). Ohne Key ist Nemotron nicht nutzbar.`,
      missingFlags: [],
      helpSeen: false,
    };
  }
  return { provider: PROVIDER_ID, status: PROVIDER_STATUS.AVAILABLE, command: null, reason: null, missingFlags: [], helpSeen: true };
}

/** Bildet einen HTTP-Status auf dieselben Statusklassen wie classifyProviderOutput() ab. */
function classifyHttpStatus(status) {
  if (status === 401 || status === 403) return PROVIDER_STATUS.AUTH_REQUIRED;
  if (status === 429) return PROVIDER_STATUS.RATE_LIMITED;
  if (status >= 500) return 'BLOCKED';
  if (status >= 400) return PROVIDER_STATUS.FAILED;
  return PROVIDER_STATUS.AVAILABLE;
}

export async function run({
  prompt,
  role,
  mode = 'READ_ONLY',
  model = DEFAULT_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  context = {},
  env = process.env,
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
}) {
  const startedAt = new Date().toISOString();
  const enrichedContext = { ...context, provider: PROVIDER_ID, model };
  // Reihenfolge ist sicherheitsrelevant: eigene Metadaten (provider/role/
  // Zeitstempel) stehen NACH ...value, damit sie nie von Feldern
  // ueberschrieben werden koennen, die im Modelltext selbst auftauchen.
  const finish = value => normalizeAgentResult({ ...value, provider: PROVIDER_ID, role, startedAt, finishedAt: new Date().toISOString() }, enrichedContext);

  if (mode === 'WRITE') {
    return finish({
      status: 'BLOCKED',
      blockers: ['Nemotron hat keine Datei-Werkzeuge und darf nie im WRITE-Modus laufen (Implementer-Rolle gehoert nicht auf NEMOTRON).'],
    });
  }

  const apiKey = String(env[API_KEY_ENV_VAR] ?? '').trim();
  if (!apiKey) {
    return finish({ status: 'AUTH_REQUIRED', blockers: [`${API_KEY_ENV_VAR} fehlt (.env)`] });
  }
  if (typeof fetchImpl !== 'function') {
    return finish({ status: 'UNAVAILABLE', blockers: ['Kein fetch verfuegbar in dieser Laufzeitumgebung.'] });
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response = null;
  let bodyText = '';
  let networkError = null;
  try {
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: controller?.signal,
    });
    bodyText = await response.text();
  } catch (error) {
    networkError = error;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (networkError) {
    const timedOut = networkError.name === 'AbortError';
    // retryable gilt nur fuer TIMEOUT: normalizeAgentResult() erzwingt fuer
    // UNAVAILABLE ohnehin false (siehe NON_RETRYABLE_STATUSES) - konsistent mit
    // "ein nicht startbarer Provider loest nie automatisch einen Retry aus".
    return finish({
      status: timedOut ? 'TIMEOUT' : 'UNAVAILABLE',
      retryable: timedOut,
      blockers: [timedOut ? `Nemotron-Aufruf ueberschritt ${timeoutMs} ms` : `Nemotron nicht erreichbar: ${networkError.message}`],
    });
  }

  const classification = classifyHttpStatus(response.status);
  if (classification === PROVIDER_STATUS.AUTH_REQUIRED) {
    return finish({ status: 'AUTH_REQUIRED', blockers: [`Nemotron lehnt den API-Key ab (HTTP ${response.status})`] });
  }
  if (classification === PROVIDER_STATUS.RATE_LIMITED) {
    return finish({ status: 'RATE_LIMITED', retryable: true, blockers: ['Nemotron meldet ein Rate Limit (HTTP 429, Free Tier ~40 req/min)'] });
  }
  if (classification === 'BLOCKED') {
    return finish({ status: 'BLOCKED', retryable: true, blockers: [`Nemotron meldet einen Upstream-Fehler (HTTP ${response.status})`] });
  }
  if (classification === PROVIDER_STATUS.FAILED) {
    return finish({ status: 'FAILED', blockers: [`Nemotron-Anfrage fehlgeschlagen (HTTP ${response.status})`] });
  }

  let content = '';
  try {
    content = JSON.parse(bodyText)?.choices?.[0]?.message?.content ?? '';
  } catch {
    // Ungueltiges JSON in der Antwort - faellt unten auf FAILED zurueck, kein Raten.
  }

  const parsed = extractAgentResult(content);
  if (!parsed) {
    return finish({ status: 'FAILED', output: content, blockers: ['Nemotron lieferte kein auswertbares AGENT_RESULT. Kein PASS ohne Resultatblock.'] });
  }
  return finish({ ...parsed, status: parsed.status, output: content });
}

export default { PROVIDER_ID, DEFAULT_MODEL, DEFAULT_BASE_URL, API_KEY_ENV_VAR, PROVIDER_STATUS, detect, run };
