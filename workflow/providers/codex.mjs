/**
 * Provideradapter: Codex CLI (lokal, non-interactive).
 *
 * Non-interactive Aufruf ueber `codex exec`. Wie beim Claude-Adapter prueft
 * `detect()` zuerst, ob der Subcommand im Help-Text existiert. Fehlt er, gilt
 * der Provider als UNAVAILABLE - es wird nichts installiert und nichts geraten.
 */

import { DEFAULT_AGENT_TIMEOUT_MS, PROVIDER_STATUS, detectCapability, runAgentProcess } from './base.mjs';
import { runBounded } from '../core.mjs';

export const PROVIDER_ID = 'CODEX';
export const COMMAND = 'codex';

const REQUIRED_FLAGS = ['exec'];

export function detect({ run = runBounded, cwd, probeAuth = true } = {}) {
  const capability = detectCapability({ command: COMMAND, requiredFlags: REQUIRED_FLAGS, run, cwd });
  if (capability.status !== PROVIDER_STATUS.AVAILABLE || !probeAuth) return { provider: PROVIDER_ID, ...capability };

  // `codex auth status` existiert nicht. `codex login status` prueft den
  // lokalen Login ohne Agenten- oder Modellaufruf.
  const auth = run(COMMAND, ['login', 'status'], { cwd, timeoutMs: 20_000 });
  const output = `${auth.stdout ?? ''}\n${auth.stderr ?? ''}`;
  if (/\b(not logged in|please (?:run )?codex login|authentication required|unauthorized|invalid api key)\b/i.test(output)) {
    return { provider: PROVIDER_ID, ...capability, status: PROVIDER_STATUS.AUTH_REQUIRED, reason: 'codex ist installiert, aber nicht angemeldet (codex login)' };
  }
  if (auth.exitCode !== 0 || auth.spawnError || auth.timedOut) {
    return { provider: PROVIDER_ID, ...capability, status: PROVIDER_STATUS.FAILED, reason: 'codex login status konnte nicht erfolgreich ausgefuehrt werden' };
  }
  return { provider: PROVIDER_ID, ...capability };
}

export function buildArgs({ prompt, mode = 'READ_ONLY', model = null, cwd = null }) {
  const args = ['exec'];
  if (model) args.push('--model', model);
  if (cwd) args.push('--cd', cwd);
  // read-only fuer Reviewer/Analyse, workspace-write fuer Implementer/Corrector.
  // Niemals "danger-full-access".
  args.push('--sandbox', mode === 'WRITE' ? 'workspace-write' : 'read-only');
  args.push(prompt);
  return args;
}

export function run({
  prompt, role, mode = 'READ_ONLY', model = null, cwd,
  timeoutMs = DEFAULT_AGENT_TIMEOUT_MS, run: runner = runBounded, context = {},
}) {
  return runAgentProcess({
    provider: PROVIDER_ID,
    role,
    command: COMMAND,
    args: buildArgs({ prompt, mode, model, cwd }),
    cwd,
    timeoutMs,
    run: runner,
    context: { ...context, provider: PROVIDER_ID, model },
  });
}

export default { PROVIDER_ID, COMMAND, PROVIDER_STATUS, detect, run, buildArgs };
