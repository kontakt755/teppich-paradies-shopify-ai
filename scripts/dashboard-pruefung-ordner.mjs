/**
 * Screenshot-Ordner von `npm run dashboard:pruefen` ohne --aus.
 *
 * Ohne --aus legt dashboard:pruefen Screenshots und bericht.json in einem Ordner
 * tp-dashboard-pruefung-XXXXXX im Temp-Ordner ab. Die Screenshots zeigen echte Kunden-
 * und Einkaufsdaten und blieben bis 2026-10-19 fuer immer liegen (59 Ordner). Jetzt
 * loescht jeder Lauf beim Start die Ordner frueherer Laeufe, die aelter als drei Tage
 * sind - Zeit genug, sich die Bilder eines Laufs anzusehen.
 *
 * Geloescht werden nur gekennzeichnete eigene Verzeichnisse (kein Link) direkt im
 * Temp-Ordner mit genau diesem Namen, ohne lebenden Besitzer und offene Dateien/cwd.
 * Unmarkierte Altordner und ausdruecklich mit --aus gewaehlte Ablagen bleiben erhalten.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { besitzLesen, besitzSetzen, prozessLebt, ordnerBenutzt } from './dashboard-temp-besitz.mjs';

// Derselbe Praefix wie in scripts/dashboard-pruefen.mjs (mkdtemp haengt sechs Zeichen an).
const NAME = /^tp-dashboard-pruefung-[A-Za-z0-9]{6}$/;
export const PRUEF_ORDNER_MAX_ALTER_MS = 3 * 24 * 60 * 60 * 1000;

export function pruefOrdnerAnlegen(tmp = os.tmpdir()) {
  const ordner = fs.mkdtempSync(path.join(tmp, 'tp-dashboard-pruefung-'));
  besitzSetzen(ordner, 'pruefung');
  return ordner;
}

// Eine ausdruecklich mit --aus gewaehlte Ablage wird dauerhaft behalten, auch wenn
// der Benutzer dafuer den automatisch erzeugten Ordner eines frueheren Laufs nutzt.
export function pruefOrdnerBehalten(ordner, tmp = os.tmpdir()) {
  if (istPruefOrdner(ordner, tmp)) fs.unlinkSync(path.join(ordner, '.tp-dashboard-temp.json'));
}

/** Nur ein echtes Verzeichnis tp-dashboard-pruefung-XXXXXX direkt im Temp-Ordner. */
export function istPruefOrdner(pfad, tmp = os.tmpdir()) {
  if (!pfad || !NAME.test(path.basename(pfad))) return false;
  try {
    if (!fs.lstatSync(pfad).isDirectory()) return false;
    return path.dirname(fs.realpathSync(pfad)) === fs.realpathSync(tmp)
      && !!besitzLesen(pfad, 'pruefung');
  } catch {
    return false;
  }
}

/** Screenshot-Ordner frueherer Laeufe, die aelter als `maxAlterMs` sind (ab dem Anlegen). */
export function altePruefOrdner({ tmp = os.tmpdir(), jetzt = Date.now(), maxAlterMs = PRUEF_ORDNER_MAX_ALTER_MS, lebt = prozessLebt, benutzt = ordnerBenutzt, aus = null } = {}) {
  let namen;
  try { namen = fs.readdirSync(tmp).filter(n => NAME.test(n)); } catch { return []; }
  return namen.map(n => path.join(tmp, n)).filter(p => {
    if (!istPruefOrdner(p, tmp)) return false;
    try {
      if (aus && fs.realpathSync(aus) === fs.realpathSync(p)) return false;
    } catch { /* --aus existiert vielleicht noch nicht */ }
    try {
      const b = besitzLesen(p, 'pruefung');
      return b && !lebt(b.pid) && jetzt - b.angelegt > maxAlterMs && benutzt(p) === false;
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
    // Direkt vor dem Loeschen noch einmal Besitz und laufenden Prozess pruefen.
    if (!altePruefOrdner({ ...optionen, tmp }).includes(p)) continue;
    fs.rmSync(fs.realpathSync(p), { recursive: true, force: true });
    geloescht.push(p);
  }
  return geloescht;
}
