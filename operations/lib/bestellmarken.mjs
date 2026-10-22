/**
 * Abgehakte Bestellungen in der Bestellliste (Kunden -> Bestellungen).
 *
 * Inhaberwunsch 2026-10-22: erledigte Bestellungen abhaken, damit sie in einen
 * eingeklappten Bereich "Erledigt" rutschen - gemeinsam fuer alle Mitarbeiter,
 * aber ohne Buchung in Shopify (dafuer gibt es "Kunde fertig").
 *
 * Rein lokale Ablage unter $TP_PRIVAT_DIR/bestellmarken.json, gleiche Bauart wie
 * operations/lib/fallmarken.mjs: atomares Schreiben, "last write wins" je Bestellung.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function bestellmarkenPfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'bestellmarken.json');
}

/** Fehlende Datei: noch nichts abgehakt. Beschaedigte Datei wirft - sonst kaemen alle Haken beim naechsten Schreiben zurueck. */
export function leseAlle(datei) {
  let text;
  try {
    text = fs.readFileSync(datei, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return {};
    throw new Error(`${path.basename(datei)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!text.trim()) return {};
  let roh;
  try { roh = JSON.parse(text); } catch {
    throw new Error(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  return roh && typeof roh === 'object' && roh.eintraege && typeof roh.eintraege === 'object' ? roh.eintraege : {};
}

/** Haken setzen (erledigt: true) oder zuruecknehmen (false). */
export function setzeHaken(datei, orderId, { erledigt, von = null, jetzt = new Date() } = {}) {
  const key = String(orderId || '').trim();
  if (!key || key.length > 200) throw new Error('Keine Bestellung angegeben');
  const eintraege = leseAlle(datei);
  if (erledigt) eintraege[key] = { zeit: jetzt.toISOString(), von: von || null };
  else delete eintraege[key];
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ aktualisiertAm: jetzt.toISOString(), eintraege }, null, 2));
  fs.renameSync(tmp, datei);
  return { orderId: key, abgehakt: eintraege[key] || null };
}
