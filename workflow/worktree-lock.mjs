/**
 * Exklusive Sperre je Arbeitskopie fuer Laeufe, die den Worktree veraendern.
 *
 * Am 2026-09-26 haben zwei Sitzungen gleichzeitig in
 * .claude/worktrees/deploy-main gearbeitet. Beobachtet wurden drei Folgen:
 *   1. qa/theme-check-baseline.json wurde zwischen Schreiben und Lesen
 *      ueberschrieben - das sah nach einem Skriptdefekt aus und kostete eine
 *      Fehlersuche an der falschen Stelle.
 *   2. HEAD sprang mitten im Lauf von einem Commit auf einen anderen, wodurch
 *      die Preview-Evidence nicht mehr zu origin/main passte.
 *   3. Das freigegebene Preview-Theme wurde von der anderen Sitzung
 *      publiziert, waehrend der eigene Live-Lauf es noch als unpublished
 *      erwartete.
 *
 * Fall 3 hat das PREVIEW_ROLE-Gate abgefangen. Darauf ist kein Verlass: die
 * Gates pruefen zu festen Zeitpunkten, die andere Sitzung schreibt dazwischen.
 * Diese Sperre verhindert die Ueberschneidung, statt sie zu bemerken.
 *
 * Bewusst dateibasiert und ohne Abhaengigkeit: die Sperre schuetzt genau ein
 * Verzeichnis auf genau einem Rechner - mehr braucht es nicht, und mehr waere
 * eine Fehlerquelle, die selbst Deploys blockieren koennte.
 */

import fsDefault from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { WorkflowGateError } from './core.mjs';

export const LOCK_RELATIVE_PATH = '.workflow/lock.json';
/** Kindprozesse erben process.env (siehe runBounded) und erkennen die Sperre daran als die eigene. */
export const LOCK_ENV = 'TP_WORKFLOW_LOCK_TOKEN';
/**
 * Nach diesem Alter gilt eine Sperre als verwaist, wenn der Prozess nicht mehr
 * belegbar laeuft. Grosszuegig, weil ein vollstaendiger Preview-Lauf mit
 * Browser-QA mehrere Minuten braucht und eine zu kurze Frist die Sperre
 * wertlos machen wuerde.
 */
export const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Lebt der Prozess noch? Signal 0 stellt nur zu, ohne etwas zu senden.
 * EPERM heisst: es gibt ihn, er gehoert nur einem anderen Benutzer - das ist
 * ein laufender Prozess und keine verwaiste Sperre.
 */
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function lockPath(root) {
  return path.join(root, LOCK_RELATIVE_PATH);
}

export function readLock({ root, io = fsDefault }) {
  try {
    const parsed = JSON.parse(io.readFileSync(lockPath(root), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // Fehlend oder unlesbar wird gleich behandelt: eine Sperre, deren Inhalt
    // niemand deuten kann, darf keinen Deploy dauerhaft blockieren.
    return null;
  }
}

export function describeLock(lock) {
  if (!lock) return 'unbekannter Lauf';
  const teile = [lock.label || 'Lauf', `PID ${lock.pid ?? '?'}`];
  if (lock.host) teile.push(lock.host);
  if (lock.startedAt) teile.push(`seit ${lock.startedAt}`);
  return teile.join(', ');
}

/**
 * Entscheidet, ob eine vorgefundene Sperre uebernommen werden darf.
 * Auf einem fremden Rechner laesst sich der Prozess nicht pruefen - dort
 * entscheidet allein das Alter, damit eine abgestuerzte Sitzung auf einem
 * anderen Rechner nicht ewig blockiert.
 */
export function lockIsStale(lock, { now, hostname, isAlive, staleAfterMs }) {
  if (!lock) return true;
  const alter = now - Date.parse(lock.startedAt ?? '');
  const alterUnbekannt = !Number.isFinite(alter);
  if (lock.host && lock.host !== hostname) return alterUnbekannt || alter > staleAfterMs;
  if (isAlive(lock.pid)) return false;
  return true;
}

/**
 * Holt die Sperre oder wirft WORKTREE_BUSY mit dem Hinweis, wer sie haelt.
 * Rueckgabe traegt `release()`; der Aufrufer ruft das im finally.
 */
export function acquireWorktreeLock({
  root,
  label,
  io = fsDefault,
  env = process.env,
  pid = process.pid,
  now = () => Date.now(),
  isAlive = isProcessAlive,
  hostname = os.hostname(),
  staleAfterMs = STALE_AFTER_MS,
} = {}) {
  const ziel = lockPath(root);
  const vorhanden = readLock({ root, io });

  // Eigener Kindprozess: der Workflow ruft qa/run-qa.mjs selbst auf. Ohne
  // diesen Zweig wuerde sich der Lauf an der eigenen Sperre blockieren.
  if (env[LOCK_ENV] && vorhanden && vorhanden.token === env[LOCK_ENV]) {
    return { token: vorhanden.token, reentrant: true, tookOver: null, release() {} };
  }

  // Vorhandensein und Lesbarkeit sind zwei verschiedene Dinge: readLock
  // liefert auch fuer kaputtes JSON null. Ohne diese Unterscheidung bliebe eine
  // unlesbare Sperrdatei liegen, und jeder Lauf scheiterte am 'wx' unten -
  // eine Sperre, die niemand mehr deuten kann, blockierte dann fuer immer.
  let uebernommen = null;
  if (io.existsSync(ziel)) {
    if (vorhanden && !lockIsStale(vorhanden, { now: now(), hostname, isAlive, staleAfterMs })) {
      throw new WorkflowGateError(
        `Arbeitskopie ist belegt: ${describeLock(vorhanden)}. Gleichzeitige Laeufe im selben Worktree ueberschreiben sich gegenseitig.`,
        'WORKTREE_BUSY'
      );
    }
    uebernommen = vorhanden;
    try { io.rmSync(ziel, { force: true }); } catch { /* gleich faellt das Anlegen auf */ }
  }

  const token = randomUUID();
  const inhalt = { token, pid, host: hostname, label: label ?? 'workflow', startedAt: new Date(now()).toISOString() };
  io.mkdirSync(path.dirname(ziel), { recursive: true });
  try {
    // 'wx' schlaegt fehl, wenn die Datei existiert - das ist der eigentliche
    // Ausschluss. Ohne dieses Flag koennten zwei Laeufe, die gleichzeitig eine
    // verwaiste Sperre vorfinden, beide gewinnen.
    io.writeFileSync(ziel, `${JSON.stringify(inhalt, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    throw new WorkflowGateError(
      `Arbeitskopie ist belegt: ${describeLock(readLock({ root, io }))}. Gleichzeitige Laeufe im selben Worktree ueberschreiben sich gegenseitig.`,
      'WORKTREE_BUSY'
    );
  }

  env[LOCK_ENV] = token;
  let freigegeben = false;
  const release = () => {
    if (freigegeben) return;
    freigegeben = true;
    if (env[LOCK_ENV] === token) delete env[LOCK_ENV];
    // Nur die eigene Sperre loeschen. Haette sie zwischenzeitlich jemand
    // uebernommen, wuerde ein blindes Loeschen dessen Lauf freigeben.
    const aktuell = readLock({ root, io });
    if (aktuell?.token === token) {
      try { io.rmSync(ziel, { force: true }); } catch { /* nicht schlimmer machen */ }
    }
  };

  return { token, reentrant: false, tookOver: uebernommen, release };
}

/**
 * Gibt die Sperre auch dann frei, wenn der Lauf abbricht. Ohne das bliebe nach
 * jedem Strg-C eine Sperre liegen, die erst nach STALE_AFTER_MS verfaellt.
 */
export function releaseOnProcessExit(lock, { onProcess = process } = {}) {
  if (!lock || lock.reentrant) return () => {};
  const beenden = () => lock.release();
  const signale = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  onProcess.once('exit', beenden);
  for (const signal of signale) onProcess.once(signal, () => { beenden(); onProcess.exit(130); });
  return beenden;
}
