import { appendUsageRecord } from './openrouter-executor.mjs';
import { callGemini } from './gemini-gateway.mjs';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export class GeminiExecutorError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'GeminiExecutorError';
    this.status = options.status ?? null;
  }
}

function textFromResponse(response) {
  return (response?.candidates ?? [])
    .flatMap(candidate => candidate?.content?.parts ?? [])
    .filter(part => typeof part?.text === 'string')
    .map(part => part.text)
    .join('');
}

function contentsFromMessages(messages) {
  return messages.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(message.content ?? '') }],
  }));
}

function usageFromResponse(response) {
  const usage = response?.usageMetadata ?? {};
  return {
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    cacheReadInputTokens: usage.cachedContentTokenCount ?? 0,
    cacheCreationInputTokens: 0,
    reasoningTokens: usage.thoughtsTokenCount ?? 0,
    costUsd: 0,
  };
}

export async function executeGeminiTask({
  taskId,
  role,
  messages,
  system,
  maxTokens = 256,
  model = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
  apiKey = process.env.GEMINI_API_KEY,
  call = callGemini,
  recordUsage = appendUsageRecord,
  now = () => new Date(),
}) {
  if (!taskId || !role || !Array.isArray(messages) || !messages.length) throw new GeminiExecutorError('taskId, role and messages are required');
  if (!Number.isInteger(maxTokens) || maxTokens < 16 || maxTokens > 1024) throw new GeminiExecutorError('maxTokens must be an integer from 16 to 1024');
  const startedAt = now().toISOString();
  let httpResponse;
  try {
    httpResponse = await call({
      model,
      apiKey,
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: contentsFromMessages(messages),
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 },
      },
    });
  } catch (error) {
    throw new GeminiExecutorError('Gemini task invocation failed', { status: error?.status ?? null, cause: error });
  }
  let response;
  try {
    response = await httpResponse.json();
  } catch (error) {
    throw new GeminiExecutorError('Gemini returned invalid JSON', { cause: error });
  }
  const text = textFromResponse(response);
  if (!text.trim()) throw new GeminiExecutorError('Gemini returned no visible text response');
  const finishedAt = now().toISOString();
  const route = { provider: 'GEMINI_FREE', upstreamProvider: 'GOOGLE', gateway: 'GEMINI', model, cacheSessionKey: null };
  const record = {
    timestamp: finishedAt,
    taskId,
    role,
    provider: route.provider,
    upstreamProvider: route.upstreamProvider,
    gateway: route.gateway,
    model,
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
    stopReason: response?.candidates?.[0]?.finishReason ?? null,
    responseContentTypes: ['text'],
    usage: usageFromResponse(response),
  };
  const ledgerPath = recordUsage(record, { ledgerPath: process.env.AI_ROUTER_USAGE_LEDGER ?? '.router/ai-usage.jsonl' });
  return { text, response, usage: record.usage, ledgerPath, record, route };
}
