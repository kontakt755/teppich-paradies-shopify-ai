/**
 * Hausverwaltungen (Werkbank w-154, Issue #1768): Verwaltungen mit Ansprechpartner, ihre
 * Objekte und die Angebote bzw. Auftraege je Objekt. Reine Funktionen - Browser UND Server.
 * Gespeichert wird nur lokal ($TP_PRIVAT_DIR/hausverwaltungen/verwaltungen.json), nie im
 * Repository. Die Erstansprache aus der Firmenliste bleibt im Bereich "Genossenschaften"
 * (lib/akquise.mjs); hier stehen die Verwaltungen, mit denen wir wirklich arbeiten wollen.
 * Lexware und Auftrags-App sind nur Felder - verbunden wird nichts.
 */
import { akquiseId, plusTage, WIEDERVORLAGE_TAGE } from './akquise.mjs';

export const HV_STATUS = Object.freeze(['neu', 'angeschrieben', 'antwort', 'termin', 'kunde', 'kein-interesse']);
export const HV_LABEL = Object.freeze({
  neu: 'neu', angeschrieben: 'angeschrieben', antwort: 'Antwort', termin: 'Termin', kunde: 'Kunde', 'kein-interesse': 'kein Interesse',
});
export const ANGEBOT_ART = Object.freeze(['angebot', 'auftrag']);
export const ANGEBOT_ART_LABEL = Object.freeze({ angebot: 'Angebot', auftrag: 'Auftrag' });
export const ANGEBOT_STAND = Object.freeze(['offen', 'angenommen', 'abgelehnt', 'erledigt']);
export const ANGEBOT_STAND_LABEL = Object.freeze({ offen: 'offen', angenommen: 'angenommen', abgelehnt: 'abgelehnt', erledigt: 'erledigt' });

// Grenzen gegen versehentlich riesige Dateien - weit ueber dem, was ein Betrieb pflegt.
const MAX_VERWALTUNGEN = 500;
const MAX_OBJEKTE = 200;
const MAX_ANGEBOTE = 200;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function leererBestand() {
  return { schema: 1, verwaltungen: [] };
}

/* ---- Eingaben pruefen ---------------------------------------------------- */

function text(wert, max, feld, { pflicht = false } = {}) {
  const t = String(wert ?? '').trim();
  if (pflicht && !t) throw new Error(`${feld} fehlt.`);
  if (t.length > max) throw new Error(`${feld} ist zu lang (höchstens ${max} Zeichen).`);
  return t;
}

function datum(wert, feld) {
  const d = String(wert ?? '').trim();
  if (d && (!DATUM.test(d) || !Number.isFinite(Date.parse(`${d}T12:00:00Z`)))) throw new Error(`${feld} bitte als Datum.`);
  return d;
}

function telefon(wert) {
  const t = text(wert, 40, 'Telefon');
  if (t && ((t.match(/\d/g) || []).length < 6 || /[^\d\s+()/.-]/.test(t))) throw new Error('Telefon bitte nur mit Ziffern, Leerzeichen, + / - ( ).');
  return t;
}

function email(wert) {
  const e = text(wert, 120, 'E-Mail');
  if (e && !EMAIL.test(e)) throw new Error('E-Mail sieht nicht vollständig aus (name@firma.de).');
  return e;
}

function wohnungen(wert) {
  const roh = String(wert ?? '').trim().replace(/\./g, '');
  if (!roh) return null;
  const n = Number(roh);
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error('Wohnungen bitte als ganze Zahl.');
  return n;
}

/** Nur die mitgeschickten Felder pruefen - beim Bearbeiten bleibt alles andere stehen. */
function pruefeFelder(daten, regeln) {
  const aus = {};
  for (const [feld, pruefe] of Object.entries(regeln)) {
    if (daten[feld] !== undefined) aus[feld] = pruefe(daten[feld]);
  }
  return aus;
}

const VERWALTUNG_FELDER = {
  name: v => text(v, 120, 'Name', { pflicht: true }),
  ansprechpartner: v => text(v, 120, 'Ansprechpartner'),
  telefon,
  email,
  notiz: v => text(v, 2000, 'Notiz'),
  status: v => { if (!HV_STATUS.includes(v)) throw new Error('Unbekannter Stand.'); return v; },
  wiedervorlage: v => datum(v, 'Wieder melden am'),
};
const OBJEKT_FELDER = {
  adresse: v => text(v, 200, 'Adresse', { pflicht: true }),
  wohnungen,
  vorOrt: v => text(v, 200, 'Ansprechpartner vor Ort'),
  notiz: v => text(v, 1000, 'Notiz'),
};
const ANGEBOT_FELDER = {
  art: v => { if (!ANGEBOT_ART.includes(v)) throw new Error('Bitte Angebot oder Auftrag wählen.'); return v; },
  lexware: v => text(v, 40, 'Lexware-Nummer'),
  auftragsApp: v => text(v, 60, 'Auftrag in der Auftrags-App'),
  datum: v => datum(v, 'Datum'),
  stand: v => { if (!ANGEBOT_STAND.includes(v)) throw new Error('Unbekannter Stand des Angebots.'); return v; },
  notiz: v => text(v, 1000, 'Notiz'),
};

/* ---- Aenderung anwenden -------------------------------------------------- */

function finde(liste, id, was) {
  const i = (liste || []).findIndex(x => x.id === id);
  if (i < 0) throw new Error(`${was} nicht gefunden – bitte die Seite neu laden.`);
  return i;
}

/**
 * Eine Aenderung auf den Bestand anwenden (gibt einen neuen Bestand zurueck, der alte bleibt).
 *
 * eingabe = { ebene: 'verwaltung'|'objekt'|'angebot', verwaltungId, objektId, id, daten, entfernen }
 * Ohne `id` wird angelegt, mit `id` bearbeitet; `entfernen: true` loescht den Eintrag - eine
 * Verwaltung nur ohne Objekte, ein Objekt nur ohne Angebote (sonst ginge mit einem Klick zu viel
 * verloren; dafuer gibt es den Stand "kein Interesse").
 * kontext = { heute: 'JJJJ-MM-TT', neueId: () => string, von: 'Name' }
 */
export function wendeHvAenderungAn(bestand, eingabe = {}, kontext = {}) {
  const { heute, neueId, von = '' } = kontext;
  const neu = structuredClone(bestand?.verwaltungen ? bestand : leererBestand());
  const liste = neu.verwaltungen;
  const daten = eingabe.daten && typeof eingabe.daten === 'object' ? eingabe.daten : {};
  const ebene = eingabe.ebene;
  if (!['verwaltung', 'objekt', 'angebot'].includes(ebene)) throw new Error('Unbekannte Änderung.');

  const stempel = v => { v.geaendertAm = heute; v.geaendertVon = von; };

  if (ebene === 'verwaltung') {
    if (eingabe.entfernen) {
      const i = finde(liste, eingabe.id, 'Hausverwaltung');
      if (liste[i].objekte?.length) throw new Error('Die Verwaltung hat noch Objekte. Bitte zuerst die Objekte entfernen – oder den Stand auf „kein Interesse“ setzen.');
      liste.splice(i, 1);
      return { bestand: neu, ergebnis: { ebene, id: eingabe.id, entfernt: true } };
    }
    const felder = pruefeFelder(daten, VERWALTUNG_FELDER);
    const schluessel = felder.name ? akquiseId(felder.name) : '';
    if (schluessel && liste.some(v => v.id !== eingabe.id && akquiseId(v.name) === schluessel)) throw new Error('Diese Hausverwaltung gibt es schon.');
    let v;
    if (!eingabe.id) {
      if (!felder.name) throw new Error('Name fehlt.');
      if (liste.length >= MAX_VERWALTUNGEN) throw new Error('Zu viele Verwaltungen in einer Liste.');
      v = { id: neueId(), name: '', ansprechpartner: '', telefon: '', email: '', notiz: '', status: 'neu', wiedervorlage: '', letzteAktion: '', angelegtAm: heute, objekte: [] };
      liste.push(v);
    } else {
      v = liste[finde(liste, eingabe.id, 'Hausverwaltung')];
    }
    const alterStatus = v.status;
    Object.assign(v, felder);
    if (felder.status && felder.status !== alterStatus) {
      v.letzteAktion = heute;
      // Wie bei den Genossenschaften: nach dem Anschreiben in 14 Tagen nachfassen.
      if (felder.status === 'angeschrieben' && !daten.wiedervorlage) v.wiedervorlage = plusTage(heute, WIEDERVORLAGE_TAGE);
    }
    // Ohne Interesse meldet sich niemand mehr - eine alte Wiedervorlage waere nur Laerm.
    if (v.status === 'kein-interesse') v.wiedervorlage = '';
    stempel(v);
    return { bestand: neu, ergebnis: { ebene, id: v.id, verwaltung: v } };
  }

  const v = liste[finde(liste, eingabe.verwaltungId, 'Hausverwaltung')];
  v.objekte = v.objekte || [];

  if (ebene === 'objekt') {
    if (eingabe.entfernen) {
      const i = finde(v.objekte, eingabe.id, 'Objekt');
      if (v.objekte[i].angebote?.length) throw new Error('Am Objekt hängen noch Angebote. Bitte zuerst die Angebote entfernen.');
      v.objekte.splice(i, 1);
      stempel(v);
      return { bestand: neu, ergebnis: { ebene, id: eingabe.id, entfernt: true, verwaltung: v } };
    }
    const felder = pruefeFelder(daten, OBJEKT_FELDER);
    let o;
    if (!eingabe.id) {
      if (!felder.adresse) throw new Error('Adresse fehlt.');
      if (v.objekte.length >= MAX_OBJEKTE) throw new Error('Zu viele Objekte bei einer Verwaltung.');
      o = { id: neueId(), adresse: '', wohnungen: null, vorOrt: '', notiz: '', angebote: [] };
      v.objekte.push(o);
    } else {
      o = v.objekte[finde(v.objekte, eingabe.id, 'Objekt')];
    }
    Object.assign(o, felder);
    stempel(v);
    return { bestand: neu, ergebnis: { ebene, id: o.id, verwaltung: v } };
  }

  const o = v.objekte[finde(v.objekte, eingabe.objektId, 'Objekt')];
  o.angebote = o.angebote || [];
  if (eingabe.entfernen) {
    o.angebote.splice(finde(o.angebote, eingabe.id, 'Angebot'), 1);
    stempel(v);
    return { bestand: neu, ergebnis: { ebene, id: eingabe.id, entfernt: true, verwaltung: v } };
  }
  const felder = pruefeFelder(daten, ANGEBOT_FELDER);
  let a;
  if (!eingabe.id) {
    if (o.angebote.length >= MAX_ANGEBOTE) throw new Error('Zu viele Angebote an einem Objekt.');
    a = { id: neueId(), art: 'angebot', lexware: '', auftragsApp: '', datum: '', stand: 'offen', notiz: '' };
    o.angebote.push(a);
  } else {
    a = o.angebote[finde(o.angebote, eingabe.id, 'Angebot')];
  }
  Object.assign(a, felder);
  // Ein Eintrag ohne jede Angabe ist nicht wiederzufinden.
  if (!a.lexware && !a.auftragsApp && !a.notiz) throw new Error('Bitte Lexware-Nummer, Auftrag in der App oder eine Notiz eintragen.');
  stempel(v);
  return { bestand: neu, ergebnis: { ebene, id: a.id, verwaltung: v } };
}

/* ---- Anzeige -------------------------------------------------------------- */

const offenerStand = v => (v.status || 'neu') !== 'kein-interesse';

/** Verwaltungen, die heute oder frueher wieder dran sind (ohne "kein Interesse"). */
export function hvFaellig(liste = [], heute) {
  return liste.filter(v => v.wiedervorlage && v.wiedervorlage <= heute && offenerStand(v));
}

/** Faellige zuerst (aelteste zuerst), dann nach Wiedervorlage, dann A-Z; "kein Interesse" ans Ende. */
export function sortiereHv(liste = [], heute) {
  const faellig = new Set(hvFaellig(liste, heute).map(v => v.id));
  const wv = v => v.wiedervorlage || '9999';
  return [...liste].sort((a, b) => Number(offenerStand(b)) - Number(offenerStand(a))
    || Number(faellig.has(b.id)) - Number(faellig.has(a.id))
    || wv(a).localeCompare(wv(b))
    || String(a.name).localeCompare(String(b.name), 'de'));
}

/** Zahlen je Verwaltung fuer die Liste: Objekte, Wohnungen, offene Angebote. */
export function hvKennzahlen(v = {}) {
  const objekte = v.objekte || [];
  const angebote = objekte.flatMap(o => o.angebote || []);
  return {
    objekte: objekte.length,
    wohnungen: objekte.reduce((s, o) => s + (Number(o.wohnungen) || 0), 0),
    offeneAngebote: angebote.filter(a => a.art === 'angebot' && a.stand === 'offen').length,
    auftraege: angebote.filter(a => a.art === 'auftrag' || a.stand === 'angenommen').length,
  };
}

/** Telefonnummer fuer einen tel:-Link (nur Ziffern und +). */
export function telHref(nummer) {
  return String(nummer || '').replace(/[^\d+]/g, '');
}
