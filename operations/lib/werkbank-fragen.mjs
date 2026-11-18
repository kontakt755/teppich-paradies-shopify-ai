/**
 * Fragen von Claude zu Werkbank-Aufgaben ("Fragebogen" im Control Center).
 *
 * Kommt ein Claude-Lauf bei einer Werkbank-Aufgabe nicht weiter, legt er eine
 * Frage an (scripts/werkbank-frage.mjs neu). Der Benutzer beantwortet sie unter
 * "Entscheidungen"; der naechste Lauf holt die Antwort ab (beantwortet) und
 * meldet sie als uebernommen.
 *
 * Rein lokal unter $TP_PRIVAT_DIR: Werkbank-Inhalte sind privat und gehoeren
 * nicht ins oeffentliche Repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export class WerkbankFrageFehler extends Error {}

const FRAGE_MAX = 600;
const TITEL_MAX = 160;
const LABEL_MAX = 80;
const BESCHREIBUNG_MAX = 300;
const FREITEXT_MAX = 1000;

export function fragenPfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'werkbank-fragen.json');
}

/** Fehlende Datei = noch keine Frage. Kaputtes JSON ist ein Fehler, sonst ueberschriebe der naechste Schreibvorgang alles. */
export function leseFragen(datei) {
  let roh;
  try { roh = fs.readFileSync(datei, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  let daten;
  try { daten = JSON.parse(roh); } catch {
    throw new WerkbankFrageFehler(`${path.basename(datei)} ist beschädigt – bitte aus der Sicherung holen`);
  }
  return Array.isArray(daten?.fragen) ? daten.fragen : [];
}

// shortcut: zwei Schreiber (Claude-Lauf, Server) lesen kurz vor dem Schreiben neu; ein gleichzeitiger
// Schreibvorgang in derselben Millisekunde koennte verloren gehen - bei Bedarf Sperrdatei ergaenzen.
function schreib(datei, fragen, jetzt) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ aktualisiertAm: jetzt.toISOString(), fragen }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, datei);
}

const text = (wert, max) => {
  const t = String(wert ?? '').replace(/\r\n?/g, '\n').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Legt eine Frage an und gibt sie zurueck. Dieselbe offene Frage zur selben Aufgabe wird nicht doppelt angelegt. */
export function frageAnlegen(datei, eingabe = {}, { jetzt = new Date() } = {}) {
  const werkbankId = text(eingabe.werkbankId, 20);
  if (!/^w-\d+$/.test(werkbankId)) throw new WerkbankFrageFehler('werkbankId fehlt oder hat nicht die Form w-123');
  const frage = text(eingabe.frage, FRAGE_MAX);
  if (frage.length < 5) throw new WerkbankFrageFehler('frage fehlt');
  const optionen = (Array.isArray(eingabe.optionen) ? eingabe.optionen : [])
    .map(o => ({ label: text(o?.label, LABEL_MAX), beschreibung: text(o?.beschreibung, BESCHREIBUNG_MAX) }))
    .filter(o => o.label);
  if (optionen.length < 2 || optionen.length > 4) throw new WerkbankFrageFehler('2 bis 4 Optionen mit label nötig');
  if (new Set(optionen.map(o => o.label)).size !== optionen.length) throw new WerkbankFrageFehler('Optionen brauchen verschiedene Labels');
  const empfehlung = text(eingabe.empfehlung ?? optionen[0].label, LABEL_MAX);
  if (!optionen.some(o => o.label === empfehlung)) throw new WerkbankFrageFehler('empfehlung muss eines der Options-Labels sein');
  // Empfehlung zuerst, damit sie auch im Control Center oben steht.
  optionen.sort((a, b) => (b.label === empfehlung) - (a.label === empfehlung));

  const fragen = leseFragen(datei);
  const doppelt = fragen.find(f => f.werkbankId === werkbankId && f.frage === frage && !f.antwort);
  if (doppelt) return { frage: doppelt, doppelt: true };
  const n = fragen.filter(f => f.werkbankId === werkbankId).length + 1;
  const neu = {
    id: `q-${werkbankId}-${n}`,
    werkbankId,
    titel: text(eingabe.titel, TITEL_MAX),
    frage,
    optionen,
    empfehlung,
    freitextErlaubt: eingabe.freitextErlaubt === true,
    gestellt: jetzt.toISOString(),
    antwort: null,
    uebernommen: null,
  };
  fragen.push(neu);
  schreib(datei, fragen, jetzt);
  return { frage: neu, doppelt: false };
}

/** Antwort aus dem Control Center. `von` kommt aus der Sitzung, nie aus der Anfrage. */
export function frageBeantworten(datei, { id, label, freitext = '' } = {}, { von = 'Inhaber', jetzt = new Date() } = {}) {
  const fragen = leseFragen(datei);
  const f = fragen.find(x => x.id === id);
  if (!f) throw new WerkbankFrageFehler('Frage nicht gefunden');
  if (f.antwort) throw new WerkbankFrageFehler('Diese Frage ist schon beantwortet.');
  const frei = text(freitext, FREITEXT_MAX);
  const gewaehlt = String(label || '');
  if (gewaehlt && !f.optionen.some(o => o.label === gewaehlt)) throw new WerkbankFrageFehler('Unbekannte Option');
  if (frei && !f.freitextErlaubt) throw new WerkbankFrageFehler('Freitext ist bei dieser Frage nicht vorgesehen.');
  if (!gewaehlt && !frei) throw new WerkbankFrageFehler('Bitte eine Option wählen.');
  f.antwort = { label: gewaehlt || null, freitext: frei || null, von: text(von, 60) || 'Inhaber', am: jetzt.toISOString() };
  schreib(datei, fragen, jetzt);
  return f;
}

export function frageUebernommen(datei, id, { jetzt = new Date() } = {}) {
  const fragen = leseFragen(datei);
  const f = fragen.find(x => x.id === id);
  if (!f) throw new WerkbankFrageFehler(`Frage ${id} nicht gefunden`);
  if (!f.antwort) throw new WerkbankFrageFehler(`Frage ${id} ist noch nicht beantwortet`);
  if (!f.uebernommen) { f.uebernommen = jetzt.toISOString(); schreib(datei, fragen, jetzt); }
  return f;
}

export const offeneFragen = fragen => fragen.filter(f => !f.antwort);
export const beantworteteFragen = fragen => fragen.filter(f => f.antwort && !f.uebernommen);

/** Fuer das Control Center: alle offenen (aelteste zuerst) und die 10 zuletzt beantworteten. */
export function fragenUebersicht(fragen) {
  const offen = offeneFragen(fragen).sort((a, b) => String(a.gestellt).localeCompare(String(b.gestellt)));
  const beantwortet = fragen.filter(f => f.antwort)
    .sort((a, b) => String(b.antwort.am).localeCompare(String(a.antwort.am))).slice(0, 10);
  return { offen, beantwortet };
}
