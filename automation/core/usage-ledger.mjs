import fs from 'node:fs';
import path from 'node:path';
import { summarizeUsage } from './openrouter-usage.mjs';

export function appendUsageRecord({ ledgerPath, record, io = fs }) {
  if (!ledgerPath || typeof ledgerPath !== 'string') throw new Error('ledgerPath is required');
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('usage record must be an object');
  io.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  io.appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

export function readUsageRecords({ ledgerPath, io = fs }) {
  if (!io.existsSync(ledgerPath)) return [];
  const lines = io.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
  return lines.map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid usage ledger record at line ${index + 1}`); }
  });
}

export function usageReport({ ledgerPath, io = fs }) {
  return summarizeUsage(readUsageRecords({ ledgerPath, io }));
}
