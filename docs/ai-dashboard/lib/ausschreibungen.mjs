/**
 * Ausschreibungen-Uebersicht: reine Funktionen, Browser UND Server. Liest nichts selbst.
 * Quellen (nur lokal, $TP_PRIVAT_DIR/ausschreibungen/): `status.json` vom woechentlichen Suchlauf
 * und je Verfahren ein Ordner mit CHECKLISTE.md, die ganz oben einen Kopfblock traegt:
 *
 *   <!-- uebersicht
 *   status: in-arbeit
 *   titel: ...
 *   -->
 *
 * Ordner-Eintraege haben Vorrang; Suchtreffer ohne Ordner (Schluessel `treffer:` = id oder Link)
 * erscheinen als "ungeprueft". Nichts davon steht im Repository.
 */
import { sichereUrl, tageBis } from './akquise.mjs';

export const STATUS = Object.freeze(['in-arbeit', 'bieten', 'beobachten', 'extern', 'abgegeben', 'nicht-geboten', 'verpasst']);
export const STATUS_LABEL = Object.freeze({
  'in-arbeit': 'In Arbeit', bieten: 'Wir bieten', beobachten: 'Beobachten', extern: 'Extern',
  abgegeben: 'Abgegeben', 'nicht-geboten': 'Nicht geboten', verpasst: 'Verpasst', ungeprueft: 'Ungeprüft',
});
/** Erledigt oder abgesagt = unten in der Liste; alles andere ist offen. */
export const STATUS_ERLEDIGT = Object.freeze(['abgegeben', 'nicht-geboten', 'verpasst']);
/** Ab so vielen Tagen bis zur Frist wird sie hervorgehoben. */
export const FRIST_NAH_TAGE = 7;

const FELDER = Object.freeze(['status', 'titel', 'auftraggeber', 'ort', 'leistung', 'portal', 'frist', 'nebenfrist', 'stand', 'naechster_schritt', 'treffer']);
const KOPF = /^﻿?\s*<!--\s*uebersicht[ \t]*\r?\n([\s\S]*?)-->/;
const FRIST = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?$/;

/** Kopfblock einer CHECKLISTE.md -> { gefunden, felder } (unbekannte Schluessel werden ignoriert). */
export function parseKopfblock(text) {
  const m = KOPF.exec(String(text || ''));
  if (!m) return { gefunden: false, felder: {} };
  const felder = {};
  for (const zeile of m[1].split(/\r?\n/)) {
    const i = zeile.indexOf(':');
    if (i < 1) continue;
    const schluessel = zeile.slice(0, i).trim().toLowerCase();
    const wert = zeile.slice(i + 1).trim();
    if (FELDER.includes(schluessel) && wert) felder[schluessel] = wert;
  }
  return { gefunden: true, felder };
}

/** "2026-11-30 10:00" -> { tag, uhr }; ohne gueltiges Datum null. */
export function parseFrist(text) {
  const m = FRIST.exec(String(text || '').trim());
  return m ? { tag: m[1], uhr: m[2] || '' } : null;
}

/** Schluessel aus `treffer:`: kommagetrennt (Links mit Komma gibt es bei den Portalen nicht). */
const trefferSchluessel = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const text = v => (typeof v === 'string' ? v.trim() : '');

function ausOrdner({ name, text: roh }) {
  const { gefunden, felder } = parseKopfblock(roh);
  if (!gefunden) {
    return {
      quelle: 'ordner', id: name, ordner: name, status: null, gruppe: 'offen', titel: name,
      hinweis: 'Kopfblock fehlt – oben in der CHECKLISTE.md ergänzen (Format: LIESMICH-UEBERSICHT.md im Ordner Ausschreibungen).',
      frist: null, treffer: [],
    };
  }
  const statusOk = STATUS.includes(felder.status);
  return {
    quelle: 'ordner', id: name, ordner: name,
    status: statusOk ? felder.status : null,
    gruppe: statusOk && STATUS_ERLEDIGT.includes(felder.status) ? 'erledigt' : 'offen',
    titel: felder.titel || name,
    auftraggeber: felder.auftraggeber || '', ort: felder.ort || '', leistung: felder.leistung || '',
    portal: sichereUrl(felder.portal),
    frist: parseFrist(felder.frist), nebenfrist: felder.nebenfrist || '',
    stand: felder.stand || '', naechsterSchritt: felder.naechster_schritt || '',
    hinweis: statusOk ? '' : 'Status fehlt oder ist unbekannt – im Kopfblock setzen.',
    treffer: trefferSchluessel(felder.treffer),
  };
}

function ausTreffer(t, neuIds) {
  const id = text(t.id) || text(t.link);
  return {
    quelle: 'suche', id, ordner: '', status: 'ungeprueft', gruppe: 'ungeprueft',
    titel: text(t.titel) || 'Ohne Titel', auftraggeber: text(t.auftraggeber), ort: text(t.ort),
    leistung: [text(t.verfahren), text(t.umfang)].filter(Boolean).join(' · '),
    portal: sichereUrl(t.link) || sichereUrl(id), frist: parseFrist(t.frist), nebenfrist: '',
    stand: '', naechsterSchritt: '', hinweis: '', neu: neuIds.has(id), quelleName: text(t.quelle), treffer: [],
  };
}

const fristKey = e => e.frist?.tag ? `${e.frist.tag} ${e.frist.uhr || '00:00'}` : null;
/** Frist aufsteigend, ohne Frist zuletzt; bei gleicher Frist nach Titel. */
function nachFrist(a, b, absteigend = false) {
  const x = fristKey(a), y = fristKey(b);
  if (x === y) return a.titel.localeCompare(b.titel, 'de');
  if (x === null) return 1;
  if (y === null) return -1;
  return absteigend ? y.localeCompare(x) : x.localeCompare(y);
}

/**
 * Fuehrt Ordner und Suchlauf zusammen.
 *   ordner: [{ name, text }]  Ordner mit CHECKLISTE.md (text = Dateianfang)
 *   status: Inhalt von status.json oder null
 *   heute:  'JJJJ-MM-TT' - abgelaufene Suchtreffer ohne Ordner fallen weg
 * Ergebnis: { geprueftAm, ausfaelle: [Text], offen, ungeprueft, erledigt } (je eine Liste).
 */
export function fuehreZusammen({ ordner = [], status = null, heute }) {
  const eintraege = ordner.map(ausOrdner);
  const belegt = new Set(eintraege.flatMap(e => e.treffer));
  const neuIds = new Set(Array.isArray(status?.neu) ? status.neu.map(n => text(n?.id) || text(n?.link)) : []);
  const treffer = (Array.isArray(status?.treffer) ? status.treffer : [])
    .filter(t => t && typeof t === 'object')
    .filter(t => !belegt.has(text(t.id)) && !belegt.has(text(t.link)))
    .map(t => ausTreffer(t, neuIds))
    .filter(e => !(e.frist && heute && e.frist.tag < heute));
  const ausfaelle = (Array.isArray(status?.ausfaelle) ? status.ausfaelle : [])
    .map(a => (typeof a === 'string' ? a : text(a?.quelle)))
    .filter(Boolean);
  return {
    geprueftAm: text(status?.geprueftAm) || null,
    ausfaelle,
    offen: eintraege.filter(e => e.gruppe === 'offen').sort(nachFrist),
    ungeprueft: treffer.sort(nachFrist),
    erledigt: eintraege.filter(e => e.gruppe === 'erledigt').sort((a, b) => nachFrist(a, b, true)),
  };
}

/**
 * Frist fuer die Anzeige: { tage, nah, vorbei }. `tage` = Tage ab heute (0 = heute), null ohne Frist.
 * Bei erledigten Verfahren wird nichts hervorgehoben.
 */
export function fristLage(eintrag, heute) {
  const tage = eintrag.frist ? tageBis(eintrag.frist.tag, heute) : null;
  if (tage === null) return { tage: null, nah: false, vorbei: false };
  const offen = eintrag.gruppe !== 'erledigt';
  return { tage, nah: offen && tage >= 0 && tage <= FRIST_NAH_TAGE, vorbei: offen && tage < 0 };
}
