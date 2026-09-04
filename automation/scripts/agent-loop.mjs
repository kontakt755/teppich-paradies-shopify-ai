import { runCliAgentCycle, runReviewOnly } from '../core/cli-agent-cycle.mjs';
import { loadLocalOpenRouterEnvironment } from '../core/local-openrouter-env.mjs';

const EVENT_PREFIX = '@@TP_EVENT@@';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

try {
  loadLocalOpenRouterEnvironment();
  const onState = event => process.stderr.write(`${EVENT_PREFIX}${JSON.stringify(event)}\n`);
  const reviewOnly = process.argv.includes('--review-only');
  let result;
  if (reviewOnly) {
    // Retries only the independent Codex review after a technical reviewer
    // failure. Never spawns Claude again, so this cannot trigger Claude API cost.
    const taskText = argument('--task');
    const candidateText = argument('--candidate-file') ? await (await import('node:fs')).promises.readFile(argument('--candidate-file'), 'utf8') : argument('--candidate') ?? '';
    if (!taskText) throw new Error('Missing --task');
    result = runReviewOnly({ taskText, taskType: argument('--task-type') ?? 'IMPLEMENTATION', candidateText, taskId: argument('--task-id') ?? `REVIEW-${Date.now()}`, onState });
  } else {
    const task = argument('--task');
    if (!task) throw new Error('Missing --task');
    const maxReviewRounds = Number(argument('--max-review-rounds') ?? 3);
    result = await runCliAgentCycle({
      task,
      taskId: argument('--task-id') ?? `AGENT-${Date.now()}`,
      maxReviewRounds,
      forceTaskType: argument('--task-type'),
      previousRisk: argument('--previous-risk'),
      onState,
    });
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 2;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
