import fs from 'node:fs';
import path from 'node:path';
import { routeTaskPolicy } from './task-router.mjs';
import { executeBriefWithFallback } from './brief-provider.mjs';

const HIGH_RISK_TERMS = /\b(preis|price|checkout|zahlung|payment|versand|shipping|produkt.*lösch|delete.*product|dns|domain|live[- ]?theme|veröffentl|publish)\b/i;
const IMPLEMENTATION_TERMS = /\b(ändere|anpass|fix|reparier|implement|bau|erstell|update|add|entfern|gestalt|optimier|verbesser|verschöner|mach)\w*/i;

export class ClaudeBridgeError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ClaudeBridgeError';
    this.status = options.status ?? null;
  }
}

function compactTaskId(value) {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'CLAUDE-TASK';
}

const TASK_TYPES = new Set(['IMPLEMENTATION', 'ANALYSIS']);

export function classifyClaudeRequest({ taskId = 'CLAUDE-TASK', task, forceTaskType = null, previousRisk = null }) {
  if (typeof task !== 'string' || !task.trim()) throw new ClaudeBridgeError('task is required');
  // Risk can only ever escalate on a repeat/follow-up run: a short retry prompt
  // ("Versuch es erneut") must never accidentally downgrade a HIGH-risk task to
  // LOW just because its own text carries none of the risky terms.
  const risk = HIGH_RISK_TERMS.test(task) || previousRisk === 'HIGH' ? 'HIGH' : 'LOW';
  // A repeat run keeps the original task type by default; classifying only the
  // short follow-up text from scratch previously lost IMPLEMENTATION context.
  const taskType = TASK_TYPES.has(forceTaskType) ? forceTaskType : (IMPLEMENTATION_TERMS.test(task) ? 'IMPLEMENTATION' : 'ANALYSIS');
  return { id: compactTaskId(taskId), task: task.trim(), risk, taskType };
}

export function buildClaudeContextPack({ classified, policy, analysis }) {
  return `# Claude-Code-Hand-off\n\n## Auftrag\n${classified.task}\n\n## Router-Entscheidung\n- Risiko: ${classified.risk}\n- Typ: ${classified.taskType}\n- Modellklasse: ${policy.modelRequirement.class}\n- Aufwand: ${policy.modelRequirement.effortLevel}\n- Autonomie: ${policy.autonomyLevel}\n\n## OpenRouter-Analyse\n${analysis}\n\n## Verbindliche Grenzen\n- Prüfe zuerst den bestehenden Code und die Projektregeln.\n- Führe keine Shopify-Live-Veröffentlichung, Preis-, Checkout-, Produkt-, DNS- oder Löschoperation aus.\n- Bei unklaren Fakten: dokumentieren, nicht raten.\n- Implementiere nur die minimale, testbare Änderung und berichte betroffene Dateien sowie Tests.\n`;
}

export function writeClaudeHandoff({ taskId, content, outputDir = '.router/claude-handoffs', io = fs }) {
  const filePath = path.resolve(outputDir, `${compactTaskId(taskId)}.md`);
  io.mkdirSync(path.dirname(filePath), { recursive: true });
  io.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export async function prepareClaudeBridge({ taskId, task, execute = executeBriefWithFallback, outputDir, maxTokens = 256 }) {
  const classified = classifyClaudeRequest({ taskId, task });
  const policy = routeTaskPolicy({ id: classified.id, risk: classified.risk, taskType: classified.taskType, routing: { policyVersion: 2 }, allowedOperations: ['report_write'] });
  if (policy.autonomyLevel === 'HUMAN_GATE') return { status: 'HUMAN_GATE', classified, policy, reason: 'HIGH-risk request is never sent to OpenRouter or Claude Code automatically' };
  const result = await execute({
    taskId: classified.id,
    role: 'ANALYST',
    modelClass: policy.modelRequirement.class,
    cacheSessionKey: `tp-${classified.id.toLowerCase()}-claude-brief`,
    // "knapp" allein reichte nicht - reale Laeufe fuellten fast immer das
    // gesamte Token-Budget und wurden mitten im Satz abgeschnitten. Explizite
    // Formatvorgabe (Anzahl + Stil) diszipliniert die Laenge strukturell,
    // statt sich auf ein hoeheres Limit allein zu verlassen.
    system: 'Erstelle eine knappe technische Arbeitsanalyse für Claude Code, maximal 5 kurze Stichpunkte je Abschnitt (Annahmen, Risiken, Prüfungen, Plan), keine Einleitung, keine Wiederholung der Aufgabe. Keine externen Aktionen, keine erfundenen Fakten. Auf Deutsch.',
    messages: [{ role: 'user', content: classified.task }],
    maxTokens,
  });
  const content = buildClaudeContextPack({ classified, policy, analysis: result.text });
  const handoffPath = writeClaudeHandoff({ taskId: classified.id, content, outputDir });
  return { status: 'READY', classified, policy, analysis: result.text, handoffPath, route: result.route, usage: result.usage, attempts: result.attempts };
}
