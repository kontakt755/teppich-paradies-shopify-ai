/**
 * Lokaler Zustandsspeicher fuer Auftraege (append-only JSONL).
 *
 * ZWISCHENLOESUNG: solange der Shopify-Schreibzugriff nicht steht (Token #34,
 * D3), lebt der Auftragszustand nur hier. Sobald geschrieben werden darf,
 * spiegelt sync/orders.mjs writeOrderState dieselben Felder nach ops.*
 * (ops.status, ops.freigabe_von, ops.freigabe_am, ops.problem) - dieser
 * Speicher bleibt dann das lokale Audit-Log. Nicht jetzt umsetzen.
 *
 * Ablage: <repo>/.router/ops-state/auftraege.jsonl - gitignored (.router/),
 * damit keine Bestelldaten ins Repository geraten. Der Pfad ist fuer Tests
 * injizierbar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uebergangErlaubt, AUFTRAG_STATI } from '../lib/status.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const STANDARD_DATEI = path.join(REPO, '.router', 'ops-state', 'auftraege.jsonl');

function leer(wert) {
  return wert === null || wert === undefined || String(wert).trim() === '';
}

/** Eine JSONL-Zeile lesen. Defekte Zeilen liefern null und werden uebersprungen. */
function zeileLesen(text) {
  if (!text.trim()) return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  if (leer(j.auftrag) || leer(j.status) || leer(j.zeit)) return null;
  if (!AUFTRAG_STATI.includes(j.status)) return null;
  return j;
}

/**
 * Speicher an einer Datei.
 *
 * @param {string} [datei]
 * @returns {{datei:string, notiere:Function, stand:Function, alleStaende:Function, verlauf:Function, eintraege:Function}}
 */
export function erzeugeSpeicher(datei = STANDARD_DATEI) {
  const ziel = path.resolve(datei);

  function eintraege() {
    let roh;
    try { roh = fs.readFileSync(ziel, 'utf8'); } catch { return []; }
    const liste = [];
    for (const zeile of roh.split('\n')) {
      const e = zeileLesen(zeile);
      if (e) liste.push(e);
    }
    return liste;
  }

  function verlauf(auftrag) {
    return eintraege().filter(e => e.auftrag === auftrag);
  }

  function stand(auftrag) {
    const v = verlauf(auftrag);
    return v.length ? v[v.length - 1] : null;
  }

  function alleStaende() {
    const map = new Map();
    for (const e of eintraege()) map.set(e.auftrag, e);
    return map;
  }

  /**
   * Haengt einen Zustandseintrag an. Prueft den Uebergang gegen lib/status.mjs.
   *
   * @param {object} p
   * @param {string} p.auftrag  Bestellnummer, z. B. "#1847"
   * @param {string} p.status   Zielstatus aus AUFTRAG_STATUS
   * @param {string} p.von      Mitarbeitername
   * @param {string} [p.grund]
   * @param {string} [p.zeit]   ISO-Zeit, Standard jetzt
   */
  function notiere({ auftrag, status, von, grund = null, zeit = new Date().toISOString() } = {}) {
    if (leer(auftrag)) throw new Error('notiere: auftrag fehlt');
    if (leer(von)) throw new Error('notiere: von (Mitarbeitername) fehlt');
    if (!AUFTRAG_STATI.includes(status)) throw new Error(`notiere: unbekannter Status ${status}`);
    const vorher = stand(auftrag);
    if (vorher && !uebergangErlaubt(vorher.status, status)) {
      throw new Error(`Uebergang ${vorher.status} -> ${status} ist nicht erlaubt (${auftrag})`);
    }
    const eintrag = { auftrag: String(auftrag), status, von: String(von), grund: grund ? String(grund) : null, zeit, vorher: vorher ? vorher.status : null };
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.appendFileSync(ziel, JSON.stringify(eintrag) + '\n', 'utf8');
    return eintrag;
  }

  return { datei: ziel, notiere, stand, alleStaende, verlauf, eintraege };
}

const standard = erzeugeSpeicher();

export const notiere = standard.notiere;
export const stand = standard.stand;
export const alleStaende = standard.alleStaende;
export const verlauf = standard.verlauf;
