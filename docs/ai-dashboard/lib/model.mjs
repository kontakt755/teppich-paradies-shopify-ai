/**
 * Datenmodell des Control Centers.
 *
 * Eine Datei fuer Browser (ES-Modul) und Node (Server, Build-Skript, Tests).
 * Enthaelt keinerlei DOM- oder Netzwerkzugriff. Alles, was Bedeutung aus
 * GitHub-Issues ableitet (Status, Prioritaet, Body-Felder, Uebergaenge,
 * Dringlichkeit), steht hier - damit Server und Oberflaeche dieselben Regeln
 * anwenden und die Regeln testbar sind.
 *
 * Fuehrende Quelle bleibt das GitHub-Issue (siehe docs/control-center/ARCHITEKTUR.md).
 */

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Reihenfolge = Reihenfolge im Workflow und im Kanban. */
export const STATUSES = Object.freeze([
  { key: 'eingang',    label: 'Eingang',             githubLabel: 'status:eingang',    column: 'eingang',   open: true,  legacy: false },
  { key: 'triage',     label: 'Triage',              githubLabel: 'status:triage',     column: 'eingang',   open: true,  legacy: false },
  { key: 'geplant',    label: 'Geplant',             githubLabel: 'status:geplant',    column: 'geplant',   open: true,  legacy: false },
  { key: 'bereit',     label: 'Bereit',              githubLabel: 'status:bereit',     column: 'bereit',    open: true,  legacy: false },
  { key: 'in-arbeit',  label: 'In Arbeit',           githubLabel: 'status:in-arbeit',  column: 'in-arbeit', open: true,  legacy: false },
  { key: 'korrektur',  label: 'In Arbeit · Korrektur', githubLabel: 'status:korrektur', column: 'in-arbeit', open: true, legacy: true },
  { key: 'review',     label: 'Review',              githubLabel: 'status:review',     column: 'review',    open: true,  legacy: false },
  { key: 'freigabe',   label: 'Warten auf Freigabe', githubLabel: 'status:freigabe',   column: 'freigabe',  open: true,  legacy: false },
  { key: 'blockiert',  label: 'Blockiert',           githubLabel: 'status:blockiert',  column: 'blockiert', open: true,  legacy: false },
  { key: 'beobachten', label: 'Beobachten',          githubLabel: 'status:beobachten', column: 'beobachten', open: true, legacy: false },
  { key: 'fertig',     label: 'Erledigt',            githubLabel: 'status:fertig',     column: 'fertig',    open: false, legacy: false },
  { key: 'abgebrochen', label: 'Abgebrochen',        githubLabel: 'status:abgebrochen', column: 'fertig',   open: false, legacy: false },
]);

export const STATUS_BY_KEY = Object.freeze(Object.fromEntries(STATUSES.map(s => [s.key, s])));
export const STATUS_LABELS = Object.freeze(STATUSES.map(s => s.githubLabel));

/** Kanban-Spalten in Anzeigereihenfolge. */
export const COLUMNS = Object.freeze([
  { key: 'eingang',   label: 'Eingang' },
  { key: 'geplant',   label: 'Geplant' },
  { key: 'bereit',    label: 'Bereit' },
  { key: 'in-arbeit', label: 'In Arbeit' },
  { key: 'review',    label: 'Review' },
  { key: 'freigabe',  label: 'Freigabe' },
  { key: 'blockiert', label: 'Blockiert' },
  { key: 'fertig',    label: 'Erledigt' },
]);

/**
 * Uebergangsregel, solange `status:freigabe` als Label nicht existiert:
 * `status:blockiert` + `reviewer:mensch` bedeutet "Warten auf Freigabe".
 * Sobald das Label angelegt ist, greift die Regel nur noch fuer Alt-Issues.
 */
export const LEGACY_APPROVAL_RULE = Object.freeze({ status: 'status:blockiert', reviewer: 'reviewer:mensch', maps: 'freigabe' });

export const PRIORITIES = Object.freeze({
  p0: { key: 'p0', label: 'P0 · Kritisch', short: 'P0', rank: 0 },
  p1: { key: 'p1', label: 'P1 · Hoch',     short: 'P1', rank: 1 },
  p2: { key: 'p2', label: 'P2 · Normal',   short: 'P2', rank: 2 },
  p3: { key: 'p3', label: 'P3 · Niedrig',  short: 'P3', rank: 3 },
});

/** Bereiche = Portfolioebene. `areas` sind die area:-Labels, die dort einzahlen. */
export const AREAS = Object.freeze([
  { key: 'shop',      label: 'Shopify-Shop & Conversion',            areas: ['design', 'navigation', 'produktseite', 'kategorie', 'filter', 'warenkorb', 'checkout', 'versand'] },
  { key: 'katalog',   label: 'Produktkatalog & Datenqualität',      areas: ['produktdaten', 'katalog', 'collections'] },
  { key: 'seo',       label: 'SEO & Content',                        areas: ['seo', 'content'] },
  { key: 'ads',       label: 'Google Ads',                           areas: ['google', 'ads'] },
  { key: 'analytics', label: 'Analytics, Tracking & Consent',        areas: ['analytics', 'tracking'] },
  { key: 'service',   label: 'Kundenservice / Operations',           areas: ['service', 'operations'] },
  { key: 'technik',   label: 'Technik, Integrationen & Sicherheit',  areas: ['backend', 'technik', 'sicherheit'] },
  { key: 'sonstiges', label: 'Sonstiges',                            areas: ['sonstiges'] },
]);

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------

export function labelValue(labels, prefix) {
  const hits = (labels || []).filter(l => l.startsWith(prefix));
  return hits.length ? hits[0].slice(prefix.length) : null;
}

export function labelValues(labels, prefix) {
  return (labels || []).filter(l => l.startsWith(prefix)).map(l => l.slice(prefix.length));
}

const DAY = 86_400_000;

export function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = new Date(from), b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.floor((b.getTime() - a.getTime()) / DAY);
}

/** Erkennt ISO (2026-09-30), deutsch (30.09.2026, 30.9.26) und "KW 37 2026" (Montag der KW). */
export function parseDate(text) {
  if (!text) return null;
  const s = String(text).trim();
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/KW\s*(\d{1,2})(?:[^\d]{1,5}(\d{4}))?/i);
  if (m) {
    const year = m[2] ? Number(m[2]) : new Date().getUTCFullYear();
    const week = Number(m[1]);
    // ISO-Woche: Montag der Woche 1 ist der Montag der Woche mit dem 4. Januar.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY + (week - 1) * 7 * DAY);
    return monday.toISOString().slice(0, 10);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Body-Parser
// ---------------------------------------------------------------------------

/** Ueberschrift-Synonyme (klein, ohne Umlaute) -> Feldname. */
const HEADINGS = [
  ['ziel', 'goal'], ['warum', 'goal'], ['problem', 'goal'], ['beschreibung', 'description'],
  ['akzeptanzkriterien', 'acceptance'], ['definition of done', 'acceptance'], ['checkliste', 'acceptance'],
  ['naechster schritt', 'nextStep'], ['nachster schritt', 'nextStep'], ['next step', 'nextStep'],
  ['worker', 'executor'], ['ausfuehrender', 'executor'], ['ausfuhrender', 'executor'], ['bearbeiter', 'executor'],
  ['owner', 'owner'], ['verantwortlich', 'owner'], ['verantwortlicher', 'owner'], ['verantwortliche', 'owner'],
  ['frist', 'due'], ['faellig', 'due'], ['fallig', 'due'], ['termin', 'due'], ['deadline', 'due'], ['start', 'start'],
  ['blocker', 'blocker'], ['blockiert durch', 'blocker'], ['status', 'statusText'],
  ['abhaengigkeiten', 'dependencies'], ['abhangigkeiten', 'dependencies'], ['dependencies', 'dependencies'],
  ['risk', 'risk'], ['risiko', 'risk'], ['groesse', 'size'], ['grosse', 'size'], ['aufwand', 'size'],
  ['frage', 'question'], ['entscheidung', 'question'], ['benoetigte entscheidung', 'question'], ['benotigte entscheidung', 'question'],
  ['optionen', 'options'], ['empfehlung', 'recommendation'], ['auswirkungen', 'impact'], ['kontext', 'context'],
  ['entscheider', 'decider'], ['entscheiderin', 'decider'], ['entscheidet', 'decider'],
  ['ergebnis', 'outcome'], ['begruendung', 'rationale'], ['begrundung', 'rationale'],
  ['projekt', 'project'], ['eskalation', 'escalation'],
];

function fold(s) {
  return String(s).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[*_`#:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function headingField(line) {
  // "## Ziel", "**Ziel:**", "Ziel:" (nur wenn die Zeile allein aus der Ueberschrift besteht)
  const raw = line.trim();
  let text = null;
  let inline = null;
  let m = raw.match(/^#{1,6}\s+(.+?)\s*:?\s*$/);
  if (m) text = m[1];
  else {
    m = raw.match(/^\*\*([^*]{2,40})\*\*\s*:?\s*(.*)$/) || raw.match(/^([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß /-]{1,40}):\s*(.*)$/);
    if (m) { text = m[1]; inline = m[2]?.trim() || null; }
  }
  if (!text) return null;
  const key = fold(text);
  const hit = HEADINGS.find(([h]) => key === h || key.startsWith(`${h} `));
  if (!hit) return null;
  return { field: hit[1], inline };
}

function clean(text) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function firstLine(text) {
  const line = clean(text).split('\n').map(l => l.replace(/^[-*>\s]+/, '').trim()).find(Boolean);
  return line || null;
}

function parseChecklist(text) {
  const items = [];
  for (const line of clean(text).split('\n')) {
    const m = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)$/);
    if (m) items.push({ done: m[1] !== ' ', text: m[2].trim() });
  }
  return items;
}

function parseOptions(text) {
  const options = [];
  for (const line of clean(text).split('\n')) {
    const m = line.match(/^\s*(?:[-*]|\d+[.)]|[A-Ca-c][.)])\s+(.+)$/);
    if (m) options.push(m[1].trim());
  }
  return options;
}

function parseRefs(text) {
  const refs = new Set();
  const s = clean(text);
  for (const m of s.matchAll(/#(\d+)/g)) refs.add(`#${m[1]}`);
  for (const m of s.matchAll(/\b([A-Z]{2,5}-\d{2,4})\b/g)) refs.add(m[1]);
  return [...refs];
}

/**
 * Zerlegt einen Issue-Body in Felder. Toleriert Markdown-Ueberschriften,
 * fette Labels und "Feld: Wert"-Zeilen. Unbekannte Abschnitte werden ignoriert.
 */
export function parseBody(body) {
  const out = {
    goal: null, description: null, nextStep: null, executor: null, owner: null,
    due: null, start: null, blocker: null, statusText: null, dependencies: [],
    risk: null, size: null, acceptance: null, question: null, options: [],
    recommendation: null, impact: null, context: null, decider: null, outcome: null,
    rationale: null, project: null, escalation: false, fingerprint: null,
  };
  if (!body) return out;
  const fp = body.match(/tp-ai-fingerprint:([a-f0-9]+)/);
  if (fp) out.fingerprint = fp[1];

  const sections = {};
  let current = 'description';
  const buffers = { description: [] };
  for (const line of String(body).split('\n')) {
    const h = headingField(line);
    if (h) {
      current = h.field;
      buffers[current] = buffers[current] || [];
      if (h.inline) buffers[current].push(h.inline);
      continue;
    }
    (buffers[current] = buffers[current] || []).push(line);
  }
  for (const [k, v] of Object.entries(buffers)) sections[k] = v.join('\n');

  out.description = clean(sections.description) || null;
  out.goal = firstLine(sections.goal) ? clean(sections.goal) : null;
  out.nextStep = firstLine(sections.nextStep);
  out.executor = firstLine(sections.executor);
  out.owner = firstLine(sections.owner);
  out.due = parseDate(sections.due) || null;
  out.start = parseDate(sections.start) || null;
  out.risk = firstLine(sections.risk);
  out.size = firstLine(sections.size);
  out.project = firstLine(sections.project);
  out.statusText = firstLine(sections.statusText);
  out.context = clean(sections.context) || null;
  out.impact = clean(sections.impact) || null;
  out.question = firstLine(sections.question);
  out.options = parseOptions(sections.options || '');
  out.recommendation = clean(sections.recommendation) || null;
  out.decider = firstLine(sections.decider);
  out.outcome = firstLine(sections.outcome);
  out.rationale = clean(sections.rationale) || null;
  out.dependencies = parseRefs(sections.dependencies || '');
  out.escalation = Boolean(sections.escalation && firstLine(sections.escalation)) || /\beskalation\b|\bESKALIERT\b/i.test(clean(body).split('\n')[0] || '');

  const acceptanceItems = parseChecklist(sections.acceptance || '');
  if (acceptanceItems.length) {
    out.acceptance = { total: acceptanceItems.length, done: acceptanceItems.filter(i => i.done).length, items: acceptanceItems };
  } else if (sections.acceptance && firstLine(sections.acceptance)) {
    out.acceptance = { total: 0, done: 0, items: [], text: clean(sections.acceptance) };
  }

  // Blocker: eigener Abschnitt oder "BLOCKIERT - Warte auf X" im Status-Abschnitt.
  const blockerText = firstLine(sections.blocker);
  if (blockerText) out.blocker = blockerText;
  else if (out.statusText && /blockiert|warte auf|wartet auf/i.test(out.statusText)) {
    out.blocker = out.statusText.replace(/^\**blockiert\**\s*[-–:]?\s*/i, '').trim() || out.statusText;
  }

  // "Nächster Schritt: Ahmet: Bitte Freigabe erteilen" -> Owner-Hinweis nicht erfinden, nur Freitext.
  return out;
}

// ---------------------------------------------------------------------------
// Task-Normalisierung
// ---------------------------------------------------------------------------

/** Ermittelt den Control-Center-Status aus Labels/Zustand. Meldet Konflikte. */
export function statusOf(issue) {
  const labels = issue.labels || [];
  const statusLabels = labels.filter(l => STATUS_LABELS.includes(l));
  const conflicts = statusLabels.length > 1 ? statusLabels : [];
  let key = statusLabels.length ? statusLabels[0].slice('status:'.length) : null;
  let legacyApproval = false;

  if (key === 'blockiert' && labels.includes(LEGACY_APPROVAL_RULE.reviewer)) {
    key = LEGACY_APPROVAL_RULE.maps;
    legacyApproval = true;
  }
  if (issue.state === 'closed') {
    if (key !== 'abgebrochen') key = 'fertig';
  } else if (!key) {
    key = 'eingang';
  } else if (key === 'fertig' || key === 'abgebrochen') {
    // offenes Issue mit Erledigt-Label: Konflikt anzeigen, Status bleibt sichtbar
    conflicts.push(`status:${key} bei offenem Issue`);
  }
  return { key, conflicts, legacyApproval };
}

function isAgentName(text) {
  return /\b(claude|codex|ki|ai|agent|worker|gpt|gemini|bot)\b/i.test(text || '');
}

/**
 * Baut aus einem rohen Issue (build-Skript oder gh) ein Task-Objekt.
 * `raw.body` ist optional (statischer Modus kennt nur die extrahierten Felder).
 */
export function normalizeTask(raw, { now = new Date() } = {}) {
  const labels = raw.labels || [];
  const fields = raw.fields || parseBody(raw.body);
  const st = statusOf(raw);
  const status = STATUS_BY_KEY[st.key];
  const priorityKey = labelValue(labels, 'priority:');
  const priority = PRIORITIES[priorityKey] || null;
  const area = labelValue(labels, 'area:');
  const type = labelValue(labels, 'type:');
  const reviewer = labelValue(labels, 'reviewer:');
  const titleIsAgent = /^🤖/.test(raw.title || '');
  const executor = fields.executor || (titleIsAgent ? 'KI-Agent' : null);
  const executorKind = executor ? (isAgentName(executor) || titleIsAgent ? 'ki' : 'mensch') : null;
  const owner = raw.assignee || null;
  const updated = raw.updated_at || raw.updatedAt || null;
  const created = raw.created_at || raw.createdAt || null;
  const isDecision = type === 'entscheidung' || Boolean(fields.question);
  const due = fields.due;
  const daysToDue = due ? daysBetween(now.toISOString().slice(0, 10), due) : null;

  const task = {
    id: `#${raw.number}`,
    number: raw.number,
    title: raw.title || '',
    url: raw.html_url || raw.url || null,
    state: raw.state || 'open',
    open: status.open,
    status: status.key,
    statusLabel: status.label,
    column: status.column,
    statusConflicts: st.conflicts,
    legacyApproval: st.legacyApproval,
    priority: priority ? priority.key : null,
    priorityRank: priority ? priority.rank : 9,
    type, area, reviewer,
    areaGroup: (AREAS.find(a => a.areas.includes(area || '')) || AREAS[AREAS.length - 1]).key,
    labels,
    owner,
    ownerHint: fields.owner || null,
    executor, executorKind,
    nextStep: fields.nextStep || raw.nextStep || null,
    goal: fields.goal,
    acceptance: fields.acceptance,
    blocker: st.key === 'blockiert' || st.key === 'freigabe' ? (fields.blocker || null) : (fields.blocker || null),
    dependencies: fields.dependencies,
    risk: fields.risk,
    size: fields.size,
    due, daysToDue,
    overdue: daysToDue !== null && daysToDue < 0 && status.open,
    escalation: fields.escalation || labels.includes('eskalation'),
    isDecision,
    decision: isDecision ? {
      question: fields.question || raw.title,
      options: fields.options,
      recommendation: fields.recommendation,
      impact: fields.impact,
      context: fields.context || fields.description,
      decider: fields.decider || owner,
      deadline: due,
      outcome: fields.outcome,
      rationale: fields.rationale,
    } : null,
    fingerprint: fields.fingerprint,
    createdAt: created,
    updatedAt: updated,
    closedAt: raw.closed_at || raw.closedAt || null,
    daysSinceUpdate: updated ? daysBetween(updated, now) : null,
    ageDays: created ? daysBetween(created, now) : null,
  };
  task.triage = triageGaps(task);
  return task;
}

/** Pflichtlücken, die als Triage-Arbeit sichtbar werden. */
export function triageGaps(task) {
  const gaps = [];
  if (!task.open) return gaps;
  const active = ['bereit', 'in-arbeit', 'korrektur', 'review', 'blockiert', 'freigabe'].includes(task.status);
  if (!task.priority) gaps.push('Priorität fehlt');
  if (active && !task.owner) gaps.push('Owner fehlt');
  if (active && !task.nextStep) gaps.push('Nächster Schritt fehlt');
  if (task.status === 'blockiert' && !task.blocker) gaps.push('Blocker-Grund fehlt');
  if (task.status === 'freigabe' && !(task.decision?.decider || task.owner)) gaps.push('Entscheider fehlt');
  if (task.statusConflicts.length) gaps.push(`Status-Konflikt: ${task.statusConflicts.join(', ')}`);
  if (!task.area) gaps.push('Bereich fehlt');
  return gaps;
}

// ---------------------------------------------------------------------------
// Dringlichkeit
// ---------------------------------------------------------------------------

/** Wer haengt an dieser Aufgabe? (andere Aufgaben, die sie in Abhaengigkeiten nennen) */
export function dependentsOf(task, tasks) {
  const keys = new Set([task.id, ...(task.title.match(/\[([A-Z]{2,5}-\d{2,4})\]/g) || []).map(s => s.slice(1, -1))]);
  return tasks.filter(t => t.number !== task.number && t.open && t.dependencies.some(d => keys.has(d)));
}

export function attentionScore(task, tasks = [], { now = new Date() } = {}) {
  if (!task.open) return { score: 0, reasons: [] };
  const reasons = [];
  let score = 0;
  const add = (points, why) => { score += points; reasons.push(why); };

  if (task.priority === 'p0') add(50, 'P0 kritisch');
  else if (task.priority === 'p1') add(30, 'P1 hoch');
  else if (task.priority === 'p2') add(10, 'P2');

  if (task.status === 'freigabe') add(40, 'wartet auf Freigabe');
  if (task.status === 'blockiert') {
    const age = Math.min(15, Math.max(0, task.daysSinceUpdate ?? 0));
    add(30 + age, age ? `blockiert seit ${age} Tag${age === 1 ? '' : 'en'}` : 'blockiert');
  }
  if (task.daysToDue !== null) {
    if (task.daysToDue < 0) add(35, `überfällig seit ${-task.daysToDue} Tag${task.daysToDue === -1 ? '' : 'en'}`);
    else if (task.daysToDue === 0) add(25, 'heute fällig');
    else if (task.daysToDue <= 3) add(10, `fällig in ${task.daysToDue} Tagen`);
  }
  if (task.escalation) add(40, 'eskaliert');
  const dependents = dependentsOf(task, tasks);
  if (dependents.length) add(8 * dependents.length, `hält ${dependents.length} andere Aufgabe${dependents.length === 1 ? '' : 'n'} auf`);
  if (['in-arbeit', 'korrektur'].includes(task.status) && (task.daysSinceUpdate ?? 0) >= 7) add(15, `in Arbeit ohne Update seit ${task.daysSinceUpdate} Tagen`);
  if (task.status === 'review' && (task.daysSinceUpdate ?? 0) >= 3) add(10, `Review offen seit ${task.daysSinceUpdate} Tagen`);
  if (['in-arbeit', 'korrektur', 'bereit'].includes(task.status) && !task.owner) add(5, 'ohne Owner');
  void now;
  return { score, reasons };
}

export function attentionList(tasks, { now = new Date(), limit = 5 } = {}) {
  return tasks
    .map(t => ({ task: t, ...attentionScore(t, tasks, { now }) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.task.priorityRank - b.task.priorityRank || b.task.number - a.task.number)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Uebergaenge
// ---------------------------------------------------------------------------

/** Erlaubte Zielstatus je Ausgangsstatus. */
export const TRANSITIONS = Object.freeze({
  eingang:    ['triage', 'geplant', 'bereit', 'in-arbeit', 'beobachten', 'abgebrochen'],
  triage:     ['geplant', 'bereit', 'beobachten', 'abgebrochen', 'eingang'],
  geplant:    ['bereit', 'in-arbeit', 'triage', 'beobachten', 'blockiert', 'freigabe', 'abgebrochen'],
  bereit:     ['in-arbeit', 'geplant', 'blockiert', 'freigabe', 'abgebrochen'],
  'in-arbeit': ['review', 'blockiert', 'freigabe', 'bereit', 'fertig', 'abgebrochen'],
  korrektur:  ['review', 'blockiert', 'freigabe', 'in-arbeit', 'abgebrochen'],
  review:     ['fertig', 'korrektur', 'in-arbeit', 'freigabe', 'blockiert'],
  freigabe:   ['bereit', 'in-arbeit', 'geplant', 'review', 'abgebrochen', 'blockiert'],
  blockiert:  ['bereit', 'in-arbeit', 'geplant', 'freigabe', 'abgebrochen'],
  beobachten: ['triage', 'geplant', 'bereit', 'abgebrochen'],
  fertig:     ['in-arbeit', 'geplant'],
  abgebrochen: ['triage', 'geplant'],
});

/**
 * Pflichtangaben fuer einen Uebergang. `payload` sind die Angaben aus der
 * Aktion (owner, comment, reason, confirmAcceptance). Rueckgabe: fehlende
 * Angaben in Klartext, leer = erlaubt.
 */
export function requirementsFor(task, target, payload = {}) {
  const missing = [];
  const allowed = TRANSITIONS[task.status] || [];
  if (!STATUS_BY_KEY[target]) return [`Unbekannter Status „${target}"`];
  if (!allowed.includes(target)) return [`Übergang ${task.statusLabel} → ${STATUS_BY_KEY[target].label} ist nicht vorgesehen`];

  const ownerGiven = task.owner || payload.owner;
  if (['in-arbeit', 'bereit'].includes(target) && !ownerGiven) missing.push('Owner (Assignee) zuordnen');
  if (target === 'review' && !(payload.comment || '').trim()) missing.push('Ergebnis oder Checkliste als Kommentar angeben');
  if (target === 'blockiert' && !(payload.reason || '').trim()) missing.push('Blocker-Grund angeben (wer/was, benötigte Aktion)');
  if (target === 'freigabe' && !(payload.reason || '').trim() && !task.decision) missing.push('Freigabefrage angeben (was soll entschieden werden?)');
  if (target === 'abgebrochen' && !(payload.reason || '').trim()) missing.push('Begründung für den Abbruch angeben');
  if (target === 'fertig') {
    const acc = task.acceptance;
    const complete = acc && acc.total > 0 && acc.done === acc.total;
    if (!complete && !payload.confirmAcceptance) missing.push(acc && acc.total ? `Akzeptanzkriterien nicht vollständig (${acc.done}/${acc.total}) – bestätigen oder abhaken` : 'Keine Akzeptanzkriterien – Erledigung ausdrücklich bestätigen');
  }
  return missing;
}

/** Welche Labels muessen fuer den Zielstatus gesetzt/entfernt werden. */
export function labelChangesFor(task, target, { hasLabel = () => true } = {}) {
  const remove = task.labels.filter(l => STATUS_LABELS.includes(l));
  const wanted = STATUS_BY_KEY[target].githubLabel;
  const add = [];
  let note = null;
  if (hasLabel(wanted)) add.push(wanted);
  else if (target === 'freigabe') {
    // Uebergangsregel: bis das Label existiert, blockiert + reviewer:mensch
    add.push('status:blockiert');
    if (!task.labels.includes('reviewer:mensch')) add.push('reviewer:mensch');
    note = 'Label status:freigabe fehlt im Repository – Übergangsregel (blockiert + reviewer:mensch) angewendet';
  } else if (target === 'triage' || target === 'beobachten') {
    add.push('status:eingang'); note = `Label ${wanted} fehlt im Repository – als Eingang gesetzt`;
  } else if (target === 'bereit') {
    add.push('status:geplant'); note = `Label ${wanted} fehlt im Repository – als Geplant gesetzt`;
  } else if (target === 'abgebrochen') {
    add.push('status:fertig'); note = `Label ${wanted} fehlt im Repository – als Fertig gesetzt, Issue wird geschlossen`;
  } else add.push(wanted);
  // Der Legacy-Freigabe-Marker wird beim Verlassen von "freigabe" entfernt.
  if (task.legacyApproval && target !== 'freigabe' && task.labels.includes('reviewer:mensch')) remove.push('reviewer:mensch');
  const close = ['fertig', 'abgebrochen'].includes(target);
  const reopen = !close && task.state === 'closed';
  return { add: [...new Set(add)], remove: [...new Set(remove.filter(l => !add.includes(l)))], close, reopen, note };
}

// ---------------------------------------------------------------------------
// Ansichten und Kennzahlen
// ---------------------------------------------------------------------------

export const SAVED_VIEWS = Object.freeze([
  { key: 'alle',        label: 'Alle offenen',         filter: t => t.open },
  { key: 'meine',       label: 'Meine Aufgaben',       filter: (t, ctx) => t.open && ctx.me && t.owner && t.owner.toLowerCase() === ctx.me.toLowerCase() },
  { key: 'unzugeordnet', label: 'Unzugeordnet',        filter: t => t.open && !t.owner && !['eingang', 'triage', 'beobachten'].includes(t.status) },
  { key: 'blockiert',   label: 'Blockiert',            filter: t => t.status === 'blockiert' },
  { key: 'heute',       label: 'Heute fällig',         filter: t => t.open && t.daysToDue !== null && t.daysToDue <= 0 },
  { key: 'ki',          label: 'KI wartet',            filter: t => t.open && t.executorKind === 'ki' && ['review', 'freigabe', 'blockiert'].includes(t.status) },
  { key: 'review',      label: 'Review-Queue',         filter: t => t.status === 'review' },
  { key: 'stale',       label: 'Ohne Update seit 7 Tagen', filter: t => t.open && (t.daysSinceUpdate ?? 0) >= 7 && !['eingang', 'beobachten', 'geplant'].includes(t.status) },
  { key: 'triage',      label: 'Triage nötig',         filter: t => t.open && t.triage.length > 0 },
  { key: 'freigabe',    label: 'Warten auf Freigabe',  filter: t => t.status === 'freigabe' },
]);

export const SORTS = Object.freeze({
  dringlichkeit: { label: 'Dringlichkeit', compare: (a, b, ctx) => (ctx.scores.get(b.number) ?? 0) - (ctx.scores.get(a.number) ?? 0) || a.priorityRank - b.priorityRank },
  faelligkeit:   { label: 'Fälligkeit',    compare: (a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0 },
  prioritaet:    { label: 'Priorität',     compare: (a, b) => a.priorityRank - b.priorityRank || b.number - a.number },
  bereich:       { label: 'Bereich',       compare: (a, b) => (a.area || 'zz').localeCompare(b.area || 'zz') || a.priorityRank - b.priorityRank },
  aktualisiert:  { label: 'Zuletzt aktualisiert', compare: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') },
});

export function summarize(tasks, { now = new Date() } = {}) {
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
  const open = tasks.filter(t => t.open);
  return {
    open: open.length,
    critical: open.filter(t => t.priority === 'p0').length,
    blocked: open.filter(t => t.status === 'blockiert').length,
    approvals: open.filter(t => t.status === 'freigabe').length,
    inProgress: open.filter(t => ['in-arbeit', 'korrektur'].includes(t.status)).length,
    review: open.filter(t => t.status === 'review').length,
    dueToday: open.filter(t => t.daysToDue !== null && t.daysToDue <= 0).length,
    overdue: open.filter(t => t.overdue).length,
    doneThisWeek: tasks.filter(t => t.closedAt && t.closedAt >= weekAgo).length,
    newThisWeek: tasks.filter(t => t.createdAt && t.createdAt >= weekAgo).length,
    triage: open.filter(t => t.triage.length).length,
    unassigned: open.filter(t => !t.owner && !['eingang', 'triage', 'beobachten'].includes(t.status)).length,
  };
}

/** Bereichszustand mit Begruendung – keine Farbe ohne Erklaerung. */
export function areaHealth(tasks, { now = new Date() } = {}) {
  return AREAS.map(group => {
    const own = tasks.filter(t => t.areaGroup === group.key);
    const open = own.filter(t => t.open);
    const reasons = [];
    let level = 'ok';
    const p0 = open.filter(t => t.priority === 'p0');
    const blocked = open.filter(t => t.status === 'blockiert');
    const approvals = open.filter(t => t.status === 'freigabe');
    const overdue = open.filter(t => t.overdue);
    const stale = open.filter(t => ['in-arbeit', 'korrektur'].includes(t.status) && (t.daysSinceUpdate ?? 0) >= 7);
    if (p0.length) { level = 'kritisch'; reasons.push(`${p0.length} P0 offen`); }
    if (overdue.length) { level = 'kritisch'; reasons.push(`${overdue.length} überfällig`); }
    if (blocked.length) { if (level === 'ok') level = 'achtung'; reasons.push(`${blocked.length} blockiert`); }
    if (approvals.length) { if (level === 'ok') level = 'achtung'; reasons.push(`${approvals.length} Freigabe${approvals.length === 1 ? '' : 'n'} offen`); }
    if (stale.length) { if (level === 'ok') level = 'achtung'; reasons.push(`${stale.length} ohne Update seit 7 Tagen`); }
    if (!open.length) reasons.push('keine offene Arbeit');
    if (level === 'ok' && open.length) reasons.push('keine Blocker, Freigaben oder Überfälligkeiten');
    return {
      key: group.key, label: group.label, level, reasons,
      open: open.length, inProgress: open.filter(t => ['in-arbeit', 'korrektur'].includes(t.status)).length,
      blocked: blocked.length, approvals: approvals.length,
      owners: [...new Set(open.map(t => t.owner).filter(Boolean))],
      top: open.slice().sort((a, b) => a.priorityRank - b.priorityRank).slice(0, 3),
    };
  }).filter(a => a.open || a.key !== 'sonstiges');
  void now;
}

/** Datenfrische in Worten. */
export function freshness(generatedAt, { now = new Date(), warnMinutes = 90, staleMinutes = 6 * 60 } = {}) {
  if (!generatedAt) return { level: 'unbekannt', minutes: null, text: 'Datenstand unbekannt' };
  const minutes = Math.round((now.getTime() - new Date(generatedAt).getTime()) / 60000);
  const text = minutes < 1 ? 'gerade eben' : minutes < 60 ? `vor ${minutes} Min.` : minutes < 48 * 60 ? `vor ${Math.round(minutes / 60)} Std.` : `vor ${Math.round(minutes / 1440)} Tagen`;
  const level = minutes > staleMinutes ? 'veraltet' : minutes > warnMinutes ? 'alt' : 'frisch';
  return { level, minutes, text };
}

/** Einfache Volltextsuche (Titel, Nummer, Labels, nächster Schritt, Owner). */
export function matchesQuery(task, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = `${task.id} ${task.title} ${task.labels.join(' ')} ${task.nextStep || ''} ${task.owner || ''} ${task.executor || ''} ${task.blocker || ''}`.toLowerCase();
  return q.split(/\s+/).every(part => hay.includes(part));
}
