#!/usr/bin/env node
/**
 * Erzeugt docs/ai-dashboard/issues.json aus den echten GitHub Issues.
 *
 * Laeuft identisch lokal (gh CLI, eingeloggt) und in GitHub Actions
 * (gh CLI mit GITHUB_TOKEN). Das Dashboard liest nur diese Datei und
 * spricht nie selbst mit der GitHub API - deshalb funktioniert es auch
 * bei einem privaten Repo ohne Token im Browser.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.DASHBOARD_REPO || 'kontakt755/teppich-paradies-shopify-ai';
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs/ai-dashboard/issues.json'
);

// Nur diese Label-Praefixe sind fuer das Dashboard relevant.
const RELEVANT_PREFIXES = ['status:', 'type:', 'priority:', 'area:', 'reviewer:'];

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Zieht "Naechster Schritt" aus dem Issue-Body, damit das Dashboard
 *  den vollen Body nicht laden muss. */
function extractNextStep(body) {
  if (!body) return null;
  const m = body.match(/N(?:ä|ae)chster Schritt:?\s*\n+\s*(.+?)(?:\n|$)/i);
  if (!m) return null;
  return m[1].replace(/^[-*#\s]+/, '').trim() || null;
}

function main() {
  const raw = gh([
    'api',
    '--paginate',
    `repos/${REPO}/issues?state=all&per_page=100&sort=updated&direction=desc`,
  ]);

  // --paginate liefert mehrere JSON-Arrays hintereinander bei manchen
  // gh-Versionen; robust beide Faelle behandeln.
  const pages = raw
    .trim()
    .replace(/\]\s*\[/g, '],[')
    .replace(/^/, '[')
    .replace(/$/, ']');
  let parsed;
  try {
    parsed = JSON.parse(pages).flat();
  } catch {
    parsed = JSON.parse(raw.trim());
  }

  const issues = parsed
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      html_url: i.html_url,
      labels: (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
      assignee: i.assignee ? i.assignee.login : null,
      nextStep: extractNextStep(i.body),
      created_at: i.created_at,
      updated_at: i.updated_at,
      closed_at: i.closed_at,
    }))
    .filter((i) =>
      i.labels.some((name) => RELEVANT_PREFIXES.some((p) => name.startsWith(p)))
    )
    .sort((a, b) => b.number - a.number);

  const payload = {
    generated_at: new Date().toISOString(),
    repo: REPO,
    count: issues.length,
    issues,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');

  const byStatus = {};
  for (const i of issues) {
    const s = i.labels.find((l) => l.startsWith('status:'))?.slice(7) || 'ohne-status';
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  console.log(`${issues.length} Issues -> ${OUT}`);
  console.log(
    Object.entries(byStatus)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n')
  );
}

main();
