/**
 * Lokaler Status je Rueckruf/Beratungsauftrag (Bereich Kunden / "Heute").
 *
 * Rein lokale Ablage unter $TP_PRIVAT_DIR/rueckrufe.json - nie im
 * Repository, nie auf GitHub Pages. Schluessel ist die Bestell-ID (ein
 * Rueckruf gehoert zum ganzen Auftrag, nicht zu einer einzelnen Position).
 * Seit 2026-11-06 auch "mail-<Mail-ID>": Rueckrufwunsch aus der Musterberatung
 * im Warenkorb, ohne Bestellung - der Eintrag traegt dann Name, Telefon und Muster selbst.
 *
 * Gleiche Bauart wie operations/lib/auftragsstatus.mjs: atomares Schreiben
 * (tmp-Datei + rename), "last write wins" je Schluessel.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * "nicht erreicht" ist am Telefon der Normalfall: zweimal geklingelt, niemand
 * da, morgen nochmal. Ohne diesen Zustand blieb nur die Wahl zwischen
 * "Angerufen" (verschwindet aus der Dringlichkeit, bleibt aber ewig offen)
 * und "Erledigt" (obwohl niemand erreicht wurde).
 */
export const RUECKRUF_STATUS = Object.freeze(['offen', 'nicht_erreicht', 'angerufen', 'erledigt']);

export const RUECKRUF_STATUS_LABEL = Object.freeze({
  offen: 'Offen',
  nicht_erreicht: 'Nicht erreicht',
  angerufen: 'Angerufen',
  erledigt: 'Erledigt',
});

export function rueckrufePfad(privatDir) {
  return path.join(privatDir || defaultPrivatDir(), 'rueckrufe.json');
}

function defaultPrivatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

/**
 * Liest die Statusdatei; fehlende Datei ist kein Fehler, sondern leerer Zustand.
 * Eine unlesbare oder beschaedigte Datei wirft, statt als leer zu gelten - sonst
 * ueberschriebe der naechste Klick alle anderen Rueckrufe.
 */
export function leseAlle(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return {};
    throw new Error(`${path.basename(file)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!text.trim()) return {};
  let raw;
  try { raw = JSON.parse(text); } catch {
    throw new Error(`${path.basename(file)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  return raw && typeof raw === 'object' && raw.eintraege && typeof raw.eintraege === 'object' ? raw.eintraege : {};
}

export function schreibeAlle(file, eintraege) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, eintraege }, null, 2));
  fs.renameSync(tmp, file);
}

export class RueckrufFehler extends Error {}

function clip(text, max) {
  const s = String(text ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Schluessel eines Rueckrufs aus einer Mail (Musterberatung im Warenkorb). Gehoert zu keiner
 * Bestellung; das Praefix haelt ihn von den Bestell-IDs getrennt, die Bestellliste und
 * "Heute" hier nachschlagen. Nur Zeichen, die in Adresse und data-Attribut unveraendert bleiben.
 */
export function mailRueckrufSchluessel(mailId) {
  const id = String(mailId ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100);
  if (!id) throw new RueckrufFehler('mailId ist Pflicht');
  return `mail-${id}`;
}

/** So lange gilt eine zweite Musterberatung derselben Person als dieselbe Anfrage (wie Service-Anfragen). */
export const MAIL_RUECKRUF_ZUSAMMEN_TAGE = 7;
/** Nur solange noch niemand mit dem Kunden gesprochen hat; nach "Angerufen" ist es eine neue Anfrage. */
const NOCH_NICHT_GESPROCHEN = ['offen', 'nicht_erreicht'];

/**
 * Derselbe Kunde hat schon einen offenen Rueckruf aus einer Mail (Doppelklick, zweites Geraet)?
 * Gleiche E-Mail oder Telefonnummer innerhalb von 7 Tagen - dieselbe Regel wie
 * aehnlicheAnfrage() bei den Service-Anfragen (operations/lib/serviceanfragen.mjs).
 */
export function offenerMailRueckruf(alle, { telefon, email, eingangAm }) {
  const mail = String(email || '').trim().toLowerCase();
  const tel = String(telefon || '').replace(/\D/g, '');
  const zeit = Date.parse(eingangAm);
  return Object.values(alle || {}).find(e => {
    if (e?.quelle !== 'mail' || !NOCH_NICHT_GESPROCHEN.includes(e.status)) return false;
    if (Math.abs(Date.parse(e.zuletztAm || e.eingangAm) - zeit) > MAIL_RUECKRUF_ZUSAMMEN_TAGE * 86_400_000) return false;
    if (mail && String(e.email || '').trim().toLowerCase() === mail) return true;
    return tel.length >= 6 && String(e.telefon || '').replace(/\D/g, '') === tel;
  }) || null;
}

/**
 * Legt einen Rueckruf aus einer Formular-Mail an (Postfach-Lauf, operations/scripts/serviceanfragen.mjs).
 * Gleiche Ablage und gleicher Statusweg wie die Rueckrufe aus Bestellungen: setzeStatus()
 * behaelt die Felder der Mail. Dieselbe Mail legt nie einen zweiten Eintrag an, und ein
 * schon bearbeiteter Eintrag wird nicht zurueckgesetzt.
 *
 * Schickt derselbe Kunde die Beratung ein zweites Mal (offenerMailRueckruf), wird der
 * vorhandene Eintrag ergaenzt statt ein zweiter angelegt: Musterliste und Text der neueren
 * Mail, `zuletztAm`, die Kennung unter `weitereMailIds`. Status, Notiz und Wiedervorlage
 * bleiben, das Alter zaehlt weiter ab der ersten Mail.
 *
 * @param {object} f  Ergebnis von rueckrufAusMail() plus mailId und eingangAm (ISO)
 * @returns {{eintrag: object, doppelt: boolean, zusammengefasst: boolean}}
 */
export function rueckrufAusMailAnlegen(file, f = {}, { actor, jetzt = new Date() } = {}) {
  if (!actor) throw new RueckrufFehler('actor ist Pflicht');
  const key = mailRueckrufSchluessel(f.mailId);
  const mailId = String(f.mailId).slice(0, 100);
  const telefon = clip(f.telefon, 40);
  const email = clip(f.email, 160);
  if (!telefon && !email) throw new RueckrufFehler('Rückruf ohne Telefon und E-Mail – niemand könnte zurückrufen');
  const alle = leseAlle(file);
  const schon = alle[key] || Object.values(alle).find(e => e?.quelle === 'mail' && (e.weitereMailIds || []).includes(mailId));
  if (schon) return { eintrag: schon, doppelt: true, zusammengefasst: false };
  const eingang = Date.parse(f.eingangAm) ? new Date(f.eingangAm).toISOString() : jetzt.toISOString();
  const muster = (Array.isArray(f.muster) ? f.muster : []).map(m => clip(m, 200)).filter(Boolean).slice(0, 30);
  const nachricht = clip(f.nachricht, 2000) || null;
  const vorhanden = offenerMailRueckruf(alle, { telefon, email, eingangAm: eingang });
  if (vorhanden) {
    // Die neuere Mail ist der letzte Stand des Kunden; die aeltere fuellt nur, was fehlt.
    const neuer = eingang >= (vorhanden.zuletztAm || vorhanden.eingangAm);
    const eintrag = {
      ...vorhanden,
      muster: neuer && muster.length ? muster : vorhanden.muster,
      nachricht: neuer && nachricht ? nachricht : vorhanden.nachricht || nachricht,
      kundenname: vorhanden.kundenname || clip(f.name, 120) || null,
      telefon: vorhanden.telefon || telefon || null,
      email: vorhanden.email || email || null,
      eingangAm: eingang < vorhanden.eingangAm ? eingang : vorhanden.eingangAm,
      zuletztAm: [eingang, vorhanden.zuletztAm || vorhanden.eingangAm].sort().at(-1),
      weitereMailIds: [...(vorhanden.weitereMailIds || []), mailId].slice(-20),
    };
    alle[vorhanden.orderId] = eintrag;
    schreibeAlle(file, alle);
    return { eintrag, doppelt: false, zusammengefasst: true };
  }
  const eintrag = {
    orderId: key, quelle: 'mail', mailId, thema: 'Musterberatung',
    eingangAm: eingang, kundenname: clip(f.name, 120) || null, telefon: telefon || null, email: email || null,
    muster, nachricht,
    status: 'offen', erstelltAm: jetzt.toISOString(), erstelltVon: actor,
  };
  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return { eintrag, doppelt: false, zusammengefasst: false };
}

/**
 * Setzt den Status eines Rueckrufs und schreibt sofort.
 *
 * @param {string} file
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.status    einer aus RUECKRUF_STATUS
 * @param {string} p.actor     wer die Aktion ausgeloest hat
 * @param {string} [p.notiz]
 * @param {string} [p.wiedervorlage]  YYYY-MM-DD: wann nochmal versuchen
 * @param {Date}   [p.jetzt]
 */
export function setzeStatus(file, { orderId, status, actor, notiz = null, wiedervorlage = null, jetzt = new Date() } = {}) {
  const key = String(orderId ?? '').trim();
  if (!key) throw new RueckrufFehler('orderId ist Pflicht');
  if (!RUECKRUF_STATUS.includes(status)) throw new RueckrufFehler(`Unbekannter Status "${status}"`);
  if (!actor) throw new RueckrufFehler('actor ist Pflicht');
  if (wiedervorlage && !/^\d{4}-\d{2}-\d{2}$/.test(String(wiedervorlage))) {
    throw new RueckrufFehler('Wiedervorlage braucht ein Datum im Format JJJJ-MM-TT');
  }

  const alle = leseAlle(file);
  const bisher = alle[key] || {};
  const zeit = jetzt.toISOString();
  const eintrag = {
    ...bisher,
    orderId: key,
    status,
    aktualisiertAm: zeit,
    aktualisiertVon: actor,
    [`${status}Am`]: zeit,
    [`${status}Von`]: actor,
  };
  if (notiz !== null) eintrag.notiz = clip(notiz, 2000);
  // Ein erledigter Vorgang braucht keine Wiedervorlage mehr.
  if (status === 'erledigt') eintrag.wiedervorlage = null;
  else if (wiedervorlage !== null) eintrag.wiedervorlage = wiedervorlage || null;

  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}
