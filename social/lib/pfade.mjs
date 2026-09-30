/**
 * Wo die Daten des Social-Media-Moduls liegen.
 *
 * Das Repository ist oeffentlich. Baustellenfotos, Beitragsentwuerfe,
 * Kennzahlen und Zugaenge gehoeren deshalb nie hinein, sondern unter
 * $TP_PRIVAT_DIR/social (Standard ~/teppich-paradies-analyse/social) - dieselbe
 * Konvention wie operations/ und das Control Center.
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function privatDir(env = process.env) {
  return env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function socialDir(env = process.env) {
  return env.TP_SOCIAL_DIR || path.join(privatDir(env), 'social');
}

export const dbPfad = (dir = socialDir()) => path.join(dir, 'social.db');
export const medienDir = (dir = socialDir()) => path.join(dir, 'medien');
export const zugaengePfad = (dir = socialDir()) => path.join(dir, 'upload-zugaenge.json');
export const lernstandPfad = (dir = socialDir()) => path.join(dir, 'lernstand.json');
export const sitzungenPfad = (dir = socialDir()) => path.join(dir, 'zentrale-sitzungen.json');

/** Liegt ein Pfad im Repository? Dann darf dort nichts Privates entstehen. */
export function imRepository(pfad, repo = REPO) {
  const rel = path.relative(repo, path.resolve(pfad));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Bricht ab, bevor private Daten im oeffentlichen Repository landen. */
export function pruefePrivat(pfad, repo = REPO) {
  if (imRepository(pfad, repo)) {
    throw new Error(`Private Social-Media-Daten duerfen nicht im Repository liegen: ${pfad}`);
  }
  return pfad;
}

/** Medienpfade stehen relativ zum Social-Verzeichnis in der Datenbank. */
export function medienPfad(relativ, dir = socialDir()) {
  const ziel = path.resolve(dir, relativ);
  if (!ziel.startsWith(path.resolve(dir) + path.sep)) throw new Error('Medienpfad ausserhalb des Social-Verzeichnisses');
  return ziel;
}
