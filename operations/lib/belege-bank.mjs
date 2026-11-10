/**
 * Kontoauszug lesen (CSV der Banken oder CAMT.053) und je Empfaenger auflisten: Lastschrift oder
 * Ueberweisung, Summe, grobe Zuordnung zu den archivierten Belegen (belege:monat).
 *
 * Grundregel wie im Archiv: nichts erfinden. Eine Zeile ohne lesbares Datum oder ohne lesbaren
 * Betrag zaehlt als „nicht lesbar“, die Art bleibt „unklar“, wenn die Bank sie nicht nennt, und
 * eine Zuordnung nur ueber den Betrag ist ein Hinweis, kein Treffer.
 *
 * Bankdaten liegen nur im Privatordner; in diesem Repository stehen ausschliesslich Regeln.
 */

import { betragLesen } from './belege.mjs';

const klein = s => String(s ?? '').toLowerCase();
const rundeCent = n => Math.round(n * 100) / 100;

/** Bankdateien sind mal UTF-8, mal Windows-1252: erst streng UTF-8, sonst 1252. */
export function bankText(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

/** Eine Zeile CSV mit Anfuehrungszeichen. */
export function csvZeile(zeile, trenner) {
  const felder = [];
  let feld = '';
  let inQuote = false;
  for (let i = 0; i < zeile.length; i += 1) {
    const c = zeile[i];
    if (inQuote) {
      if (c === '"' && zeile[i + 1] === '"') { feld += '"'; i += 1; } else if (c === '"') inQuote = false; else feld += c;
    } else if (c === '"') inQuote = true;
    else if (c === trenner) { felder.push(feld.trim()); feld = ''; } else feld += c;
  }
  felder.push(feld.trim());
  return felder;
}

/** Zeilen trennen, Umbrueche innerhalb von Anfuehrungszeichen bleiben im Feld. */
function csvZeilen(text) {
  const zeilen = [];
  let aktuell = '';
  let inQuote = false;
  for (const teil of text.split(/\r?\n/)) {
    aktuell = aktuell ? `${aktuell} ${teil}` : teil;
    if ((teil.match(/"/g) || []).length % 2 === 1) inQuote = !inQuote;
    if (!inQuote) { zeilen.push(aktuell); aktuell = ''; }
  }
  if (aktuell) zeilen.push(aktuell);
  return zeilen;
}

const kopfNorm = s => klein(s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();

/** Spaltenrollen aus der Kopfzeile. Das eigene Konto (Auftragskonto) ist nie der Empfaenger. */
export function spaltenErkennen(felder) {
  const norm = felder.map(kopfNorm);
  const erste = (re, ohne = /auftragskonto/) => norm.findIndex(n => re.test(n) && !ohne.test(n));
  const spalten = {
    datum: erste(/^(buchungstag|buchungsdatum|buchung|datum)\b/),
    betrag: erste(/^(betrag|umsatz)(\b|$)/),
    soll: erste(/^(soll|ausgang)\b/),
    haben: erste(/^(haben|eingang)\b/),
    sollHaben: erste(/^s\/h$|soll\s*\/\s*haben/),
    name: [/zahlungsempfaenger/, /beguenstigter/, /zahlungsbeteiligter/, /empfaenger/, /auftraggeber/, /^name\b/].map(re => erste(re, /auftragskonto|iban|bic|konto/)).find(i => i >= 0) ?? -1,
    iban: erste(/iban/),
    art: erste(/^(buchungstext|umsatzart|umsatztyp|transaktionsart|art)\b/),
    zweck: erste(/verwendungszweck/),
    glaeubiger: erste(/glaeubiger/),
    mandat: erste(/mandat/),
    waehrung: erste(/^(waehrung|whrg)\b/),
  };
  const betragDa = spalten.betrag >= 0 || spalten.soll >= 0 || spalten.haben >= 0;
  return spalten.datum >= 0 && betragDa ? spalten : null;
}

/** "01.10.2026", "01.10.26", "2026-10-01" -> ISO; alles andere null. */
export function datumLesen(text) {
  const s = String(text ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (!de) return null;
  return `${de[3].length === 2 ? `20${de[3]}` : de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`;
}

/** Betrag einer Bankzeile: Waehrungszeichen und Vorzeichen-Plus weg, ganze Zahlen zaehlen auch. */
export function bankBetrag(text) {
  const s = String(text ?? '').replace(/€|EUR/gi, '').replace(/^\+/, '').trim();
  if (!s) return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  return betragLesen(s);
}

/**
 * Art der Zahlung aus dem, was die Bank sagt. Mandat oder Glaeubiger-ID gibt es nur bei
 * Lastschriften. Ohne Hinweis bleibt es „unklar“.
 */
export function artErkennen({ text = '', mandat = '', glaeubiger = '' }) {
  const t = klein(text);
  if (/r(ü|ue)ck-?lastschrift|retoure/.test(t)) return 'ruecklastschrift';
  if (String(mandat).trim() || String(glaeubiger).trim()) return 'lastschrift';
  if (/lastschrift|basis-?ls|sepa-?ls|direct debit/.test(t)) return 'lastschrift';
  if (/kartenzahlung|girocard|debitkarte|kreditkarte|\bvisa\b|mastercard/.test(t)) return 'karte';
  if (/(ü|ue)berweisung|dauerauftrag|echtzeit|credit transfer|gutschrift/.test(t)) return 'ueberweisung';
  if (/entgelt|geb(ü|ue)hr|abschluss|zinsen/.test(t)) return 'bank';
  return 'unklar';
}

/** CSV einer Bank zu Buchungen. Vorspann (Kontoname, Zeitraum) wird uebersprungen. */
export function csvLesen(text) {
  const zeilen = csvZeilen(text);
  let spalten = null;
  let trenner = ';';
  let start = 0;
  for (let i = 0; i < Math.min(zeilen.length, 40) && !spalten; i += 1) {
    for (const t of [';', '\t', ',']) {
      const s = spaltenErkennen(csvZeile(zeilen[i], t));
      if (s) { spalten = s; trenner = t; start = i + 1; break; }
    }
  }
  if (!spalten) throw new Error('CSV: keine Kopfzeile mit Datum und Betrag gefunden');
  const buchungen = [];
  let nichtLesbar = 0;
  const wert = (f, i) => (i >= 0 ? f[i] ?? '' : '');
  for (const zeile of zeilen.slice(start)) {
    if (!zeile.trim()) continue;
    const f = csvZeile(zeile, trenner);
    // Fuss- oder Saldozeilen haben kein Datum in der Datumsspalte.
    const datum = datumLesen(wert(f, spalten.datum));
    let betrag = bankBetrag(wert(f, spalten.betrag));
    if (betrag === null && (spalten.soll >= 0 || spalten.haben >= 0)) {
      const soll = bankBetrag(wert(f, spalten.soll));
      const haben = bankBetrag(wert(f, spalten.haben));
      if (soll !== null && soll !== 0) betrag = -Math.abs(soll);
      else if (haben !== null) betrag = Math.abs(haben);
    }
    if (betrag !== null && spalten.sollHaben >= 0 && /^s/i.test(wert(f, spalten.sollHaben))) betrag = -Math.abs(betrag);
    if (!datum || betrag === null) { if (f.some(Boolean)) nichtLesbar += 1; continue; }
    const zweck = wert(f, spalten.zweck);
    const mandat = wert(f, spalten.mandat);
    const glaeubiger = wert(f, spalten.glaeubiger);
    buchungen.push({
      datum, betrag: rundeCent(betrag), waehrung: wert(f, spalten.waehrung) || 'EUR',
      name: wert(f, spalten.name), iban: wert(f, spalten.iban).replace(/\s+/g, '').toUpperCase(), zweck,
      art: artErkennen({ text: wert(f, spalten.art) || zweck, mandat, glaeubiger }),
    });
  }
  return { format: 'csv', buchungen, nichtLesbar };
}

const xmlEntity = s => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
export const abschnitte = (xml, name) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'g'))].map(m => m[1]);
export const ersterAbschnitt = (xml, name) => abschnitte(xml, name)[0] ?? '';
export const blatt = (xml, name) => {
  const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`).exec(xml);
  return m ? xmlEntity(m[1]) : '';
};

/** CAMT-Betraege sind XML-Dezimalzahlen: auch 12.5 ist gueltig. */
const camtBetrag = (s) => (/^\d+(\.\d+)?$/.test(String(s).trim()) ? Number(s) : null);

/** Art aus dem ISO-Code (Family RDDT/IDDT = Lastschrift, ICDT/RCDT = Ueberweisung) oder dem deutschen Prtry. */
function artCamt({ kopf, tx }) {
  if (/<(?:\w+:)?RvslInd>\s*true/i.test(kopf)) return 'ruecklastschrift';
  if (blatt(tx, 'MndtId') || ersterAbschnitt(tx, 'CdtrSchmeId')) return 'lastschrift';
  const bk = `${ersterAbschnitt(kopf, 'BkTxCd')} ${ersterAbschnitt(tx, 'BkTxCd')}`;
  if (/>\s*(RDDT|IDDT)\s*</.test(bk) || /NDDT|NRTI/.test(bk)) return /NRTI/.test(bk) ? 'ruecklastschrift' : 'lastschrift';
  if (/>\s*(ICDT|RCDT)\s*</.test(bk) || /NTRF|NSTO/.test(bk)) return 'ueberweisung';
  if (/>\s*(CCRD|ICCD)\s*</.test(bk)) return 'karte';
  return artErkennen({ text: blatt(kopf, 'AddtlNtryInf') });
}

/**
 * CAMT.053 zu Buchungen. Gelesen wird per Muster, ohne Entity-Aufloesung (wie die Rechnungs-XML).
 * Eine Sammelbuchung mit Einzelbetraegen wird zu Einzelzeilen; ohne Einzelbetrag bleibt sie eine Zeile.
 */
export function camtLesen(xml) {
  const s = String(xml);
  if (!/<(?:\w+:)?(BkToCstmrStmt|BkToCstmrAcctRpt)[\s>]/.test(s)) throw new Error('XML ist kein CAMT.053-Kontoauszug');
  const buchungen = [];
  let nichtLesbar = 0;
  for (const ntry of abschnitte(s, 'Ntry')) {
    const kopf = ntry.split(/<(?:\w+:)?NtryDtls[\s>]/)[0];
    // Sts ist je nach Version direkt der Wert oder enthaelt <Cd>.
    const sts = ersterAbschnitt(kopf, 'Sts');
    const status = blatt(sts, 'Cd') || sts.trim();
    if (status && status !== 'BOOK') continue;
    const datum = datumLesen(blatt(ersterAbschnitt(kopf, 'BookgDt'), 'Dt') || blatt(ersterAbschnitt(kopf, 'BookgDt'), 'DtTm'));
    const summe = camtBetrag(blatt(kopf, 'Amt'));
    const zeichen = klein(blatt(kopf, 'CdtDbtInd')) === 'dbit' ? -1 : 1;
    const waehrung = /<(?:\w+:)?Amt[^>]*Ccy="([A-Z]{3})"/.exec(kopf)?.[1] || 'EUR';
    if (!datum || summe === null) { nichtLesbar += 1; continue; }
    const txe = abschnitte(ntry, 'TxDtls');
    const einzeln = txe.length > 1 && txe.every(t => blatt(t, 'Amt'));
    for (const tx of (einzeln ? txe : [txe.length === 1 ? txe[0] : ''])) {
      const betrag = einzeln ? camtBetrag(blatt(tx, 'Amt')) : summe;
      const parteien = ersterAbschnitt(tx, 'RltdPties');
      const gegen = zeichen < 0 ? ['Cdtr', 'CdtrAcct'] : ['Dbtr', 'DbtrAcct'];
      buchungen.push({
        datum, betrag: rundeCent(zeichen * Math.abs(betrag)), waehrung,
        name: blatt(ersterAbschnitt(parteien, gegen[0]), 'Nm'),
        iban: blatt(ersterAbschnitt(parteien, gegen[1]), 'IBAN').replace(/\s+/g, '').toUpperCase(),
        zweck: abschnitte(ersterAbschnitt(tx, 'RmtInf'), 'Ustrd').map(xmlEntity).join(' ') || blatt(kopf, 'AddtlNtryInf'),
        art: artCamt({ kopf, tx }),
      });
    }
  }
  return { format: 'camt', buchungen, nichtLesbar };
}

/** Datei erkennen: am Inhalt, nicht an der Endung. ZIP (so liefern Banken CAMT oft) wird nicht geraten. */
export function auszugLesen(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (b.subarray(0, 2).toString('latin1') === 'PK') throw new Error('ZIP-Datei: bitte zuerst entpacken und die einzelne XML angeben');
  const text = bankText(b);
  return /^\s*<\?xml|^\s*<(\w+:)?Document[\s>]/.test(text) ? camtLesen(text) : csvLesen(text);
}

const RECHTSFORM = /^(gmbh|mbh|co|kg|ag|ug|ohg|gbr|se|ltd|limited|inc|bv|haftungsbeschraenkt|und|the|der|die|das|von|fuer|deutschland|germany|ireland|europe|service|services|payment|payments)$/;
const worte = s => klein(s).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !RECHTSFORM.test(w));
const nurZeichen = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Passt der Empfaenger zum Anbieter? Mindestens ein kennzeichnendes Wort gleich. */
export function namePasst(empfaenger, beleg) {
  const e = new Set(worte(empfaenger));
  const domainStamm = String(beleg.anbieterSchluessel || '').split('.')[0];
  return [...worte(beleg.anbieter), ...worte(domainStamm)].some(w => e.has(w));
}

/**
 * Grobe Zuordnung Buchung -> Beleg. Guete: 'nummer' (Rechnungsnummer im Zweck), 'betrag-und-name',
 * 'nur-betrag' (genau ein Beleg mit diesem Betrag, nur ein Hinweis). Jeder Beleg hoechstens einmal.
 */
export function zuordnen(buchungen, belege) {
  const frei = belege.filter(b => b.rolle === 'rechnung' && !b.dublette);
  const vergeben = new Set();
  const nimm = (b, guete) => { vergeben.add(b); return { datei: b.datei, anbieter: b.anbieter, tag: b.tag, rechnungsnummer: b.rechnungsnummer, brutto: b.brutto, guete }; };
  const raus = buchungen.map(x => ({ ...x, beleg: null }));
  const stufen = [
    (x, b) => {
      const n = nurZeichen(b.rechnungsnummer);
      return n.length >= 4 && /\d/.test(n) && nurZeichen(x.zweck).includes(n) ? 'nummer' : null;
    },
    (x, b) => (b.brutto !== null && b.brutto !== undefined && Math.abs(Math.abs(x.betrag) - Math.abs(b.brutto)) < 0.005 && namePasst(x.name, b) ? 'betrag-und-name' : null),
  ];
  for (const stufe of stufen) {
    for (const x of raus) {
      if (x.beleg || x.betrag >= 0) continue;
      const beleg = frei.find(b => !vergeben.has(b) && stufe(x, b));
      if (beleg) x.beleg = nimm(beleg, stufe(x, beleg));
    }
  }
  for (const x of raus) {
    if (x.beleg || x.betrag >= 0) continue;
    const gleich = frei.filter(b => !vergeben.has(b) && b.brutto !== null && b.brutto !== undefined && Math.abs(Math.abs(x.betrag) - Math.abs(b.brutto)) < 0.005);
    if (gleich.length === 1) x.beleg = nimm(gleich[0], 'nur-betrag');
  }
  return { buchungen: raus, ohneBuchung: frei.filter(b => !vergeben.has(b)) };
}

/** Ausgaben je Empfaenger: IBAN vor Name, Art „gemischt“, wenn die Buchungen sich unterscheiden. */
export function jeEmpfaenger(buchungen) {
  const je = new Map();
  for (const x of buchungen) {
    if (x.betrag >= 0) continue;
    const schluessel = x.iban || klein(x.name) || '(ohne Name)';
    const e = je.get(schluessel) || { name: x.name || '(ohne Name)', iban: x.iban || '', arten: new Set(), anzahl: 0, summe: 0, mitBeleg: 0, buchungen: [] };
    if (!e.name || e.name === '(ohne Name)') e.name = x.name || e.name;
    e.arten.add(x.art);
    e.anzahl += 1;
    e.summe = rundeCent(e.summe + x.betrag);
    if (x.beleg) e.mitBeleg += 1;
    e.buchungen.push(x);
    je.set(schluessel, e);
  }
  return [...je.values()]
    .map(({ arten, ...e }) => ({ ...e, art: arten.size === 1 ? [...arten][0] : 'gemischt' }))
    .sort((a, b) => a.summe - b.summe || a.name.localeCompare(b.name, 'de'));
}

/** Ein CSV-Feld. Formeln aus fremden Namen duerfen in Excel nicht ausgefuehrt werden. */
export function csvFeld(s) {
  const t = String(s ?? '');
  const sicher = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return /[";\n]/.test(sicher) ? `"${sicher.replace(/"/g, '""')}"` : sicher;
}

/** Liste als CSV fuer den Inhaber (Semikolon, Excel-tauglich). */
export function listeCsv(empfaenger) {
  const f = csvFeld;
  const de = n => String(n.toFixed(2)).replace('.', ',');
  const zeilen = [['Empfaenger', 'IBAN', 'Art', 'Buchungen', 'Summe EUR', 'mit Beleg'].join(';')];
  for (const e of empfaenger) zeilen.push([f(e.name), f(e.iban), f(e.art), e.anzahl, de(e.summe), e.mitBeleg].join(';'));
  return `﻿${zeilen.join('\r\n')}\r\n`;
}
