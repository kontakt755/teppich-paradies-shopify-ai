#!/usr/bin/env node
// Uebergabetext fuer eine neue Sitzung aus dem aktuellen Stand (#361).
//
// Eine neue Sitzung kostet die Grundlast einmal (~70k Tokens); eine alte
// Sitzung mit 400k Verlauf kostet sie in jeder Runde. Der Wechsel scheitert
// in der Praxis daran, dass niemand den Stand zusammenschreiben will.
// Dieses Skript schreibt ihn aus Git zusammen; die Sitzung ergaenzt nur noch
// den Satz "Was als Naechstes" und das Issue.
//
//   npm run -s handoff                 Stand der aktuellen Arbeitskopie
//   npm run -s handoff -- --issue 361  Issue-Nummer mitgeben (sonst aus dem Branchnamen)
import { execFileSync } from 'node:child_process';

const git = (...a) => {
  try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
};

export function issueAusBranch(branch) {
  return /(?:^|[/_-])(\d{2,5})(?:[/_-]|$)/.exec(branch)?.[1] ?? null;
}

export function handoffText({ branch, pfad, commits, status, issue, basis }) {
  const z = [];
  z.push(`Fortsetzung${issue ? ` von #${issue}` : ''} — Uebergabe aus einer vorigen Sitzung.`);
  z.push('');
  z.push(`Arbeitskopie: ${pfad}`);
  z.push(`Branch: ${branch} (gegen ${basis})`);
  z.push('');
  z.push(commits.length ? `Eigene Commits (${commits.length}):` : 'Noch keine eigenen Commits.');
  for (const c of commits.slice(0, 15)) z.push(`  ${c}`);
  if (commits.length > 15) z.push(`  … ${commits.length - 15} weitere`);
  z.push('');
  z.push(status.length ? `Nicht committet (${status.length}):` : 'Working Tree sauber.');
  for (const s of status.slice(0, 20)) z.push(`  ${s}`);
  if (status.length > 20) z.push(`  … ${status.length - 20} weitere`);
  z.push('');
  z.push('Was als Naechstes: <ein Satz>');
  z.push('Offene Entscheidungen: <oder "keine">');
  z.push('');
  z.push(issue
    ? `Vor dem Start: gh issue view ${issue} --comments | tail -30 (letzte Notiz lesen), dann weiter in derselben Arbeitskopie.`
    : 'Vor dem Start: npm run workflow:route -- "<Kurzbeschreibung>".');
  return z.join('\n');
}

function main() {
  const i = process.argv.indexOf('--issue');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || '?';
  const basis = 'origin/main';
  const commits = git('log', '--oneline', `${basis}..HEAD`, '--no-merges').split('\n').filter(Boolean);
  const status = git('status', '--porcelain').split('\n').filter(Boolean)
    .filter((s) => !/docs\/ai-dashboard\/issues\.json$/.test(s)); // gehoert dem Bot
  console.log(handoffText({
    branch, basis, commits, status,
    pfad: git('rev-parse', '--show-toplevel'),
    issue: i > 0 ? process.argv[i + 1] : issueAusBranch(branch),
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
