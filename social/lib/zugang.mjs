/**
 * Zugangsdaten fuer Meta - nur aus Dateien ausserhalb des Repositorys.
 *
 * Reihenfolge: Umgebung, dann $TP_PRIVAT_DIR/social/zugang.env, dann die
 * .env.local der Arbeitskopie. Die Datei im Privatverzeichnis ist der
 * vorgesehene Ort: sie gilt fuer jede Arbeitskopie und jeden Dienst, waehrend
 * eine .env.local nur in der einen Kopie liegt, in der sie angelegt wurde.
 * Werte werden nie ausgegeben.
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO, socialDir } from './pfade.mjs';

export function liesEnvDatei(datei) {
  const werte = {};
  let inhalt;
  try { inhalt = fs.readFileSync(datei, 'utf8'); } catch { return werte; }
  for (const zeile of inhalt.split(/\r?\n/)) {
    if (zeile.trim().startsWith('#')) continue;
    const m = zeile.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) werte[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return werte;
}

export const zugangDatei = (dir = socialDir()) => path.join(dir, 'zugang.env');

/** Umgebung samt Dateien - frueher Genanntes gewinnt. */
export function ladeUmgebung(env = process.env, { dir = socialDir(), repo = REPO } = {}) {
  return { ...liesEnvDatei(path.join(repo, '.env.local')), ...liesEnvDatei(zugangDatei(dir)), ...env };
}
