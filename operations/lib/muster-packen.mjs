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
 *
 * `versandProbleme` je Umschlag: "Gepackt" bzw. "Verschickt" hat den Versand nicht sauber eingetragen
 * (Shopify nicht erreicht, lokaler Schritt gescheitert). Bleibt stehen, bis jemand "Verstanden" drueckt
 * oder derselbe Umschlag doch noch sauber verschickt wird.
 *
 * Bis 06.11.2026 (#1937) hiess diese Ablage `eingeworfen` und hielt auch Vermerke ohne Problem: der Klick
 * "Eingeworfen", gebucht erst nach einer Frist. Den Weg gibt es nicht mehr (Gepackt = verschickt). Ein alter
 * Vermerk ohne Problem wurde nie gebucht und gilt deshalb beim Lesen als Problem.
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
    if (e?.code === 'ENOENT') return leer();
    throw new Error(`${path.basename(datei)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!inhalt.trim()) return leer();
  let roh;
  try { roh = JSON.parse(inhalt); } catch {
    throw new Error(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  const objekt = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const alt = Object.entries(objekt(roh?.eingeworfen)).map(([pk, e]) => [pk, e?.problem ? e : { ...e, problem: ALT_NIE_GEBUCHT, problemAm: e?.zeit || null }]);
  return { gepackt: objekt(roh?.eintraege), haken: objekt(roh?.haken), klaeren: objekt(roh?.klaeren), gedruckt: objekt(roh?.gedruckt),
    versandProbleme: { ...Object.fromEntries(alt), ...objekt(roh?.versandProbleme) } };
}

const leer = () => ({ gepackt: {}, haken: {}, klaeren: {}, gedruckt: {}, versandProbleme: {} });
export const ALT_NIE_GEBUCHT = 'Als eingeworfen vermerkt, aber nie eingetragen. Steht der Umschlag noch unter „Gepackt“, dort „Verschickt – Kunde informieren…“.';

/** Nur die gepackten Umschlaege (fruehere Form der Datei). */
export function leseAlle(datei) {
  return leseStand(datei).gepackt;
}

function schreibStand(datei, stand) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ aktualisiertAm: new Date().toISOString(), eintraege: stand.gepackt, haken: stand.haken, klaeren: stand.klaeren, gedruckt: stand.gedruckt || {}, versandProbleme: stand.versandProbleme || {} }, null, 2));
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

/**
 * Versand nicht sauber eingetragen: ein Vermerk je Umschlag, ein neuer ersetzt den alten.
 * @param {{orderIds: string[], bestellungen: string[], meldung: string, von?: string, jetzt?: Date}} angaben
 */
export function vermerkeVersandProblem(datei, packSchluessel, { orderIds = [], bestellungen = [], meldung, von = null, jetzt = new Date() } = {}) {
  const key = String(packSchluessel || '').trim();
  if (!key) throw new Error('Kein Umschlag angegeben');
  const stand = leseStand(datei);
  stand.versandProbleme[key] = { zeit: jetzt.toISOString(), von: von || null, orderIds, bestellungen,
    problem: String(meldung || 'Ergebnis unbekannt').slice(0, 500), problemAm: jetzt.toISOString() };
  schreibStand(datei, stand);
}

/** Vermerke entfernen ("Verstanden" oder doch noch sauber verschickt); gibt zurueck, welche es gab. */
export function entferneVersandProbleme(datei, schluessel) {
  const stand = leseStand(datei);
  const entfernt = (schluessel || []).filter(pk => stand.versandProbleme[pk]);
  if (!entfernt.length) return [];
  for (const pk of entfernt) delete stand.versandProbleme[pk];
  schreibStand(datei, stand);
  return entfernt;
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
