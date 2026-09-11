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
const IMPLEMENTATION_VERBS = '(ä|ae)nder|anpass|fix|reparier|beheb|korrigier|implement|bau|erstell|update|add|entfern|gestalt|optimier|verbesser|versch(ö|oe)ner|mach|l(ö|oe)sch|schreib|setz|f(ü|ue)g|leg an|installier|deploy|push';
const IMPLEMENTATION_TERMS = term(IMPLEMENTATION_VERBS);

// Reine Fragen, belegt am 2026-09-11: "welche funktionen hast du alles mit
// lexware api ... angebote erstellen ... oder löschen ... wie ist dein
// funktionsumfang" traf "erstell" und "lösch" in IMPLEMENTATION_TERMS. Der
// Stop-Hook startete daraufhin bis zu drei Codex-Runden, die Code fuer eine
// Wissensfrage verlangten. Die Erkennung ist absichtlich konservativ: EINE
// Aufforderung irgendwo im Text genuegt, und es bleibt bei der Wortliste.
const WEND = '(?![\\p{L}\\p{N}])';
const INTERJECTION = `(?:(?:ja|jo|ok|okay|und|also|nein|gut|dann|jetzt|nun|na|aber|hm+|ah|aha|achso|ach so|alles klar|klar|danke|super|prima|sag mal|mal|kurze frage|eine frage|frage)${WEND}[\\s,.!:;-]*)*`;
// Fragewoerter plus Verb-Erst-Stellung ("ist der fix schon live", "laeuft der
// Build"): ohne Fragezeichen war "ist der ..." vorher keine Frage, "ist es"
// und "ist das" schon - das war willkuerlich (Pruefung 2026-09-11).
const QUESTION_START = new RegExp(`^${INTERJECTION}(?:welche[mnrs]?|was|wie|wieso|weshalb|warum|wozu|wo|woran|womit|wof(?:ü|ue)r|wohin|woher|wovon|worauf|wor(?:ü|ue)ber|wodurch|wann|wer|wem|wen|wessen|inwiefern|gibt es|gab es|ist|sind|war|waren|hat|haben|hast|habt|wird|werden|geht|gehen|l(?:ä|ae)uft|laufen|funktioniert|stimmt|klappt|passt|kann|k(?:ö|oe)nnen|k(?:ö|oe)nnte|muss|m(?:ü|ue)ssen|soll|sollen|sollte|darf|d(?:ü|ue)rfen|kennst|kennt|wei(?:ss|ß)t|wisst|brauch(?:e|t|en)|fehlt|fehlen|existiert|reicht|gilt)${WEND}`, 'iu');
const QUESTION_MARK_END = /\?[\s"'»«)\]!.*]*$/u;
// Fuer das Veto zaehlen auch Partizipien ("Das sollte geändert werden"):
// "geändert" hat vor "änder" keine Wortgrenze und faellt durch
// IMPLEMENTATION_TERMS. Ein breiteres Veto macht die Erkennung nur vorsichtiger.
const REQUEST_VERBS = `${IMPLEMENTATION_VERBS}|ge(?:${IMPLEMENTATION_VERBS})|angepasst|hinzugef(ü|ue)gt|behoben`;
const REQUEST_VERB = term(REQUEST_VERBS);
// Imperativform: Stamm plus optionale Endung, die nicht auf -n/-t endet.
// "ändere", "fix", "mach", "entfern" zaehlen; "ändern", "löschen", "macht",
// "änderst" nicht. Die Endung wird getrennt vom Stamm geprueft, weil der
// Stamm selbst auf n enden darf ("entfern" - bis zur Pruefung am 2026-09-11
// fiel "und entfern auch den Import" durch ein Lookbehind auf das ganze Wort).
const IMPERATIVE_FORM = `(?:${IMPLEMENTATION_VERBS})(?:[\\p{L}]*(?<![nt]))?${WEND}`;
// Kein Imperativ, sondern eine Frage in Verb-Erst-Stellung: "Mach ich was
// falsch", "Fixt der letzte Commit", "Macht es Sinn" - Subjektpronomen oder
// -t-Form mit folgendem Artikel/Pronomen.
const NOT_IMPERATIVE = `(?!(?:[\\p{L}]*\\s+(?:ich|du|er|wir|ihr)${WEND}|[\\p{L}]*t\\s+(?:es|der|die|das|den|dem|des|dies\\p{L}*|ein\\p{L}*|kein\\p{L}*|mein\\p{L}*|dein\\p{L}*|unser\\p{L}*|jede\\p{L}*|welche\\p{L}*|man|sich)${WEND}))`;
const IMPERATIVE_START = new RegExp(`^${INTERJECTION}(?:bitte${WEND}[\\s,.!]*)?${W}(?:${REQUEST_VERBS})${NOT_IMPERATIVE}`, 'iu');
// "Was ist kaputt und fix es": ein Imperativ hinter einer Konjunktion. Nur
// Imperativformen zaehlen, sonst wuerde der Infinitiv in "bearbeiten geht
// nicht oder löschen" (Originalprompt) die Frage kippen.
const IMPERATIVE_AFTER_CONJUNCTION = new RegExp(`${W}(?:und|oder|aber|dann|danach|anschlie(?:ß|ss)end|sonst|au(?:ß|ss)erdem)\\s+(?:bitte\\s+)?(?:(?:mal|noch|auch|gleich|direkt|einfach)\\s+)?${W}${IMPERATIVE_FORM}`, 'iu');
// Imperativ mitten im Satz, belegt am 2026-09-11: dieser Nutzer schreibt klein
// und fast ohne Satzzeichen ("warum ist der filter kaputt fix das"), und
// Listenpunkte ("- Ändere den Header") beginnen keinen Satz. Damit "der Fix
// für den Filter" (Substantiv) nicht kippt, muss ein Objekt oder eine
// Partikel folgen: "fix das", "mach die grüner", "mach weiter", "setz es".
const IMPERATIVE_INLINE = new RegExp(`${W}${IMPERATIVE_FORM}\\s+(?:(?:bitte|mal|doch|ruhig|einfach|gleich|jetzt|noch|auch|erst|dann|kurz|schnell)\\s+)*(?:das|die|den|dem|der|des|es|sie|ihn|ihm|mir|uns|mich|dies\\p{L}*|jede\\p{L}*|alle\\p{L}*|weiter|nichts|nix|hier|dort|mal|bitte|doch|einfach|so|dazu|drauf|rein|raus|ab|los|weg|hinzu|ein|zur(?:ü|ue)ck|dran|um|aus|an|auf)${WEND}`, 'iu');
// Infinitiv als Befehl in einem Teilsatz, der nur aus Partikeln, weiteren
// Infinitiven und dem Verb besteht: "Falls ja deployen.", "dann kürzen und
// neu setzen", "weiter machen". "bearbeiten geht aber nicht ... oder löschen"
// (Originalprompt) faellt durch, weil "geht" kein erlaubtes Wort ist.
const INFINITIVE_COMMAND = new RegExp(`^(?:(?:falls|wenn)\\s+(?:ja|nein|nicht|ok|okay)[,:]?\\s+|(?:dann|danach|bitte|mal|noch|auch|gleich|direkt|einfach|jetzt|weiter|neu|erst|kurz|schnell|alles|das|es|sie|die|den|dies\\p{L}*|und|oder|[\\p{L}-]+en)\\s+)*${W}(?:${IMPLEMENTATION_VERBS})[\\p{L}]*en[.!]*$`, 'iu');
// Wir-Form als Ankuendigung: "Die löschen wir.", "Das fixen wir jetzt." -
// aber nicht in einer Frage ("Was machen wir mit dem Header?").
const WE_WILL = new RegExp(`${W}(?:${IMPLEMENTATION_VERBS})[\\p{L}]*en\\s+wir${WEND}`, 'iu');
// "bitten" mit: "Kann ich dich bitten, den Header zu ändern?"
const PLEASE = new RegExp(`${W}bitten?${WEND}`, 'iu');
// Modal-Bitten inklusive Wir-Form, Hoeflichkeitsform, Tippfehlern und
// umgangssprachlicher Kurzform (Pruefung 2026-09-11: "Können wir dass nicht
// auf GitHub zugänglich machen" lief als Frage). "muss ich"/"kann ich" bleiben
// Fragen (Positivkorpus: "Welche Dateien muss ich ändern").
const MODAL_REQUEST = new RegExp(`${W}(?:kannst(?:e|es|du)?|du kannst|kanst du|kansst du|k(?:ö|oe)nntest(?:e|du)?|du k(?:ö|oe)nntest|w(?:ü|ue)rdest du|magst du|kann man|k(?:ö|oe)nn(?:t|ten|tet|en) (?:ihr|sie|wir)|d(?:ü|ue)rfen wir|d(?:ü|ue)rften wir|musst du|du musst|m(?:ü|ue)ssen wir|wir m(?:ü|ue)ssen|m(?:ü|ue)sst ihr|m(?:ü|ue)sstest du|lasst? uns|w(?:ä|ae)rst du|w(?:ä|ae)re? (?:es |das )?(?:gut|toll|super|sch(?:ö|oe)n|nett|klasse|prima|cool|m(?:ö|oe)glich)|wie w(?:ä|ae)re? (?:es|das)|wie w(?:ä|ae)rs|hast du lust|h(?:ä|ae)ttest du lust)${WEND}`, 'iu');
// Machbarkeitsfrage, die in Wahrheit eine Bitte ist: nur mit "zu <Verb>" oder
// "dass/wenn du" im selben Satz. "Geht das, wenn ich die SKU ändere?" und
// "Geht das mit dem Fix?" bleiben Fragen.
const FEASIBILITY_REQUEST = new RegExp(`${W}(?:geht (?:das|es)|ist (?:das |es )?m(?:ö|oe)glich|klappt (?:das|es)|hast du (?:zeit|bock)|h(?:ä|ae)ttest du zeit|schaffst du|kriegst du|bekommst du|kann ich dich bitten|darf ich dich bitten|k(?:ö|oe)nntest du dir vorstellen)${WEND}[\\s\\S]{0,120}?(?:${W}zu\\s+${W}(?:${REQUEST_VERBS})|${W}(?:dass|daß|wenn)\\s+(?:du|ihr|wir)${WEND})`, 'iu');
// Wunsch auch ohne Subjekt in der Ich-Form ("haette gern, dass du ...").
const WISH = new RegExp(`${W}(?:(?:(?:ich|wir)\\s+)?(?:m(?:ö|oe)chte|brauche|h(?:ä|ae)tte gerne?|w(?:ü|ue)nsche)|(?:ich|wir)\\s+(?:m(?:ö|oe)chten|will|wollen|brauchen|h(?:ä|ae)tten gerne?|w(?:ü|ue)nschen))${WEND}`, 'iu');
const SHOULD = new RegExp(`${W}soll[\\p{L}]*`, 'iu');
// Rhetorische Bitte: "Warum setzt du nicht einfach den Preis auf 20 Euro?"
const RHETORICAL_REQUEST = new RegExp(`${W}(?:warum|wieso|weshalb)\\s+(?:${IMPLEMENTATION_VERBS})[\\p{L}]*\\s+(?:du|ihr|wir)\\s+(?:(?:das|es|den|die|ihn|sie)\\s+)?nicht${WEND}`, 'iu');

// Fuehrende Listen- und Auszeichnungszeichen ("- ", "* ", "**", "→", "👉",
// Anfuehrungszeichen) sind kein Satzanfang - ohne das Abschneiden stand
// "- Ändere den Header" nie am Satzanfang (Pruefung 2026-09-11).
const LEADING_MARKERS = /^[^\p{L}\p{N}]+/u;
function stripMarkers(part) {
  return part.replace(LEADING_MARKERS, '').trim();
}

function sentencesOf(text) {
  return text.split(/\r?\n+/).flatMap(line => line.split(/(?<=[.!?])\s+/)).map(stripMarkers).filter(Boolean);
}

function isInterrogative(sentence) {
  return QUESTION_MARK_END.test(sentence) || QUESTION_START.test(sentence);
}

// Teilsaetze: Satzzeichen, Gedankenstriche, Pfeile, und Satzzeichen ohne
// folgendes Leerzeichen ("kaputt?Fix das", "nicht..mach das").
const CLAUSE_SPLIT = /[,;:()]|\s[-–—>]+\s|\s*(?:->|=>|→|⇒|…|\.{2,})\s*|(?<=[.!?])(?=\S)/u;

function isRequest(sentence) {
  const clauses = sentence.split(CLAUSE_SPLIT).map(stripMarkers).filter(Boolean);
  if (clauses.some(clause => IMPERATIVE_START.test(clause) || INFINITIVE_COMMAND.test(clause))) return true;
  if (IMPERATIVE_AFTER_CONJUNCTION.test(sentence) || IMPERATIVE_INLINE.test(sentence)) return true;
  if (!REQUEST_VERB.test(sentence)) return false;
  if (!isInterrogative(sentence) && WE_WILL.test(sentence)) return true;
  return PLEASE.test(sentence) || MODAL_REQUEST.test(sentence) || FEASIBILITY_REQUEST.test(sentence) || RHETORICAL_REQUEST.test(sentence) || WISH.test(sentence) || SHOULD.test(sentence);
}

// Frage = mindestens ein Satz/eine Zeile ist interrogativ UND kein Satz ist
// eine Aufforderung. Im Zweifel false - dann entscheidet die Wortliste wie bisher.
export function isPureQuestion(task) {
  if (typeof task !== 'string' || !task.trim()) return false;
  const sentences = sentencesOf(task);
  return sentences.some(isInterrogative) && !sentences.some(isRequest);
}
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
//   4. isPureQuestion   - reine Frage ohne jede Aufforderung (ANALYSIS/QUESTION)
//   5. IMPLEMENTATION_TERMS - Wortliste, nur noch letzter Notnagel
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
  } else if (isPureQuestion(task)) {
    taskType = 'ANALYSIS';
    taskTypeSource = 'QUESTION';
  } else {
    taskType = IMPLEMENTATION_TERMS.test(task) ? 'IMPLEMENTATION' : 'ANALYSIS';
    taskTypeSource = 'HEURISTIC';
  }
  return { id: compactTaskId(taskId), task: task.trim(), risk, taskType, taskTypeSource };
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
