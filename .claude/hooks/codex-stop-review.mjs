import fs from 'node:fs';
import path from 'node:path';
import { runCodexReview, runReviewStep } from '../../automation/core/cli-agent-cycle.mjs';
import { clearClaudeSessionState, readClaudeSessionState, writeClaudeSessionState } from '../../automation/core/claude-session-state.mjs';
import { buildModelPlan, describeStep, resolveCodexBinary } from '../../workflow/model-matrix.mjs';

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

function block(reason) {
  process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
}

// Bis 2026-09-08 verschwand jeder Infrastrukturfehler hier still (Exit 0):
// `codex` lag nicht im PATH, 0 von 17 Laeufen hatten ein Review. Ein Fehler
// wird jetzt sichtbar protokolliert; er blockiert die Session weiterhin nicht.
function recordReviewFailure({ projectDir, taskId, error }) {
  try {
    const dir = path.join(projectDir, '.router', 'agent-runs', taskId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'review-error.txt'), `${new Date().toISOString()}\n${error?.name ?? 'Error'}: ${error?.message ?? error}\n`, 'utf8');
  } catch { /* Protokoll darf den Hook nicht sprengen. */ }
  process.stderr.write(`Codex-Stop-Review nicht verfuegbar: ${error?.name ?? 'Error'}: ${String(error?.message ?? '').slice(0, 300)}\n`);
}

let projectDir = process.cwd();
let currentTaskId = 'CLAUDE-HOOK-UNKNOWN';
try {
  if (process.env.TP_AGENT_LOOP_ACTIVE === '1') process.exit(0);
  const input = await stdinJson();
  if (input.hook_event_name !== 'Stop') process.exit(0);
  projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const current = readClaudeSessionState({ sessionId: input.session_id, projectDir });
  if (!current?.state || current.state.status === 'PASS') process.exit(0);
  const taskClass = current.state.taskClass ?? 'B';
  const plan = current.state.plan ?? buildModelPlan(taskClass);
  currentTaskId = current.state.taskId ?? currentTaskId;
  // Klasse A: deterministische Pruefung reicht, kein Modell-Review.
  if (!plan.reviewer) {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
    process.exit(0);
  }
  if (!resolveCodexBinary()) {
    throw new Error('codex-Binary nicht gefunden (CODEX_CLI_PATH setzen oder ChatGPT-Desktop installieren)');
  }
  const reviews = Number(current.state.reviews ?? 0);
  if (reviews >= 3) {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
    block('Human Gate: Nach drei unabhängigen Review-Runden bestehen noch Befunde. Berichte die verbleibenden Befunde und stoppe weitere automatische Änderungen.');
    process.exit(0);
  }
  // Runde 1 und 2: Reviewer der Matrix. Runde 3: zweiter unabhaengiger Blick
  // (sofern die Klasse einen vorsieht), damit nicht dreimal dasselbe Modell
  // dieselben Befunde wiederholt.
  const reviewStep = reviews >= 2 && plan.secondReviewer ? plan.secondReviewer : plan.reviewer;
  const taskId = `${current.state.taskId}-AUTO-R${reviews + 1}`;
  const result = runReviewStep({
    review: runCodexReview,
    reviewStep,
    authorModel: plan.primary?.model ?? null,
    taskFile: current.state.handoffPath,
    taskId,
    cwd: projectDir,
    onState: event => process.stderr.write(`Review-Fallback: ${event.from} -> ${event.to} (${event.reason})\n`),
  });
  writeClaudeSessionState({
    sessionId: input.session_id,
    projectDir,
    state: { ...current.state, reviews: reviews + 1, status: result.status, lastReviewPath: result.outputPath, lastReviewer: `${result.reviewer}:${result.model ?? 'default'}` },
  });
  if (result.status === 'PASS') {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
    process.exit(0);
  }
  if (result.status === 'HUMAN_GATE') {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
    block(`Human Gate aus unabhängiger Prüfung (${result.reviewer} ${describeStep(reviewStep)}): ${result.summary}`);
    process.exit(0);
  }
  block(`Unabhängige Prüfung (${result.reviewer} ${describeStep(reviewStep)}, Runde ${reviews + 1}/3) verlangt Korrekturen. Behebe diese Befunde mit dem Implementer-Modell der Matrix (${describeStep(plan.corrector)}), führe passende Tests erneut aus und versuche erst danach abzuschließen:\n${JSON.stringify(result.findings, null, 2)}`);
} catch (error) {
  // Ein Infrastrukturfehler darf Claude nicht in einer Stop-Hook-Schleife festhalten.
  recordReviewFailure({ projectDir, taskId: currentTaskId, error });
  process.exit(0);
}
