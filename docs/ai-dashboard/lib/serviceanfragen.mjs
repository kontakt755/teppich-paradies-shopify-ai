/**
 * Service-Anfragen (Verlegeservice, Treppe, Aufmass): Werte, Pruefung, Auswertung
 * und das Lesen einer Shopify-Formular-Mail. Laeuft im Browser UND im Server
 * (operations/lib/serviceanfragen.mjs speichert damit) - deshalb ohne Node-Module.
 *
 * Warum es die Liste gibt (Werkbank w-030, Inhaber 15.10.2026): ein Viertel der
 * Besucher landet auf den Verlege- und Treppenseiten, aber Anfragen kamen per
 * Mail, Telefon und WhatsApp herein und wurden nirgends gezaehlt. Ohne Zahl ist
 * nicht zu sagen, was Verlegeservice und Werbung bringen.
 */

export const LEISTUNG = Object.freeze(['verlegeservice', 'treppe', 'aufmass', 'sonstiges']);
export const LEISTUNG_LABEL = Object.freeze({
  verlegeservice: 'Verlegeservice', treppe: 'Treppe', aufmass: 'Aufmaß', sonstiges: 'Sonstiges',
});

export const QUELLE = Object.freeze(['formular', 'mail', 'telefon', 'whatsapp', 'laden', 'werbung']);
export const QUELLE_LABEL = Object.freeze({
  formular: 'Formular', mail: 'Mail', telefon: 'Telefon', whatsapp: 'WhatsApp', laden: 'Laden', werbung: 'Werbung',
});

export const STATUS = Object.freeze(['neu', 'kontaktiert', 'termin', 'angebot', 'gewonnen', 'verloren']);
export const STATUS_LABEL = Object.freeze({
  neu: 'Neu', kontaktiert: 'Kontaktiert', termin: 'Termin', angebot: 'Angebot', gewonnen: 'Gewonnen', verloren: 'Verloren',
});
/** Abgeschlossen: gewonnen oder verloren - alles andere ist noch Arbeit. */
export const ABGESCHLOSSEN = Object.freeze(['gewonnen', 'verloren']);

/** Ein Erstkontakt beendet den Vorgang nicht; Wiedervorlagen bleiben in der Laden-App. */
export function serviceOffen(e) {
  return Boolean(e?.id && STATUS.includes(e.status) && !ABGESCHLOSSEN.includes(e.status));
}

/** Gezielter Sprung zur vorhandenen Anfrage, ohne Kontaktdaten in der Adresse. */
export function serviceLink(id) {
  return `#/kunden?${new URLSearchParams({ tab: 'service', anfrage: String(id) })}`;
}

export const GRENZEN = Object.freeze({ name: 120, telefon: 40, email: 160, plz: 10, herkunft: 120, notiz: 2000, naechsterSchritt: 300, mailId: 100 });

export class ServiceanfrageFehler extends Error {}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function text(wert, max) {
  const s = String(wert ?? '').replace(/\s+$/g, '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Prueft und bereinigt die Felder einer Anfrage. `teil: true` fuer eine
 * Aenderung - dann gelten nur die mitgeschickten Felder, Pflicht ist nichts.
 * Unbekannte Felder fallen weg, damit niemand ueber die API etwas anderes
 * in die Ablage schreibt (z. B. eine fremde ID oder einen Verlauf).
 */
export function pruefeFelder(roh = {}, { teil = false } = {}) {
  const f = {};
  const hat = k => Object.prototype.hasOwnProperty.call(roh, k);
  for (const k of ['name', 'telefon', 'email', 'plz', 'herkunft', 'notiz', 'naechsterSchritt', 'mailId']) {
    if (hat(k)) f[k] = text(roh[k], GRENZEN[k]);
  }
  if (hat('datum') || !teil) {
    const d = String(roh.datum ?? '').trim();
    if (!DATUM.test(d)) throw new ServiceanfrageFehler('Datum fehlt oder hat nicht die Form JJJJ-MM-TT');
    f.datum = d;
  }
  for (const [k, werte, label] of [['leistung', LEISTUNG, 'Leistung'], ['quelle', QUELLE, 'Quelle'], ['status', STATUS, 'Status']]) {
    if (!hat(k)) { if (!teil && k !== 'status') throw new ServiceanfrageFehler(`${label} fehlt`); continue; }
    if (!werte.includes(roh[k])) throw new ServiceanfrageFehler(`Unbekannte ${label}: „${roh[k]}“`);
    f[k] = roh[k];
  }
  if (!teil) {
    if (!f.status) f.status = 'neu';
    if (!f.name && !f.telefon && !f.email) throw new ServiceanfrageFehler('Name, Telefon oder E-Mail – mindestens eins braucht es, sonst kann niemand zurückrufen');
  }
  return f;
}

// --- Shopify-Formular-Mail ---------------------------------------------------

/**
 * Feldnamen, wie Shopify sie in die Mail "Neue Kundennachricht" schreibt
 * (geprueft an echten Mails vom 29.09.-09.10.2026). Nur diese gelten als
 * Feldanfang - eine Zeile "Folgendes:" im Kundentext bleibt Text.
 */
const MAILFELDER = ['Ländercode', 'Id', 'Betreff', 'Herkunft', 'Produkt', 'Produkt Handle', 'Produkt Link', 'Name', 'Plz', 'E-Mail', 'Telefon', 'Anliegen', 'Text', 'Nachricht'];
const FELD_ZEILE = new RegExp(`^\\s*(${MAILFELDER.map(f => f.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|')})\\s*:\\s*(.*)$`);

/**
 * Andere Formulare schicken weitere Felder ("Straße Und Hausnummer:", "Phone:").
 * Vor dem Kundentext ist jede Zeile der Form "Wort Wort:" ein Feldanfang - sonst
 * landete der Wert im vorigen Feld (z. B. hinter der E-Mail-Adresse).
 */
const FREMDES_FELD = /^\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß -]{0,40}):\s*()$/;

const MONATE = { januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };

/** "Neue Kundennachricht vom 9. Oktober 2026 um 11:34" -> 2026-10-09 (oder null). */
function datumAusBetreffzeile(roh) {
  const m = /Kundennachricht vom (\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})/.exec(roh);
  const monat = m && MONATE[m[2].toLowerCase()];
  if (!monat) return null;
  return `${m[3]}-${String(monat).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/**
 * Leistung aus dem Betreff, den jede Serviceseite fest setzt (Abschnitt
 * tp-start-kontakt, Einstellung "betreff"), sonst aus dem Feld "Anliegen".
 * Der Betreff gewinnt: auf der Treppenseite waehlen Kunden oft "Aufmaß und
 * Angebot" - gemeint ist trotzdem die Treppe.
 */
export function leistungAus({ betreff = '', anliegen = '' } = {}) {
  const b = betreff.toLowerCase();
  if (b.includes('treppe')) return 'treppe';
  if (b.includes('verleg')) return 'verlegeservice';
  const a = anliegen.toLowerCase();
  if (a.includes('treppe')) return 'treppe';
  if (a.includes('verlegen')) return 'verlegeservice';
  if (a.includes('aufmaß') || a.includes('aufmass')) return 'aufmass';
  return 'sonstiges';
}

/**
 * Liest eine eingefuegte Formular-Mail. Gibt die Felder fuer den Dialog
 * zurueck, oder `{ erkannt: false, grund }`, wenn es keine Service-Anfrage ist
 * (Musterbestellung) oder gar keine Formular-Mail.
 */
export function ausFormularMail(roh) {
  const zeilen = String(roh ?? '').replace(/\r\n?/g, '\n').split('\n');
  const felder = {};
  let aktuell = null;
  for (const zeile of zeilen) {
    const imText = aktuell === 'Text' || aktuell === 'Nachricht';
    const m = imText ? null : FELD_ZEILE.exec(zeile) || FREMDES_FELD.exec(zeile);
    if (m) { aktuell = m[1]; felder[aktuell] = m[2] ? [m[2]] : []; continue; }
    if (aktuell) felder[aktuell].push(zeile);
  }
  const wert = k => (felder[k] || []).join('\n').trim();
  if (!felder.Betreff && !felder.Name && !felder['E-Mail']) {
    return { erkannt: false, grund: 'Das sieht nicht nach einer Formular-Mail aus („Betreff:“, „Name:“ und „E-Mail:“ fehlen).' };
  }
  if (/sample/i.test(wert('Id')) || felder.Produkt) {
    return { erkannt: false, grund: 'Das ist eine Musteranfrage, keine Service-Anfrage.' };
  }
  const betreff = wert('Betreff');
  const anliegen = wert('Anliegen');
  // Feld "Herkunft" setzt das Anfrageformular seit 16.10.2026 selbst
  // (sections/tp-start-kontakt.liquid), z. B. "Google-Anzeige · Kampagne Treppen".
  const kampagne = wert('Herkunft');
  const nachricht = wert('Text') || wert('Nachricht');
  const notiz = [anliegen && `Anliegen: ${anliegen}`, nachricht].filter(Boolean).join('\n');
  return {
    erkannt: true,
    betreff, anliegen,
    felder: {
      datum: datumAusBetreffzeile(roh),
      name: text(wert('Name'), GRENZEN.name),
      telefon: text(wert('Telefon'), GRENZEN.telefon),
      email: text(wert('E-Mail'), GRENZEN.email),
      plz: text(wert('Plz'), GRENZEN.plz),
      herkunft: text([betreff, kampagne].filter(Boolean).join(' · '), GRENZEN.herkunft),
      leistung: leistungAus({ betreff, anliegen }),
      quelle: istAnzeige(kampagne) ? 'werbung' : 'formular',
      notiz: text(notiz, GRENZEN.notiz),
    },
  };
}

/** Das Formular schreibt "…-Anzeige" bzw. "Anzeige (…)" nur bei Klick-ID oder bezahltem utm_medium. */
export function istAnzeige(herkunft) {
  return /Anzeige/.test(String(herkunft || ''));
}

// --- Automatische Uebernahme aus dem Postfach ---------------------------------

/**
 * Betreffe, die eine Serviceseite fest setzt (templates/page.*.json, Abschnitt
 * tp-start-kontakt, Einstellung "betreff") - nur diese werden automatisch
 * uebernommen. tests/serviceanfragen.test.mjs prueft, dass jeder Betreff aus
 * den Templates hier oder in BETREFF_KEIN_SERVICE steht: eine neue
 * Serviceseite faellt so beim naechsten Testlauf auf.
 */
export const BETREFF_SERVICE = Object.freeze([
  'Anfrage Liefer- und Verlegeservice',
  'Anfrage Teppichboden verlegen',
  'Anfrage Vinylboden verlegen',
  'Anfrage Treppenverlegung',
]);
/** Startseite: Formular ohne eigenen Betreff - Service nur bei diesem Anliegen. */
export const BETREFF_STARTSEITE = 'Anfrage von der Startseite';
export const ANLIEGEN_SERVICE = Object.freeze(['Boden verlegen lassen', 'Aufmaß und Angebot', 'Treppe belegen lassen']);
/** Bekannte Betreffe ohne Service-Anfrage (Reinigung, Boden-Finder, Musterberatung). */
export const BETREFF_KEIN_SERVICE = Object.freeze(['Anfrage Teppichreinigung', 'Boden-Finder: persönliche Vorschläge', 'RÜCKRUF – Musterberatung']);

/** Ergebnis von ausFormularMail() -> darf es ohne Menschen in die Liste? */
export function automatischUebernehmbar(ergebnis) {
  if (!ergebnis?.erkannt) return { ok: false, grund: ergebnis?.grund || 'keine Formular-Mail' };
  if (BETREFF_SERVICE.includes(ergebnis.betreff)) return { ok: true };
  if (ergebnis.betreff === BETREFF_STARTSEITE) {
    return ANLIEGEN_SERVICE.includes(ergebnis.anliegen)
      ? { ok: true }
      : { ok: false, grund: `Startseite, Anliegen „${ergebnis.anliegen || 'leer'}“ ist kein Service` };
  }
  return { ok: false, grund: `Betreff „${ergebnis.betreff || 'leer'}“ ist kein Service-Betreff` };
}

// --- Auswertung ----------------------------------------------------------------

function tagZahl(iso) {
  const [j, m, t] = iso.split('-').map(Number);
  return Date.UTC(j, m - 1, t) / 86400000;
}
function isoAusTag(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }

/** Montag der Woche (JJJJ-MM-TT). Wochen beginnen montags wie im Kalender. */
export function wochenStart(iso) {
  const n = tagZahl(iso);
  const wochentag = (new Date(n * 86400000).getUTCDay() + 6) % 7; // 0 = Montag
  return isoAusTag(n - wochentag);
}

/** ISO-Kalenderwoche (KW) eines Datums. */
export function kalenderwoche(iso) {
  const d = new Date(tagZahl(iso) * 86400000);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // Donnerstag derselben Woche
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

/**
 * Anfragen der letzten `wochen` Kalenderwochen (inklusive der laufenden):
 * je Woche und je Quelle, mit gewonnen/verloren. Beide Bloecke zaehlen
 * dieselbe Menge, damit die Summen zusammenpassen.
 */
export function auswertung(eintraege = [], { heute, wochen = 8 } = {}) {
  const ab = isoAusTag(tagZahl(wochenStart(heute)) - 7 * (wochen - 1));
  const imZeitraum = eintraege.filter(e => e.datum >= ab && e.datum <= heute);
  const woche = [];
  for (let i = 0; i < wochen; i += 1) {
    const start = isoAusTag(tagZahl(ab) + 7 * i);
    woche.push({ start, kw: kalenderwoche(start), anzahl: 0 });
  }
  const proWoche = new Map(woche.map(w => [w.start, w]));
  const proQuelle = new Map(QUELLE.map(q => [q, { quelle: q, label: QUELLE_LABEL[q], anzahl: 0, gewonnen: 0, verloren: 0 }]));
  for (const e of imZeitraum) {
    const w = proWoche.get(wochenStart(e.datum));
    if (w) w.anzahl += 1;
    const q = proQuelle.get(e.quelle);
    if (!q) continue;
    q.anzahl += 1;
    if (e.status === 'gewonnen') q.gewonnen += 1;
    if (e.status === 'verloren') q.verloren += 1;
  }
  return {
    ab, bis: heute, wochen: woche,
    quellen: [...proQuelle.values()].filter(q => q.anzahl).sort((a, b) => b.anzahl - a.anzahl),
    gesamt: imZeitraum.length,
    gewonnen: imZeitraum.filter(e => e.status === 'gewonnen').length,
  };
}
