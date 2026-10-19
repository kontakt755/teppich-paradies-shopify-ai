/**
 * Private App-/Projektziele der Prozesszentrale. Hier wird ausschliesslich
 * konfiguriert: keine Anfrage an Anbieter, keine Ausfuehrung und kein Kontext
 * in Links. Leere Ziele bleiben sichtbar unkonfiguriert.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

import { standardProzesslinks, pruefeProzesslinks, ProzesslinksFehler } from '../../docs/ai-dashboard/lib/prozesslinks.mjs';
export { standardProzesslinks, pruefeProzesslink, pruefeProzesslinks, ProzesslinksFehler } from '../../docs/ai-dashboard/lib/prozesslinks.mjs';

export class ProzesslinksSpeicherFehler extends Error {}

export function prozesslinksPfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'prozesslinks.json');
}

/** Nur ENOENT bedeutet Erstbetrieb. Beschaedigtes wird nie leer ueberschrieben. */
export function leseProzesslinks(datei = prozesslinksPfad()) {
  let roh;
  try { roh = fs.readFileSync(datei, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return standardProzesslinks(); throw e; }
  try { return pruefeProzesslinks(JSON.parse(roh)); }
  catch (e) {
    if (e instanceof SyntaxError || e instanceof ProzesslinksFehler) {
      throw new ProzesslinksSpeicherFehler('Die gespeicherten Prozessverknüpfungen sind beschädigt. Bitte aus der Sicherung wiederherstellen.');
    }
    throw e;
  }
}

export function schreibeProzesslinks(datei, eingabe) {
  const daten = pruefeProzesslinks(eingabe);
  leseProzesslinks(datei);
  fs.mkdirSync(path.dirname(datei), { recursive: true, mode: 0o700 });
  const tmp = `${datei}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(daten, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, datei);
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return daten;
}
