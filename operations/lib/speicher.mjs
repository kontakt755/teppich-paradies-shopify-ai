/**
 * Freier Speicher auf der Platte des Mac mini.
 *
 * Auf dieser einen Platte liegen Betriebsdaten, Tagessicherungen, Bildarbeitsordner und die
 * Uploads der Monteure. Laeuft sie voll (ENOSPC), stehen Sync, Sicherung, Control Center und
 * Upload gleichzeitig still - bis Oktober 2026 hat das niemand gemessen (95 % belegt, 23 GiB
 * frei). Die Shop-Wache misst stuendlich (operations/scripts/shopwache.mjs), das Control
 * Center zeigt ab Gelb ein To-do; der Monteur-Upload nimmt unter UPLOAD_MIN_FREI_GIB nichts
 * mehr an (social/scripts/server.mjs). Seit 28.10.2026 (Fehlersuche: 12 bis 17 GiB frei, die
 * Bildlaeufe hatten keine Bremse): bei Rot hoechstens einmal am Tag eine Mac-Mitteilung
 * (speicherMelden), und Bildlaeufe pruefen vor dem Start `npm run -s speicher:pruefen`
 * (bildlaufFrei, Exit 1 unter BILDLAUF_MIN_FREI_GIB).
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
/** Darunter startet kein Bildlauf (Raumbilder, Schaerfe, Downloads) - einer braucht schnell 10 GiB. */
export const BILDLAUF_MIN_FREI_GIB = SPEICHER_ROT_GIB;

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

/**
 * Darf ein Bildlauf starten? Nein unter `minGiB` freiem Platz. Nicht messbar heisst: starten,
 * mit Hinweis - eine Messpanne soll keine Arbeit blockieren (gleiche Haltung wie oben).
 */
export function bildlaufFrei(stand, minGiB = BILDLAUF_MIN_FREI_GIB) {
  if (!stand || !Number.isFinite(stand.freiBytes)) return { frei: true, grund: 'Speicher nicht messbar – Lauf darf trotzdem starten' };
  if (stand.freiBytes < minGiB * GIB) return { frei: false, grund: `nur ${stand.freiGiB} GiB frei, ein Bildlauf braucht mindestens ${minGiB} GiB` };
  return { frei: true, grund: `${stand.freiGiB} GiB frei (Grenze ${minGiB} GiB)` };
}

const berlinTag = jetzt => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);

/**
 * Mac-Mitteilung bei rotem Speicher, hoechstens einmal je Kalendertag (Berlin): die Warnung im
 * Control Center sieht nur, wer dort angemeldet ist. Den Tag der letzten Mitteilung haelt `datei`.
 * Gibt true zurueck, wenn gemeldet wurde.
 */
export function speicherMelden(stand, { datei, melde, jetzt = new Date() }) {
  if (stand?.ampel !== 'rot') return false;
  const tag = berlinTag(jetzt);
  let zuletzt = null;
  try { zuletzt = JSON.parse(fs.readFileSync(datei, 'utf8'))?.tag ?? null; } catch { zuletzt = null; }
  if (zuletzt === tag) return false;
  melde('Speicher fast voll', `${speicherText(stand)}. Läuft die Platte voll, stehen Sync, Sicherung und Uploads still. Alte Bildordner auslagern.`);
  // Volle Platte: dann meldet die naechste Stunde eben noch einmal - besser als gar nicht.
  try { fs.writeFileSync(datei, JSON.stringify({ tag, am: jetzt.toISOString(), freiGiB: stand.freiGiB })); } catch { /* s. o. */ }
  return true;
}
