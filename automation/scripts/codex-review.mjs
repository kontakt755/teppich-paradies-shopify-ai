import { runCodexReview } from '../core/cli-agent-cycle.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

try {
  const taskFile = argument('--task-file');
  const taskText = argument('--task');
  const result = runCodexReview({ taskFile, taskText, taskId: argument('--task-id') ?? `CLAUDE-REVIEW-${Date.now()}` });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 2;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
