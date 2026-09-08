#!/usr/bin/env node
/**
 * Erzeugt docs/ai-dashboard/issues.json aus den echten GitHub Issues.
 *
 * Laeuft identisch lokal (gh CLI, eingeloggt) und in GitHub Actions
 * (gh CLI mit GITHUB_TOKEN). Das Control Center liest nur diese Datei und
 * spricht im statischen Modus nie selbst mit der GitHub API.
 *
 * Schema 2 (abwaertskompatibel zu Schema 1):
 *   - alle bisherigen Felder bleiben (number, title, state, html_url, labels,
 *     assignee, nextStep, created_at, updated_at, closed_at)
 *   - neu: assignees, comments, fields (aus dem Body extrahierte Felder, siehe
 *     docs/ai-dashboard/lib/model.mjs parseBody), sync (Quelle, Zeitpunkt,
 *     verfuegbare Labels), schema
 *
 * Der volle Issue-Body wird weiterhin NICHT abgelegt - nur die extrahierten
 * Felder (Ziel, Akzeptanzkriterien, Blocker, Frist, ...), gekuerzt.
 *
 * Bei einem Fehler bleibt die alte Datei unangetastet und der Prozess endet
 * mit Exit-Code 1 - ein leeres oder halbes issues.json wird nie geschrieben.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBody } from '../docs/ai-dashboard/lib/model.mjs';

export const REPO = process.env.DASHBOARD_REPO || 'kontakt755/teppich-paradies-shopify-ai';
const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = resolve(HERE, '..', 'docs/ai-dashboard/issues.json');

// Nur diese Label-Praefixe sind fuer das Control Center relevant.
export const RELEVANT_PREFIXES = ['status:', 'type:', 'priority:', 'area:', 'reviewer:'];
const TEXT_LIMIT = 1_200;

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
}

/** gh --paginate liefert je nach Version mehrere JSON-Arrays hintereinander. */
export function parsePaginated(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch {
    return JSON.parse(`[${trimmed.replace(/\]\s*\[/g, '],[')}]`).flat();
  }
}

function cut(value) {
  if (typeof value !== 'string') return value;
  return value.length > TEXT_LIMIT ? `${value.slice(0, TEXT_LIMIT)}…` : value;
}

/** Extrahierte Felder, auf Anzeige-Laenge gekuerzt. */
export function compactFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === false || (Array.isArray(v) && v.length === 0)) continue;
    if (k === 'acceptance' && v) {
      out.acceptance = { total: v.total, done: v.done, items: (v.items || []).slice(0, 30), ...(v.text ? { text: cut(v.text) } : {}) };
    } else if (typeof v === 'string') out[k] = cut(v);
    else out[k] = v;
  }
  return out;
}

export function toIssueRecord(i) {
  const labels = (i.labels || []).map(l => (typeof l === 'string' ? l : l.name));
  const fields = compactFields(parseBody(i.body));
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    html_url: i.html_url,
    labels,
    assignee: i.assignee ? i.assignee.login : null,
    assignees: (i.assignees || []).map(a => a.login),
    comments: Number(i.comments) || 0,
    nextStep: fields.nextStep || null,
    fields,
    created_at: i.created_at,
    updated_at: i.updated_at,
    closed_at: i.closed_at,
  };
}

export function buildPayload({ issues, labels, repo = REPO, now = new Date() }) {
  const records = issues
    .filter(i => !i.pull_request)
    .map(toIssueRecord)
    .filter(i => i.labels.some(name => RELEVANT_PREFIXES.some(p => name.startsWith(p))))
    .sort((a, b) => b.number - a.number);
  return {
    schema: 2,
    generated_at: now.toISOString(),
    repo,
    count: records.length,
    sync: {
      source: 'github-issues',
      repo,
      fetchedAt: now.toISOString(),
      labelsAvailable: labels.filter(l => RELEVANT_PREFIXES.some(p => l.startsWith(p))).sort(),
      ok: true,
    },
    issues: records,
  };
}

function main() {
  let issues;
  let labels;
  try {
    issues = parsePaginated(gh(['api', '--paginate', `repos/${REPO}/issues?state=all&per_page=100&sort=updated&direction=desc`]));
    labels = parsePaginated(gh(['api', '--paginate', `repos/${REPO}/labels?per_page=100`])).map(l => l.name);
  } catch (error) {
    console.error(`GitHub-Abruf fehlgeschlagen, ${OUT} bleibt unveraendert: ${error.message.split('\n')[0]}`);
    process.exit(1);
  }

  const payload = buildPayload({ issues, labels });
  mkdirSync(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  renameSync(tmp, OUT);

  const byStatus = {};
  for (const i of payload.issues) {
    const s = i.labels.find(l => l.startsWith('status:'))?.slice(7) || 'ohne-status';
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  console.log(`${payload.issues.length} Issues -> ${OUT}`);
  console.log(Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  const withFields = payload.issues.filter(i => Object.keys(i.fields).length > 1).length;
  console.log(`  Issues mit strukturierten Feldern: ${withFields}/${payload.issues.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
