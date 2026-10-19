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

// --- Postfach-Abgleich ----------------------------------------------------------

/**
 * Gibt es dieselbe Anfrage schon (von Hand erfasst, bevor der Abgleich lief)?
 * Gleiche E-Mail oder Telefonnummer innerhalb von 7 Tagen. Lieber eine Anfrage
 * einmal zu wenig automatisch anlegen als doppelt zaehlen.
 */
export function aehnlicheAnfrage(alle, felder) {
  const mail = String(felder.email || '').trim().toLowerCase();
  const tel = String(felder.telefon || '').replace(/\D/g, '');
  const tag = d => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  return alle.find(e => {
    if (Math.abs(tag(e.datum) - tag(felder.datum)) > 7) return false;
    if (mail && String(e.email || '').trim().toLowerCase() === mail) return true;
    return tel.length >= 6 && String(e.telefon || '').replace(/\D/g, '') === tel;
  }) || null;
}

/**
 * Gepruefte Mails ($TP_PRIVAT_DIR/serviceanfragen-postfach.json): schreibt nur
 * der Abgleich (operations/scripts/serviceanfragen.mjs), damit eine einmal
 * uebersprungene Mail (Musteranfrage, kein Service) nicht bei jedem Lauf neu
 * geholt wird. Angelegte Anfragen tragen ihre mailId selbst.
 */
export function postfachPfad(privatDir) {
  return path.join(path.dirname(serviceanfragenPfad(privatDir)), 'serviceanfragen-postfach.json');
}

export function leseGeprueft(datei) {
  let roh;
  try { roh = fs.readFileSync(datei, 'utf8'); } catch (e) {
    if (e?.code === 'ENOENT') return {};
    throw new Error(`${path.basename(datei)} ist nicht lesbar (${e?.code || e?.message})`);
  }
  if (!roh.trim()) return {};
  try { return JSON.parse(roh).geprueft || {}; } catch {
    throw new Error(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`);
  }
}

export function schreibeGeprueft(datei, geprueft) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, geprueft }, null, 2));
  fs.renameSync(tmp, datei);
}
