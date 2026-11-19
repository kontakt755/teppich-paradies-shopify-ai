import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auszugLesen, bankText, csvLesen, camtLesen, kontoauszugPdfLesen, artErkennen, datumLesen, bankBetrag, zuordnen, jeEmpfaenger, listeCsv, namePasst, nummernAusDateiname, spaltenErkennen } from '../lib/belege-bank.mjs';
import { bankLauf } from '../scripts/belege-bank.mjs';

// Alle Daten erfunden.
const IBAN1 = 'DE00123456780000000001';
const CSV_A = `"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"
"DE99";"01.10.26";"01.10.26";"FOLGELASTSCHRIFT";"Rechnung RE-55 Abo";"DE98ZZZ1";"M-1";"Muster Telefon GmbH";"${IBAN1}";"X";"-29,99";"EUR";"Umsatz gebucht"
"DE99";"05.10.26";"05.10.26";"ONLINE-UEBERWEISUNG";"RG 7711";"";"";"Muster Farben KG";"DE00123456780000000002";"X";"-1.190,00";"EUR";"Umsatz gebucht"
"DE99";"06.10.26";"06.10.26";"GUTSCHR. UEBERWEISUNG";"Kunde";"";"";"Frau Beispiel";"DE00123456780000000003";"X";"500,00";"EUR";"Umsatz gebucht"
"DE99";"07.10.26";"07.10.26";"KARTENZAHLUNG";"Tanken";"";"";"Muster Tankstelle";"";"X";"-50,00";"EUR";"Umsatz gebucht"
"DE99";"08.10.26";"08.10.26";"RUECKLASTSCHRIFT";"zurueck";"";"";"Muster Telefon GmbH";"${IBAN1}";"X";"-3,00";"EUR";"Umsatz gebucht"
`;

test('CSV: Spalten, Arten, Vorzeichen; eigenes Konto ist nicht der Empfaenger', () => {
  const { buchungen, nichtLesbar } = csvLesen(CSV_A);
  assert.equal(nichtLesbar, 0);
  assert.deepEqual(buchungen.map(b => b.art), ['lastschrift', 'ueberweisung', 'ueberweisung', 'karte', 'ruecklastschrift']);
  assert.equal(buchungen[0].iban, IBAN1);
  assert.equal(buchungen[0].name, 'Muster Telefon GmbH');
  assert.equal(buchungen[0].datum, '2026-10-01');
  assert.equal(buchungen[1].betrag, -1190);
  assert.equal(buchungen[2].betrag, 500);
});

test('CSV: Vorspann, Soll/Haben, getrennte Spalten, Windows-1252', () => {
  const vr = 'Kontoauszug;;\nZeitraum;01.10.2026;31.10.2026\n\nBuchungstag;Valuta;Zahlungsempfänger;IBAN;Vorgang/Verwendungszweck;Währung;Umsatz;Soll/Haben\n02.10.2026;02.10.2026;Müller GmbH;;Basislastschrift xy;EUR;12,50;S\n03.10.2026;03.10.2026;Kunde;;Gutschrift;EUR;80,00;H\nEndsaldo;;;;;;100,00;H\n';
  const r = csvLesen(vr);
  assert.deepEqual(r.buchungen.map(b => b.betrag), [-12.5, 80]);
  assert.equal(r.buchungen[0].name, 'Müller GmbH');
  assert.equal(r.buchungen[0].art, 'lastschrift');
  assert.equal(r.nichtLesbar, 1);
  const zwei = csvLesen('Datum;Empfänger;Soll;Haben;Buchungstext\n02.10.2026;A;12,50;;Dauerauftrag\n03.10.2026;B;;7,00;Gutschrift\n');
  assert.deepEqual(zwei.buchungen.map(b => b.betrag), [-12.5, 7]);
  assert.equal(bankText(Buffer.from('Zahlungsempf\xE4nger', 'latin1')), 'Zahlungsempfänger');
  assert.equal(bankText(Buffer.from('﻿äb')), 'äb');
});

test('CSV: Name aus der richtigen Spalte, wenn die Bank Zahlungspflichtige und Empfaenger trennt', () => {
  const s = spaltenErkennen(['Buchungsdatum', 'Zahlungspflichtige*r', 'Zahlungsempfänger*in', 'Verwendungszweck', 'Umsatztyp', 'IBAN', 'Betrag (€)', 'Gläubiger-ID', 'Mandatsreferenz']);
  assert.deepEqual([s.name, s.betrag, s.art, s.iban, s.glaeubiger, s.mandat], [2, 6, 4, 5, 7, 8]);
  const vr = spaltenErkennen(['Bezeichnung Auftragskonto', 'IBAN Auftragskonto', 'Buchungstag', 'Name Zahlungsbeteiligter', 'IBAN Zahlungsbeteiligter', 'Betrag']);
  assert.deepEqual([vr.name, vr.iban], [3, 4]);
  assert.throws(() => csvLesen('a;b\n1;2\n'), /keine Kopfzeile/);
});

test('Lesehilfen: nichts wird erraten', () => {
  assert.equal(datumLesen('31.10.2026'), '2026-10-31');
  assert.equal(datumLesen('2026-10-31'), '2026-10-31');
  assert.equal(datumLesen('Saldo'), null);
  assert.equal(bankBetrag('-1.234,56 €'), -1234.56);
  assert.equal(bankBetrag('+5,00'), 5);
  assert.equal(bankBetrag('12'), 12);
  assert.equal(bankBetrag('abc'), null);
  assert.equal(bankBetrag('-461,2'), -461.2); // Commerzbank-CSV kuerzt die Null
  assert.equal(bankBetrag('1,2345'), null);
  assert.equal(artErkennen({ text: 'Sonstiges' }), 'unklar');
  assert.equal(artErkennen({ text: 'Sonstiges', mandat: 'M1' }), 'lastschrift');
});

const CAMT = `<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Ntry><Amt Ccy="EUR">29.99</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-10-01</Dt></BookgDt><BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>RDDT</Cd><SubFmlyCd>ESDD</SubFmlyCd></Fmly></Domn></BkTxCd>
<NtryDtls><TxDtls><Refs><MndtId>M-1</MndtId></Refs><RltdPties><Cdtr><Nm>Muster &amp; Telefon GmbH</Nm></Cdtr><CdtrAcct><Id><IBAN>${IBAN1}</IBAN></Id></CdtrAcct></RltdPties><RmtInf><Ustrd>Rechnung RE-55</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">30.5</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>2026-10-02</Dt></BookgDt><BkTxCd><Prtry><Cd>NTRF+116</Cd></Prtry></BkTxCd>
<NtryDtls><TxDtls><Amt Ccy="EUR">10.50</Amt><RltdPties><Cdtr><Pty><Nm>Eins KG</Nm></Pty></Cdtr></RltdPties></TxDtls><TxDtls><Amt Ccy="EUR">20.00</Amt><RltdPties><Cdtr><Pty><Nm>Zwei KG</Nm></Pty></Cdtr></RltdPties></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-10-03</Dt></BookgDt><NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Kunde</Nm></Dbtr></RltdPties></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">9.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>PDNG</Sts><BookgDt><Dt>2026-10-04</Dt></BookgDt></Ntry>
<Ntry><Amt Ccy="EUR">kaputt</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-10-05</Dt></BookgDt></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

test('CAMT.053: Lastschrift und Ueberweisung, Sammler einzeln, Vorgemerktes nicht, Kaputtes gezaehlt', () => {
  const r = camtLesen(CAMT);
  assert.equal(r.nichtLesbar, 1);
  assert.deepEqual(r.buchungen.map(b => [b.betrag, b.name, b.art]), [
    [-29.99, 'Muster & Telefon GmbH', 'lastschrift'],
    [-10.5, 'Eins KG', 'ueberweisung'],
    [-20, 'Zwei KG', 'ueberweisung'],
    [100, 'Kunde', 'unklar'],
  ]);
  assert.equal(r.buchungen[0].iban, IBAN1);
  assert.equal(r.buchungen[0].zweck, 'Rechnung RE-55');
  assert.throws(() => camtLesen('<Document><Foo/></Document>'), /kein CAMT/);
});

test('Datei am Inhalt erkannt, ZIP wird abgelehnt statt geraten', () => {
  assert.equal(auszugLesen(Buffer.from(CAMT)).format, 'camt');
  assert.equal(auszugLesen(Buffer.from(CSV_A)).format, 'csv');
  assert.throws(() => auszugLesen(Buffer.from('PK\x03\x04')), /entpacken/);
});

// Layout-Text wie aus belege_pdf.py: Name, Valuta, Betrag (Minus hinten = Last), darunter der Zweck.
const AUSZUG_PDF = [
  'Kontoauszug vom 30.10.2026                                    USt-IdNr.: DE 000',
  'Muster GmbH',
  '                                                    zu Ihren Lasten        zu Ihren Gunsten',
  '  Alter Kontostand vom 30.09.2026                                                  1.000,00',
  '  Angaben zu den Umsätzen                              Valuta',
  '  Buchungsdatum:  01.10.2026',
  '  Muster Telefon GmbH                                  01.10.             29,99-',
  '  Rechnung RE-55 Abo',
  '  Mandatsref: M-1',
  '  Gläubiger-ID:',
  '  DE98ZZZ00000000001',
  '  SEPA-BASISLASTSCHRIFT wiederholend',
  '  Muster Farben KG                                     01.10.          1.190,00-',
  '  und Lacke',
  '  COBADEFFXXX',
  '  DE00123456780000000002',
  '  Kd 1 / Rechnungsnr.: 77',
  '  Folgeseite vorhanden',
  'Kontoauszug vom 30.10.2026                                    USt-IdNr.: DE 000',
  'Muster GmbH',
  '  Angaben zu den Umsätzen                              Valuta',
  '  11 / 30.09.2026',
  '  Buchungsdatum:  02.10.2026',
  '  Frau Beispiel                                        02.10.                             500,00',
  '  Kunde',
  '  Hinweis der Bank                                     02.10.                               0,00',
  '  ab 2027 neues Entgelt',
  '  Kontoführung                                         31.10.             10,00-',
  '  Kontoführung          10,00- EUR',
  '  Neuer Kontostand vom 30.10.2026                                                    270,01',
].join('\n');

test('Kontoauszug-PDF: Buchungen ueber den Seitenwechsel, Probe gegen den Kontostand', () => {
  const { format, buchungen, nichtLesbar } = kontoauszugPdfLesen(AUSZUG_PDF);
  assert.equal(format, 'pdf-auszug');
  assert.equal(nichtLesbar, 0);
  assert.deepEqual(buchungen.map(b => [b.datum, b.betrag, b.art]), [
    ['2026-10-01', -29.99, 'lastschrift'], ['2026-10-01', -1190, 'ueberweisung'], ['2026-10-02', 500, 'unklar'], ['2026-10-02', -10, 'bank'],
  ]);
  assert.equal(buchungen[0].iban, '', 'die Glaeubiger-ID ist kein Gegenkonto');
  assert.equal(buchungen[1].iban, 'DE00123456780000000002');
  assert.equal(buchungen[1].name, 'Muster Farben KG und Lacke', 'langer Name laeuft in die zweite Zeile');
  assert.equal(buchungen[1].zweck, 'Kd 1 / Rechnungsnr.: 77 11 / 30.09.2026', 'Seitenkopf gehoert nicht zum Zweck');
  // Die im Auszug umbrochene Rechnungsnummer wird trotzdem gefunden.
  assert.equal(zuordnen(buchungen, [BELEG({ rechnungsnummer: '7711', brutto: 1 })]).buchungen[1].beleg.guete, 'nummer');
  assert.throws(() => kontoauszugPdfLesen(AUSZUG_PDF.replace('270,01', '270,02')), /Kontostand/);
  assert.throws(() => kontoauszugPdfLesen('nur Text'), /Kontostand/);
});

test('Lauf: PDF geht ueber den PDF-Helfer, nicht ueber den CSV-Leser', () => {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'belege-bank-'));
  const datei = path.join(privat, 'auszug.pdf');
  fs.writeFileSync(datei, '%PDF-1.7 erfunden');
  const e = bankLauf({ datei, privat, pdf: () => ({ text: AUSZUG_PDF }) });
  assert.equal(e.format, 'pdf-auszug');
  assert.deepEqual([e.buchungen, e.ausgaben, e.arten], [4, 3, { lastschrift: 1, ueberweisung: 1, bank: 1 }]);
  fs.rmSync(privat, { recursive: true, force: true });
});

const BELEG = (x) => ({ rolle: 'rechnung', anbieter: 'Muster Telefon', anbieterSchluessel: 'muster-telefon.example', brutto: null, rechnungsnummer: null, datei: 'd', tag: '2026-10-01', ...x });

test('Zuordnung: Nummer vor Betrag und Name, nur Betrag ist Hinweis, jeder Beleg einmal', () => {
  const b = [
    BELEG({ datei: 'nr', rechnungsnummer: 'RE-55', brutto: 1 }),
    BELEG({ datei: 'name', anbieter: 'Muster Farben', anbieterSchluessel: 'farben.example', brutto: 1190 }),
    BELEG({ datei: 'allein', anbieter: 'Anders AG', anbieterSchluessel: 'anders.example', brutto: 50 }),
    BELEG({ datei: 'bleibt', anbieter: 'Offen', anbieterSchluessel: 'offen.example', brutto: 777 }),
    BELEG({ datei: 'unklar', rolle: 'unklar', anbieter: 'Muster Telefon', brutto: 3 }),
    BELEG({ datei: 'doppelt', dublette: 'x', brutto: 3 }),
  ];
  const { buchungen, ohneBuchung } = zuordnen(csvLesen(CSV_A).buchungen, b);
  assert.deepEqual(buchungen.map(x => x.beleg && [x.beleg.datei, x.beleg.guete]), [['nr', 'nummer'], ['name', 'betrag-und-name'], null, ['allein', 'nur-betrag'], null]);
  assert.deepEqual(ohneBuchung.map(x => x.datei), ['bleibt']);
  // Zwei gleiche Betraege ohne Namensbezug: kein Hinweis, das waere geraten.
  const zwei = zuordnen([{ betrag: -50, name: 'X', zweck: '' }], [BELEG({ datei: 'a', anbieter: 'A1', anbieterSchluessel: 'a1.example', brutto: 50 }), BELEG({ datei: 'b', anbieter: 'B1', anbieterSchluessel: 'b1.example', brutto: 50 })]);
  assert.equal(zwei.buchungen[0].beleg, null);
  assert.equal(namePasst('Muster Telefon GmbH', { anbieter: 'x', anbieterSchluessel: 'telefon.example' }), true);
  assert.equal(namePasst('GmbH & Co. KG', { anbieter: 'Andere GmbH & Co. KG' }), false);
});

const guete = (buchung, belege) => zuordnen([buchung], belege).buchungen[0].beleg?.guete ?? null;

test('Zuordnung: Skonto mit Nummer aus dem Dateinamen ist ein eigener Treffer', () => {
  const beleg = [BELEG({ anbieter: 'Muster Metall', anbieterSchluessel: 'metall.example', originalName: 'RG 44556677 20261016.pdf', brutto: 123.45 })];
  const zahlung = betrag => guete({ betrag, name: 'Fremder Name AG', zweck: 'Kd.-Nr.:123456, Rg.-Nr.:44556677, - 3 Prozent Skonto' }, beleg);
  assert.equal(zahlung(-119.75), 'nummer-skonto', '3 %, auf den Cent gerundet');
  assert.equal(zahlung(-120.98), 'nummer-skonto', '2 %');
  assert.equal(zahlung(-123.45), 'nummer', 'voller Betrag');
  assert.equal(zahlung(-117.28), null, '5 % ist kein ueblicher Satz');
  assert.equal(guete({ betrag: -119.75, name: 'Fremder Name AG', zweck: 'Rg.-Nr.:99887766' }, beleg), null, 'andere Nummer');
});

test('Zuordnung: unklarer Beleg zaehlt nur mit Nummer und Betrag', () => {
  const unklar = [BELEG({ rolle: 'unklar', anbieter: 'Muster Verpackung', anbieterSchluessel: 'verpackung.example', rechnungsnummer: '5566778', brutto: 88.5 })];
  // Der Auszug bricht die Nummer um, und gezahlt wird an eine Factoring-Firma mit anderem Namen.
  const r = zuordnen([{ betrag: -88.5, name: 'Muster Factoring GmbH', zweck: 'Kundennummer:1234567,Rechnung Nr.55 66778, 17.09.2026' }], unklar);
  assert.equal(r.buchungen[0].beleg.guete, 'nummer');
  assert.deepEqual(r.ohneBuchung, []);
  assert.equal(guete({ betrag: -90, name: 'X', zweck: 'Rechnung Nr.5566778' }, unklar), null, 'Nummer ohne passenden Betrag reicht nicht');
  assert.equal(guete({ betrag: -88.5, name: 'Muster Verpackung', zweck: 'ohne Nummer' }, unklar), null, 'Betrag und Name reichen nicht');
  assert.deepEqual(zuordnen([], unklar).ohneBuchung, [], 'unklare Belege stehen nie unter „ohne Buchung“');
  // Eine kurze Nummer steht zufaellig im Datum: ohne passenden Betrag kein Treffer.
  assert.equal(guete({ betrag: -50, name: 'X', zweck: 'Abschlag 01.10.2026' }, [BELEG({ rolle: 'unklar', rechnungsnummer: '2026', brutto: 88.5 })]), null);
});

test('Zuordnung: Beleg ohne lesbaren Betrag ueber Nummer im Dateinamen und Name', () => {
  const beleg = [BELEG({ anbieter: 'Muster Kettelei', anbieterSchluessel: 'kettelei@mail.example', originalName: ' RE-4711 01.10.2026 19_01_07.pdf' })];
  const zahlung = (name, zweck) => guete({ betrag: -1300.5, name, zweck }, beleg);
  assert.equal(zahlung('Muster Kettelei GmbH', 'RE-4711 Kundnr.: 10001, 01.10.2026'), 'nummer-ohne-betrag');
  assert.equal(zahlung('Ganz Anders AG', 'RE-4711 Kundnr.: 10001'), null, 'ohne Betrag muss der Name passen');
  assert.equal(zahlung('Muster Kettelei GmbH', 'Abschlag 01.10.2026'), null, 'das Datum im Dateinamen ist keine Nummer');
  assert.deepEqual(nummernAusDateiname(' RE-4711 01.10.2026 19_01_07.pdf'), ['RE4711']);
  assert.deepEqual(nummernAusDateiname('RG 44556677 20261016.pdf'), ['44556677']);
  assert.deepEqual(nummernAusDateiname('Rechnung 10-2026 Nr 4711.pdf'), [], 'Monat und kurze Nummer');
  // Eine gelesene Rechnungsnummer geht vor: der Dateiname wird dann nicht befragt.
  assert.equal(guete({ betrag: -5, name: 'Muster Kettelei', zweck: 'RE-4711' }, [BELEG({ anbieter: 'Muster Kettelei', rechnungsnummer: 'RE-9000', originalName: 'RE-4711.pdf' })]), null);
});

test('Liste je Empfaenger: Summe, Art, nur Ausgaben; CSV ohne ausfuehrbare Formeln', () => {
  const liste = jeEmpfaenger(zuordnen(csvLesen(CSV_A).buchungen, []).buchungen);
  assert.deepEqual(liste.map(e => [e.name, e.anzahl, e.summe, e.art]), [
    ['Muster Farben KG', 1, -1190, 'ueberweisung'],
    ['Muster Tankstelle', 1, -50, 'karte'],
    ['Muster Telefon GmbH', 2, -32.99, 'gemischt'],
  ]);
  const csv = listeCsv([{ name: '=HYPERLINK("x")', iban: '', art: 'lastschrift', anzahl: 1, summe: -1.5, mitBeleg: 0 }]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)";;lastschrift;1;-1,50;0/);
});

test('Lauf: schreibt nur in den Privatordner, Rueckgabe ohne Namen und IBAN', () => {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'belege-bank-'));
  const datei = path.join(privat, 'auszug.csv');
  fs.writeFileSync(datei, CSV_A);
  const ordner = path.join(privat, 'belege-archiv', '2026', '09');
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'manifest.json'), JSON.stringify({ belege: [BELEG({ rechnungsnummer: 'RE-55', brutto: 29.99 }), BELEG({ datei: 'alt', nichtMehrGefunden: true, brutto: 50 })] }));
  const e = bankLauf({ datei, privat });
  assert.deepEqual(e.belegeAus, ['2026-09']);
  assert.deepEqual(e.zugeordnet, { nummer: 1 });
  assert.equal(e.empfaenger, 3);
  assert.doesNotMatch(JSON.stringify({ ...e, ordner: '' }), /Muster|DE00/);
  const liste = JSON.parse(fs.readFileSync(path.join(e.ordner, 'liste-2026-10_2026-10.json'), 'utf8'));
  assert.equal(liste.empfaenger.length, 3);
  assert.equal(fs.statSync(path.join(e.ordner, 'liste-2026-10_2026-10.csv')).mode & 0o077, 0);
  fs.rmSync(privat, { recursive: true, force: true });
});

test('CSV der Commerzbank: „IBAN Kontoinhaber“ ist unser Konto, nicht der Empfaenger', () => {
  const kopf = 'Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Währung;IBAN Kontoinhaber;Kategorie;Sender;Empfänger;Verwendungszweck';
  const s = spaltenErkennen(kopf.split(';'));
  assert.equal(s.iban, -1);
  const r = csvLesen(`${kopf}\n25.09.2026;25.09.2026;Überweisung;Jordan Rechnung 117466TP050;-461,2;EUR;DE00;;;Jordan;RE 117466\n`);
  assert.equal(r.nichtLesbar, 0);
  assert.equal(r.buchungen[0].betrag, -461.2);
  assert.equal(r.buchungen[0].iban, '');
});
