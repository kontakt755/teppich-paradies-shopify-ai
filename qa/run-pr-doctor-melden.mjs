#!/usr/bin/env node
/**
 * Runner: PR-Doctor ausfuehren und Befunde am betroffenen PR kommentieren.
 *
 *   npm run pr:doctor:melden                 posten/entwarnen, idempotent
 *   npm run pr:doctor:melden -- --dry-run    nur zeigen, was gepostet wuerde
 *
 * Laeuft in .github/workflows/pr-doctor.yml bei jedem Push auf main und im
 * Zeitplan. Exit-Code ist immer 0: Befunde gehoeren an den PR, nicht als rotes
 * Kreuz an main. Logik in qa/pr-doctor-melden.mjs.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { baueEntwarnung, baueKommentar, entscheide, fingerprint, fingerprintAus, MARKER } from './pr-doctor-melden.mjs';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const root = path.resolve(import.meta.dirname, '..');

const gh = (a, input) => execFileSync('gh', a, { encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] }).trim();

// Doctor laufen lassen; sein Exit 1 bei Konflikten ist hier kein Fehler.
const doc = spawnSync(process.execPath, [path.join(root, 'qa', 'run-pr-doctor.mjs'), '--json'], { encoding: 'utf8', cwd: root });
if (!doc.stdout) {
  console.error(`PR-Doctor lieferte keine Ausgabe:\n${doc.stderr}`);
  process.exit(1);
}
const { prs, findings } = JSON.parse(doc.stdout);

const repo = process.env.GITHUB_REPOSITORY || gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
const mainSha = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8', cwd: root }).trim();
const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;

function letzterDoctorFingerprint(nummer) {
  const raw = gh(['api', `repos/${repo}/issues/${nummer}/comments`, '--paginate', '--jq', `[.[] | select(.body | contains("${MARKER}")) | .body] | last // ""`]);
  // --paginate haengt Seiten aneinander; die letzte nicht-leere Zeile zaehlt.
  const body = raw.split('\n').filter(Boolean).pop() ?? '';
  return fingerprintAus(body);
}

const stat = { gepostet: 0, entwarnt: 0, unveraendert: 0 };
for (const pr of prs) {
  const eigene = findings.filter(f => f.nummer === pr.nummer);
  const fp = fingerprint(eigene);
  const letzter = letzterDoctorFingerprint(pr.nummer);
  const was = entscheide({ letzterFingerprint: letzter, aktuellerFingerprint: fp });
  if (was === 'nichts') { stat.unveraendert++; continue; }
  const body = was === 'posten' ? baueKommentar({ findings: eigene, mainSha, runUrl }) : baueEntwarnung({ mainSha });
  if (DRY) {
    console.log(`--- wuerde #${pr.nummer} ${was} (zuletzt: ${letzter ?? 'kein Doctor-Kommentar'}, jetzt: ${fp}) ---\n${body}\n`);
  } else {
    gh(['pr', 'comment', String(pr.nummer), '--repo', repo, '--body-file', '-'], body);
    console.log(`${was === 'posten' ? 'POST ' : 'OK   '} #${pr.nummer} (${fp})`);
  }
  if (was === 'posten') stat.gepostet++; else stat.entwarnt++;
}
console.log(`PR-Doctor melden: ${prs.length} offene PRs, ${stat.gepostet} Kommentar(e) gepostet, ${stat.entwarnt} entwarnt, ${stat.unveraendert} unveraendert${DRY ? ' (Trockenlauf)' : ''}.`);
