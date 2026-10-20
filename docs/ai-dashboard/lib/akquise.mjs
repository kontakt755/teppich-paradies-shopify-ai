/**
 * Akquise Verlegeauftraege (Issue #1447): Wohnungsgenossenschaften und Hausverwaltungen.
 * Reine Funktionen - Browser UND Server. Die Firmenliste und die Vorlage liegen privat
 * (nie im Repository); hier stehen nur Regeln: Status, Wiedervorlage, Vorlage fuellen.
 * Versendet wird nichts - der Knopf kopiert den Text in die Zwischenablage.
 */

export const AKQUISE_STATUS = Object.freeze(['neu', 'angeschrieben', 'antwort', 'termin', 'auftrag', 'kein-interesse']);
export const AKQUISE_LABEL = Object.freeze({
  neu: 'neu', angeschrieben: 'angeschrieben', antwort: 'Antwort', termin: 'Termin', auftrag: 'Auftrag', 'kein-interesse': 'kein Interesse',
});
export const WIEDERVORLAGE_TAGE = 14;
const TAG_MS = 24 * 60 * 60 * 1000;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Schluessel je Firma: aus dem Namen, damit der Stand eine neue CSV-Reihenfolge uebersteht. */
export function akquiseId(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

/** CSV mit Semikolon und Kopfzeile (name;ort;typ;wohnungen;stand;website;kontakt;quelle). */
export function leseAkquiseCsv(text) {
  const zeilen = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(z => z.trim());
  if (!zeilen.length) return [];
  const kopf = zeilen[0].split(';').map(s => s.trim().toLowerCase());
  return zeilen.slice(1).map(z => {
    const w = z.split(';');
    const feld = v => { const t = (v || '').trim(); return /^".*"$/.test(t) ? t.slice(1, -1).replace(/""/g, '"') : t; };
    const o = Object.fromEntries(kopf.map((k, i) => [k, feld(w[i])]));
    return { ...o, id: akquiseId(o.name) };
  }).filter(f => f.name && f.id);
}

export function plusTage(datum, tage) {
  const d = new Date(`${datum}T12:00:00Z`);
  return new Date(d.getTime() + tage * TAG_MS).toISOString().slice(0, 10);
}

/**
 * Prueft eine Aenderung und liefert den neuen Stand einer Firma. Wechsel auf
 * "angeschrieben" setzt die Wiedervorlage auf +14 Tage, wenn keine angegeben ist;
 * Abschluss-Status (Auftrag, kein Interesse) loeschen sie.
 */
export function wendeAenderungAn(alt = {}, eingabe = {}, heute) {
  const neu = { ...alt };
  if (eingabe.status !== undefined) {
    if (!AKQUISE_STATUS.includes(eingabe.status)) throw new Error('Unbekannter Status.');
    if (eingabe.status !== alt.status) {
      neu.status = eingabe.status;
      neu.letzteAktion = heute;
      if (eingabe.status === 'angeschrieben' && eingabe.wiedervorlage === undefined) neu.wiedervorlage = plusTage(heute, WIEDERVORLAGE_TAGE);
      if (['auftrag', 'kein-interesse'].includes(eingabe.status) && eingabe.wiedervorlage === undefined) neu.wiedervorlage = '';
    }
  }
  if (eingabe.wiedervorlage !== undefined) {
    const w = String(eingabe.wiedervorlage || '');
    if (w && !DATUM.test(w)) throw new Error('Wiedervorlage bitte als Datum.');
    neu.wiedervorlage = w;
  }
  if (eingabe.notiz !== undefined) {
    const n = String(eingabe.notiz || '');
    if (n.length > 2000) throw new Error('Notiz ist zu lang (höchstens 2000 Zeichen).');
    if (n !== (alt.notiz || '')) neu.letzteAktion = heute;
    neu.notiz = n;
  }
  return neu;
}

/** Firmen, deren Wiedervorlage heute oder frueher liegt und die noch offen sind. */
export function faelligeWiedervorlagen(firmen = [], heute) {
  return firmen.filter(f => f.wiedervorlage && f.wiedervorlage <= heute && !['auftrag', 'kein-interesse'].includes(f.status || 'neu'));
}

/**
 * Vorlage aus der privaten Markdown-Datei: Abschnitt "E-Mail" (Betreff + Text), sonst
 * der ganze Text ohne Kopfdaten. Markdown-Fettdruck faellt weg.
 */
export function vorlageAusMarkdown(md) {
  let t = String(md || '').replace(/^---\n[\s\S]*?\n---\n/, '');
  const m = t.match(/^##[^\n]*E-Mail[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m);
  if (m) t = m[1];
  return t.replace(/\*\*/g, '').trim();
}

/** Vorlage mit Firmennamen: Platzhalter ersetzen, sonst eine Zeile "An:" voranstellen. */
export function nachrichtFuer(vorlage, name) {
  const v = String(vorlage || '');
  const ersetzt = v.replace(/\[(?:Name des Unternehmens|Firma|Firmenname)\]/g, name);
  return ersetzt === v ? `An: ${name}\n\n${v}` : ersetzt;
}
