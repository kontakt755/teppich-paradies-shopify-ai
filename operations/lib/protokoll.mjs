/**
 * Schlankes lokales Aktivitaetsprotokoll fuer das Control Center.
 *
 * $TP_PRIVAT_DIR/protokoll.jsonl - ein JSON-Objekt je Zeile (Zeitpunkt,
 * Benutzer, Aktion, Objekt). Nie im Repo, nie auf GitHub. Dient nur der
 * Anzeige "Wer hat was gemacht" im Control Center (letzte 50 Eintraege).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function protokollPfad() {
  return path.join(privatDir(), 'protokoll.jsonl');
}

const MAX_TEXT = 500;
function clip(s) {
  const t = String(s ?? '');
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}…` : t;
}

/** Haengt einen Eintrag an - best effort, wirft nie (Protokoll darf keine Aktion blockieren). */
export function protokolliere(file, { benutzer, aktion, objekt = null, jetzt = new Date() } = {}) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const zeile = JSON.stringify({
      zeitpunkt: jetzt.toISOString(),
      benutzer: clip(benutzer || 'unbekannt'),
      aktion: clip(aktion || ''),
      objekt: objekt ? clip(objekt) : null,
    });
    fs.appendFileSync(file, `${zeile}\n`, { mode: 0o600 });
  } catch {
    // Protokoll ist eine Zusatzanzeige, kein Blocker fuer die eigentliche Aktion.
  }
}

/** Liest die letzten `limit` Eintraege (neueste zuerst). Fehlende Datei -> leere Liste. */
export function letzteEintraege(file, limit = 50) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const zeilen = raw.split('\n').filter(Boolean);
    const eintraege = [];
    for (const z of zeilen.slice(-limit * 4)) { // Puffer fuer kaputte Zeilen
      try { eintraege.push(JSON.parse(z)); } catch { /* Zeile ueberspringen */ }
    }
    return eintraege.slice(-limit).reverse();
  } catch {
    return [];
  }
}
