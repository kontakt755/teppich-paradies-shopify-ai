/**
 * Ablage der Service-Anfragen (Verlegeservice, Treppe, Aufmass) - Kunden,
 * Reiter "Service-Anfragen" im Control Center.
 *
 * Rein lokal unter $TP_PRIVAT_DIR/serviceanfragen.json (Namen, Telefonnummern),
 * nie im Repository. Gleiche Bauart wie rueckrufe.mjs: atomares Schreiben,
 * nur eine FEHLENDE Datei gilt als leer - eine beschaedigte wirft, sonst
 * schriebe der naechste Klick eine Datei mit genau einem Eintrag.
 * Gesichert von `npm run daten:sichern` (SICHERUNGSPFADE).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pruefeFelder, STATUS_LABEL, ServiceanfrageFehler } from '../../docs/ai-dashboard/lib/serviceanfragen.mjs';

export { ServiceanfrageFehler };

const VERLAUF_MAX = 30;

export function serviceanfragenPfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'serviceanfragen.json');
}

export function leseAlle(datei) {
  let roh;
  try {
    roh = fs.readFileSync(datei, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return [];
    throw new Error(`${path.basename(datei)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!roh.trim()) return [];
  let daten;
  try { daten = JSON.parse(roh); } catch {
    throw new Error(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  return Array.isArray(daten?.eintraege) ? daten.eintraege : [];
}

function schreibeAlle(datei, eintraege) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, eintraege }, null, 2));
  fs.renameSync(tmp, datei);
}

function naechsteId(eintraege) {
  const hoechste = eintraege.reduce((max, e) => Math.max(max, Number(/^S-(\d+)$/.exec(e.id)?.[1] || 0)), 0);
  return `S-${String(hoechste + 1).padStart(3, '0')}`;
}

/**
 * Legt eine Anfrage an. Mit `mailId` (Gmail-Nachricht) wird dieselbe Mail
 * nur einmal uebernommen - ein spaeterer automatischer Abgleich kann also
 * gefahrlos mehrfach laufen.
 */
export function anlegen(datei, roh, { actor, jetzt = new Date() } = {}) {
  if (!actor) throw new ServiceanfrageFehler('actor ist Pflicht');
  const felder = pruefeFelder(roh);
  const alle = leseAlle(datei);
  if (felder.mailId) {
    const schon = alle.find(e => e.mailId === felder.mailId);
    if (schon) return { eintrag: schon, doppelt: true };
  }
  const zeit = jetzt.toISOString();
  const eintrag = {
    id: naechsteId(alle), ...felder,
    erstelltAm: zeit, erstelltVon: actor, aktualisiertAm: zeit, aktualisiertVon: actor,
    verlauf: [{ wann: zeit, wer: actor, was: `angelegt (${STATUS_LABEL[felder.status]})` }],
  };
  alle.push(eintrag);
  schreibeAlle(datei, alle);
  return { eintrag, doppelt: false };
}

/** Aendert die mitgeschickten Felder; ein Statuswechsel landet im Verlauf. */
export function aendern(datei, id, roh, { actor, jetzt = new Date() } = {}) {
  if (!actor) throw new ServiceanfrageFehler('actor ist Pflicht');
  const felder = pruefeFelder(roh, { teil: true });
  delete felder.mailId;
  const alle = leseAlle(datei);
  const i = alle.findIndex(e => e.id === id);
  if (i < 0) throw new ServiceanfrageFehler(`Anfrage ${id || '(ohne Nummer)'} gibt es nicht`);
  const bisher = alle[i];
  const neu = { ...bisher, ...felder };
  if (!neu.name && !neu.telefon && !neu.email) throw new ServiceanfrageFehler('Name, Telefon oder E-Mail – mindestens eins braucht es');
  const zeit = jetzt.toISOString();
  neu.aktualisiertAm = zeit;
  neu.aktualisiertVon = actor;
  if (felder.status && felder.status !== bisher.status) {
    neu.verlauf = [...(bisher.verlauf || []), { wann: zeit, wer: actor, was: `${STATUS_LABEL[bisher.status]} → ${STATUS_LABEL[felder.status]}` }].slice(-VERLAUF_MAX);
  }
  alle[i] = neu;
  schreibeAlle(datei, alle);
  return neu;
}
