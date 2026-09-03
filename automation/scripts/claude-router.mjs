import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { prepareClaudeBridge } from '../core/claude-bridge.mjs';
import { loadLocalOpenRouterEnvironment } from '../core/local-openrouter-env.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function required(name) {
  const value = argument(name);
  if (!value || value.startsWith('--')) throw new Error(`Missing ${name}`);
  return value;
}

try {
  loadLocalOpenRouterEnvironment();
  const task = required('--task');
  const taskId = argument('--task-id') ?? `CLAUDE-${Date.now()}`;
  const maxTokens = argument('--max-tokens') === null ? 256 : Number(argument('--max-tokens'));
  const result = await prepareClaudeBridge({ taskId, task, maxTokens });
  console.log(JSON.stringify(result, null, 2));
  if (process.argv.includes('--delegate') && result.status === 'READY') {
    const handoff = fs.readFileSync(result.handoffPath, 'utf8');
    const delegated = spawnSync('claude', ['-p', handoff], { cwd: process.cwd(), stdio: 'inherit', env: process.env });
    if (delegated.error) throw delegated.error;
    if (delegated.status !== 0) process.exitCode = delegated.status ?? 1;
  }
  if (result.status === 'HUMAN_GATE') process.exitCode = 2;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
