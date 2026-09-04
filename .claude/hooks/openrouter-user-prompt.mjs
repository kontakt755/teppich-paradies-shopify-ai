import crypto from 'node:crypto';
import path from 'node:path';
import { prepareClaudeBridge } from '../../automation/core/claude-bridge.mjs';
import { buildClaudeHookContext, shouldRouteClaudePrompt } from '../../automation/core/claude-hook-policy.mjs';
import { loadLocalOpenRouterEnvironment } from '../../automation/core/local-openrouter-env.mjs';
import { clearClaudeSessionState, writeClaudeSessionState } from '../../automation/core/claude-session-state.mjs';

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
  // Vorher hart auf 256 codiert und ignorierte damit OPENROUTER_MAX_OUTPUT_TOKENS
  // aus .env.local vollstaendig - fast jede Vorabanalyse wurde deshalb mitten im
  // Satz abgeschnitten (stopReason max_tokens/length in .router/*.jsonl).
  const maxTokens = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS ?? 256);
  const result = await prepareClaudeBridge({ taskId: `CLAUDE-HOOK-${digest}`, task: prompt, outputDir: path.join(projectDir, '.router/claude-handoffs'), maxTokens });
  if (result.status === 'READY' && result.classified.taskType === 'IMPLEMENTATION') {
    writeClaudeSessionState({
      sessionId: input.session_id,
      projectDir,
      state: { taskId: result.classified.id, handoffPath: result.handoffPath, reviews: 0, status: 'PENDING_REVIEW' },
    });
  } else {
    clearClaudeSessionState({ sessionId: input.session_id, projectDir });
  }
  printContext(buildClaudeHookContext(result));
} catch {
  process.exit(0);
}
