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

export function createApi({ gh = defaultGh, repo = DEFAULT_REPO, root = process.cwd(), rebuild = null, stateDir = null, ledgerPath = null, now = () => new Date() } = {}) {
  let userCache = null;
  let labelCache = { at: 0, names: [] };

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
  };
}

export { STATUS_LABELS };
