/**
 * "Gepackt" fuer Kunden → Muster packen (#1572).
 *
 * Rein lokale Ablage unter $TP_PRIVAT_DIR/muster-packen.json, gleiche Bauart wie
 * operations/lib/fallmarken.mjs: atomares Schreiben, "last write wins" je Schluessel.
 * Schluessel sind die sortierten Bestell-IDs eines Kunden (packSchluessel) - kommt eine
 * Bestellung dazu, gilt der Umschlag nicht mehr als gepackt. In Shopify aendert sich nichts.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function musterPackenPfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'muster-packen.json');
}

/**
 * Fehlende Datei heisst "noch nichts gepackt". Eine unlesbare oder beschaedigte Datei wirft,
 * statt als leer zu gelten - sonst schriebe der naechste Klick eine Datei mit einem Eintrag.
 */
export function leseAlle(datei) {
  let inhalt;
  try {
    inhalt = fs.readFileSync(datei, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return {};
    throw new Error(`${path.basename(datei)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!inhalt.trim()) return {};
  let roh;
  try { roh = JSON.parse(inhalt); } catch {
    throw new Error(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  return roh && typeof roh === 'object' && roh.eintraege && typeof roh.eintraege === 'object' ? roh.eintraege : {};
}

function schreibAlle(datei, eintraege) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ aktualisiertAm: new Date().toISOString(), eintraege }, null, 2));
  fs.renameSync(tmp, datei);
}

/** Setzt oder nimmt "gepackt" zurueck. */
export function setzeGepackt(datei, packSchluessel, { gepackt = true, von = null, jetzt = new Date() } = {}) {
  const key = String(packSchluessel || '').trim();
  if (!key) throw new Error('Kein Kunde angegeben');
  const eintraege = leseAlle(datei);
  if (gepackt) eintraege[key] = { zeit: jetzt.toISOString(), von: von || null };
  else delete eintraege[key];
  schreibAlle(datei, eintraege);
  return { packSchluessel: key, gepackt: eintraege[key] || null };
}
