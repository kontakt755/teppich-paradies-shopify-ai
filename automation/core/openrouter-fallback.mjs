import { executeOpenRouterTask, OpenRouterExecutorError } from './openrouter-executor.mjs';

const DEFAULT_LIGHT_MODELS = ['dots-studio/dots-3-note-preview:free', 'cohere/north-mini-code:free', 'inclusionai/ling-3.0-flash-fin:free'];
const DEFAULT_STANDARD_MODELS = ['poolside/laguna-s-2.1:free', 'cohere/north-mini-code:free'];

function configuredModels(variable, defaults) {
  const values = (process.env[variable] ?? '').split(',').map(value => value.trim()).filter(Boolean);
  return [...new Set(values.length ? values : defaults)];
}

export function openRouterModelsForClass(modelClass) {
  if (modelClass === 'LIGHT') return configuredModels('OPENROUTER_LIGHT_FALLBACK_MODELS', DEFAULT_LIGHT_MODELS);
  if (modelClass === 'STANDARD') return configuredModels('OPENROUTER_STANDARD_FALLBACK_MODELS', DEFAULT_STANDARD_MODELS);
  throw new OpenRouterExecutorError(`No autonomous OpenRouter fallback pool for ${modelClass}`);
}

export async function executeOpenRouterWithFallback({ taskId, role, modelClass, cacheSessionKey, provider = 'OPENROUTER', ...request }) {
  const models = openRouterModelsForClass(modelClass);
  const failures = [];
  for (const model of models) {
    const route = { provider: `${provider}_${modelClass}`, upstreamProvider: provider, gateway: 'OPENROUTER', model, cacheSessionKey, sticky: true };
    try {
      const result = await executeOpenRouterTask({ taskId, role, route, protocol: 'CHAT', ...request });
      return { ...result, route, attempts: [...failures, { model, status: 'PASS' }] };
    } catch (error) {
      failures.push({ model, status: 'FAILED', errorClass: error?.name ?? 'Error', statusCode: error?.status ?? null });
    }
  }
  throw new OpenRouterExecutorError(`All ${models.length} configured OpenRouter models failed to return visible text`, { cause: failures });
}
