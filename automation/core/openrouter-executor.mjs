import fs from 'node:fs';
import path from 'node:path';
import { callOpenRouterAnthropic, callOpenRouterChat } from './openrouter-gateway.mjs';

export const DEFAULT_OPENROUTER_USAGE_LEDGER = '.router/openrouter-usage.jsonl';
export const DEFAULT_MAX_OUTPUT_TOKENS = 256;
export const MAX_OUTPUT_TOKENS = 1024;

export class OpenRouterExecutorError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'OpenRouterExecutorError';
    this.status = options.status ?? null;
  }
}

function integerInRange(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new OpenRouterExecutorError(`${name} must be an integer from ${minimum} to ${maximum}`);
  return value;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function responseText(content) {
  if (!Array.isArray(content)) return '';
  return content.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('');
}

function normalizedChatResponse(response) {
  const message = response?.choices?.[0]?.message ?? {};
  const content = typeof message.content === 'string' ? message.content : '';
  return {
    content: content ? [{ type: 'text', text: content }] : [],
    stop_reason: response?.choices?.[0]?.finish_reason ?? null,
    usage: {
      input_tokens: response?.usage?.prompt_tokens,
      output_tokens: response?.usage?.completion_tokens,
      cache_read_input_tokens: response?.usage?.prompt_tokens_details?.cached_tokens,
      cost: response?.usage?.cost,
    },
  };
}

export function normalizeOpenRouterUsage(usage = {}) {
  return {
    inputTokens: finiteNumber(usage.input_tokens) ?? 0,
    outputTokens: finiteNumber(usage.output_tokens) ?? 0,
    cacheReadInputTokens: finiteNumber(usage.cache_read_input_tokens) ?? 0,
    cacheCreationInputTokens: finiteNumber(usage.cache_creation_input_tokens) ?? 0,
    costUsd: finiteNumber(usage.cost) ?? null,
  };
}

export function usageRecord({ taskId, role, route, response, startedAt, finishedAt }) {
  return {
    timestamp: finishedAt,
    taskId,
    role,
    provider: route.provider,
    upstreamProvider: route.upstreamProvider,
    gateway: route.gateway,
    model: route.model,
    cacheSessionKey: route.cacheSessionKey,
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
    stopReason: response.stop_reason ?? null,
    responseContentTypes: Array.isArray(response.content) ? response.content.map(block => block?.type ?? 'unknown') : [],
    usage: normalizeOpenRouterUsage(response.usage),
  };
}

export function appendUsageRecord(record, { ledgerPath = process.env.OPENROUTER_USAGE_LEDGER ?? DEFAULT_OPENROUTER_USAGE_LEDGER, io = fs } = {}) {
  const absolutePath = path.resolve(ledgerPath);
  io.mkdirSync(path.dirname(absolutePath), { recursive: true });
  io.appendFileSync(absolutePath, `${JSON.stringify(record)}\n`, 'utf8');
  return absolutePath;
}

export async function executeOpenRouterTask({ taskId, role, route, messages, system = undefined, reasoning = { enabled: false, exclude: true }, protocol = 'ANTHROPIC', maxTokens = DEFAULT_MAX_OUTPUT_TOKENS, apiKey = process.env.OPENROUTER_API_KEY, call = null, recordUsage = appendUsageRecord, now = () => new Date() }) {
  if (typeof taskId !== 'string' || !taskId.trim()) throw new OpenRouterExecutorError('taskId is required');
  if (typeof role !== 'string' || !role.trim()) throw new OpenRouterExecutorError('role is required');
  if (!Array.isArray(messages) || messages.length === 0) throw new OpenRouterExecutorError('At least one message is required');
  const boundedMaxTokens = integerInRange(maxTokens, 'maxTokens', 16, MAX_OUTPUT_TOKENS);
  if (!['ANTHROPIC', 'CHAT'].includes(protocol)) throw new OpenRouterExecutorError('protocol must be ANTHROPIC or CHAT');
  const startedAt = now().toISOString();
  let httpResponse;
  try {
    const invoke = call ?? (protocol === 'CHAT' ? callOpenRouterChat : callOpenRouterAnthropic);
    const body = protocol === 'CHAT'
      ? { ...(reasoning ? { reasoning } : {}), max_tokens: boundedMaxTokens, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages] }
      : { ...(system ? { system } : {}), ...(reasoning ? { reasoning } : {}), max_tokens: boundedMaxTokens, messages };
    httpResponse = await invoke({ route, apiKey, body });
  } catch (error) {
    throw new OpenRouterExecutorError('OpenRouter task invocation failed', { status: error?.status ?? null, cause: error });
  }
  if (!httpResponse || typeof httpResponse.json !== 'function') throw new OpenRouterExecutorError('OpenRouter returned no readable JSON response');
  let response;
  try {
    response = await httpResponse.json();
  } catch (error) {
    throw new OpenRouterExecutorError('OpenRouter returned invalid JSON', { cause: error });
  }
  if (protocol === 'CHAT') response = normalizedChatResponse(response);
  const finishedAt = now().toISOString();
  const record = usageRecord({ taskId, role, route, response, startedAt, finishedAt });
  const ledgerPath = recordUsage(record);
  const text = responseText(response.content);
  if (!text.trim()) throw new OpenRouterExecutorError('OpenRouter returned no visible text response');
  return { text, response, usage: record.usage, ledgerPath, record };
}
