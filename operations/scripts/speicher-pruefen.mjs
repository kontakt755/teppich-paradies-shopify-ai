#!/usr/bin/env node
/**
 * Bremse fuer Bildlaeufe (Fehlersuche 28.10.2026): vor jedem Lauf, der Bilder holt, umrechnet
 * oder erzeugt (Raumbilder, Schaerfe, Downloads), den freien Platz pruefen.
 *
 *   npm run -s speicher:pruefen              # Exit 1 unter 20 GiB frei - Lauf nicht starten
 *   npm run -s speicher:pruefen -- --min 30  # eigene Grenze in GiB (falsche Angabe: Exit 2)
 *
 * Exit ungleich 0 heisst immer: nicht starten. Gemessen wird die Platte von $TP_PRIVAT_DIR
 * (dort liegen die Bildarbeitsordner). Nicht messbar: Exit 0 mit Hinweis. Aus Python:
 * `subprocess.run(["npm", "run", "-s", "speicher:pruefen"], cwd=<Repository>).returncode` und
 * bei jedem Wert ungleich 0 abbrechen.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { speicherStand, speicherText, bildlaufFrei, BILDLAUF_MIN_FREI_GIB } from '../lib/speicher.mjs';
import { privatDir } from '../lib/protokoll.mjs';

export function argumente(argv) {
  const a = { min: BILDLAUF_MIN_FREI_GIB };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--min') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--min braucht eine Zahl in GiB, z. B. --min 30');
      a.min = n;
    } else throw new Error(`Unbekannte Option ${argv[i]} (erlaubt: --min <GiB>)`);
  }
  return a;
}

export function pruefen({ argv = [], dir = privatDir(), statfs, aus = console.log } = {}) {
  const a = argumente(argv);
  const stand = speicherStand(dir, statfs ? { statfs } : {});
  const r = bildlaufFrei(stand, a.min);
  aus(`Speicher: ${speicherText(stand)} · ${r.frei ? 'Bildlauf darf starten' : 'Bildlauf NICHT starten'} – ${r.grund}`);
  if (!r.frei) aus('Erst Platz schaffen (alte Bildordner auslagern, Werkbank w-170), dann neu starten.');
  return r.frei ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = pruefen({ argv: process.argv.slice(2) }); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
