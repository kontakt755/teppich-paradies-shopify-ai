/**
 * Rechnungspruefer im Probebetrieb (Benutzer 24.11.2026, Werkbank w-414): jede Warenrechnung gegen die
 * Auftragsbestaetigung (AB) desselben Lieferantenauftrags, Position fuer Position. Die Absprache mit dem
 * Vertreter prueft weiter ein Mensch an der AB - hier geht es nur um den mechanischen Teil.
 *
 * Ergebnis je Rechnung genau eins: `passt`, `abweichung` (Position, AB-Wert, Rechnungswert, Differenz in
 * Euro) oder `nicht_pruefbar` (mit Grund). Nichts wird geraten:
 * - Zugeordnet wird nur ueber eine Auftragsnummer des Lieferanten, die in AB und Rechnung steht.
 * - factur-x/ZUGFeRD (CII) wird ohne KI gelesen. Reine PDF-Rechnungen und alle ABs (die kommen nur als PDF)
 *   bestehen die Rechenprobe: Menge x Preis = Betrag je Zeile, und die Summe der Zeilen steht gedruckt
 *   auf dem Beleg. Faellt sie durch, ist der Beleg nicht pruefbar - kein Ergebnis aus halb gelesenen Zahlen.
 * - Eine Rechnungsposition, die in keiner gefundenen AB steht, macht die Rechnung nicht pruefbar
 *   (Sammelrechnung mit fehlender AB oder neue Position - ein Mensch sieht nach).
 * - Fracht, Zuschnitt, Mindermenge und andere Zuschlaege sind eigene Zeilen: gemeldet nur, wenn die AB
 *   diese Art nicht kennt oder einen anderen Prozentsatz nennt.
 *
 * Reine Funktionen plus die private Ablage (rechnungspruefung/); Ablauf: operations/scripts/rechnungen-pruefen.mjs. Keine
 * Lieferantennamen im Code - Formate werden allgemein gelesen, nicht je Lieferant.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Rundung: so viel darf eine Position je Rechnung abweichen, ohne dass es eine Abweichung ist. */
export const TOLERANZ_EUR = 0.05;
export const ERGEBNISSE = Object.freeze(['passt', 'abweichung', 'nicht_pruefbar']);

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

// ------------------------------------------------------------------ Zahlen in einer Zeile

const DATUM = /(?<![\d.,])(?:0?[1-9]|[12]\d|3[01])[./](?:0?[1-9]|1[0-2])[./](?:\d{4}|\d{2})(?!\d)/g;
// Deutsche Schreibweise: 1.234,56 | 6,00 | 9,480 | 12. Ein Minus davor (auch "- 172,79") oder dahinter zaehlt.
const ZAHL = /(-\s?)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(-(?!\d))?/g;

const EINHEIT = /^\s*(?:stk|st\b|stück|m²|m2|qm|lfm|lmt|mtr|m\b|kg|pck|pak|rol|rll|eimer|ktn|krt|sack|pal|vpe|paar)/i;

/**
 * Zahlen einer Zeile ohne Datumsangaben: { wert, nachkomma, i, einheit } - i ist die Reihenfolge in der
 * Zeile, einheit sagt, ob direkt dahinter eine Mengeneinheit steht ("1,00 stk", "20,000 QMT").
 */
export function zahlenIn(zeile) {
  const ohneDatum = String(zeile ?? '').replace(DATUM, ' ');
  const aus = [];
  for (const m of ohneDatum.matchAll(ZAHL)) {
    const nachkomma = m[3]?.length ?? 0;
    // Ein Minus zaehlt nur vor Geldbetraegen ("Rabatt -16,27"), nicht vor Nummern ("100 - 10047039").
    const minus = (m[1] || m[4]) && nachkomma === 2;
    const wert = Number(`${m[2].replace(/\./g, '')}.${m[3] || 0}`);
    aus.push({ wert: minus ? -wert : wert, nachkomma, i: aus.length, einheit: EINHEIT.test(ohneDatum.slice(m.index + m[0].length, m.index + m[0].length + 7)) });
  }
  return aus;
}

const nah = (a, b, tol = 0.01) => Math.abs(a - b) <= tol + 1e-9;
// Prozentzuschlaege rechnen manche Lieferanten je Einheit und runden dort: 0,02 % der Basis Spielraum.
const nahProzent = (basis, p, betrag) => nah(Math.abs(basis) * p / 100, Math.abs(betrag), Math.max(0.01, Math.abs(basis) * 0.0002));

// ------------------------------------------------------------------ Zuschlaege

const ZUSCHLAG_ARTEN = [
  ['mindermenge', /mindermeng|kleinmeng|mindestmeng/i],
  ['zuschnitt', /zuschnitt|schnittkost|anschnitt|schneide/i],
  ['rohstoff', /rohstoff|teuerung|preisaufschlag|energie|treibstoff|diesel|maut/i],
  ['fracht', /fracht|versand|porto|liefer(?:pauschale|kosten|gebühr)|logistik|transport|zustell|spedition|palette|verpackung|zufuhr/i],
  ['rabatt', /rabatt|nachlass|abzgl|bonus/i],
];
/** Art eines Zuschlags aus dem Text, sonst null (dann ist es Ware). */
export function zuschlagArt(text) {
  const t = String(text ?? '');
  return ZUSCHLAG_ARTEN.find(([, re]) => re.test(t))?.[0] ?? (/zuschlag|aufschlag|pauschale/i.test(t) ? 'zuschlag' : null);
}

// ------------------------------------------------------------------ Kennungen (Artikelnummer, EAN)

/** Artikelnummern, EAN und aehnliche Kennungen einer Zeile: mindestens 4 Ziffern, kein Betrag, kein Datum. */
export function kennungenIn(zeile) {
  const t = String(zeile ?? '').replace(DATUM, ' ');
  const aus = new Set();
  for (const m of t.matchAll(/(?<![\w,])([A-Za-z]{0,4}\d[A-Za-z0-9]*(?:[-/.][A-Za-z0-9]+)*)(?![\w,])/g)) {
    const k = m[1].toUpperCase().replace(/[-/.]/g, '').replace(/^0+(?=\d)/, '');
    if ((k.match(/\d/g) || []).length >= 4 && !/^\d{1,3}(?:\.\d{3})+$/.test(m[1])) aus.add(k);
  }
  return [...aus];
}

// ------------------------------------------------------------------ PDF-Text

const KEINE_POSITION = /umsatzsteuer|mehrwertsteuer|mwst|\bust\b|skonto|übertrag|uebertrag|gewicht|zahlbetrag|zahlungsbetrag|endbetrag|brutto|summe|gesamt(?!gewicht|rabatt)|zwischensumme|auftragswert|warenwert|positionswert/i;

/**
 * Eine Zeile als Position: Menge x Preis = Betrag (auf einen Cent), oder als Prozentzeile
 * Basis x Prozent = Betrag. Steht die Basis nicht in der Zeile, kommt `basisFehlt` zurueck und
 * positionenAusText sucht sie in den Zeilen darueber. Sonst null. Mehrere Moeglichkeiten: der Betrag ganz rechts.
 */
export function zeileLesen(zeile) {
  // "Fracht -Gesamt 35,00" ist ein Zuschlag, keine Summe.
  if (KEINE_POSITION.test(zeile) && !(zuschlagArt(zeile) && !/summe|steuer|mwst|brutto|skonto|zahlb|übertrag|warenwert|positionswert/i.test(zeile))) return null;
  const z = zahlenIn(zeile);
  const vorProzent = /(\d+(?:,\d{1,2})?)\s*(?:%|prozent)/i.exec(String(zeile).replace(DATUM, ' '));
  if (vorProzent) {
    const p = Number(vorProzent[1].replace(',', '.'));
    if (!(p > 0 && p < 100)) return null;
    const b = [...z].reverse().find(x => x.nachkomma === 2 && x.wert !== 0 && !nah(Math.abs(x.wert), p, 0));
    if (!b) return null;
    const basis = z.find(x => x.i < b.i && x.nachkomma === 2 && !nah(x.wert, p, 0) && nahProzent(x.wert, p, b.wert));
    return basis ? { prozent: p, basis: Math.abs(basis.wert), betrag: b.wert } : { prozent: p, betrag: b.wert, basisFehlt: true };
  }
  // Je Betrag (von rechts): erst eine Menge mit Einheit dahinter, dann Lesereihenfolge Menge, Preis, Betrag,
  // zuletzt jede Reihenfolge - manche PDFs liefern die Spalten verdreht ("94,00 EUR2 ... 47,00").
  // Der gedruckte Einzelpreis ist gerundet, gerechnet wird oft mit mehr Stellen (127,55 m2 x 6,95 = 886,45):
  // ein Cent plus 0,2 Cent je Mengeneinheit Spielraum.
  const passt = (b, p, m) => m.i !== b.i && m.i !== p.i && m.wert > 0 && m.wert < 100000 && nah(m.wert * p.wert, Math.abs(b.wert), 0.01 + m.wert * 0.002);
  for (const b of [...z].reverse().filter(x => x.nachkomma === 2 && x.wert !== 0)) {
    const preise = z.filter(x => x.i !== b.i && x.nachkomma >= 2 && x.nachkomma <= 4 && x.wert > 0);
    for (const regel of [(p, m) => m.einheit, (p, m) => m.i < p.i && p.i < b.i, () => true]) {
      for (const p of preise) {
        const m = z.find(x => passt(b, p, x) && regel(p, x));
        if (m) return { menge: m.wert, preis: p.wert, betrag: b.wert };
      }
    }
  }
  // Fester Zuschlag ohne Menge ("GLS Frachtkosten 16,00 EUR"): nur mit Zuschlagswort und dem Betrag am Zeilenende.
  const fest = /(-\s?)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(-)?\s*(?:EUR|€)?\s*$/i.exec(zeile);
  if (fest && zuschlagArt(zeile)) {
    const b = zahlenIn(fest[0]).find(x => x.nachkomma === 2);
    if (b && b.wert !== 0) return { betrag: b.wert, fest: true };
  }
  return null;
}

const SUMMEN_ZEILE = /summe|gesamt|netto|warenwert|total|auftragswert|excl|exkl/i;
const KEINE_SUMME = /übertrag|uebertrag|brutto|inkl|zahlbetrag|zahlungsbetrag|skonto|gewicht/i;
const STEUER = /mwst|steuer|\bust\b/i;

/** Gedruckte Nettosummen: Betraege aus Zeilen wie "Summe Positionen", "Gesamt Netto", "Warenwert". */
export function summenIn(text) {
  const aus = new Set();
  for (const zeile of String(text ?? '').split(/\r?\n/)) {
    if (!SUMMEN_ZEILE.test(zeile) || KEINE_SUMME.test(zeile) || (STEUER.test(zeile) && !/excl|exkl|ohne|netto/i.test(zeile))) continue;
    for (const x of zahlenIn(zeile)) if (x.nachkomma === 2 && x.wert > 0) aus.add(x.wert);
  }
  return [...aus];
}

// Spaltenkoepfe und Begleitzeilen taugen nicht als Bezeichnung einer Position.
const SPALTENKOPF = /\bpos\b|menge|preis|betrag|einheit|bezeichnung|gewicht|ean|lieferschein|lieferung\s*nr|positionswert|liefertermin/i;
// Anzeige: ohne fuehrende Positionsnummer und ohne lange Nummern (EAN, Lieferschein), die liest niemand.
// Ab dem ersten Geldbetrag stehen nur noch Menge, Preis und Betrag in der Zeile.
const kurzText = s => String(s ?? '').replace(/^\s*\d{1,3}\s+/, '').replace(/(?<![\w,.])\d{8,}(?![\w,])/g, ' ').replace(/\s-?\d{1,3}(?:\.\d{3})*,\d{2,4}\b.*$/, '').replace(/\s{2,}/g, ' ').trim().slice(0, 80);
const woerter = s => new Set((String(s ?? '').toLowerCase().match(/[a-zäöüß]{4,}/g) || []));

/**
 * Positionen aus PDF-Text mit Rechenprobe.
 * Prozentzuschlaege und -rabatte auf eine Position (Rohstoffzuschlag, Positionsrabatt) werden in deren Betrag
 * eingerechnet: manche Lieferanten drucken sie in der AB als eigene Zeile, auf der Rechnung im Preis.
 * Verglichen wird darum der Effektivpreis (Betrag / Menge). Prozentzeilen auf den ganzen Beleg bleiben eigene Zeilen.
 * @returns {{ positionen: object[], probe: boolean, grund: string|null }}
 *   Position: { menge, preis, betrag, prozent?, art (null = Ware), text, kennungen: {zeile, danach, davor} }
 */
export function positionenAusText(text, { brutto = null } = {}) {
  const zeilen = String(text ?? '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  const treffer = [];
  let ware = null; // letzte Ware; netto = samt eingerechneter Prozentzuschlaege
  let festSeitWare = 0; // feste Zuschlaege (Fracht) seit dieser Ware
  for (const zeile of zeilen) {
    let t = zeileLesen(zeile);
    if (t && t.prozent !== undefined) {
      // Basis in der Zeile oder - fehlt sie - die Zeile darueber, die letzte Ware samt Zuschlaegen, alles bisher.
      const bisher = treffer.filter(Boolean);
      const basis = t.basisFehlt
        ? [bisher.at(-1)?.betrag, ware?.netto, bisher.reduce((x, y) => x + y.betrag, 0)].find(x => x && nahProzent(x, t.prozent, t.betrag))
        : t.basis;
      if (!basis) t = null;
      else {
        const b = r2(Math.abs(basis));
        // Auf die Ware: Basis ist die Ware (samt Zuschlaegen) - oder Ware plus Fracht, dann nur der Anteil der Ware.
        const anteil = !ware ? 0 : nah(b, ware.netto, 0.02) ? 1 : nah(b, ware.netto + festSeitWare, 0.02) ? ware.netto / b : 0;
        t = { prozent: t.prozent, basis: b, betrag: t.betrag, ...(anteil ? { aufWare: r2(t.betrag * anteil) } : {}) };
      }
    } else if (t?.fest) {
      festSeitWare += t.betrag;
    } else if (t) {
      ware = t;
      t.netto = t.betrag;
      festSeitWare = 0;
    }
    if (t?.aufWare !== undefined) ware.netto = r2(ware.netto + t.aufWare);
    treffer.push(t);
  }
  const idx = treffer.map((t, i) => (t ? i : -1)).filter(i => i >= 0);
  const alle = idx.map((i, n) => {
    const t = treffer[i];
    const danach = zeilen.slice(i + 1, idx[n + 1] ?? i + 6).slice(0, 5);
    const davor = zeilen.slice(Math.max((idx[n - 1] ?? -1) + 1, i - 2), i);
    // Bezeichnung: die Zeile selbst, wenn ein Wort darin steht - sonst die buchstabenreichste daneben
    // (die Zahlenzeile ist oft nur Menge und Preis, die Bezeichnung steht darueber oder darunter).
    const buchstaben = l => (l.match(/[A-Za-zÄÖÜäöüß]/g) || []).length;
    const mitWort = /[A-Za-zÄÖÜäöüß]{4,}/.test(zeilen[i].replace(/EUR|Stk|stk|Stück/g, ' '));
    const beschreibung = mitWort ? zeilen[i] : [...danach.slice(0, 2), ...davor].filter(l => !SPALTENKOPF.test(l))
      .reduce((x, l) => (buchstaben(l) > buchstaben(x) ? l : x), zeilen[i]);
    // Art aus der Zeile selbst; besteht sie fast nur aus Zahlen, aus der Zeile darueber ("Versandkosten" / "St 9,50 9,50").
    const art = zuschlagArt(zeilen[i]) ?? (buchstaben(zeilen[i]) < 8 ? zuschlagArt(davor.at(-1)) : null) ?? (t.prozent !== undefined ? 'zuschlag' : null);
    return {
      ...t, art, text: kurzText(art ? zeilen[i] : beschreibung),
      kennungen: { zeile: kennungenIn(zeilen[i]), danach: danach.flatMap(kennungenIn), davor: davor.flatMap(kennungenIn) },
    };
  });
  if (!alle.some(p => !p.art)) return { positionen: [], probe: false, grund: 'keine Position sicher lesbar' };
  // Rechenprobe: die Summe der Zeilen bis zu einer Stelle hinter der letzten Ware steht gedruckt da ("Summe
  // Positionen", "Warenwert", "Gesamt Netto") - oder alles mit 19 % ist genau der gelesene Bruttobetrag.
  // Zuschlaege hinter dieser Stelle sind nicht nachgerechnet und zaehlen im Vergleich nicht.
  const gedruckt = summenIn(text);
  const letzteWare = alle.findLastIndex(p => !p.art);
  let geprueftBis = -1;
  let laufend = 0;
  alle.forEach((p, k) => {
    laufend = r2(laufend + p.betrag);
    if (k >= letzteWare && gedruckt.some(g => nah(g, laufend, 0.02))) geprueftBis = k;
  });
  if (typeof brutto === 'number' && nah(r2(laufend * 1.19), brutto, 0.05)) geprueftBis = alle.length - 1;
  if (geprueftBis < 0) return { positionen: [], probe: false, grund: `Summe der gelesenen Zeilen (${laufend.toFixed(2)}) steht nicht auf dem Beleg` };
  const positionen = alle.flatMap(({ netto, aufWare, basisFehlt, fest, ...p }, k) => (aufWare !== undefined ? [] : [{
    ...p, ...(p.art || netto === undefined ? {} : { betrag: netto }), ...(k > geprueftBis ? { ungeprueft: true } : {}),
  }]));
  return { positionen, probe: true, grund: null };
}

// ------------------------------------------------------------------ factur-x / ZUGFeRD (CII)

function abschnitte(xml, name) {
  return [...String(xml).matchAll(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'g'))].map(m => m[1]);
}
function wert(xml, name) {
  const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`).exec(String(xml));
  return m ? m[1] : null;
}
const zahl = (s) => { const n = Number(String(s ?? '').trim()); return s != null && String(s).trim() !== '' && Number.isFinite(n) ? n : null; };
const entities = s => String(s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/**
 * Positionen einer CII-Rechnung (factur-x, ZUGFeRD, XRechnung CII). Gelesen wird nur per Muster, ohne
 * Entity-Aufloesung. Rechenprobe: Summe der Zeilen = LineTotalAmount des Belegs.
 * shortcut: UBL-Rechnungen (Peppol) werden nicht zeilenweise gelesen und laufen ueber den PDF-Text -
 * nachruesten, sobald ein Warenlieferant nur UBL schickt.
 * @returns {null | { positionen, probe, grund }}
 */
export function positionenAusXml(xml) {
  const s = String(xml ?? '');
  if (!/CrossIndustryInvoice/.test(s)) return null;
  const positionen = abschnitte(s, 'IncludedSupplyChainTradeLineItem').map((l) => {
    const name = entities(wert(abschnitte(l, 'SpecifiedTradeProduct')[0] || '', 'Name'));
    const produkt = abschnitte(l, 'SpecifiedTradeProduct')[0] || '';
    const menge = zahl(wert(abschnitte(l, 'SpecifiedLineTradeDelivery')[0] || '', 'BilledQuantity'));
    const netto = abschnitte(l, 'NetPriceProductTradePrice')[0] || '';
    const basis = zahl(wert(netto, 'BasisQuantity')) || 1;
    const betrag = zahl(wert(abschnitte(l, 'SpecifiedTradeSettlementLineMonetarySummation')[0] || '', 'LineTotalAmount'));
    const kennungen = [wert(produkt, 'SellerAssignedID'), wert(produkt, 'BuyerAssignedID'), wert(produkt, 'GlobalID')]
      .filter(Boolean).map(k => k.toUpperCase().replace(/[-/.\s]/g, '').replace(/^0+(?=\d)/, '')).filter(k => /\d{3}/.test(k));
    return {
      menge, preis: zahl(wert(netto, 'ChargeAmount')) / basis, betrag, art: zuschlagArt(name), text: kurzText(name),
      kennungen: { zeile: [...new Set([...kennungen, ...kennungenIn(name)])], danach: [], davor: [] },
    };
  });
  // Zuschlaege und Rabatte auf den ganzen Beleg (ChargeIndicator true = Zuschlag).
  const kopf = abschnitte(s, 'ApplicableHeaderTradeSettlement')[0] || '';
  for (const c of abschnitte(kopf, 'SpecifiedTradeAllowanceCharge')) {
    const zuschlag = /true/i.test(wert(c, 'Indicator') || '');
    const betrag = zahl(wert(c, 'ActualAmount'));
    if (betrag === null) continue;
    const grund = entities(wert(c, 'Reason') || (zuschlag ? 'Zuschlag' : 'Rabatt'));
    positionen.push({
      betrag: zuschlag ? betrag : -betrag, prozent: zahl(wert(c, 'CalculationPercent')) ?? undefined,
      art: zuschlagArt(grund) ?? (zuschlag ? 'zuschlag' : 'rabatt'), text: kurzText(grund), kennungen: { zeile: [], danach: [], davor: [] },
    });
  }
  if (positionen.some(p => p.betrag === null || (!p.art && (p.menge === null || !Number.isFinite(p.preis))))) {
    return { positionen: [], probe: false, grund: 'XML-Position ohne Menge, Preis oder Betrag' };
  }
  const zeilenSumme = r2(positionen.filter(p => p.menge !== undefined).reduce((a, p) => a + p.betrag, 0));
  const gedruckt = zahl(wert(abschnitte(s, 'SpecifiedTradeSettlementHeaderMonetarySummation')[0] || '', 'LineTotalAmount'));
  const ok = gedruckt !== null && nah(gedruckt, zeilenSumme, 0.02);
  return { positionen, probe: ok, grund: ok ? null : 'Summe der XML-Zeilen passt nicht zur Belegsumme' };
}

// ------------------------------------------------------------------ Zuordnung Rechnung -> AB

const NUMMER_NACH_WORT = /(?:vorgang|auftragsbest\w*|auftr\.?-?\s*best\.?|vertriebsauftrag|belegnummer|bestellnr\.?|auftrags?-?\s*nr\.?(?:\s+[A-Za-zäöü]+)?|auftrag\s+nr\.?|orderbevestiging|order\s*confirmation|order\s*no\.?)\s*(?:nr\.?|no\.?)?\s*[:.]?\s*([A-Z]{0,3}\d[\dA-Z]*(?:[/-]\d+)*)/gi;

/**
 * Auftragsnummern des Lieferanten zu einer AB: aus Betreff/Dateiname (Lieferbeleg-Ablage) und aus dem
 * Kopf des AB-Texts hinter einem Stichwort. Nur Nummern mit mindestens 5 Ziffern - kuerzere treffen zufaellig -
 * und nur, wenn sie auch im PDF oder im Dateinamen stehen.
 */
export function abNummern({ belegnummer = null, anhaenge = [], texte = [] } = {}) {
  const n = new Set();
  if (belegnummer) n.add(belegnummer);
  for (const a of anhaenge) for (const x of String(a).matchAll(/(?<![A-Za-z0-9])([A-Z]{0,3}\d{5,}(?:-\d+)?)(?![0-9])/g)) n.add(x[1]);
  for (const t of texte) for (const x of String(t ?? '').slice(0, 3000).matchAll(NUMMER_NACH_WORT)) n.add(x[1]);
  // Steht die Nummer nur im Betreff ("Re: Auftragsbestaetigung 4711" mit anderem PDF), gehoert sie nicht zu diesem Beleg.
  const beleg = [...anhaenge, ...texte].join('\n');
  return [...n].filter(x => (x.match(/\d/g) || []).length >= 5 && (!texte.length || nummerImText(x, beleg)));
}

/** Steht die Nummer im Text? Leerzeichen, Punkt, Bindestrich und Schraegstrich dazwischen und fuehrende Nullen zaehlen nicht. */
export function nummerImText(nummer, text) {
  const zeichen = [...String(nummer).replace(/^0+(?=\d)/, '')].filter(c => /[A-Za-z0-9]/.test(c));
  if (!zeichen.length) return false;
  return new RegExp(`(?<![A-Za-z0-9])0*${zeichen.join('[\\s/.-]{0,3}')}(?![0-9])`, 'i').test(String(text ?? ''));
}

/**
 * ABs, deren Auftragsnummer in der Rechnung steht. Mehrere Mails mit derselben Nummer (geaenderte AB):
 * es zaehlt die juengste. Verschiedene Nummern = Sammelrechnung ueber mehrere Auftraege.
 * @param {string} rechnungText  PDF-Text plus Text der XML
 * @param {{id, datum, nummern: string[]}[]} abs  ABs desselben Lieferanten
 */
export function abFuerRechnung(rechnungText, abs = []) {
  const jeNummer = new Map();
  for (const ab of abs) {
    const passend = ab.nummern.filter(n => nummerImText(n, rechnungText)).sort();
    if (!passend.length) continue;
    const schluessel = passend.join('|');
    const alt = jeNummer.get(schluessel);
    if (!alt || String(ab.datum).localeCompare(String(alt.datum)) > 0) jeNummer.set(schluessel, ab);
  }
  // Teilt eine AB eine Nummer mit einer anderen (Vorgang + Vertriebsauftrag), ist es derselbe Auftrag.
  const liste = [...jeNummer.entries()].sort((a, b) => b[0].split('|').length - a[0].split('|').length);
  const aus = [];
  for (const [schluessel, ab] of liste) {
    if (aus.some(x => x.schluessel.split('|').some(n => schluessel.split('|').includes(n)))) continue;
    aus.push({ schluessel, ab });
  }
  return aus.map(x => x.ab);
}

// ------------------------------------------------------------------ Vergleich

const alleKennungen = p => [...p.kennungen.zeile, ...p.kennungen.danach, ...p.kennungen.davor];

/** Wie gut passt AB-Position a zu Rechnungsposition r? Kennung auf der Zeile zaehlt mehr als darunter oder davor. */
function treffer(r, a) {
  const ak = new Set(alleKennungen(a));
  let s = 0;
  for (const k of r.kennungen.zeile) if (ak.has(k)) s += 3;
  for (const k of r.kennungen.danach) if (ak.has(k)) s += 2;
  for (const k of r.kennungen.davor) if (ak.has(k)) s += 1;
  return s;
}

const einzelpreis = p => (p.menge ? p.betrag / p.menge : null);

/**
 * Rechnung gegen AB(s) vergleichen. Beide schon gelesen und mit bestandener Rechenprobe; abText ist der
 * ganze AB-Text (Fracht und Zuschlaege stehen dort oft nur im Summenblock, nicht als Position).
 * @returns {{ ergebnis, grund?, abweichungen: {position, art, ab, rechnung, differenz}[] }}
 */
export function vergleichen(rechnung, abPositionen, abText = '') {
  const abweichungen = [];
  const fehlend = [];
  const abWare = abPositionen.filter(p => !p.art);
  for (const r of rechnung.filter(p => !p.art)) {
    const kandidaten = abWare.map(a => ({ a, s: treffer(r, a) })).filter(x => x.s > 0);
    if (!kandidaten.length) { fehlend.push(r); continue; }
    const best = Math.max(...kandidaten.map(x => x.s));
    const gleichGut = kandidaten.filter(x => x.s === best).map(x => x.a);
    const pr = einzelpreis(r);
    // Gleichstand (dieselbe EAN fuer mehrere Qualitaeten): erst die Bezeichnung, dann der Preis, dann die Menge.
    const rw = woerter(r.text);
    const gemeinsam = x => [...woerter(x.text)].filter(w => rw.has(w)).length;
    const a = gleichGut.sort((x, y) => gemeinsam(y) - gemeinsam(x) || Math.abs(einzelpreis(x) - pr) - Math.abs(einzelpreis(y) - pr)
      || Math.abs(x.menge - r.menge) - Math.abs(y.menge - r.menge))[0];
    const pa = einzelpreis(a);
    const diffPreis = r2((pr - pa) * r.menge);
    if (diffPreis > TOLERANZ_EUR) {
      abweichungen.push({ position: r.text, art: 'preis', ab: r2(pa), rechnung: r2(pr), differenz: diffPreis, menge: r.menge });
    }
    // Weniger als bestaetigt ist eine Teillieferung; mehr kostet Geld. Zuschnitt-Rundung: 0,5 %.
    if (r.menge > a.menge * 1.005 + 0.01) {
      abweichungen.push({ position: r.text, art: 'menge', ab: a.menge, rechnung: r.menge, differenz: r2((r.menge - a.menge) * pr) });
    }
  }
  if (fehlend.length) {
    return { ergebnis: 'nicht_pruefbar', grund: `${fehlend.length === 1 ? 'Eine Position steht' : `${fehlend.length} Positionen stehen`} in keiner gefundenen AB (z. B. „${fehlend[0].text}“)`, abweichungen: [] };
  }
  // Zuschlaege je Art: gemeldet, wenn die AB die Art nirgends nennt oder einen anderen Prozentsatz.
  const artImText = new Set(String(abText).split(/\r?\n/).map(zuschlagArt).filter(Boolean));
  for (const z of rechnung.filter(p => p.art && p.art !== 'rabatt' && p.betrag > 0 && !p.ungeprueft)) {
    const inAb = abPositionen.filter(a => a.art === z.art);
    if (!inAb.length && !artImText.has(z.art)) {
      abweichungen.push({ position: z.text, art: 'zuschlag', ab: null, rechnung: z.betrag, differenz: z.betrag });
    } else if (z.prozent !== undefined && inAb.length && inAb.every(a => a.prozent !== undefined && !nah(a.prozent, z.prozent))) {
      const p = inAb[0].prozent;
      abweichungen.push({ position: z.text, art: 'prozent', ab: p, rechnung: z.prozent, differenz: r2(z.betrag - z.betrag * p / z.prozent) });
    }
  }
  // Ein Rabatt der AB, der auf der Rechnung fehlt oder kleiner ist, kostet ebenfalls Geld.
  for (const ra of abPositionen.filter(p => p.art === 'rabatt' && p.prozent !== undefined)) {
    const rr = rechnung.filter(p => p.art === 'rabatt' && p.prozent !== undefined);
    if (!rr.some(p => nah(p.prozent, ra.prozent))) {
      const basis = rechnung.filter(p => !p.art).reduce((s, p) => s + p.betrag, 0);
      const auf = rr.reduce((m, p) => Math.max(m, p.prozent), 0);
      if (auf < ra.prozent) abweichungen.push({ position: ra.text, art: 'rabatt', ab: ra.prozent, rechnung: auf || null, differenz: r2(basis * (ra.prozent - auf) / 100) });
    }
  }
  return abweichungen.length ? { ergebnis: 'abweichung', abweichungen } : { ergebnis: 'passt', abweichungen: [] };
}

/**
 * Eine Rechnung pruefen.
 * @param {{ xml?: string|null, text?: string, brutto?: number|null, art?: string }} rechnung
 * @param {{ id, datum, nummern: string[], texte: string[] }[]} abs  ABs desselben Lieferanten (alle Mails)
 * @returns {{ ergebnis, grund?, abweichungen, abIds: string[], quelle: 'xml'|'pdf-text'|null }}
 */
export function pruefeRechnung(rechnung, abs = []) {
  const nicht = (grund, extra = {}) => ({ ergebnis: 'nicht_pruefbar', grund, abweichungen: [], abIds: [], quelle: null, ...extra });
  const suchtext = `${rechnung.text || ''}\n${String(rechnung.xml || '').replace(/<[^>]+>/g, ' ')}`;
  const gefunden = abFuerRechnung(suchtext, abs);
  if (!gefunden.length) return nicht('keine AB gefunden');
  const abIds = gefunden.map(a => a.id);
  const ausXml = rechnung.xml ? positionenAusXml(rechnung.xml) : null;
  const gelesen = ausXml?.probe ? ausXml : positionenAusText(rechnung.text, { brutto: rechnung.brutto });
  const quelle = ausXml?.probe ? 'xml' : 'pdf-text';
  if (!gelesen.probe) return nicht(`Rechnung nicht sicher lesbar: ${gelesen.grund}`, { abIds, quelle });
  const abPositionen = [];
  const abTexte = [];
  for (const ab of gefunden) {
    // Eine AB-Mail kann mehrere PDFs tragen (AB, AGB): es zaehlt das, das die Rechenprobe besteht.
    const t = ab.texte.find(x => positionenAusText(x).probe);
    if (t === undefined) return nicht(`AB nicht sicher lesbar${gefunden.length > 1 ? ' (eine von mehreren)' : ''}`, { abIds, quelle });
    abPositionen.push(...positionenAusText(t).positionen);
    abTexte.push(t);
  }
  return { ...vergleichen(gelesen.positionen, abPositionen, abTexte.join('\n')), abIds, quelle };
}

// ------------------------------------------------------------------ Ablage (nur Privatordner)

export const ordnerVon = privatDir => path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'rechnungspruefung');
export const ergebnissePfad = privatDir => path.join(ordnerVon(privatDir), 'ergebnisse.json');
export const einstellungenPfad = privatDir => path.join(ordnerVon(privatDir), 'einstellungen.json');

/** Ergebnisse je Rechnung (Schluessel: sha256 des PDFs) und die Laeufe; fehlt die Datei, ist sie leer. */
export function leseErgebnisse(pfad) {
  try {
    const d = JSON.parse(fs.readFileSync(pfad, 'utf8'));
    return { rechnungen: d.rechnungen && typeof d.rechnungen === 'object' ? d.rechnungen : {}, laeufe: Array.isArray(d.laeufe) ? d.laeufe : [] };
  } catch (e) {
    if (e.code === 'ENOENT') return { rechnungen: {}, laeufe: [] };
    throw e;
  }
}

/**
 * Einstellungen (privat): mailAnVerkauf (aus, bis der Benutzer ausdruecklich Ja sagt), verkaufAn (Adresse) und
 * warenlieferanten { <Rechnungsdomain>: <AB-Domain> | null } fuer Lieferanten, deren Rechnung von woanders kommt
 * oder die keine AB per Mail schicken.
 */
export function leseEinstellungen(pfad) {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(pfad, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return { mailAnVerkauf: d.mailAnVerkauf === true, verkaufAn: typeof d.verkaufAn === 'string' ? d.verkaufAn : null, warenlieferanten: d.warenlieferanten && typeof d.warenlieferanten === 'object' ? d.warenlieferanten : {} };
}
