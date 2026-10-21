/**
 * Wegwerf-Kopie des Privatordners fuer `npm run dashboard:pruefen`.
 *
 * Die Pruef-Instanz laeuft auf einer Kopie von $TP_PRIVAT_DIR (Kunden- und
 * Einkaufsdaten) im Temp-Ordner. Mit --offen endet das Pruef-Skript nach dem
 * Bericht, der Server laeuft weiter - die ausgegebene Zeile `kill <pid>` trifft
 * dann nur den Server. Der wusste bis 2026-10-19 nichts von der Kopie, sie blieb
 * jedes Mal liegen (16 Kopien im Temp-Ordner). Jetzt loescht der Server seine
 * Kopie selbst, sobald er endet, und dashboard:pruefen raeumt beim Start weg, was
 * ein harter Abbruch (kill -9, Absturz, Neustart des Rechners) uebrig liess.
 *
 * Geloescht werden nur gekennzeichnete eigene Verzeichnisse (kein Link) direkt im
 * Temp-Ordner mit dem Namen tp-dashboard-daten-XXXXXX. Unmarkierte Altordner bleiben. Die
 * verlinkten Exporte darin (Lexikon, Lieferanten ...) zeigen auf den echten
 * Privatordner; fs.rmSync entfernt nur die Links, nie ihr Ziel.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { besitzLesen, besitzSetzen, prozessLebt, ordnerBenutzt } from './dashboard-temp-besitz.mjs';

const PRAEFIX = 'tp-dashboard-daten-';
// mkdtemp haengt genau sechs Zeichen an.
const NAME = /^tp-dashboard-daten-[A-Za-z0-9]{6}$/;
const EIN_TAG_MS = 24 * 60 * 60 * 1000;

export function datenkopieAnlegen(tmp = os.tmpdir()) {
  const ordner = fs.mkdtempSync(path.join(tmp, PRAEFIX));
  besitzSetzen(ordner, 'daten');
  return ordner;
}

/** Nur ein echtes Verzeichnis tp-dashboard-daten-XXXXXX direkt im Temp-Ordner. */
export function istDatenkopie(pfad, tmp = os.tmpdir()) {
  if (!pfad || !NAME.test(path.basename(pfad))) return false;
  try {
    if (!fs.lstatSync(pfad).isDirectory()) return false;
    return path.dirname(fs.realpathSync(pfad)) === fs.realpathSync(tmp)
      && !!besitzLesen(pfad, 'daten');
  } catch {
    return false;
  }
}

export function datenkopieLoeschen(pfad, tmp = os.tmpdir(), { verwaist = false, lebt = prozessLebt, benutzt = ordnerBenutzt } = {}) {
  if (!istDatenkopie(pfad, tmp)) return false;
  const ziel = fs.realpathSync(pfad);
  if (!istDatenkopie(ziel, tmp)) return false;
  const b = besitzLesen(ziel, 'daten');
  // Der Server kann die Kopie seit der Kandidatensuche uebernommen haben.
  if (b.pid !== process.pid && lebt(b.pid)) return false;
  if (verwaist && (lebt(b.pid) || benutzt(ziel) !== false)) return false;
  fs.rmSync(ziel, { recursive: true, force: true });
  return true;
}

/**
 * Fuer den Server der Pruef-Instanz: loescht die Kopie, sobald der Prozess endet -
 * bei `kill` (SIGTERM), Strg-C (SIGINT), geschlossenem Terminal (SIGHUP) und bei
 * process.exit (z. B. Port belegt). Ohne eigenen Handler beendet Node einen Prozess
 * bei SIGTERM sofort, ohne 'exit' auszuloesen.
 *
 * Greift nur, wenn TP_DASHBOARD_DATENKOPIE gesetzt ist, auf denselben Ordner zeigt
 * wie TP_PRIVAT_DIR und dieser eine Kopie im Temp-Ordner ist. Der echte Dienst
 * setzt die Variable nie; zeigt sie woanders hin, wird nichts geloescht.
 */
export function beimEndeLoeschen({ env = process.env, proc = process, tmp = os.tmpdir() } = {}) {
  const pfad = env.TP_DASHBOARD_DATENKOPIE;
  if (!pfad) return null;
  if (path.resolve(pfad) !== path.resolve(env.TP_PRIVAT_DIR || '') || !istDatenkopie(pfad, tmp)) {
    console.error('[dashboard] TP_DASHBOARD_DATENKOPIE ist kein TP_PRIVAT_DIR im Temp-Ordner - wird beim Beenden nicht geloescht.');
    return null;
  }
  // Der Server uebernimmt die Kopie, bevor der Starter mit --offen endet.
  besitzSetzen(pfad, 'daten');
  proc.on('exit', () => { try { datenkopieLoeschen(pfad, tmp); } catch { /* beim Beenden nicht mehr zu melden */ } });
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    proc.on(signal, () => proc.exit(code));
  }
  return pfad;
}

/**
 * Befehlszeilen samt Umgebung aller eigenen Prozesse (macOS und Linux). Ein Server
 * der Pruef-Instanz traegt dort TP_PRIVAT_DIR=<kopie>. null, wenn sich das nicht
 * feststellen laesst (Windows, ps fehlt) - dann wird nichts geloescht.
 */
export function laufendeProzesse() {
  if (process.platform === 'win32') return null;
  const r = spawnSync('ps', ['axeww', '-o', 'command='], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 && r.stdout ? r.stdout : null;
}

/**
 * Kopien frueherer Laeufe ohne laufenden Prozess, die aelter als `maxAlterMs` sind.
 * Die Besitzkennung schuetzt auch einen parallelen Lauf vor dem Serverstart.
 * Nur ein nachweislich beendeter Besitzer und keine offenen Dateien/cwd geben den
 * Ordner frei. Fehlende Prozess-/lsof-Auskunft bedeutet: erhalten.
 */
export function verwaisteDatenkopien({ tmp = os.tmpdir(), jetzt = Date.now(), maxAlterMs = EIN_TAG_MS, prozesse = laufendeProzesse, lebt = prozessLebt, benutzt = ordnerBenutzt } = {}) {
  const laufend = prozesse();
  if (laufend == null) return [];
  let namen;
  try { namen = fs.readdirSync(tmp).filter(n => NAME.test(n)); } catch { return []; }
  return namen.map(n => path.join(tmp, n)).filter(p => {
    if (laufend.includes(path.basename(p)) || !istDatenkopie(p, tmp)) return false;
    try {
      const b = besitzLesen(p, 'daten');
      return b && !lebt(b.pid) && jetzt - b.angelegt > maxAlterMs && benutzt(p) === false;
    } catch {
      return false;
    }
  });
}
