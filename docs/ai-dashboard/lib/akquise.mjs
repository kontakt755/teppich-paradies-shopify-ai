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
  // "Nachgefasst": Status bleibt, die naechste Wiedervorlage steht wieder 14 Tage spaeter.
  if (eingabe.aktion !== undefined) {
    if (eingabe.aktion !== 'nachgefasst') throw new Error('Unbekannte Aktion.');
    neu.nachgefasst = (Number(alt.nachgefasst) || 0) + 1;
    neu.letzteAktion = heute;
    if (eingabe.wiedervorlage === undefined) neu.wiedervorlage = plusTage(heute, WIEDERVORLAGE_TAGE);
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

/* ---- Gefuehrte Ansicht: "Als Naechstes" ---------------------------------- */

export const OFFEN_STATUS = Object.freeze(['neu', 'angeschrieben', 'antwort', 'termin']);
export const SPAETER_TAGE = 7;

/**
 * Ungefaehre Strassen-km ab Oranienburg je Ort (oeffentliche Geografie, keine Firmendaten).
 * Laengster passender Anfang gewinnt ("Berlin-Pankow" vor "Berlin"); unbekannt = weit.
 */
const ORT_KM = Object.freeze({
  oranienburg: 0, birkenwerder: 10, 'hohen neuendorf': 12, velten: 13, hennigsdorf: 17, zehdenick: 25,
  panketal: 25, 'bernau': 30, brieselang: 30, falkensee: 32, nauen: 40, eberswalde: 50,
  'berlin-reinickendorf': 22, 'berlin-pankow': 28, 'berlin-spandau': 32, 'berlin-prenzlauer': 35, berlin: 30,
});
export function kmAbOranienburg(ort) {
  const o = String(ort || '').toLowerCase().trim();
  const k = Object.keys(ORT_KM).filter(x => o.startsWith(x)).sort((a, b) => b.length - a.length)[0];
  return k === undefined ? null : ORT_KM[k];
}

/** CSV-Spalte kontakt ("mail@x.de / 030 123-0", nur Mail oder nur Telefon) aufteilen. */
export function kontaktTeile(kontakt) {
  const teile = String(kontakt || '').split(/\s+\/\s*|\s*[,;]\s*/).map(s => s.trim()).filter(Boolean);
  const email = teile.find(t => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(t)) || '';
  const telefon = teile.find(t => !t.includes('@') && (t.match(/\d/g) || []).length >= 6) || '';
  return { email, telefon, telLink: telefon ? telefon.replace(/[^\d+]/g, '') : '' };
}

const zahl = w => Number(String(w || '').replace(/\D/g, '')) || 0;

/**
 * Reihenfolge fuer "Als Naechstes": faellige Wiedervorlagen (aelteste zuerst), dann
 * noch nicht angeschriebene ohne spaetere Wiedervorlage - groesster Wohnungsbestand
 * zuerst, dann naeher an Oranienburg. Alles andere wartet auf seinen Termin.
 */
export function naechsteFirmen(firmen = [], heute) {
  const faellig = faelligeWiedervorlagen(firmen, heute)
    .sort((a, b) => a.wiedervorlage.localeCompare(b.wiedervorlage));
  const ids = new Set(faellig.map(f => f.id));
  const km = f => kmAbOranienburg(f.ort) ?? 999;
  const neu = firmen.filter(f => !ids.has(f.id) && (f.status || 'neu') === 'neu' && !f.wiedervorlage)
    .sort((a, b) => zahl(b.wohnungen) - zahl(a.wohnungen) || km(a) - km(b) || a.name.localeCompare(b.name, 'de'));
  return [...faellig, ...neu];
}

/** Fortschritt fuer den Erklaerkasten. */
export function akquiseFortschritt(firmen = []) {
  const st = f => f.status || 'neu';
  return {
    gesamt: firmen.length,
    angeschrieben: firmen.filter(f => st(f) !== 'neu').length,
    antworten: firmen.filter(f => ['antwort', 'termin', 'auftrag'].includes(st(f))).length,
    auftraege: firmen.filter(f => st(f) === 'auftrag').length,
  };
}

/** Ein Satz, warum sich die Firma lohnt - nur aus belegten Angaben. */
export function warumInteressant(f) {
  const n = zahl(f.wohnungen);
  const km = kmAbOranienburg(f.ort);
  const teile = [];
  if (n) teile.push(`rund ${n.toLocaleString('de-DE')} Wohnungen – da wird laufend renoviert`);
  if (km === 0) teile.push('direkt bei uns in Oranienburg');
  else if (km !== null && km <= 20) teile.push(`ganz in der Nähe (ca. ${km} km)`);
  else if (km !== null) teile.push(`ca. ${km} km entfernt`);
  if (!teile.length) return 'Wohnungsunternehmen im Umkreis – bei jedem Mieterwechsel braucht es oft neuen Boden.';
  const s = teile.join(', ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

/** Betreff und Text aus der Vorlage (erste Zeile "Betreff: …"). */
export function betreffUndText(nachricht) {
  const t = String(nachricht || '').replace(/^An: [^\n]*\n+/, '');
  const m = t.match(/^Betreff:\s*([^\n]*)\n+/);
  return m ? { betreff: m[1].trim(), text: t.slice(m[0].length).trim() } : { betreff: '', text: t.trim() };
}

/** mailto-Link mit Betreff und Text; versendet nichts, oeffnet nur das Mailprogramm. */
export function mailtoLink(email, nachricht) {
  const { betreff, text } = betreffUndText(nachricht);
  return `mailto:${email}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

/** Tage bis zur Frist (negativ = vorbei), null ohne Frist. */
export function tageBis(datum, heute) {
  if (!DATUM.test(String(datum || ''))) return null;
  return Math.round((Date.parse(`${datum}T12:00:00Z`) - Date.parse(`${heute}T12:00:00Z`)) / TAG_MS);
}
