/**
 * "Gepackt" fuer Kunden → Muster packen (#1572).
 *
 * Rein lokale Ablage unter $TP_PRIVAT_DIR/muster-packen.json, gleiche Bauart wie
 * operations/lib/fallmarken.mjs: atomares Schreiben, "last write wins" je Schluessel.
 * Schluessel sind die sortierten Bestell-IDs eines Umschlags (packSchluessel; seit 29.10.2026 ein
 * Umschlag je Empfaenger und Bestelltag) - kommt am selben Tag eine Bestellung dazu, gilt der Umschlag
 * nicht mehr als gepackt. In Shopify aendert sich nichts.
 *
 * Daneben (gleiche Datei): `haken` je Bestellposition (Muster ueberklebt, liegt im Umschlag),
 * `klaeren` je Umschlag (unvollstaendig: welche Positionen fehlen, kurze Notiz) und
 * `gedruckt` je Umschlag (Aufkleber und Adresse gedruckt: Umschlag vorbereitet, wartet auf Muster).
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
export function leseStand(datei) {
  let inhalt;
  try {
    inhalt = fs.readFileSync(datei, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return { gepackt: {}, haken: {}, klaeren: {}, gedruckt: {} };
    throw new Error(`${path.basename(datei)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!inhalt.trim()) return { gepackt: {}, haken: {}, klaeren: {}, gedruckt: {} };
  let roh;
  try { roh = JSON.parse(inhalt); } catch {
    throw new Error(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  const objekt = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return { gepackt: objekt(roh?.eintraege), haken: objekt(roh?.haken), klaeren: objekt(roh?.klaeren), gedruckt: objekt(roh?.gedruckt) };
}

/** Nur die gepackten Umschlaege (fruehere Form der Datei). */
export function leseAlle(datei) {
  return leseStand(datei).gepackt;
}

function schreibStand(datei, stand) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ aktualisiertAm: new Date().toISOString(), eintraege: stand.gepackt, haken: stand.haken, klaeren: stand.klaeren, gedruckt: stand.gedruckt || {} }, null, 2));
  fs.renameSync(tmp, datei);
}

/** Setzt oder nimmt "gepackt" zurueck. */
export function setzeGepackt(datei, packSchluessel, { gepackt = true, von = null, jetzt = new Date(), restumfangGeprueft = false } = {}) {
  const key = String(packSchluessel || '').trim();
  if (!key) throw new Error('Kein Kunde angegeben');
  const stand = leseStand(datei);
  if (gepackt) stand.gepackt[key] = { zeit: jetzt.toISOString(), von: von || null, ...(restumfangGeprueft === true ? { restumfangGeprueft: true } : {}) };
  else delete stand.gepackt[key];
  schreibStand(datei, stand);
  return { packSchluessel: key, gepackt: stand.gepackt[key] || null };
}

/**
 * "Gedruckt" je Umschlag setzen oder zuruecknehmen: Aufkleber und Adresse liegen bereit, der Umschlag
 * wartet auf die Muster. Gilt fuer alle Geraete (bis 26.10. nur im Browser des druckenden Geraets).
 * `zeit` darf ein frueherer Druckzeitpunkt sein (Uebernahme alter Geraetevermerke).
 */
export function setzeGedruckt(datei, packSchluessel, { gedruckt = true, von = null, zeit = null, jetzt = new Date() } = {}) {
  const key = String(packSchluessel || '').trim();
  if (!key) throw new Error('Kein Kunde angegeben');
  const stand = leseStand(datei);
  if (gedruckt) stand.gedruckt[key] = { zeit: (zeit || jetzt).toISOString(), von: von || null };
  else delete stand.gedruckt[key];
  schreibStand(datei, stand);
  return { packSchluessel: key, gedruckt: stand.gedruckt[key] || null };
}

/** Haken je Bestellposition setzen oder entfernen. */
export function setzeHaken(datei, lineItemIds, { an = true, von = null, jetzt = new Date() } = {}) {
  const ids = [...new Set((lineItemIds || []).map(v => String(v || '').trim()).filter(Boolean))];
  if (!ids.length) throw new Error('Kein Muster angegeben');
  const stand = leseStand(datei);
  for (const id of ids) { if (an) stand.haken[id] = { zeit: jetzt.toISOString(), von: von || null }; else delete stand.haken[id]; }
  schreibStand(datei, stand);
  return { haken: Object.fromEntries(ids.map(id => [id, stand.haken[id] || null])) };
}

/** Kunde nach "zu klaeren" (mit fehlenden Positionen und Notiz) oder zurueck ("Fehlendes ist da"). */
export function setzeKlaeren(datei, kundenSchluessel, { klaeren = true, fehlt = [], notiz = '', von = null, jetzt = new Date() } = {}) {
  const key = String(kundenSchluessel || '').trim();
  if (!key) throw new Error('Kein Kunde angegeben');
  const stand = leseStand(datei);
  if (klaeren) stand.klaeren[key] = { zeit: jetzt.toISOString(), von: von || null, fehlt: [...new Set(fehlt.map(String))], notiz: String(notiz || '').trim().slice(0, 300) || null };
  else if (key.includes('|adresse:')) {
    // Nur diesen Empfaenger freigeben; eine alte gemeinsame Klaerung gilt fuer andere weiter.
    stand.klaeren[key] = { geklaert: true, zeit: jetzt.toISOString(), von: von || null };
  } else delete stand.klaeren[key];
  schreibStand(datei, stand);
  return { klaeren: stand.klaeren[key]?.geklaert ? null : stand.klaeren[key] || null };
}
