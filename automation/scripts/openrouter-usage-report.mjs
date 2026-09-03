import fs from 'node:fs';
import path from 'node:path';

const ledgerPath = path.resolve(process.env.OPENROUTER_USAGE_LEDGER ?? '.router/openrouter-usage.jsonl');

function recordsFromLedger(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid usage ledger JSON on line ${index + 1}`); }
  });
}

const records = recordsFromLedger(ledgerPath);
const totals = records.reduce((summary, record) => {
  const usage = record.usage ?? {};
  summary.inputTokens += usage.inputTokens ?? 0;
  summary.outputTokens += usage.outputTokens ?? 0;
  summary.cacheReadInputTokens += usage.cacheReadInputTokens ?? 0;
  summary.cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
  if (typeof usage.costUsd === 'number') summary.costUsd += usage.costUsd;
  return summary;
}, { requests: records.length, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 });

console.log(JSON.stringify({ ledgerPath, ...totals }, null, 2));
