/**
 * SEPA-Sammeldatei (pain.001.001.09) aus archivierten Lieferantenrechnungen (belege:monat).
 *
 * Grundregel: was nicht sicher lesbar ist, kommt nie in die Datei, sondern als „unklar“ in die
 * Pruefliste. Betraege werden nicht gerechnet, sondern von der Rechnung uebernommen (Skonto gilt
 * nur auf den skontierfaehigen Teil). Die Empfaenger-IBAN kommt aus der privaten Konfiguration und
 * muss zusaetzlich auf der Rechnung stehen: eine Rechnung mit fremder IBAN wird nie bezahlt.
 *
 * Diese Datei loest keine Zahlung aus. Hochladen und Freigeben macht der Inhaber im Bankportal.
 * Kontodaten, Namen und Betraege stehen nur im Privatordner.
 */

import { xmlRechnungLesen, betragLesen, pdfTextLesen } from './belege.mjs';
import { datumLesen, namePasst, csvFeld, csvZeile, abschnitte, ersterAbschnitt as abschnitt, blatt } from './belege-bank.mjs';

const cent = n => Math.round(n * 100);
const nurZeichen = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** IBAN-Pruefziffer (ISO 13616, Modulo 97). */
export function ibanGueltig(iban) {
  const s = String(iban ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const ziffern = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}

export const tagPlus = (iso, tage) => new Date(Date.parse(`${iso}T00:00:00Z`) + tage * 86_400_000).toISOString().slice(0, 10);

/** Naechster Lauftag nach `heute`: Freitag (Benutzer 19.11.2026, vorher Montag und Donnerstag). */
export function naechsterLauf(heute) {
  for (let i = 1; i <= 7; i += 1) {
    const tag = tagPlus(heute, i);
    if (new Date(`${tag}T00:00:00Z`).getUTCDay() === 5) return tag;
  }
  throw new Error(`kein Lauftag nach ${heute}`);
}

// Lieferant A druckt das Datum manchmal mit Leerzeichen statt Punkten („23 11 26“, Rechnung vom 09.11.2026).
const DATUM = String.raw`(\d{1,2}[. ]\d{1,2}[. ](?:\d{4}|\d{2}))`;
const BETRAG = String.raw`(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})`;
const SKONTO_ZEILE = new RegExp(`Zahlung bis ${DATUM} ${BETRAG} % Skonto ${BETRAG} EUR Zahlung ${BETRAG} EUR`, 'g');
const NETTO_ZEILE = new RegExp(`Nettof(?:ä|ae)lligkeit ${DATUM} netto Zahlung ${BETRAG} EUR`, 'g');

/** Kalendertag, den es wirklich gibt (kein 31.02.). */
const echterTag = (text) => {
  const iso = datumLesen(String(text).replace(/ /g, '.'));
  return iso && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && tagPlus(iso, 0) === iso ? iso : null;
};

/**
 * Zahlungsbedingungen von Lieferant A: „Zahlung bis <Datum> 2,00 % Skonto <Betrag> EUR Zahlung
 * <Betrag> EUR“ und „Nettofaelligkeit <Datum> netto Zahlung <Betrag> EUR“. Genau eine Netto-Zeile,
 * hoechstens eine Skonto-Zeile; alles andere ist nicht sicher und gibt null.
 */
export function zahlungsbedingungenLesen(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  const netto = [...t.matchAll(NETTO_ZEILE)];
  const skonto = [...t.matchAll(SKONTO_ZEILE)];
  if (netto.length !== 1 || skonto.length > 1) return null;
  // Das Wort Skonto ohne lesbare Skonto-Zeile: lieber unklar als Skonto verschenken oder falsch ziehen.
  if (!skonto.length && /skonto/i.test(t)) return null;
  const raus = { nettoFaellig: echterTag(netto[0][1]), nettoBetrag: betragLesen(netto[0][2]), skonto: null };
  if (!raus.nettoFaellig || raus.nettoBetrag === null) return null;
  if (skonto.length) {
    const s = { bis: echterTag(skonto[0][1]), betrag: betragLesen(skonto[0][3]), zahlbetrag: betragLesen(skonto[0][4]) };
    if (!s.bis || s.betrag === null || s.zahlbetrag === null) return null;
    raus.skonto = s;
  }
  return raus;
}

/**
 * Eine Rechnungs-XML (Factur-X/ZUGFeRD, CII) pruefen.
 * @returns {{ status: 'ok'|'gutschrift'|'lastschrift'|'unklar', grund?: string, nummer, brutto, skonto, nettoFaellig }}
 */
export function rechnungPruefen(xml, { iban }, pdfText = () => '') {
  const f = xmlRechnungLesen(xml);
  const kopf = { nummer: f?.nummer ?? null, datum: f?.datum ?? null, brutto: f?.brutto ?? null, skonto: null, nettoFaellig: null };
  const unklar = grund => ({ ...kopf, status: 'unklar', grund });
  if (!f || f.format !== 'CII') return unklar('keine lesbare Factur-X-Rechnung');
  if (f.art === 'gutschrift' || (f.brutto !== null && f.brutto < 0)) return { ...kopf, status: 'gutschrift', grund: 'Gutschrift: nicht überweisen, mit einer Rechnung verrechnen' };
  if (!/^[A-Za-z0-9][A-Za-z0-9/._-]{2,29}$/.test(f.nummer || '')) return unklar('Rechnungsnummer nicht lesbar');
  if (f.waehrung !== 'EUR') return unklar('Währung nicht EUR');
  if (f.brutto === null || f.brutto <= 0) return unklar('Rechnungswert nicht lesbar');
  const mittel = abschnitte(xml, 'SpecifiedTradeSettlementPaymentMeans');
  if (mittel.some(m => blatt(m, 'TypeCode') === '59')) return { ...kopf, status: 'lastschrift', grund: 'Rechnung nennt Lastschrift: nicht überweisen' };
  const faellig = Number(blatt(abschnitt(xml, 'SpecifiedTradeSettlementHeaderMonetarySummation'), 'DuePayableAmount') || NaN);
  if (cent(faellig) !== cent(f.brutto)) return unklar('offener Betrag weicht vom Rechnungswert ab (Anzahlung?)');
  const b = zahlungsbedingungenLesen(blatt(abschnitt(xml, 'SpecifiedTradePaymentTerms'), 'Description'))
    ?? xrechnungSkontoLesen(abschnitte(xml, 'SpecifiedTradePaymentTerms').join('\n'), {
      datum: f.datum, brutto: f.brutto,
      zuschlaege: Number(blatt(abschnitt(xml, 'SpecifiedTradeSettlementHeaderMonetarySummation'), 'ChargeTotalAmount') || 0),
      ...summenLesen(xml),
    });
  // Ohne lesbares Skonto nur, wenn in keinem Bedingungsblock Skonto steht: dann ist der volle Betrag richtig.
  // Roh gelesen, damit auch CDATA oder andere Unterfelder zaehlen.
  // Lexware schreibt „#SKONTO#TAGE=7#PROZENT=0.00#“ auch ohne Skonto: 0 % zaehlt nicht als Skonto.
  const alleBedingungen = abschnitte(xml, 'SpecifiedTradePaymentTerms').join('\n').replace(/#SKONTO#TAGE=\d+#PROZENT=0+(?:[.,]0+)?#/gi, '');
  if (!b?.skonto && !b?.vollerBetrag && /skonto|discount/i.test(alleBedingungen)) return unklar('Zahlungsbedingungen mit Skonto nicht lesbar');
  if (b) kopf.nettoFaellig = b.nettoFaellig;
  if (b && cent(b.nettoBetrag) !== cent(f.brutto)) return unklar('Nettozahlung weicht vom Rechnungswert ab');
  if (b?.skonto) {
    const s = b.skonto;
    // Plausibel: Skonto plus Zahlbetrag ergibt den Rechnungswert, hoechstens 5 %, Frist nicht nach der Nettofaelligkeit.
    if (cent(s.betrag) <= 0 || cent(s.betrag) + cent(s.zahlbetrag) !== cent(f.brutto) || s.betrag > f.brutto * 0.05 || (b.nettoFaellig && s.bis > b.nettoFaellig)) return unklar('Skonto-Angaben nicht stimmig');
    kopf.skonto = s;
  }
  // Nur Empfaengerkonten zaehlen, nicht das Konto des Zahlers.
  const ibans = abschnitte(xml, 'PayeePartyCreditorFinancialAccount').map(k => blatt(k, 'IBANID').replace(/\s+/g, '').toUpperCase());
  // Ohne Empfaengerkonto in der XML (z. B. Hauptlieferant B): dann muss es im PDF derselben Rechnung stehen.
  const ibanBelegt = ibans.length ? ibans.includes(iban) : nurZeichen(pdfText()).includes(iban);
  if (!ibanBelegt) return unklar('IBAN aus der Konfiguration steht nicht als Empfängerkonto auf der Rechnung');
  return { ...kopf, status: 'ok' };
}

/**
 * Skonto als XRechnung-Kennung „#SKONTO#TAGE=10#PROZENT=4.00#“ (optional „BASISBETRAG=…#“), gerechnet
 * vom Rechnungsdatum. Nur genau eine Kennung mit mehr als 0 %; sonst null (dann sperrt der Aufrufer).
 */
/** Warensumme, Steuerbasis und Nachlaesse aus dem Summenblock (fuer Skonto nur auf den Warenanteil). */
const summenLesen = (xml) => {
  const s = abschnitt(xml, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  const zahl = n => { const w = blatt(s, n); return w === '' ? null : Number(w); };
  return { warensumme: zahl('LineTotalAmount'), steuerbasis: zahl('TaxBasisTotalAmount'), nachlaesse: zahl('AllowanceTotalAmount') || 0 };
};

export function xrechnungSkontoLesen(text, { datum, brutto, zuschlaege = 0, warensumme = null, steuerbasis = null, nachlaesse = 0 }) {
  // Jede Kennung muss vollstaendig lesbar sein; ein uebriges Feld (z. B. „BASISBETRAG=50,00#“) sperrt.
  const alle = [...String(text ?? '').matchAll(/#SKONTO#TAGE=(\d{1,3})#PROZENT=(\d{1,2}(?:\.\d{1,2})?)#(?:BASISBETRAG=(\d+(?:\.\d{1,2})?)#)?(?![A-Z]+=)/gi)];
  if (alle.length !== (String(text ?? '').match(/#SKONTO#/gi) || []).length) return null;
  const treffer = alle.filter(m => Number(m[2]) > 0);
  // Echter Kalendertag, sonst wirft tagPlus und der ganze Lauf bricht ab.
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(datum || '') ? new Date(`${datum}T00:00:00Z`) : null;
  const tagOk = Boolean(tag) && !Number.isNaN(tag.getTime()) && tag.toISOString().slice(0, 10) === datum;
  if (treffer.length !== 1 || !tagOk || !(brutto > 0)) return null;
  const [, tage, prozent, basisText] = treffer[0];
  // Zuschlaege (Fracht) ohne angegebene Basis: Skonto nur auf den Warenanteil, brutto im Verhaeltnis
  // Warensumme zu Steuerbasis (so zahlt der Inhaber: Lieferant AKO 4037401, 302,24 -> 290,39 am 06.11.2026).
  // Nur wenn die Summen aufgehen; sonst lieber voll zahlen als zu wenig.
  let basis = basisText === undefined ? brutto : Number(basisText);
  if (basisText === undefined && zuschlaege > 0) {
    const stimmig = warensumme > 0 && steuerbasis > 0 && !nachlaesse && cent(warensumme + zuschlaege) === cent(steuerbasis);
    if (!stimmig) return { nettoFaellig: null, nettoBetrag: brutto, skonto: null, vollerBetrag: true };
    basis = Math.round(brutto * warensumme / steuerbasis * 100) / 100;
  }
  if (!(basis > 0) || cent(basis) > cent(brutto) || Number(prozent) > 5) return null;
  const betrag = Math.round(basis * Number(prozent)) / 100;
  return { nettoFaellig: null, nettoBetrag: brutto, skonto: { bis: tagPlus(datum, Number(tage)), betrag, zahlbetrag: (cent(brutto) - cent(betrag)) / 100 } };
}

/** Betrag so, wie er auf deutschen Rechnungen steht: 1.234,56 oder 1234,56. */
const betragImText = (text, n) => {
  const [e, c] = n.toFixed(2).split('.');
  const mitPunkt = e.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return [`${mitPunkt},${c}`, `${e},${c}`].some(b => new RegExp(`(^|[^0-9.,])${b.replace(/\./g, '\\.')}($|[^0-9])`).test(text));
};

/**
 * Reine PDF-Rechnung (ohne Factur-X): Nummer und Bruttobetrag kommen aus dem Archiv (belege:monat),
 * und beide muessen samt Empfaenger-IBAN aus der Konfiguration woertlich im PDF-Text stehen.
 * Die Faelligkeit wird nicht gelesen: gezahlt wird der volle Betrag, nur in EUR und nur mit aktuellem
 * Kontoauszug (siehe auswaehlen). Jeder Hinweis auf Skonto, Einzug, Vorkasse oder Gutschrift macht sie unklar.
 */
/** Gesperrter Druck (Spedition): „R e c h n u n g“ und „63 , 63“ werden zu „Rechnung“ und „63,63“. */
export const pdfTextGlaetten = text => String(text ?? '')
  .replace(/\b(?:[A-Za-zÄÖÜäöü] ){3,}[A-Za-zÄÖÜäöü]\b/g, m => m.replace(/ /g, ''))
  .replace(/(\d) +, *(\d{2})(?!\d)/g, '$1,$2');

/**
 * Bruttobetrag ohne Beschriftung: genau ein Betrag X, fuer den Netto N und Steuer S (19 % oder 7 % von N,
 * auf den Cent) mit N + S = X im Text stehen. Mehrdeutig oder nichts: null.
 */
export function bruttoAusSummen(text) {
  const werte = [...new Set([...String(text ?? '').matchAll(/(?<![0-9.,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?![0-9])/g)].map(m => cent(betragLesen(m[1]))))];
  const da = new Set(werte);
  const treffer = new Set();
  for (const n of werte) for (const q of [19, 7]) {
    const st = Math.round(n * q / 100);
    if (st > 0 && da.has(st) && da.has(n + st)) treffer.add(n + st);
  }
  // Rabatt, Abzug, Anzahlung oder negative Betraege: das Gesamt liegt dann nicht am Ende der Rechenprobe.
  if (/rabatt|nachlass|abzug|abz(?:ü|ue)g|abzgl|gutschrift|anzahlung|bereits|teilzahlung|(?:^|\s)[-−–]\s*\d+,\d{2}/i.test(String(text ?? ''))) return null;
  // Nur das Rechnungsgesamt: der groesste Betrag im Text (eine Positionssumme daneben zaehlt nicht).
  return treffer.size === 1 && [...treffer][0] === Math.max(...werte) ? [...treffer][0] / 100 : null;
}

const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
/** Genau ein ausgeschriebenes Datum („23. November 2026“) im Text, sonst null. */
export function monatsDatum(text) {
  // Ist ein Rechnungsdatum beschriftet, aber nicht lesbar (z. B. 03/11/2026): nicht raten.
  if (/rechnungsdatum|datum\s*:/i.test(String(text ?? ''))) return null;
  // Zahlungsziel oder Lieferdatum („zahlbar bis 23. November 2026“) ist kein Rechnungsdatum.
  const d = new Set([...String(text ?? '').matchAll(/(?<!(?:bis|zahlbar|f(?:ä|ae)llig|sp(?:ä|ae)testens|vom|ab|liefer\w*|leistung\w*)[^\n]{0,15})(\d{1,2})\.\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/gi)]
    .map(m => `${m[3]}-${String(MONATE.indexOf(m[2].toLowerCase().replace('maerz', 'märz')) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`));
  return d.size === 1 && echterIsoTag([...d][0]) ? [...d][0] : null;
}

/** ISO-Tag, den es gibt (kein 31.11.); ungueltige Daten sperren statt den Lauf abzubrechen. */
const echterIsoTag = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;

export function pdfRechnungPruefen({ text, nummer, brutto, waehrung, datum, rechnungsdatum }, { iban, vorlage = null }) {
  const t = pdfTextGlaetten(text);
  // Skontofrist nur ab einem belegten Rechnungsdatum (Archiv oder Text), nie ab dem Eingangstag der Mail.
  const rdatum = rechnungsdatum ?? (rechnungsdatum === undefined ? datum : null) ?? pdfTextLesen(t).datum ?? monatsDatum(t);
  // Fehlen Nummer oder Betrag im Archiv: derselbe Leser wie belege:monat, auf dem geglaetteten Text
  // (er schliesst Netto-Zeilen aus und gibt bei mehreren verschiedenen Betraegen nichts zurueck).
  if (!nummer || brutto === null || brutto === undefined || !waehrung) {
    const felder = pdfTextLesen(t);
    nummer ||= felder.nummer ?? null;
    // Spaltensatz (Texterkennung): Beschriftung und Betrag stehen getrennt; dann zaehlt nur die Rechenprobe.
    if (brutto === null || brutto === undefined) brutto = felder.brutto ?? (vorlage?.rechenprobe ? bruttoAusSummen(t) : null);
    waehrung ||= felder.waehrung;
  }
  // Ausdruecklich als Anhang einer Rechnung bezeichnet (Leistungsuebersicht), ohne Storno oder Korrektur.
  const anhang = /(anhang|anlage)\s+zu(r)?\s+rechnung/i.test(t) && !/gutschrift|storno|korrektur/i.test(t);
  const kopf = { nummer: nummer ?? null, datum: datum ?? null, brutto: brutto ?? null, skonto: null, nettoFaellig: null, pdf: true, anhang };
  // Fuer die Handzahlung: „innerhalb von 10 Tagen mit 4% Skonto“ als Vorschlag ausrechnen (nie automatisch gezahlt).
  const sk = /innerhalb\s+(?:von\s+)?(\d{1,3})\s+Tagen\s+(?:mit|abz(?:ü|ue)glich)\s+(\d{1,2}(?:,\d{1,2})?)\s*%\s*Skonto/i.exec(t);
  const vorschlag = sk && typeof brutto === 'number' && brutto > 0 && /^\d{4}-\d{2}-\d{2}$/.test(datum || '') && Number(sk[2].replace(',', '.')) <= 5
    ? (() => { const betrag = Math.round(brutto * Number(sk[2].replace(',', '.'))) / 100; return `; Vorschlag: ${sk[2]} % Skonto bis ${tagPlus(datum, Number(sk[1]))} = ${((cent(brutto) - cent(betrag)) / 100).toFixed(2).replace('.', ',')} EUR`; })()
    : '';
  const unklar = grund => ({ ...kopf, status: 'unklar', grund: grund + vorschlag });
  if (!t.trim()) return unklar('PDF-Text nicht lesbar');
  if (waehrung !== 'EUR') return unklar('Währung nicht eindeutig EUR');
  if (!/^[A-Za-z0-9][A-Za-z0-9/._-]{2,29}$/.test(nummer || '') || !nurZeichen(t).includes(nurZeichen(nummer))) return unklar('Rechnungsnummer nicht sicher im PDF');
  if (typeof brutto !== 'number' || !(brutto > 0) || !betragImText(t, brutto)) return unklar('Rechnungsbetrag nicht sicher im PDF');
  if (/gutschrift|storno|korrekturrechnung/i.test(t)) return unklar('PDF nennt Gutschrift oder Storno');
  // Skonto nur mit genau einer lesbaren Stufe (Tage + Satz) und Rechnungsdatum, gerechnet auf den Rechnungsbetrag
  // (so zahlt der Inhaber, z. B. 105,11 -> 100,91 am 09.11.2026). Sonst von Hand.
  if (/skonto/i.test(t)) {
    const stufen = [...t.matchAll(/(?:innerhalb\s+(?:von\s+)?)?(\d{1,3})\s+Tag(?:e|en)\s+(?:mit\s+|abz(?:ü|ue)glich\s+)?-?\s*(\d{1,2}(?:,\d{1,2})?)\s*%\s*Skonto/gi)];
    // PDF-Text plus Texterkennung nennen dieselbe Stufe zweimal: gleiche Stufen zaehlen einmal,
    // aber jedes Wort Skonto muss zu einer gelesenen Stufe gehoeren.
    const verschieden = new Set(stufen.map(m => `${Number(m[1])}|${m[2]}`));
    const satz = verschieden.size === 1 ? Number(stufen[0][2].replace(',', '.')) : NaN;
    // Eingeschraenkte Basis („nur auf den Warenwert“, „ohne Fracht“, skontofaehig): nicht selbst rechnen.
    // Nach der Stufe darf nur das Nettoziel folgen („30 Tage Netto“ / „ohne Abzug“); jede Einschraenkung irgendwo sperrt.
    const ende = stufen.length ? stufen[0].index + stufen[0][0].length : 0;
    const danach = stufen.length ? t.slice(ende, ende + 60) : 'keine Stufe';
    const nurNettoziel = /^[\s,.;:]*(?:$|\n|(?:innerhalb\s+(?:von\s+)?)?\d{1,3}\s+Tag(?:e|en)[\s,]*(?:netto|ohne\s+abzug|rein\s+netto)\b)/i.test(danach);
    const eingeschraenkt = !nurNettoziel || /ausgenommen|ausgeschlossen|exkl|skontof(?:ä|ae)hig|nicht\s+skont|warenwert|nur\s+auf|ohne\s+(?:fracht|versand|porto)|fracht\w*\s*\(|\(\s*(?:ohne|nicht|exkl)/i.test(t);
    // Nur mit Vorlage und nur, wenn die Rechnung genau deren Stufe nennt (sonst ist etwas anders: von Hand).
    const wieVorlage = Boolean(vorlage) && verschieden.size === 1 && Number(stufen[0][1]) === vorlage.skontoTage && satz === vorlage.skontoProzent;
    if (!wieVorlage || (t.match(/skonto/gi) || []).length !== stufen.length || eingeschraenkt || !echterIsoTag(rdatum)) return unklar('PDF nennt Skonto: Betrag selbst prüfen');
    const betrag = Math.round(brutto * satz) / 100;
    kopf.skonto = { bis: tagPlus(rdatum, Number(stufen[0][1])), betrag, zahlbetrag: (cent(brutto) - cent(betrag)) / 100 };
  }
  if (/lastschrift|abgebucht|eingezogen|bankeinzug|einzugserm|mandat/i.test(t)) return unklar('PDF nennt Lastschrift oder Einzug');
  if (/bereits (bezahlt|beglichen|erhalten)|dankend erhalten|vorkasse|anzahlung|abschlag|teilzahlung|paypal|kreditkarte/i.test(t)) return unklar('PDF nennt Vorkasse, Anzahlung oder schon bezahlt');
  if (!nurZeichen(t).includes(iban)) return unklar('IBAN aus der Konfiguration steht nicht im PDF');
  return { ...kopf, status: 'ok' };
}

/** Private Konfiguration pruefen. Fehler hier brechen den Lauf ab: ohne sichere Konten keine Datei. */
export function konfigPruefen(k) {
  const iban = s => String(s ?? '').replace(/\s+/g, '').toUpperCase();
  const a = k?.auftraggeber || {};
  if (!String(a.name || '').trim() || !ibanGueltig(a.iban) || !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(String(a.bic || ''))) throw new Error('Konfiguration: auftraggeber braucht name, gültige iban und bic');
  const lieferanten = {};
  for (const [schluessel, l] of Object.entries(k.lieferanten || {})) {
    const lastschrift = l.zahlart === 'lastschrift';
    if (!lastschrift && (!String(l.name || '').trim() || !ibanGueltig(l.iban))) throw new Error(`Konfiguration: Lieferant ${schluessel} braucht name und gültige iban`);
    // Vorlage (vom Inhaber bestaetigte Zahlungsbedingungen, Benutzer 24.11.2026): nur damit wird Skonto aus einer
    // reinen PDF-Rechnung automatisch gerechnet, und nur der Betrag dieses Lieferanten darf aus der Rechenprobe kommen.
    const v = l.vorlage;
    if (v !== undefined && !(Number.isInteger(v?.skontoTage) && v.skontoTage > 0 && v.skontoTage <= 60 && v.skontoProzent > 0 && v.skontoProzent <= 5)) throw new Error(`Konfiguration: Lieferant ${schluessel} hat eine ungültige vorlage`);
    lieferanten[schluessel] = { name: String(l.name || schluessel).trim(), iban: iban(l.iban), zweck: String(l.verwendungszweck || '').trim(), lastschrift, sepaAnfrage: String(l.sepaAnfrage || '').trim(), vorlage: v ? { skontoTage: v.skontoTage, skontoProzent: Number(v.skontoProzent), rechenprobe: v.rechenprobe === true } : null };
  }
  // Optional: an wen Pruefliste und Datei nach dem Lauf gehen (Benutzer 20.11.2026: Laden-Postfach).
  const mailAn = k.mailAn === undefined ? null : String(k.mailAn).trim().toLowerCase();
  if (mailAn !== null && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(mailAn)) throw new Error('Konfiguration: mailAn ist keine gültige Adresse');
  return { auftraggeber: { name: a.name.trim(), iban: iban(a.iban), bic: a.bic }, lieferanten, mailAn };
}

/**
 * Welche Rechnungen sind laut Kontoauszug bezahlt? Erst die Rechnungsnummer im Zweck, dann – weil
 * manche Exporte den Zweck kuerzen – genau der Zahlbetrag (mit Skonto oder netto) an diesen
 * Empfaenger, nicht vor dem Rechnungsdatum. Jede Buchung deckt hoechstens eine Rechnung.
 * @param offene [{ nummer, datum, brutto, skonto, schluessel }]
 * @param lieferanten aus der Konfiguration: schluessel -> { name, iban }
 * @returns Map(offene-Eintrag -> { buchung, ueber: 'nummer'|'betrag' })
 */
// Als eigenes Wort: eine Ziffernfolge mitten in IBAN oder Kundennummer ist keine Rechnungsnummer.
// Reine Ziffern duerfen rechts an Buchstaben grenzen („208415TP050“), links nie („RE700001“ ist eine andere Nummer).
const nummerIm = (zweck, nummer) => {
  const rechts = /^\d+$/.test(nummer) ? '0-9' : 'A-Z0-9';
  return new RegExp(`(^|[^A-Z0-9])${nummer.toUpperCase().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^${rechts}])`).test(String(zweck).toUpperCase());
};

/**
 * @param bekannteNummern alle Rechnungsnummern im Archiv ({ schluessel, nummer }), auch gesperrte:
 *   eine Buchung, die eine andere Rechnung desselben Absenders nennt, deckt nie ueber den Betrag.
 */
export function bankAbgleich(buchungen, offene, lieferanten, bekannteNummern = []) {
  const frei = new Set(buchungen.filter(x => x.betrag < 0));
  const treffer = new Map();
  const empfaenger = (x, o) => (x.iban && x.iban === lieferanten[o.schluessel].iban) || namePasst(x.name, { anbieter: lieferanten[o.schluessel].name, anbieterSchluessel: o.schluessel });
  const nenntAndere = (x, o) => bekannteNummern.some(n => n.schluessel === o.schluessel && n.nummer !== o.nummer && nummerIm(x.zweck, n.nummer));
  const stufen = [
    ['nummer', (x, o) => {
      if (!o.nummer) return false;
      // Unklare (nurNachDatum): eine Zahlung vor dem Rechnungsdatum gehoert zu einer frueheren Rechnung.
      if (o.nurNachDatum && o.datum && x.datum < o.datum) return false;
      // Laengere bekannte Nummern, die diese enthalten („123A“, „R-123“ zu „123“), zaehlen nicht als Treffer:
      // sie werden vorher aus dem Zweck genommen. Steht „123“ zusaetzlich allein da, bleibt der Treffer.
      // Laengste zuerst: sonst zerlegt „R-123“ die „R-123-123“ und laesst „-123“ stehen.
      let zweck = String(x.zweck).toUpperCase();
      const laengere = bekannteNummern.filter(n => n.schluessel === o.schluessel).map(n => String(n.nummer).toUpperCase())
        .filter(lang => lang !== o.nummer.toUpperCase() && lang.includes(o.nummer.toUpperCase())).sort((a, b) => b.length - a.length);
      for (const lang of laengere) zweck = zweck.split(lang).join(' ');
      return nummerIm(zweck, o.nummer);
    }],
    ['betrag', (x, o) => [o.brutto, o.skonto?.zahlbetrag].some(b => b != null && cent(b) === cent(-x.betrag)) && (!o.datum || x.datum >= o.datum) && !nenntAndere(x, o)],
  ];
  for (const [ueber, passt] of stufen) {
    for (const o of offene) {
      if (treffer.has(o)) continue;
      const buchung = [...frei].find(x => empfaenger(x, o) && passt(x, o));
      if (!buchung) continue;
      frei.delete(buchung);
      // Passt eine Buchung ueber die Nummer zu mehreren Rechnungen, gilt keine als bezahlt und keine als offen.
      // Belege mit derselben Nummer desselben Absenders (Rechnung plus Anhang) sind eine Rechnung.
      const auch = ueber === 'nummer' ? offene.filter(p => p !== o && !treffer.has(p) && empfaenger(buchung, p) && passt(buchung, p)) : [];
      const mehrdeutig = auch.some(p => p.schluessel !== o.schluessel || p.nummer !== o.nummer || (p.datum && o.datum && p.datum !== o.datum));
      for (const p of [o, ...auch]) treffer.set(p, { buchung, ueber, mehrdeutig });
    }
  }
  return treffer;
}

const UMSATZ_ZEILE = /^(\d{2}\.\d{2}\.\d{4})\s{2,}(\S+(?: \S+)*)\s{2,}(.*?)\s+([+-]\d{1,3}(?:\.\d{3})*,\d{2}) EUR$/;
const UMSATZ_FOLGE = /^\d{2}\.\d{2}\.\d{4}\s{2,}(\S.*)$/;

/**
 * Text der „Umsatzuebersicht“ (PDF aus dem Bankportal, Layout-Text aus belege_pdf.py) zu Buchungen.
 * Der Buchungstext ist dort gekuerzt: Name und Betrag sind lesbar, die Rechnungsnummer meist nicht.
 * Stimmt die Zahl der gelesenen Umsaetze nicht mit der Angabe im Kopf ueberein, gilt die Datei als
 * nicht lesbar.
 */
export function umsatzPdfLesen(text) {
  const zeilen = String(text ?? '').split(/\r?\n/).map(z => z.trimEnd());
  const soll = Number(zeilen.map(z => /^\s*(\d+) Umsätze$/.exec(z)?.[1]).find(Boolean) ?? NaN);
  const buchungen = [];
  for (const [i, z] of zeilen.entries()) {
    const m = UMSATZ_ZEILE.exec(z);
    if (!m) continue;
    const zweck = `${m[3]} ${UMSATZ_FOLGE.exec(zeilen[i + 1] || '')?.[1] ?? ''}`.replace(/\s+/g, ' ').trim();
    buchungen.push({ datum: datumLesen(m[1]), betrag: betragLesen(m[4].replace('+', '')), waehrung: 'EUR', name: zweck, iban: '', zweck, art: m[2] });
  }
  if (!Number.isInteger(soll) || soll !== buchungen.length || buchungen.some(b => !b.datum || b.betrag === null)) throw new Error('Umsatzübersicht: Zahl der gelesenen Umsätze passt nicht zum Kopf');
  return { format: 'pdf', buchungen, nichtLesbar: 0 };
}

/**
 * Auswahl fuer einen Lauf. Jede Rechnung bekommt genau einen Status:
 * zahlen | spaeter | bezahlt | vorgemerkt | gutschrift | lastschrift | unklar.
 * @param belege [{ schluessel, datei, xml|null }] nur Rechnungen der konfigurierten Lieferanten
 * @param buchungen Kontoauszug oder null (dann kein Bezahlt-Abgleich)
 * @param auszugGesperrt true ohne Kontoauszug, mit unlesbarer Buchung oder Luecke: dann nichts in die Datei.
 *   Ein nur veralteter Auszug sperrt nicht (Benutzer 20.11.2026: kein woechentlicher Export); was danach
 *   bezahlt wurde, kennt nur die Vormerkliste, deshalb werden Lieferantenrechnungen nicht mehr von Hand ueberwiesen.
 * @param vorgemerkt [{ schluessel, nummer, datei }] aus frueheren Sammeldateien
 */
export function auswaehlen({ belege, fremde = [], erledigt = {}, konfig, buchungen, auszugGesperrt = false, vorgemerkt = [], heute }) {
  const naechster = naechsterLauf(heute);
  const geprueft = belege.map((b) => {
    const lieferant = konfig.lieferanten[b.schluessel];
    const basis = { schluessel: b.schluessel, lieferant: lieferant.name, beleg: b.datei, nummer: null, datum: null, brutto: null, skonto: null, nettoFaellig: null, zahlbetrag: null };
    if (lieferant.lastschrift) return { ...basis, status: 'lastschrift', grund: 'Lieferant zieht per Lastschrift ein' };
    if (!b.xml && !b.pdf) return { ...basis, status: 'unklar', grund: 'keine XML-Rechnung im Archiv' };
    const r = b.xml ? rechnungPruefen(b.xml, lieferant, b.pdfText) : pdfRechnungPruefen(b.pdf, lieferant);
    return { ...basis, nummer: r.nummer || b.nummer || b.pdf?.nummer || null, datum: r.datum, brutto: r.brutto, skonto: r.skonto, nettoFaellig: r.nettoFaellig, pdf: Boolean(r.pdf), anhang: Boolean(r.anhang), status: r.status, grund: r.grund || '' };
  });
  // Nicht eingetragene Absender: nie in die Datei, aber sichtbar, bis sie bezahlt oder erledigt sind.
  const fremdeLieferanten = {};
  const fremdGesehen = new Map();
  // Rechnung und Anhang (ohne Betrag) oder Kopie mit Nummer und Datum gleich: eine Zeile, die mit Betrag zuerst.
  // Ein anderer Betrag oder ein anderes Datum bei gleicher Nummer bleibt als eigene Zeile sichtbar.
  for (const f of [...fremde].sort((a, b) => (a.brutto === null) - (b.brutto === null))) {
    const k = f.nummer && `${f.schluessel}|${f.nummer}|${f.datum}`;
    const schon = (k && fremdGesehen.get(k)) || [];
    if (schon.length && (f.brutto === null || schon.some(b => cent(b) === cent(f.brutto)))) continue;
    if (k) fremdGesehen.set(k, [...schon, f.brutto]);
    fremdeLieferanten[f.schluessel] = { name: f.anbieter, iban: '' };
    geprueft.push({ schluessel: f.schluessel, lieferant: f.anbieter, beleg: f.datei, nummer: f.nummer, datum: f.datum, brutto: f.brutto, skonto: null, nettoFaellig: null, zahlbetrag: null, status: 'unklar', grund: 'Lieferant nicht eingetragen: von Hand zahlen oder IBAN eintragen lassen' });
  }
  for (const z of geprueft) if (erledigt[z.beleg]) Object.assign(z, { status: 'erledigt', grund: String(erledigt[z.beleg]) });
  // Dieselbe Nummer zweimal im Archiv (Kopie, erneut gesendet): nur die erste zaehlt; weicht der
  // Betrag ab, keine. Vor dem Bankabgleich, weil eine Buchung nur eine Rechnung deckt.
  const erste = new Map();
  for (const z of geprueft.filter(x => x.status === 'ok')) {
    const k = `${z.schluessel}|${z.nummer}`;
    const e = erste.get(k);
    if (!e) { erste.set(k, z); continue; }
    if (cent(e.brutto) !== cent(z.brutto)) Object.assign(e, { status: 'unklar', grund: 'Rechnungsnummer mehrfach im Archiv mit anderem Betrag' });
    Object.assign(z, { status: 'unklar', grund: 'Rechnungsnummer mehrfach im Archiv' });
  }
  // Eine unklare Fassung derselben Nummer mit anderem Betrag (Korrektur, zweite Rechnung) sperrt auch die lesbare.
  const unklarBetrag = new Map();
  for (const z of geprueft.filter(x => x.status === 'unklar' && x.nummer && x.brutto != null)) {
    const k = `${z.schluessel}|${z.nummer}`;
    unklarBetrag.set(k, [...(unklarBetrag.get(k) || []), cent(z.brutto)]);
  }
  for (const z of geprueft.filter(x => x.status === 'ok')) {
    if ((unklarBetrag.get(`${z.schluessel}|${z.nummer}`) || []).some(c => c !== cent(z.brutto))) Object.assign(z, { status: 'unklar', grund: 'Rechnungsnummer mehrfach im Archiv mit anderem Betrag' });
  }
  // Ausdruecklicher Anhang ohne Betrag zu einer lesbaren Rechnung derselben Nummer: nichts zu pruefen.
  // Storno, Korrektur oder ein sonst unlesbares Dokument bleibt unklar.
  const lesbar = new Set(geprueft.filter(x => x.status === 'ok').map(x => `${x.schluessel}|${x.nummer}`));
  for (const z of geprueft) {
    if (z.status === 'unklar' && z.anhang && z.brutto == null && z.nummer && lesbar.has(`${z.schluessel}|${z.nummer}`)) Object.assign(z, { status: 'erledigt', grund: 'Anhang zur Rechnung gleicher Nummer (ohne Betrag)' });
  }
  const istVorgemerkt = z => vorgemerkt.find(v => v.schluessel === z.schluessel && v.nummer === z.nummer);
  const ok = geprueft.filter(z => z.status === 'ok' && !istVorgemerkt(z));
  const okNummern = new Set(geprueft.filter(z => z.status === 'ok').map(z => `${z.schluessel}|${z.nummer}`));
  // Gleiche Nummer mit verschiedenen Betraegen: bleibt unklar, keine Buchung darf das aufloesen.
  const betraege = new Map();
  for (const z of geprueft.filter(x => x.status === 'unklar' && x.nummer && x.brutto != null)) {
    const k = `${z.schluessel}|${z.nummer}`;
    betraege.set(k, new Set([...(betraege.get(k) || []), cent(z.brutto)]));
  }
  const konflikt = z => (betraege.get(`${z.schluessel}|${z.nummer}`)?.size || 0) > 1;
  for (const z of geprueft) if (z.status === 'unklar' && konflikt(z) && !/anderem Betrag/.test(z.grund)) z.grund += '; Rechnungsnummer mehrfach mit anderem Betrag';
  // Unklare nur ueber eine echte Rechnungsnummer (ohne Betrag): ein gleicher Betrag soll keine offene Rechnung verdecken.
  const unklare = geprueft
    .filter(z => z.status === 'unklar' && String(z.nummer || '').replace(/[^A-Za-z0-9]/g, '').length >= 4 && !okNummern.has(`${z.schluessel}|${z.nummer}`) && !konflikt(z))
    .map(z => ({ ...z, brutto: null, skonto: null, nurNachDatum: true, quelle: z }));
  const treffer = buchungen ? bankAbgleich(buchungen, [...ok, ...unklare], { ...fremdeLieferanten, ...konfig.lieferanten }, geprueft.filter(z => z.nummer)) : new Map();
  const bank = new Map([...treffer].map(([k, v]) => [k.quelle || k, v]));
  const zeilen = geprueft.map((z) => {
    if (z.status === 'unklar') {
      const t = bank.get(z);
      return t && !t.mehrdeutig ? { ...z, status: 'bezahlt', grund: `laut Kontoauszug am ${t.buchung.datum} (Nummer im Verwendungszweck; vorher: ${z.grund})` } : z;
    }
    if (z.status !== 'ok') return z;
    const vor = istVorgemerkt(z);
    if (vor) return { ...z, status: 'vorgemerkt', grund: `schon in ${vor.datei}` };
    const t = bank.get(z);
    if (t?.mehrdeutig) return { ...z, status: 'unklar', grund: `Zahlung vom ${t.buchung.datum} passt zu mehreren Rechnungsnummern` };
    if (t) return { ...z, status: 'bezahlt', grund: `laut Kontoauszug am ${t.buchung.datum}${t.ueber === 'betrag' ? ' (Betrag und Empfänger passen, Nummer nicht sichtbar)' : ''}` };
    const r = z;
    // Benutzer 19.11.2026: jede offene Rechnung im Freitagslauf ihrer Woche zahlen, nicht auf Fristen warten.
    if (!buchungen || auszugGesperrt) return { ...z, status: 'unklar', grund: 'ohne lesbaren, lückenlosen Kontoauszug nicht in die Datei' };
    if (r.skonto && r.skonto.bis >= heute) {
      return { ...z, status: 'zahlen', zahlbetrag: r.skonto.zahlbetrag, mitSkonto: true, grund: r.skonto.bis === heute ? 'Skontofrist endet heute: heute freigeben' : 'mit Skonto' };
    }
    return { ...z, status: 'zahlen', zahlbetrag: r.brutto, mitSkonto: false, grund: r.pdf ? 'PDF-Rechnung: voller Betrag' : r.skonto ? 'Skonto verfallen, voller Betrag' : 'voller Betrag' };
  });
  return { heute, naechster, zeilen };
}

/**
 * Wochenfazit (Benutzer 24.11.2026): an wen wir in den letzten `tage` Tagen mindestens zweimal
 * ueberwiesen haben – Kandidaten, um beim Empfaenger eine SEPA-Lastschrift anzufragen. Eingetragene
 * Lieferanten erkennt der Name (namePasst), ihr Stand steht in konfiguration.json unter `sepaAnfrage`.
 * @returns [{ name, anzahl, summe, letzte, stand }] meiste Ueberweisungen zuerst
 */
export function lastschriftFazit({ buchungen, konfig, heute, tage = 90 }) {
  const ab = tagPlus(heute, -tage);
  const eigen = nurZeichen(konfig.auftraggeber.name);
  const gruppen = new Map();
  for (const b of buchungen || []) {
    if (b.art !== 'ueberweisung' || !(b.betrag < 0) || b.datum < ab || !String(b.name || '').trim() || nurZeichen(b.name) === eigen) continue;
    const l = Object.entries(konfig.lieferanten).find(([k, x]) => !x.lastschrift && namePasst(b.name, { anbieter: x.name, anbieterSchluessel: k }))?.[1];
    // Ohne Eintrag: Name ohne Umlaute und Satzzeichen („Timzo … Teppichböden“ = „… Teppichboeden“).
    const k = l ? `L:${l.name}` : nurZeichen(String(b.name).replace(/[äöüÄÖÜß]/g, c => UMLAUT[c]));
    const g = gruppen.get(k) || { name: l?.name || String(b.name).trim(), anzahl: 0, cent: 0, letzte: '', stand: l?.sepaAnfrage || '' };
    g.anzahl += 1; g.cent += cent(-b.betrag); if (b.datum > g.letzte) g.letzte = b.datum;
    gruppen.set(k, g);
  }
  return [...gruppen.values()].filter(g => g.anzahl >= 2).sort((a, b) => b.anzahl - a.anzahl || b.cent - a.cent)
    .map(({ cent: c, ...g }) => ({ ...g, summe: c / 100 }));
}

const UMLAUT = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
/** SEPA-Zeichensatz; das & im Firmennamen hat die Bank im Handversuch angenommen (Namensabgleich). */
const sepaText = (s, max) => String(s ?? '').replace(/[äöüÄÖÜß]/g, c => UMLAUT[c]).replace(/[^A-Za-z0-9/?:().,'+ &-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const xmlText = s => s.replace(/&/g, '&amp;');
const betragXml = c => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, '0')}`;
const de = n => (n === null || n === undefined ? '' : n.toFixed(2).replace('.', ','));

/**
 * pain.001.001.09 fuer die Zeilen mit Status „zahlen“. Aufbau wie die am 10.11.2026 bei der Bank
 * erprobte Datei. Das Ausfuehrungsdatum ignoriert die Bank (sie fuehrt naechstmoeglich aus).
 */
export function painBauen({ zeilen, konfig, heute, kennung }) {
  const zahlungen = zeilen.filter(z => z.status === 'zahlen').map((z) => {
    const l = konfig.lieferanten[z.schluessel];
    const c = cent(z.zahlbetrag);
    if (!Number.isInteger(c) || c <= 0) throw new Error(`Zahlbetrag ungültig bei Rechnung ${z.nummer}`);
    const zweck = sepaText(`RE ${z.nummer} ${l.zweck}${z.mitSkonto ? ` abzgl Skonto ${de(z.skonto.betrag)} EUR` : ''}`, 140);
    return { c, xml: `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${xmlText(sepaText(`RE-${z.nummer}`, 35))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${betragXml(c)}</InstdAmt></Amt>
        <Cdtr><Nm>${xmlText(sepaText(l.name, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${l.iban}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xmlText(zweck)}</Ustrd></RmtInf>
      </CdtTrfTxInf>` };
  });
  if (!zahlungen.length) return null;
  const summe = zahlungen.reduce((a, z) => a + z.c, 0);
  const a = konfig.auftraggeber;
  const name = xmlText(sepaText(a.name, 70));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${kennung}</MsgId>
      <CreDtTm>${heute}T12:00:00</CreDtTm>
      <NbOfTxs>${zahlungen.length}</NbOfTxs>
      <CtrlSum>${betragXml(summe)}</CtrlSum>
      <InitgPty><Nm>${name}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${kennung}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${zahlungen.length}</NbOfTxs>
      <CtrlSum>${betragXml(summe)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt><Dt>${heute}</Dt></ReqdExctnDt>
      <Dbtr><Nm>${name}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${a.iban}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>${a.bic}</BICFI></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${zahlungen.map(z => z.xml).join('\n')}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
  painGegenpruefen(xml, { anzahl: zahlungen.length, summeCent: summe });
  return { xml, anzahl: zahlungen.length, summeCent: summe };
}

/** Die fertige Datei noch einmal lesen: Anzahl, Kontrollsumme und jede IBAN muessen stimmen. */
export function painGegenpruefen(xml, { anzahl, summeCent }) {
  const betraege = [...xml.matchAll(/<InstdAmt Ccy="EUR">(\d+)\.(\d{2})<\/InstdAmt>/g)].map(m => Number(m[1]) * 100 + Number(m[2]));
  const summe = betraege.reduce((a, b) => a + b, 0);
  const kontroll = [...xml.matchAll(/<CtrlSum>(\d+)\.(\d{2})<\/CtrlSum>/g)].map(m => Number(m[1]) * 100 + Number(m[2]));
  const zahl = [...xml.matchAll(/<NbOfTxs>(\d+)<\/NbOfTxs>/g)].map(m => Number(m[1]));
  const ibans = [...xml.matchAll(/<IBAN>([^<]*)<\/IBAN>/g)].map(m => m[1]);
  const ok = betraege.length === anzahl && summe === summeCent && kontroll.length === 2 && kontroll.every(k => k === summe)
    && zahl.length === 2 && zahl.every(n => n === anzahl) && ibans.length === anzahl + 1 && ibans.every(ibanGueltig);
  if (!ok) throw new Error('Sammeldatei: Gegenprüfung von Anzahl, Kontrollsumme oder IBAN fehlgeschlagen – nichts geschrieben');
}

/**
 * Mailtext fuer den Laden aus der Pruefliste: was in der Datei steht und was von Hand zu klaeren ist.
 * @returns {{ betreff: string, text: string }}
 */
export function mailInhalt(prueflisteText, { lauf, datei, zahlungen, summe }) {
  const zeilen = String(prueflisteText).replace(/^\uFEFF/, '').split(/\r?\n/);
  const spalten = z => csvZeile(z, ';');
  const auswahl = status => zeilen.filter(z => z.startsWith(`${status};`)).map(spalten);
  const de = n => n.toFixed(2).replace('.', ',');
  const inDatei = auswahl('IN DATEI').map(f => `- ${f[1]}, Rechnung ${f[2]} vom ${f[3]}: ${f[8]} EUR (${f[9]})`);
  const unklar = auswahl('UNKLAR').map(f => `- ${f[1]}, Rechnung ${f[2] || '?'} vom ${f[3] || '?'}${f[4] ? `, ${f[4]} EUR` : ''}: ${f[9]}`);
  const sepa = [...auswahl('SEPA anfragen').map(f => `- ${f[1]}: ${f[2]} Überweisungen, ${f[3]} EUR (letzte ${f[4]}) – Lastschrift anfragen`),
    ...auswahl('SEPA angefragt').map(f => `- ${f[1]}: ${f[2]} Überweisungen, ${f[3]} EUR – ${f[5]}`)];
  const warnung = /ACHTUNG/.test(zeilen[1] || '') ? zeilen[1].replace(/^.*?ACHTUNG: /, 'ACHTUNG: ') : '';
  const betreff = `${datei ? `Sammelüberweisung ${lauf}: ${zahlungen} Zahlungen, ${de(summe)} EUR` : `Sammelüberweisung ${lauf}: keine Datei`}${unklar.length ? `, ${unklar.length} von Hand prüfen` : ''}${warnung ? ' – Kontoauszug prüfen' : ''}`;
  const text = [
    ...(warnung ? [warnung, ''] : []),
    datei ? `Im Anhang die Sammeldatei für die Commerzbank (${datei}) und die Prüfliste.` : 'Heute gibt es keine Sammeldatei. Die Prüfliste hängt an.',
    datei ? 'Bitte erst die Prüfliste ansehen, dann die Datei im Online-Banking hochladen und freigeben.' : '',
    '', `In der Datei (${zahlungen}):`, ...(inDatei.length ? inDatei : ['- nichts']),
    '', `Von Hand prüfen (${unklar.length}):`, ...(unklar.length ? unklar : ['- nichts']),
    ...(unklar.length && /letzte Buchung/.test(zeilen[1] || '') ? [`Bezahlt erkennt das Programm nur bis zur letzten Buchung im Kontoauszug (${(/letzte Buchung (\S+)/.exec(zeilen[1]) || [])[1]}). Was danach von Hand überwiesen wurde, kann hier noch stehen.`] : []),
    ...(sepa.length ? ['', `Wochenfazit wiederkehrende Überweisungen (${sepa.length}):`, ...sepa] : []),
    '', zeilen[1] || '',
  ].filter((z, i, a) => z !== '' || a[i - 1] !== '');
  return { betreff, text: text.join('\n') };
}

const STATUS_TEXT = { zahlen: 'IN DATEI', spaeter: 'später', bezahlt: 'bezahlt', vorgemerkt: 'schon in Datei', gutschrift: 'Gutschrift', lastschrift: 'Lastschrift', unklar: 'UNKLAR', erledigt: 'erledigt' };
const REIHENFOLGE = ['zahlen', 'unklar', 'gutschrift', 'lastschrift', 'spaeter', 'vorgemerkt', 'bezahlt', 'erledigt'];

/** Pruefliste fuer den Inhaber (Semikolon, Excel-tauglich). */
export function pruefliste({ auswahl, abgleich, datei, andere, vorStart = 0, pdfAb = '', summeCent, fazit = [] }) {
  const kopf = [
    `Sammelüberweisung Lauf ${auswahl.heute}; nächster Lauf ${auswahl.naechster}`,
    abgleich.moeglich ? `Bezahlt-Abgleich: ${abgleich.buchungen} Buchungen aus ${abgleich.dateien} Datei(en), letzte Buchung ${abgleich.bis}${abgleich.luecke || abgleich.fehler || abgleich.zeilenNichtLesbar ? ` – ACHTUNG: KONTOAUSZUG UNVOLLSTÄNDIG${abgleich.luecke ? ` (Lücke ${abgleich.luecke})` : ''}${abgleich.fehler ? ` (${abgleich.fehler} Datei(en) nicht lesbar)` : ''}${abgleich.zeilenNichtLesbar ? ` (${abgleich.zeilenNichtLesbar} Buchung(en) nicht lesbar)` : ''}: keine Datei. Umsätze der letzten 30 Tage bei der Commerzbank als CSV in Downloads speichern, dann neu laufen lassen` : abgleich.aktuell ? '' : `; danach schützt die Vormerkliste vor doppelter Zahlung (Lieferantenrechnungen nicht von Hand überweisen; ein neuer CSV-Export in Downloads ist freiwillig)`}` : 'ACHTUNG: Kein Kontoauszug-Export gefunden: keine Datei. Einmal die Umsätze der letzten 90 Tage bei der Commerzbank als CSV in Downloads speichern.',
    datei ? `Datei: ${datei}; ${auswahl.zeilen.filter(z => z.status === 'zahlen').length} Zahlungen; Summe ${de(summeCent / 100)} EUR` : 'Keine Datei: nichts zu zahlen oder Probelauf',
    `Nicht betrachtet: ${andere} Rechnung(en) anderer Lieferanten${vorStart ? `, ${vorStart} reine PDF-Rechnung(en) vor ${pdfAb}` : ''}`,
    '',
  ];
  const zeilen = [['Status', 'Lieferant', 'Rechnung', 'Rechnungsdatum', 'Rechnungswert', 'Skonto', 'Skonto bis', 'Netto fällig', 'Zahlbetrag', 'Hinweis', 'Beleg'].join(';')];
  const sortiert = [...auswahl.zeilen].sort((a, b) => REIHENFOLGE.indexOf(a.status) - REIHENFOLGE.indexOf(b.status) || String(a.nummer).localeCompare(String(b.nummer)));
  for (const z of sortiert) {
    zeilen.push([STATUS_TEXT[z.status], csvFeld(z.lieferant), csvFeld(z.nummer), z.datum || '', de(z.brutto), de(z.skonto?.betrag), z.skonto?.bis || '', z.nettoFaellig || '', de(z.zahlbetrag), csvFeld(z.grund), csvFeld(z.beleg)].join(';'));
  }
  const sepa = fazit.length ? ['', 'Wiederkehrende Überweisungen (letzte 90 Tage): per SEPA-Lastschrift anfragen?', 'Status;Empfänger;Überweisungen;Summe;letzte;Stand',
    ...fazit.map(f => [f.stand ? 'SEPA angefragt' : 'SEPA anfragen', csvFeld(f.name), f.anzahl, de(f.summe), f.letzte, csvFeld(f.stand)].join(';'))] : [];
  return `\uFEFF${[...kopf, ...zeilen, ...sepa].join('\r\n')}\r\n`;
}
