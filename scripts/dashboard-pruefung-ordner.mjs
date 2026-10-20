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

// --aus darf noch nicht existieren. Erst den naechsten vorhandenen Vorfahren
// aufloesen, dann fehlende Teile anhaengen; Symlink/.. nie vorher normalisieren.
function ausAufloesen(aus) {
  let p = path.isAbsolute(aus) ? aus : `${process.cwd()}${path.sep}${aus}`;
  const rest = [];
  for (;;) {
    try { return path.join(fs.realpathSync(p), ...rest); }
    catch (e) {
      if (e.code !== 'ENOENT' || path.dirname(p) === p) return null;
      rest.unshift(path.basename(p));
      p = path.dirname(p);
    }
  }
}

function enthaelt(ordner, aus) {
  const relativ = path.relative(fs.realpathSync(ordner), aus);
  return relativ === '' || (!path.isAbsolute(relativ) && relativ !== '..' && !relativ.startsWith(`..${path.sep}`));
}

// Eine ausdruecklich mit --aus gewaehlte Ablage wird dauerhaft behalten, auch wenn
// der Benutzer dafuer den automatisch erzeugten Ordner eines frueheren Laufs nutzt.
export function pruefOrdnerBehalten(ordner, tmp = os.tmpdir()) {
  let p = ausAufloesen(ordner);
  while (p) {
    if (istPruefOrdner(p, tmp)) {
      fs.unlinkSync(path.join(p, '.tp-dashboard-temp.json'));
      return;
    }
    const eltern = path.dirname(p);
    if (eltern === p) return;
    p = eltern;
  }
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
  const ausZiel = aus ? ausAufloesen(aus) : null;
  if (aus && !ausZiel) return []; // Unklarer Ausgabeort: nichts darunter loeschen.
  let namen;
  try { namen = fs.readdirSync(tmp).filter(n => NAME.test(n)); } catch { return []; }
  return namen.map(n => path.join(tmp, n)).filter(p => {
    if (!istPruefOrdner(p, tmp)) return false;
    try {
      if (ausZiel && enthaelt(p, ausZiel)) return false;
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
