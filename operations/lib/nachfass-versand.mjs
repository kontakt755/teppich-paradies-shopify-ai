/**
 * Automatischer Versand "Muster nachfassen" (Inhaberentscheidung w-119, 2026-10-16, Option A):
 * Text 1 und die Erinnerung gehen vom Firmenpostfach raus, ohne Klick. Hier liegt alles, was
 * der Lauf an Ablage braucht - rein lokal unter $TP_PRIVAT_DIR/nachfassen/:
 *
 *   postfach.json    Zugang zum Firmenpostfach (Rechte 600; fehlt sie, wird nichts verschickt)
 *   stoppliste.json  Kunden, die mit "Abmelden" geantwortet haben - werden nie wieder angeschrieben
 *   versand.json     was wann an wen rausging (Stufe, Betreff, Kopie), letzter Lauf, erster Versand
 *
 * Wer dran ist, rechnet weiterhin docs/ai-dashboard/lib/muster-nachfassen.mjs aus den
 * Bestellzeilen; der Lauf selbst steht in scripts/dashboard-api.mjs (kundenNachfassenSenden)
 * und wird von scripts/muster-nachfassen-senden.mjs taeglich aufgerufen.
 *
 * Lesen wie ueberall im Control Center: nur eine FEHLENDE Datei ist leer, eine beschaedigte
 * wirft - sonst schriebe der naechste Lauf eine Stoppliste mit genau einem Eintrag und
 * schriebe allen anderen wieder.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adresse } from './smtp.mjs';

export const ORDNER = 'nachfassen';
export const POSTFACH_DATEI = 'postfach.json';
export const STOPPLISTE_DATEI = 'stoppliste.json';
export const VERSAND_DATEI = 'versand.json';

/** In der ersten Woche nach dem ersten echten Versand geht jede Mail als Blindkopie ans Buero. */
export const MITLESEN_TAGE = 7;
/** Steht im Feld "von" der Zeitleiste, wenn der Lauf nachgefasst hat. */
export const AUTOMATISCH = 'automatisch';
/** Fuer {Name} in der Vorlage, wenn das Postfach keine eigene Unterschrift nennt. */
export const UNTERSCHRIFT_STANDARD = 'Ihr Team von Teppich Paradies';

const TAG_MS = 86400000;

export class NachfassFehler extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function standardPrivatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function nachfassOrdner(privatDir) {
  return path.join(privatDir || standardPrivatDir(), ORDNER);
}
export function postfachPfad(privatDir) { return path.join(nachfassOrdner(privatDir), POSTFACH_DATEI); }
export function stopplistePfad(privatDir) { return path.join(nachfassOrdner(privatDir), STOPPLISTE_DATEI); }
export function versandPfad(privatDir) { return path.join(nachfassOrdner(privatDir), VERSAND_DATEI); }

function schreibeAtomar(file, daten) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(daten, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** JSON-Datei lesen: fehlend/leer -> null, beschaedigt -> NachfassFehler(500). */
function leseJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e?.code === 'ENOENT') return null;
    throw new NachfassFehler(500, `${path.basename(file)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch {
    throw new NachfassFehler(500, `${path.basename(file)} ist beschädigt – bitte aus der Sicherung holen`);
  }
}

// ---------------------------------------------------------------------------
// Postfach
// ---------------------------------------------------------------------------

/**
 * Zugang zum Firmenpostfach. Format (alles Pflicht ausser den letzten vier):
 *   {
 *     "host": "mail.example.invalid", "port": 465, "sicherheit": "tls",   // oder 587 + "starttls"
 *     "benutzer": "kontakt@…", "passwort": "…",
 *     "absender": "kontakt@…",                 // Adresse, von der die Mail kommt (und Antworten ankommen)
 *     "absenderName": "Teppich Paradies",      // Anzeigename
 *     "unterschrift": "Ihr Team von Teppich Paradies",   // ersetzt {Name} in der Vorlage
 *     "kopie": "kontakt@…",                    // Blindkopie in der ersten Woche (Standard: absender; false = nie)
 *     "kopieImmer": false                      // true: dauerhaft mitlesen
 *   }
 * Die Datei legt der Inhaber an (chmod 600). Nur er kennt das Passwort; es steht nie im Repository.
 *
 * @returns {{ zugang: object }|{ fehlt: true, hinweis: string }|{ hinweis: string }}
 */
export function lesePostfach(file) {
  let st;
  try { st = fs.statSync(file); } catch (e) {
    if (e?.code === 'ENOENT') return { fehlt: true, hinweis: `Automatischer Versand nicht eingerichtet: ${ORDNER}/${POSTFACH_DATEI} im Privatordner fehlt.` };
    return { hinweis: `${POSTFACH_DATEI} ist nicht lesbar (${e?.code || e?.message}).` };
  }
  // Rechte: nur der Benutzer selbst darf lesen - das Passwort des Firmenpostfachs steht darin.
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
    return { hinweis: `${ORDNER}/${POSTFACH_DATEI} ist für andere lesbar – bitte „chmod 600“ setzen. Bis dahin wird nichts verschickt.` };
  }
  let roh;
  try { roh = leseJson(file); } catch (e) { return { hinweis: e.message }; }
  if (!roh || typeof roh !== 'object') return { hinweis: `${POSTFACH_DATEI} ist leer.` };
  const port = Number(roh.port);
  const absender = adresse(roh.absender) || adresse(roh.benutzer);
  const fehlend = [
    !String(roh.host ?? '').trim() && 'host', !(port > 0) && 'port',
    !String(roh.benutzer ?? '').trim() && 'benutzer', !String(roh.passwort ?? '').trim() && 'passwort',
    !absender && 'absender',
  ].filter(Boolean);
  if (fehlend.length) return { hinweis: `${POSTFACH_DATEI}: es fehlt ${fehlend.join(', ')}.` };
  const sicherheit = roh.sicherheit || (port === 465 ? 'tls' : 'starttls');
  if (!['tls', 'starttls', 'keine'].includes(sicherheit)) return { hinweis: `${POSTFACH_DATEI}: sicherheit muss tls oder starttls sein.` };
  // "kopie": false schaltet die Blindkopie ganz ab (Inhaber 2026-10-19) - auch in der ersten Woche.
  const kopie = roh.kopie === false ? null : (adresse(roh.kopie) || absender);
  return {
    zugang: {
      host: String(roh.host).trim(), port, sicherheit,
      benutzer: String(roh.benutzer).trim(), passwort: String(roh.passwort),
      absender, absenderName: String(roh.absenderName ?? 'Teppich Paradies').trim() || 'Teppich Paradies',
      unterschrift: String(roh.unterschrift ?? '').trim() || UNTERSCHRIFT_STANDARD,
      kopie, kopieImmer: roh.kopieImmer === true,
    },
  };
}

// ---------------------------------------------------------------------------
// Stoppliste
// ---------------------------------------------------------------------------

export const normAdresse = e => String(e ?? '').trim().toLowerCase();

/** Alle Abmeldungen: { "<adresse klein>": { am, von, grund, orderId } }. */
export function leseStoppliste(file) {
  const roh = leseJson(file);
  const e = roh && typeof roh === 'object' && roh.eintraege && typeof roh.eintraege === 'object' ? roh.eintraege : {};
  const sauber = {};
  for (const [k, v] of Object.entries(e)) if (normAdresse(k) && v && typeof v === 'object') sauber[normAdresse(k)] = v;
  return sauber;
}

/** Adresse -> Eintrag, wie musterNachfassen() es als `abgemeldet` erwartet. */
export function abgemeldeteAdressen(eintraege) {
  return new Map(Object.entries(eintraege || {}).map(([k, v]) => [k, { am: v.am || null, von: v.von || null }]));
}

/**
 * Abmeldung eintragen (Knopf "Abgemeldet" in der Karte oder spaeter ein Posteingangs-Abgleich).
 * Ein zweiter Eintrag derselben Adresse aendert nichts - die erste Abmeldung bleibt stehen.
 */
export function trageAbmeldungEin(file, { email, von, grund = 'Antwort „Abmelden“', orderId = null, jetzt = new Date() } = {}) {
  const adr = adresse(email);
  if (!adr) throw new NachfassFehler(400, 'Bitte eine gültige E-Mail-Adresse angeben');
  if (!String(von ?? '').trim()) throw new NachfassFehler(400, 'Wer die Abmeldung einträgt, fehlt');
  const alle = leseStoppliste(file);
  const key = normAdresse(adr);
  if (alle[key]) return { eintrag: alle[key], neu: false };
  const eintrag = { am: jetzt.toISOString(), von: String(von).trim().slice(0, 80), grund: String(grund || '').trim().slice(0, 200) || null, orderId: orderId ? String(orderId) : null };
  schreibeAtomar(file, { version: 1, eintraege: { ...alle, [key]: eintrag } });
  return { eintrag, neu: true };
}

// ---------------------------------------------------------------------------
// Versandprotokoll
// ---------------------------------------------------------------------------

export const SENDUNG_STATUS = Object.freeze(['sendet', 'gesendet', 'vermerkt', 'fehler']);

/** { ersterVersandAm, letzterLauf, sendungen: [] } - fehlende Datei = noch nie gelaufen. */
export function leseVersand(file) {
  const roh = leseJson(file);
  return {
    ersterVersandAm: roh?.ersterVersandAm || null,
    letzterLauf: roh?.letzterLauf && typeof roh.letzterLauf === 'object' ? roh.letzterLauf : null,
    sendungen: Array.isArray(roh?.sendungen) ? roh.sendungen : [],
  };
}

export function schreibeVersand(file, daten) {
  schreibeAtomar(file, { version: 1, ersterVersandAm: daten.ersterVersandAm || null, letzterLauf: daten.letzterLauf || null, sendungen: daten.sendungen || [] });
}

/**
 * Gab es diese Stufe fuer diese Bestellung schon (oder haengt sie mitten im Versand)?
 * Ein Lauf, der nach dem Senden abbrach, bevor die Zeitleiste geschrieben war, darf die Mail
 * nicht noch einmal schicken - er holt nur den Zeitleisten-Schritt nach.
 */
export function schonVerschickt(versand, orderId, stufe) {
  return (versand?.sendungen || []).find(s => s && String(s.orderId) === String(orderId) && s.stufe === stufe && ['sendet', 'gesendet', 'vermerkt'].includes(s.status)) || null;
}

/**
 * Blindkopie ans Buero? In der ersten Woche nach dem ersten echten Versand immer, danach nur
 * noch, wenn das Postfach "kopieImmer" sagt.
 */
export function kopieNoetig({ ersterVersandAm = null, jetzt = new Date(), immer = false } = {}) {
  if (immer) return true;
  if (!ersterVersandAm) return true;
  const t = new Date(ersterVersandAm).getTime();
  if (Number.isNaN(t)) return true;
  return jetzt.getTime() - t < MITLESEN_TAGE * TAG_MS;
}

/** Bis wann mitgelesen wird (fuer die Karte) - null, wenn die Woche vorbei ist und nicht dauerhaft mitgelesen wird. */
export function mitlesenBis({ ersterVersandAm = null, immer = false } = {}) {
  if (immer) return 'immer';
  if (!ersterVersandAm) return null;
  const t = new Date(ersterVersandAm).getTime();
  return Number.isNaN(t) ? null : new Date(t + MITLESEN_TAGE * TAG_MS).toISOString();
}

/**
 * Stand fuer die Karte "Muster nachfassen": eingerichtet?, Hinweis, letzter Lauf, Kopie bis.
 * Liest nur; eine beschaedigte Ablage wird zum Hinweis, nie zur Ausnahme.
 */
export function versandStand(privatDir, { jetzt = new Date() } = {}) {
  const pf = lesePostfach(postfachPfad(privatDir));
  let versand = null;
  let hinweis = pf.zugang ? null : pf.hinweis;
  try { versand = leseVersand(versandPfad(privatDir)); } catch (e) { hinweis = hinweis || e.message; }
  const bis = pf.zugang?.kopie ? mitlesenBis({ ersterVersandAm: versand?.ersterVersandAm, immer: pf.zugang.kopieImmer }) : null;
  return {
    eingerichtet: Boolean(pf.zugang),
    hinweis,
    letzterLauf: versand?.letzterLauf || null,
    mitlesenBis: bis && bis !== 'immer' && new Date(bis).getTime() <= jetzt.getTime() ? null : bis,
    kopie: pf.zugang ? pf.zugang.kopie : null,
  };
}
