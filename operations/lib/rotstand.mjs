/**
 * Vortagesstand der roten Probleme auf "Heute" (#2241, Ausbau "Seit gestern neu" aus #561).
 *
 * Die roten To-dos werden im Browser abgeleitet (lib/todos.mjs), ein Stand von gestern existierte
 * nirgends - ein alter Auftrag, der erst heute rot wurde, sah aus wie jedes andere Problem.
 * Diese Ablage merkt je Kalendertag (Berlin) die IDs aller To-dos, die an dem Tag rot gemeldet
 * wurden (Vereinigung: Inhaber und Mitarbeiter sehen verschiedene Ausschnitte). "Neu" ist, was
 * jetzt rot ist und am letzten frueheren Tag mit Eintrag nicht rot war. Ohne frueheren Tag ist
 * nichts neu - sonst stuende am ersten Tag alles als neu da.
 *
 * Nur lokal: $TP_PRIVAT_DIR/heute-rotstand.json (IDs enthalten Bestell-IDs, nie ins Repository).
 * Lesefehler-Regel wie operations/lib/muster-packen.mjs: nur eine fehlende Datei ist leer.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { kalendertag } from '../../docs/ai-dashboard/lib/kalendertage.mjs';

/** Eine Woche reicht: nach Wochenende und Feiertag vergleicht der Montag mit dem letzten Arbeitstag. */
const TAGE_BEHALTEN = 8;
const MAX_IDS = 500;

export class RotstandFehler extends Error {}

export function rotstandPfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'heute-rotstand.json');
}

export function leseRotstand(datei) {
  let inhalt;
  try {
    inhalt = fs.readFileSync(datei, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return { tage: {} };
    throw new Error(`${path.basename(datei)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!inhalt.trim()) return { tage: {} };
  let roh;
  try { roh = JSON.parse(inhalt); } catch {
    throw new Error(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  const tage = roh?.tage && typeof roh.tage === 'object' && !Array.isArray(roh.tage) ? roh.tage : null;
  if (!tage) throw new Error(`${path.basename(datei)} hat ein unbekanntes Format – bitte aus der Sicherung holen`);
  return { tage };
}

/**
 * Meldet die jetzt roten IDs fuer heute und liefert, was davon seit dem Vortag neu ist.
 * @returns {{ vortag: string|null, neu: string[] }}
 */
export function merkeRot(datei, ids, { jetzt = new Date() } = {}) {
  if (!Array.isArray(ids)) throw new RotstandFehler('ids fehlt');
  const rot = [...new Set(ids.filter(v => typeof v === 'string').map(v => v.trim()).filter(v => v && v.length <= 200))];
  if (rot.length > MAX_IDS) throw new RotstandFehler(`Höchstens ${MAX_IDS} Einträge`);
  const heute = kalendertag(jetzt);
  const stand = leseRotstand(datei);
  const bisher = Array.isArray(stand.tage[heute]) ? stand.tage[heute] : [];
  const dazu = rot.filter(id => !bisher.includes(id));
  if (dazu.length) {
    stand.tage[heute] = [...bisher, ...dazu];
    const behalten = Object.keys(stand.tage).sort().slice(-TAGE_BEHALTEN);
    const tage = Object.fromEntries(behalten.map(t => [t, stand.tage[t]]));
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    const tmp = `${datei}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ aktualisiertAm: jetzt.toISOString(), tage }, null, 2));
    fs.renameSync(tmp, datei);
  }
  const vortag = Object.keys(stand.tage).filter(t => t < heute).sort().pop() || null;
  if (!vortag) return { vortag: null, neu: [] };
  const gestern = new Set(stand.tage[vortag]);
  return { vortag, neu: rot.filter(id => !gestern.has(id)) };
}
