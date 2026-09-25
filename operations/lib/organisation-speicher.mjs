/**
 * Ablage fuer Aufgaben und Notizen: eine JSON-Datei unter $TP_PRIVAT_DIR,
 * genau wie die uebrigen Betriebsdaten. Keine Datenbank - das Dashboard hat
 * keine, und fuer diese Groessenordnung waere sie nur Ballast.
 *
 * Geschrieben wird atomar (Temp-Datei + rename), damit ein abgebrochener
 * Schreibvorgang nie eine halbe Datei hinterlaesst.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { STANDARD_BEREICHE, STATUS, PRIORITAETEN, PRUEFTYPEN, TYPEN, naechsterTermin, faelligeWiederholungen } from './organisation.mjs';

export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function dateiPfad(dir = privatDir()) {
  return path.join(dir, 'organisation', 'eintraege.json');
}

export function anhangOrdner(dir = privatDir()) {
  return path.join(dir, 'organisation', 'anhaenge');
}

const LEER = { version: 1, bereiche: [...STANDARD_BEREICHE], eintraege: [] };

export function lies(datei = dateiPfad()) {
  try {
    const roh = JSON.parse(fs.readFileSync(datei, 'utf8'));
    return {
      version: roh.version ?? 1,
      bereiche: Array.isArray(roh.bereiche) && roh.bereiche.length ? roh.bereiche : [...STANDARD_BEREICHE],
      eintraege: Array.isArray(roh.eintraege) ? roh.eintraege : [],
    };
  } catch {
    return { ...LEER, bereiche: [...STANDARD_BEREICHE], eintraege: [] };
  }
}

export function schreib(daten, datei = dateiPfad()) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const temp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(daten, null, 2), { mode: 0o600 });
  fs.renameSync(temp, datei);
  return datei;
}

export function neueId() {
  return `tp-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function pruefeWert(wert, erlaubt, feld) {
  if (wert === null || wert === undefined) return null;
  if (!erlaubt.includes(wert)) throw new Error(`${feld}: "${wert}" ist nicht erlaubt`);
  return wert;
}

/** Neuer Eintrag. Pflicht ist nur der Titel - Erfassen muss in Sekunden gehen. */
export function baueEintrag(roh, { benutzer = null, jetzt = new Date() } = {}) {
  const titel = String(roh.titel || '').trim();
  if (!titel) throw new Error('Ohne Titel geht es nicht');
  const typ = pruefeWert(roh.typ, TYPEN, 'typ') || 'TASK';
  const wer = benutzer?.kuerzel || benutzer?.name || 'inhaber';
  const zeit = jetzt.toISOString();
  return {
    id: neueId(),
    typ,
    titel,
    beschreibung: String(roh.beschreibung || '').trim() || null,
    status: pruefeWert(roh.status, STATUS, 'status') || (typ === 'TASK' ? 'INBOX' : 'INBOX'),
    prioritaet: pruefeWert(roh.prioritaet, PRIORITAETEN, 'prioritaet') || 'NORMAL',
    bereich: roh.bereich || null,
    besitzer: wer,
    verantwortlich: roh.verantwortlich || null,
    // PRIVAT (nur ich), PERSONEN (ich + genannte), TEAM (alle Angemeldeten)
    sichtbarkeit: ['PRIVAT', 'PERSONEN', 'TEAM'].includes(roh.sichtbarkeit) ? roh.sichtbarkeit : (typ === 'NOTE' ? 'PRIVAT' : 'TEAM'),
    fuer: Array.isArray(roh.fuer) ? roh.fuer : [],
    faellig: roh.faellig || null,
    wartetAuf: roh.wartetAuf || null,
    wartetSeit: roh.status === 'WAITING' ? zeit : null,
    erfolgskriterium: String(roh.erfolgskriterium || '').trim() || null,
    pruefTyp: pruefeWert(roh.pruefTyp, PRUEFTYPEN, 'pruefTyp') || 'MANUAL',
    pruefung: roh.pruefung ?? null,          // {art, ziel, ...} fuer den Waechter
    verknuepft: roh.verknuepft ?? null,      // {art: 'produkt'|'kunde'|..., id, titel}
    wiederholung: roh.wiederholung ?? null,  // {regel, naechsteFaelligkeit, zuletztErzeugt}
    anhaenge: [],
    kommentare: [],
    verlauf: [{ zeit, wer, was: 'erstellt' }],
    pruefungen: [],
    erstelltAm: zeit,
    aktualisiertAm: zeit,
    erledigtAm: null,
  };
}

export function findeEintrag(daten, id) {
  return daten.eintraege.find(e => e.id === id) || null;
}

/** Aenderung samt Verlaufseintrag. Gibt den geaenderten Eintrag zurueck. */
export function aendere(eintrag, felder, { benutzer = null, jetzt = new Date() } = {}) {
  const wer = benutzer?.kuerzel || benutzer?.name || 'inhaber';
  const zeit = jetzt.toISOString();
  const LABEL = {
    // typ ist aenderbar, damit aus einer Notiz eine Aufgabe werden kann, ohne
    // Text, Kommentare und Verlauf zu verlieren.
    typ: 'Art', status: 'Status', prioritaet: 'Priorität', verantwortlich: 'Verantwortlich', faellig: 'Fälligkeit',
    bereich: 'Bereich', titel: 'Titel', beschreibung: 'Beschreibung', erfolgskriterium: 'Erfolgskriterium',
    pruefTyp: 'Prüfart', wartetAuf: 'Warten auf', sichtbarkeit: 'Sichtbarkeit',
  };
  for (const [feld, wert] of Object.entries(felder)) {
    if (!(feld in LABEL)) continue;
    if (eintrag[feld] === wert) continue;
    if (feld === 'typ') pruefeWert(wert, TYPEN, 'typ');
    if (feld === 'status') pruefeWert(wert, STATUS, 'status');
    if (feld === 'prioritaet') pruefeWert(wert, PRIORITAETEN, 'prioritaet');
    if (feld === 'pruefTyp') pruefeWert(wert, PRUEFTYPEN, 'pruefTyp');
    const vorher = eintrag[feld];
    eintrag[feld] = wert;
    eintrag.verlauf.push({ zeit, wer, was: `${LABEL[feld]} geändert`, von: vorher ?? null, zu: wert ?? null });
  }
  if (felder.status === 'WAITING' && !eintrag.wartetSeit) eintrag.wartetSeit = zeit;
  if (felder.status && felder.status !== 'WAITING') eintrag.wartetSeit = null;
  if (felder.status === 'DONE') {
    eintrag.erledigtAm = zeit;
    // Wiederkehrende Aufgabe: den naechsten Termin gleich festhalten, damit
    // der Waechter sie spaeter neu anlegen kann.
    if (eintrag.wiederholung?.regel) {
      eintrag.wiederholung.naechsteFaelligkeit = naechsterTermin(eintrag.wiederholung.regel, jetzt);
    }
  }
  if (felder.status && felder.status !== 'DONE' && eintrag.erledigtAm) {
    eintrag.erledigtAm = null;
    eintrag.verlauf.push({ zeit, wer, was: 'wieder geöffnet' });
  }
  eintrag.aktualisiertAm = zeit;
  return eintrag;
}

export function kommentiere(eintrag, text, { benutzer = null, jetzt = new Date() } = {}) {
  const inhalt = String(text || '').trim();
  if (!inhalt) throw new Error('Leerer Kommentar');
  const wer = benutzer?.kuerzel || benutzer?.name || 'inhaber';
  const zeit = jetzt.toISOString();
  eintrag.kommentare.push({ zeit, wer, text: inhalt });
  eintrag.verlauf.push({ zeit, wer, was: 'Kommentar hinzugefügt' });
  eintrag.aktualisiertAm = zeit;
  return eintrag;
}

/**
 * Ergebnis einer Pruefung festhalten.
 *
 * Grundregel aus dem Auftrag: erledigt wird nur, was tatsaechlich geprueft
 * wurde - nicht, weil jemand etwas geaendert hat. Deshalb setzt diese
 * Funktion DONE ausschliesslich bei `erfuellt === true` und Prueftyp AUTO.
 * Bei SEMI_AUTO wandert die Aufgabe zur Bestaetigung in die Pruefung, bei
 * unklarem Ergebnis ebenfalls.
 */
export function haltePruefungFest(eintrag, ergebnis, { jetzt = new Date(), pruefer = 'Claude' } = {}) {
  const zeit = jetzt.toISOString();
  const eintragung = {
    zeit,
    pruefer,
    methode: ergebnis.methode || 'unbekannt',
    soll: ergebnis.soll ?? null,
    ist: ergebnis.ist ?? null,
    erfuellt: ergebnis.erfuellt === true ? true : ergebnis.erfuellt === false ? false : null,
    begruendung: ergebnis.begruendung || '',
  };
  eintrag.pruefungen.push(eintragung);
  eintrag.verlauf.push({ zeit, wer: pruefer, was: 'Prüfung durchgeführt', ergebnis: eintragung.erfuellt });

  if (eintragung.erfuellt === true && eintrag.pruefTyp === 'AUTO') {
    eintrag.status = 'DONE';
    eintrag.erledigtAm = zeit;
    eintrag.verlauf.push({ zeit, wer: pruefer, was: 'automatisch erledigt (Erfolgskriterium geprüft)' });
  } else if (eintragung.erfuellt === true && eintrag.pruefTyp === 'SEMI_AUTO') {
    eintrag.status = 'REVIEW';
    eintrag.verlauf.push({ zeit, wer: pruefer, was: 'zur Bestätigung in die Prüfung gelegt' });
  } else if (eintragung.erfuellt === false && eintrag.status === 'DONE') {
    // Sollzustand nicht mehr erfuellt - Aufgabe wieder oeffnen.
    eintrag.status = 'IN_PROGRESS';
    eintrag.erledigtAm = null;
    eintrag.verlauf.push({ zeit, wer: pruefer, was: 'wieder geöffnet, da der Sollzustand nicht mehr erfüllt ist' });
  } else if (eintragung.erfuellt === null) {
    eintrag.status = 'REVIEW';
    eintrag.verlauf.push({ zeit, wer: pruefer, was: 'Prüfung nicht eindeutig – manuelle Prüfung erforderlich' });
  }
  eintrag.aktualisiertAm = zeit;
  return eintrag;
}

/**
 * Faellige Wiederholungen neu anlegen. Der Nachfolger ist eine frische
 * Aufgabe mit demselben Inhalt; die erledigte bleibt als Nachweis stehen.
 */
export function erzeugeWiederholungen(daten, { jetzt = new Date() } = {}) {
  const faellig = faelligeWiederholungen(daten.eintraege, { jetzt });
  const neue = [];
  for (const alt of faellig) {
    const nachfolger = baueEintrag({
      typ: 'TASK', titel: alt.titel, beschreibung: alt.beschreibung, bereich: alt.bereich,
      prioritaet: alt.prioritaet, verantwortlich: alt.verantwortlich, sichtbarkeit: alt.sichtbarkeit,
      faellig: alt.wiederholung.naechsteFaelligkeit, erfolgskriterium: alt.erfolgskriterium,
      pruefTyp: alt.pruefTyp, pruefung: alt.pruefung, verknuepft: alt.verknuepft,
      wiederholung: { regel: alt.wiederholung.regel, naechsteFaelligkeit: null, zuletztErzeugt: null },
      status: 'PLANNED',
    }, { benutzer: { kuerzel: alt.besitzer }, jetzt });
    nachfolger.verlauf.push({ zeit: jetzt.toISOString(), wer: 'Wiederholung', was: `aus „${alt.titel}" erzeugt (${alt.wiederholung.regel})` });
    alt.wiederholung.zuletztErzeugt = alt.wiederholung.naechsteFaelligkeit;
    neue.push(nachfolger);
  }
  daten.eintraege.push(...neue);
  return neue;
}

// -- Anhaenge ---------------------------------------------------------------

/** Was angehaengt werden darf. Alles andere waere ein unnoetiges Risiko. */
export const ANHANG_TYPEN = Object.freeze({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
});
export const ANHANG_MAX_BYTES = 10 * 1024 * 1024;   // 10 MB je Datei

/** Dateinamen entschaerfen: keine Pfade, keine Sonderzeichen, nie leer. */
export function sichererName(name, typ) {
  const endung = ANHANG_TYPEN[typ] || 'bin';
  const roh = String(name || '').split(/[\\/]/).pop() || '';
  const basis = roh.replace(/\.[^.]*$/, '').replace(/[^\w.\- ]+/g, '_').trim().slice(0, 60);
  return `${basis || 'anhang'}.${endung}`;
}

/**
 * Anhang speichern. Liegt unter $TP_PRIVAT_DIR/organisation/anhaenge/<id>/ -
 * dieselbe Ablage wie die uebrigen Betriebsdaten, nie im Repository.
 */
export function speichereAnhang(eintrag, { name, typ, daten }, { dir = privatDir(), jetzt = new Date(), benutzer = null } = {}) {
  if (!ANHANG_TYPEN[typ]) throw new Error(`Dateityp nicht erlaubt: ${typ || 'unbekannt'}`);
  const roh = Buffer.from(String(daten || ''), 'base64');
  if (!roh.length) throw new Error('Datei ist leer');
  if (roh.length > ANHANG_MAX_BYTES) throw new Error(`Datei ist zu groß (max. ${Math.round(ANHANG_MAX_BYTES / 1024 / 1024)} MB)`);

  const ordner = path.join(anhangOrdner(dir), eintrag.id);
  fs.mkdirSync(ordner, { recursive: true });
  let dateiname = sicherName_frei(ordner, sichererName(name, typ));
  fs.writeFileSync(path.join(ordner, dateiname), roh, { mode: 0o600 });

  const zeit = jetzt.toISOString();
  const wer = benutzer?.kuerzel || benutzer?.name || 'inhaber';
  const anhang = { datei: dateiname, name: String(name || dateiname), typ, groesse: roh.length, zeit, wer };
  eintrag.anhaenge.push(anhang);
  eintrag.verlauf.push({ zeit, wer, was: `Anhang „${anhang.name}" hinzugefügt` });
  eintrag.aktualisiertAm = zeit;
  return anhang;
}

/** Namenskollision vermeiden, ohne eine vorhandene Datei zu ueberschreiben. */
function sicherName_frei(ordner, name) {
  let kandidat = name;
  let i = 1;
  while (fs.existsSync(path.join(ordner, kandidat))) {
    const punkt = name.lastIndexOf('.');
    kandidat = `${name.slice(0, punkt)}-${i}${name.slice(punkt)}`;
    i += 1;
  }
  return kandidat;
}

/** Pfad zu einem Anhang - nur innerhalb des eigenen Ordners. */
export function anhangPfad(eintragId, dateiname, dir = privatDir()) {
  const ordner = path.resolve(anhangOrdner(dir), eintragId);
  const ziel = path.resolve(ordner, String(dateiname || ''));
  if (!ziel.startsWith(`${ordner}${path.sep}`)) throw new Error('Ungültiger Dateiname');
  return ziel;
}
