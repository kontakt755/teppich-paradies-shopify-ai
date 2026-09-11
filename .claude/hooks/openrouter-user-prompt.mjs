import crypto from 'node:crypto';
import path from 'node:path';
import { prepareClaudeBridge } from '../../automation/core/claude-bridge.mjs';
import { buildClaudeHookContext, shouldRouteClaudePrompt } from '../../automation/core/claude-hook-policy.mjs';
import { loadLocalOpenRouterEnvironment } from '../../automation/core/local-openrouter-env.mjs';
import { clearClaudeSessionState, ensureClaudeSessionBaseline, writeClaudeSessionState } from '../../automation/core/claude-session-state.mjs';
import { captureWorkingTreeSnapshot, currentCommit, resolveReviewDir } from '../../automation/core/review-scope.mjs';
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
  if (input.hook_event_name !== 'UserPromptSubmit') process.exit(0);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  // Baseline vorbestehender Dateien (2026-09-11): Was beim ersten Prompt schon
  // geaendert oder unversioniert im Working Tree liegt, gehoert nicht zu dieser
  // Sitzung und wird im Review ausgeklammert, solange es exakt so bleibt. Vor
  // dem Routing-Gate, damit auch ein nicht gerouteter erster Prompt ("ok")
  // sie anlegt; im Arbeitsverzeichnis der Sitzung, in dem der Stop-Hook spaeter
  // prueft (resolveReviewDir). Ein Fehler hier darf das Routing nie verhindern -
  // ohne Baseline wird nur nichts ausgeklammert.
  try {
    ensureClaudeSessionBaseline({
      sessionId: input.session_id,
      projectDir,
      capture: () => captureWorkingTreeSnapshot({ cwd: resolveReviewDir({ projectDir, sessionCwd: input.cwd }) }),
    });
  } catch { /* fail-safe, siehe oben */ }
  if (!shouldRouteClaudePrompt(prompt)) process.exit(0);
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
  // Reine Frage (2026-09-11): trotzdem Session-State, aber mit
  // reviewOnlyIfChanged - der Stop-Hook prueft nur, wenn die Sitzung seit der
  // Frage tatsaechlich etwas geaendert hat. promptBaseline haelt dafuer den
  // Working Tree bei Eingang der Frage fest: sonst loeste eine Rueckfrage nach
  // bereits geprueften, noch uncommitteten Aenderungen erneut Codex-Runden
  // gegen eine Wissensfrage aus - genau der Fehler, der hier behoben wird.
  const question = result.classified?.taskTypeSource === 'QUESTION';
  if (result.status === 'READY' && (result.classified.taskType === 'IMPLEMENTATION' || question)) {
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
    writeClaudeSessionState({
      sessionId: input.session_id,
      projectDir,
      state: {
        taskId: result.classified.id, handoffPath: result.handoffPath, reviews: 0, status: 'PENDING_REVIEW', taskClass, plan, startCommit,
        taskType: result.classified.taskType, taskTypeSource: result.classified.taskTypeSource,
        ...(question ? { reviewOnlyIfChanged: true, promptBaseline: captureWorkingTreeSnapshot({ cwd: reviewDir }) } : {}),
      },
    });
  } else {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
  }
  printContext(buildClaudeHookContext({ ...result, routing }));
} catch {
  process.exit(0);
}
