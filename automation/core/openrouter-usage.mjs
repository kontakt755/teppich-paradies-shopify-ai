function nonNegativeInteger(value) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function optionalNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function extractOpenRouterUsage(payload, { route, requestId = null, recordedAt = new Date().toISOString() } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('OpenRouter response payload must be an object');
  if (!route?.provider || !route?.model || !route?.cacheSessionKey) throw new Error('A persisted provider route is required for usage recording');
  const usage = payload.usage ?? {};
  const metadata = payload.openrouter_metadata ?? payload.metadata ?? {};
  const costUsd = optionalNonNegativeNumber(usage.cost ?? usage.total_cost ?? metadata.total_cost ?? metadata.cost);
  return {
    version: 1,
    recordedAt,
    requestId: requestId ?? payload.id ?? null,
    provider: route.provider,
    upstreamProvider: route.upstreamProvider ?? null,
    gateway: route.gateway,
    model: route.model,
    modelClass: route.modelClass ?? null,
    effortLevel: route.effortLevel ?? null,
    cacheSessionKey: route.cacheSessionKey,
    inputTokens: nonNegativeInteger(usage.input_tokens ?? usage.prompt_tokens),
    outputTokens: nonNegativeInteger(usage.output_tokens ?? usage.completion_tokens),
    cacheReadTokens: nonNegativeInteger(usage.cache_read_input_tokens ?? usage.cache_read_tokens),
    cacheWriteTokens: nonNegativeInteger(usage.cache_creation_input_tokens ?? usage.cache_write_tokens),
    costUsd,
  };
}

export function summarizeUsage(records) {
  if (!Array.isArray(records)) throw new Error('Usage records must be an array');
  const summary = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, knownCostUsd: 0, unknownCostRequests: 0, byModel: {} };
  for (const record of records) {
    summary.requests += 1;
    summary.inputTokens += nonNegativeInteger(record.inputTokens);
    summary.outputTokens += nonNegativeInteger(record.outputTokens);
    summary.cacheReadTokens += nonNegativeInteger(record.cacheReadTokens);
    summary.cacheWriteTokens += nonNegativeInteger(record.cacheWriteTokens);
    if (typeof record.costUsd === 'number') summary.knownCostUsd += record.costUsd;
    else summary.unknownCostRequests += 1;
    const key = `${record.provider}/${record.model}`;
    const current = summary.byModel[key] ?? { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, knownCostUsd: 0, unknownCostRequests: 0 };
    current.requests += 1;
    current.inputTokens += nonNegativeInteger(record.inputTokens);
    current.outputTokens += nonNegativeInteger(record.outputTokens);
    current.cacheReadTokens += nonNegativeInteger(record.cacheReadTokens);
    if (typeof record.costUsd === 'number') current.knownCostUsd += record.costUsd;
    else current.unknownCostRequests += 1;
    summary.byModel[key] = current;
  }
  summary.knownCostUsd = Number(summary.knownCostUsd.toFixed(8));
  return summary;
}
