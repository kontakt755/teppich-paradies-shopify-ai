/**
 * Provideradapter: Claude Code (lokal, non-interactive).
 *
 * Non-interactive Aufruf ueber `claude --print`. Der Adapter macht keine
 * Annahmen ueber die installierte Version: `detect()` prueft im Help-Text, ob
 * der benoetigte Print-Modus wirklich existiert, und meldet sonst UNAVAILABLE.
 * Es wird nie etwas installiert.
 */

import { DEFAULT_AGENT_TIMEOUT_MS, PROVIDER_STATUS, detectCapability, runAgentProcess } from './base.mjs';
import { runBounded } from '../core.mjs';

export const PROVIDER_ID = 'CLAUDE_CODE';
export const COMMAND = 'claude';

/** Flags, ohne die ein kontrollierter headless-Lauf nicht moeglich ist. */
const REQUIRED_FLAGS = ['--print'];

/** Lesend = Planmodus, kein Schreibzugriff. Schreibend = eng begrenzte Tools. */
const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'];
const WRITE_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write'];

export function detect({ run = runBounded, cwd, probeAuth = true } = {}) {
  const capability = detectCapability({ command: COMMAND, requiredFlags: REQUIRED_FLAGS, run, cwd });
  if (capability.status !== PROVIDER_STATUS.AVAILABLE || !probeAuth) return { provider: PROVIDER_ID, ...capability };

  // Reine lokale Login-Abfrage: Anders als die fruehere "bereit"-Probe wird
  // hierbei kein Modell gestartet und damit kein Claude-Kontingent verbraucht.
  const auth = run(COMMAND, ['auth', 'status'], { cwd, timeoutMs: 20_000 });
  const output = `${auth.stdout ?? ''}\n${auth.stderr ?? ''}`;
  let status = null;
  try { status = JSON.parse(auth.stdout ?? ''); } catch {}
  if (status?.loggedIn === false || /\b(not logged in|please run \/login|invalid api key|unauthorized|authentication required)\b/i.test(output)) {
    return { provider: PROVIDER_ID, ...capability, status: PROVIDER_STATUS.AUTH_REQUIRED, reason: 'claude ist installiert, aber nicht angemeldet (claude /login)' };
  }
  if (auth.exitCode !== 0 || auth.spawnError || auth.timedOut) {
    return { provider: PROVIDER_ID, ...capability, status: PROVIDER_STATUS.FAILED, reason: 'claude auth status konnte nicht erfolgreich ausgefuehrt werden' };
  }
  return { provider: PROVIDER_ID, ...capability };
}

/**
 * Der Prompt geht ueber stdin, NICHT als Argument.
 *
 * `--allowed-tools` ist variadisch und wuerde ein nachfolgendes
 * Prompt-Argument verschlucken ("Input must be provided either through stdin
 * or as a prompt argument"). Ausserdem sind die Prompts mehrere KB gross.
 */
export function buildArgs({ mode = 'READ_ONLY', model = null }) {
  const args = ['--print'];
  if (model) args.push('--model', model);
  // Schreibrechte bleiben eng: kein Bash, kein Netzwerk-Tool.
  // acceptEdits erlaubt genau die erlaubten Datei-Tools ohne Rueckfrage -
  // im Print-Modus gibt es keine Interaktion, sonst passiert gar nichts.
  // bypassPermissions wird bewusst NICHT verwendet.
  args.push('--permission-mode', mode === 'WRITE' ? 'acceptEdits' : 'plan');
  args.push('--allowed-tools', ...(mode === 'WRITE' ? WRITE_TOOLS : READ_ONLY_TOOLS));
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
    args: buildArgs({ mode, model }),
    input: prompt,
    cwd,
    timeoutMs,
    run: runner,
    context: { ...context, provider: PROVIDER_ID, model },
  });
}

export default { PROVIDER_ID, COMMAND, PROVIDER_STATUS, detect, run, buildArgs };
