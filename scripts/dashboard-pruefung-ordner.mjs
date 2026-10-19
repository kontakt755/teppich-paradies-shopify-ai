/**
 * Screenshot-Ordner von `npm run dashboard:pruefen` ohne --aus.
 *
 * Ohne --aus legt dashboard:pruefen Screenshots und bericht.json in einem Ordner
 * tp-dashboard-pruefung-XXXXXX im Temp-Ordner ab. Die Screenshots zeigen echte Kunden-
 * und Einkaufsdaten und blieben bis 2026-10-19 fuer immer liegen (59 Ordner). Jetzt
 * loescht jeder Lauf beim Start die Ordner frueherer Laeufe, die aelter als drei Tage
 * sind - Zeit genug, sich die Bilder eines Laufs anzusehen.
 *
 * Geloescht wird nur, was eindeutig ein solcher Ordner ist: ein echtes Verzeichnis (kein
 * Link) direkt im Temp-Ordner mit genau dem Namen tp-dashboard-pruefung-XXXXXX. Ein mit
 * --aus gewaehlter Ordner unter anderem Namen wird nie angefasst.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Derselbe Praefix wie in scripts/dashboard-pruefen.mjs (mkdtemp haengt sechs Zeichen an).
const NAME = /^tp-dashboard-pruefung-[A-Za-z0-9]{6}$/;
export const PRUEF_ORDNER_MAX_ALTER_MS = 3 * 24 * 60 * 60 * 1000;

/** Nur ein echtes Verzeichnis tp-dashboard-pruefung-XXXXXX direkt im Temp-Ordner. */
export function istPruefOrdner(pfad, tmp = os.tmpdir()) {
  if (!pfad || !NAME.test(path.basename(pfad))) return false;
  try {
    if (!fs.lstatSync(pfad).isDirectory()) return false;
    return fs.realpathSync(path.dirname(path.resolve(pfad))) === fs.realpathSync(tmp);
  } catch {
    return false;
  }
}

/** Screenshot-Ordner frueherer Laeufe, die aelter als `maxAlterMs` sind (ab dem Anlegen). */
export function altePruefOrdner({ tmp = os.tmpdir(), jetzt = Date.now(), maxAlterMs = PRUEF_ORDNER_MAX_ALTER_MS } = {}) {
  let namen;
  try { namen = fs.readdirSync(tmp).filter(n => NAME.test(n)); } catch { return []; }
  return namen.map(n => path.join(tmp, n)).filter(p => {
    if (!istPruefOrdner(p, tmp)) return false;
    try {
      const st = fs.statSync(p);
      return jetzt - (st.birthtimeMs || st.mtimeMs) > maxAlterMs;
    } catch {
      return false;
    }
  });
}

/** Loescht die alten Screenshot-Ordner und gibt ihre Pfade zurueck. */
export function altePruefOrdnerLoeschen(optionen = {}) {
  const tmp = optionen.tmp || os.tmpdir();
  const geloescht = [];
  for (const p of altePruefOrdner(optionen)) {
    if (!istPruefOrdner(p, tmp)) continue;
    fs.rmSync(p, { recursive: true, force: true });
    geloescht.push(p);
  }
  return geloescht;
}
