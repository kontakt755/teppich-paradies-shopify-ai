#!/usr/bin/env node
/**
 * Runner fuer den PR-Doctor. Regeln in qa/pr-doctor.mjs.
 *
 *   npm run pr:doctor              Bericht ueber alle offenen PRs
 *   npm run pr:doctor -- --fix     dazu die gefahrlosen Reparaturen:
 *                                  Basis auf main umzielen, ueberkreuzte
 *                                  Historie durch leeren Merge begradigen
 *   npm run pr:doctor -- --json    maschinenlesbar
 *
 * Arbeitet ausschliesslich mit origin/*-Refs und Wegwerf-Worktrees unter dem
 * System-Temp - nie im Checkout, aus dem er gestartet wird. Der geteilte
 * Hauptordner bleibt unberuehrt, egal auf welchem Branch er steht.
 *
 * Exit-Code 1, wenn Konflikte offen bleiben (die kann er nicht loesen).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { bewerteAlle, zusammenfassung, FIXES } from './pr-doctor.mjs';

const args = new Set(process.argv.slice(2));
const FIX = args.has('--fix');
const JSON_OUT = args.has('--json');
const HAUPT = 'main';

const git = (a, opts = {}) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const gitOk = (a, opts = {}) => spawnSync('git', a, { encoding: 'utf8', ...opts }).status === 0;
const gh = (a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const log = (s) => { if (!JSON_OUT) console.log(s); };

git(['fetch', 'origin', '--prune', '--quiet']);

const roh = JSON.parse(gh(['pr', 'list', '--state', 'open', '--limit', '100', '--json',
  'number,headRefName,baseRefName,isDraft,statusCheckRollup']));

function fakten(p) {
  const head = `origin/${p.headRefName}`;
  const headExistiert = gitOk(['rev-parse', '-q', '--verify', head]);
  let basisExistiert = null, basisGemergt = null;
  if (p.baseRefName !== HAUPT) {
    basisExistiert = gitOk(['rev-parse', '-q', '--verify', `origin/${p.baseRefName}`]);
    basisGemergt = basisExistiert ? gitOk(['merge-base', '--is-ancestor', `origin/${p.baseRefName}`, `origin/${HAUPT}`]) : null;
  }
  let mergeBasen = 0, konflikte = [];
  if (headExistiert) {
    mergeBasen = git(['merge-base', '--all', head, `origin/${HAUPT}`]).split('\n').filter(Boolean).length;
    const mt = spawnSync('git', ['merge-tree', '--write-tree', '--name-only', head, `origin/${HAUPT}`], { encoding: 'utf8' });
    konflikte = (mt.stdout + mt.stderr).split('\n')
      .filter(l => l.startsWith('CONFLICT'))
      .map(l => l.replace(/^CONFLICT \([^)]*\): (Merge conflict in )?/, '').replace(/ deleted in .*$/, '').trim());
  }
  return {
    nummer: p.number, head: p.headRefName, basis: p.baseRefName, draft: p.isDraft,
    headExistiert, basisExistiert, basisGemergt, mergeBasen, konflikte,
    checks: Array.isArray(p.statusCheckRollup) ? p.statusCheckRollup.length : 0,
  };
}

const prs = roh.map(fakten);
const findings = bewerteAlle(prs, HAUPT);

const ausgefuehrt = [];
if (FIX) {
  // Erst umzielen, dann begradigen - ein Begradigen gegen die falsche Basis
  // waere Arbeit am falschen Ziel.
  for (const f of findings.filter(f => f.fix?.art === FIXES.UMZIELEN)) {
    gh(['pr', 'edit', String(f.nummer), '--base', f.fix.neueBasis]);
    ausgefuehrt.push({ nummer: f.nummer, fix: FIXES.UMZIELEN });
    log(`FIX   [${f.regel}] #${f.nummer} auf ${f.fix.neueBasis} umgezielt`);
  }
  for (const f of findings.filter(f => f.fix?.art === FIXES.BEGRADIGEN)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-doctor-'));
    try {
      git(['worktree', 'add', '--detach', dir, `origin/${f.head}`]);
      git(['merge', '--no-ff', '--no-commit', `origin/${HAUPT}`], { cwd: dir });
      const msg = `merge: origin/${HAUPT} in ${f.head} (Historie begradigen)\n\n` +
        `Inhaltlich leer, von npm run pr:doctor -- --fix. Der Branch hatte mehrere\n` +
        `Merge-Basen gegen ${HAUPT}; GitHub meldet so einen PR als dirty und startet\n` +
        `keine Validierung, obwohl git sauber merged. Danach genau eine Basis.\n`;
      execFileSync('git', ['commit', '-q', '-F', '-'], { cwd: dir, input: msg, encoding: 'utf8' });
      git(['push', 'origin', `HEAD:${f.head}`], { cwd: dir });
      ausgefuehrt.push({ nummer: f.nummer, fix: FIXES.BEGRADIGEN });
      log(`FIX   [${f.regel}] #${f.nummer} begradigt und gepusht`);
    } finally {
      spawnSync('git', ['worktree', 'remove', '--force', dir]);
      spawnSync('git', ['worktree', 'prune']);
    }
  }
}

const z = zusammenfassung(findings);
if (JSON_OUT) {
  console.log(JSON.stringify({ prs, findings, ausgefuehrt, zusammenfassung: z }, null, 2));
} else {
  for (const f of findings) {
    const tag = f.schwere === 'error' ? 'ERROR' : f.schwere === 'warn' ? 'WARN ' : 'INFO ';
    console.log(`${tag} [${f.regel}] ${f.text}`);
  }
  console.log(
    `PR-Doctor: ${prs.length} offene PRs geprueft, ${z.konflikte} mit Konflikten, ` +
    `${z.umzielen} umzuzielen, ${z.begradigen} zu begradigen` +
    (FIX ? `, ${ausgefuehrt.length} Fix(es) ausgefuehrt.` : '.')
  );
}
process.exitCode = z.konflikte ? 1 : 0;
