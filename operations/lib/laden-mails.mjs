/**
 * Mails fuer die Ansicht "Laden": nur lesender Abruf des Laden-Postfachs (gewoehnliches IMAP-Postfach
 * bei einem Hoster, kein Gmail). Das Hauptpostfach leitet per Filter dorthin weiter.
 *
 * Dateien unter $TP_PRIVAT_DIR, nie im Repository:
 *   laden-postfach.json  { host, port (993), benutzer, passwort }  - von Hand angelegt, chmod 600
 *   laden-mails.json     { abgerufenAm, eintraege, fehler }        - Zwischenspeicher, nie das Passwort
 *
 * Abruf: LOGIN, EXAMINE INBOX (muss [READ-ONLY] melden), UID SEARCH, UID FETCH mit BODY.PEEK, LOGOUT -
 * sonst nichts (kein STORE, COPY, EXPUNGE, APPEND): die Mails bleiben ungelesen und unveraendert.
 * Eintraege: ungelesene-Regel gibt es nicht, es zaehlt UNANSWERED der letzten 14 Tage.
 *
 * "Schon beantwortet": antwortet der Laden aus dem Hauptpostfach, sieht das Laden-Postfach das nicht.
 * Darum fragt der Abruf zusaetzlich (nur lesend, gleiche Sitzungsart wie imap-lesen.mjs mitNurLesen)
 * den Gmail-Ordner "Gesendet" nach Mails an die Absender und markiert solche Eintraege.
 * Scheitert das, bleibt der Abruf gueltig - nur ohne Markierung.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verbinde, imapText, ImapFehler, mitNurLesen } from './imap-lesen.mjs';
import { lesePostfach, ORDNER as NACHFASS_ORDNER, POSTFACH_DATEI as NACHFASS_DATEI } from './nachfass-versand.mjs';

export const MAILS_ZEITLIMIT_MS = 60_000;
const MONAT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BETREFF_MAX = 140;

export const ladenPostfachPfad = dir => path.join(dir, 'laden-postfach.json');
export const ladenMailsPfad = dir => path.join(dir, 'laden-mails.json');

/** Datei als JSON; fehlend -> null, beschaedigt oder unlesbar -> Fehler (nur ENOENT gilt als leer). */
function leseJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e?.code === 'ENOENT') return null;
    throw new Error(`${path.basename(file)} ist nicht lesbar (${e?.code || e?.message})`);
  }
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { throw new Error(`${path.basename(file)} ist beschädigt`); }
}

function schreibeJson(file, wert) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(wert, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Zugang des Laden-Postfachs: { fehlt } | { hinweis } | { zugang }. Das Passwort steht in keiner Meldung. */
export function leseLadenZugang(file) {
  let st;
  try { st = fs.statSync(file); } catch (e) {
    if (e?.code === 'ENOENT') return { fehlt: true };
    return { hinweis: 'Die Zugangsdatei des Laden-Postfachs ist nicht lesbar.' };
  }
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
    return { hinweis: 'Die Zugangsdatei des Laden-Postfachs ist für andere lesbar – bitte „chmod 600“ setzen. Bis dahin werden keine Mails abgerufen.' };
  }
  let roh;
  try { roh = leseJson(file); } catch { return { hinweis: 'Die Zugangsdatei des Laden-Postfachs ist beschädigt oder leer.' }; }
  const host = String(roh?.host ?? '').trim();
  const benutzer = String(roh?.benutzer ?? '').trim();
  const passwort = String(roh?.passwort ?? '');
  const port = roh?.port === undefined ? 993 : Number(roh.port);
  if (!host || !benutzer || !passwort || !(port > 0)) return { hinweis: 'In der Zugangsdatei des Laden-Postfachs fehlen Angaben (Server, Benutzer oder Passwort).' };
  return { zugang: { host, port, benutzer, passwort } };
}

/** Zwischenspeicher; fehlend -> null. */
export const leseMailCache = dir => leseJson(ladenMailsPfad(dir));

// ---------------------------------------------------------------- Kopfzeilen

/** "=?utf-8?B?...?=" und "=?iso-8859-1?Q?...?=" dekodieren; unbekannter Zeichensatz bleibt roh. */
export function dekodiereKopf(text) {
  const s = String(text ?? '').replace(/(=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[bBqQ]\?)/g, '$1');
  return s.replace(/=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g, (wort, cs, art, daten) => {
    try {
      const bytes = art.toLowerCase() === 'b'
        ? Buffer.from(daten, 'base64')
        : Buffer.from(daten.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
      return new TextDecoder(cs.replace(/\*.*$/, '')).decode(bytes);
    } catch { return wort; }
  });
}

/** Kopfzeilen als { kleinname: Wert }; gefaltete Zeilen werden zusammengezogen, die erste je Name gilt. */
export function kopfzeilen(roh) {
  const aus = {};
  for (const z of String(roh ?? '').replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(z);
    if (m && !(m[1].toLowerCase() in aus)) aus[m[1].toLowerCase()] = m[2].trim();
  }
  return aus;
}

/** { name, adresse } aus einer From-Zeile; Anzeigename dekodiert, Adresse kleingeschrieben. */
export function absenderAusFrom(wert) {
  const text = String(wert ?? '');
  const adresse = (/<([^<>\s]+@[^<>\s]+)>/.exec(text) || /([^\s<>,;"()]+@[^\s<>,;"()]+)/.exec(text))?.[1]?.toLowerCase() || null;
  const name = dekodiereKopf(text.replace(/<[^>]*>/, '')).replace(/^\s*"?|"?\s*$/g, '').replace(/\\(.)/g, '$1').trim();
  return { name: name && name.toLowerCase() !== adresse ? name : null, adresse };
}

/** Empfaengeradressen einer To-Zeile (Anzeigenamen in Anfuehrungszeichen zaehlen nie). */
const empfaenger = wert => (String(wert ?? '').replace(/"(?:[^"\\]|\\.)*"/g, ' ').match(/[^\s<>,;()]+@[^\s<>,;()]+/g) || []).map(a => a.toLowerCase());

/** "11-Nov-2026 10:00:00 +0100" -> ISO (UTC); sonst null. */
export function internaldate(text) {
  const m = /^\s*(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d\d):(\d\d):(\d\d) ([+-])(\d\d)(\d\d)\s*$/.exec(String(text ?? ''));
  const mon = m ? MONAT.findIndex(x => x.toLowerCase() === m[2].toLowerCase()) : -1;
  if (!m || mon < 0) return null;
  const ms = Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]) - (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + +m[9]) * 60_000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const suchDatum = d => `${String(d.getUTCDate()).padStart(2, '0')}-${MONAT[d.getUTCMonth()]}-${d.getUTCFullYear()}`;

// ---------------------------------------------------------------- Abruf

const antwortOk = (a, was) => {
  if (a.status !== 'OK') throw new ImapFehler(`IMAP ${was}: ${a.status}`);
  return a;
};

/** Kopfdaten je FETCH-Antwort ({ aussen, literale }) zu Eintraegen; Schluessel aus der Message-ID. */
function eintraegeAus(antwort) {
  const aus = [];
  for (const e of antwort.eintraege) {
    if (!/^\* \d+ FETCH \(/i.test(e.aussen) || !e.literale[0]) continue;
    const uid = /\bUID (\d+)/i.exec(e.aussen)?.[1];
    const eingang = internaldate(/\bINTERNALDATE "([^"]*)"/i.exec(e.aussen)?.[1]);
    const k = kopfzeilen(e.literale[0].toString('utf8'));
    const von = absenderAusFrom(k.from);
    const betreff = dekodiereKopf(k.subject).replace(/\s+/g, ' ').trim().slice(0, BETREFF_MAX);
    const kennung = k['message-id'] || `${uid}:${eingang}`;
    aus.push({
      schluessel: `mail:${crypto.createHash('sha1').update(kennung).digest('hex').slice(0, 16)}`,
      von: von.name || von.adresse || 'Unbekannt', adresse: von.adresse,
      text: betreff || '(ohne Betreff)', seit: eingang,
    });
  }
  return aus;
}

/** Gmail "Gesendet" nur lesend: wann ging eine Mail an diese Adresse raus? Mutiert die Eintraege nicht. */
async function beantwortetMarkieren(eintraege, { hauptZugang, mitNurLesenFn, tage, verbindenHaupt }) {
  const adressen = [...new Set(eintraege.map(e => e.adresse).filter(a => a && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(a)))];
  if (!adressen.length) return eintraege;
  const gesendet = await mitNurLesenFn(hauptZugang, async s => {
    const uids = (await s.suche(`in:sent newer_than:${tage}d {${adressen.map(a => `to:${a}`).join(' ')}}`)).slice(-100);
    const aus = [];
    for (const uid of uids) {
      const k = kopfzeilen((await s.kopf(uid)).toString('utf8'));
      const am = new Date(k.date || '').getTime();
      if (Number.isFinite(am)) aus.push({ an: empfaenger(k.to), am });
    }
    return aus;
  }, { verbinden: verbindenHaupt });
  return eintraege.map((e) => {
    const nach = gesendet.filter(g => g.an.includes(e.adresse) && g.am >= new Date(e.seit).getTime()).map(g => g.am).sort((a, b) => a - b)[0];
    return nach === undefined ? e : { ...e, beantwortetAm: new Date(nach).toISOString() };
  });
}

/**
 * Holt die offenen Mails nur lesend. Ergebnis { eintraege, markierungFehler }; Abbruch wirft ImapFehler.
 * @param {object} zugang  { host, port, benutzer, passwort }
 * @param {object} [o]
 * @param {Function} [o.verbinden]      Verbindung des Laden-Postfachs (Tests: gefaelscht)
 * @param {object|null} [o.hauptZugang] Gmail-Zugang (lesePostfach().zugang) fuer die Markierung, sonst keine
 * @param {Function} [o.mitNurLesenFn]  Sitzung im Hauptpostfach (Standard: imap-lesen.mjs mitNurLesen)
 */
export async function abrufenNurLesend(zugang, { verbinden, jetzt = new Date(), tage = 14, max = 50, hauptZugang = null, mitNurLesenFn = mitNurLesen, verbindenHaupt } = {}) {
  const v = await verbinde({ host: zugang.host, port: zugang.port, verbinden, zeitLimitMs: MAILS_ZEITLIMIT_MS });
  let eintraege;
  try {
    const anmeldung = await v.befehl(`LOGIN ${imapText(zugang.benutzer)} ${imapText(zugang.passwort)}`);
    if (anmeldung.status !== 'OK') throw new ImapFehler('IMAP-Anmeldung abgelehnt');
    const geoeffnet = antwortOk(await v.befehl('EXAMINE INBOX'), 'EXAMINE');
    if (!/\[READ-ONLY\]/i.test(geoeffnet.text)) throw new ImapFehler('IMAP: Postfach nicht schreibgeschützt geöffnet – Abbruch');
    const seit = suchDatum(new Date(jetzt.getTime() - tage * 86_400_000));
    const gefunden = antwortOk(await v.befehl(`UID SEARCH SINCE ${seit} UNANSWERED UNDELETED`), 'SEARCH').zeilen
      .flatMap(z => (/^\* SEARCH(?: (.*))?$/i.exec(z)?.[1] || '').split(/\s+/).filter(u => /^\d+$/.test(u)).map(Number));
    const uids = [...new Set(gefunden)].sort((a, b) => a - b).slice(-max);
    eintraege = uids.length
      ? eintraegeAus(antwortOk(await v.befehl(`UID FETCH ${uids.join(',')} (UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID)])`), 'FETCH'))
      : [];
  } finally {
    await v.schliessen();
  }
  eintraege.sort((a, b) => String(b.seit).localeCompare(String(a.seit)));
  if (!hauptZugang || !eintraege.length) return { eintraege, markierungFehler: null };
  try {
    return { eintraege: await beantwortetMarkieren(eintraege, { hauptZugang, mitNurLesenFn, tage, verbindenHaupt }), markierungFehler: null };
  } catch (e) {
    return { eintraege, markierungFehler: String(e?.message || e).slice(0, 80) };
  }
}

/** Kurze Meldung fuer die Ansicht: kein Serverwortlaut, nie das Passwort. */
export function abrufFehlerText(e) {
  const m = String(e?.message || '');
  if (/Anmeldung/.test(m)) return 'Das Laden-Postfach hat die Anmeldung abgelehnt. Bitte Benutzer und Passwort prüfen.';
  if (/schreibgesch/.test(m)) return 'Das Laden-Postfach ließ sich nicht nur lesend öffnen. Aus Sicherheitsgründen werden keine Mails abgerufen.';
  return 'Das Laden-Postfach konnte nicht abgerufen werden. Es wird in ein paar Minuten noch einmal versucht.';
}

/**
 * Ein Abruf samt Zwischenspeicher. Wirft nie: ein Fehler steht als `fehler` im Zwischenspeicher, die
 * bisherigen Eintraege bleiben stehen. Der Zwischenspeicher enthaelt nur Eintraege, nie den Zugang.
 */
export async function abrufenUndSpeichern(dir, { jetzt = new Date(), abrufen = abrufenNurLesend, ...o } = {}) {
  const datei = ladenMailsPfad(dir);
  let alt = null;
  try { alt = leseMailCache(dir); } catch { /* beschaedigter Zwischenspeicher wird ersetzt */ }
  let stand;
  try {
    const z = leseLadenZugang(ladenPostfachPfad(dir));
    if (!z.zugang) throw new ImapFehler(z.hinweis || 'nicht eingerichtet');
    const haupt = lesePostfach(path.join(dir, NACHFASS_ORDNER, NACHFASS_DATEI));
    const r = await abrufen(z.zugang, { jetzt, hauptZugang: haupt.zugang || null, ...o });
    stand = { abgerufenAm: jetzt.toISOString(), eintraege: r.eintraege, fehler: null };
  } catch (e) {
    stand = { abgerufenAm: jetzt.toISOString(), eintraege: alt?.eintraege || [], fehler: abrufFehlerText(e) };
  }
  try { schreibeJson(datei, stand); } catch { /* Ablage nicht schreibbar: naechster Aufruf versucht es wieder */ }
  return stand;
}
