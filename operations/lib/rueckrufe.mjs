/**
 * Lokaler Status je Rueckruf/Beratungsauftrag (Bereich Kunden / "Heute").
 *
 * Rein lokale Ablage unter $TP_PRIVAT_DIR/rueckrufe.json - nie im
 * Repository, nie auf GitHub Pages. Schluessel ist die Bestell-ID (ein
 * Rueckruf gehoert zum ganzen Auftrag, nicht zu einer einzelnen Position).
 *
 * Gleiche Bauart wie operations/lib/auftragsstatus.mjs: atomares Schreiben
 * (tmp-Datei + rename), "last write wins" je Schluessel.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const RUECKRUF_STATUS = Object.freeze(['offen', 'angerufen', 'erledigt']);

export const RUECKRUF_STATUS_LABEL = Object.freeze({
  offen: 'Offen',
  angerufen: 'Angerufen',
  erledigt: 'Erledigt',
});

export function rueckrufePfad(privatDir) {
  return path.join(privatDir || defaultPrivatDir(), 'rueckrufe.json');
}

function defaultPrivatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

/** Liest die Statusdatei; fehlende Datei ist kein Fehler, sondern leerer Zustand. */
export function leseAlle(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' && raw.eintraege && typeof raw.eintraege === 'object' ? raw.eintraege : {};
  } catch {
    return {};
  }
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
 * Setzt den Status eines Rueckrufs und schreibt sofort.
 *
 * @param {string} file
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.status    einer aus RUECKRUF_STATUS
 * @param {string} p.actor     gh-Login, der die Aktion ausgeloest hat
 * @param {string} [p.notiz]
 * @param {Date}   [p.jetzt]
 */
export function setzeStatus(file, { orderId, status, actor, notiz = null, jetzt = new Date() } = {}) {
  const key = String(orderId ?? '').trim();
  if (!key) throw new RueckrufFehler('orderId ist Pflicht');
  if (!RUECKRUF_STATUS.includes(status)) throw new RueckrufFehler(`Unbekannter Status "${status}"`);
  if (!actor) throw new RueckrufFehler('actor (gh-Login) ist Pflicht');

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

  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}
