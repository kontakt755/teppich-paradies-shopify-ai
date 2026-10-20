#!/usr/bin/env node
/**
 * Temp-Ordner der Testsuiten - sie raeumen ihre Wegwerf-Ordner nicht selbst weg.
 *
 * Die Tests legen per mkdtemp Ordner im Temp-Ordner an (cc-api-*, tp-worktree-lock-*,
 * tp-dashboard-test-* und rund hundert weitere Praefixe). Bis 2026-10-19 blieben sie alle
 * liegen: rund 194.000 Eintraege im Temp-Ordner des Macs.
 *
 * 1. Als Starter fuer die npm-Testskripte:
 *
 *      node scripts/test-temp.mjs --test qa/tests/*.test.mjs
 *
 *    startet `node --test ...` mit TMPDIR, TMP und TEMP (os.tmpdir() unter macOS, Linux
 *    und Windows) auf einem eigenen Ordner tp-testlauf-XXXXXX und loescht ihn danach -
 *    auch bei roten Tests und Strg-C. Das erfasst jeden Test und jeden Kindprozess, der
 *    os.tmpdir() benutzt, ohne dass jede Testdatei selbst aufraeumen muss.
 *
 * 2. Als Hilfe in Testdateien, die auch einzeln laufen (`node --test datei.test.mjs`):
 *
 *      import { wegwerfOrdner } from '../../scripts/test-temp.mjs';
 *      const root = wegwerfOrdner('cc-api-');
 *
 *    `node --test` startet jede Testdatei in einem eigenen Prozess; die Ordner
 *    verschwinden, wenn dieser Prozess endet.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const angelegt = new Set();

function allesLoeschen() {
  for (const d of angelegt) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* beim Beenden nicht mehr zu melden */ }
  }
  angelegt.clear();
}

/** mkdtemp im Temp-Ordner; der Ordner wird geloescht, wenn der Testprozess endet. */
export function wegwerfOrdner(praefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), praefix));
  if (!angelegt.size) process.once('exit', allesLoeschen);
  angelegt.add(d);
  return d;
}

function starter(argumente) {
  if (!argumente.length) {
    console.error('Aufruf: node scripts/test-temp.mjs --test <dateien>');
    process.exit(2);
  }
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-testlauf-'));
  const posix = process.platform !== 'win32';
  const kind = spawn(process.execPath, argumente, {
    stdio: 'inherit',
    env: { ...process.env, TMPDIR: ordner, TMP: ordner, TEMP: ordner },
    // Eigene Gruppe: auch Enkelprozesse bekommen den Abbruch, ohne den Starter
    // oder andere parallel laufende Testsuiten zu treffen.
    detached: posix,
  });
  let abbruch = null;
  let beendenSeit = null;
  let notbremse;
  let beendet = false;
  let windowsBaumBeendet = false;
  const fristMs = 1000;
  const signalCode = signal => 128 + (os.constants.signals[signal] || 1);
  const gruppeLebt = () => {
    if (!posix || !kind.pid) return false;
    try { process.kill(-kind.pid, 0); return true; }
    catch (e) { return e.code !== 'ESRCH'; } // unklar: den Ordner behalten
  };
  const senden = signal => {
    if (!kind.pid) return;
    if (posix) {
      try { process.kill(-kind.pid, signal); }
      catch (e) { if (e.code !== 'ESRCH') console.error(`[test-temp] Prozessgruppe: ${e.message}`); }
    } else {
      // Windows hat keine POSIX-Prozessgruppen; /T beendet den Kindprozessbaum.
      const r = spawnSync('taskkill', ['/PID', String(kind.pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8', timeout: fristMs });
      windowsBaumBeendet ||= r.status === 0;
      if (r.error || r.status !== 0) console.error(`[test-temp] taskkill: ${r.error?.message || r.stderr.trim() || 'Baum nicht bestaetigt beendet'}`);
      // Node unter Windows unterstuetzt SIGTERM, aber kein SIGHUP.
      kind.kill('SIGTERM');
    }
  };
  const warteBis = async ende => {
    while (gruppeLebt() && Date.now() < ende) await new Promise(ok => setTimeout(ok, 25));
    return !gruppeLebt();
  };
  const abschliessen = async (code, signal) => {
    if (beendet) return;
    beendet = true;
    clearTimeout(notbremse);
    let status = abbruch ? signalCode(abbruch) : (code ?? (signal ? signalCode(signal) : 1));
    if (!posix && abbruch && !windowsBaumBeendet) {
      console.error(`[test-temp] Prozessbaum nicht bestaetigt beendet; Temp-Ordner bleibt erhalten: ${ordner}`);
      process.exit(status || 1);
    }
    if (gruppeLebt()) {
      // Der Test-Runner kann schon beendet sein, waehrend ein Enkel noch schreibt.
      if (beendenSeit === null) { beendenSeit = Date.now(); senden('SIGTERM'); }
      if (!await warteBis(beendenSeit + fristMs)) {
        senden('SIGKILL');
        if (!await warteBis(Date.now() + fristMs)) {
          console.error(`[test-temp] Prozessgruppe noch aktiv; Temp-Ordner bleibt erhalten: ${ordner}`);
          process.exit(status || 1);
        }
      }
    }
    try { fs.rmSync(ordner, { recursive: true, force: true, maxRetries: 3 }); }
    catch (e) {
      console.error(`[test-temp] ${ordner} liess sich nicht loeschen: ${e.message}`);
      status ||= 1;
    }
    process.exit(status);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => {
    abbruch ||= signal;
    senden(signal);
    if (beendenSeit === null) {
      beendenSeit = Date.now();
      // Ein ignoriertes Signal darf den Starter nicht endlos festhalten.
      notbremse = setTimeout(() => senden('SIGKILL'), fristMs);
    }
  });
  kind.on('error', e => { console.error(`[test-temp] ${e.message}`); void abschliessen(1, null); });
  kind.on('exit', (code, signal) => { void abschliessen(code, signal); });
}

// Node loest symbolische Links beim Moduleinstieg auf (z. B. /var -> /private/var
// unter macOS). Derselbe reale Pfad muss deshalb auch fuer argv verglichen werden.
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  starter(process.argv.slice(2));
}
