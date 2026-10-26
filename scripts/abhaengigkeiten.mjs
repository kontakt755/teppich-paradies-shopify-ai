#!/usr/bin/env node
/**
 * Sind die Bibliotheken aus package.json installiert?
 *
 *   node scripts/abhaengigkeiten.mjs        # Exit 0, oder Exit 2 mit klarer Meldung
 *
 * Steht vor den Testsuiten, die Bibliotheken brauchen (qa:unit:test, operations:test).
 * Am 23.10.2026 war node_modules im Hauptcheckout leer: `npm test` endete mit 62 roten
 * Tests ("Cannot find package 'liquidjs'"), und wegen der &&-Kette liefen die uebrigen
 * Suiten gar nicht erst. Ein fehlendes Paket ist kein Fehler im Code - die Meldung sagt
 * deshalb, was zu tun ist, statt 60 Stacktraces zu zeigen.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Namen aus dependencies und devDependencies, deren node_modules/<name>/package.json fehlt. */
export function fehlendePakete(root = WURZEL) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const namen = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort();
  return namen.filter((name) => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));
}

export function meldung(fehlen, root = WURZEL) {
  return [
    `FEHLER: Bibliotheken fehlen in ${path.join(root, 'node_modules')}: ${fehlen.join(', ')}.`,
    `Im Repository-Root \`npm ci\` ausfuehren (cd ${root} && npm ci --no-audit --no-fund) und den Befehl wiederholen.`,
    'Das aendert nur node_modules, keine Datei unter Versionskontrolle.',
  ].join('\n');
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fehlen = fehlendePakete();
  if (fehlen.length) {
    console.error(meldung(fehlen));
    process.exit(2);
  }
}
