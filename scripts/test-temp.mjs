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

import { spawn } from 'node:child_process';
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
  const weg = () => {
    try { fs.rmSync(ordner, { recursive: true, force: true, maxRetries: 3 }); } catch (e) {
      console.error(`[test-temp] ${ordner} liess sich nicht loeschen: ${e.message}`);
    }
  };
  const kind = spawn(process.execPath, argumente, {
    stdio: 'inherit',
    env: { ...process.env, TMPDIR: ordner, TMP: ordner, TEMP: ordner },
  });
  // Strg-C trifft die ganze Prozessgruppe; der Starter wartet auf das Ende der Tests
  // und raeumt erst dann auf. Ein kill auf den Starter allein wird weitergereicht.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => kind.kill(signal));
  kind.on('error', e => { console.error(`[test-temp] ${e.message}`); weg(); process.exit(1); });
  kind.on('exit', (code, signal) => {
    weg();
    process.exit(code ?? (signal ? 1 : 0));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  starter(process.argv.slice(2));
}
