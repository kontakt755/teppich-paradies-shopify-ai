/**
 * Freier Speicher auf der Platte des Mac mini.
 *
 * Auf dieser einen Platte liegen Betriebsdaten, Tagessicherungen, Bildarbeitsordner und die
 * Uploads der Monteure. Laeuft sie voll (ENOSPC), stehen Sync, Sicherung, Control Center und
 * Upload gleichzeitig still - bis Oktober 2026 hat das niemand gemessen (95 % belegt, 23 GiB
 * frei). Die Shop-Wache misst stuendlich (operations/scripts/shopwache.mjs), das Control
 * Center zeigt ab Gelb ein To-do; der Monteur-Upload nimmt unter UPLOAD_MIN_FREI_GIB nichts
 * mehr an (social/scripts/server.mjs).
 *
 * Gemessen wird per statfs der Platz, den ein normaler Benutzer noch belegen darf (bavail) -
 * dieselbe Zahl wie "Avail" bei `df -h`. Eine fehlgeschlagene Messung ist "unbekannt", nie
 * ein Absturz und nie ein Alarm.
 */

import fs from 'node:fs';

export const GIB = 1024 ** 3;
/** Darunter wird es knapp (gelb): ein grosser Bildlauf braucht schnell 10 GiB. */
export const SPEICHER_GELB_GIB = 40;
/** Darunter fehlt wenig bis zum Stillstand (rot). */
export const SPEICHER_ROT_GIB = 20;
/** Darunter nimmt der Monteur-Upload nichts mehr an - der Rest bleibt fuer Sync, Sicherung und Logs. */
export const UPLOAD_MIN_FREI_GIB = 15;

/** { freiBytes, gesamtBytes } des Dateisystems, auf dem `pfad` liegt - oder null, wenn nicht messbar. */
export function messeSpeicher(pfad, { statfs = fs.statfsSync } = {}) {
  try {
    const s = statfs(pfad);
    const frei = Number(s.bavail) * Number(s.bsize);
    const gesamt = Number(s.blocks) * Number(s.bsize);
    if (!Number.isFinite(frei) || !Number.isFinite(gesamt) || frei < 0 || gesamt <= 0) return null;
    return { freiBytes: frei, gesamtBytes: gesamt };
  } catch {
    return null;
  }
}

/** Ampel zu einer Anzahl freier Bytes. */
export function speicherAmpel(freiBytes) {
  if (!Number.isFinite(freiBytes)) return 'unbekannt';
  if (freiBytes < SPEICHER_ROT_GIB * GIB) return 'rot';
  if (freiBytes < SPEICHER_GELB_GIB * GIB) return 'gelb';
  return 'gruen';
}

/**
 * Stand fuer status.json der Shop-Wache: Messwerte, Ampel und Grenzen in einem Objekt,
 * damit das Control Center nichts selbst rechnen muss.
 */
export function speicherStand(pfad, { statfs, jetzt = new Date() } = {}) {
  const m = messeSpeicher(pfad, statfs ? { statfs } : {});
  const basis = { pfad, gemessenAm: jetzt.toISOString(), grenzenGiB: { gelb: SPEICHER_GELB_GIB, rot: SPEICHER_ROT_GIB } };
  if (!m) return { ...basis, ampel: 'unbekannt', freiBytes: null, gesamtBytes: null, freiGiB: null, belegtProzent: null };
  return {
    ...basis,
    ampel: speicherAmpel(m.freiBytes),
    freiBytes: m.freiBytes,
    gesamtBytes: m.gesamtBytes,
    freiGiB: Math.floor(m.freiBytes / GIB),
    belegtProzent: Math.round((1 - m.freiBytes / m.gesamtBytes) * 100),
  };
}

/** Kurzer Text fuer Log und Ausgabe, z. B. "23 GiB frei (95 % belegt, GELB)". */
export function speicherText(stand) {
  if (!stand || stand.ampel === 'unbekannt' || stand.freiGiB === null) return 'Speicher nicht messbar';
  return `${stand.freiGiB} GiB frei (${stand.belegtProzent} % belegt, ${String(stand.ampel).toUpperCase()})`;
}
