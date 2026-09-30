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

/**
 * Setzt Werte in einer env-Datei: vorhandene Zeilen werden ersetzt (auch
 * auskommentierte bleiben unberuehrt), neue angehaengt. Nur fuer den Besitzer lesbar.
 */
export function setzeEnvWerte(datei, werte) {
  let zeilen = [];
  try { zeilen = fs.readFileSync(datei, 'utf8').split(/\r?\n/); } catch { /* neu */ }
  if (zeilen.at(-1) === '') zeilen.pop();
  for (const [k, v] of Object.entries(werte)) {
    if (!/^[A-Z0-9_]+$/.test(k) || /[\r\n]/.test(String(v))) throw new Error(`Ungueltiger Eintrag ${k}`);
    const i = zeilen.findIndex(z => new RegExp(`^\\s*(?:export\\s+)?${k}\\s*=`).test(z));
    if (i >= 0) zeilen[i] = `${k}=${v}`; else zeilen.push(`${k}=${v}`);
  }
  fs.writeFileSync(datei, `${zeilen.join('\n')}\n`, { mode: 0o600 });
  fs.chmodSync(datei, 0o600);
}

/** Umgebung samt Dateien - frueher Genanntes gewinnt. */
export function ladeUmgebung(env = process.env, { dir = socialDir(), repo = REPO } = {}) {
  return { ...liesEnvDatei(path.join(repo, '.env.local')), ...liesEnvDatei(zugangDatei(dir)), ...env };
}
