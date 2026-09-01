import process from 'node:process';
import { usageReport } from '../core/usage-ledger.mjs';

const ledgerPath = process.env.OPENROUTER_USAGE_LEDGER ?? '.router/openrouter-usage.jsonl';
const report = usageReport({ ledgerPath });
console.log(JSON.stringify({ ledgerPath, ...report }, null, 2));
