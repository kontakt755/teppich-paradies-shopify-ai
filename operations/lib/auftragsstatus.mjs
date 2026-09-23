/**
 * Lokaler Auftragsfluss-Status je Bestellposition (Einkauf-Tab).
 *
 * Rein lokale Ablage unter $TP_PRIVAT_DIR/auftragsstatus.json - nie im
 * Repository, nie auf GitHub Pages. Schluessel ist orderId + lineItemId,
 * damit jede Position (nicht nur jeder Auftrag) einzeln durch den Ablauf
 * "Bestellt -> Geliefert an uns -> An Kunden raus -> Erledigt" laeuft.
 *
 * Schreiben ist atomar (tmp-Datei + rename) und schreibt bei jedem Aufruf
 * den ganzen Datensatz der Position neu - "last write wins" je Schluessel,
 * bewusst ohne Merge zwischen gleichzeitigen Schreibern auf denselben
 * Schluessel (siehe CLAUDE.md "Auftragsstatus").
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const STATUS_ORDER = Object.freeze(['bestellt', 'geliefert', 'raus', 'erledigt']);

export const STATUS_LABEL = Object.freeze({
  bestellt: 'Bestellt',
  geliefert: 'Geliefert an uns',
  raus: 'An Kunden raus',
  erledigt: 'Erledigt',
});

/** Filtergruppen fuer die Uebersicht: offen / bestellt / unterwegs / erledigt. */
export function filterGruppe(status) {
  if (!status) return 'offen';
  if (status === 'bestellt') return 'bestellt';
  if (status === 'geliefert' || status === 'raus') return 'unterwegs';
  if (status === 'erledigt') return 'erledigt';
  return 'offen';
}

export function positionKey(orderId, lineItemId) {
  const o = String(orderId ?? '').trim();
  const l = String(lineItemId ?? '').trim();
  if (!o || !l) return null;
  return `${o}::${l}`;
}

export function auftragsstatusPfad(privatDir) {
  return path.join(privatDir || defaultPrivatDir(), 'auftragsstatus.json');
}

function defaultPrivatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

/** Liest die Statusdatei; fehlende Datei ist kein Fehler, sondern leerer Zustand. */
export function leseAlle(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' && raw.positionen && typeof raw.positionen === 'object' ? raw.positionen : {};
  } catch {
    return {};
  }
}

/** Atomarer Schreibvorgang: tmp-Datei im selben Verzeichnis, dann rename. */
export function schreibeAlle(file, positionen) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, positionen }, null, 2));
  fs.renameSync(tmp, file);
}

export class AuftragsstatusFehler extends Error {}

/**
 * Setzt den Status einer Position und schreibt sofort. Gibt den neuen
 * Datensatz der Position zurueck.
 *
 * @param {string} file
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.lineItemId
 * @param {string} p.status          einer aus STATUS_ORDER
 * @param {string} p.actor           gh-Login, der die Aktion ausgeloest hat
 * @param {string} [p.lieferantBestellnummer]  Freitext, nur bei "bestellt" sinnvoll
 * @param {string} [p.notiz]
 * @param {Date}   [p.jetzt]
 */
export function setzeStatus(file, { orderId, lineItemId, status, actor, lieferantBestellnummer = null, notiz = null, jetzt = new Date() } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key) throw new AuftragsstatusFehler('orderId und lineItemId sind Pflicht');
  if (!STATUS_ORDER.includes(status)) throw new AuftragsstatusFehler(`Unbekannter Status "${status}"`);
  if (!actor) throw new AuftragsstatusFehler('actor (gh-Login) ist Pflicht');

  const alle = leseAlle(file);
  const bisher = alle[key] || {};
  const zeit = jetzt.toISOString();
  const eintrag = {
    ...bisher,
    orderId: String(orderId),
    lineItemId: String(lineItemId),
    status,
    aktualisiertAm: zeit,
    aktualisiertVon: actor,
    [`${status}Am`]: zeit,
    [`${status}Von`]: actor,
  };
  if (status === 'bestellt') {
    eintrag.lieferantBestellnummer = lieferantBestellnummer ? String(lieferantBestellnummer).trim() : (bisher.lieferantBestellnummer || null);
  }
  if (notiz) eintrag[`${status}Notiz`] = String(notiz).trim();

  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}
