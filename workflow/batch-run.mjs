#!/usr/bin/env node
/**
 * Batch-Runner: fuehrt eine Liste von Aufgaben nacheinander durch den
 * bestehenden ai:route/ai:continue-Pfad.
 *
 * Kein neuer Ausfuehrungsmechanismus - ruft exakt dieselben CLI-Befehle auf,
 * die auch manuell getippt wuerden, nur nacheinander statt einzeln. Diff-
 * Scoping, Nemotron-Erstpass, Codex-Eskalation, Human Gates: alles wie sonst
 * auch, nichts davon wird hier umgangen.
 *
 * Format der Eingabedatei: Bloecke getrennt durch eine Zeile mit genau "---".
 * Ein Block kann optional mit "FILES: a,b,c" beginnen (--files-Override fuer
 * genau diese Aufgabe), der Rest des Blocks ist der Aufgabentext.
 *
 * Haelt automatisch an, sobald eine Aufgabe NICHT mit DONE endet - eine
 * Rueckfrage, ein Blocker oder ein Fehler wird nie stillschweigend
 * uebersprungen, um zur naechsten Aufgabe weiterzuspringen. Der Rest der
 * Liste bleibt unangetastet fuer den naechsten Lauf.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runBounded } from './core.mjs';

const TASK_SEPARATOR = /\r?\n---\r?\n/;
const FILES_PREFIX = /^FILES:\s*(.+)\r?\n/;

/**
 * Zerlegt den Inhalt einer Aufgabendatei in einzelne Aufgaben.
 * @returns {{files: string|null, text: string}[]}
 */
export function parseTasks(content) {
  return String(content ?? '')
    .split(TASK_SEPARATOR)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const match = block.match(FILES_PREFIX);
      if (!match) return { files: null, text: block };
      return { files: match[1].trim(), text: block.slice(match[0].length).trim() };
    })
    .filter(task => task.text.length > 0);
}

/** Liest die letzte "STOP: <REASON>"-Zeile aus der Klartext-Ausgabe von ai:continue. */
export function extractStopReason(output) {
  const matches = [...String(output ?? '').matchAll(/^STOP:\s*(\S+)/gm)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Nutzung: node workflow/batch-run.mjs pfad/zu/aufgaben.txt');
    process.exitCode = 1;
    return;
  }

  const root = path.resolve(import.meta.dirname, '..');
  const absoluteInput = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(absoluteInput)) {
    console.error(`Aufgabendatei nicht gefunden: ${absoluteInput}`);
    process.exitCode = 1;
    return;
  }

  const tasks = parseTasks(fs.readFileSync(absoluteInput, 'utf8'));
  if (!tasks.length) {
    console.error('Keine Aufgaben in der Datei gefunden (Bloecke durch eine Zeile mit "---" trennen).');
    process.exitCode = 1;
    return;
  }

  console.log(`BATCH: ${tasks.length} Aufgabe(n) gefunden in ${inputPath}\n`);

  const nodeBin = process.execPath;
  const oneHour = 60 * 60_000;
  const summaries = [];
  let stoppedEarly = false;

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const preview = task.text.length > 100 ? `${task.text.slice(0, 100)}...` : task.text;
    console.log(`\n=== Aufgabe ${index + 1}/${tasks.length} ===\n${preview}`);

    // --env-file-if-exists=.env ist noetig, damit z. B. NVIDIA_API_KEY im
    // Kindprozess ankommt - runBounded spawnt direkt (kein npm-Wrapper-Skript
    // dazwischen, das das sonst uebernimmt).
    const routeArgs = ['--env-file-if-exists=.env', 'workflow/ai-control.mjs', 'route', task.text];
    if (task.files) routeArgs.push('--files', task.files);
    const routeResult = runBounded(nodeBin, routeArgs, { cwd: root, timeoutMs: oneHour });
    process.stdout.write(routeResult.stdout);
    if (routeResult.exitCode !== 0) {
      console.error(`\nBATCH ANGEHALTEN: Routing fuer Aufgabe ${index + 1} fehlgeschlagen.\n${routeResult.stderr}`);
      summaries.push({ index, stopReason: 'ROUTE_FAILED' });
      stoppedEarly = true;
      break;
    }

    const continueResult = runBounded(nodeBin, ['--env-file-if-exists=.env', 'workflow/ai-control.mjs', 'continue', '--allow-dirty'], { cwd: root, timeoutMs: oneHour });
    process.stdout.write(continueResult.stdout);
    if (continueResult.stderr) process.stderr.write(continueResult.stderr);

    const stopReason = extractStopReason(continueResult.stdout) ?? (continueResult.exitCode === 0 ? 'DONE' : 'UNKNOWN');
    summaries.push({ index, stopReason });

    if (stopReason !== 'DONE') {
      console.log(`\nBATCH ANGEHALTEN bei Aufgabe ${index + 1}/${tasks.length}: ${stopReason}`);
      console.log('Grund pruefen mit: npm run ai:status - danach ggf. npm run workflow/batch-run.mjs mit dem Rest der Liste erneut starten.');
      stoppedEarly = true;
      break;
    }
  }

  console.log('\n=== BATCH-ZUSAMMENFASSUNG ===');
  summaries.forEach(entry => {
    const preview = tasks[entry.index].text.slice(0, 60);
    console.log(`${entry.index + 1}. ${preview}${tasks[entry.index].text.length > 60 ? '...' : ''} -> ${entry.stopReason}`);
  });
  const remaining = tasks.length - summaries.length;
  if (remaining > 0) console.log(`${remaining} Aufgabe(n) nicht gestartet (Liste nach Behebung erneut mit derselben Datei starten).`);
  if (stoppedEarly) process.exitCode = 2;
}

// Nur ausfuehren, wenn direkt aufgerufen - nicht beim Import in Tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
