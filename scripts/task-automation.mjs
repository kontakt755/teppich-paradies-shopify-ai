#!/usr/bin/env node
/**
 * Task-Automation: haelt Status-Labels anhand belegbarer Ereignisse aktuell.
 *
 * Laeuft in GitHub Actions (.github/workflows/task-automation.yml) mit dem
 * kurzlebigen GITHUB_TOKEN. Jede Aenderung wird als Kommentar mit Marker
 * `tp-automation` protokolliert. Es werden nur Regeln angewendet, die aus
 * dem Ereignis selbst folgen - keine Prioritaeten erfunden, kein Owner
 * geraten, nichts geschlossen, was GitHub nicht schon geschlossen hat.
 *
 * Regeln:
 *   issue opened        ohne status-Label -> status:eingang; fehlende type/area
 *                       werden aus dem Text abgeleitet und als Vorschlag kommentiert
 *   issue closed        -> status:fertig (ausser status:abgebrochen bleibt)
 *   issue reopened      -> status:geplant (wenn vorher fertig/abgebrochen)
 *   pull_request opened / ready_for_review, referenziert #n
 *                       -> #n: status:in-arbeit (wenn eingang/triage/geplant/bereit)
 *   pull_request merged, referenziert #n
 *                       -> #n: status:review, ausser GitHub schliesst #n ueber
 *                          "Closes #n" - dann greift die closed-Regel (fertig)
 *
 * Alle Funktionen sind rein und werden mit einem Fake-gh getestet.
 */

import { execFileSync } from 'node:child_process';
import { STATUS_LABELS } from '../docs/ai-dashboard/lib/model.mjs';

export const MARKER = '<!-- tp-automation -->';

function heading(text) { return `## Automatik: ${text}`; }

/** Referenzierte Issue-Nummern aus PR-Titel/Body (#12, "closes #12", URL). */
// Code-Bloecke und Inline-Code zaehlen nicht: Am 2026-09-09 zitierte die
// PR-Beschreibung von #126 die Ausgabe des Sessionstart-Briefs mit "#34" und
// "#120" - beide Issues wurden daraufhin faelschlich auf In Arbeit und Review
// gesetzt, obwohl der PR nichts damit zu tun hatte.
export function stripCode(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

export function referencedIssues(text, repo) {
  const out = new Set();
  const s = stripCode(text);
  for (const m of s.matchAll(/(?<![\w/])#(\d+)\b/g)) out.add(Number(m[1]));
  if (repo) for (const m of s.matchAll(new RegExp(`github\\.com/${repo.replace('/', '\\/')}/issues/(\\d+)`, 'g'))) out.add(Number(m[1]));
  return [...out].sort((a, b) => a - b);
}

/** Schliesst-Schluesselwoerter, bei denen GitHub das Issue beim Merge selbst schliesst. */
export function closingIssues(text) {
  const out = new Set();
  for (const m of stripCode(text).matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)/gi)) out.add(Number(m[1]));
  return [...out];
}

/** Leichte, transparente Ableitung von type/area - wird als Vorschlag kommentiert. */
export function inferLabels(title, body) {
  const text = `${title}\n${body || ''}`.toLowerCase();
  const type = /fehler|bug|kaputt|defekt|reparier/.test(text) ? 'type:bug'
    : /\bseo\b|meta[- ]?title|suchmaschine/.test(text) ? 'type:seo'
    : /entscheid|freigabe|genehmig/.test(text) ? 'type:entscheidung'
    : /text|beschreibung|content|inhalt/.test(text) ? 'type:content'
    : /design|layout|mobil|\bux\b|ansicht|optik/.test(text) ? 'type:ux'
    : /idee|vorschlag/.test(text) ? 'type:idee'
    : 'type:technik';
  const area = /google|merchant|analytics|\bads\b|ga4/.test(text) ? 'area:google'
    : /menü|menu|navigation|breadcrumb/.test(text) ? 'area:navigation'
    : /kategorie|collection|kollektion/.test(text) ? 'area:kategorie'
    : /produkt|product/.test(text) ? 'area:produktseite'
    : /warenkorb|cart/.test(text) ? 'area:warenkorb'
    : /checkout|zahlung|kasse/.test(text) ? 'area:checkout'
    : /versand|liefer/.test(text) ? 'area:versand'
    : /api|router|dashboard|github|automation|backend|workflow|control center/.test(text) ? 'area:backend'
    : 'area:sonstiges';
  return { type, area };
}

function statusOfLabels(labels) {
  return labels.filter(l => STATUS_LABELS.includes(l));
}

/**
 * Plant die Aenderungen fuer ein Ereignis. Rueckgabe: Liste von
 * { issue, add, remove, comment } - ohne Seiteneffekte.
 */
export function plan(event, { repo } = {}) {
  const actions = [];
  const name = event.name;
  const payload = event.payload || {};

  if (name === 'issues') {
    const issue = payload.issue;
    if (!issue || issue.pull_request) return actions;
    const labels = (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name));
    const status = statusOfLabels(labels);
    if (payload.action === 'opened' && status.length === 0) {
      const add = ['status:eingang'];
      const inferred = inferLabels(issue.title, issue.body);
      const notes = [];
      if (!labels.some(l => l.startsWith('type:'))) { add.push(inferred.type); notes.push(`Typ ${inferred.type} (abgeleitet)`); }
      if (!labels.some(l => l.startsWith('area:'))) { add.push(inferred.area); notes.push(`Bereich ${inferred.area} (abgeleitet)`); }
      if (!labels.some(l => l.startsWith('priority:'))) notes.push('Priorität fehlt – bitte im Control Center setzen (Triage)');
      actions.push({ issue: issue.number, add, remove: [], comment: `${heading('neue Aufgabe eingeordnet')}\n\n- Status: Eingang\n${notes.map(n => `- ${n}`).join('\n')}\n\nAbgeleitete Labels sind ein Vorschlag und können geändert werden.\n\n${MARKER}` });
    }
    if (payload.action === 'closed' && !labels.includes('status:abgebrochen') && !labels.includes('status:fertig')) {
      actions.push({ issue: issue.number, add: ['status:fertig'], remove: status, comment: `${heading('erledigt')}\n\n- Status: ${status.map(s => s.slice(7)).join(', ') || 'ohne'} → Erledigt (Issue wurde geschlossen)\n\n${MARKER}` });
    }
    if (payload.action === 'reopened' && (labels.includes('status:fertig') || labels.includes('status:abgebrochen'))) {
      actions.push({ issue: issue.number, add: ['status:geplant'], remove: status, comment: `${heading('wieder geöffnet')}\n\n- Status → Geplant\n\n${MARKER}` });
    }
  }

  if (name === 'pull_request') {
    const pr = payload.pull_request;
    if (!pr) return actions;
    const refs = referencedIssues(`${pr.title}\n${pr.body || ''}`, repo);
    if (!refs.length) return actions;
    const closing = new Set(closingIssues(`${pr.title}\n${pr.body || ''}`));
    if (['opened', 'ready_for_review', 'reopened'].includes(payload.action) && !pr.draft) {
      for (const n of refs) actions.push({ issue: n, onlyIfStatusIn: ['status:eingang', 'status:triage', 'status:geplant', 'status:bereit', 'status:blockiert', null], add: ['status:in-arbeit'], remove: 'status', comment: `${heading('Arbeit begonnen')}\n\n- Pull Request #${pr.number} „${pr.title}" referenziert diese Aufgabe\n- Status → In Arbeit\n\n${MARKER}` });
    }
    if (payload.action === 'closed' && pr.merged) {
      for (const n of refs) {
        if (closing.has(n)) continue; // GitHub schliesst -> closed-Regel setzt fertig
        actions.push({ issue: n, onlyIfStatusIn: ['status:in-arbeit', 'status:korrektur', 'status:bereit', 'status:geplant', null], add: ['status:review'], remove: 'status', comment: `${heading('Pull Request gemergt')}\n\n- #${pr.number} „${pr.title}" ist in main\n- Status → Review: bitte Ergebnis prüfen und die Aufgabe schließen (→ Erledigt)\n\n${MARKER}` });
      }
    }
  }
  return actions;
}

/** Wendet geplante Aktionen ueber gh an. `gh` ist injizierbar. */
export async function apply(actions, { gh, repo, log = () => {} }) {
  const done = [];
  for (const a of actions) {
    let current = [];
    try {
      const view = JSON.parse(await gh(['api', `repos/${repo}/issues/${a.issue}`]));
      if (view.pull_request) continue;
      current = (view.labels || []).map(l => l.name);
    } catch (e) { log(`#${a.issue}: nicht lesbar (${e.message.split('\n')[0]})`); continue; }
    const status = statusOfLabels(current);
    if (a.onlyIfStatusIn && !a.onlyIfStatusIn.includes(status[0] ?? null)) { log(`#${a.issue}: Status ${status[0] ?? 'ohne'} – keine Änderung`); continue; }
    const remove = a.remove === 'status' ? status : a.remove;
    const add = a.add.filter(l => !current.includes(l));
    const rm = remove.filter(l => current.includes(l) && !a.add.includes(l));
    if (!add.length && !rm.length) { log(`#${a.issue}: bereits im Zielzustand`); continue; }
    const args = ['issue', 'edit', String(a.issue), '--repo', repo];
    for (const l of rm) args.push('--remove-label', l);
    for (const l of add) args.push('--add-label', l);
    await gh(args);
    if (a.comment) await gh(['issue', 'comment', String(a.issue), '--repo', repo, '--body', a.comment]);
    done.push({ issue: a.issue, add, remove: rm });
    log(`#${a.issue}: +${add.join(',') || '-'} −${rm.join(',') || '-'}`);
  }
  return done;
}

function defaultGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60_000 });
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || process.env.DASHBOARD_REPO || 'kontakt755/teppich-paradies-shopify-ai';
  const name = process.env.GITHUB_EVENT_NAME;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!name || !eventPath) { console.error('GITHUB_EVENT_NAME / GITHUB_EVENT_PATH fehlen – nur in Actions ausführbar.'); process.exit(2); }
  const { readFileSync } = await import('node:fs');
  const payload = JSON.parse(readFileSync(eventPath, 'utf8'));
  const actions = plan({ name, payload }, { repo });
  console.log(`${name}/${payload.action}: ${actions.length} geplante Änderung(en)`);
  const done = await apply(actions, { gh: async a => defaultGh(a), repo, log: console.log });
  console.log(`${done.length} angewendet`);
}

if (process.argv[1] && process.argv[1].endsWith('task-automation.mjs')) main().catch(e => { console.error(e.message); process.exit(1); });
