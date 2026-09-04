import { executeGeminiTask } from './gemini-executor.mjs';
import { executeOpenRouterWithFallback } from './openrouter-fallback.mjs';

export class BriefProviderError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'BriefProviderError';
  }
}

export async function executeBriefWithFallback(request, {
  gemini = executeGeminiTask,
  openRouter = executeOpenRouterWithFallback,
  env = process.env,
} = {}) {
  const attempts = [];
  if (env.GEMINI_API_KEY?.trim()) {
    try {
      const result = await gemini({ ...request, model: env.GEMINI_MODEL });
      return { ...result, attempts: [{ provider: 'GEMINI', model: result.route.model, status: 'PASS' }] };
    } catch (error) {
      attempts.push({ provider: 'GEMINI', status: 'FAILED', errorClass: error?.name ?? 'Error', statusCode: error?.status ?? null });
    }
  } else {
    attempts.push({ provider: 'GEMINI', status: 'SKIPPED_NO_KEY' });
  }

  if (env.OPENROUTER_API_KEY?.trim()) {
    try {
      const result = await openRouter(request);
      return { ...result, attempts: [...attempts, ...(result.attempts ?? []).map(item => ({ provider: 'OPENROUTER', ...item }))] };
    } catch (error) {
      attempts.push({ provider: 'OPENROUTER', status: 'FAILED', errorClass: error?.name ?? 'Error', statusCode: error?.status ?? null });
    }
  } else {
    attempts.push({ provider: 'OPENROUTER', status: 'SKIPPED_NO_KEY' });
  }
  throw new BriefProviderError('No configured brief provider returned a usable response', { cause: attempts });
}
