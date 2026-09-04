import path from 'node:path';
import { runCodexReview } from '../../automation/core/cli-agent-cycle.mjs';
import { clearClaudeSessionState, readClaudeSessionState, writeClaudeSessionState } from '../../automation/core/claude-session-state.mjs';

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

function block(reason) {
  process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
}

try {
  if (process.env.TP_AGENT_LOOP_ACTIVE === '1') process.exit(0);
  const input = await stdinJson();
  if (input.hook_event_name !== 'Stop') process.exit(0);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const current = readClaudeSessionState({ sessionId: input.session_id, projectDir });
  if (!current?.state || current.state.status === 'PASS') process.exit(0);
  const reviews = Number(current.state.reviews ?? 0);
  if (reviews >= 3) {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
    block('Human Gate: Nach drei unabhängigen Codex-Review-Runden bestehen noch Befunde. Berichte die verbleibenden Befunde und stoppe weitere automatische Änderungen.');
    process.exit(0);
  }
  const result = runCodexReview({
    taskFile: current.state.handoffPath,
    taskId: `${current.state.taskId}-AUTO-R${reviews + 1}`,
    cwd: projectDir,
  });
  writeClaudeSessionState({
    sessionId: input.session_id,
    projectDir,
    state: { ...current.state, reviews: reviews + 1, status: result.status, lastReviewPath: result.outputPath },
  });
  if (result.status === 'PASS') {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
    process.exit(0);
  }
  if (result.status === 'HUMAN_GATE') {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
    block(`Human Gate aus unabhängiger Codex-Prüfung: ${result.summary}`);
    process.exit(0);
  }
  block(`Unabhängige Codex-Prüfung verlangt Korrekturen. Behebe diese Befunde, führe passende Tests erneut aus und versuche erst danach abzuschließen:\n${JSON.stringify(result.findings, null, 2)}`);
} catch (error) {
  // Ein Infrastrukturfehler darf Claude nicht in einer Stop-Hook-Schleife festhalten.
  process.stderr.write(`Codex-Stop-Review nicht verfügbar: ${error.name}\n`);
  process.exit(0);
}
