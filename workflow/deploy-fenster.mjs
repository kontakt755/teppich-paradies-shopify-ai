/**
 * Deploy-Fenster: solange ein Livegang laeuft, darf nichts nach main.
 *
 * Am 2026-10-08 brach der Live-Schritt dreimal mit LIVE_SOURCE ab, weil andere
 * Sitzungen waehrend der rund zehnminuetigen Preview nach main gemergt hatten
 * (Werkbank w-049). Die Arbeitskopie-Sperre (.workflow/lock.json) half nicht:
 * Sie schuetzt nur vor einem zweiten Lauf im selben Verzeichnis, und zwischen
 * Preview und Live haelt sie gar niemand.
 *
 * Deshalb oeffnet `workflow preview` ein Fenster (.workflow/deploy-fenster.json)
 * in der Deploy-Arbeitskopie, und `workflow live` schliesst es am Ende - auch
 * bei einem Abbruch, denn dann beginnt der Deploy ohnehin mit einer neuen
 * Preview. Scheitert schon die Preview, schliesst sie das Fenster selbst.
 *
 * .claude/hooks/git-gh-guard.mjs und `npm run deploy:frei` fragen hier, ob
 * gerade deployt wird: gueltige Sperre mit Label "workflow preview|live" oder
 * ein Fenster, das juenger als FENSTER_MAX_MS ist. Ein vergessenes Fenster
 * verfaellt von selbst; sofort geht es mit Loeschen der Datei.
 */
import fsDefault from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isProcessAlive, lockIsStale, readLock, describeLock, STALE_AFTER_MS } from './worktree-lock.mjs';

export const FENSTER_RELATIVE_PATH = '.workflow/deploy-fenster.json';
/** Preview + Live dauern zusammen rund 20 Minuten; danach gilt ein Fenster als vergessen. */
export const FENSTER_MAX_MS = 60 * 60 * 1000;
const DEPLOY_LABEL = /^workflow (preview|live)$/;

export function fensterPfad(root) {
  return path.join(root, FENSTER_RELATIVE_PATH);
}

export function oeffneFenster(root, { head = null, io = fsDefault, now = () => Date.now(), pid = process.pid, hostname = os.hostname() } = {}) {
  const ziel = fensterPfad(root);
  io.mkdirSync(path.dirname(ziel), { recursive: true });
  io.writeFileSync(ziel, `${JSON.stringify({ head, pid, host: hostname, startedAt: new Date(now()).toISOString() }, null, 2)}\n`);
}

export function schliesseFenster(root, { io = fsDefault } = {}) {
  try { io.rmSync(fensterPfad(root), { force: true }); } catch { /* nichts zu schliessen */ }
}

function leseFenster(root, io) {
  try { return JSON.parse(io.readFileSync(fensterPfad(root), 'utf8')); } catch { return null; }
}

/** `git worktree list --porcelain` zu [{pfad, branch}]. */
export function parseWorktrees(porcelain) {
  const liste = [];
  let aktuell = null;
  for (const zeile of String(porcelain).split('\n')) {
    if (zeile.startsWith('worktree ')) { aktuell = { pfad: zeile.slice(9), branch: null }; liste.push(aktuell); }
    else if (aktuell && zeile.startsWith('branch ')) aktuell.branch = zeile.slice(7).replace(/^refs\/heads\//, '');
  }
  return liste;
}

/**
 * Laeuft gerade ein Deploy? Sucht die Arbeitskopie, die main ausgecheckt hat
 * (nur dort kann preview/live laufen), und prueft Sperre und Fenster.
 * @returns {null | {pfad: string, grund: string}}
 */
export function laufenderDeploy({
  cwd = process.cwd(),
  worktreeListe = () => execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
  io = fsDefault,
  now = Date.now(),
  hostname = os.hostname(),
  isAlive = isProcessAlive,
} = {}) {
  let porcelain;
  try { porcelain = worktreeListe(); } catch { return null; }
  for (const { pfad, branch } of parseWorktrees(porcelain)) {
    if (branch !== 'main') continue;
    const lock = readLock({ root: pfad, io });
    if (lock && DEPLOY_LABEL.test(lock.label ?? '') && !lockIsStale(lock, { now, hostname, isAlive, staleAfterMs: STALE_AFTER_MS })) {
      return { pfad, grund: `${describeLock(lock)} laeuft` };
    }
    const fenster = leseFenster(pfad, io);
    const alter = now - Date.parse(fenster?.startedAt ?? '');
    if (fenster && Number.isFinite(alter) && alter >= 0 && alter < FENSTER_MAX_MS) {
      return { pfad, grund: `Deploy-Fenster offen seit ${fenster.startedAt} (Preview fuer ${String(fenster.head ?? '?').slice(0, 8)}, Live steht noch aus)` };
    }
  }
  return null;
}
