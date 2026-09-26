/**
 * Markierungen auf den Faellen der Arbeitsliste ("Zu tun").
 *
 * Die Liste entsteht aus Bestellungen, Angeboten und liegengebliebenen
 * Warenkoerben - sie kann also nicht wissen, dass ein Vorgang erledigt ist
 * (telefonisch geklaert, anders abgewickelt) oder dass dahinter gar kein Kunde
 * steht, sondern ein eigener Testkauf. Bis hierher gab es dafuer nichts: die
 * Fallkarte hatte ueberhaupt keine Knoepfe, und zwei Testkaeufe standen mit den
 * groessten Betraegen ueber dem groessten echten Fall.
 *
 * Rein lokale Ablage unter $TP_PRIVAT_DIR/fallmarken.json, gleiche Bauart wie
 * operations/lib/rueckrufe.mjs: atomares Schreiben, "last write wins" je
 * Schluessel. In Shopify aendert sich dadurch nichts.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const FALL_GRUND = Object.freeze(['erledigt', 'test']);

export const FALL_GRUND_LABEL = Object.freeze({
  erledigt: 'Erledigt',
  test: 'Kein echter Kunde',
});

export function fallmarkenPfad(privatDir) {
  return path.join(privatDir || standardPrivatDir(), 'fallmarken.json');
}

function standardPrivatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

/** Fehlende Datei ist kein Fehler, sondern "noch nichts markiert". */
export function leseAlle(datei) {
  try {
    const roh = JSON.parse(fs.readFileSync(datei, 'utf8'));
    return roh && typeof roh === 'object' && roh.eintraege && typeof roh.eintraege === 'object' ? roh.eintraege : {};
  } catch {
    return {};
  }
}

function schreibAlle(datei, eintraege) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ aktualisiertAm: new Date().toISOString(), eintraege }, null, 2));
  fs.renameSync(tmp, datei);
}

/**
 * Setzt oder entfernt eine Marke.
 *
 * `bisPunkt` ist der Zeitpunkt des juengsten Punktes, den der Fall beim
 * Markieren hatte. Kommt spaeter ein neuerer dazu - eine neue Bestellung
 * desselben Kunden -, taucht der Fall wieder auf. Sonst verschwaende ein
 * abgehakter Kunde fuer immer aus der Arbeitsliste, auch wenn er morgen
 * wieder etwas bestellt.
 */
export function setzeMarke(datei, schluessel, { grund, bisPunkt = null, von = null, jetzt = new Date() } = {}) {
  const key = String(schluessel || '').trim();
  if (!key) throw new Error('Kein Fall angegeben');
  const eintraege = leseAlle(datei);
  if (grund === null || grund === undefined || grund === '') {
    delete eintraege[key];
    schreibAlle(datei, eintraege);
    return { schluessel: key, marke: null };
  }
  if (!FALL_GRUND.includes(grund)) throw new Error(`Unbekannter Grund: ${grund}`);
  const marke = { grund, zeit: jetzt.toISOString(), von: von || null, bisPunkt: bisPunkt || null };
  eintraege[key] = marke;
  schreibAlle(datei, eintraege);
  return { schluessel: key, marke };
}

/**
 * Gilt die Marke fuer diesen Fall noch? Nein, sobald der Fall einen Punkt
 * enthaelt, der neuer ist als der Stand beim Markieren.
 */
export function markeGilt(marke, fall) {
  if (!marke) return false;
  if (!marke.bisPunkt) return true;
  const neuester = (fall?.punkte ?? [])
    .map(p => p.datum)
    .filter(Boolean)
    .sort()
    .at(-1);
  return !neuester || neuester <= marke.bisPunkt;
}

/** Zeitpunkt des juengsten Punktes - der Stand, "bis" zu dem markiert wird. */
export function juengsterPunkt(fall) {
  return (fall?.punkte ?? []).map(p => p.datum).filter(Boolean).sort().at(-1) || null;
}

/**
 * Teilt die Faelle in sichtbare und ausgeblendete. Ausgeblendete verschwinden
 * nicht spurlos: sie stehen mit Grund in einem eigenen Abschnitt und lassen
 * sich zurueckholen.
 */
export function teileAuf(faelle, marken) {
  const sichtbar = [];
  const ausgeblendet = [];
  for (const f of faelle ?? []) {
    const marke = marken?.[f.schluessel];
    if (markeGilt(marke, f)) ausgeblendet.push({ ...f, marke });
    else sichtbar.push(f);
  }
  return { sichtbar, ausgeblendet };
}
