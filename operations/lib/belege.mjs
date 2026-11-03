/**
 * Rechnungs-Archiv: Einordnung von Mails, Beleg-Daten (XML, PDF-Text), Ablage und Auswertung.
 * Hintergrund: die Originale muessen digital bleiben, gedruckt wird nur noch eine Kopie
 * (Inhaber 03.11.2026). Reine Funktionen plus die Ablage; IMAP und Druck: scripts/belege-monat.mjs.
 *
 * Grundregel: nichts erfinden. Betrag und Rechnungsnummer kommen aus eingebetteter XML oder
 * sicher aus dem PDF-Text (genau ein Wert hinter einem eindeutigen Stichwort), sonst bleiben sie
 * leer und der Beleg traegt einen Pruef-Hinweis. Was nicht eindeutig einzuordnen ist, wird
 * „unklar“ - es wird nicht geraten.
 *
 * Inhalte liegen nur im Privatordner ($TP_PRIVAT_DIR/belege-archiv/JJJJ/MM/). Keine
 * Lieferantennamen im Code: Anzeigenamen stehen privat in belege-archiv/anbieter.json.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Eigene Absender: was von hier kommt, ist keine Eingangsrechnung. */
export const EIGENE_DOMAINS = Object.freeze(['teppich-paradies.net', 'tp-oranienburg.de']);

/** Gmail-Suchen des Auftrags; so schreibt Gmail die Labelnamen in der Suche. */
export const LABEL_SUCHEN = Object.freeze([
  { kurz: '08', q: 'label:08-rechnungen' },
  { kurz: '99', q: 'label:99-altbestand-rechnung' },
  { kurz: 'W', q: 'label:wiederhergestellt-03.11.' },
]);

/**
 * Anbieter, deren Rechnung nur im Portal liegt: die Mail ist nur der Hinweis darauf.
 * `immer`: steht jeden Monat auf der Aufgabenliste, auch ohne Hinweis-Mail.
 */
export const PORTALE = Object.freeze([
  { name: 'Google Ads', absender: /^payments-noreply@google\.com$/, betreff: /abbuchung|rechnung|zahlung|invoice/i, wo: 'Google Ads: Abrechnung > Dokumente' },
  { name: 'Meta', absender: /@(business-updates\.)?facebook(mail)?\.com$/, betreff: /zahlungsbeleg|rechnung|receipt/i, wo: 'Meta Business: Abrechnung und Zahlungen' },
  { name: 'sim.de', absender: /@sim\.de$/, betreff: /rechnung/i, wo: 'sim.de: Mein Konto > Rechnungen' },
  { name: 'Lexware', absender: /@app\.lexware\.de$/, betreff: /rechnung/i, wo: 'Lexware: Einstellungen > Vertrag und Rechnungen' },
]);

export const WORT_RECHNUNG = /rechnung|invoice|receipt|faktura|factuur|abrechnung|gutschrift|credit note/i;
const ANTWORT = /^\s*(aw|re|wg|fw|fwd|antwort)\s*:/i;
const BESCHEINIGUNG_BEILAGE = /(^|[^a-z])(agb|widerruf|datenschutz|lieferschein|verzending|packing|delivery|receipt|quittung|zahlungsbeleg|abnahme|versandbeleg)/i;

const klein = s => String(s ?? '').toLowerCase();
const rundeCent = n => Math.round(n * 100) / 100;

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const belegeOrdner = (privatDir = process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse')) => path.join(privatDir, 'belege-archiv');

/** "2026-10" -> Suchgrenzen mit einem Tag Rand; Gmail rechnet Tage nicht in Berliner Zeit. */
export function monatsGrenzen(monat) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(monat));
  if (!m) throw new Error('--monat muss JJJJ-MM sein');
  const j = Number(m[1]);
  const n = Number(m[2]);
  const f = (d) => `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  return { jahr: m[1], mm: m[2], after: f(new Date(Date.UTC(j, n - 1, 0))), before: f(new Date(Date.UTC(j, n, 2))) };
}

export const monatDavor = (monat, schritte = 1) => {
  const [j, m] = monat.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1 - schritte, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Datum in Berliner Zeit (JJJJ-MM-TT): entscheidet, in welchen Monat eine Mail gehoert. */
export function berlinTag(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const FREEMAIL = /^(web\.de|gmx\.(de|net|at|ch)|gmail\.com|googlemail\.com|t-online\.de|hotmail\.[a-z]+|outlook\.[a-z]+|live\.[a-z]+|yahoo\.[a-z]+|icloud\.com|freenet\.de|aol\.[a-z]+)$/;
/** Absendernamen, die nur die Funktion nennen, sagen nicht, wer der Anbieter ist. */
const FUNKTIONSNAME = /@|no.?reply|nicht antworten|rechnung|invoice|billing|document|buchhaltung|debitoren/i;

/** Domain ohne Subdomains: rechnung.anbieter.de und info@anbieter.de sind ein Anbieter. */
export function anbieterSchluessel(adresse) {
  const domain = klein(adresse).split('@')[1] || '';
  // Bei Freemail ist die Domain kein Anbieter: fremde Absender duerfen nicht zusammenfallen.
  if (FREEMAIL.test(domain)) return klein(adresse);
  const teile = domain.split('.').filter(Boolean);
  return teile.length > 2 ? teile.slice(-2).join('.') : domain;
}

/** Anzeigename: privater Eintrag (Adresse vor Domain), sonst Absendername, sonst Domain. */
export function anbieterName(von, aliase = {}) {
  const adresse = klein(von?.adresse);
  const voll = adresse.split('@')[1] || '';
  const domain = anbieterSchluessel(adresse);
  if (aliase[adresse]) return aliase[adresse];
  if (aliase[voll]) return aliase[voll];
  if (aliase[domain]) return aliase[domain];
  const name = String(von?.name || '').trim();
  return name && !FUNKTIONSNAME.test(name) ? name : (domain || 'unbekannt');
}

export const istEigen = adresse => EIGENE_DOMAINS.includes(klein(adresse).split('@')[1] || '');

/** Sicherer Teil eines Dateinamens: fremde Namen duerfen nie den Pfad bestimmen. */
export function sichererName(name, ersatz = 'anhang') {
  const basis = String(name ?? '').split(/[\\/]/).pop();
  const s = basis.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').replace(/_+/g, '_');
  return (s || ersatz).slice(-80);
}

export const istPdf = inhalt => inhalt.subarray(0, 1024).includes('%PDF-');
export const istXml = a => /\.xml$/i.test(a.name || '') || /[/+]xml$/i.test(a.typ || '');

/** Ist diese XML eine elektronische Rechnung (CII/ZUGFeRD oder UBL)? */
export const istRechnungsXml = xml => /CrossIndustryInvoice|<(\w+:)?(Invoice|CreditNote)[\s>]/.test(xml);

function tagWert(xml, namen) {
  for (const n of namen) {
    const m = new RegExp(`<(?:\\w+:)?${n}(?:\\s[^>]*)?>\\s*([^<]*?)\\s*</(?:\\w+:)?${n}>`).exec(xml);
    if (m?.[1]) return m[1];
  }
  return null;
}

function abschnitt(xml, name) {
  const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml);
  return m ? m[1] : '';
}

const xmlDatum = (s) => {
  const t = String(s ?? '').trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const xmlZahl = (s) => {
  const n = Number(String(s ?? '').trim());
  return s != null && String(s).trim() !== '' && Number.isFinite(n) ? n : null;
};

/**
 * Felder aus ZUGFeRD/Factur-X/XRechnung (CII) und XRechnung/Peppol (UBL). Kein Parser mit
 * Entity-Aufloesung: fremde XML wird nur per Muster gelesen. Nicht gefunden = null.
 */
export function xmlRechnungLesen(xml) {
  const s = String(xml ?? '');
  if (!istRechnungsXml(s)) return null;
  if (/CrossIndustryInvoice/.test(s)) {
    const doc = abschnitt(s, 'ExchangedDocument');
    const summe = abschnitt(s, 'SpecifiedTradeSettlementHeaderMonetarySummation');
    const verkaeufer = abschnitt(s, 'SellerTradeParty');
    const typ = tagWert(doc, ['TypeCode']);
    return {
      format: 'CII',
      art: typ === '381' ? 'gutschrift' : 'rechnung',
      nummer: tagWert(doc, ['ID']),
      datum: xmlDatum(tagWert(abschnitt(doc, 'IssueDateTime'), ['DateTimeString'])),
      verkaeufer: tagWert(verkaeufer, ['Name']),
      netto: xmlZahl(tagWert(summe, ['TaxBasisTotalAmount'])),
      steuer: xmlZahl(tagWert(summe, ['TaxTotalAmount'])),
      brutto: xmlZahl(tagWert(summe, ['GrandTotalAmount'])),
      waehrung: tagWert(s, ['InvoiceCurrencyCode']),
    };
  }
  const summe = abschnitt(s, 'LegalMonetaryTotal');
  const steuer = abschnitt(s, 'TaxTotal');
  const verkaeufer = abschnitt(s, 'AccountingSupplierParty');
  // Die erste cbc:ID steht vor allen Unterbloecken: die Belegnummer, nicht eine Positions-ID.
  const kopf = s.split(/<(?:\w+:)?(?:AccountingSupplierParty|InvoiceLine|CreditNoteLine|OrderReference|AdditionalDocumentReference)[\s>]/)[0];
  return {
    format: 'UBL',
    art: /<(\w+:)?CreditNote[\s>]/.test(s) ? 'gutschrift' : 'rechnung',
    nummer: tagWert(kopf, ['ID']),
    datum: xmlDatum(tagWert(kopf, ['IssueDate'])),
    verkaeufer: tagWert(verkaeufer, ['RegistrationName', 'Name']),
    netto: xmlZahl(tagWert(summe, ['TaxExclusiveAmount'])),
    steuer: xmlZahl(tagWert(steuer, ['TaxAmount'])),
    brutto: xmlZahl(tagWert(summe, ['TaxInclusiveAmount', 'PayableAmount'])),
    waehrung: tagWert(kopf, ['DocumentCurrencyCode']),
  };
}

/** "1.234,56" und "1,234.56" zu Zahl; alles andere null. Minus vorn oder hinten zaehlt. */
export function betragLesen(text) {
  const m = /^(-?)\s*(\d{1,3}(?:[.,' ]\d{3})*|\d+)[.,](\d{2})\s*(-?)$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const n = Number(`${m[2].replace(/[.,' ]/g, '')}.${m[3]}`);
  return (m[1] || m[4]) ? -n : n;
}

const STICHWORT_BRUTTO = /(rechnungsbetrag|rechnungssumme|rechnungsendbetrag|gesamtbetrag|gesamt\s*brutto|bruttobetrag|bruttosumme|brutto\s*gesamt|summe\s*brutto|endbetrag|endsumme|gesamtsumme|zu\s*zahlen|zahlbetrag|gutschriftsbetrag|invoice\s*total|total\s*amount|amount\s*due|total\s*due|total(?=\s*inkl)|rechnungswert|gesamt\s*eur|^\s*brutto(?=\s*:?\s*(?:€|eur)?\s*-?\d))/i;
const NICHT_BRUTTO = /netto|zwischensumme|mwst|ust\b|umsatzsteuer|skonto|nachlass|rabatt|fracht|steuerbetrag|anzahlung|bereits|gewicht/i;
const INKL_STEUER = /inkl\.?\s*(?:der\s*)?(?:mwst|ust|umsatzsteuer)/gi;
const STICHWORT_NUMMER = /(?:rechnungs?\s*-?\s*(?:nummer|nr\.?|no\.?)|rechnung\s*(?:nr\.?|no\.?|#)|invoice\s*(?:number|no\.?|nr\.?|#)|gutschrifts?\s*-?\s*(?:nummer|nr\.?)|beleg\s*-?\s*(?:nummer|nr\.?)|faktura\s*-?\s*(?:nummer|nr\.?))\s*[:.#]?\s*([A-Z0-9][A-Z0-9/._-]*)/gi;
const STICHWORT_DATUM = /(?:rechnungsdatum|rechnungs-datum|belegdatum|invoice\s*date|datum\s*der\s*rechnung)\s*[:.]?\s*(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/gi;
const BETRAG_IN_ZEILE = /-?\s?\d{1,3}(?:[.,' ]\d{3})*[.,]\d{2}(?:\s?-)?(?!\d)|-?\s?\d+[.,]\d{2}(?:\s?-)?(?!\d)/g;

/** Genau ein Wert ist sicher; kein oder mehrere Werte sind es nicht. */
function einziger(werte) {
  const v = [...new Set(werte)];
  return v.length === 1 ? { wert: v[0] } : { wert: null, mehrdeutig: v.length > 1 };
}

/**
 * Betrag, Nummer und Datum aus PDF-Text. Sicher heisst: genau ein verschiedener Wert hinter
 * einem eindeutigen Stichwort. Sonst null - lieber „pruefen“ als eine falsche Zahl.
 * `hinweisNummer`: Nummer aus Betreff oder Dateiname; zaehlt nur, wenn sie auch im Text steht.
 */
export function pdfTextLesen(text, { hinweisNummer = null } = {}) {
  const roh = String(text ?? '');
  const betraege = [];
  for (const zeile of roh.split(/\r?\n/)) {
    const treffer = STICHWORT_BRUTTO.exec(zeile);
    if (!treffer) continue;
    // Skonto-Zeile nennt den Betrag nach Abzug („bleibt zu zahlen“), nicht den Rechnungsbetrag.
    if (/skonto/i.test(zeile)) continue;
    // Stichwort „Zahlbetrag“ o. ae. kann mit Netto-Spalten in einer Zeile stehen: nur danach lesen.
    // Davor zaehlt nur das Wort direkt am Stichwort („Netto Gesamtbetrag“), nicht eine andere Spalte.
    const rest = zeile.slice(treffer.index + treffer[0].length).replace(/\s+/g, ' ');
    if (NICHT_BRUTTO.test(zeile.slice(Math.max(0, treffer.index - 12), treffer.index)) || NICHT_BRUTTO.test(rest.replace(INKL_STEUER, ' '))) continue;
    const zahlen = rest.match(BETRAG_IN_ZEILE);
    // Der Betrag steht direkt hinter dem Stichwort; im Fliesstext (AGB) ist es kein Rechnungsbetrag.
    if (!zahlen || rest.indexOf(zahlen[0]) > 25) continue;
    const n = betragLesen(zahlen[zahlen.length - 1].replace(/\s/g, ''));
    if (n !== null) betraege.push(n);
  }
  const betrag = einziger(betraege);
  const nummern = [];
  for (const m of roh.matchAll(STICHWORT_NUMMER)) {
    let n = m[1].replace(/[.,:;/-]+$/, '');
    // „921 812 398“: Nummer in Dreiergruppen, sonst bliebe nur der Anfang stehen.
    const gruppen = /^\d{1,3}$/.test(n) ? /^(?: \d{3})+(?=\s|$)/.exec(roh.slice(m.index + m[0].length)) : null;
    if (gruppen) n += gruppen[0].replace(/ /g, '');
    if (/\d/.test(n) && n.length >= 3) nummern.push(n);
  }
  let nummer = einziger(nummern);
  // Aus Betreff oder Dateiname und im Text bestaetigt (Leerzeichen zwischen Ziffern zaehlen nicht):
  // schlaegt eine Bezugsnummer im Text (Gutschrift nennt ihre Rechnung).
  // Fuehrende Nullen des Dateinamens fehlen im Beleg oft; es gilt die Schreibweise im Beleg.
  const hinweisMuster = hinweisNummer ? [...hinweisNummer.replace(/^0+(?=\d)/, '')].map(z => z.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('\\s?') : null;
  const bestaetigt = hinweisMuster ? new RegExp(`(?:^|[^A-Za-z0-9])(0*${hinweisMuster})(?:$|[^A-Za-z0-9])`).exec(roh) : null;
  if (bestaetigt) nummer = { wert: bestaetigt[1].replace(/\s/g, '') };
  const daten = [];
  for (const m of roh.matchAll(STICHWORT_DATUM)) {
    const j = m[3].length === 2 ? `20${m[3]}` : m[3];
    daten.push(`${j}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  const waehrung = /€|\bEUR\b/.test(roh) ? 'EUR' : null;
  return {
    brutto: betrag.wert,
    betragMehrdeutig: Boolean(betrag.mehrdeutig),
    nummer: nummer.wert,
    nummerMehrdeutig: Boolean(nummer.mehrdeutig),
    datum: einziger(daten).wert,
    waehrung,
  };
}

/** Belegnummer aus Betreff oder Dateiname - nur ein Hinweis (siehe pdfTextLesen). */
export function nummerAusBetreff(...texte) {
  for (const t of texte) {
    const m = /(?:rechnung|invoice|faktura|gutschrift|ausgangsrechnung)[^A-Za-z0-9]{0,12}(?:nr\.?\s*)?([A-Z]{0,4}\d[A-Z0-9/-]{3,})/i.exec(String(t ?? ''));
    if (m) return m[1];
  }
  // Dateiname nur aus Ziffern (0201399548.PDF): zaehlt ebenfalls nur, wenn er im Text steht.
  for (const t of texte) {
    const m = /^(\d{6,})\.[a-z]+$/i.exec(String(t ?? '').trim());
    if (m) return m[1];
  }
  return null;
}

export const AUSSORTIERT_KLASSEN = Object.freeze({
  eigen: 'Eigene Mail',
  ausgang: 'Eigene Ausgangsrechnung (Antwort oder Rücklauf)',
  versandmarke: 'Versandmarke',
  avis: 'Avis / Zahlungsavis',
  lieferschein: 'Lieferschein / Auftragsbestätigung',
  zahlung: 'Zahlungsbeleg eines Zahlungsdienstes',
  sonstiges: 'Keine Rechnung',
});

/**
 * Einordnung nur aus Absender und Betreff. Ergebnis: klasse, oder null, wenn erst der
 * Anhang entscheidet. Reihenfolge ist Absicht: Avis und Versandmarke vor dem Wort „Rechnung“.
 */
export function einordnenKopf({ von, betreff, anhangNamen = [] }) {
  const adresse = klein(von?.adresse);
  const b = String(betreff ?? '');
  if (istEigen(adresse)) {
    // Weitergeleitete Rechnung eines Anbieters aus dem eigenen Postfach: nicht stumm verwerfen.
    const belegName = anhangNamen.some(n => /(^|[^a-z])(rechnung|invoice|receipt|rg)([^a-z]|$)/i.test(n)) && !anhangNamen.every(n => /teppich.?paradies|rechnung_re\d/i.test(n));
    if (belegName && (ANTWORT.test(b) || !b.trim())) return { klasse: 'unklar', grund: 'Weitergeleitet aus dem eigenen Postfach, Anhang sieht nach Beleg aus' };
    return { klasse: 'eigen', grund: AUSSORTIERT_KLASSEN.eigen };
  }
  if (/von teppich.?paradies/i.test(b) && WORT_RECHNUNG.test(b)) return { klasse: 'ausgang', grund: AUSSORTIERT_KLASSEN.ausgang };
  if (/(^|\s)rg\.?\s*nr\.?\s*re\d/i.test(b)) return { klasse: 'ausgang', grund: AUSSORTIERT_KLASSEN.ausgang };
  if (/versandmarke|paketmarke|internetmarke\b/i.test(b)) return { klasse: 'versandmarke', grund: AUSSORTIERT_KLASSEN.versandmarke };
  if (/(^|[^a-zäöü])(ls-)?avis([^a-zäöü]|$)|zahl(ungs)?avis|avisierung|zustellank/i.test(b)) return { klasse: 'avis', grund: AUSSORTIERT_KLASSEN.avis };
  if (/lieferschein|auftragsbest[aä]tigung|order confirmation/i.test(b)) return { klasse: 'lieferschein', grund: AUSSORTIERT_KLASSEN.lieferschein };
  if (/^service@paypal\./.test(adresse)) return { klasse: 'zahlung', grund: AUSSORTIERT_KLASSEN.zahlung };
  const portal = PORTALE.find(p => p.absender.test(adresse) && p.betreff.test(b));
  if (portal) return { klasse: 'portal', portal: portal.name, grund: `Rechnung im Portal von ${portal.name}` };
  return null;
}

/**
 * Rolle eines Anhangs: 'rechnung' oder 'beilage'.
 * `einzigerAnhang`: einziges PDF einer Mail, deren Betreff oder Label sagt, dass es eine Rechnung ist.
 */
export function rolleAnhang({ name, text = '', xml = false, einzigerAnhang = false, rechnungsMail = false }) {
  if (xml) return 'rechnung';
  const n = String(name ?? '');
  if (BESCHEINIGUNG_BEILAGE.test(n)) return 'beilage';
  if (/(rechnung|invoice|faktura|factuur|gutschrift|credit|abrechnung)|(^|[^a-z])rg([^a-z]|$)|(^|[^a-z])re[-_ ]?\d/i.test(n)) return 'rechnung';
  if (/rechnungs?\s*-?\s*(nummer|nr)|invoice\s*(no|number|nr)|gutschrift|rechnung\s*(nr|no)/i.test(text)) return 'rechnung';
  return rechnungsMail && einzigerAnhang ? 'rechnung' : 'beilage';
}

/**
 * Einordnung einer ganzen Mail. `anhaenge`: [{ name, pdf, xml, rechnungsXml, text }].
 * Ergebnis: { klasse, grund, portal?, rollen? }. klasse 'rechnung' oder 'unklar' heisst:
 * Anhaenge ablegen. `gelabelt`: Label 08 oder 99 (der Mensch oder Filter hat es so einsortiert).
 */
export function einordnen({ von, betreff, labels = [], anhaenge = [] }) {
  const namen = anhaenge.map(a => a.name || '');
  const kopf = einordnenKopf({ von, betreff, anhangNamen: namen });
  if (kopf && kopf.klasse !== 'portal') return kopf;
  const gelabelt = labels.includes('08') || labels.includes('99');
  const b = String(betreff ?? '');
  const betreffSagt = WORT_RECHNUNG.test(b) && !ANTWORT.test(b);
  const belegDateien = anhaenge.filter(a => a.pdf || a.rechnungsXml);
  if (kopf?.klasse === 'portal' && !belegDateien.length) return kopf;
  if (!belegDateien.length) {
    if ((gelabelt && WORT_RECHNUNG.test(b)) || betreffSagt) return { klasse: 'unklar', grund: 'Rechnung ohne PDF oder XML im Anhang (Link oder Mailtext?)' };
    if (gelabelt) return { klasse: 'unklar', grund: 'Im Rechnungs-Label, aber kein Beleg und kein Rechnungs-Betreff' };
    return { klasse: 'sonstiges', grund: AUSSORTIERT_KLASSEN.sonstiges };
  }
  const rechnungsMail = betreffSagt || gelabelt;
  const einzigerAnhang = belegDateien.length === 1;
  const rollen = anhaenge.map(a => ((a.pdf || a.rechnungsXml)
    ? rolleAnhang({ name: a.name, text: a.text, xml: a.rechnungsXml, einzigerAnhang, rechnungsMail })
    : null));
  const anzahl = rollen.filter(r => r === 'rechnung').length;
  if (!anzahl) {
    if (rechnungsMail) return { klasse: 'unklar', grund: 'Rechnungs-Betreff oder -Label, aber kein Anhang sieht nach Rechnung aus', rollen };
    return { klasse: 'sonstiges', grund: AUSSORTIERT_KLASSEN.sonstiges, rollen };
  }
  if (/mahnung|zahlungserinnerung/i.test(b)) return { klasse: 'unklar', grund: 'Mahnung: gehört zu einer früheren Rechnung', rollen };
  if (/kontoauszug|kundenkonto|saldenbest/i.test(b)) return { klasse: 'unklar', grund: 'Kontoauszug oder Saldenliste, keine einzelne Rechnung', rollen };
  if (rechnungsMail) return { klasse: 'rechnung', grund: 'Rechnung', rollen };
  return { klasse: 'unklar', grund: 'Anhang sieht nach Rechnung aus, Betreff und Label sagen es nicht', rollen };
}

/** Datei nur neu anlegen und schreibschuetzen. Gibt es sie schon, muss der Inhalt gleich sein. */
export function ablegenUnveraenderlich(pfad, inhalt) {
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  try {
    const fd = fs.openSync(pfad, 'wx', 0o444);
    try { fs.writeSync(fd, inhalt); } finally { fs.closeSync(fd); }
    return 'neu';
  } catch (e) {
    if (e?.code !== 'EEXIST') throw e;
    if (sha256(fs.readFileSync(pfad)) !== sha256(inhalt)) throw new Error(`Archiv: ${path.basename(pfad)} existiert mit anderem Inhalt – nichts überschrieben`);
    return 'vorhanden';
  }
}

/** Dateiname im Archiv: Tag, Anbieter, Hash-Anfang, Originalname. Der volle Hash steht im Manifest. */
export function archivName({ tag, anbieter, hash, name }) {
  return `${tag || 'ohne-datum'}_${sichererName(anbieter, 'anbieter').slice(0, 30)}_${hash.slice(0, 12)}_${sichererName(name)}`;
}

/**
 * Felder eines Belegs aus XML und PDF-Text samt Pruef-Hinweisen. XML geht immer vor.
 * Gutschriften zaehlen negativ. Weicht der PDF-Text sicher von der XML ab, wird das gemeldet.
 */
export function belegFelder({ xml = null, text = '', pdfLesbar = true, betreff = '', name = '', gutschriftWort = false }) {
  const pruefen = [];
  const ausXml = xml ? xmlRechnungLesen(xml) : null;
  const ausText = text ? pdfTextLesen(text, { hinweisNummer: nummerAusBetreff(betreff, name) }) : null;
  let quelle = null;
  let felder = { nummer: null, datum: null, netto: null, steuer: null, brutto: null, waehrung: null };
  if (ausXml && (ausXml.brutto !== null || ausXml.nummer)) {
    quelle = 'xml';
    felder = { nummer: ausXml.nummer, datum: ausXml.datum, netto: ausXml.netto, steuer: ausXml.steuer, brutto: ausXml.brutto, waehrung: ausXml.waehrung };
    if (ausText?.brutto !== null && ausText?.brutto !== undefined && ausXml.brutto !== null && Math.abs(Math.abs(ausText.brutto) - Math.abs(ausXml.brutto)) > 0.005) {
      pruefen.push('Betrag im PDF weicht von der XML ab');
    }
  } else if (ausText) {
    quelle = 'pdf-text';
    felder = { ...felder, nummer: ausText.nummer, datum: ausText.datum, brutto: ausText.brutto, waehrung: ausText.waehrung };
    if (ausText.betragMehrdeutig) pruefen.push('Mehrere mögliche Beträge im PDF');
    if (ausText.nummerMehrdeutig) pruefen.push('Mehrere mögliche Rechnungsnummern im PDF');
  }
  if (!pdfLesbar) pruefen.push('PDF nicht lesbar');
  else if (!ausXml && !String(text).trim()) pruefen.push('Kein Text im PDF (Scan?)');
  const gutschrift = ausXml?.art === 'gutschrift' || gutschriftWort;
  if (felder.brutto === null) pruefen.push('Betrag fehlt');
  else {
    felder.brutto = rundeCent(gutschrift ? -Math.abs(felder.brutto) : felder.brutto);
    if (felder.netto !== null && gutschrift) felder.netto = rundeCent(-Math.abs(felder.netto));
    if (felder.steuer !== null && gutschrift) felder.steuer = rundeCent(-Math.abs(felder.steuer));
  }
  if (!felder.nummer) pruefen.push('Rechnungsnummer fehlt');
  if (felder.brutto !== null && felder.waehrung && felder.waehrung !== 'EUR') pruefen.push(`Währung ${felder.waehrung}`);
  // Eine Rechnung an uns nennt uns: fehlt der Name, stimmt vielleicht die Einordnung nicht.
  if (String(text).trim() && !/teppich\s*-?\s*paradies|tp-oranienburg/i.test(text)) pruefen.push('Empfänger im PDF nicht als Teppich Paradies erkannt');
  return { ...felder, art: gutschrift ? 'gutschrift' : 'rechnung', quelle: felder.brutto !== null || felder.nummer ? quelle : null, pruefen };
}

/** Markiert Doppel: gleicher Hash, oder gleicher Anbieter mit gleicher Nummer und gleichem Betrag. */
export function dublettenMarkieren(belege) {
  const hashe = new Map();
  const nummern = new Map();
  for (const b of belege) {
    if (b.rolle !== 'rechnung') continue;
    b.dublette = null;
    const schluessel = b.rechnungsnummer ? `${b.anbieterSchluessel}|${b.rechnungsnummer}|${b.brutto}` : null;
    const von = hashe.get(b.sha256) || (schluessel ? nummern.get(schluessel) : null);
    if (von) { b.dublette = von.datei; continue; }
    hashe.set(b.sha256, b);
    if (schluessel) nummern.set(schluessel, b);
  }
  return belege;
}

/** Belege in Reihenfolge fuer den Druck: Anbieter, dann Datum, Dubletten raus. */
export function druckReihenfolge(belege) {
  return belege
    .filter(b => b.rolle === 'rechnung' && !b.dublette)
    .sort((a, b) => String(a.anbieter).localeCompare(String(b.anbieter), 'de') || String(a.tag).localeCompare(String(b.tag)) || String(a.datei).localeCompare(String(b.datei)));
}

/** Summen je Anbieter. Belege ohne Betrag zaehlen mit, die Summe ist dann als unvollstaendig erkennbar. */
export function summenJeAnbieter(belege) {
  const je = new Map();
  for (const b of belege) {
    if (b.rolle !== 'rechnung' || b.dublette) continue;
    const s = je.get(b.anbieterSchluessel) || { anbieter: b.anbieter, schluessel: b.anbieterSchluessel, anzahl: 0, ohneBetrag: 0, summe: 0, fremdwaehrung: 0 };
    s.anzahl += 1;
    if (b.brutto === null || b.brutto === undefined) s.ohneBetrag += 1;
    else if (b.waehrung && b.waehrung !== 'EUR') s.fremdwaehrung += 1;
    else s.summe = rundeCent(s.summe + b.brutto);
    je.set(b.anbieterSchluessel, s);
  }
  return [...je.values()].sort((a, b) => b.summe - a.summe || String(a.anbieter).localeCompare(String(b.anbieter), 'de'));
}

/**
 * Wiederkehrende Anbieter: `historie` = { 'JJJJ-MM': Set(schluessel) } der Vormonate.
 * Wiederkehrend heisst: in allen betrachteten Vormonaten da. Fehlend: wiederkehrend, aber im
 * Monat weder als Rechnung noch als Portal-Hinweis.
 */
export function wiederkehrend({ historie = {}, aktuell = [], namen = {} }) {
  const monate = Object.keys(historie);
  if (!monate.length) return { wiederkehrend: [], fehlend: [] };
  const zaehler = new Map();
  for (const m of monate) for (const s of historie[m]) zaehler.set(s, (zaehler.get(s) || 0) + 1);
  const dauer = [...zaehler.entries()].filter(([, n]) => n === monate.length).map(([s]) => s);
  const da = new Set(aktuell);
  const liste = dauer.map(s => ({ schluessel: s, anbieter: namen[s] || s })).sort((a, b) => a.anbieter.localeCompare(b.anbieter, 'de'));
  return { wiederkehrend: liste, fehlend: liste.filter(x => !da.has(x.schluessel)) };
}

/**
 * Kandidaten zur Pruefung, nur als Hinweis: wiederkehrend, wenige Belege, kleine Summe - das
 * Muster von Abos. Was davon gebraucht wird, weiss nur der Inhaber.
 */
export function pruefKandidaten(summen, dauerSchluessel, { maxAnzahl = 2, maxSumme = 200 } = {}) {
  const dauer = new Set(dauerSchluessel);
  return summen.filter(s => dauer.has(s.schluessel) && s.anzahl <= maxAnzahl && !s.ohneBetrag && s.summe > 0 && s.summe <= maxSumme);
}

/** Bisheriges Manifest; Eintraege, die dieser Lauf nicht mehr findet, bleiben erhalten. */
export function manifestZusammenfuehren(alt, neu) {
  const schluessel = b => `${b.mailId}|${b.sha256}`;
  const neuSet = new Set(neu.map(schluessel));
  return [...(alt || []).filter(b => !neuSet.has(schluessel(b))).map(b => ({ ...b, nichtMehrGefunden: true })), ...neu];
}

export const eur = n => (n === null || n === undefined ? '' : new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n));
