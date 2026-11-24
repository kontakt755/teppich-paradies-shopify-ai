import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auswaehlen, ibanGueltig, naechsterLauf, zahlungsbedingungenLesen, rechnungPruefen, pdfRechnungPruefen, painGegenpruefen, umsatzPdfLesen, xrechnungSkontoLesen, mailInhalt, lastschriftFazit, bruttoAusSummen } from '../lib/zahlung-sammeldatei.mjs';
import { sammelLauf, laufMailen, exporteHolen, exporteZusammenfuehren, mitOcr } from '../scripts/zahlung-sammeldatei.mjs';

// Alle Daten erfunden. IBANs aus Fantasie-Kontonummern mit gerechneter Pruefziffer.
function erfundeneIban(konto) {
  const bban = `00000000${String(konto).padStart(10, '0')}`;
  let rest = 0;
  for (const z of `${bban}131400`) rest = (rest * 10 + Number(z)) % 97;
  return `DE${String(98 - rest).padStart(2, '0')}${bban}`;
}
const EIGEN = erfundeneIban(1);
const LIEFER = erfundeneIban(2);
const FREMD = erfundeneIban(3);
const HEUTE = new Date('2026-11-10T09:00:00Z'); // Dienstag, naechster Lauf Freitag 13.11.

const mitSkonto = (bis, skonto, zahl, netto, brutto) => `Zahlung bis ${bis} 2,00 % Skonto ${skonto} EUR Zahlung ${zahl} EUR\nNettofälligkeit ${netto} netto Zahlung ${brutto} EUR`;

function rechnungXml({ nummer, brutto, bedingungen, typ = '380', iban = LIEFER, mittel = '30', faellig = brutto }) {
  return `<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="r" xmlns:ram="a" xmlns:udt="u">
<rsm:ExchangedDocument><ram:ID>${nummer}</ram:ID><ram:TypeCode>${typ}</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20261028</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction><ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>${mittel}</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${iban}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
<ram:SpecifiedTradePaymentTerms><ram:Description>${bedingungen}
</ram:Description></ram:SpecifiedTradePaymentTerms>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>1.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">0.19</ram:TaxTotalAmount><ram:GrandTotalAmount>${brutto}</ram:GrandTotalAmount><ram:DuePayableAmount>${faellig}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
</ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
}

const RECHNUNGEN = {
  offen: rechnungXml({ nummer: '700001', brutto: '500.00', bedingungen: mitSkonto('11.11.26', '9,00', '491,00', '27.11.26', '500,00') }),
  spaeter: rechnungXml({ nummer: '700002', brutto: '1200.00', bedingungen: mitSkonto('20.11.26', '24,00', '1.176,00', '5.12.26', '1.200,00') }),
  verfallen: rechnungXml({ nummer: '700003', brutto: '300.00', bedingungen: mitSkonto('2.11.26', '6,00', '294,00', '12.11.26', '300,00') }),
  bezahlt: rechnungXml({ nummer: '700004', brutto: '100.00', bedingungen: mitSkonto('11.11.26', '2,00', '98,00', '27.11.26', '100,00') }),
  unlesbar: rechnungXml({ nummer: '700005', brutto: '80.00', bedingungen: 'Zahlbar nach Vereinbarung, 2 % Skonto möglich' }),
  gutschrift: rechnungXml({ nummer: '700006', brutto: '50.00', typ: '381', bedingungen: 'Gutschrift' }),
  fremdeIban: rechnungXml({ nummer: '700007', brutto: '400.00', iban: FREMD, bedingungen: mitSkonto('11.11.26', '8,00', '392,00', '27.11.26', '400,00') }),
  falschGerechnet: rechnungXml({ nummer: '700008', brutto: '400.00', bedingungen: mitSkonto('11.11.26', '8,00', '390,00', '27.11.26', '400,00') }),
};

function privatOrdner({ bank = true } = {}) {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'zahlung-'));
  const monat = path.join(privat, 'belege-archiv', '2026', '10');
  fs.mkdirSync(monat, { recursive: true });
  const beleg = (name, schluessel, extra = {}) => ({ datei: `${name}.pdf`, xmlDatei: `${name}.xml`, format: 'pdf', rolle: 'rechnung', anbieterSchluessel: schluessel, dublette: null, ...extra });
  const belege = Object.keys(RECHNUNGEN).map(n => beleg(n, 'lieferant-a.example'));
  for (const [n, xml] of Object.entries(RECHNUNGEN)) fs.writeFileSync(path.join(monat, `${n}.xml`), xml);
  belege.push(beleg('ohne-xml', 'lieferant-a.example', { xmlDatei: undefined, tag: '2026-11-02' }));
  belege.push(beleg('einzug', 'lieferant-b.example'));
  belege.push(beleg('fremd', 'lieferant-c.example'));
  belege.push(beleg('lieferschein', 'lieferant-a.example', { rolle: 'beilage' }));
  fs.writeFileSync(path.join(monat, 'manifest.json'), JSON.stringify({ belege }));
  fs.mkdirSync(path.join(privat, 'zahlungen'));
  fs.writeFileSync(path.join(privat, 'zahlungen', 'konfiguration.json'), JSON.stringify({
    auftraggeber: { name: 'Muster Böden GmbH', iban: EIGEN, bic: 'TESTDEFFXXX' },
    lieferanten: {
      'lieferant-a.example': { name: 'Muster & Söhne GmbH', iban: LIEFER, verwendungszweck: 'Kd 4711' },
      'lieferant-b.example': { zahlart: 'lastschrift' },
    },
  }));
  if (bank) {
    const ordner = path.join(privat, 'laden-entlastung-2026-11', 'bank-export');
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(path.join(ordner, 'umsaetze.csv'), `Buchungstag;Buchungstext;Verwendungszweck;Beguenstigter;IBAN;Betrag\n05.11.2026;Überweisung;RE 700004 Kd 4711;Muster & Söhne GmbH;${LIEFER};-98,00\n06.11.2026;Überweisung;Miete 700001;Hausverwaltung Beispiel;${FREMD};-900,00\n`);
  }
  return privat;
}

const listeLesen = (privat, e) => fs.readFileSync(path.join(privat, 'zahlungen', e.pruefliste), 'utf8');
const statusVon = (liste, nummer) => liste.split('\r\n').find(z => z.includes(`;${nummer};`))?.split(';')[0];

test('IBAN-Pruefziffer und Lauftage', () => {
  assert.equal(ibanGueltig(LIEFER), true);
  assert.equal(ibanGueltig(LIEFER.replace(/.$/, c => (c === '9' ? '8' : '9'))), false);
  assert.equal(ibanGueltig('DE12'), false);
  assert.equal(naechsterLauf('2026-11-10'), '2026-11-13');
  assert.equal(naechsterLauf('2026-11-13'), '2026-11-20');
  assert.equal(naechsterLauf('2026-11-19'), '2026-11-20');
});

test('Zahlungsbedingungen: mit Skonto, ohne Skonto, nicht sicher', () => {
  assert.deepEqual(zahlungsbedingungenLesen(mitSkonto('2.11.26', '24,00', '1.176,00', '27.11.26', '1.200,00')), {
    nettoFaellig: '2026-11-27', nettoBetrag: 1200, skonto: { bis: '2026-11-02', betrag: 24, zahlbetrag: 1176 },
  });
  assert.deepEqual(zahlungsbedingungenLesen('Nettofälligkeit 27.11.26 netto                 Zahlung    80,00 EUR'), { nettoFaellig: '2026-11-27', nettoBetrag: 80, skonto: null });
  assert.equal(zahlungsbedingungenLesen('Nettofälligkeit 31.02.26 netto Zahlung 80,00 EUR'), null);
  assert.equal(zahlungsbedingungenLesen('3 % Skonto bei Vorkasse\nNettofälligkeit 27.11.26 netto Zahlung 80,00 EUR'), null);
  assert.equal(zahlungsbedingungenLesen(''), null);
});

test('Rechnung pruefen: Anzahlung und Lastschrift auf der Rechnung', () => {
  const b = mitSkonto('11.11.26', '2,00', '98,00', '27.11.26', '100,00');
  assert.equal(rechnungPruefen(rechnungXml({ nummer: '700010', brutto: '100.00', faellig: '60.00', bedingungen: b }), { iban: LIEFER }).status, 'unklar');
  assert.equal(rechnungPruefen(rechnungXml({ nummer: '700011', brutto: '100.00', mittel: '59', bedingungen: b }), { iban: LIEFER }).status, 'lastschrift');
  assert.equal(rechnungPruefen(rechnungXml({ nummer: '700012', brutto: '100.00', bedingungen: b }), { iban: LIEFER }).status, 'ok');
});

test('Lauf mit Kontoauszug: alles Offene sofort, Skonto offen, verfallen, bezahlt, unlesbar, Gutschrift', () => {
  const privat = privatOrdner();
  const e = sammelLauf({ privat, schreiben: true, jetzt: HEUTE });
  assert.equal(e.bezahltAbgleich, true);
  assert.equal(e.zahlungen, 3);
  assert.equal(e.summe, 1967); // 491,00 und 1.176,00 mit Skonto + 300,00 voll (nicht auf die Frist warten)
  assert.deepEqual(e.status, { zahlen: 3, bezahlt: 1, unklar: 4, gutschrift: 1, lastschrift: 1 });
  assert.equal(e.andereLieferanten, 1);

  const xml = fs.readFileSync(path.join(privat, 'zahlungen', e.datei), 'utf8');
  assert.match(xml, /pain\.001\.001\.09/);
  assert.equal((xml.match(/<CtrlSum>1967\.00<\/CtrlSum>/g) || []).length, 2);
  assert.equal((xml.match(/<NbOfTxs>3<\/NbOfTxs>/g) || []).length, 2);
  assert.match(xml, /<InstdAmt Ccy="EUR">491\.00<\/InstdAmt>[\s\S]*<Nm>Muster &amp; Soehne GmbH<\/Nm>[\s\S]*<Ustrd>RE 700001 Kd 4711 abzgl Skonto 9,00 EUR<\/Ustrd>/);
  assert.match(xml, /<Ustrd>RE 700003 Kd 4711<\/Ustrd>/);
  assert.ok(!xml.includes(FREMD));
  for (const n of ['700004', '700005', '700006', '700007', '700008']) assert.ok(!xml.includes(n), n);

  const liste = listeLesen(privat, e);
  assert.equal(statusVon(liste, '700001'), 'IN DATEI');
  assert.equal(statusVon(liste, '700002'), 'IN DATEI');
  assert.equal(statusVon(liste, '700004'), 'bezahlt');
  assert.equal(statusVon(liste, '700005'), 'UNKLAR');
  assert.equal(statusVon(liste, '700006'), 'Gutschrift');
  assert.equal(statusVon(liste, '700007'), 'UNKLAR');
  assert.equal(statusVon(liste, '700008'), 'UNKLAR');
  assert.match(liste, /UNKLAR;[^\r]*PDF-Text nicht lesbar/);
  assert.match(liste, /Lastschrift;/);

  // Zweiter Lauf: was schon in einer Datei steht, wird nie ein zweites Mal ueberwiesen.
  const zweiter = sammelLauf({ privat, schreiben: true, jetzt: new Date('2026-11-10T10:00:00Z') });
  assert.equal(zweiter.zahlungen, 0);
  assert.equal(zweiter.datei, null);
  assert.equal(zweiter.status.vorgemerkt, 3);
});

test('Ohne Kontoauszug: deutlicher Hinweis, nichts in die Datei; Probelauf schreibt keine Datei', () => {
  const privat = privatOrdner({ bank: false });
  const e = sammelLauf({ privat, jetzt: HEUTE });
  assert.equal(e.bezahltAbgleich, false);
  assert.equal(e.datei, null);
  assert.equal(e.zahlungen, 0); // sofort zahlen heisst: nur mit Beleg, dass noch nichts bezahlt ist
  const liste = listeLesen(privat, e);
  assert.match(liste, /Kein Kontoauszug-Export gefunden: keine Datei/);
  assert.equal(statusVon(liste, '700003'), 'UNKLAR');
  assert.deepEqual(fs.readdirSync(path.join(privat, 'zahlungen')).filter(n => /\.xml$|vorgemerkt/.test(n)), []);
});

test('Konfiguration: fehlende Datei und falsche IBAN brechen ab', () => {
  const privat = privatOrdner();
  const pfad = path.join(privat, 'zahlungen', 'konfiguration.json');
  const k = JSON.parse(fs.readFileSync(pfad, 'utf8'));
  k.lieferanten['lieferant-a.example'].iban = LIEFER.replace(/.$/, c => (c === '9' ? '8' : '9'));
  fs.writeFileSync(pfad, JSON.stringify(k));
  assert.throws(() => sammelLauf({ privat, schreiben: true, jetzt: HEUTE }), /gültige iban/);
  fs.rmSync(pfad);
  assert.throws(() => sammelLauf({ privat, jetzt: HEUTE }), /Konfiguration fehlt/);
});

test('Gegenpruefung der fertigen Datei schlaegt bei falscher Kontrollsumme an', () => {
  const xml = `<NbOfTxs>1</NbOfTxs><CtrlSum>2.00</CtrlSum><NbOfTxs>1</NbOfTxs><CtrlSum>2.00</CtrlSum><IBAN>${EIGEN}</IBAN><InstdAmt Ccy="EUR">1.00</InstdAmt><IBAN>${LIEFER}</IBAN>`;
  assert.throws(() => painGegenpruefen(xml, { anzahl: 1, summeCent: 100 }), /Gegenprüfung/);
  assert.doesNotThrow(() => painGegenpruefen(xml.replaceAll('2.00', '1.00'), { anzahl: 1, summeCent: 100 }));
});

// So liefert die PDF-Umsatzuebersicht ihren Text: Zweck gekuerzt, Nummer nicht sichtbar.
const UMSATZ_TEXT = `Umsatzübersicht
                                                  Zeitraum: 01.10.2026 - 10.11.2026

3 Umsätze

Buchungstag                Umsatzart                  Buchungstext (gekürzt)                         Betrag
Wertstellung

09.11.2026                 Überweisung                Muster Soehne BANKDEFFXXX                 -491,00 EUR
09.11.2026                                            DE00... Rechn...

IBAN: DE00 0000
20.10.2026                 Lastschrift                Muster Telefon GmbH Vertrag...          -1.029,99 EUR
20.10.2026

19.10.2026                 Überweisung (Echtzeit)     Frau Beispiel Angebot...                  +300,00 EUR
19.10.2026                                            AG 1
`;

test('PDF-Umsatzuebersicht: Buchungen lesen; falsche Anzahl gilt als nicht lesbar', () => {
  const { buchungen } = umsatzPdfLesen(UMSATZ_TEXT);
  assert.deepEqual(buchungen.map(b => [b.datum, b.betrag, b.art]), [['2026-11-09', -491, 'Überweisung'], ['2026-10-20', -1029.99, 'Lastschrift'], ['2026-10-19', 300, 'Überweisung (Echtzeit)']]);
  assert.equal(buchungen[0].zweck, 'Muster Soehne BANKDEFFXXX DE00... Rechn...');
  assert.throws(() => umsatzPdfLesen(UMSATZ_TEXT.replace('3 Umsätze', '4 Umsätze')), /passt nicht/);
});

test('Abgleich ueber Betrag und Empfaenger, wenn der Zweck gekuerzt ist: jede Buchung deckt nur eine Rechnung', () => {
  const privat = privatOrdner({ bank: false });
  const ordner = path.join(privat, 'laden-entlastung-2026-11', 'bank-export');
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'umsaetze.pdf'), '%PDF-1.4 erfunden');
  // 700001 (491,00 mit Skonto) ist bezahlt; 700004 (98,00) nicht, 700003 (300,00) nur als Eingang da.
  const e = sammelLauf({ privat, jetzt: HEUTE, pdf: () => ({ text: UMSATZ_TEXT }) });
  assert.equal(e.bezahltAbgleich, true);
  const liste = listeLesen(privat, e);
  assert.equal(statusVon(liste, '700001'), 'bezahlt');
  assert.match(liste, /Betrag und Empfänger passen/);
  assert.equal(statusVon(liste, '700004'), 'IN DATEI');
  assert.equal(statusVon(liste, '700003'), 'IN DATEI');
});

test('Veralteter Kontoauszug (kein woechentlicher Export): zaehlt fuer bezahlt, Offenes kommt in die Datei, nie zweimal', () => {
  const privat = privatOrdner();
  const e = sammelLauf({ privat, schreiben: true, jetzt: new Date('2026-11-12T09:00:00Z') }); // letzte Buchung 06.11.
  assert.equal(e.auszugAktuell, false);
  const liste = listeLesen(privat, e);
  assert.match(liste, /schützt die Vormerkliste vor doppelter Zahlung/);
  assert.doesNotMatch(liste, /ACHTUNG/);
  assert.equal(statusVon(liste, '700004'), 'bezahlt');
  assert.equal(statusVon(liste, '700003'), 'IN DATEI');
  const zweiter = sammelLauf({ privat, schreiben: true, jetzt: new Date('2026-11-13T09:00:00Z') });
  assert.equal(zweiter.zahlungen, 0);
  assert.equal(statusVon(listeLesen(privat, zweiter), '700003'), 'schon in Datei');
});

test('Kopie derselben Rechnung im Archiv: eine Zahlung im Auszug deckt beide, keine geht in die Datei', () => {
  const privat = privatOrdner();
  const monat = path.join(privat, 'belege-archiv', '2026', '10');
  const pfad = path.join(monat, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(pfad, 'utf8'));
  fs.writeFileSync(path.join(monat, 'kopie.xml'), RECHNUNGEN.bezahlt);
  m.belege.push({ datei: 'kopie.pdf', xmlDatei: 'kopie.xml', format: 'pdf', rolle: 'unklar', anbieterSchluessel: 'lieferant-a.example', dublette: null });
  fs.writeFileSync(pfad, JSON.stringify(m));
  const e = sammelLauf({ privat, schreiben: true, jetzt: HEUTE });
  assert.equal(e.zahlungen, 3);
  assert.ok(!fs.readFileSync(path.join(privat, 'zahlungen', e.datei), 'utf8').includes('700004'));
  assert.match(listeLesen(privat, e), /UNKLAR;[^\r]*700004[^\r]*mehrfach im Archiv/);
});

test('Rechnungsnummer zaehlt im Zweck nur als eigenes Wort', () => {
  const privat = privatOrdner({ bank: false });
  const ordner = path.join(privat, 'laden-entlastung-2026-11', 'bank-export');
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'u.csv'), `Buchungstag;Buchungstext;Verwendungszweck;Beguenstigter;IBAN;Betrag\n09.11.2026;Überweisung;Kd 47110700001 Abschlag;Muster & Söhne GmbH;${LIEFER};-12,00\n`);
  const e = sammelLauf({ privat, jetzt: HEUTE });
  assert.equal(statusVon(listeLesen(privat, e), '700001'), 'IN DATEI');
});

const PDF_TEXT = `Rechnung Nr. R-2026-501\nRechnungsdatum 03.11.2026\nGesamtbetrag 1.234,50 EUR\nBitte überweisen Sie auf IBAN ${LIEFER.replace(/(.{4})/g, '$1 ')}\n`;

test('PDF-Rechnung: Nummer, Betrag und IBAN muessen im Text stehen; Einzug, Vorkasse, Gutschrift sind unklar', () => {
  const r = { text: PDF_TEXT, nummer: 'R-2026-501', brutto: 1234.5, waehrung: 'EUR', datum: '2026-11-03' };
  assert.equal(pdfRechnungPruefen({ ...r, waehrung: 'CHF' }, { iban: LIEFER }).status, 'unklar');
  // Archiv ohne Waehrung: sie muss eindeutig im Text stehen
  assert.equal(pdfRechnungPruefen({ ...r, waehrung: null, text: PDF_TEXT.replace(' EUR', '') }, { iban: LIEFER }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...r, waehrung: null }, { iban: LIEFER }).status, 'ok');
  assert.equal(pdfRechnungPruefen(r, { iban: LIEFER }).status, 'ok');
  assert.equal(pdfRechnungPruefen(r, { iban: FREMD }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...r, brutto: 234.5 }, { iban: LIEFER }).status, 'unklar'); // 234,50 steckt nur in 1.234,50
  assert.equal(pdfRechnungPruefen({ ...r, nummer: 'R-2026-999' }, { iban: LIEFER }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...r, brutto: null }, { iban: LIEFER }).brutto, 1234.5); // aus „Gesamtbetrag“
  assert.equal(pdfRechnungPruefen({ ...r, brutto: null, text: PDF_TEXT.replace('Gesamtbetrag', 'Summe') }, { iban: LIEFER }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...r, text: '' }, { iban: LIEFER }).status, 'unklar');
  for (const satz of ['Der Betrag wird per SEPA-Lastschrift eingezogen.', 'Betrag dankend erhalten.', 'Gutschrift Nr. 5', 'Anzahlung 30 %', 'Bei Zahlung bis 10.11. 2 % Skonto'])
    assert.equal(pdfRechnungPruefen({ ...r, text: `${PDF_TEXT}${satz}` }, { iban: LIEFER }).status, 'unklar', satz);
});

test('PDF-Rechnung im Lauf: nur mit aktuellem Auszug in die Datei, voller Betrag; aeltere als der Start bleiben draussen', () => {
  const privat = privatOrdner();
  const monat = path.join(privat, 'belege-archiv', '2026', '11');
  fs.mkdirSync(monat, { recursive: true });
  for (const n of ['neu', 'alt']) fs.writeFileSync(path.join(monat, `${n}.pdf`), '%PDF-1.4 erfunden');
  const pdfBeleg = (datei, tag) => ({ datei, format: 'pdf', pdfLesbar: true, rolle: 'rechnung', anbieterSchluessel: 'lieferant-a.example', dublette: null, rechnungsnummer: 'R-2026-501', brutto: 1234.5, waehrung: 'EUR', tag });
  fs.writeFileSync(path.join(monat, 'manifest.json'), JSON.stringify({ belege: [pdfBeleg('neu.pdf', '2026-11-03'), pdfBeleg('alt.pdf', '2026-10-20')] }));
  const pdf = () => ({ text: PDF_TEXT });

  // Auszug reicht bis 06.11.: am 10.11. aktuell genug
  const e = sammelLauf({ privat, schreiben: true, jetzt: HEUTE, pdf });
  assert.equal(e.pdfVorStart, 1);
  assert.equal(statusVon(listeLesen(privat, e), 'R-2026-501'), 'IN DATEI');
  assert.match(fs.readFileSync(path.join(privat, 'zahlungen', e.datei), 'utf8'), /<InstdAmt Ccy="EUR">1234\.50<\/InstdAmt>[\s\S]*<Ustrd>RE R-2026-501 Kd 4711<\/Ustrd>/);

  // Veralteter Auszug (Benutzer 20.11.2026): sperrt nicht mehr, die Vormerkliste schuetzt
  const privat2 = privatOrdner();
  fs.cpSync(monat, path.join(privat2, 'belege-archiv', '2026', '11'), { recursive: true });
  const spaet = sammelLauf({ privat: privat2, jetzt: new Date('2026-11-13T09:00:00Z'), pdf });
  assert.equal(statusVon(listeLesen(privat2, spaet), 'R-2026-501'), 'IN DATEI');
});

test('Ungelesene Buchung im Auszug: gilt als unvollstaendig, verfallenes Skonto nicht in die Datei', () => {
  const privat = privatOrdner();
  const datei = path.join(privat, 'laden-entlastung-2026-11', 'bank-export', 'umsaetze.csv');
  fs.appendFileSync(datei, `07.11.2026;Überweisung;RE 700003;Muster & Söhne GmbH;${LIEFER};kaputt\n`);
  const e = sammelLauf({ privat, jetzt: HEUTE });
  assert.equal(e.auszugAktuell, false);
  assert.equal(e.bankZeilenNichtLesbar, 1);
  const liste = listeLesen(privat, e);
  assert.match(liste, /KONTOAUSZUG UNVOLLSTÄNDIG \(1 Buchung\(en\) nicht lesbar\): keine Datei/);
  assert.equal(statusVon(liste, '700003'), 'UNKLAR');
});

test('Buchung mit unlesbarem Datum sperrt ebenfalls, Saldozeile nicht', () => {
  const privat = privatOrdner();
  const datei = path.join(privat, 'laden-entlastung-2026-11', 'bank-export', 'umsaetze.csv');
  fs.appendFileSync(datei, 'Endsaldo;;;;;1.000,00\n');
  assert.equal(sammelLauf({ privat, jetzt: HEUTE }).auszugAktuell, true);
  fs.appendFileSync(datei, `kaputt;Überweisung;RE 700003 Gesamtsumme;Muster & Söhne GmbH;${LIEFER};-300,00\n`);
  assert.equal(sammelLauf({ privat, jetzt: HEUTE }).auszugAktuell, false);
});

test('Bankabgleich: reine Ziffern-Rechnungsnummer darf an Buchstaben grenzen, nie an Ziffern', () => {
  const privat = privatOrdner({ bank: false });
  const ordner = path.join(privat, 'laden-entlastung-2026-11', 'bank-export');
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'u.csv'), `Buchungstag;Buchungstext;Verwendungszweck;Beguenstigter;IBAN;Betrag\n09.11.2026;Überweisung;Rechnungs Nummer 700002TP050 abzgl Gutschrift;Muster & Söhne GmbH;${LIEFER};-1000,00\n09.11.2026;Überweisung;Kd 1700001;Muster & Söhne GmbH;${LIEFER};-1,00\n`);
  const liste = listeLesen(privat, sammelLauf({ privat, jetzt: HEUTE }));
  assert.equal(statusVon(liste, '700002'), 'bezahlt');
  assert.equal(statusVon(liste, '700001'), 'IN DATEI');
});

test('XML ohne lesbare Bedingungen: ohne Skonto voller Betrag, mit Skonto-Wort unklar', () => {
  const ohne = rechnungPruefen(rechnungXml({ nummer: '700010', brutto: '120.00', bedingungen: 'Zahlbar per Überweisung bis zum 25.11.2026' }), { iban: LIEFER });
  assert.equal(ohne.status, 'ok');
  assert.equal(ohne.skonto, null);
  assert.equal(rechnungPruefen(RECHNUNGEN.unlesbar, { iban: LIEFER }).status, 'unklar');
});

test('Nummernabgleich: RE700001 ist nicht 700001; passt eine Zahlung zu zwei Nummern, wird keine gezahlt', () => {
  const privat = privatOrdner({ bank: false });
  const monat = path.join(privat, 'belege-archiv', '2026', '10');
  const pfad = path.join(monat, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(pfad, 'utf8'));
  fs.writeFileSync(path.join(monat, 're.xml'), rechnungXml({ nummer: 'RE700001', brutto: '77.00', bedingungen: 'Zahlbar sofort' }));
  m.belege.push({ datei: 're.pdf', xmlDatei: 're.xml', format: 'pdf', rolle: 'rechnung', anbieterSchluessel: 'lieferant-a.example', dublette: null });
  fs.writeFileSync(pfad, JSON.stringify(m));
  const ordner = path.join(privat, 'laden-entlastung-2026-11', 'bank-export');
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'u.csv'), `Buchungstag;Buchungstext;Verwendungszweck;Beguenstigter;IBAN;Betrag\n09.11.2026;Überweisung;RE700001;Muster & Söhne GmbH;${LIEFER};-77,00\n`);
  let liste = listeLesen(privat, sammelLauf({ privat, jetzt: HEUTE }));
  assert.equal(statusVon(liste, 'RE700001'), 'bezahlt');
  assert.equal(statusVon(liste, '700001'), 'IN DATEI');
  fs.writeFileSync(path.join(ordner, 'u.csv'), `Buchungstag;Buchungstext;Verwendungszweck;Beguenstigter;IBAN;Betrag\n09.11.2026;Überweisung;RE700001 und 700001;Muster & Söhne GmbH;${LIEFER};-568,00\n`);
  liste = listeLesen(privat, sammelLauf({ privat, jetzt: HEUTE }));
  assert.equal(statusVon(liste, 'RE700001'), 'UNKLAR');
  assert.equal(statusVon(liste, '700001'), 'UNKLAR');
});

test('Skonto in einem zweiten Bedingungsblock: nicht voll freigeben', () => {
  const xml = rechnungXml({ nummer: '700011', brutto: '120.00', bedingungen: 'Zahlbar bis 25.11.2026' })
    .replace('</ram:SpecifiedTradePaymentTerms>', '</ram:SpecifiedTradePaymentTerms><ram:SpecifiedTradePaymentTerms><ram:Description>3 % Skonto bei Zahlung in 8 Tagen</ram:Description></ram:SpecifiedTradePaymentTerms>');
  assert.equal(rechnungPruefen(xml, { iban: LIEFER }).status, 'unklar');
});

test('Skonto in CDATA: nicht voll freigeben', () => {
  const xml = rechnungXml({ nummer: '700012', brutto: '120.00', bedingungen: '<![CDATA[3 % Skonto bei Zahlung in 8 Tagen]]>' });
  assert.equal(rechnungPruefen(xml, { iban: LIEFER }).status, 'unklar');
});

test('Strukturiertes Skonto (ApplicableTradePaymentDiscountTerms): nicht voll freigeben', () => {
  const xml = rechnungXml({ nummer: '700013', brutto: '120.00', bedingungen: 'Zahlbar bis 25.11.2026' })
    .replace('</ram:Description>', '</ram:Description><ram:ApplicableTradePaymentDiscountTerms><ram:CalculationPercent>2</ram:CalculationPercent><ram:ActualDiscountAmount>2.40</ram:ActualDiscountAmount></ram:ApplicableTradePaymentDiscountTerms>');
  assert.equal(rechnungPruefen(xml, { iban: LIEFER }).status, 'unklar');
});

test('Lexware-Kennung mit 0 % Skonto ist kein Skonto, mit 2 % wird es gerechnet', () => {
  const mit = p => rechnungXml({ nummer: '700014', brutto: '120.00', bedingungen: `Zahlbar per Überweisung bis zum 25.11.2026#SKONTO#TAGE=7#PROZENT=${p}#` });
  assert.equal(rechnungPruefen(mit('0.00'), { iban: LIEFER }).status, 'ok');
  assert.deepEqual(rechnungPruefen(mit('2.00'), { iban: LIEFER }).skonto, { bis: '2026-11-04', betrag: 2.4, zahlbetrag: 117.6 }); // XRechnung-Skonto ab Rechnungsdatum 28.10.
});

test('XRechnung-Skonto „#SKONTO#TAGE#PROZENT#“: Frist ab Rechnungsdatum, mit Fracht ohne Basis voller Betrag', () => {
  assert.deepEqual(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=04.00#', { datum: '2026-11-19', brutto: 71.53 }),
    { nettoFaellig: null, nettoBetrag: 71.53, skonto: { bis: '2026-11-29', betrag: 2.86, zahlbetrag: 68.67 } });
  assert.equal(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=04.00#', { datum: '2026-11-19', brutto: 71.53, zuschlaege: 27.85 }).vollerBetrag, true);
  assert.equal(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=04.00##SKONTO#TAGE=20#PROZENT=02.00#', { datum: '2026-11-19', brutto: 71.53 }), null);
  assert.equal(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=09.00#', { datum: '2026-11-19', brutto: 71.53 }), null);
  // XML ohne Empfaengerkonto: IBAN muss im PDF stehen
  const xml = rechnungXml({ nummer: '700020', brutto: '100.00', bedingungen: '#SKONTO#TAGE=10#PROZENT=02.00#' }).replace(/<ram:PayeePartyCreditorFinancialAccount>.*?<\/ram:PayeePartyCreditorFinancialAccount>/, '');
  const ok = rechnungPruefen(xml, { iban: LIEFER }, () => `Bankverbindung IBAN ${LIEFER}`);
  assert.equal(ok.status, 'ok');
  assert.deepEqual(ok.skonto, { bis: '2026-11-07', betrag: 2, zahlbetrag: 98 });
  assert.equal(rechnungPruefen(xml, { iban: LIEFER }, () => `IBAN ${FREMD}`).status, 'unklar');
});

test('PDF in gesperrter Schrift (Spedition): Nummer und Betrag aus dem PDF, nur eindeutig', () => {
  const text = `R e c h n u n g  Nr. 17718713  Kunde: 22627\nIBAN: ${LIEFER}\nNetto-Zwischensumme EUR 53 , 47\nGesamtbetrag EUR 63 , 63\n`;
  const r = pdfRechnungPruefen({ text, nummer: null, brutto: null, waehrung: 'EUR', datum: '2026-11-16' }, { iban: LIEFER });
  assert.equal(r.status, 'ok');
  assert.equal(r.nummer, '17718713');
  assert.equal(r.brutto, 63.63);
  assert.equal(pdfRechnungPruefen({ text: `${text}Gesamtbetrag EUR 70 , 00\n`, nummer: null, brutto: null, waehrung: 'EUR' }, { iban: LIEFER }).status, 'unklar');
});

test('Mail an den Laden: Text aus der Pruefliste, Datei und Liste im Anhang; ohne mailAn keine Mail', async () => {
  const privat = privatOrdner();
  const e = sammelLauf({ privat, schreiben: true, jetzt: HEUTE });
  assert.equal(await laufMailen({ privat, ergebnis: e, senden: async () => assert.fail('darf nicht senden') }), 'keine Mail: mailAn fehlt in der Konfiguration');
  const k = path.join(privat, 'zahlungen', 'konfiguration.json');
  fs.writeFileSync(k, JSON.stringify({ ...JSON.parse(fs.readFileSync(k, 'utf8')), mailAn: 'laden@example.com' }));
  fs.mkdirSync(path.join(privat, 'nachfassen'));
  fs.writeFileSync(path.join(privat, 'nachfassen', 'postfach.json'), JSON.stringify({ host: 'smtp.example.com', port: 465, benutzer: 'a@example.com', passwort: 'x', absender: 'a@example.com' }), { mode: 0o600 });
  let gesendet;
  assert.equal(await laufMailen({ privat, ergebnis: e, senden: async (zugang, mail) => { gesendet = mail; }, pruefen: () => ({ frei: true, bericht: 'FREI: Testdatei' }) }), 'gesendet an laden@example.com');
  assert.deepEqual(gesendet.an, ['laden@example.com']);
  assert.equal(gesendet.betreff, 'Sammelüberweisung 2026-11-10: 3 Zahlungen, 1967,00 EUR, 4 von Hand prüfen');
  assert.match(gesendet.text, /- Muster & Söhne GmbH, Rechnung 700001 vom 2026-10-28: 491,00 EUR \(mit Skonto\)/);
  assert.match(gesendet.text, /Von Hand prüfen \(4\):/);
  assert.deepEqual(gesendet.anhaenge.map(a => a.name), [e.datei, e.pruefliste]);
  assert.match(gesendet.text, /FREI: Testdatei$/);
  // Findet der Zwischenpruefer Fehler (oder laeuft nicht), steht das in Betreff und erster Zeile.
  await laufMailen({ privat, ergebnis: e, senden: async (zugang, mail) => { gesendet = mail; }, pruefen: () => ({ frei: false, bericht: 'FEHLER x' }) });
  assert.match(gesendet.betreff, /^NICHT HOCHLADEN – Sammelüberweisung/);
  assert.match(gesendet.text, /^Der Zwischenprüfer hat Fehler gefunden/);
  const { betreff } = mailInhalt('', { lauf: '2026-11-13', datei: null, zahlungen: 0, summe: 0 });
  assert.equal(betreff, 'Sammelüberweisung 2026-11-13: keine Datei');
});

test('Review-Faelle: Nettogesamtbetrag ist kein Endbetrag, unlesbare Skontobasis sperrt, Semikolon im Namen', () => {
  const text = `Rechnung Nr. 900100\nIBAN ${LIEFER}\nNettogesamtbetrag EUR 100 , 00\nRechnungsendbetrag EUR 119 , 00\n`;
  const r = pdfRechnungPruefen({ text, nummer: null, brutto: null, waehrung: 'EUR' }, { iban: LIEFER });
  assert.equal(r.brutto, 119);
  assert.equal(pdfRechnungPruefen({ text: `${text}Gesamtbetrag EUR 100 , 00\n`, nummer: null, brutto: null, waehrung: 'EUR' }, { iban: LIEFER }).status, 'unklar');
  assert.equal(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=4.00#BASISBETRAG=50,00#', { datum: '2026-11-19', brutto: 100 }), null);
  assert.equal(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=4.00#BASISBETRAG=50.00#', { datum: '2026-11-19', brutto: 100 }).skonto.betrag, 2);
  const liste = 'Kopf\r\nzweite\r\nIN DATEI;"Lieferant A; Abteilung B";R-1;2026-11-19;10,00;;;;10,00;voller Betrag;x.pdf\r\n';
  assert.match(mailInhalt(liste, { lauf: '2026-11-20', datei: 'd.xml', zahlungen: 1, summe: 10 }).text, /- Lieferant A; Abteilung B, Rechnung R-1 vom 2026-11-19: 10,00 EUR \(voller Betrag\)/);
});

test('Review Runde 2: „Netto Gesamtbetrag“ zaehlt nicht, unmoegliches Datum sperrt ohne Abbruch', () => {
  const text = `Rechnung Nr. 900101\nIBAN ${LIEFER}\nNetto Gesamtbetrag EUR 100 , 00\nRechnungssumme EUR 119 , 00\n`;
  assert.equal(pdfRechnungPruefen({ text, nummer: null, brutto: null, waehrung: 'EUR' }, { iban: LIEFER }).brutto, 119);
  assert.equal(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=4.00#', { datum: '2026-13-01', brutto: 100 }), null);
  assert.equal(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=4.00#', { datum: '2026-02-30', brutto: 100 }), null);
});

test('Nicht eingetragener Absender ab 01.11.: mit Namen in der Pruefliste, bezahlt nur ueber Nummer und Name im Kontoauszug', () => {
  const privat = privatOrdner();
  const monat = path.join(privat, 'belege-archiv', '2026', '10');
  const m = JSON.parse(fs.readFileSync(path.join(monat, 'manifest.json'), 'utf8'));
  const fremd = (name, nummer, extra = {}) => ({ datei: `${name}.pdf`, format: 'pdf', rolle: 'rechnung', anbieterSchluessel: 'paket.example', anbieter: 'Paketdienst Beispiel', rechnungsnummer: nummer, brutto: 45.43, rechnungsdatum: '2026-11-18', dublette: null, ...extra });
  m.belege.push(fremd('paket-offen', '3110623576'), fremd('paket-offen-anhang', '3110623576', { brutto: null }), fremd('paket-bezahlt', '3110622954', { rechnungsdatum: '2026-11-12' }), fremd('paket-bezahlt-anhang', '3110622954', { brutto: null, rechnungsdatum: '2026-11-12' }), fremd('paket-alt', '3110000001', { rechnungsdatum: '2026-10-20' }), fremd('paket-gutschrift', '3110000002', { art: 'gutschrift' }));
  fs.writeFileSync(path.join(monat, 'manifest.json'), JSON.stringify(m));
  const bank = path.join(privat, 'laden-entlastung-2026-11', 'bank-export', 'umsaetze.csv');
  fs.appendFileSync(bank, `12.11.2026;Überweisung;Beleg-Nr.:3110622954;Paketdienst Beispiel GmbH;${FREMD};-54,67\n`);
  const e = sammelLauf({ privat, jetzt: HEUTE });
  const liste = listeLesen(privat, e);
  assert.equal(statusVon(liste, '3110623576'), 'UNKLAR');
  assert.match(liste, /Paketdienst Beispiel;3110623576;.*Lieferant nicht eingetragen/);
  assert.equal(statusVon(liste, '3110622954'), 'bezahlt');
  assert.equal(liste.split('\r\n').filter(z => z.includes(';3110623576;')).length, 1, 'Anhang mit gleicher Nummer: eine Zeile');
  assert.match(liste, /;3110623576;2026-11-18;45,43;/);
  assert.equal(statusVon(liste, '3110000001'), undefined, 'vor dem Start nur gezaehlt');
  assert.equal(statusVon(liste, '3110000002'), undefined, 'Gutschrift wird nicht ueberwiesen');
  assert.match(liste, /Nicht betrachtet: 3 Rechnung/);
});

test('Unklare Rechnung: als bezahlt nur ueber die Nummer im Verwendungszweck, ein gleicher Betrag reicht nicht', () => {
  const privat = privatOrdner();
  const bank = path.join(privat, 'laden-entlastung-2026-11', 'bank-export', 'umsaetze.csv');
  // 700005 (Skonto unlesbar) mit Nummer bezahlt; 700007 (fremde IBAN) nur Betrag und Name, keine Nummer.
  fs.appendFileSync(bank, `07.11.2026;Überweisung;Re.-Nr.: 700005;Muster & Söhne GmbH;${LIEFER};-80,00\n08.11.2026;Überweisung;Wareneinkauf;Muster & Söhne GmbH;${LIEFER};-400,00\n`);
  const liste = listeLesen(privat, sammelLauf({ privat, jetzt: HEUTE }));
  assert.equal(statusVon(liste, '700005'), 'bezahlt');
  assert.match(liste, /bezahlt;[^\r]*700005;[^\r]*vorher: /);
  assert.equal(statusVon(liste, '700007'), 'UNKLAR');
});

test('erledigt.json: Beleg ohne Zahlung faellt aus Datei und Mail, bleibt in der Pruefliste', () => {
  const privat = privatOrdner();
  fs.writeFileSync(path.join(privat, 'zahlungen', 'erledigt.json'), JSON.stringify({ 'unlesbar.pdf': 'Anschreiben, keine Rechnung' }));
  const e = sammelLauf({ privat, jetzt: HEUTE });
  const liste = listeLesen(privat, e);
  assert.match(liste, /^erledigt;[^\r]*700005;[^\r]*Anschreiben, keine Rechnung/m);
  assert.doesNotMatch(mailInhalt(liste, { lauf: e.lauf, datei: null, zahlungen: 0, summe: 0 }).text, /700005/);
});

test('Kontoauszug: Exporte aus Downloads holen, Ueberlappung zaehlt einmal, Luecke sperrt', () => {
  const quelle = fs.mkdtempSync(path.join(os.tmpdir(), 'downloads-'));
  const ziel = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bank-')), 'bank-export');
  fs.writeFileSync(path.join(quelle, `${EIGEN}_EUR_19-11-2026_1435.csv`), 'x');
  fs.writeFileSync(path.join(quelle, `${FREMD}_EUR_19-11-2026_1435.csv`), 'x');
  fs.writeFileSync(path.join(quelle, 'rechnung.pdf'), 'x');
  assert.equal(exporteHolen(ziel, EIGEN, quelle), 1);
  assert.deepEqual(fs.readdirSync(ziel), [`${EIGEN}_EUR_19-11-2026_1435.csv`]);
  assert.equal(exporteHolen(ziel, EIGEN, quelle), 0, 'schon da');
  assert.equal(exporteHolen(ziel, EIGEN, path.join(quelle, 'fehlt')), null);

  const b = (datum, betrag, zweck = 'RE 1') => ({ datum, betrag, name: 'A', iban: '', zweck });
  const alt = [b('2026-11-02', -10), b('2026-11-05', -20), b('2026-11-05', -20)];
  const neu = [b('2026-11-05', -20), b('2026-11-06', -30)];
  const r = exporteZusammenfuehren([alt, neu]);
  assert.equal(r.buchungen.length, 4, 'zwei gleiche Buchungen in einer Datei bleiben zwei, die Ueberlappung zaehlt nicht doppelt');
  assert.equal(r.luecke, null);
  assert.equal(exporteZusammenfuehren([alt, [b('2026-11-09', -30)]]).luecke, '2026-11-05 bis 2026-11-09');
  assert.equal(exporteZusammenfuehren([alt, [b('2026-11-06', -30)]]).luecke, null, 'Folgetag ist keine Luecke');
  assert.equal(exporteZusammenfuehren([[b('2026-11-06', -10)], [b('2026-11-09', -30)]]).luecke, null, 'Wochenende ist keine Luecke');
});

test('Mail: unvollstaendiger Kontoauszug steht oben und im Betreff, ein nur veralteter nicht', () => {
  const privat = privatOrdner();
  fs.appendFileSync(path.join(privat, 'laden-entlastung-2026-11', 'bank-export', 'umsaetze.csv'), `07.11.2026;Überweisung;RE 700003;Muster & Söhne GmbH;${LIEFER};kaputt\n`);
  const e = sammelLauf({ privat, schreiben: true, jetzt: new Date('2026-11-20T09:00:00Z') });
  const { betreff, text } = mailInhalt(listeLesen(privat, e), { lauf: e.lauf, datei: e.datei, zahlungen: e.zahlungen, summe: e.summe });
  assert.equal(e.datei, null);
  assert.match(betreff, /keine Datei, \d+ von Hand prüfen – Kontoauszug prüfen$/);
  assert.match(text.split('\n')[0], /^ACHTUNG: KONTOAUSZUG UNVOLLSTÄNDIG/);
  const veraltet = privatOrdner();
  const v = sammelLauf({ privat: veraltet, schreiben: true, jetzt: new Date('2026-11-20T09:00:00Z') });
  assert.ok(v.datei);
  assert.doesNotMatch(mailInhalt(listeLesen(veraltet, v), { lauf: v.lauf, datei: v.datei, zahlungen: v.zahlungen, summe: v.summe }).betreff, /Kontoauszug/);
});

test('Anhang ohne Betrag zur lesbaren Rechnung gleicher Nummer: erledigt, nicht von Hand pruefen', () => {
  const konfig = { lieferanten: { 'lieferant-a.example': { name: 'Muster & Söhne GmbH', iban: LIEFER, zweck: '' } } };
  const belege = [
    { schluessel: 'lieferant-a.example', datei: 'r.pdf', xml: rechnungXml({ nummer: '700020', brutto: '100.00', bedingungen: 'Zahlbar sofort' }), pdfText: () => '' },
    { schluessel: 'lieferant-a.example', datei: 'anhang.pdf', xml: null, pdf: { text: 'Anhang zu Rechnungs-Nr.: 700020', nummer: '700020', brutto: null, waehrung: null, datum: '2026-11-05' } },
    { schluessel: 'lieferant-a.example', datei: 'allein.pdf', xml: null, pdf: { text: 'Rechnungs-Nr.: 700021', nummer: '700021', brutto: null, waehrung: null, datum: '2026-11-05' } },
    { schluessel: 'lieferant-a.example', datei: 'storno.pdf', xml: null, pdf: { text: 'Storno zu Rechnungs-Nr.: 700020', nummer: '700020', brutto: null, waehrung: null, datum: '2026-11-06' } },
    { schluessel: 'lieferant-a.example', datei: 'kopie.pdf', xml: null, pdf: { text: 'Rechnungs-Nr.: 700020 Kopie', nummer: '700020', brutto: null, waehrung: null, datum: '2026-11-05' } },
    { schluessel: 'lieferant-a.example', datei: 'anhang-storno.pdf', xml: null, pdf: { text: 'Anhang zu Rechnung 700020: Korrektur', nummer: '700020', brutto: null, waehrung: null, datum: '2026-11-06' } },
  ];
  const zeilen = auswaehlen({ belege, konfig, buchungen: [], heute: '2026-11-10' }).zeilen;
  assert.deepEqual(zeilen.map(z => [z.beleg, z.status]), [['r.pdf', 'zahlen'], ['anhang.pdf', 'erledigt'], ['allein.pdf', 'unklar'], ['storno.pdf', 'unklar'], ['kopie.pdf', 'unklar'], ['anhang-storno.pdf', 'unklar']]);
});

test('Gleiche Rechnungsnummer mit anderem Betrag: eine Buchung macht keine der beiden bezahlt, beide bleiben sichtbar', () => {
  const konfig = { lieferanten: { 'lieferant-a.example': { name: 'Muster & Söhne GmbH', iban: LIEFER, zweck: '' } } };
  const xml = brutto => rechnungXml({ nummer: '700009', brutto, bedingungen: mitSkonto('11.11.26', '2,00', '98,00', '27.11.26', brutto) });
  const belege = [{ schluessel: 'lieferant-a.example', datei: 'a.pdf', xml: xml('100.00'), pdfText: () => '' }, { schluessel: 'lieferant-a.example', datei: 'b.pdf', xml: xml('150.00'), pdfText: () => '' }];
  const fremde = [100, 150, null].map((brutto, i) => ({ schluessel: 'paket.example', anbieter: 'Paketdienst Beispiel', datei: `p${i}.pdf`, nummer: '3110000009', brutto, datum: '2026-11-05' }));
  const buchungen = [
    { datum: '2026-11-09', betrag: -100, name: 'Muster & Söhne GmbH', iban: LIEFER, zweck: 'RE 700009' },
    { datum: '2026-11-09', betrag: -100, name: 'Paketdienst Beispiel GmbH', iban: '', zweck: 'Beleg-Nr. 3110000009' },
  ];
  const { zeilen } = auswaehlen({ belege, fremde, konfig, buchungen, heute: '2026-11-10' });
  assert.deepEqual(zeilen.filter(z => z.nummer === '700009').map(z => z.status), ['unklar', 'unklar']);
  const paket = zeilen.filter(z => z.nummer === '3110000009');
  assert.deepEqual(paket.map(z => [z.status, z.brutto]), [['unklar', 100], ['unklar', 150]], 'Anhang ohne Betrag faellt weg, anderer Betrag bleibt');
  assert.match(paket[0].grund, /mehrfach mit anderem Betrag/);
});

test('Gleiche Nummer an verschiedenen Tagen: zwei Zeilen; eine aeltere Zahlung macht die neuere unklare Rechnung nicht bezahlt', () => {
  const konfig = { lieferanten: {} };
  const fremde = ['2026-11-01', '2026-11-18'].map((datum, i) => ({ schluessel: 'paket.example', anbieter: 'Paketdienst Beispiel', datei: `p${i}.pdf`, nummer: '3110000010', brutto: 45.43, datum }));
  const buchungen = [{ datum: '2026-11-03', betrag: -45.43, name: 'Paketdienst Beispiel GmbH', iban: '', zweck: 'Beleg-Nr. 3110000010' }];
  const zeilen = auswaehlen({ belege: [], fremde, konfig, buchungen, heute: '2026-11-20' }).zeilen;
  assert.deepEqual(zeilen.map(z => [z.datum, z.status]), [['2026-11-01', 'bezahlt'], ['2026-11-18', 'unklar']]);
});

test('Lesbare Rechnung und unklare Fassung derselben Nummer mit anderem Betrag: keine wird gezahlt oder als bezahlt verbucht', () => {
  const konfig = { lieferanten: { 'lieferant-a.example': { name: 'Muster & Söhne GmbH', iban: LIEFER, zweck: '' } } };
  const lesbar = rechnungXml({ nummer: '700011', brutto: '100.00', bedingungen: mitSkonto('11.11.26', '2,00', '98,00', '27.11.26', '100,00') });
  const unklar = rechnungXml({ nummer: '700011', brutto: '150.00', bedingungen: 'Zahlbar nach Vereinbarung, 2 % Skonto möglich' });
  const belege = [{ schluessel: 'lieferant-a.example', datei: 'a.pdf', xml: lesbar, pdfText: () => '' }, { schluessel: 'lieferant-a.example', datei: 'b.pdf', xml: unklar, pdfText: () => '' }];
  const ohneBank = auswaehlen({ belege, konfig, buchungen: [], heute: '2026-11-10' }).zeilen;
  assert.deepEqual(ohneBank.map(z => z.status), ['unklar', 'unklar']);
  assert.match(ohneBank[0].grund, /mehrfach im Archiv mit anderem Betrag/);
  const mitBank = auswaehlen({ belege, konfig, buchungen: [{ datum: '2026-11-09', betrag: -100, name: 'Muster & Söhne GmbH', iban: LIEFER, zweck: 'RE 700011' }], heute: '2026-11-10' }).zeilen;
  assert.deepEqual(mitBank.map(z => z.status), ['unklar', 'unklar']);
  // Die Zahlung nennt 700011: sie darf eine andere offene Rechnung gleichen Betrags nicht ueber den Betrag decken.
  const offen = rechnungXml({ nummer: '700012', brutto: '100.00', bedingungen: mitSkonto('11.11.26', '2,00', '98,00', '27.11.26', '100,00') });
  const dazu = auswaehlen({ belege: [...belege, { schluessel: 'lieferant-a.example', datei: 'c.pdf', xml: offen, pdfText: () => '' }], konfig, buchungen: [{ datum: '2026-11-09', betrag: -100, name: 'Muster & Söhne GmbH', iban: LIEFER, zweck: 'RE 700011' }], heute: '2026-11-10' }).zeilen;
  assert.equal(dazu.find(z => z.nummer === '700012').status, 'zahlen');
  // Auch kurze Nummern: eine Zahlung "RE 123" deckt die offene 124 gleichen Betrags nicht.
  const kurz = n => rechnungXml({ nummer: n, brutto: '100.00', bedingungen: mitSkonto('11.11.26', '2,00', '98,00', '27.11.26', '100,00') });
  const kurzBelege = [
    { schluessel: 'lieferant-a.example', datei: 'k1.pdf', xml: kurz('123'), pdfText: () => '' },
    { schluessel: 'lieferant-a.example', datei: 'k2.pdf', xml: rechnungXml({ nummer: '123', brutto: '150.00', bedingungen: 'Zahlbar nach Vereinbarung, 2 % Skonto möglich' }), pdfText: () => '' },
    { schluessel: 'lieferant-a.example', datei: 'k3.pdf', xml: kurz('124'), pdfText: () => '' },
  ];
  const kurzZeilen = auswaehlen({ belege: kurzBelege, konfig, buchungen: [{ datum: '2026-11-09', betrag: -100, name: 'Muster & Söhne GmbH', iban: LIEFER, zweck: 'RE 123' }], heute: '2026-11-10' }).zeilen;
  assert.equal(kurzZeilen.find(z => z.nummer === '124').status, 'zahlen');
  // Eine Zahlung fuer „123A“ oder „R-123“ (gesperrt, Betragskonflikt) gehoert nicht zur offenen „123“.
  for (const lang of ['123A', 'R-123']) {
    const b2 = [
      { schluessel: 'lieferant-a.example', datei: 'l1.pdf', xml: kurz(lang), pdfText: () => '' },
      { schluessel: 'lieferant-a.example', datei: 'l2.pdf', xml: rechnungXml({ nummer: lang, brutto: '150.00', bedingungen: 'Zahlbar nach Vereinbarung, 2 % Skonto möglich' }), pdfText: () => '' },
      { schluessel: 'lieferant-a.example', datei: 'l3.pdf', xml: kurz('123'), pdfText: () => '' },
    ];
    const z = auswaehlen({ belege: b2, konfig, buchungen: [{ datum: '2026-11-09', betrag: -100, name: 'Muster & Söhne GmbH', iban: LIEFER, zweck: `RE ${lang}` }], heute: '2026-11-10' }).zeilen;
    assert.equal(z.find(r => r.nummer === '123').status, 'zahlen', lang);
  }
  // Verschachtelt („R-123“ und „R-123-123“, beide gesperrt): in beiden Archiv-Reihenfolgen bleibt „123“ offen.
  const gesperrt = n => [
    { schluessel: 'lieferant-a.example', datei: `${n}-a.pdf`, xml: kurz(n), pdfText: () => '' },
    { schluessel: 'lieferant-a.example', datei: `${n}-b.pdf`, xml: rechnungXml({ nummer: n, brutto: '150.00', bedingungen: 'Zahlbar nach Vereinbarung, 2 % Skonto möglich' }), pdfText: () => '' },
  ];
  for (const reihe of [['R-123', 'R-123-123'], ['R-123-123', 'R-123']]) {
    const b3 = [...gesperrt(reihe[0]), ...gesperrt(reihe[1]), { schluessel: 'lieferant-a.example', datei: 'n.pdf', xml: kurz('123'), pdfText: () => '' }];
    const z = auswaehlen({ belege: b3, konfig, buchungen: [{ datum: '2026-11-09', betrag: -100, name: 'Muster & Söhne GmbH', iban: LIEFER, zweck: 'RE R-123-123' }], heute: '2026-11-10' }).zeilen;
    assert.equal(z.find(r => r.nummer === '123').status, 'zahlen', reihe.join(' vor '));
  }
});

test('Fehler 20.11.2026: Datum mit Leerzeichen, Skonto nur auf Ware, Skonto-Vorschlag im PDF', () => {
  // Lieferant A schrieb „Zahlung bis 23 11 26“ statt „23.11.26“
  assert.deepEqual(zahlungsbedingungenLesen('Zahlung bis 23 11 26 2,00 % Skonto 10,41 EUR Zahlung 558,77 EUR Nettofälligkeit 9.12.26 netto Zahlung 569,18 EUR').skonto,
    { bis: '2026-11-23', betrag: 10.41, zahlbetrag: 558.77 });
  // Fracht: Skonto nur auf den Warenanteil (so am 06.11.2026 bezahlt: 302,24 -> 290,39)
  assert.deepEqual(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=04.00#', { datum: '2026-11-06', brutto: 302.24, zuschlaege: 4.98, warensumme: 249, steuerbasis: 253.98 }).skonto,
    { bis: '2026-11-16', betrag: 11.85, zahlbetrag: 290.39 });
  // Summen gehen nicht auf: voller Betrag
  assert.equal(xrechnungSkontoLesen('#SKONTO#TAGE=10#PROZENT=04.00#', { datum: '2026-11-06', brutto: 302.24, zuschlaege: 4.98, warensumme: 249, steuerbasis: 260 }).vollerBetrag, true);
  const pdf = pdfRechnungPruefen({ text: `Rechnung Nr. 417546 Gesamtbetrag 105,11 Zahlbar innerhalb von 10 Tagen mit 4% Skonto, innerhalb von 30 Tagen ohne Abzug. IBAN ${LIEFER}`, nummer: '417546', brutto: 105.11, waehrung: 'EUR', datum: '2026-11-06' }, { iban: LIEFER });
  // Ohne Vorlage: von Hand mit Vorschlag; mit bestaetigter Vorlage (10 Tage 4 %): Skonto auf den Rechnungsbetrag
  assert.equal(pdf.status, 'unklar');
  const mitVorlage = pdfRechnungPruefen({ text: `Rechnung Nr. 417546 Gesamtbetrag 105,11 Zahlbar innerhalb von 10 Tagen mit 4% Skonto, innerhalb von 30 Tagen ohne Abzug. IBAN ${LIEFER}`, nummer: '417546', brutto: 105.11, waehrung: 'EUR', datum: '2026-11-06' }, { iban: LIEFER, vorlage: { skontoTage: 10, skontoProzent: 4, bedingungen: 'Zahlbar innerhalb von 10 Tagen mit 4% Skonto, innerhalb von 30 Tagen ohne Abzug.' } });
  assert.equal(mitVorlage.status, 'ok');
  assert.deepEqual(mitVorlage.skonto, { bis: '2026-11-16', betrag: 4.2, zahlbetrag: 100.91 });
  // Zwei Stufen: von Hand, mit Vorschlag
  const zwei = pdfRechnungPruefen({ text: `Rechnung Nr. 417546 Gesamtbetrag 105,11 Zahlbar innerhalb von 10 Tagen mit 4% Skonto, innerhalb von 20 Tagen mit 2% Skonto. IBAN ${LIEFER}`, nummer: '417546', brutto: 105.11, waehrung: 'EUR', datum: '2026-11-06' }, { iban: LIEFER });
  assert.equal(zwei.status, 'unklar');
  assert.match(zwei.grund, /Vorschlag: 4 % Skonto bis 2026-11-16 = 100,91 EUR/);
});

test('Wochenfazit: wiederkehrende Ueberweisungen, Stand der Lastschrift-Anfrage, eigene Umbuchung zaehlt nicht', () => {
  const konfig = { auftraggeber: { name: 'Muster Boden GmbH' }, lieferanten: { 'a.de': { name: 'A Handels GmbH', sepaAnfrage: 'angefragt' }, 'b.de': { name: 'B GmbH', lastschrift: true } } };
  const u = (datum, betrag, name) => ({ datum, betrag, name, art: 'ueberweisung' });
  const f = lastschriftFazit({ konfig, heute: '2026-11-24', buchungen: [
    u('2026-11-02', -10, 'A Handels GmbH'), u('2026-11-03', -5, 'Handels A'), u('2026-11-04', -7, 'Timzo Teppichböden'), u('2026-11-05', -3, 'Timzo Teppichboeden'),
    u('2026-11-06', -1, 'Einmal KG'), u('2026-11-07', -9, 'Muster Boden GmbH'), u('2026-11-08', -9, 'Muster Boden GmbH'), u('2026-05-01', -9, 'Einmal KG'),
    { ...u('2026-11-09', -2, 'Einmal KG'), art: 'lastschrift' }] });
  assert.deepEqual(f, [
    { name: 'A Handels GmbH', anzahl: 2, letzte: '2026-11-03', stand: 'angefragt', summe: 15 },
    { name: 'Timzo Teppichböden', anzahl: 2, letzte: '2026-11-05', stand: '', summe: 10 },
  ]);
});

test('IBAN nur als Bild im PDF: Texterkennung nur dann, und nur ihr Ergebnis zaehlt', () => {
  let aufrufe = 0;
  const ocr = () => { aufrufe += 1; return `IBAN: ${LIEFER.replace(/(.{4})/g, '$1 ')}`; };
  assert.equal(mitOcr(`Rechnung IBAN ${LIEFER}`, LIEFER, 'x.pdf', ocr), `Rechnung IBAN ${LIEFER}`);
  assert.equal(aufrufe, 0);
  assert.match(mitOcr('Rechnung ohne Konto', LIEFER, 'x.pdf', ocr), /IBAN: /);
  assert.equal(aufrufe, 1);
  // Erkennt die Texterkennung nichts, bleibt die IBAN unbelegt
  assert.equal(pdfRechnungPruefen({ text: mitOcr('Rechnung Nr. 700099 Gesamtbetrag 50,00', LIEFER, 'x.pdf', () => ''), nummer: '700099', brutto: 50, waehrung: 'EUR' }, { iban: LIEFER }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ text: mitOcr('Rechnung Nr. 700099 Gesamtbetrag 50,00', LIEFER, 'x.pdf', ocr), nummer: '700099', brutto: 50, waehrung: 'EUR' }, { iban: LIEFER }).status, 'ok');
});

test('Spaltensatz aus der Texterkennung: Brutto nur ueber die Rechenprobe Netto + MwSt', () => {
  const ocr = `Rechnung Nr.115-2026\nGesamt:\nzzgl. 19% MwSt:\nRechnungsbetrag:\n406,29 €\n23,52 €\n429,81 €\n81,66 €\n511,47 €\nZahlbar: 10 Tage -3% Skonto\n30 Tage\nNetto\nIBAN: ${LIEFER}`;
  const V = { skontoTage: 10, skontoProzent: 3, rechenprobe: true, datumVor: 'Berlin', bedingungen: 'Zahlbar: 10 Tage -3% Skonto 30 Tage Netto' };
  assert.equal(bruttoAusSummen(ocr), 511.47);
  assert.equal(bruttoAusSummen('100,00 € 19,00 € 119,00 € 200,00 € 38,00 € 238,00 €'), null); // zwei Kandidaten
  assert.equal(bruttoAusSummen('100,00 19,00 119,00 50,00 169,00'), null); // Positionssumme, nicht das Gesamt
  assert.equal(bruttoAusSummen('123,50 23,47 146,97'), 146.97); // Halbcent kaufmaennisch
  assert.equal(bruttoAusSummen('100,00 19,00 119,00 Rabatt 11,90 Gesamt 107,10'), null); // Rabatt nach der Steuer
  // Rechnungsdatum fehlt im Archiv: ausgeschrieben im Text („23. November 2026“), nie der Maileingang
  const ohne = { nummer: '115-2026', brutto: null, waehrung: null, datum: '2026-11-25', rechnungsdatum: null };
  assert.equal(pdfRechnungPruefen({ ...ohne, text: ocr }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `${ocr}\nZahlbar: 10 Tage -3% Skonto nur auf den Warenwert\nBerlin 23. November 2026` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  const r = pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\n${ocr}` }, { iban: LIEFER, vorlage: V });
  assert.equal(r.status, 'ok');
  assert.equal(r.brutto, 511.47);
  assert.deepEqual(r.skonto, { bis: '2026-12-03', betrag: 15.34, zahlbetrag: 496.13 });
  // Ohne Vorlage keine Rechenprobe und kein Skonto; andere Stufe als die Vorlage: von Hand
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\n${ocr}` }, { iban: LIEFER }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\n${ocr}` }, { iban: LIEFER, vorlage: { ...V, skontoProzent: 2 } }).status, 'unklar');
  // Codex #2306 Runde 2: Fortsetzung „auf den Nettobetrag“, nachgestelltes Minus
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\n${ocr.replace('Skonto\n30', 'Skonto\nauf den Nettobetrag\n30')}` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  assert.equal(bruttoAusSummen('100,00- 19,00- 119,00-'), null);
  // Codex Runde 3: Abzug / Unicode-Minus, Lieferdatum, unmoeglicher Tag
  assert.equal(bruttoAusSummen('100,00 19,00 119,00 Abzug 11,90 Gesamt 107,10'), null);
  assert.equal(bruttoAusSummen('100,00 19,00 119,00 −11,90 107,10'), null);
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Lieferdatum 23. November 2026\n${ocr}` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 32. November 2026\n${ocr}` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  // Codex #2306: Zahlungsziel ueber Zeilenumbruch, widerspruechliche Gesamtbetraege, Einschraenkung in der Folgezeile
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Zahlbar bis\n23. November 2026\n${ocr}` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\nRechnungsbetrag 511,47\nZahlbetrag 400,00\n${ocr}` }, { iban: LIEFER, vorlage: V }).brutto === 511.47 && pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\nRechnungsbetrag 511,47\nZahlbetrag 400,00\n${ocr}` }, { iban: LIEFER, vorlage: V }).status === 'ok', false);
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\n${ocr.replace('-3% Skonto', '-3% Skonto\nauf den Materialwert')}` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  // Textebene und Texterkennung nennen dieselbe Stufe: zaehlt einmal; ein weiteres Skonto-Wort sperrt
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\n${ocr}\nZahlbar: 10 Tage -3% Skonto 30 Tage Netto` }, { iban: LIEFER, vorlage: V }).status, 'ok');
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\n${ocr}\nZahlbar: 10 Tage -3% Skonto` }, { iban: LIEFER, vorlage: V }).status, 'unklar'); // Bedingung abweichend
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\n${ocr}\nkein Skonto auf Fracht` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  // Codex Runde 2: Einschraenkung in Klammern, Zahlungsziel als einziges ausgeschriebenes Datum, unlesbares beschriftetes Datum
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Berlin 23. November 2026\n${ocr.replace('-3% Skonto', '-3% Skonto (Frachtkosten ausgenommen)')}` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `zahlbar bis 23. November 2026\n${ocr}` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...ohne, text: `Rechnungsdatum: 03/11/2026\nBerlin 23. November 2026\n${ocr}` }, { iban: LIEFER, vorlage: V }).status, 'unklar');
});
