export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiGatewayError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'GeminiGatewayError';
    this.status = options.status ?? null;
  }
}

function normalizedBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'generativelanguage.googleapis.com') {
    throw new GeminiGatewayError('Gemini base URL must use the official Google HTTPS host');
  }
  return url.toString().replace(/\/$/, '');
}

function validateModel(model) {
  if (typeof model !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(model)) {
    throw new GeminiGatewayError('Gemini request requires an exact model name');
  }
}

export function buildGeminiRequest({ model, body, apiKey, baseUrl = GEMINI_API_BASE_URL, signal }) {
  validateModel(model);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GeminiGatewayError('Gemini request body must be an object');
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new GeminiGatewayError('GEMINI_API_KEY is required');
  return {
    url: `${normalizedBaseUrl(baseUrl)}/models/${encodeURIComponent(model)}:generateContent`,
    init: {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    },
  };
}

export async function callGemini({ model, body, apiKey = process.env.GEMINI_API_KEY, baseUrl, signal, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') throw new GeminiGatewayError('A fetch implementation is required');
  const request = buildGeminiRequest({ model, body, apiKey, baseUrl, signal });
  let response;
  try {
    response = await fetchImpl(request.url, request.init);
  } catch (error) {
    throw new GeminiGatewayError('Gemini request failed before a response was received', { cause: error });
  }
  if (!response?.ok) throw new GeminiGatewayError('Gemini returned a non-success response', { status: response?.status ?? null });
  return response;
}
