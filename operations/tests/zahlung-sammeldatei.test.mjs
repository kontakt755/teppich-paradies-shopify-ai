import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ibanGueltig, naechsterLauf, zahlungsbedingungenLesen, rechnungPruefen, pdfRechnungPruefen, painGegenpruefen, umsatzPdfLesen } from '../lib/zahlung-sammeldatei.mjs';
import { sammelLauf } from '../scripts/zahlung-sammeldatei.mjs';

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
  assert.match(liste, /Bezahlt-Abgleich nicht möglich/);
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

test('Veralteter Kontoauszug: zaehlt fuer bezahlt, aber verfallenes Skonto kommt nicht in die Datei', () => {
  const privat = privatOrdner();
  const e = sammelLauf({ privat, jetzt: new Date('2026-11-12T09:00:00Z') }); // letzte Buchung 06.11.
  assert.equal(e.auszugAktuell, false);
  const liste = listeLesen(privat, e);
  assert.match(liste, /KONTOAUSZUG VERALTET/);
  assert.equal(statusVon(liste, '700004'), 'bezahlt');
  assert.equal(statusVon(liste, '700003'), 'UNKLAR');
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
  assert.equal(pdfRechnungPruefen({ ...r, waehrung: null }, { iban: LIEFER }).status, 'unklar');
  assert.equal(pdfRechnungPruefen(r, { iban: LIEFER }).status, 'ok');
  assert.equal(pdfRechnungPruefen(r, { iban: FREMD }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...r, brutto: 234.5 }, { iban: LIEFER }).status, 'unklar'); // 234,50 steckt nur in 1.234,50
  assert.equal(pdfRechnungPruefen({ ...r, nummer: 'R-2026-999' }, { iban: LIEFER }).status, 'unklar');
  assert.equal(pdfRechnungPruefen({ ...r, brutto: null }, { iban: LIEFER }).status, 'unklar');
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

  // Veralteter Auszug: PDF-Rechnung nicht in die Datei
  const privat2 = privatOrdner();
  fs.cpSync(monat, path.join(privat2, 'belege-archiv', '2026', '11'), { recursive: true });
  const spaet = sammelLauf({ privat: privat2, jetzt: new Date('2026-11-13T09:00:00Z'), pdf });
  assert.match(listeLesen(privat2, spaet), /UNKLAR;[^\r]*R-2026-501[^\r]*ohne aktuellen, vollständigen Kontoauszug/);
});

test('Ungelesene Buchung im Auszug: gilt als unvollstaendig, verfallenes Skonto nicht in die Datei', () => {
  const privat = privatOrdner();
  const datei = path.join(privat, 'laden-entlastung-2026-11', 'bank-export', 'umsaetze.csv');
  fs.appendFileSync(datei, `07.11.2026;Überweisung;RE 700003;Muster & Söhne GmbH;${LIEFER};kaputt\n`);
  const e = sammelLauf({ privat, jetzt: HEUTE });
  assert.equal(e.auszugAktuell, false);
  assert.equal(e.bankZeilenNichtLesbar, 1);
  const liste = listeLesen(privat, e);
  assert.match(liste, /1 Buchung\(en\) NICHT LESBAR/);
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
