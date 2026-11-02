#!/usr/bin/env node
// Die letzten Changelog-Eintraege des Control Centers lesen - neueste zuerst.
// Eine Datei je Eintrag unter docs/control-center/changelog/ (Format: README.md dort,
// Pruefung: scripts/changelog-guard.mjs).
//
//   npm run -s changelog                 # die letzten 10 Eintraege
//   npm run -s changelog -- --letzte 25  # mehr
//   npm run -s changelog -- --namen      # nur die Dateinamen
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ladeEintraege, ORDNER } from './changelog-guard.mjs';

export function optionen(argv) {
  let letzte = 10;
  let namen = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--letzte') {
      letzte = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(letzte) || letzte < 1) throw new Error('--letzte braucht eine Zahl ab 1');
    } else if (argv[i] === '--namen') namen = true;
    else throw new Error(`Unbekannte Option ${argv[i]} (erlaubt: --letzte N, --namen)`);
  }
  return { letzte, namen };
}

export function ausgabe(eintraege, { letzte, namen }) {
  const teil = eintraege.slice(0, letzte);
  if (namen) return teil.map((e) => e.name).join('\n');
  return teil.map((e) => `<!-- ${e.name} -->\n${e.text.trimEnd()}`).join('\n\n');
}

function main() {
  let opt;
  try { opt = optionen(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  const eintraege = ladeEintraege();
  if (!eintraege.length) { console.log(`Keine Eintraege unter ${ORDNER}/.`); return; }
  console.log(ausgabe(eintraege, opt));
  if (eintraege.length > opt.letzte) console.log(`\n(${opt.letzte} von ${eintraege.length} Eintraegen; mehr mit -- --letzte N)`);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
