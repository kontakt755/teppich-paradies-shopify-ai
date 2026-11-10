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

import { xmlRechnungLesen, betragLesen } from './belege.mjs';
import { datumLesen, namePasst, csvFeld } from './belege-bank.mjs';

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

const tagPlus = (iso, tage) => new Date(Date.parse(`${iso}T00:00:00Z`) + tage * 86_400_000).toISOString().slice(0, 10);

/** Naechster Lauftag nach `heute`: Montag oder Donnerstag. */
export function naechsterLauf(heute) {
  for (let i = 1; i <= 7; i += 1) {
    const tag = tagPlus(heute, i);
    if ([1, 4].includes(new Date(`${tag}T00:00:00Z`).getUTCDay())) return tag;
  }
  throw new Error(`kein Lauftag nach ${heute}`);
}

const DATUM = String.raw`(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))`;
const BETRAG = String.raw`(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})`;
const SKONTO_ZEILE = new RegExp(`Zahlung bis ${DATUM} ${BETRAG} % Skonto ${BETRAG} EUR Zahlung ${BETRAG} EUR`, 'g');
const NETTO_ZEILE = new RegExp(`Nettof(?:ä|ae)lligkeit ${DATUM} netto Zahlung ${BETRAG} EUR`, 'g');

/** Kalendertag, den es wirklich gibt (kein 31.02.). */
const echterTag = (text) => {
  const iso = datumLesen(text);
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

const abschnitt = (xml, name) => new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml)?.[1] ?? '';
const blatt = (xml, name) => new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`).exec(xml)?.[1] ?? '';

/**
 * Eine Rechnungs-XML (Factur-X/ZUGFeRD, CII) pruefen.
 * @returns {{ status: 'ok'|'gutschrift'|'lastschrift'|'unklar', grund?: string, nummer, brutto, skonto, nettoFaellig }}
 */
export function rechnungPruefen(xml, { iban }) {
  const f = xmlRechnungLesen(xml);
  const kopf = { nummer: f?.nummer ?? null, datum: f?.datum ?? null, brutto: f?.brutto ?? null, skonto: null, nettoFaellig: null };
  const unklar = grund => ({ ...kopf, status: 'unklar', grund });
  if (!f || f.format !== 'CII') return unklar('keine lesbare Factur-X-Rechnung');
  if (f.art === 'gutschrift' || (f.brutto !== null && f.brutto < 0)) return { ...kopf, status: 'gutschrift', grund: 'Gutschrift: nicht überweisen, mit einer Rechnung verrechnen' };
  if (!/^[A-Za-z0-9][A-Za-z0-9/._-]{2,29}$/.test(f.nummer || '')) return unklar('Rechnungsnummer nicht lesbar');
  if (f.waehrung !== 'EUR') return unklar('Währung nicht EUR');
  if (f.brutto === null || f.brutto <= 0) return unklar('Rechnungswert nicht lesbar');
  const mittel = abschnitt(xml, 'SpecifiedTradeSettlementPaymentMeans');
  if (blatt(mittel, 'TypeCode') === '59') return { ...kopf, status: 'lastschrift', grund: 'Rechnung nennt Lastschrift: nicht überweisen' };
  const faellig = Number(blatt(abschnitt(xml, 'SpecifiedTradeSettlementHeaderMonetarySummation'), 'DuePayableAmount') || NaN);
  if (cent(faellig) !== cent(f.brutto)) return unklar('offener Betrag weicht vom Rechnungswert ab (Anzahlung?)');
  const b = zahlungsbedingungenLesen(blatt(abschnitt(xml, 'SpecifiedTradePaymentTerms'), 'Description'));
  if (!b) return unklar('Zahlungsbedingungen nicht lesbar');
  kopf.nettoFaellig = b.nettoFaellig;
  if (cent(b.nettoBetrag) !== cent(f.brutto)) return unklar('Nettozahlung weicht vom Rechnungswert ab');
  if (b.skonto) {
    const s = b.skonto;
    // Plausibel: Skonto plus Zahlbetrag ergibt den Rechnungswert, hoechstens 5 %, Frist nicht nach der Nettofaelligkeit.
    if (cent(s.betrag) <= 0 || cent(s.betrag) + cent(s.zahlbetrag) !== cent(f.brutto) || s.betrag > f.brutto * 0.05 || s.bis > b.nettoFaellig) return unklar('Skonto-Angaben nicht stimmig');
    kopf.skonto = s;
  }
  const ibans = [...xml.matchAll(/<(?:\w+:)?IBANID>\s*([^<]*?)\s*</g)].map(m => m[1].replace(/\s+/g, '').toUpperCase());
  if (!ibans.includes(iban)) return unklar('IBAN aus der Konfiguration steht nicht auf der Rechnung');
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
    lieferanten[schluessel] = { name: String(l.name || schluessel).trim(), iban: iban(l.iban), zweck: String(l.verwendungszweck || '').trim(), lastschrift };
  }
  return { auftraggeber: { name: a.name.trim(), iban: iban(a.iban), bic: a.bic }, lieferanten };
}

/**
 * Welche Rechnungen sind laut Kontoauszug bezahlt? Erst die Rechnungsnummer im Zweck, dann – weil
 * manche Exporte den Zweck kuerzen – genau der Zahlbetrag (mit Skonto oder netto) an diesen
 * Empfaenger, nicht vor dem Rechnungsdatum. Jede Buchung deckt hoechstens eine Rechnung.
 * @param offene [{ nummer, datum, brutto, skonto, schluessel }]
 * @param lieferanten aus der Konfiguration: schluessel -> { name, iban }
 * @returns Map(offene-Eintrag -> { buchung, ueber: 'nummer'|'betrag' })
 */
export function bankAbgleich(buchungen, offene, lieferanten) {
  const frei = new Set(buchungen.filter(x => x.betrag < 0));
  const treffer = new Map();
  const empfaenger = (x, o) => (x.iban && x.iban === lieferanten[o.schluessel].iban) || namePasst(x.name, { anbieter: lieferanten[o.schluessel].name, anbieterSchluessel: o.schluessel });
  const stufen = [
    ['nummer', (x, o) => nurZeichen(x.zweck).includes(nurZeichen(o.nummer))],
    ['betrag', (x, o) => [o.brutto, o.skonto?.zahlbetrag].some(b => b != null && cent(b) === cent(-x.betrag)) && (!o.datum || x.datum >= o.datum)],
  ];
  for (const [ueber, passt] of stufen) {
    for (const o of offene) {
      if (treffer.has(o)) continue;
      const buchung = [...frei].find(x => empfaenger(x, o) && passt(x, o));
      if (buchung) { frei.delete(buchung); treffer.set(o, { buchung, ueber }); }
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
 * @param vorgemerkt [{ schluessel, nummer, datei }] aus frueheren Sammeldateien
 */
export function auswaehlen({ belege, konfig, buchungen, vorgemerkt = [], heute }) {
  const naechster = naechsterLauf(heute);
  const geprueft = belege.map((b) => {
    const lieferant = konfig.lieferanten[b.schluessel];
    const basis = { schluessel: b.schluessel, lieferant: lieferant.name, beleg: b.datei, nummer: null, datum: null, brutto: null, skonto: null, nettoFaellig: null, zahlbetrag: null };
    if (lieferant.lastschrift) return { ...basis, status: 'lastschrift', grund: 'Lieferant zieht per Lastschrift ein' };
    if (!b.xml) return { ...basis, status: 'unklar', grund: 'keine XML-Rechnung im Archiv' };
    const r = rechnungPruefen(b.xml, lieferant);
    return { ...basis, nummer: r.nummer, datum: r.datum, brutto: r.brutto, skonto: r.skonto, nettoFaellig: r.nettoFaellig, status: r.status, grund: r.grund || '' };
  });
  const istVorgemerkt = z => vorgemerkt.find(v => v.schluessel === z.schluessel && v.nummer === z.nummer);
  const bank = buchungen
    ? bankAbgleich(buchungen, geprueft.filter(z => z.status === 'ok' && !istVorgemerkt(z)), konfig.lieferanten)
    : new Map();
  const zeilen = geprueft.map((z) => {
    if (z.status !== 'ok') return z;
    const vor = istVorgemerkt(z);
    if (vor) return { ...z, status: 'vorgemerkt', grund: `schon in ${vor.datei}` };
    const t = bank.get(z);
    if (t) return { ...z, status: 'bezahlt', grund: `laut Kontoauszug am ${t.buchung.datum}${t.ueber === 'betrag' ? ' (Betrag und Empfänger passen, Nummer nicht sichtbar)' : ''}` };
    const r = z;
    if (r.skonto && r.skonto.bis >= heute) {
      // Frist bis einschliesslich naechstem Lauftag: eine Zahlung erst dann kaeme zu spaet an.
      if (r.skonto.bis > naechster) return { ...z, status: 'spaeter', grund: `Skonto bis ${r.skonto.bis}, im Lauf davor` };
      return { ...z, status: 'zahlen', zahlbetrag: r.skonto.zahlbetrag, mitSkonto: true, grund: r.skonto.bis === heute ? 'Skontofrist endet heute: heute freigeben' : 'mit Skonto' };
    }
    // Ohne Kontoauszug ist nicht belegt, dass eine Rechnung mit abgelaufener Frist noch offen ist.
    if (!buchungen && (r.skonto || r.nettoFaellig < heute)) return { ...z, status: 'unklar', grund: `${r.skonto ? 'Skonto verfallen' : 'überfällig'}, ohne Bezahlt-Abgleich nicht in die Datei` };
    if (r.nettoFaellig > naechster) return { ...z, status: 'spaeter', grund: `${r.skonto ? 'Skonto verfallen, ' : ''}netto fällig ${r.nettoFaellig}` };
    return { ...z, status: 'zahlen', zahlbetrag: r.brutto, mitSkonto: false, grund: `${r.skonto ? 'Skonto verfallen, ' : ''}${r.nettoFaellig < heute ? 'überfällig' : 'netto fällig'}` };
  });
  // Dieselbe Nummer zweimal (zwei verschiedene Belege): keiner von beiden wird bezahlt.
  const zahl = new Map();
  for (const z of zeilen) if (z.status === 'zahlen') zahl.set(`${z.schluessel}|${z.nummer}`, (zahl.get(`${z.schluessel}|${z.nummer}`) || 0) + 1);
  for (const z of zeilen) {
    if (z.status === 'zahlen' && zahl.get(`${z.schluessel}|${z.nummer}`) > 1) Object.assign(z, { status: 'unklar', zahlbetrag: null, grund: 'Rechnungsnummer mehrfach im Archiv' });
  }
  return { heute, naechster, zeilen };
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

const STATUS_TEXT = { zahlen: 'IN DATEI', spaeter: 'später', bezahlt: 'bezahlt', vorgemerkt: 'schon in Datei', gutschrift: 'Gutschrift', lastschrift: 'Lastschrift', unklar: 'UNKLAR' };
const REIHENFOLGE = ['zahlen', 'unklar', 'gutschrift', 'lastschrift', 'spaeter', 'vorgemerkt', 'bezahlt'];

/** Pruefliste fuer den Inhaber (Semikolon, Excel-tauglich). */
export function pruefliste({ auswahl, abgleich, datei, andere, summeCent }) {
  const kopf = [
    `Sammelüberweisung Lauf ${auswahl.heute}; nächster Lauf ${auswahl.naechster}`,
    abgleich.moeglich ? `Bezahlt-Abgleich: ${abgleich.buchungen} Buchungen aus ${abgleich.dateien} Datei(en)${abgleich.fehler ? `, ${abgleich.fehler} Datei(en) NICHT LESBAR` : ''}` : 'ACHTUNG: Bezahlt-Abgleich nicht möglich (kein Kontoauszug-Export gefunden). Vor der Freigabe jede Zeile selbst prüfen: nicht schon bezahlt?',
    datei ? `Datei: ${datei}; ${auswahl.zeilen.filter(z => z.status === 'zahlen').length} Zahlungen; Summe ${de(summeCent / 100)} EUR` : 'Keine Datei: nichts zu zahlen oder Probelauf',
    `Nicht betrachtet: ${andere} Rechnung(en) anderer Lieferanten`,
    '',
  ];
  const zeilen = [['Status', 'Lieferant', 'Rechnung', 'Rechnungsdatum', 'Rechnungswert', 'Skonto', 'Skonto bis', 'Netto fällig', 'Zahlbetrag', 'Hinweis', 'Beleg'].join(';')];
  const sortiert = [...auswahl.zeilen].sort((a, b) => REIHENFOLGE.indexOf(a.status) - REIHENFOLGE.indexOf(b.status) || String(a.nummer).localeCompare(String(b.nummer)));
  for (const z of sortiert) {
    zeilen.push([STATUS_TEXT[z.status], csvFeld(z.lieferant), csvFeld(z.nummer), z.datum || '', de(z.brutto), de(z.skonto?.betrag), z.skonto?.bis || '', z.nettoFaellig || '', de(z.zahlbetrag), csvFeld(z.grund), csvFeld(z.beleg)].join(';'));
  }
  return `\uFEFF${[...kopf, ...zeilen].join('\r\n')}\r\n`;
}
