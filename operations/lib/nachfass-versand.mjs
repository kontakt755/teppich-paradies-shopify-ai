/**
 * Automatischer Versand "Muster nachfassen" (Inhaberentscheidung w-119, 2026-10-16, Option A):
 * Text 1 und die Erinnerung gehen vom Firmenpostfach raus, ohne Klick. Hier liegt alles, was
 * der Lauf an Ablage braucht - rein lokal unter $TP_PRIVAT_DIR/nachfassen/:
 *
 *   postfach.json    Zugang zum Firmenpostfach (Rechte 600; fehlt sie, wird nichts verschickt)
 *   stoppliste.json  Kunden, die mit "Abmelden" geantwortet haben - werden nie wieder angeschrieben
 *   versand.json     was wann an wen rausging (Stufe, Betreff, Kopie), letzter Lauf, erster Versand
 *   hinweise.json    Antworten mit mehr als "Abmelden" (Auszug fuers Control Center), letzter Postfach-Abgleich
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
export const HINWEISE_DATEI = 'hinweise.json';

/** In der ersten Woche nach dem ersten echten Versand geht jede Mail als Blindkopie ans Buero. */
export const MITLESEN_TAGE = 7;
/** Steht im Feld "von" der Zeitleiste, wenn der Lauf nachgefasst hat. */
export const AUTOMATISCH = 'automatisch';
/** Fuer {Name} in der Vorlage, wenn das Postfach keine eigene Unterschrift nennt. */
export const UNTERSCHRIFT_STANDARD = 'Ihr Team von Teppich Paradies';
/** So lange steht eine Kundenantwort als Hinweis im Control Center - im Postfach liegt sie ohnehin. */
export const HINWEIS_ZEIGEN_TAGE = 7;

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
export function hinweisePfad(privatDir) { return path.join(nachfassOrdner(privatDir), HINWEISE_DATEI); }

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

const istObjekt = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Alle Abmeldungen: { "<adresse klein>": { am, von, grund, orderId } }. Nur eine FEHLENDE Datei
 * ist leer. Alles andere, das nicht genau so aussieht, gilt als beschaedigt und stoppt den Lauf:
 * sonst schriebe er Abgemeldete wieder an und der naechste Eintrag ueberschriebe die Liste.
 */
export function leseStoppliste(file) {
  const roh = leseJson(file);
  if (roh === null && !fs.existsSync(file)) return {};
  const beschaedigt = () => new NachfassFehler(500, `${path.basename(file)} ist beschädigt – bitte aus der Sicherung holen`);
  if (!istObjekt(roh) || !istObjekt(roh.eintraege)) throw beschaedigt();
  const sauber = {};
  for (const [k, v] of Object.entries(roh.eintraege)) {
    if (!normAdresse(k).includes('@') || !istObjekt(v)) throw beschaedigt();
    sauber[normAdresse(k)] = v;
  }
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
// Hinweise aus dem Postfach-Abgleich
// ---------------------------------------------------------------------------

/** { abgleich: {am, fehler}|null, hinweise: [{mailId, am, email, orderId, orderName, auszug}] } */
export function leseHinweise(file) {
  const roh = leseJson(file);
  return {
    abgleich: roh?.abgleich && typeof roh.abgleich === 'object' ? roh.abgleich : null,
    hinweise: Array.isArray(roh?.hinweise) ? roh.hinweise : [],
  };
}

/**
 * Ergebnis des Abgleichs merken. Dieselbe Mail findet die Suche bei jedem Lauf wieder: ein
 * Hinweis kommt je Mail nur einmal, damit er nicht jeden Tag neu auftaucht.
 */
export function merkeAbgleich(file, { neu = [], fehler = null, jetzt = new Date() } = {}) {
  const alt = leseHinweise(file);
  const bekannt = new Set(alt.hinweise.map(h => h?.mailId));
  const dazu = neu.filter(h => !bekannt.has(h.mailId)).map(h => ({ ...h, am: jetzt.toISOString() }));
  // Bekannte Mails bleiben bis zum Ablauf der Suche in der Liste, sonst kaemen sie wieder.
  const hinweise = [...alt.hinweise, ...dazu].slice(-200);
  schreibeAtomar(file, { version: 1, abgleich: { am: jetzt.toISOString(), fehler: fehler ? String(fehler).slice(0, 200) : null }, hinweise });
  return dazu;
}

/** Fuer die Karte: nur die juengsten Hinweise, neueste zuerst. */
export function aktuelleHinweise(hinweise = [], { jetzt = new Date() } = {}) {
  return hinweise.filter(h => h?.am && jetzt.getTime() - new Date(h.am).getTime() < HINWEIS_ZEIGEN_TAGE * TAG_MS).reverse();
}

// ---------------------------------------------------------------------------
// Versandprotokoll
// ---------------------------------------------------------------------------

export const SENDUNG_STATUS = Object.freeze(['sendet', 'gesendet', 'vermerkt', 'fehler']);

/** { ersterVersandAm, letzterLauf, sendungen: [] } - fehlende Datei = noch nie gelaufen. */
export function leseVersand(file) {
  const roh = leseJson(file);
  // Ein leer gelesenes Protokoll hiesse: alle Nachfragen gehen ein zweites Mal raus.
  if ((roh === null && fs.existsSync(file)) || (roh !== null && (!istObjekt(roh) || !Array.isArray(roh.sendungen)))) {
    throw new NachfassFehler(500, `${path.basename(file)} ist beschädigt – bitte aus der Sicherung holen`);
  }
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
