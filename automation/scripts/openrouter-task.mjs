import fs from 'node:fs';
import { executeOpenRouterTask, DEFAULT_MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS } from '../core/openrouter-executor.mjs';
import { MODEL_CLASS, ROLE, routeTaskPolicy } from '../core/task-router.mjs';
import { loadLocalOpenRouterEnvironment } from '../core/local-openrouter-env.mjs';

const MODEL_BY_CLASS = Object.freeze({
  [MODEL_CLASS.LIGHT]: process.env.OPENROUTER_LIGHT_MODEL ?? 'cohere/north-mini-code:free',
  [MODEL_CLASS.STANDARD]: process.env.OPENROUTER_STANDARD_MODEL ?? 'poolside/laguna-s-2.1:free',
});

function usage() {
  console.error('Usage: node automation/scripts/openrouter-task.mjs --task-id ID --risk LOW|MEDIUM --task-type ANALYSIS|PLAN|IMPLEMENTATION|REVIEW|CORRECTION|TEST --prompt-file PATH [--max-tokens 16-1024]');
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value || value.startsWith('--')) throw new Error(`Missing ${name}`);
  return value;
}

function positiveInteger(value, fallback) {
  if (value === null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 16 || number > MAX_OUTPUT_TOKENS) throw new Error(`--max-tokens must be an integer from 16 to ${MAX_OUTPUT_TOKENS}`);
  return number;
}

try {
  loadLocalOpenRouterEnvironment();
  const taskId = requiredArgument('--task-id');
  const risk = requiredArgument('--risk').toUpperCase();
  const taskType = requiredArgument('--task-type').toUpperCase();
  const promptFile = requiredArgument('--prompt-file');
  const prompt = fs.readFileSync(promptFile, 'utf8').trim();
  if (!prompt) throw new Error('--prompt-file must not be empty');
  const policy = routeTaskPolicy({ id: taskId, risk, taskType, routing: { policyVersion: 2 }, allowedOperations: ['report_write'] });
  if (policy.autonomyLevel === 'HUMAN_GATE') throw new Error('HIGH-risk tasks are blocked before any OpenRouter request');
  const model = MODEL_BY_CLASS[policy.modelRequirement.class];
  if (!model) throw new Error(`No OpenRouter model configured for ${policy.modelRequirement.class}`);
  const result = await executeOpenRouterTask({
    taskId,
    role: ROLE.IMPLEMENTER,
    route: { provider: `OPENROUTER_${policy.modelRequirement.class}`, upstreamProvider: 'OPENROUTER', gateway: 'OPENROUTER', model, cacheSessionKey: `tp-${taskId.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}-worker`, sticky: true },
    system: 'Du arbeitest als Analyseassistent. Führe keine externen Aktionen aus. Antworte präzise auf Deutsch.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: positiveInteger(argument('--max-tokens'), Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS ?? DEFAULT_MAX_OUTPUT_TOKENS)),
  });
  console.log(JSON.stringify({ taskId, model, text: result.text, usage: result.usage, ledgerPath: result.ledgerPath }, null, 2));
} catch (error) {
  usage();
  console.error(error.message);
  process.exitCode = 1;
}
