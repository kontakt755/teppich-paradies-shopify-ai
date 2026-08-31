export const OPENROUTER_ANTHROPIC_BASE_URL = 'https://openrouter.ai/api';

const ROUTER_MODELS = new Set(['openrouter/auto', 'openrouter/free', 'openrouter/pareto-code']);

export class OpenRouterGatewayError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'OpenRouterGatewayError';
    this.status = options.status ?? null;
  }
}

function normalizedBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'openrouter.ai') throw new OpenRouterGatewayError('OpenRouter base URL must use the official HTTPS host');
  return url.toString().replace(/\/$/, '');
}

function validateRoute(route) {
  if (!route || route.gateway !== 'OPENROUTER') throw new OpenRouterGatewayError('Route is not assigned to the OpenRouter gateway');
  if (typeof route.model !== 'string' || !route.model.trim()) throw new OpenRouterGatewayError('OpenRouter route requires an exact model');
  if (ROUTER_MODELS.has(route.model)) throw new OpenRouterGatewayError(`Nested model router is not allowed: ${route.model}`);
  if (route.sticky !== true || typeof route.cacheSessionKey !== 'string' || !route.cacheSessionKey.trim() || route.cacheSessionKey.length > 256) {
    throw new OpenRouterGatewayError('OpenRouter route requires a persisted sticky cache key');
  }
}

export function buildOpenRouterAnthropicRequest({
  route,
  body,
  apiKey,
  baseUrl = OPENROUTER_ANTHROPIC_BASE_URL,
  signal = undefined,
}) {
  validateRoute(route);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new OpenRouterGatewayError('Anthropic request body must be an object');
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new OpenRouterGatewayError('OPENROUTER_API_KEY is required');
  return {
    url: `${normalizedBaseUrl(baseUrl)}/v1/messages`,
    init: {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'x-session-id': route.cacheSessionKey,
      },
      body: JSON.stringify({ ...body, model: route.model }),
    },
  };
}

export async function callOpenRouterAnthropic({ route, body, apiKey = process.env.OPENROUTER_API_KEY, baseUrl, signal, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') throw new OpenRouterGatewayError('A fetch implementation is required');
  const request = buildOpenRouterAnthropicRequest({ route, body, apiKey, baseUrl, signal });
  let response;
  try {
    response = await fetchImpl(request.url, request.init);
  } catch (error) {
    throw new OpenRouterGatewayError('OpenRouter request failed before a response was received', { cause: error });
  }
  if (!response?.ok) throw new OpenRouterGatewayError('OpenRouter returned a non-success response', { status: response?.status ?? null });
  return response;
}
