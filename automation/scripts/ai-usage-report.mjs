import process from 'node:process';
import { usageReport } from '../core/usage-ledger.mjs';

// Liest denselben Ledger, in den gemini-executor.mjs und openrouter-executor.mjs
// jeden Router-/Worker-Aufruf schreiben (Standardpfad und Env-Var-Name muessen
// mit deren appendUsageRecord()-Aufloesung uebereinstimmen).
const ledgerPath = process.env.AI_ROUTER_USAGE_LEDGER ?? '.router/ai-usage.jsonl';
const report = usageReport({ ledgerPath });
console.log(JSON.stringify({ ledgerPath, ...report }, null, 2));
