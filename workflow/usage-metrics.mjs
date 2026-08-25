/**
 * Lokale, datensparsame Verbrauchsmetriken fuer AI Control.
 *
 * Der rohe Aufgabentext, Prompts und Provider-Ausgaben werden absichtlich
 * nicht protokolliert. Tokenwerte bleiben null, wenn ein CLI sie nicht
 * verlaesslich als strukturierte Metadaten liefert.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

function optionalCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizedUsage(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    inputTokens: optionalCount(value.inputTokens ?? value.input_tokens),
    outputTokens: optionalCount(value.outputTokens ?? value.output_tokens),
    cacheReadTokens: optionalCount(value.cacheReadTokens ?? value.cache_read_input_tokens),
    cacheCreationTokens: optionalCount(value.cacheCreationTokens ?? value.cache_creation_input_tokens),
  };
}

function sumComplete(calls, field) {
  if (!calls.length) return 0;
  if (calls.some(call => call.usage?.[field] === null || call.usage?.[field] === undefined)) return null;
  return calls.reduce((sum, call) => sum + call.usage[field], 0);
}

export function hashTaskText(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16);
}

export function readUsageSummary({ root, day = new Date().toISOString().slice(0, 10), io = fs } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new TypeError('Tag muss YYYY-MM-DD entsprechen');
  const file = path.join(root, '.workflow', 'usage', `router-${day}.jsonl`);
  let lines = [];
  try { lines = io.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const entries = lines.map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const calls = entries.flatMap(entry => Array.isArray(entry.calls) ? entry.calls : []);
  const byProvider = {};
  const byClass = {};
  for (const entry of entries) byClass[entry.routerClass ?? 'UNKNOWN'] = (byClass[entry.routerClass ?? 'UNKNOWN'] ?? 0) + 1;
  for (const call of calls) byProvider[call.provider ?? 'UNKNOWN'] = (byProvider[call.provider ?? 'UNKNOWN'] ?? 0) + 1;
  const complete = entries.every(entry => entry.tokenMetricsComplete === true);
  return {
    day,
    file,
    runs: entries.length,
    scriptOnlyRuns: entries.filter(entry => entry.scriptOnly === true).length,
    modelCalls: entries.reduce((sum, entry) => sum + (Number.isInteger(entry.modelCalls) ? entry.modelCalls : 0), 0),
    inputTokens: complete ? entries.reduce((sum, entry) => sum + (entry.inputTokens ?? 0), 0) : null,
    outputTokens: complete ? entries.reduce((sum, entry) => sum + (entry.outputTokens ?? 0), 0) : null,
    tokenMetricsComplete: complete,
    byProvider,
    byClass,
  };
}

export function readUsageRange({ root, days = 30, io = fs, today = () => new Date() } = {}) {
  const currentDate = today();
  const allEntries = [];
  const byProvider = {};
  const byClass = {};
  const byStopReason = {};
  let daysWithData = 0;

  for (let i = 0; i < days; i++) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - i);
    const day = date.toISOString().slice(0, 10);
    const file = path.join(root, '.workflow', 'usage', `router-${day}.jsonl`);
    let lines = [];
    try {
      lines = io.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      daysWithData += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const entries = lines.map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    allEntries.push(...entries);
  }

  const calls = allEntries.flatMap(entry => Array.isArray(entry.calls) ? entry.calls : []);
  for (const entry of allEntries) {
    byClass[entry.routerClass ?? 'UNKNOWN'] = (byClass[entry.routerClass ?? 'UNKNOWN'] ?? 0) + 1;
    const sr = entry.stopReason ?? null;
    const key = sr === null ? 'null' : sr;
    byStopReason[key] = (byStopReason[key] ?? 0) + 1;
  }
  for (const call of calls) {
    byProvider[call.provider ?? 'UNKNOWN'] = (byProvider[call.provider ?? 'UNKNOWN'] ?? 0) + 1;
  }

  const complete = allEntries.every(entry => entry.tokenMetricsComplete === true);
  const reworkStopReasons = Object.entries(byStopReason)
    .filter(([sr]) => sr !== 'DONE' && sr !== 'null')
    .map(([stopReason, count]) => ({ stopReason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    days,
    daysWithData,
    runs: allEntries.length,
    scriptOnlyRuns: allEntries.filter(entry => entry.scriptOnly === true).length,
    modelCalls: allEntries.reduce((sum, entry) => sum + (Number.isInteger(entry.modelCalls) ? entry.modelCalls : 0), 0),
    inputTokens: complete ? allEntries.reduce((sum, entry) => sum + (entry.inputTokens ?? 0), 0) : null,
    outputTokens: complete ? allEntries.reduce((sum, entry) => sum + (entry.outputTokens ?? 0), 0) : null,
    tokenMetricsComplete: complete,
    byProvider,
    byClass,
    byStopReason,
    reworkStopReasons,
  };
}

export function createUsageMetrics({
  root,
  task = null,
  command = 'ai:continue',
  clock = () => new Date(),
  nowMs = () => Date.now(),
  makeId = randomUUID,
  io = fs,
} = {}) {
  const startedAt = clock();
  const startedMs = nowMs();
  const providerChecks = [];
  const modelCalls = [];
  let finished = false;

  return {
    recordProviderCheck(result) {
      providerChecks.push({ provider: result?.provider ?? 'UNKNOWN', status: result?.status ?? 'UNKNOWN' });
    },

    recordModelCall({ role = null, agentRole = null, result = null } = {}) {
      modelCalls.push({
        provider: result?.provider ?? 'UNKNOWN',
        model: result?.model ?? null,
        role,
        agentRole,
        status: result?.status ?? 'UNKNOWN',
        durationMs: Number.isFinite(result?.durationMs) ? result.durationMs : null,
        usage: normalizedUsage(result?.usage),
      });
    },

    finish({ outcome = null, error = null } = {}) {
      if (finished) return { written: false, reason: 'ALREADY_FINISHED', entry: null };
      finished = true;
      const endedAt = clock();
      const entry = {
        schemaVersion: 1,
        timestamp: endedAt.toISOString(),
        runId: makeId(),
        command,
        taskId: task?.taskId ?? null,
        taskHash: hashTaskText(task?.taskText ?? ''),
        routerClass: task?.taskClass ?? null,
        providerChecks,
        providers: [...new Set(modelCalls.map(call => call.provider))],
        models: [...new Set(modelCalls.map(call => call.model).filter(Boolean))],
        modelCalls: modelCalls.length,
        calls: modelCalls,
        inputTokens: sumComplete(modelCalls, 'inputTokens'),
        outputTokens: sumComplete(modelCalls, 'outputTokens'),
        cacheReadTokens: sumComplete(modelCalls, 'cacheReadTokens'),
        cacheCreationTokens: sumComplete(modelCalls, 'cacheCreationTokens'),
        tokenMetricsComplete: modelCalls.every(call => call.usage !== null
          && call.usage.inputTokens !== null && call.usage.outputTokens !== null),
        scriptOnly: modelCalls.length === 0,
        durationMs: Math.max(0, nowMs() - startedMs),
        stopReason: outcome?.stopReason ?? (error ? 'ERROR' : null),
        errorCode: error?.code ?? error?.name ?? null,
      };

      try {
        const directory = path.join(root, '.workflow', 'usage');
        io.mkdirSync(directory, { recursive: true });
        const day = endedAt.toISOString().slice(0, 10);
        io.appendFileSync(path.join(directory, `router-${day}.jsonl`), `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
        return { written: true, entry };
      } catch (writeError) {
        return { written: false, reason: writeError.code ?? writeError.name, entry };
      }
    },
  };
}
