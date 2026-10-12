/**
 * Fehlermeldungen aus dem Control Center ("Fehler melden").
 *
 * Mitarbeiter melden im Teppich Dashboard, was nicht funktioniert. Die Technik
 * (Inhaber und Shop-Mitarbeiter) arbeitet aber in der Werkbank, einem
 * claude.ai-Artefakt, das dieser Server nicht erreicht. Ein geplanter
 * Claude-Lauf traegt neue Meldungen dort ein und meldet "behoben" zurueck
 * (operations/scripts/fehlermeldungen.mjs).
 *
 * Zwei Dateien mit je genau einem Schreiber, damit sich Server und Abgleich
 * nie gegenseitig eine Aenderung ueberschreiben:
 *   fehlermeldungen.json          schreibt nur der Server (neue Meldungen)
 *   fehlermeldungen-abgleich.json schreibt nur der Abgleich (Werkbank-Stand)
 * Gelesen wird immer beides zusammen.
 *
 * Rein lokal unter $TP_PRIVAT_DIR: der Text kann Kundennamen oder
 * Bestellnummern enthalten und gehoert nicht ins oeffentliche Repository.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const STATUS = Object.freeze(['neu', 'uebernommen', 'behoben', 'verworfen']);

/** Was der Melder sieht. "verworfen" heisst fuer ihn: angesehen, keine Aenderung noetig. */
export const STATUS_LABEL = Object.freeze({
  neu: 'Gemeldet',
  uebernommen: 'Bei der Technik',
  behoben: 'Behoben',
  verworfen: 'Geprüft, keine Änderung',
});

export const TEXT_MIN = 5;
export const TEXT_MAX = 2000;
const ORT_MAX = 120;
const TECHNIK_MAX = 600;
const ERGEBNIS_MAX = 500;

export class FehlermeldungFehler extends Error {}

function standardPrivatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function meldungenPfad(privatDir) {
  return path.join(privatDir || standardPrivatDir(), 'fehlermeldungen.json');
}

export function abgleichPfad(privatDir) {
  return path.join(privatDir || standardPrivatDir(), 'fehlermeldungen-abgleich.json');
}

/**
 * Fehlende Datei = noch nichts gemeldet. Eine kaputte Datei dagegen ist ein
 * Fehler: als "leer" gelesen, wuerde der naechste Schreibvorgang alle
 * bisherigen Meldungen still ueberschreiben.
 */
function lies(datei, feld) {
  let roh;
  try {
    roh = fs.readFileSync(datei, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return feld === 'meldungen' ? [] : {};
    throw e;
  }
  let daten;
  try { daten = JSON.parse(roh); } catch {
    throw new FehlermeldungFehler(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  const wert = daten?.[feld];
  if (feld === 'meldungen') return Array.isArray(wert) ? wert : [];
  return wert && typeof wert === 'object' && !Array.isArray(wert) ? wert : {};
}

function schreib(datei, feld, wert, jetzt) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ aktualisiertAm: jetzt.toISOString(), [feld]: wert }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, datei);
}

function kuerze(text, max) {
  const t = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function einzeilig(text, max) {
  return kuerze(String(text ?? '').replace(/\s+/g, ' '), max);
}

/** F-001, F-002 … - fortlaufend, damit am Telefon "Meldung 12" eindeutig ist. */
function naechsteId(meldungen) {
  const hoechste = meldungen.reduce((m, x) => Math.max(m, Number(/^F-(\d+)$/.exec(x?.id || '')?.[1]) || 0), 0);
  return `F-${String(hoechste + 1).padStart(3, '0')}`;
}

/**
 * Legt eine Meldung an. `von` kommt aus der Sitzung, nie aus der Anfrage.
 * Ein zweiter Klick auf "Melden" mit demselben Text innerhalb von zehn
 * Minuten legt keine Doppelung an, sondern liefert die erste zurueck.
 */
export function meldungAnlegen(datei, { text, ort = '', dringend = false, technik = {} } = {}, { von = null, jetzt = new Date() } = {}) {
  const sauber = kuerze(text, TEXT_MAX);
  if (sauber.length < TEXT_MIN) throw new FehlermeldungFehler('Bitte kurz beschreiben, was passiert ist.');
  const meldungen = lies(datei, 'meldungen');
  const wer = { name: einzeilig(von?.name || 'Inhaber', 60), kuerzel: einzeilig(von?.kuerzel || '', 30) || null };
  const doppelt = meldungen.find(m => m.text === sauber && (m.von?.kuerzel || null) === wer.kuerzel
    && jetzt - new Date(m.erstelltAm) < 10 * 60 * 1000);
  if (doppelt) return { meldung: doppelt, doppelt: true };
  const t = technik && typeof technik === 'object' ? technik : {};
  const meldung = {
    id: naechsteId(meldungen),
    erstelltAm: jetzt.toISOString(),
    von: wer,
    text: sauber,
    ort: einzeilig(ort, ORT_MAX),
    dringend: dringend === true,
    technik: {
      adresse: einzeilig(t.adresse, 200),
      browser: einzeilig(t.browser, 200),
      breite: Number.isFinite(Number(t.breite)) ? Math.round(Number(t.breite)) : null,
      fehler: (Array.isArray(t.fehler) ? t.fehler : []).slice(-3).map(f => einzeilig(f, TECHNIK_MAX)).filter(Boolean),
    },
  };
  meldungen.push(meldung);
  schreib(datei, 'meldungen', meldungen, jetzt);
  return { meldung, doppelt: false };
}

/** Meldungen mit ihrem Abgleich-Stand, neueste zuerst. */
export function alleMeldungen(meldungenDatei, abgleichDatei) {
  const abgleich = lies(abgleichDatei, 'stand');
  return lies(meldungenDatei, 'meldungen')
    .map(m => {
      const a = abgleich[m.id] || {};
      return {
        ...m,
        status: STATUS.includes(a.status) ? a.status : 'neu',
        werkbankId: a.werkbankId || null,
        uebernommenAm: a.uebernommenAm || null,
        erledigtAm: a.erledigtAm || null,
        ergebnis: a.ergebnis || '',
      };
    })
    .sort((x, y) => String(y.erstelltAm).localeCompare(String(x.erstelltAm)));
}

/**
 * Stand aus der Werkbank zuruecktragen. Nur der Abgleich ruft das.
 * Erlaubt ist jeder Wechsel ausser zurueck auf "neu": eine Meldung, die schon
 * in der Werkbank steht, darf nicht noch einmal angelegt werden.
 */
export function abgleichSetzen(meldungenDatei, abgleichDatei, id, { status, werkbankId = null, ergebnis = '' } = {}, { jetzt = new Date() } = {}) {
  if (!['uebernommen', 'behoben', 'verworfen'].includes(status)) throw new FehlermeldungFehler(`Unbekannter Status: ${status}`);
  if (!lies(meldungenDatei, 'meldungen').some(m => m.id === id)) throw new FehlermeldungFehler(`Meldung ${id} gibt es nicht`);
  const stand = lies(abgleichDatei, 'stand');
  const vorher = stand[id] || {};
  const wid = einzeilig(werkbankId || vorher.werkbankId || '', 60);
  if (!wid) throw new FehlermeldungFehler('Werkbank-Eintrag fehlt (--werkbank)');
  const neu = {
    status,
    werkbankId: wid,
    uebernommenAm: vorher.uebernommenAm || jetzt.toISOString(),
    erledigtAm: status === 'uebernommen' ? null : (vorher.status === status && vorher.erledigtAm ? vorher.erledigtAm : jetzt.toISOString()),
    ergebnis: status === 'uebernommen' ? '' : kuerze(ergebnis, ERGEBNIS_MAX),
  };
  stand[id] = neu;
  schreib(abgleichDatei, 'stand', stand, jetzt);
  return { id, ...neu };
}

const WERKBANK_OFFEN = ['idee', 'als-naechstes', 'in-arbeit', 'wartet-inhaber'];

/**
 * Welcher Stand folgt aus dem Werkbank-Eintrag? `null` = nichts zu aendern.
 * Erledigt -> behoben, verworfen -> verworfen ("Kein Fehler …" in der Werkbank),
 * wieder offen -> zurueck auf "Bei der Technik". Das Ergebnis kommt woertlich
 * aus der Werkbank, damit der Abgleich nichts umformulieren muss.
 */
export function standAusWerkbank(meldung, eintrag) {
  const ws = eintrag?.status;
  const ergebnis = String(eintrag?.ergebnis ?? '').trim();
  if (ws === 'erledigt') {
    const neu = { status: 'behoben', ergebnis: ergebnis || 'Behoben.' };
    return meldung.status === neu.status && meldung.ergebnis === kuerze(neu.ergebnis, ERGEBNIS_MAX) ? null : neu;
  }
  if (ws === 'verworfen') {
    const neu = { status: 'verworfen', ergebnis: ergebnis || 'Geprüft, keine Änderung nötig.' };
    return meldung.status === neu.status && meldung.ergebnis === kuerze(neu.ergebnis, ERGEBNIS_MAX) ? null : neu;
  }
  if (WERKBANK_OFFEN.includes(ws) && meldung.status !== 'uebernommen') return { status: 'uebernommen', ergebnis: '' };
  return null;
}

/** Was der Browser bekommt: der Inhaber sieht alle Meldungen, alle anderen nur ihre eigenen. */
export function sichtbareMeldungen(liste, benutzer) {
  const istInhaber = !benutzer || benutzer.rolle === 'inhaber';
  const eigene = istInhaber ? liste : liste.filter(m => m.von?.kuerzel && m.von.kuerzel === benutzer.kuerzel);
  return eigene.map(m => ({
    id: m.id, erstelltAm: m.erstelltAm, von: m.von?.name || '', text: m.text, ort: m.ort,
    dringend: m.dringend, status: m.status, statusLabel: STATUS_LABEL[m.status], ergebnis: m.ergebnis,
    erledigtAm: m.erledigtAm,
  }));
}
