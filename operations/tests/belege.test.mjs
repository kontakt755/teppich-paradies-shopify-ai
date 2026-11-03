import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  einordnen, einordnenKopf, rolleAnhang, xmlRechnungLesen, pdfTextLesen, betragLesen, belegFelder, belegKopfArt, nummerAusBetreff, ablegenUnveraenderlich,
  archivName, sichererName, dublettenMarkieren, druckReihenfolge, summenJeAnbieter, wiederkehrend, pruefKandidaten,
  manifestZusammenfuehren, monatsGrenzen, monatDavor, berlinTag, anbieterSchluessel, anbieterName, sha256,
} from '../lib/belege.mjs';
import { mailAuswerten, lauf, deckblattHtml, pdfAnalyse } from '../scripts/belege-monat.mjs';

const ANBIETER = { name: 'Muster Anbieter GmbH', adresse: 'rechnung@post.muster-anbieter.example' };
const CII = `<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="x" xmlns:ram="y"><rsm:ExchangedDocument><ram:ID>RE-2026-77</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20261015</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument><ram:SellerTradeParty><ram:Name>Muster Anbieter GmbH</ram:Name></ram:SellerTradeParty><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">19.00</ram:TaxTotalAmount><ram:GrandTotalAmount>119.00</ram:GrandTotalAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></rsm:CrossIndustryInvoice>`;
const UBL = `<Invoice xmlns:cbc="c" xmlns:cac="a"><cbc:ID>U-1</cbc:ID><cbc:IssueDate>2026-10-02</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode><cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Muster</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty><cac:TaxTotal><cbc:TaxAmount>1.90</cbc:TaxAmount></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>10.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>11.90</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal><cac:InvoiceLine><cbc:ID>99</cbc:ID></cac:InvoiceLine></Invoice>`;

test('Einordnung: eigene Mails, Versandmarken, Avise und Nicht-Rechnungen werden getrennt', () => {
  const pdf = { name: 'x.pdf', pdf: true };
  assert.equal(einordnen({ von: { adresse: 'kontakt@teppich-paradies.net' }, betreff: 'Rechnung RE1', anhaenge: [pdf] }).klasse, 'eigen');
  assert.equal(einordnen({ von: { adresse: 'verkauf@teppich-paradies.net' }, betreff: 'Rechnung', anhaenge: [pdf] }).klasse, 'eigen');
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Ihre Versandmarke zur Rechnung', anhaenge: [pdf] }).klasse, 'versandmarke');
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Zahlungsavis Rechnung 12', anhaenge: [pdf] }).klasse, 'avis');
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Lieferschein 12', anhaenge: [pdf] }).klasse, 'lieferschein');
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Rechnung von Teppich-Paradies', anhaenge: [pdf] }).klasse, 'ausgang');
  assert.equal(einordnen({ von: { adresse: 'service@paypal.de' }, betreff: 'Beleg', anhaenge: [] }).klasse, 'zahlung');
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Newsletter', anhaenge: [] }).klasse, 'sonstiges');
});

test('Einordnung: Unklares wird markiert, nicht geraten', () => {
  const r = { name: 'rechnung-1.pdf', pdf: true };
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Rechnung 1', anhaenge: [r] }).klasse, 'rechnung');
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Unterlagen', labels: ['08'], anhaenge: [{ name: 'scan.pdf', pdf: true }] }).klasse, 'rechnung');
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Unterlagen', anhaenge: [r] }).klasse, 'unklar');
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Ihre Rechnung', anhaenge: [] }).klasse, 'unklar');
  assert.equal(einordnen({ von: ANBIETER, betreff: 'Mahnung Rechnung 1', anhaenge: [r] }).klasse, 'unklar');
  assert.equal(einordnen({ von: { adresse: 'kontakt@teppich-paradies.net' }, betreff: 'WG: Rechnung', anhaenge: [r] }).klasse, 'unklar');
});

test('Portal-Anbieter: Hinweis ohne Anhang ist Aufgabe, mit Anhang normaler Beleg', () => {
  const von = { adresse: 'payments-noreply@google.com' };
  assert.equal(einordnenKopf({ von, betreff: 'Rechnung verfuegbar' }).portal, 'Google Ads');
  assert.equal(einordnen({ von, betreff: 'Rechnung verfuegbar', anhaenge: [] }).klasse, 'portal');
  assert.equal(einordnen({ von, betreff: 'Rechnung verfuegbar', anhaenge: [{ name: 'rechnung.pdf', pdf: true }] }).klasse, 'rechnung');
});

test('XML: ZUGFeRD/CII und UBL, Belegnummer nicht aus Positionen, fremdes XML ist keine Rechnung', () => {
  const c = xmlRechnungLesen(CII);
  assert.deepEqual([c.format, c.nummer, c.datum, c.netto, c.steuer, c.brutto, c.waehrung, c.art], ['CII', 'RE-2026-77', '2026-10-15', 100, 19, 119, 'EUR', 'rechnung']);
  const u = xmlRechnungLesen(UBL);
  assert.deepEqual([u.format, u.nummer, u.datum, u.brutto, u.steuer, u.verkaeufer], ['UBL', 'U-1', '2026-10-02', 11.9, 1.9, 'Muster']);
  assert.equal(xmlRechnungLesen(CII.replace('380', '381')).art, 'gutschrift');
  assert.equal(xmlRechnungLesen('<kml><Foo/></kml>'), null);
});

test('PDF-Text: nur eindeutige Werte, sonst leer', () => {
  const eindeutig = pdfTextLesen('Teppich Paradies\nRechnungsnummer: RE-55\nRechnungsdatum 15.10.2026\nNetto 100,00\nMwSt 19,00\nGesamtbetrag 119,00 EUR\n');
  assert.deepEqual([eindeutig.nummer, eindeutig.datum, eindeutig.brutto, eindeutig.waehrung], ['RE-55', '2026-10-15', 119, 'EUR']);
  const zwei = pdfTextLesen('Gesamtbetrag 119,00\nZahlbetrag 100,00\nRechnungsnr. 1234\nRechnungsnr. 9999');
  assert.equal(zwei.brutto, null);
  assert.equal(zwei.betragMehrdeutig, true);
  assert.equal(zwei.nummer, null);
  assert.equal(zwei.nummerMehrdeutig, true);
  assert.equal(pdfTextLesen('Nur Text und 50,00 irgendwo').brutto, null);
  assert.equal(pdfTextLesen('Summe netto 100,00').brutto, null);
  // Nummer aus dem Betreff zaehlt nur, wenn sie auch im Text steht.
  assert.equal(pdfTextLesen('Text ohne Stichwort', { hinweisNummer: 'A-123' }).nummer, null);
  assert.equal(pdfTextLesen('Beleg A-123 vom', { hinweisNummer: 'A-123' }).nummer, 'A-123');
  assert.equal(betragLesen('1.234,56'), 1234.56);
  assert.equal(betragLesen('1,234.56'), 1234.56);
  assert.equal(betragLesen('12,5'), null);
  assert.equal(betragLesen('10,00-'), -10);
});

test('Belegfelder: XML vor Text, Abweichung gemeldet, Gutschrift negativ, leer heisst pruefen', () => {
  const x = belegFelder({ xml: CII, text: 'Teppich Paradies Gesamtbetrag 119,00' });
  assert.equal(x.quelle, 'xml');
  assert.equal(x.brutto, 119);
  assert.deepEqual(x.pruefen, []);
  assert.ok(belegFelder({ xml: CII, text: 'Teppich Paradies\nGesamtbetrag 120,00' }).pruefen.includes('Betrag im PDF weicht von der XML ab'));
  assert.equal(belegFelder({ xml: CII.replace('380', '381') }).brutto, -119);
  const leer = belegFelder({ text: '' });
  assert.equal(leer.brutto, null);
  assert.equal(leer.nummer, null);
  assert.equal(leer.quelle, null);
  for (const p of ['Kein Text im PDF (Scan?)', 'Betrag fehlt', 'Rechnungsnummer fehlt']) assert.ok(leer.pruefen.includes(p));
  assert.ok(belegFelder({ text: 'Rechnung an Fremdfirma\nGesamtbetrag 5,00' }).pruefen.includes('Empfänger im PDF nicht als Teppich Paradies erkannt'));
  assert.ok(belegFelder({ text: '', pdfLesbar: false }).pruefen.includes('PDF nicht lesbar'));
});

test('Ablage: nie ueberschreiben, schreibgeschuetzt, fremde Namen bestimmen keinen Pfad', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'belege-'));
  const p = path.join(dir, 'a', 'b.pdf');
  assert.equal(ablegenUnveraenderlich(p, Buffer.from('eins')), 'neu');
  assert.equal(ablegenUnveraenderlich(p, Buffer.from('eins')), 'vorhanden');
  assert.throws(() => ablegenUnveraenderlich(p, Buffer.from('zwei')), /nichts überschrieben/);
  assert.equal(fs.readFileSync(p, 'utf8'), 'eins');
  assert.equal(fs.statSync(p).mode & 0o222, 0);
  assert.equal(sichererName('../../etc/passwd'), 'passwd');
  assert.equal(sichererName('..\\..\\böse datei.pdf'), 'bose_datei.pdf');
  assert.equal(sichererName('...'), 'anhang');
  const n = archivName({ tag: '2026-10-15', anbieter: '../Muster/x', hash: 'a'.repeat(64), name: '../r.pdf' });
  assert.equal(path.basename(n), n);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Dubletten, Reihenfolge, Summen: Doppel zaehlen einmal, ohne Betrag bleibt erkennbar', () => {
  const b = [
    { rolle: 'rechnung', datei: 'a', sha256: 'h1', anbieter: 'Beta', anbieterSchluessel: 'b', tag: '2026-10-02', rechnungsnummer: 'R1', brutto: 10, waehrung: 'EUR' },
    { rolle: 'rechnung', datei: 'b', sha256: 'h1', anbieter: 'Beta', anbieterSchluessel: 'b', tag: '2026-10-03', rechnungsnummer: 'R1', brutto: 10, waehrung: 'EUR' },
    { rolle: 'rechnung', datei: 'c', sha256: 'h2', anbieter: 'Beta', anbieterSchluessel: 'b', tag: '2026-10-04', rechnungsnummer: 'R1', brutto: 10, waehrung: 'EUR' },
    { rolle: 'rechnung', datei: 'd', sha256: 'h3', anbieter: 'Alpha', anbieterSchluessel: 'a', tag: '2026-10-05', rechnungsnummer: null, brutto: null, waehrung: null },
    { rolle: 'rechnung', datei: 'e', sha256: 'h4', anbieter: 'Beta', anbieterSchluessel: 'b', tag: '2026-10-01', rechnungsnummer: 'R2', brutto: -2.5, waehrung: 'EUR' },
    { rolle: 'beilage', datei: 'f', sha256: 'h5', anbieter: 'Beta', anbieterSchluessel: 'b', tag: '2026-10-01', brutto: 99 },
    { rolle: 'unklar', datei: 'g', sha256: 'h6', anbieter: 'Beta', anbieterSchluessel: 'b', tag: '2026-10-01', brutto: 77 },
    { rolle: 'rechnung', datei: 'h', sha256: 'h7', anbieter: 'Gamma', anbieterSchluessel: 'g', tag: '2026-10-01', rechnungsnummer: 'U', brutto: 5, waehrung: 'USD' },
  ];
  dublettenMarkieren(b);
  assert.equal(b[1].dublette, 'a');
  assert.equal(b[2].dublette, 'a');
  assert.deepEqual(druckReihenfolge(b).map(x => x.datei), ['d', 'e', 'a', 'h']);
  const s = summenJeAnbieter(b);
  assert.deepEqual(s.find(x => x.schluessel === 'b'), { anbieter: 'Beta', schluessel: 'b', anzahl: 2, ohneBetrag: 0, summe: 7.5, fremdwaehrung: 0 });
  assert.equal(s.find(x => x.schluessel === 'a').ohneBetrag, 1);
  assert.equal(s.find(x => x.schluessel === 'g').summe, 0);
  assert.equal(s.find(x => x.schluessel === 'g').fremdwaehrung, 1);
});

test('Wiederkehrend: nur was in allen Vormonaten da war; fehlend; Kandidaten nur klein und mit Betrag', () => {
  const r = wiederkehrend({ historie: { '2026-09': new Set(['a', 'b']), '2026-08': new Set(['a', 'c']) }, aktuell: [], namen: { a: 'Alpha' } });
  assert.deepEqual(r.wiederkehrend.map(x => x.anbieter), ['Alpha']);
  assert.deepEqual(r.fehlend.map(x => x.schluessel), ['a']);
  assert.deepEqual(wiederkehrend({ historie: { '2026-09': new Set(['a']) }, aktuell: ['a'] }).fehlend, []);
  assert.deepEqual(wiederkehrend({ aktuell: ['a'] }), { wiederkehrend: [], fehlend: [] });
  const k = pruefKandidaten([{ schluessel: 'a', anzahl: 1, ohneBetrag: 0, summe: 20 }, { schluessel: 'b', anzahl: 1, ohneBetrag: 0, summe: 900 }, { schluessel: 'c', anzahl: 1, ohneBetrag: 1, summe: 0 }, { schluessel: 'd', anzahl: 1, ohneBetrag: 0, summe: 5 }], ['a', 'b', 'c']);
  assert.deepEqual(k.map(x => x.schluessel), ['a']);
});

test('Monat und Anbieter: Berliner Tag entscheidet, Grenzen mit Rand, Subdomain zaehlt nicht', () => {
  assert.deepEqual(monatsGrenzen('2026-10'), { jahr: '2026', mm: '10', after: '2026/09/30', before: '2026/11/02' });
  assert.deepEqual(monatsGrenzen('2026-12').before, '2027/01/02');
  assert.throws(() => monatsGrenzen('2026-13'));
  assert.equal(monatDavor('2026-01'), '2025-12');
  assert.equal(berlinTag('2026-10-31T23:30:00Z'), '2026-11-01');
  assert.equal(anbieterSchluessel('a@rechnung.muster.example'), 'muster.example');
  assert.equal(anbieterName({ name: 'noreply', adresse: 'noreply@muster.example' }), 'muster.example');
  assert.equal(anbieterName({ name: 'X', adresse: 'a@b.muster.example' }, { 'muster.example': 'Muster' }), 'Muster');
});

test('Manifest: was ein spaeterer Lauf nicht mehr findet, bleibt erhalten und wird gekennzeichnet', () => {
  const z = manifestZusammenfuehren([{ mailId: '1', sha256: 'a' }, { mailId: '2', sha256: 'b' }], [{ mailId: '2', sha256: 'b', neu: true }]);
  assert.deepEqual(z, [{ mailId: '1', sha256: 'a', nichtMehrGefunden: true }, { mailId: '2', sha256: 'b', neu: true }]);
});

function mailRoh({ betreff = 'Rechnung 123', von = 'Muster GmbH <rechnung@muster.example>', datum = 'Thu, 15 Oct 2026 10:00:00 +0200', teile = [] } = {}) {
  return Buffer.from([`From: ${von}`, `Subject: ${betreff}`, `Date: ${datum}`, 'Content-Type: multipart/mixed; boundary=g', '', 'Text',
    ...teile.flatMap(t => ['--g', `Content-Type: ${t.typ}; name="${t.name}"`, 'Content-Transfer-Encoding: base64', '', Buffer.from(t.inhalt).toString('base64')]),
    '--g--', ''].join('\r\n'));
}
const analyse = inhalt => ({ lesbar: true, seiten: 2, text: inhalt.toString().includes('MITXML') ? 'Teppich Paradies\nRechnungsnr. RE-2026-77\nGesamtbetrag 119,00 EUR' : 'Teppich Paradies\nGesamtbetrag 50,00 EUR\nRechnungsnr. X-55', eingebettet: inhalt.toString().includes('MITXML') ? [{ name: 'factur-x.xml', inhalt: Buffer.from(CII).toString('base64') }] : [] });

test('Mail auswerten: ZUGFeRD erkannt und XML extra, Begleit-XML wird kein zweiter Beleg', () => {
  const a = mailAuswerten({ roh: mailRoh({ teile: [{ typ: 'application/pdf', name: 'rechnung.pdf', inhalt: '%PDF-MITXML' }] }), id: 'm1', thread: 't1', labels: ['08'], analyse });
  assert.equal(a.eintrag.klasse, 'rechnung');
  assert.equal(a.belege.length, 1);
  const m = a.belege[0].meta;
  assert.deepEqual([m.zugferd, m.rechnungsnummer, m.brutto, m.quelle, m.absender, m.mailId, m.tag], [true, 'RE-2026-77', 119, 'xml', 'rechnung@muster.example', 'm1', '2026-10-15']);
  assert.equal(m.sha256, sha256(Buffer.from('%PDF-MITXML')));
  assert.equal(a.belege[0].xmlInhalt.toString(), CII);
  const b = mailAuswerten({ roh: mailRoh({ teile: [{ typ: 'application/pdf', name: 'rechnung.pdf', inhalt: '%PDF-a' }, { typ: 'text/xml', name: 'rechnung.xml', inhalt: CII }] }), id: 'm2', labels: ['08'], analyse });
  assert.equal(b.belege.length, 1);
  assert.equal(b.belege[0].meta.xrechnung, true);
  assert.equal(b.belege[0].meta.brutto, 119);
  const x = mailAuswerten({ roh: mailRoh({ teile: [{ typ: 'application/xml', name: 'xr.xml', inhalt: UBL }] }), id: 'm3', labels: ['08'], analyse });
  assert.equal(x.belege[0].meta.format, 'xml');
  assert.equal(x.belege[0].meta.brutto, 11.9);
});

test('Mail auswerten: Beilagen gehen nicht in die Rechnungen, Ausgesiebtes wird nicht abgelegt', () => {
  const a = mailAuswerten({ roh: mailRoh({ teile: [{ typ: 'application/pdf', name: 'rechnung.pdf', inhalt: '%PDF-a' }, { typ: 'application/pdf', name: 'AGB.pdf', inhalt: '%PDF-b' }] }), id: 'm', labels: [], analyse });
  assert.deepEqual(a.belege.map(b => b.meta.rolle), ['rechnung', 'beilage']);
  assert.deepEqual(mailAuswerten({ roh: mailRoh({ betreff: 'Versandmarke', teile: [{ typ: 'application/pdf', name: 'm.pdf', inhalt: '%PDF-a' }] }), id: 'm', labels: ['08'], analyse }).belege, []);
  const u = mailAuswerten({ roh: mailRoh({ betreff: 'Unterlagen', teile: [{ typ: 'application/pdf', name: 'rechnung.pdf', inhalt: '%PDF-a' }] }), id: 'm', labels: [], analyse });
  assert.equal(u.eintrag.klasse, 'unklar');
  assert.equal(u.belege[0].meta.rolle, 'unklar');
});

test('Lauf: Probelauf schreibt nichts; --schreiben legt ab, zweiter Lauf aendert keine Datei', async () => {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'belege-lauf-'));
  const mails = {
    1: mailRoh({ teile: [{ typ: 'application/pdf', name: 'rechnung.pdf', inhalt: '%PDF-MITXML' }] }),
    2: mailRoh({ von: 'k <kontakt@teppich-paradies.net>', teile: [{ typ: 'application/pdf', name: 'rechnung.pdf', inhalt: '%PDF-b' }] }),
    3: mailRoh({ datum: 'Sun, 01 Nov 2026 10:00:00 +0100', teile: [{ typ: 'application/pdf', name: 'rechnung.pdf', inhalt: '%PDF-c' }] }),
    4: mailRoh({ betreff: 'Unterlagen', teile: [{ typ: 'application/pdf', name: 'rechnung.pdf', inhalt: '%PDF-d' }] }),
  };
  const sitzungOeffnen = async (_z, arbeit) => arbeit({
    suche: async q => (q.startsWith('label:08') && q.includes('after:2026/09/30') ? [1, 2, 3] : q.startsWith('label:99') && q.includes('after:2026/09/30') ? [4] : []),
    daten: async uids => uids.map(u => ({ uid: u, id: `m${u}`, thread: `t${u}`, labels: [], eingang: null })),
    kopf: async () => Buffer.from(''),
    nachricht: async u => mails[u],
  });
  const basis = { monat: '2026-10', privat, zugang: {}, sitzungOeffnen, analyse, drucken: false };
  const probe = await lauf(basis);
  assert.equal(fs.existsSync(path.join(privat, 'belege-archiv')), false);
  assert.equal(probe.rechnungen, 2); // Mail 4 traegt Label 99, ist also Rechnung; Mail 2 eigen; Mail 3 November
  assert.equal(probe.ausserhalbMonat, 1);
  assert.deepEqual(probe.aussortiert, { eigen: 1 });
  assert.doesNotMatch(JSON.stringify(probe), /muster/i);
  const e = await lauf({ ...basis, schreiben: true });
  assert.equal(e.neuAbgelegt, 2);
  const ordner = path.join(privat, 'belege-archiv', '2026', '10');
  const dateien = fs.readdirSync(ordner).filter(d => d.endsWith('.pdf'));
  assert.equal(dateien.length, 2);
  const manifest = JSON.parse(fs.readFileSync(path.join(ordner, 'manifest.json'), 'utf8'));
  assert.equal(manifest.belege.length, 2);
  assert.equal(manifest.belege[0].sha256, sha256(fs.readFileSync(path.join(ordner, manifest.belege[0].datei))));
  const zeit = fs.statSync(path.join(ordner, dateien[0])).mtimeMs;
  const nochmal = await lauf({ ...basis, schreiben: true });
  assert.equal(nochmal.neuAbgelegt, 0);
  assert.equal(fs.statSync(path.join(ordner, dateien[0])).mtimeMs, zeit);
  fs.chmodSync(ordner, 0o700);
  fs.rmSync(privat, { recursive: true, force: true });
});

test('Deckblatt: fremde Betreffe werden maskiert, unvollstaendige Summe wird gesagt', () => {
  const h = deckblattHtml({
    monat: '2026-10', stand: '2026-11-03', gesamt: 10, summen: [{ anbieter: 'A<b>', schluessel: 'a', anzahl: 1, ohneBetrag: 1, summe: 10, fremdwaehrung: 0 }],
    liste: [{ tag: '2026-10-01', anbieter: 'A<b>', rechnungsnummer: null, brutto: null, pruefen: ['Betrag fehlt'], seite: 2 }],
    portale: [{ name: 'Portal', wo: 'Abrechnung', hinweise: 0, belege: 0 }], fehlend: [{ anbieter: 'Fehlt GmbH' }], wiederkehrend: [], kandidaten: [],
    unklar: [{ tag: '2026-10-01', von: 'x@y', betreff: '<script>alert(1)</script>', grund: 'g' }], nichtImDruck: [], dubletten: [], fehler: [], aussortiert: {},
    zahlen: { gefunden: 1, rechnungen: 1, ohneBetrag: 1, druckSeiten: 2 },
  });
  assert.doesNotMatch(h, /<script>/);
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /Summe unvollständig/);
  assert.match(h, /Fehlt GmbH/);
  assert.match(h, /Portal: Abrechnung/);
});

const PY = path.join(os.homedir(), '.venvs', 'analyse', 'bin', 'python');
const HELFER = new URL('../scripts/belege_pdf.py', import.meta.url).pathname;
test('PDF-Helfer: eingebettete XML, Seitenzahl, Zusammenfuegen', { skip: !fs.existsSync(PY) && 'kein Analyse-Python' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'belege-py-'));
  const p = path.join(dir, 'a.pdf');
  const bau = `from pypdf import PdfWriter\nw=PdfWriter()\nw.add_blank_page(200,200)\nw.add_blank_page(200,200)\nw.add_attachment("factur-x.xml", b"<x/>")\nw.write(${JSON.stringify(p)})`;
  assert.equal(spawnSync(PY, ['-c', bau]).status, 0);
  const a = JSON.parse(spawnSync(PY, [HELFER, 'analyse'], { input: fs.readFileSync(p) }).stdout);
  assert.equal(a.lesbar, true);
  assert.equal(a.seiten, 2);
  assert.equal(a.eingebettet[0].name, 'factur-x.xml');
  assert.equal(Buffer.from(a.eingebettet[0].inhalt, 'base64').toString(), '<x/>');
  assert.equal(JSON.parse(spawnSync(PY, [HELFER, 'analyse'], { input: Buffer.from('%PDF-kaputt') }).stdout).lesbar, false);
  assert.equal(pdfAnalyse(fs.readFileSync(p)).seiten, 2, 'Weg ueber die geloeschte Eingabedatei');
  const ziel = path.join(dir, 'z.pdf');
  const f = JSON.parse(spawnSync(PY, [HELFER, 'fuegen'], { input: JSON.stringify({ ausgabe: ziel, teile: [{ pfad: p, titel: 'A' }, { pfad: path.join(dir, 'fehlt.pdf') }, { pfad: p }] }) }).stdout);
  assert.equal(f.seiten, 4);
  assert.equal(f.fehler.length, 1);
  assert.equal(JSON.parse(spawnSync(PY, [HELFER, 'seiten', ziel]).stdout).seiten, 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('PDF-Text: Betrag direkt am Stichwort, andere Spalten und AGB-Text stoeren nicht', () => {
  assert.equal(pdfTextLesen('Gesamtgewicht netto: 200,00 kg   Endbetrag in EUR.:   1.111,11').brutto, 1111.11);
  assert.equal(pdfTextLesen('Gesamtbetrag EUR ohne MwSt. 100,00\n   Gesamtbetrag EUR inkl. MwSt. 119,00').brutto, 119);
  assert.equal(pdfTextLesen('Brutto 222,20 €').brutto, 222.2);
  assert.equal(pdfTextLesen('Brutto Gewicht (KG) 333,33').brutto, null);
  assert.equal(pdfTextLesen('Netto Gesamtbetrag 100,00').brutto, null);
  assert.equal(pdfTextLesen('Rechnungsbetrag 444,44 EUR\nDer Rechnungsbetrag erhoeht sich um zehn Prozent, mindestens jedoch um vierzig Euro (40,00 €)').brutto, 444.44);
});

test('Nummer: aus Dateiname und im Text bestaetigt schlaegt die Bezugsnummer einer Gutschrift', () => {
  const r = pdfTextLesen('Gutschrift GS100001\nRechnungsnummer: 7654321XY', { hinweisNummer: 'GS100001' });
  assert.equal(r.nummer, 'GS100001');
});

test('Anbieter: Freemail faellt nicht zusammen, Funktionsnamen weichen der Domain', () => {
  assert.equal(anbieterSchluessel('a@web.de'), 'a@web.de');
  assert.notEqual(anbieterSchluessel('a@gmx.de'), anbieterSchluessel('b@gmx.de'));
  assert.equal(anbieterName({ name: 'BITTE NICHT ANTWORTEN - Rechnungsversand', adresse: 'x@firma.example' }), 'firma.example');
  assert.equal(anbieterName({ name: 'Muster KG', adresse: 'x@firma.example' }), 'Muster KG');
});

test('Einordnung: Quittungs-Betreff mit Invoice-Anhang ist Rechnung, RE- und RG-Dateien sehen nach Beleg aus', () => {
  const pdf = name => ({ name, pdf: true, text: '' });
  const e = einordnen({ von: { adresse: 'x@firma.example' }, betreff: 'Your Firma receipt', labels: ['W'], anhaenge: [pdf('Invoice-1.pdf'), pdf('Receipt-1.pdf')] });
  assert.equal(e.klasse, 'rechnung');
  assert.deepEqual(e.rollen, ['rechnung', 'beilage']);
  assert.equal(rolleAnhang({ name: ' RE-1234 01.10.pdf' }), 'rechnung');
  assert.equal(rolleAnhang({ name: 'RG Firma 9.2.2026.pdf' }), 'rechnung');
  assert.equal(rolleAnhang({ name: 'Rezept.pdf' }), 'beilage');
});

test('Nummer: Dreiergruppen bleiben ganz, Dateiname aus Ziffern zaehlt nur, wenn er im Text steht', () => {
  assert.equal(pdfTextLesen('Rechnungsnummer 111 222 333 und Kundennummer 444 555 bitte angeben').nummer, '111222333');
  assert.equal(pdfTextLesen('Rechnung: 111 222 333', { hinweisNummer: '111222333' }).nummer, '111222333');
  assert.equal(pdfTextLesen('Rechnung Nr. 7000001 8000002').nummer, '7000001');
  const text = 'Rechnung\n0700012345\nGesamtbetrag: 10,00';
  assert.equal(belegFelder({ text, name: '0700012345.PDF' }).nummer, '0700012345');
  assert.equal(belegFelder({ text: 'Rechnung\nGesamtbetrag: 10,00', name: '0700012345.PDF' }).nummer, null);
  assert.equal(belegFelder({ text: 'Rechnung\nNummer 700012345 Musterstrasse\nGesamtbetrag: 10,00', name: '0700012345.PDF' }).nummer, '700012345');
  assert.equal(belegFelder({ text: 'Nummer 1700012345\nGesamtbetrag: 10,00', name: '0700012345.PDF' }).nummer, null);
});

test('Betrag: Rechnungswert, Total inkl. Steuer und Gesamt EUR zaehlen, Skonto-Zeilen und Netto nicht', () => {
  assert.equal(pdfTextLesen('Warenwert : 100,00 EUR\n19,00 % MwSt. : 19,00 EUR\nRechnungswert : 119,00 EUR').brutto, 119);
  assert.equal(pdfTextLesen('Total exkl 100,00\n  Total inkl Mwst € 119,00').brutto, 119);
  assert.equal(pdfTextLesen('Warenwert 200,00 EUR 19,0% MWSt 38,00 EUR Gesamt EUR 238,00').brutto, 238);
  const skonto = 'Gesamt EUR 500,00\nSKONTO BIS ZUM 26/10 ( -4.00 %): 20,00 EUR bleibt zu zahlen 480,00 EUR.\nSKONTO BIS ZUM 16/11 ( -2.00 %): 10,00 EUR bleibt zu zahlen 490,00 EUR.';
  const r = pdfTextLesen(skonto);
  assert.equal(r.brutto, 500);
  assert.equal(r.betragMehrdeutig, false);
  assert.equal(pdfTextLesen('Gesamt EUR ohne MwSt 100,00').brutto, null);
  assert.equal(pdfTextLesen('Rechnungswert netto 100,00').brutto, null);
});

test('Betrag: ein Datum ist nie ein Betrag', () => {
  assert.equal(pdfTextLesen('Der Rechnungsbetrag in Hoehe von 17.50 Euro wird am 15.10.2026 abgebucht').brutto, 17.5);
  assert.equal(pdfTextLesen('Rechnungsbetrag 1.234,56 EUR zahlbar bis 31.10.2026').brutto, 1234.56);
  assert.equal(pdfTextLesen('Rechnungsbetrag 1.234,56 EUR zahlbar bis 31.10.26').brutto, 1234.56);
  assert.equal(pdfTextLesen('Zu zahlen bis 15.11.2026').brutto, null);
  assert.equal(pdfTextLesen('Zu zahlen bis 15.11.').brutto, null);
  assert.equal(pdfTextLesen('Gesamtbetrag 12.50 EUR').brutto, 12.5);
  // Tausenderpunkt und Komma-Cent bleiben ein Betrag.
  assert.equal(pdfTextLesen('Gesamtbetrag 10.500,00 EUR').brutto, 10500);
});

test('Gutschrift: der Belegkopf entscheidet, nicht der Betreff der Mail', () => {
  const felder = (text, betreff, name = 'beleg.pdf') => belegFelder({ text: `Muster GmbH\nTeppich Paradies\n${text}`, betreff, name });
  const kopf = felder('Gutschrift\n7000001\nGesamtbetrag: 90,00 EUR', 'Rechnung von Muster GmbH, 7000001', '7000001.pdf');
  assert.deepEqual([kopf.art, kopf.brutto, kopf.pruefen], ['gutschrift', -90, []]);
  assert.equal(felder('Gutschrift TEPPICH PARADIES GMBH\nGesamtbetrag: 90,00 EUR', 'Rechnung').art, 'gutschrift');
  assert.equal(felder('Ihre Gutschrift\nGesamtbetrag: 90,00 EUR', 'Beleg').art, 'gutschrift');
  // Rechnung in einer Mail, deren Betreff beide Woerter nennt: bleibt positiv.
  const beide = felder('Rechnung Nr. 4711\nGesamtbetrag: 100,00 EUR', 'Rechnung und Gutschrift 10/2026');
  assert.deepEqual([beide.art, beide.brutto], ['rechnung', 100]);
  assert.deepEqual(beide.pruefen, []);
  // Kopf schweigt, Betreff nennt beides: nicht raten, sondern melden.
  const unklar = felder('Lieferung Oktober\nGesamtbetrag: 100,00 EUR', 'Rechnung und Gutschrift');
  assert.equal(unklar.brutto, 100);
  assert.ok(unklar.pruefen.includes('Betreff nennt Rechnung und Gutschrift: Art prüfen'));
  // Betreff nennt nur Gutschrift, der Kopf Rechnung: Kopf gilt, Hinweis.
  const streit = felder('Rechnung Nr. 4711\nGesamtbetrag: 100,00 EUR', 'Ihre Gutschrift');
  assert.deepEqual([streit.art, streit.brutto], ['rechnung', 100]);
  assert.ok(streit.pruefen.includes('Betreff nennt Gutschrift, Belegkopf Rechnung'));
  assert.equal(felder('Lieferung\nGesamtbetrag: 100,00 EUR', 'Ihre Gutschrift').art, 'gutschrift');
  assert.equal(felder('Lieferung\nGesamtbetrag: 100,00 EUR', 'Beleg', 'Verkaufsgutschrift 1.pdf').art, 'gutschrift');
  // Fliesstext und Positionen sind kein Titel.
  assert.equal(belegKopfArt('Gutschrift zum 18.10.2026 ohne Abzug'), null);
  assert.equal(belegKopfArt('Gutschrift Altware -10,00'), null);
  assert.equal(belegKopfArt('Rechnung an: Muster'), null);
  assert.equal(belegKopfArt('Rechnungsadresse\nGutschrift'), 'gutschrift');
});

test('Nummer: Serie und laufende Nummer bleiben ganz, sonst waere es eine falsche Dublette', () => {
  const a = belegFelder({ text: 'Invoice number ABC12XYZ 11111\nTotal due 20,00 EUR', name: 'Invoice-ABC12XYZ-11111.pdf' });
  const b = belegFelder({ text: 'Invoice number ABC12XYZ 22222\nTotal due 20,00 EUR', name: 'Invoice-ABC12XYZ-22222.pdf' });
  assert.equal(a.nummer, 'ABC12XYZ-11111');
  assert.equal(b.nummer, 'ABC12XYZ-22222');
  // Bindestrich kommt aus manchen PDFs als Nullzeichen.
  assert.equal(pdfTextLesen('Invoice number ABC12XYZ\x000009\nDate').nummer, 'ABC12XYZ-0009');
  const liste = [
    { rolle: 'rechnung', datei: 'x', sha256: 'h1', anbieterSchluessel: 'a', rechnungsnummer: a.nummer, brutto: 20 },
    { rolle: 'rechnung', datei: 'y', sha256: 'h2', anbieterSchluessel: 'a', rechnungsnummer: b.nummer, brutto: 20 },
    { rolle: 'rechnung', datei: 'z', sha256: 'h3', anbieterSchluessel: 'a', rechnungsnummer: 'ABO1', brutto: 5, rechnungsdatum: '2026-10-01' },
    { rolle: 'rechnung', datei: 'w', sha256: 'h4', anbieterSchluessel: 'a', rechnungsnummer: 'ABO1', brutto: 5, rechnungsdatum: '2026-10-08' },
  ];
  dublettenMarkieren(liste);
  assert.deepEqual(liste.map(x => x.dublette), [null, null, null, null]);
});

test('Waehrung: nur sicheres EUR kommt in die Summe', () => {
  const usd = belegFelder({ text: 'Teppich Paradies\nInvoice number R-100\nTotal due 20.00 USD' });
  assert.deepEqual([usd.brutto, usd.waehrung], [20, 'USD']);
  assert.ok(usd.pruefen.includes('Währung USD'));
  const ohne = belegFelder({ text: 'Teppich Paradies\nRechnung Nr. R-100\nGesamtbetrag 20,00' });
  assert.equal(ohne.waehrung, null);
  assert.ok(ohne.pruefen.includes('Währung nicht erkannt'));
  // Die Betragszeile schlaegt eine Erwaehnung anderswo im Beleg.
  assert.equal(pdfTextLesen('Kurs 1 EUR = 1,10 USD\nTotal due 20.00 USD').waehrung, 'USD');
  assert.equal(pdfTextLesen('Konto USD 1234\nGesamtbetrag 20,00 EUR').waehrung, 'EUR');
  assert.equal(pdfTextLesen('Konto USD EUR\nGesamtbetrag 20,00').waehrung, null);
  const s = summenJeAnbieter([
    { rolle: 'rechnung', anbieter: 'A', anbieterSchluessel: 'a', brutto: 20, waehrung: null },
    { rolle: 'rechnung', anbieter: 'A', anbieterSchluessel: 'a', brutto: 20, waehrung: 'USD' },
    { rolle: 'rechnung', anbieter: 'A', anbieterSchluessel: 'a', brutto: 5, waehrung: 'EUR' },
  ]);
  assert.deepEqual([s[0].summe, s[0].fremdwaehrung], [5, 2]);
});

test('Nummer: Monatsangabe im Betreff ersetzt die Rechnungsnummer nicht', () => {
  assert.equal(nummerAusBetreff('Ihre Rechnung 10/2026'), null);
  assert.equal(nummerAusBetreff('Rechnung 2026-10'), null);
  assert.equal(nummerAusBetreff('Ihre Rechnung 10/2026', 'Rechnung-R4711.pdf'), 'R4711');
  assert.equal(belegFelder({ text: 'Rechnung Nr. 4711 / Abrechnung 10/2026\nGesamtbetrag 5,00 EUR', betreff: 'Ihre Rechnung 10/2026' }).nummer, '4711');
});
