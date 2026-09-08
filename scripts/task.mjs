#!/usr/bin/env node
/**
 * Aufgaben aus der Kommandozeile - fuer Menschen und KI-Sessions (Claude Code).
 *
 *   npm run task -- create "Titel" [--body "…"] [--area google] [--type technik] [--prio p1] [--owner kontakt755]
 *   npm run task -- start  92 [--owner kontakt755] [--note "…"]     -> In Arbeit
 *   npm run task -- review 92 --note "PR #101, Tests gruen"          -> Review
 *   npm run task -- done   92 [--confirm] [--note "…"]               -> Erledigt (schliesst)
 *   npm run task -- block  92 --reason "Warte auf API-Key von Ahmet" -> Blockiert
 *   npm run task -- approve-request 92 --reason "Scopes freigeben?"  -> Warten auf Freigabe
 *   npm run task -- comment 92 --note "…"
 *   npm run task -- list [--mine]
 *
 * Nutzt dieselbe Aktions-API wie das lokale Dashboard (scripts/dashboard-api.mjs):
 * dieselben Pflichtangaben, derselbe Kommentar im Issue, dasselbe Audit-Log.
 * Laeuft unter dem in gh angemeldeten Konto.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApi, ApiError, DEFAULT_REPO } from './dashboard-api.mjs';

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i += 1; } else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

const COMMANDS = {
  start: { target: 'in-arbeit' },
  review: { target: 'review' },
  done: { target: 'fertig' },
  block: { target: 'blockiert' },
  'approve-request': { target: 'freigabe' },
  ready: { target: 'bereit' },
  plan: { target: 'geplant' },
  cancel: { target: 'abgebrochen' },
};

export async function run(argv, { api, gh, repo = DEFAULT_REPO, out = console.log } = {}) {
  const { positional, flags } = parseArgs(argv);
  const [cmd, arg] = positional;
  if (!cmd || flags.help) {
    out(`Befehle: create "Titel" | start N | review N | done N | block N | approve-request N | ready N | plan N | cancel N | comment N | list\nFlags: --owner --note --reason --confirm --area --type --prio --body --mine`);
    return 0;
  }
  if (cmd === 'create') {
    if (!arg) throw new ApiError(400, 'Titel fehlt');
    const labels = ['status:eingang', `type:${flags.type || 'technik'}`, `area:${flags.area || 'sonstiges'}`];
    if (flags.prio) labels.push(`priority:${flags.prio}`);
    const body = `${flags.body || ''}\n\n## Nächster Schritt\n${flags.next || 'Triage: Priorität, Owner und Akzeptanzkriterien festlegen'}\n\n<!-- tp-cli -->`.trim();
    const args = ['issue', 'create', '--repo', repo, '--title', arg, '--body', body];
    for (const l of labels) args.push('--label', l);
    if (flags.owner) args.push('--assignee', String(flags.owner).replace(/^@/, ''));
    const url = (await gh(args)).trim().split('\n').find(l => /\/issues\/\d+/.test(l)) || '';
    out(`Angelegt: ${url}`);
    return 0;
  }
  if (cmd === 'list') {
    const args = ['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '100', '--json', 'number,title,labels,assignees'];
    if (flags.mine) args.push('--assignee', '@me');
    const issues = JSON.parse(await gh(args) || '[]');
    for (const i of issues) {
      const st = (i.labels.find(l => l.name.startsWith('status:'))?.name || 'status:eingang').slice(7);
      const pr = (i.labels.find(l => l.name.startsWith('priority:'))?.name || '').slice(9).toUpperCase() || '  ';
      out(`#${String(i.number).padEnd(4)} ${pr} ${st.padEnd(10)} @${i.assignees[0]?.login || '-'}  ${i.title}`);
    }
    return 0;
  }
  const n = Number(arg);
  if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'Aufgabennummer fehlt (z. B. 92)');
  const note = flags.note || flags.reason || null;
  if (cmd === 'comment') {
    if (!note) throw new ApiError(400, '--note fehlt');
    await api.comment(n, { body: note });
    out(`#${n}: Kommentar gespeichert`);
    return 0;
  }
  const spec = COMMANDS[cmd];
  if (!spec) throw new ApiError(400, `Unbekannter Befehl „${cmd}"`);
  const result = await api.transition(n, { target: spec.target, owner: flags.owner ? String(flags.owner).replace(/^@/, '') : null, comment: note, reason: note, confirmAcceptance: Boolean(flags.confirm) });
  out(`#${n}: ${result.from} → ${result.to}${result.note ? ` (${result.note})` : ''}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const gh = async args => (await execFileP('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })).stdout;
  const rebuild = () => execFileP(process.execPath, [resolve(HERE, 'build-dashboard-data.mjs')], { cwd: ROOT });
  const api = createApi({ root: ROOT, rebuild });
  run(process.argv.slice(2), { api, gh })
    .then(code => process.exit(code))
    .catch(e => {
      console.error(e instanceof ApiError ? `Abgelehnt: ${e.message}${e.extra?.missing ? `\n  - ${e.extra.missing.join('\n  - ')}` : ''}` : e.message);
      process.exit(1);
    });
}
