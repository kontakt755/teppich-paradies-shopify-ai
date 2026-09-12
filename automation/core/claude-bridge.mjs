import fs from 'node:fs';
import path from 'node:path';
import { routeTaskPolicy } from './task-router.mjs';
import { executeBriefWithFallback } from './brief-provider.mjs';

// JS-`\b` ist ASCII-basiert und greift vor einem Umlaut nicht: /\bänder/ findet
// "Ändere" am Satzanfang nicht. Deshalb eine unicode-feste Wortgrenze. Zusammen
// mit den doppelt geschriebenen Umlauten ("ä" und "ae") deckt das reale
// Auftraege ab, die haeufig ohne Umlaute hereinkommen ("Aendere die SKU") -
// genau dort kippte sonst die Sicherheitsstufe.
const W = '(?<![\\p{L}\\p{N}])';
const term = body => new RegExp(`${W}(?:${body})[\\p{L}\\p{N}]*`, 'iu');

const HIGH_RISK_TERMS = term('preis|price|checkout|zahlung|payment|versand|shipping|dns|domain|live[- ]?theme|ver(ö|oe)ffentl|publish|sku|variant|steuer|tax|rechtstext|impressum|agb|datenschutz');
// Loeschen ist nur zusammen mit einem Geschaeftsobjekt HIGH ("Produkt loeschen"),
// nicht bei "loesche die tote CSS-Regel". Beide Wortstellungen zaehlen.
const DESTRUCTIVE_TERMS = /(?<![\p{L}\p{N}])(?:(?:lösch|loesch|delete|entfern|remove)[\p{L}]*[\s\S]{0,40}(?:produkt|product|variant|kollektion|collection|kunde|customer|bestellung|order|theme)|(?:produkt|product|variant|kollektion|collection|kunde|customer|bestellung|order|theme)[\p{L}]*[\s\S]{0,40}(?:lösch|loesch|delete|entfern|remove))/iu;
// Git-Schreibvorgaenge sind laut AGENTS.md und risk-map immer ein Human Gate:
// sie verlassen die Arbeitskopie und sind nicht mehr lokal zuruecknehmbar.
const GIT_WRITE_TERMS = term('merge|rebase|force[- ]?push|push|commit|cherry[- ]?pick|revert');
// "beheben" und "korrigieren" fehlten: "Bug beheben" lief dadurch als ANALYSIS mit
// Haiku statt als Implementierung mit dem Matrix-Modell.
const IMPLEMENTATION_TERMS = term('(ä|ae)nder|anpass|fix|reparier|beheb|korrigier|implement|bau|erstell|update|add|entfern|gestalt|optimier|verbesser|versch(ö|oe)ner|mach|l(ö|oe)sch|schreib|setz|f(ü|ue)g|leg an|installier|deploy|push');
// Ein ausdruecklich lesender Auftrag schlaegt jede Verb-Heuristik. Grund: ein
// Substantiv wie "Verbesserungsmoeglichkeiten" traf frueher IMPLEMENTATION_TERMS
// und startete den Worker schreibend, obwohl im Auftrag "Nur lesen, nichts
// aendern" stand - der Prompt kam zu spaet, die Permission-Entscheidung faellt
// vorher.
const READ_ONLY_INTENT = /(?<![\p{L}\p{N}])(?:nur lesen|rein lesend|read[- ]?only|nur analysier|nur untersuch|nur pr(ü|ue)f|nur berichte|nur bewert|(?:nichts|nicht|keine[a-z]*|ohne)[\s\S]{0,30}(?:(ä|ae)nder|anpass|schreib|implementier|umsetz)|(?:(ä|ae)nder|anpass|schreib|implementier|umsetz)[\p{L}]*[\s\S]{0,20}(?:nichts|keine)|ver(ä|ae)ndere? (?:keine|nichts)|nichts (?:ver)?(ä|ae)ndern)/iu;

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

// Reihenfolge der Wahrheit fuer "darf dieser Lauf schreiben?":
//   1. declaredTaskType - der Mensch hat es im Dashboard/CLI ausdruecklich gesagt
//   2. READ_ONLY_INTENT - der aktuelle Auftrag sagt ausdruecklich "nur lesen"
//   3. forceTaskType    - uebernommener Typ eines frueheren Laufs (Wiederholung)
//   4. IMPLEMENTATION_TERMS - Wortliste, nur noch letzter Notnagel
// Das Veto steht bewusst VOR dem geerbten Typ: ein Folgebefehl "Nur lesen,
// nichts aendern" nach einem Implementierungs-Lauf haette sonst den alten
// IMPLEMENTATION-Typ geerbt und trotzdem schreibend ausgefuehrt.
// Nur eine ausdrueckliche Deklaration darf das Veto ueberstimmen.
export function classifyClaudeRequest({ taskId = 'CLAUDE-TASK', task, declaredTaskType = null, forceTaskType = null, previousRisk = null }) {
  if (typeof task !== 'string' || !task.trim()) throw new ClaudeBridgeError('task is required');
  // Risiko eskaliert nur, es sinkt nie: ein kurzer Wiederholungs-Prompt
  // ("Versuch es erneut") darf einen HIGH-Auftrag nicht auf LOW zurueckstufen,
  // nur weil sein eigener Text keine riskanten Begriffe enthaelt.
  const riskyText = HIGH_RISK_TERMS.test(task) || GIT_WRITE_TERMS.test(task) || DESTRUCTIVE_TERMS.test(task);
  const risk = riskyText || previousRisk === 'HIGH' ? 'HIGH' : 'LOW';
  let taskType;
  let taskTypeSource;
  if (TASK_TYPES.has(declaredTaskType)) {
    taskType = declaredTaskType;
    taskTypeSource = 'DECLARED';
  } else if (READ_ONLY_INTENT.test(task)) {
    taskType = 'ANALYSIS';
    taskTypeSource = 'READ_ONLY_INTENT';
  } else if (TASK_TYPES.has(forceTaskType)) {
    taskType = forceTaskType;
    taskTypeSource = 'INHERITED';
  } else {
    taskType = IMPLEMENTATION_TERMS.test(task) ? 'IMPLEMENTATION' : 'ANALYSIS';
    taskTypeSource = 'HEURISTIC';
  }
  return { id: compactTaskId(taskId), task: task.trim(), risk, taskType, taskTypeSource };
}

// Gilt fuer Implementer und Reviewer gleichermassen. Der letzte Punkt lautete
// bis 2026-09-11 "Implementiere nur ..." und legte auch dann eine Umsetzung
// nahe, wenn der Auftrag nur eine Antwort verlangte.
const BINDING_LIMITS = [
  'Prüfe zuerst den bestehenden Code und die Projektregeln.',
  'Führe keine Shopify-Live-Veröffentlichung, Preis-, Checkout-, Produkt-, DNS- oder Löschoperation aus.',
  'Bei unklaren Fakten: dokumentieren, nicht raten.',
  'Ändere das Repository nur, soweit der Auftrag es verlangt: minimal, testbar, mit Angabe der betroffenen Dateien und Tests.',
];

function limitsSection() {
  return `## Verbindliche Grenzen\n${BINDING_LIMITS.map(line => `- ${line}`).join('\n')}\n`;
}

// Die Voranalyse stammt von einem kleinen Drittmodell, das nur den Auftragstext
// sieht - kein Repository, keine Projektregeln. Am 2026-09-11 stand darin
// "Claude 3 Opus ist das leistungsfaehigste Modell" samt Plan zum Umschalten.
// Fuer den Implementer bleibt sie stehen, aber ausdruecklich als ungepruefter
// Hinweis; der Reviewer bekommt sie gar nicht (buildReviewerTaskPack).
export function buildClaudeContextPack({ classified, policy, analysis }) {
  return `# Claude-Code-Hand-off\n\n## Auftrag\n${classified.task}\n\n## Router-Entscheidung\n- Risiko: ${classified.risk}\n- Typ: ${classified.taskType}\n- Modellklasse: ${policy.modelRequirement.class}\n- Aufwand: ${policy.modelRequirement.effortLevel}\n- Autonomie: ${policy.autonomyLevel}\n\n## Ungeprüfte Voranalyse (Hinweis, nicht verbindlich)\nAutomatisch erzeugt von einem kleinen Drittmodell, das nur den Auftragstext kennt, nicht das Repository. Fakten daraus (Modellnamen, Versionen, Pfade, Befehle) vor Verwendung prüfen; maßgeblich sind Auftrag, bestehender Code und AGENTS.md.\n\n${analysis}\n\n${limitsSection()}`;
}

// Der Reviewer bekommt nur, woran er messen soll: den Wortlaut des Auftrags und
// die verbindlichen Grenzen. Weder die Voranalyse (siehe oben) noch die
// Router-Einstufung - "Typ: IMPLEMENTATION" steht auch bei einer reinen Frage
// darin, und der Reviewer verlangte daraufhin eine Umsetzung. Ob der Auftrag
// ohne Aenderung erfuellt ist, entscheidet er am Pruefbereich und an der
// Schlussantwort des Agenten (reviewCandidateFromStop in review-scope.mjs).
export function buildReviewerTaskPack({ classified }) {
  return `# Prüfauftrag für die unabhängige Review\n\n## Auftrag\n${classified.task}\n\n${limitsSection()}\n## Prüfmaßstab\nBewerte ausschließlich gegen den Auftrag oben, die Grenzen und die Projektregeln (AGENTS.md, CLAUDE.md). Eine automatische Voranalyse des Routers ist hier bewusst nicht enthalten: Sie stammt von einem Drittmodell ohne Repository-Zugriff, ist ungeprüft und kein Maßstab.\n`;
}

export function writeClaudeHandoff({ taskId, content, outputDir = '.router/claude-handoffs', suffix = '', io = fs }) {
  const filePath = path.resolve(outputDir, `${compactTaskId(taskId)}${suffix}.md`);
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
  // Eigene Datei fuer den Reviewer (codex-stop-review.mjs, agents:review), damit
  // er nie gegen die ungepruefte Voranalyse bewertet.
  const reviewTaskPath = writeClaudeHandoff({ taskId: classified.id, content: buildReviewerTaskPack({ classified }), outputDir, suffix: '.review' });
  return { status: 'READY', classified, policy, analysis: result.text, handoffPath, reviewTaskPath, route: result.route, usage: result.usage, attempts: result.attempts };
}
