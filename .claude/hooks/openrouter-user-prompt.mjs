import crypto from 'node:crypto';
import path from 'node:path';
import { prepareClaudeBridge } from '../../automation/core/claude-bridge.mjs';
import { buildClaudeHookContext, shouldRouteClaudePrompt } from '../../automation/core/claude-hook-policy.mjs';
import { loadLocalOpenRouterEnvironment } from '../../automation/core/local-openrouter-env.mjs';

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
  if (input.hook_event_name !== 'UserPromptSubmit' || !shouldRouteClaudePrompt(prompt)) process.exit(0);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  loadLocalOpenRouterEnvironment({ filePath: path.join(projectDir, '.env.local') });
  const digest = crypto.createHash('sha256').update(`${input.session_id ?? 'session'}\0${prompt}`).digest('hex').slice(0, 12);
  const result = await prepareClaudeBridge({ taskId: `CLAUDE-HOOK-${digest}`, task: prompt, outputDir: path.join(projectDir, '.router/claude-handoffs'), maxTokens: 256 });
  printContext(buildClaudeHookContext(result));
} catch {
  process.exit(0);
}
