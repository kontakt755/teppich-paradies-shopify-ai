/**
 * Lokale Aktions-API des Control Centers (nur npm run dashboard, nur 127.0.0.1).
 *
 * Jede Schreibaktion laeuft ueber die gh CLI unter dem Konto des angemeldeten
 * Menschen und landet damit auditierbar im GitHub-Issue (Label, Assignee,
 * Kommentar). Uebergaenge werden HIER serverseitig geprueft - mit denselben
 * Regeln wie im Browser (docs/ai-dashboard/lib/model.mjs). Ein Client, der
 * die Oberflaeche umgeht, bekommt dieselbe Ablehnung.
 *
 * Es gibt keinen zweiten Aufgabenspeicher: nach jedem Schreibvorgang wird
 * issues.json neu erzeugt, damit Oberflaeche und GitHub identisch sind.
 *
 * `gh` ist injizierbar (Tests). Alle Funktionen sind frei von HTTP-Details.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeTask, requirementsFor, labelChangesFor, STATUS_BY_KEY, STATUS_LABELS } from '../docs/ai-dashboard/lib/model.mjs';
import { toIssueRecord } from './build-dashboard-data.mjs';
import { aufbereiten } from '../operations/lib/bestelluebersicht.mjs';
import { ladeExport } from '../operations/scripts/bestelluebersicht.mjs';
import { auftragsstatusPfad, leseAlle as leseAuftragsstatus, setzeStatus, STATUS_ORDER, AuftragsstatusFehler } from '../operations/lib/auftragsstatus.mjs';

const execFileP = promisify(execFile);

export const DEFAULT_REPO = process.env.DASHBOARD_REPO || 'kontakt755/teppich-paradies-shopify-ai';

export class ApiError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

/** Standard-gh-Aufruf: Rueckgabe stdout als String. */
export async function defaultGh(args, { timeout = 30_000 } = {}) {
  const { stdout } = await execFileP('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout });
  return stdout;
}

const DECISION_LABEL = {
  approve: 'Freigabe erteilt',
  reject: 'Freigabe abgelehnt',
  question: 'Rückfrage',
  delegate: 'Delegiert',
  later: 'Entscheidung vertagt',
};

function clip(text, max = 4_000) {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Kommentar-Format des Control Centers: maschinen- und menschenlesbar. */
export function buildComment({ actor, heading, lines = [], text = null }) {
  const out = [`## Control Center: ${heading}`, '', `- Von: @${actor}`, ...lines.map(l => `- ${l}`)];
  if (text) out.push('', clip(text));
  out.push('', '<!-- tp-control-center -->');
  return out.join('\n');
}

/**
 * Einkauf-Bereich: Bestelluebersicht und Produktdaten-Status.
 *
 * Liest ausschliesslich private Dateien ausserhalb des Repositories
 * ($TP_PRIVAT_DIR, Standard ~/teppich-paradies-analyse). Nichts davon landet
 * in docs/ai-dashboard/issues.json oder sonst im Repository - die Endpunkte
 * existieren nur im lokalen Server (scripts/serve-dashboard.mjs), nicht auf
 * GitHub Pages. Fehlende Dateien sind kein Fehler, nur ein leerer Zustand.
 */
export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

function readJsonIfExists(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * Produktdaten-Status: Klartext, Blockier-Status und Naechster-Schritt-Text
 * je Einkaufsfeld. Drei ehrliche Gruppen, nicht zwei:
 *
 * - "blockierend": ohne dieses Feld kann die Ware beim Lieferanten nicht
 *   bestellt werden - Lieferant oder Artikelnummer fehlt. Das ist die einzige
 *   Gruppe, die die grosse Zahl oben treibt.
 * - "nachtragen": wuenschenswerte Zusatzinformation (Farbnummer, Kollektion,
 *   Hersteller, Lieferanten-Produktname/-URL) - fehlt sie, blockiert das
 *   keine Bestellung, ist aber eine echte Luecke.
 * - strukturell offen (kein Meta-Eintrag mit blockierend/nachtragen noetig,
 *   siehe istStrukturellOffenerFall()): umrechnung (Format nie definiert),
 *   procurement_id ausserhalb der Rollenware (dort nie vorgesehen) und jede
 *   Wunschmass-Variante (SKU/Artikelnummer entstehen erst beim Zuschnitt) -
 *   zaehlt nirgends als Aufgabe.
 *
 * Quelle der Feldnamen: einkauf-klaerung/offen.json (Feld `field`).
 */
const EINKAUF_FELD_META = {
  lieferant: { klartext: 'Lieferant', blockierend: true },
  artikelnummer: { klartext: 'Artikelnummer', blockierend: true },
  'lieferant/artikelnummer': { klartext: 'Lieferant/Artikelnummer', blockierend: true },
  bestelleinheit: { klartext: 'Bestellmenge unklar', blockierend: true },
  farbnummer: { klartext: 'Farbnummer', blockierend: false },
  lieferant_kollektion: { klartext: 'Kollektion', blockierend: false },
  hersteller: { klartext: 'Hersteller', blockierend: false },
  farbname: { klartext: 'Farbname', blockierend: false },
  lieferant_produktname: { klartext: 'Lieferanten-Produktname', blockierend: false },
  lieferant_url: { klartext: 'Lieferanten-Produktseite', blockierend: false },
  procurement_id: { klartext: 'Einkaufs-ID', blockierend: false },
  umrechnung: { klartext: 'Umrechnung', blockierend: false },
};

function einkaufFeldKlartext(feld) {
  return EINKAUF_FELD_META[feld]?.klartext || feld;
}

function einkaufFeldBlockierend(feld) {
  return Boolean(EINKAUF_FELD_META[feld]?.blockierend);
}

/**
 * Strukturell offene Faelle zaehlen nie als Aufgabe (weder blockierend noch
 * nachtragen) - siehe Kommentar an EINKAUF_FELD_META. `gruppe` und
 * `variantTitle` kommen aus dem Dry-Run-Plan (plan.json) der Variante.
 */
function istStrukturellOffenerFall(feld, gruppe, variantTitle) {
  if (/wunschma/i.test(variantTitle || '')) return true;
  if (feld === 'umrechnung') return true;
  if (feld === 'procurement_id' && gruppe !== 'Rollenware') return true;
  return false;
}

/**
 * Naechster Schritt in verstaendlichem Deutsch, je Feld und - wo noetig -
 * je nach Grund unterschiedlich (z. B. Kaskade ueber einen offenen
 * Lieferanten, oder das Nummernsystem-Problem aus
 * docs/lessons/zwei-nummernsysteme-doellken.md). Faellt kein Grund-Muster,
 * bleibt der generische Satz fuer das Feld.
 */
function einkaufNaechsterSchritt(feld, grund) {
  const g = String(grund || '');
  const lieferantUnklar = /Lieferant unklar/i.test(g);
  switch (feld) {
    case 'lieferant':
    case 'lieferant/artikelnummer':
      return 'Lieferant von Hand klaeren (Preisliste/Lieferantenliste abgleichen)';
    case 'artikelnummer':
      if (lieferantUnklar) return 'Kommt automatisch, sobald der Lieferant geklaert ist';
      return 'Artikelnummer bei Lieferant nicht gefunden - von Hand in Preisliste/Katalog pruefen';
    case 'farbnummer':
      if (lieferantUnklar) return 'Kommt automatisch, sobald der Lieferant geklaert ist';
      if (/zwei Nummernsysteme/i.test(g)) return 'Farbcode und Artikelnummer-Suffix weichen ab - von Hand gegen die Lieferantenliste pruefen (zwei Nummernsysteme)';
      return 'Farbnummer von der Lieferantenliste abschreiben, nie fortlaufend zaehlen';
    case 'bestelleinheit':
      if (/VE oder Stueck/i.test(g)) return 'Verpackungseinheit oder Einzelstueck? Von Hand in der Preisliste pruefen';
      if (/Massteppich/i.test(g)) return 'Bestelleinheit als Zuschnitt+Einfassung von Hand festlegen (Inhaberentscheidung noetig)';
      return 'Bestelleinheit von Hand aus der Preisliste uebernehmen';
    case 'lieferant_kollektion':
      return 'Kollektion kommt automatisch, sobald die Lieferantenseite geholt ist';
    case 'hersteller':
      return 'Hersteller kommt automatisch, sobald Lieferant und Kollektion bekannt sind';
    default:
      return 'Fuellt sich automatisch aus den uebrigen Feldern, keine Aktion noetig';
  }
}

/** Ist der Schritt fuer dieses Feld+Grund menschliche Handarbeit oder automatisch? */
function einkaufBrauchtHandarbeit(feld, grund) {
  if (!einkaufFeldBlockierend(feld)) return false;
  return !/^Kommt automatisch/.test(einkaufNaechsterSchritt(feld, grund));
}

function produktSucheTreffer(eintrag, q) {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  if (!n) return true;
  const skus = (eintrag.varianten || []).map(v => v.sku).filter(Boolean).join(' ');
  return [eintrag.titel, eintrag.handle, skus].some(v => String(v ?? '').toLowerCase().includes(n));
}

/**
 * Baut je Produkt (Handle) eine Arbeitslisten-Zeile aus dem Einkauf-Dry-Run
 * (plan.json, Dimension: Titel/Gruppe/Varianten je gid) und dem frischeren
 * Klaerungslauf (offen.json, Feld+Grund je gid - das ist die tatsaechlich
 * noch offene Menge, plan.json selbst ist ein aelterer Zwischenstand).
 */
function produktstatusAufbauen(planRows, offenRows) {
  const dim = new Map(planRows.map(r => [r.gid, r]));
  const produkte = new Map();
  for (const r of planRows) {
    if (produkte.has(r.handle)) {
      produkte.get(r.handle).varianten.push({ gid: r.gid, sku: r.sku, variante: r.variant_title });
      continue;
    }
    produkte.set(r.handle, {
      handle: r.handle,
      titel: r.product_title,
      gruppe: r.gruppe || 'Unbekannt',
      varianten: [{ gid: r.gid, sku: r.sku, variante: r.variant_title }],
      offeneFelderRoh: new Map(), // feld -> {grund, varianten:Set}
    });
  }

  for (const o of offenRows) {
    const dr = dim.get(o.gid);
    if (!dr) continue; // Variante nicht (mehr) im Dry-Run-Plan - kann verwaist sein, wird nicht erfunden
    if (istStrukturellOffenerFall(o.field, dr.gruppe, dr.variant_title)) continue; // keine Aufgabe, siehe Kommentar oben
    const p = produkte.get(dr.handle);
    if (!p) continue;
    const bestehend = p.offeneFelderRoh.get(o.field);
    if (bestehend) bestehend.varianten.add(o.gid);
    else p.offeneFelderRoh.set(o.field, { grund: o.reason, varianten: new Set([o.gid]) });
  }

  const eintraege = [];
  for (const p of produkte.values()) {
    let offeneFelder = [...p.offeneFelderRoh.entries()].map(([feld, info]) => ({
      feld,
      klartext: einkaufFeldKlartext(feld),
      blockierend: einkaufFeldBlockierend(feld),
      grund: info.grund || 'kein Grund hinterlegt',
      naechsterSchritt: einkaufNaechsterSchritt(feld, info.grund),
      handarbeit: einkaufBrauchtHandarbeit(feld, info.grund),
      variantenBetroffen: info.varianten.size,
    }));
    // Kaskade: ist der Lieferant selbst offen, sind Artikel-/Farbnummer nur
    // eine Folge davon - nicht als eigene Handlungspunkte doppeln.
    if (offeneFelder.some(f => f.feld === 'lieferant' || f.feld === 'lieferant/artikelnummer')) {
      offeneFelder = offeneFelder.filter(f => !/Lieferant unklar/i.test(f.grund) || f.feld === 'lieferant' || f.feld === 'lieferant/artikelnummer');
    }
    offeneFelder.sort((a, b) => (b.blockierend - a.blockierend) || (b.handarbeit - a.handarbeit));

    const blockierendeFelder = offeneFelder.filter(f => f.blockierend);
    const handarbeitFelder = offeneFelder.filter(f => f.handarbeit);
    const vollstaendig = offeneFelder.length === 0;
    const status = vollstaendig ? 'vollstaendig' : handarbeitFelder.length ? 'handarbeit' : 'automatisch';

    eintraege.push({
      handle: p.handle,
      titel: p.titel,
      gruppe: p.gruppe,
      variantenAnzahl: p.varianten.length,
      varianten: p.varianten,
      vollstaendig,
      status,
      blockiertBestellung: blockierendeFelder.length > 0,
      offeneFelder,
      dringlichkeit: (blockierendeFelder.length * 1000) + (handarbeitFelder.length * 10) + offeneFelder.length,
    });
  }
  return eintraege;
}

export function createApi({ gh = defaultGh, repo = DEFAULT_REPO, root = process.cwd(), rebuild = null, stateDir = null, ledgerPath = null, privatDirPath = null, now = () => new Date() } = {}) {
  let userCache = null;
  let labelCache = { at: 0, names: [] };
  // Prozesszustand des Knopfs "Jetzt aktualisieren" - genau ein Lauf gleichzeitig,
  // pro Serverprozess (nicht persistent; ein Neustart des Servers vergisst einen
  // noch laufenden Kindprozess, der aber unabhaengig weiterlaeuft und sein Ergebnis
  // ohnehin nur in aktualisierung.json schreibt).
  let aktualisierungLauf = null; // { seit, fehler, fertig } waehrend ein Lauf aktiv ist, sonst null

  const auditPath = path.join(root, '.router', 'control-center-audit.jsonl');
  function audit(entry) {
    try {
      fs.mkdirSync(path.dirname(auditPath), { recursive: true });
      fs.appendFileSync(auditPath, `${JSON.stringify({ at: now().toISOString(), ...entry })}\n`);
    } catch { /* Audit darf die Aktion nicht verhindern; der GitHub-Kommentar ist die fuehrende Spur. */ }
  }

  async function currentUser() {
    if (userCache) return userCache;
    try { userCache = (await gh(['api', 'user', '--jq', '.login'])).trim() || null; } catch { userCache = null; }
    return userCache;
  }

  async function repoLabels() {
    if (Date.now() - labelCache.at < 5 * 60_000 && labelCache.names.length) return labelCache.names;
    const raw = await gh(['api', '--paginate', `repos/${repo}/labels?per_page=100`]);
    const names = raw.trim().replace(/\]\s*\[/g, ',').replace(/^\[?/, '[').replace(/\]?$/, ']');
    let parsed;
    try { parsed = JSON.parse(names); } catch { parsed = JSON.parse(raw); }
    labelCache = { at: Date.now(), names: parsed.map(l => l.name) };
    return labelCache.names;
  }

  async function fetchIssue(number) {
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'Ungültige Aufgabennummer');
    let raw;
    try { raw = JSON.parse(await gh(['api', `repos/${repo}/issues/${n}`])); }
    catch (e) { throw new ApiError(404, `Aufgabe #${n} nicht gefunden (${e.message.split('\n')[0]})`); }
    if (raw.pull_request) throw new ApiError(400, `#${n} ist ein Pull Request, keine Aufgabe`);
    const record = toIssueRecord(raw);
    return { raw, record, task: normalizeTask({ ...record, body: raw.body }, { now: now() }) };
  }

  async function afterWrite() {
    if (typeof rebuild === 'function') {
      try { await rebuild(); } catch (e) { return `issues.json konnte nicht neu erzeugt werden: ${e.message}`; }
    }
    return null;
  }

  return {
    async capabilities() {
      const user = await currentUser();
      let labelsAvailable = [];
      try { labelsAvailable = (await repoLabels()).filter(l => /^(status|type|priority|area|reviewer):/.test(l)); } catch { /* bleibt leer */ }
      return {
        mode: 'local', user, actions: Boolean(user), sync: true, agentRuns: true, activity: true,
        repo, labelsAvailable,
        note: user ? null : 'gh ist nicht angemeldet – Aktionen sind gesperrt (gh auth login).',
      };
    },

    async sync() {
      const warn = await afterWrite();
      if (warn) throw new ApiError(502, warn);
      const file = path.join(root, 'docs/ai-dashboard/issues.json');
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ok: true, count: data.count, generated_at: data.generated_at };
    },

    async activityForTask(number) {
      const n = Number(number);
      if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'Ungültige Aufgabennummer');
      const [events, comments] = await Promise.all([
        gh(['api', `repos/${repo}/issues/${n}/events?per_page=100`]).then(JSON.parse),
        gh(['api', `repos/${repo}/issues/${n}/comments?per_page=100`]).then(JSON.parse),
      ]);
      const mapped = [];
      for (const e of events) {
        const actor = e.actor?.login || 'system';
        const map = {
          labeled: `Label „${e.label?.name}" gesetzt`, unlabeled: `Label „${e.label?.name}" entfernt`,
          assigned: `zugewiesen an @${e.assignee?.login}`, unassigned: `Zuweisung @${e.assignee?.login} entfernt`,
          closed: 'geschlossen', reopened: 'wieder geöffnet', renamed: `umbenannt: „${e.rename?.to}"`,
          milestoned: `Meilenstein „${e.milestone?.title}"`, referenced: 'in Commit referenziert', mentioned: 'erwähnt',
          cross_referenced: 'querverwiesen',
        };
        if (['subscribed', 'unsubscribed', 'mentioned'].includes(e.event)) continue;
        mapped.push({ at: e.created_at, actor, type: e.event, text: map[e.event] || e.event });
      }
      for (const c of comments) {
        const cc = /tp-control-center/.test(c.body || '') ? 'Control Center' : /AI-Steuerzentrale/.test(c.body || '') ? 'KI-Steuerzentrale' : 'Kommentar';
        mapped.push({ at: c.created_at, actor: c.user?.login || '?', type: cc, text: clip(c.body, 1_500) });
      }
      mapped.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      return { number: n, events: mapped };
    },

    async activity() {
      const events = JSON.parse(await gh(['api', `repos/${repo}/issues/events?per_page=100`]));
      const out = [];
      for (const e of events) {
        if (!e.issue || e.issue.pull_request) continue;
        if (['subscribed', 'unsubscribed', 'mentioned'].includes(e.event)) continue;
        const text = e.event === 'labeled' ? `Label „${e.label?.name}"` : e.event === 'unlabeled' ? `Label „${e.label?.name}" entfernt`
          : e.event === 'assigned' ? `zugewiesen an @${e.assignee?.login}` : e.event === 'closed' ? 'geschlossen' : e.event === 'reopened' ? 'wieder geöffnet' : e.event;
        out.push({ at: e.created_at, actor: e.actor?.login || 'system', type: e.event, text: `${e.issue.title} · ${text}`, number: e.issue.number, title: e.issue.title });
      }
      return { events: out };
    },

    /** Statuswechsel mit Pflichtangaben. payload: {target, owner, comment, reason, confirmAcceptance, decision} */
    async transition(number, payload = {}) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const target = String(payload.target || '');
      if (!STATUS_BY_KEY[target]) throw new ApiError(400, `Unbekannter Zielstatus „${target}"`, { missing: [`Unbekannter Zielstatus „${target}"`] });
      const { task } = await fetchIssue(number);
      const missing = requirementsFor(task, target, payload);
      if (missing.length) throw new ApiError(400, 'Pflichtangaben fehlen', { missing });
      const labels = await repoLabels();
      const change = labelChangesFor(task, target, { hasLabel: l => labels.includes(l) });
      const n = task.number;

      const editArgs = ['issue', 'edit', String(n), '--repo', repo];
      for (const l of change.remove) editArgs.push('--remove-label', l);
      for (const l of change.add) editArgs.push('--add-label', l);
      const newOwner = payload.owner && payload.owner !== task.owner ? String(payload.owner).replace(/^@/, '') : null;
      if (newOwner) editArgs.push('--add-assignee', newOwner);
      if (change.remove.length || change.add.length || newOwner) await gh(editArgs);

      const text = payload.comment || payload.reason || null;
      const heading = payload.decision && DECISION_LABEL[payload.decision] ? DECISION_LABEL[payload.decision] : `Status ${task.statusLabel} → ${STATUS_BY_KEY[target].label}`;
      const lines = [`Status: ${task.statusLabel} → ${STATUS_BY_KEY[target].label}`];
      if (newOwner) lines.push(`Owner: @${newOwner}`);
      if (payload.confirmAcceptance) lines.push('Akzeptanzkriterien: ausdrücklich bestätigt');
      if (change.note) lines.push(`Hinweis: ${change.note}`);
      await gh(['issue', 'comment', String(n), '--repo', repo, '--body', buildComment({ actor, heading, lines, text })]);
      if (change.close) await gh(['issue', 'close', String(n), '--repo', repo]);
      if (change.reopen) await gh(['issue', 'reopen', String(n), '--repo', repo]);

      audit({ actor, action: 'transition', issue: n, from: task.status, to: target, owner: newOwner, decision: payload.decision || null, labels: change });
      const warn = await afterWrite();
      return { ok: true, issue: n, from: task.status, to: target, labels: change, note: [change.note, warn].filter(Boolean).join(' · ') || null };
    },

    async assign(number, payload = {}) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const owner = String(payload.owner || '').replace(/^@/, '').trim();
      if (!/^[A-Za-z0-9-]{1,39}$/.test(owner)) throw new ApiError(400, 'Owner muss ein GitHub-Login sein', { missing: ['Owner (GitHub-Login) angeben'] });
      const { task, record } = await fetchIssue(number);
      const n = task.number;
      const args = ['issue', 'edit', String(n), '--repo', repo, '--add-assignee', owner];
      for (const a of record.assignees.filter(a => a !== owner)) args.push('--remove-assignee', a);
      await gh(args);
      const heading = payload.decision === 'delegate' ? DECISION_LABEL.delegate : 'Owner zugeordnet';
      await gh(['issue', 'comment', String(n), '--repo', repo, '--body', buildComment({ actor, heading, lines: [`Owner: ${task.owner ? `@${task.owner} → ` : ''}@${owner}`], text: payload.comment || null })]);
      audit({ actor, action: 'assign', issue: n, owner, decision: payload.decision || null });
      const warn = await afterWrite();
      return { ok: true, issue: n, owner, note: warn };
    },

    async comment(number, payload = {}) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const body = clip(payload.body, 6_000);
      if (!body) throw new ApiError(400, 'Kommentar ist leer', { missing: ['Kommentartext angeben'] });
      const { task } = await fetchIssue(number);
      const heading = payload.decision && DECISION_LABEL[payload.decision] ? DECISION_LABEL[payload.decision] : 'Kommentar';
      await gh(['issue', 'comment', String(task.number), '--repo', repo, '--body', buildComment({ actor, heading, text: body })]);
      audit({ actor, action: 'comment', issue: task.number, decision: payload.decision || null });
      const warn = await afterWrite();
      return { ok: true, issue: task.number, note: warn };
    },

    /** KI-Laeufe der Steuerzentrale + Provider-Ledger, read-only. */
    agentRuns() {
      const dir = stateDir || process.env.DASHBOARD_STATE_DIR || path.join(os.homedir(), 'Library/Application Support/TP AI Dashboard');
      const file = path.join(dir, 'dashboard-state.json');
      const runs = [];
      let source = null;
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        source = file;
        for (const r of [saved.current, ...(saved.history || [])].filter(Boolean)) {
          runs.push({
            id: r.id, state: r.state, task: clip(r.task, 300), issue: r.issue ? { number: r.issue.number, title: r.issue.title } : null,
            startedAt: r.startedAt, finishedAt: r.finishedAt, message: clip(r.message, 300),
            progress: r.progress || null, risk: r.risk || r.result?.risk || null, taskType: r.taskType || r.result?.taskType || null,
            provider: r.result?.provider || null, costUsd: Number.isFinite(r.result?.costUsd) ? r.result.costUsd : null,
            summary: clip(r.result?.summary, 1_200), findings: Array.isArray(r.result?.findings) ? r.result.findings.length : 0,
            guard: r.result?.guard?.status || null, resultStatus: r.result?.status || null,
          });
        }
      } catch { /* keine Steuerzentrale-Daten */ }
      const ledger = ledgerPath || process.env.AI_ROUTER_USAGE_LEDGER || path.join(root, '.router/ai-usage.jsonl');
      let usage = null;
      try {
        const lines = fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean);
        usage = { requests: 0, costUsd: 0, byProvider: {}, last: null };
        for (const line of lines) {
          let e; try { e = JSON.parse(line); } catch { continue; }
          usage.requests += 1; usage.costUsd += Number(e.usage?.costUsd) || 0;
          const key = e.provider || 'unbekannt';
          usage.byProvider[key] = (usage.byProvider[key] || 0) + 1;
          if (!usage.last || (e.timestamp || '') > usage.last.at) usage.last = { at: e.timestamp, model: e.model, provider: e.provider };
        }
      } catch { /* kein Ledger */ }
      return { runs, source, usage, ledger: usage ? ledger : null };
    },

    /** Bestelluebersicht: offene Kundenbestellungen, gruppiert je Lieferant, plus Muster. */
    einkaufBestellungen() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'bestelluebersicht', 'orders.json');
      const daten = readJsonIfExists(file);
      if (!daten) return { verfuegbar: false, quelle: file, hinweis: 'orders.json fehlt - siehe operations/lib/bestelluebersicht.mjs bzw. den Export-Lauf dafuer.' };
      let modell;
      // Der Export der Admin API liegt als {data:{orders:{nodes}}} vor;
      // ladeExport bringt beide Formen auf {orders, quellvarianten}.
      try { modell = aufbereiten(ladeExport(JSON.stringify(daten)), { jetzt: now() }); }
      catch (e) { return { verfuegbar: false, quelle: file, hinweis: `orders.json konnte nicht ausgewertet werden: ${e.message}` }; }
      return { verfuegbar: true, quelle: file, exportiertAm: daten.exportiertAm || null, ...modell };
    },

    /**
     * Produktdaten-Status: eine Zeile je PRODUKT (nicht je Variante/Feld -
     * das waeren bei 3.300 Varianten und ~10 Feldern mehrere zehntausend
     * Einzelpunkte und keine brauchbare Arbeitsliste). Dimension (Titel,
     * Gruppe, Varianten) kommt aus dem Einkauf-Dry-Run (plan.json), die
     * tatsaechlich noch offenen Felder aus dem frischeren Klaerungslauf
     * (einkauf-klaerung/offen.json) - plan.json selbst kann ein aelterer
     * Zwischenstand sein. Filter: 'blockierend' (nur was eine Bestellung
     * verhindert), 'handarbeit' (nur was eine Person klaeren muss),
     * '' = alle offenen Produkte.
     */
    einkaufProduktstatus({ page = 1, pageSize = 50, q = '', gruppe = '', filter = '' } = {}) {
      const dir = privatDirPath || privatDir();
      const planFile = path.join(dir, 'einkauf-dryrun', 'plan.json');
      const offenFile = path.join(dir, 'einkauf-klaerung', 'offen.json');
      const planRows = readJsonIfExists(planFile);
      if (!Array.isArray(planRows)) return { verfuegbar: false, quelle: planFile, hinweis: 'plan.json fehlt - Einkauf-Dry-Run vorher lokal laufen lassen.' };
      const offenRows = readJsonIfExists(offenFile);
      if (!Array.isArray(offenRows)) return { verfuegbar: false, quelle: offenFile, hinweis: 'offen.json fehlt (einkauf-klaerung) - Klaerungslauf vorher lokal ausfuehren.' };

      const eintraege = produktstatusAufbauen(planRows, offenRows);
      const gruppen = {};
      for (const e of eintraege) {
        const g = gruppen[e.gruppe] || (gruppen[e.gruppe] = { gruppe: e.gruppe, vollstaendig: 0, handarbeit: 0, automatisch: 0 });
        g[e.status] += 1;
      }
      const gesamt = {
        anzahl: eintraege.length,
        vollstaendig: eintraege.filter(e => e.status === 'vollstaendig').length,
        handarbeit: eintraege.filter(e => e.status === 'handarbeit').length,
        automatisch: eintraege.filter(e => e.status === 'automatisch').length,
        // Rueckwaertskompatibel: "offen" = nicht vollstaendig.
        offen: eintraege.filter(e => e.status !== 'vollstaendig').length,
      };

      let offene = eintraege.filter(e => e.status !== 'vollstaendig');
      if (gruppe) offene = offene.filter(e => e.gruppe === gruppe);
      if (filter === 'blockierend') offene = offene.filter(e => e.blockiertBestellung);
      else if (filter === 'handarbeit') offene = offene.filter(e => e.status === 'handarbeit');
      if (q) offene = offene.filter(e => produktSucheTreffer(e, q));
      offene.sort((a, b) => b.dringlichkeit - a.dringlichkeit || a.titel.localeCompare(b.titel, 'de'));

      const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
      const p = Math.max(Number(page) || 1, 1);
      const start = (p - 1) * size;
      const seite = offene.slice(start, start + size);

      return {
        verfuegbar: true, quelle: `${planFile} + ${offenFile}`,
        gesamt, gruppen: Object.values(gruppen).sort((a, b) => (b.handarbeit + b.automatisch) - (a.handarbeit + a.automatisch)),
        offen: { count: offene.length, page: p, pageSize: size, pages: Math.max(Math.ceil(offene.length / size), 1), items: seite },
      };
    },

    /** Auftragsfluss-Status je Position, rein lokal (nie im Repository). */
    einkaufAuftragsstatus() {
      const dir = privatDirPath || privatDir();
      const file = auftragsstatusPfad(dir);
      const positionen = leseAuftragsstatus(file);
      return { verfuegbar: true, quelle: file, positionen };
    },

    /** Setzt den Status einer Bestellposition (Bestellt/Geliefert/Raus/Erledigt). */
    async einkaufAuftragsstatusSetzen(payload = {}) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const { orderId, lineItemId, status, lieferantBestellnummer, notiz } = payload || {};
      if (!orderId || !lineItemId) throw new ApiError(400, 'orderId und lineItemId sind Pflicht', { missing: ['orderId', 'lineItemId'] });
      if (!STATUS_ORDER.includes(status)) throw new ApiError(400, `Unbekannter Status „${status}"`, { missing: [`Status muss einer von ${STATUS_ORDER.join(', ')} sein`] });
      const dir = privatDirPath || privatDir();
      const file = auftragsstatusPfad(dir);
      let eintrag;
      try {
        eintrag = setzeStatus(file, { orderId, lineItemId, status, actor, lieferantBestellnummer, notiz, jetzt: now() });
      } catch (e) {
        if (e instanceof AuftragsstatusFehler) throw new ApiError(400, e.message);
        throw e;
      }
      audit({ actor, action: 'auftragsstatus', orderId, lineItemId, status });
      return { ok: true, eintrag };
    },

    /** Offene Klaerungsfaelle des Einkaufs, falls das Team sie bereits exportiert hat. */
    einkaufKlaerung() {
      const dir = privatDirPath || privatDir();
      const basis = path.join(dir, 'einkauf-klaerung');
      const klaerung = readJsonIfExists(path.join(basis, 'klaerung.json'));
      const offen = readJsonIfExists(path.join(basis, 'offen.json'));
      if (!klaerung && !offen) return { verfuegbar: false, quelle: basis, hinweis: 'Noch keine Klaerungsdaten exportiert (klaerung.json/offen.json fehlen).' };
      return { verfuegbar: true, quelle: basis, klaerung: klaerung || null, offen: offen || null };
    },

    /**
     * Shop-Kennzahlen der letzten 7/30 Tage fuer die Startseite "Heute".
     *
     * Erwartetes Format (noch kein Export vorhanden - siehe
     * docs/control-center/ARCHITEKTUR.md, Abschnitt 9):
     *   { erstellt, zeitraeume: { "7": {bestellungen, umsatz, waehrung, durchschnitt}, "30": {...} }, topProdukte: [...] }
     * Fehlt die Datei, liefert diese Funktion nur den Hinweis samt Befehl,
     * der den Export erzeugen wuerde - keine erfundenen Zahlen.
     */
    einkaufKennzahlen() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'kennzahlen', 'shop-snapshot.json');
      const daten = readJsonIfExists(file);
      if (!daten || !daten.zeitraeume) {
        return {
          verfuegbar: false,
          quelle: file,
          hinweis: 'Noch kein Export der Shop-Kennzahlen vorhanden.',
          befehl: 'npm run kennzahlen:export -- --ziel ' + file,
        };
      }
      return { verfuegbar: true, quelle: file, erstellt: daten.erstellt || null, zeitraeume: daten.zeitraeume, topProdukte: daten.topProdukte || [] };
    },

    /**
     * Lexikon: "Kunde nennt den Produktnamen, wir finden das Original beim
     * Lieferanten" - Nachschlagewerk fuer den Kundenkontakt. Liest
     * ausschliesslich die lokale Exportdatei ($TP_PRIVAT_DIR/lexikon/produkte.json,
     * siehe domains/lexikon/ fuer das Format), nie im Repository. Suche und
     * Paginierung laufen serverseitig, damit die potenziell grosse Datei nie
     * komplett an den Browser geht.
     */
    lexikonListe({ q = '', page = 1, pageSize = 20 } = {}) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'lexikon', 'produkte.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.produkte)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Lexikon-Daten exportiert.', befehl: 'npm run lexikon:export' };
      }
      const suchtext = String(q || '').trim().toLowerCase();
      const treffer = suchtext
        ? daten.produkte.filter(p => lexikonSucheTreffer(p, suchtext))
        : daten.produkte;
      const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
      const p = Math.max(Number(page) || 1, 1);
      const start = (p - 1) * size;
      const seite = treffer.slice(start, start + size).map(lexikonListenEintrag);
      return {
        verfuegbar: true, quelle: file, erstellt: daten.erstellt || null, anzahl: daten.anzahl ?? daten.produkte.length,
        treffer: { count: treffer.length, page: p, pageSize: size, pages: Math.max(Math.ceil(treffer.length / size), 1), items: seite },
      };
    },

    /** Ein einzelnes Lexikon-Produkt fuer die Detailansicht (per Handle). */
    lexikonProdukt(handle) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'lexikon', 'produkte.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.produkte)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Lexikon-Daten exportiert.', befehl: 'npm run lexikon:export' };
      }
      const produkt = daten.produkte.find(p => p.handle === handle);
      if (!produkt) return { verfuegbar: false, quelle: file, hinweis: `Kein Produkt mit Handle "${handle}" im Lexikon.` };
      return { verfuegbar: true, quelle: file, produkt };
    },

    /**
     * Stand je lokaler Datenquelle (Lexikon, Bestelluebersicht, Kennzahlen),
     * geschrieben von operations/scripts/aktualisieren.mjs
     * ($TP_PRIVAT_DIR/aktualisierung.json). Liefert rohe Zeitstempel plus
     * eine je Teil vorgerechnete Alters-Einschaetzung - die Oberflaeche
     * (docs/ai-dashboard/app.js, systemHealth()) zeigt daraus "Stand: …" und
     * warnt ab 24 Stunden. Fehlt die Datei (noch nie gelaufen), ist das kein
     * Fehler, nur ein leerer Zustand mit dem Befehl, der sie anlegen wuerde.
     */
    aktualisierung() {
      return leseAktualisierungsstand();
    },

    /**
     * Startet `operations/scripts/aktualisieren.mjs` (npm run daten:aktualisieren)
     * als eigenen Kindprozess - fuer den Knopf "Jetzt aktualisieren" in Heute/
     * Einkauf, damit ein Mitarbeiter nach einem Kundenanruf sofort den
     * aktuellen Stand holen kann, statt auf den naechsten geplanten Lauf zu
     * warten (siehe docs/control-center/ARCHITEKTUR.md Abschnitt 10).
     *
     * Feste Argumentliste (node + Skriptpfad, keine Nutzereingabe) - kein
     * Shell-Einschleusen moeglich. Nur ein Lauf gleichzeitig: ein zweiter
     * Aufruf waehrend eines laufenden Prozesses startet nichts neu und meldet
     * `laeuft: true`. Schlaegt der Lauf fehl (z. B. kein Zugang), bleibt die
     * vorhandene aktualisierung.json unveraendert stehen (aktualisieren.mjs
     * schreibt selbst je Teil erfolg:false, kein stiller Fehlschlag).
     */
    aktualisierungStarten() {
      if (aktualisierungLauf) {
        return { gestartet: false, laeuft: true, seit: aktualisierungLauf.seit, hinweis: 'Aktualisierung läuft bereits.' };
      }
      const seit = now().toISOString();
      const skript = path.join(root, 'operations', 'scripts', 'aktualisieren.mjs');
      const lauf = { seit, fehler: null, fertig: false };
      aktualisierungLauf = lauf;
      audit({ action: 'aktualisierung-start' });
      execFileP(process.execPath, [skript], { cwd: root, timeout: 10 * 60_000, maxBuffer: 8 * 1024 * 1024 })
        .then(() => { lauf.fertig = true; })
        .catch(err => { lauf.fertig = true; lauf.fehler = String(err?.message || err).split('\n')[0].slice(0, 500); })
        .finally(() => { if (aktualisierungLauf === lauf) aktualisierungLauf = null; });
      return { gestartet: true, laeuft: true, seit };
    },

    /**
     * Status fuer den Knopf: laeuft gerade ein Prozess (seit wann), plus der
     * zuletzt geschriebene Stand je Datenquelle (dieselbe Form wie
     * `aktualisierung()`). Wird per Abfrage gepollt (kein Warten im Request).
     */
    aktualisierungStatus() {
      const stand = leseAktualisierungsstand();
      if (aktualisierungLauf) return { ...stand, laeuft: true, seit: aktualisierungLauf.seit };
      return { ...stand, laeuft: false, seit: null };
    },
  };

  function leseAktualisierungsstand() {
    const dir = privatDirPath || privatDir();
    const file = path.join(dir, 'aktualisierung.json');
    const daten = readJsonIfExists(file);
    if (!daten || !daten.teile) {
      return { verfuegbar: false, quelle: file, hinweis: 'Noch kein Lauf von daten:aktualisieren vorhanden.', befehl: 'npm run daten:aktualisieren' };
    }
    const jetzt = now().getTime();
    const SCHWELLE_MS = 24 * 60 * 60 * 1000;
    const teile = {};
    for (const [teil, stand] of Object.entries(daten.teile)) {
      const alterMs = stand?.zeitpunkt ? jetzt - new Date(stand.zeitpunkt).getTime() : null;
      teile[teil] = { ...stand, alterMs, veraltet: alterMs === null ? null : alterMs > SCHWELLE_MS };
    }
    return { verfuegbar: true, quelle: file, aktualisiertAm: daten.aktualisiertAm || null, teile };
  }
}

/** Sucht ueber Produktname, Handle, SKU, Lieferanten-Artikelnummer, Farbe und Kollektion. */
function lexikonSucheTreffer(p, suchtext) {
  const felder = [p.titel, p.handle];
  for (const v of p.varianten || []) {
    felder.push(v.sku, v.farbe, v.einkauf?.artikelnummer, v.einkauf?.kollektion, v.einkauf?.produktname);
  }
  return felder.some(f => typeof f === 'string' && f.toLowerCase().includes(suchtext));
}

/** Zeilenform fuer die Trefferliste: Bild, Produktname, Produktgruppe, Anzahl Farben. */
function lexikonListenEintrag(p) {
  const farben = new Set((p.varianten || []).map(v => v.farbe).filter(Boolean));
  return { handle: p.handle, titel: p.titel, produktgruppe: p.produktgruppe || null, bild: p.bild || null, status: p.status || null, farbenAnzahl: farben.size };
}

export { STATUS_LABELS };
