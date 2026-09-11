import crypto from 'node:crypto';
import path from 'node:path';
import { prepareClaudeBridge } from '../../automation/core/claude-bridge.mjs';
import { buildClaudeHookContext, shouldRouteClaudePrompt } from '../../automation/core/claude-hook-policy.mjs';
import { loadLocalOpenRouterEnvironment } from '../../automation/core/local-openrouter-env.mjs';
import { clearClaudeSessionState, writeClaudeSessionState } from '../../automation/core/claude-session-state.mjs';
import { currentCommit, resolveReviewDir, snapshotDirtyFiles } from '../../automation/core/review-scope.mjs';
import { classifyTask } from '../../workflow/router.mjs';
import { buildModelPlan } from '../../workflow/model-matrix.mjs';

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

function printContext(additionalContext) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } })}\n`);
}

try {
  const input = await stdinJson();
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (process.env.TP_AGENT_LOOP_ACTIVE === '1') process.exit(0);
  if (input.hook_event_name !== 'UserPromptSubmit' || !shouldRouteClaudePrompt(prompt)) process.exit(0);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  loadLocalOpenRouterEnvironment({ filePath: path.join(projectDir, '.env.local') });
  const digest = crypto.createHash('sha256').update(`${input.session_id ?? 'session'}\0${prompt}`).digest('hex').slice(0, 12);
  // Klasse und Modellplan aus der einen Quelle (workflow/model-matrix.mjs). Der
  // Stop-Hook liest den Plan spaeter aus dem Session-Zustand, damit Review-
  // Modell und Effort zur Klasse passen und Klasse A kein Modell-Review bekommt.
  const taskClass = classifyTask(prompt);
  const plan = buildModelPlan(taskClass);
  const routing = { taskClass, plan };
  if (taskClass === 'A') {
    // Trivial/deterministisch: keine Voranalyse durch ein Drittmodell, kein
    // Review-Zyklus. Ein Modell, eine deterministische Pruefung.
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
    printContext(buildClaudeHookContext({ status: 'READY_NO_BRIEF', routing }));
    process.exit(0);
  }
  // Vorher hart auf 256 codiert und ignorierte damit OPENROUTER_MAX_OUTPUT_TOKENS
  // aus .env.local vollstaendig - fast jede Vorabanalyse wurde deshalb mitten im
  // Satz abgeschnitten (stopReason max_tokens/length in .router/*.jsonl).
  const maxTokens = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS ?? 256);
  const result = await prepareClaudeBridge({ taskId: `CLAUDE-HOOK-${digest}`, task: prompt, outputDir: path.join(projectDir, '.router/claude-handoffs'), maxTokens });
  if (result.status === 'READY') {
    // HEAD bei Task-Start: der Stop-Hook prueft damit nur noch, was seit
    // diesem Moment entstand - nicht jeden Commit gegenueber origin/main, der
    // in einem geteilten Checkout auch von einer anderen, parallel laufenden
    // Sitzung stammen kann. null (kein Repo/Commit) faellt beim Review auf
    // das bisherige Verhalten zurueck, siehe review-scope.mjs.
    // Arbeitet die Sitzung in einem Worktree, ist der Startcommit dort ein
    // anderer als im Hauptcheckout, auf den CLAUDE_PROJECT_DIR zeigt. Wird er
    // im falschen Verzeichnis gelesen, prueft der Stop-Hook spaeter den Diff
    // einer fremden Sitzung (siehe resolveReviewDir).
    const reviewDir = resolveReviewDir({ projectDir, sessionCwd: input.cwd });
    const startCommit = currentCommit({ cwd: reviewDir });
    // Dasselbe fuer uncommittete Arbeit: welche Dateien lagen bei Task-Start
    // schon schmutzig im Checkout, mit welchem Inhalt? Bleiben sie unveraendert,
    // nimmt der Stop-Hook sie aus dem Pruefbereich - im geteilten Checkout sind
    // das meist Dateien einer anderen Sitzung (selectTaskChanges).
    const startDirty = snapshotDirtyFiles({ cwd: reviewDir });
    // Auch Fragen und Diagnosen (ANALYSIS) bekommen einen State: Der Stop-Hook
    // laesst das Review nur aus, wenn sich tatsaechlich nichts geaendert hat.
    // reviewTaskPath: Auftrag und Grenzen ohne die ungepruefte Voranalyse.
    writeClaudeSessionState({
      sessionId: input.session_id,
      projectDir,
      state: { taskId: result.classified.id, taskType: result.classified.taskType, handoffPath: result.handoffPath, reviewTaskPath: result.reviewTaskPath, reviews: 0, status: 'PENDING_REVIEW', taskClass, plan, startCommit, startDirty },
    });
  } else {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
  }
  printContext(buildClaudeHookContext({ ...result, routing }));
} catch {
  process.exit(0);
}
