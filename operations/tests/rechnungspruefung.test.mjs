// Rechnungspruefer (Benutzer 24.11.2026, w-414). Belege, Nummern und Preise erfunden; der Aufbau der Zeilen
// folgt typischen Lieferanten-PDFs (Menge mit Einheit, verdrehte Spalten, Prozentzuschlag in eigener Zeile).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  zeileLesen, positionenAusText, positionenAusXml, abNummern, nummerImText, abFuerRechnung, vergleichen, pruefeRechnung,
  leseErgebnisse, ergebnissePfad, einstellungenPfad,
} from '../lib/rechnungspruefung.mjs';
import { rechnungenPruefen } from '../scripts/rechnungen-pruefen.mjs';
import { rechnungsStand, rechnungTodos, rechnungLadenZeilen, wochenZeile, rechnungMail, lieferantEntwurf } from '../../docs/ai-dashboard/lib/rechnungspruefung.mjs';
import { setzeTelefonisch } from '../lib/laden.mjs';

const AB = `Auftragsbestätigung Nr. 7700123
Pos  Artikel        Bezeichnung                Menge        Preis     Betrag
1    4000000000017  Testvelours Sand 400 cm    20,00 m²     10,00     200,00
     Rohstoffzuschlag   5,00 %                                           10,00
2    4000000000024  Testkleber 10 kg           2 Stk        15,50      31,00
     Fracht pauschal                                                     12,90
Summe Positionen netto                                                  253,90`;

const rechnung = ({ preis1 = '10,50', betrag1 = '210,00', menge1 = '20,00', extra = '', summe = '253,90' } = {}) => `Rechnung 5500999
Auftrag: 7 700 123 vom 01.11.2026
Pos  Artikel        Bezeichnung                Menge        Preis     Betrag
1    4000000000017  Testvelours Sand 400 cm    ${menge1} m²     ${preis1}     ${betrag1}
2    4000000000024  Testkleber 10 kg           2 Stk        15,50      31,00
     Fracht pauschal                                                     12,90
${extra}Summe Positionen                                                        ${summe}
Umsatzsteuer 19,00 % ${summe}`;

test('zeileLesen: Menge x Preis = Betrag, Einheit entscheidet bei Verwechslung, verdrehte Spalten', () => {
  assert.deepEqual(zeileLesen('1  4711  Testware  20,00 m²  10,00  200,00'), { menge: 20, preis: 10, betrag: 200 });
  // Preis vor Menge: "1,00 stk" ist die Menge, nicht der Preis.
  assert.deepEqual(zeileLesen('10  TEST-1  32,26  1,00  stk  47/2026  32,26  EUR'), { menge: 1, preis: 32.26, betrag: 32.26 });
  // Betrag zuerst, Menge ohne Einheit (zusammengeklebte Spalten im PDF-Text).
  assert.deepEqual(zeileLesen('1   94,00  EUR2   6600000000001 / 12345Stk47,00 EUR'), { menge: 2, preis: 47, betrag: 94 });
  // Gerundeter Einzelpreis: 127,55 x 6,95 = 886,47, gedruckt 886,45 - zaehlt noch.
  assert.equal(zeileLesen('127,55 m²  6,95  886,45').betrag, 886.45);
  assert.equal(zeileLesen('Umsatzsteuer 19,00 % 200,00 38,00'), null, 'Steuer ist keine Position');
  assert.deepEqual(zeileLesen('Rohstoffaufschlag 8,75 % 157,20 13,76'), { prozent: 8.75, basis: 157.2, betrag: 13.76 });
  assert.deepEqual(zeileLesen('Rohstoffzuschlag %  11,00 %  62,60'), { prozent: 11, betrag: 62.6, basisFehlt: true });
  assert.deepEqual(zeileLesen('GLS Frachtkosten standard  16,00  EUR'), { betrag: 16, fest: true });
  assert.equal(zeileLesen('Lieferung frei Haus ab Werk'), null);
});

test('positionenAusText: Rechenprobe gegen die gedruckte Summe, Prozentzuschlag in den Effektivpreis', () => {
  const ab = positionenAusText(AB);
  assert.equal(ab.probe, true);
  const ware = ab.positionen.filter(p => !p.art);
  assert.equal(ware.length, 2);
  assert.equal(ware[0].betrag, 210, 'Rohstoffzuschlag gehoert zur Position');
  assert.equal(ware[0].text, 'Testvelours Sand 400 cm', 'ohne Positions- und EAN-Nummer');
  assert.deepEqual(ab.positionen.filter(p => p.art).map(p => [p.art, p.betrag]), [['fracht', 12.9]]);
  // Eine Zeile unlesbar (Betrag fehlt): die Summe stimmt nicht mehr - nicht pruefbar statt halber Zahlen.
  const kaputt = positionenAusText(AB.replace('2 Stk        15,50      31,00', '2 Stk        15,50'));
  assert.equal(kaputt.probe, false);
  assert.match(kaputt.grund, /steht nicht auf dem Beleg/);
  assert.equal(positionenAusText('Sehr geehrte Damen und Herren').probe, false);
  // Ohne gedruckte Summe reicht der Bruttobetrag aus dem Archiv (19 %).
  const ohneSumme = positionenAusText('1 4711 Testware 2 Stk 50,00 100,00', { brutto: 119 });
  assert.equal(ohneSumme.probe, true);
});

const CII = (zeilen, summe) => `<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="x" xmlns:ram="y">
${zeilen.map(([id, name, menge, preis, betrag]) => `<ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedTradeProduct><ram:SellerAssignedID>${id}</ram:SellerAssignedID><ram:Name>${name}</ram:Name></ram:SpecifiedTradeProduct>
<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${preis}</ram:ChargeAmount><ram:BasisQuantity unitCode="MTK">1</ram:BasisQuantity></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="MTK">${menge}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
<ram:SpecifiedLineTradeSettlement><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${betrag}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`).join('\n')}
<ram:ApplicableHeaderTradeSettlement><ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${summe}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement>
<ram:IncludedNote><ram:Content>Auftrag: 7700123</ram:Content></ram:IncludedNote></rsm:CrossIndustryInvoice>`;

test('positionenAusXml: factur-x-Zeilen ohne KI, Rechenprobe gegen die Belegsumme', () => {
  const x = positionenAusXml(CII([['4000000000017', 'Testvelours Sand 400 cm', '20.00', '10.50', '210.00'], ['999', 'Lieferpauschale', '1', '12.90', '12.90']], '222.90'));
  assert.equal(x.probe, true);
  assert.deepEqual(x.positionen.map(p => [p.art, p.menge, p.betrag]), [[null, 20, 210], ['fracht', 1, 12.9]]);
  assert.equal(positionenAusXml(CII([['1', 'Ware', '2', '5', '10']], '99.00')).probe, false, 'Summe passt nicht');
  assert.equal(positionenAusXml('<Invoice/>'), null, 'UBL laeuft ueber den PDF-Text');
});

test('Zuordnung: nur ueber die Auftragsnummer des Lieferanten; juengste AB gilt; Nummer nur im Betreff zaehlt nicht', () => {
  assert.equal(nummerImText('7700123', 'Auftrag: 7 700 123/10'), true);
  assert.equal(nummerImText('100-1004712', 'zu 100 - 1004712 Pos.: 2'), true);
  assert.equal(nummerImText('6353278', 'Orderno: 06353278'), true, 'fuehrende Nullen');
  assert.equal(nummerImText('7700123', 'Kunde 77001234'), false, 'keine Teilnummer');
  assert.deepEqual(abNummern({ belegnummer: '7700123', anhaenge: ['AB 7700123.pdf'], texte: [AB] }), ['7700123']);
  // "Re: Auftragsbestaetigung 7700123" mit einem anderen PDF: die Nummer aus dem Betreff gehoert nicht dazu.
  assert.deepEqual(abNummern({ belegnummer: '7700123', anhaenge: ['8800999.PDF'], texte: ['Angebot 8800999\nSumme 10,00'] }), ['8800999']);
  const abs = [
    { id: 'alt', datum: '2026-11-01T08:00:00Z', nummern: ['7700123'] },
    { id: 'neu', datum: '2026-11-02T08:00:00Z', nummern: ['7700123'] },
    { id: 'fremd', datum: '2026-11-02T08:00:00Z', nummern: ['7700555'] },
  ];
  assert.deepEqual(abFuerRechnung('Auftrag 7700123', abs).map(a => a.id), ['neu'], 'geaenderte AB');
  assert.deepEqual(abFuerRechnung('Auftrag 7700123, Auftrag 7700555', abs).map(a => a.id).sort(), ['fremd', 'neu'], 'Sammelrechnung');
  assert.deepEqual(abFuerRechnung('Auftrag 1234567', abs), []);
});

const abListe = [{ id: 'ab1', datum: '2026-11-01T08:00:00Z', nummern: ['7700123'], texte: [AB] }];

test('pruefeRechnung: passt', () => {
  const e = pruefeRechnung({ text: rechnung() }, abListe);
  assert.equal(e.ergebnis, 'passt', e.grund);
  assert.deepEqual(e.abIds, ['ab1']);
  assert.equal(e.quelle, 'pdf-text');
  // Teillieferung (weniger Menge) ist keine Abweichung.
  assert.equal(pruefeRechnung({ text: rechnung({ menge1: '10,00', betrag1: '105,00', summe: '148,90' }) }, abListe).ergebnis, 'passt');
});

test('pruefeRechnung: Abweichung mit Position, AB-Wert, Rechnungswert und Differenz in Euro', () => {
  const preis = pruefeRechnung({ text: rechnung({ preis1: '11,00', betrag1: '220,00', summe: '263,90' }) }, abListe);
  assert.equal(preis.ergebnis, 'abweichung');
  assert.deepEqual(preis.abweichungen, [{ position: 'Testvelours Sand 400 cm', art: 'preis', ab: 10.5, rechnung: 11, differenz: 10, menge: 20 }]);
  const menge = pruefeRechnung({ text: rechnung({ menge1: '22,00', betrag1: '231,00', summe: '274,90' }) }, abListe);
  assert.deepEqual(menge.abweichungen.map(a => [a.art, a.ab, a.rechnung, a.differenz]), [['menge', 20, 22, 21]]);
  // Zuschlag, den die AB nicht kennt; Fracht kennt sie und bleibt still.
  const zuschlag = pruefeRechnung({ text: rechnung({ extra: '     Mindermengenzuschlag                                                18,00\n', summe: '271,90' }) }, abListe);
  assert.deepEqual(zuschlag.abweichungen.map(a => [a.art, a.ab, a.rechnung, a.differenz]), [['zuschlag', null, 18, 18]]);
  // factur-x: gleiche Pruefung, Quelle xml.
  const xml = pruefeRechnung({ xml: CII([['4000000000017', 'Testvelours Sand 400 cm', '20.00', '11.00', '220.00']], '220.00') }, abListe);
  assert.equal(xml.ergebnis, 'abweichung');
  assert.equal(xml.quelle, 'xml');
  assert.equal(xml.abweichungen[0].differenz, 10);
});

test('pruefeRechnung: nicht pruefbar - keine AB, Rechnung nicht lesbar, Position in keiner AB', () => {
  assert.deepEqual(pruefeRechnung({ text: rechnung().replace('7 700 123', '9 999 999') }, abListe).grund, 'keine AB gefunden');
  const unlesbar = pruefeRechnung({ text: rechnung({ summe: '999,99' }) }, abListe);
  assert.equal(unlesbar.ergebnis, 'nicht_pruefbar');
  assert.match(unlesbar.grund, /Rechnung nicht sicher lesbar/);
  const fremd = pruefeRechnung({ text: rechnung({ extra: '3    4000000000099  Fremdware Grau            1 Stk       40,00      40,00\n', summe: '293,90' }) }, abListe);
  assert.equal(fremd.ergebnis, 'nicht_pruefbar');
  assert.match(fremd.grund, /in keiner gefundenen AB/);
  assert.match(pruefeRechnung({ text: rechnung() }, [{ ...abListe[0], texte: ['Bitte beachten Sie unsere AGB'] }]).grund, /AB nicht sicher lesbar/);
});

test('vergleichen: fehlt ein Rabatt der AB auf der Rechnung, ist das eine Abweichung', () => {
  const ab = [{ art: null, menge: 10, betrag: 100, text: 'Ware', kennungen: { zeile: ['4711'], danach: [], davor: [] } }, { art: 'rabatt', prozent: 5, betrag: -5, text: 'Rabatt 5 %' }];
  const r = [{ art: null, menge: 10, betrag: 100, text: 'Ware', kennungen: { zeile: ['4711'], danach: [], davor: [] } }];
  assert.deepEqual(vergleichen(r, ab).abweichungen, [{ position: 'Rabatt 5 %', art: 'rabatt', ab: 5, rechnung: null, differenz: 5 }]);
});

const ERG = {
  laeufe: [{ am: '2026-11-20T09:00:00Z' }],
  rechnungen: {
    a: { schluessel: 'aaaa', anbieter: 'Lieferant X', nummer: 'R-1', eingang: '2026-11-19T08:00:00Z', ergebnis: 'abweichung', brutto: 300, abweichungen: [{ position: 'Testvelours', art: 'preis', ab: 10.5, rechnung: 11, differenz: 10 }] },
    b: { schluessel: 'bbbb', anbieter: 'Lieferant X', nummer: 'R-2', eingang: '2026-11-19T08:00:00Z', ergebnis: 'passt', abweichungen: [] },
    c: { schluessel: 'cccc', anbieter: 'Lieferant Y', nummer: 'R-3', eingang: '2026-11-18T08:00:00Z', ergebnis: 'nicht_pruefbar', grund: 'keine AB gefunden', abweichungen: [] },
    d: { schluessel: 'dddd', anbieter: 'Lieferant Y', nummer: 'R-0', eingang: '2026-10-01T08:00:00Z', ergebnis: 'nicht_pruefbar', grund: 'alt', abweichungen: [] },
  },
};
const jetzt = new Date('2026-11-21T10:00:00Z');

test('Control Center: Wochenzeile, rote Zeilen ohne Einkaufspreise, Entwurf nur mit Betraegen', () => {
  const s = rechnungsStand(ERG, { jetzt });
  assert.deepEqual(s.woche, { geprueft: 3, passt: 1, offen: 2 });
  assert.equal(s.abweichungen[0].abweichungen[0].ab, undefined, 'ohne Betraege');
  assert.equal(s.abweichungen[0].brutto, undefined);
  assert.equal(s.abweichungen[0].entwurf, undefined);
  assert.deepEqual(s.nichtPruefbar.map(e => e.schluessel), ['cccc'], 'aeltere als 14 Tage stehen nicht mehr da');
  assert.equal(wochenZeile(s, { jetzt }).text, 'Rechnungsprüfung, letzte 7 Tage: 3 geprüft · 1 passt · 2 offen');
  const gesehen = rechnungsStand(ERG, { jetzt, gesehen: { 'rechnung:aaaa': {} } });
  assert.equal(gesehen.abweichungen.length, 0, '"Erledigt" im Laden nimmt sie heraus');
  const laden = rechnungLadenZeilen(s, { jetzt });
  assert.equal(laden[0].schluessel, 'rechnung:aaaa');
  assert.equal(laden[0].rot, true);
  assert.equal(laden[0].ton, 'crit', 'Plakette nach Frist einer Laden-Aufgabe: nach 2 Tagen rot');
  assert.equal(rechnungLadenZeilen(s, { jetzt: new Date('2026-11-19T12:00:00Z') })[0].ton, '', 'frisch: Zeile rot, Plakette noch nicht');
  assert.doesNotMatch(laden[0].hinweis, /€/);
  const todos = rechnungTodos(s, { jetzt });
  assert.deepEqual(todos.map(t => [t.id, t.ton]), [['rechnung-aaaa', 'crit'], ['rechnungen-nicht-pruefbar', '']]);
  assert.equal(todos[0].knopf.href, '#/laden');
  const inhaber = rechnungTodos(rechnungsStand(ERG, { jetzt, mitBetraegen: true }), { jetzt });
  assert.equal(inhaber[0].knopf.vertreter, 'rechnung-aaaa');
  assert.match(inhaber[0].kontext, /10,00 € mehr/);
  assert.match(lieferantEntwurf(ERG.rechnungen.a).text, /Gutschrift über 10,00 € netto/);
  assert.doesNotMatch(rechnungMail(ERG.rechnungen.a).text, /€/, 'Mail an verkauf@ ohne Einkaufspreise');
  // Lebenszeichen: bleibt der Lauf aus, steht es auf Heute.
  const spaet = new Date('2026-12-05T10:00:00Z');
  assert.ok(rechnungTodos(rechnungsStand(ERG, { jetzt: spaet }), { jetzt: spaet }).some(t => t.id === 'rechnungen-lauf'));
  assert.match(wochenZeile({ letzterLauf: null }).text, /noch kein Lauf/);
  assert.deepEqual(rechnungTodos(null), []);
});

test('Laden-Ablage nimmt "rechnung:" an', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-laden-'));
  setzeTelefonisch(path.join(dir, 't.json'), { schluessel: 'rechnung:aaaa1111', jetzt });
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 't.json'), 'utf8'))['rechnung:aaaa1111']);
});

test('rechnungenPruefen: Warenrechnung aus dem Archiv, AB aus der Lieferbeleg-Ablage, Mail nur mit Schalter', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-lauf-'));
  const ordner = path.join(dir, 'belege-archiv', '2026', '11');
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'r1.pdf'), 'r1');
  fs.writeFileSync(path.join(ordner, 'r2.pdf'), 'r2');
  const beleg = (datei, sha, anbieterSchluessel) => ({ datei, sha256: sha.repeat(16), rolle: 'rechnung', art: 'rechnung', format: 'pdf', anbieter: 'Lieferant X', anbieterSchluessel, datum: '2026-11-19T08:00:00Z', rechnungsnummer: 'R-1', brutto: null, mailId: 'm1' });
  fs.writeFileSync(path.join(ordner, 'manifest.json'), JSON.stringify({ belege: [beleg('r1.pdf', 'a', 'lieferant-x.example'), beleg('r2.pdf', 'b', 'strom.example')] }));
  fs.mkdirSync(path.join(dir, 'lieferbelege'));
  fs.writeFileSync(path.join(dir, 'lieferbelege', 'belege.json'), JSON.stringify({ version: 1, belege: {
    ab1: { id: 'ab1', art: 'ab', domain: 'lieferant-x.example', von: 'ab@lieferant-x.example', datum: '2026-11-01T08:00:00Z', refs: { belegnummer: '7700123' }, anhaenge: ['7700123.pdf'] },
  }, absender: {}, geprueft: {}, laeufe: [] }));
  const texte = async offen => Object.fromEntries(offen.map(o => [o.id, [AB]]));
  const analyse = inhalt => ({ text: String(inhalt) === 'r1' ? rechnung({ preis1: '11,00', betrag1: '220,00', summe: '263,90' }) : 'Stromrechnung' });
  const gesendet = [];
  const senden = async (zugang, mail) => gesendet.push(mail);

  const probe = await rechnungenPruefen({ privatDir: dir, monat: '2026-11', jetzt, analyse, texte, senden });
  assert.deepEqual([probe.geprueft, probe.abweichung], [1, 1], 'nur die Warenrechnung');
  assert.equal(fs.existsSync(ergebnissePfad(dir)), false, 'Probelauf schreibt nichts');

  await rechnungenPruefen({ privatDir: dir, monat: '2026-11', schreiben: true, jetzt, analyse, texte, senden });
  const e = Object.values(leseErgebnisse(ergebnissePfad(dir)).rechnungen);
  assert.deepEqual(e.map(x => [x.ergebnis, x.abweichungen[0].differenz, x.gemeldetAm]), [['abweichung', 10, null]]);
  assert.equal(gesendet.length, 0, 'Schalter aus: keine Mail');
  const nochmal = await rechnungenPruefen({ privatDir: dir, monat: '2026-11', schreiben: true, jetzt, analyse, texte, senden });
  assert.equal(nochmal.geprueft, 0, 'schon gepruefte Rechnungen bleiben');

  // Schalter an (erst nach Ja des Benutzers): genau eine Mail an verkauf@, ohne Einkaufspreise.
  fs.rmSync(ergebnissePfad(dir));
  fs.writeFileSync(einstellungenPfad(dir), JSON.stringify({ mailAnVerkauf: true, verkaufAn: 'verkauf@example.test' }));
  fs.mkdirSync(path.join(dir, 'nachfassen'));
  fs.writeFileSync(path.join(dir, 'nachfassen', 'postfach.json'), JSON.stringify({ host: 'smtp.example.test', port: 465, benutzer: 'x', passwort: 'test', absender: 'laden@example.test' }), { mode: 0o600 });
  const mitMail = await rechnungenPruefen({ privatDir: dir, monat: '2026-11', schreiben: true, jetzt, analyse, texte, senden });
  assert.equal(mitMail.gemeldet, 1);
  assert.deepEqual(gesendet[0].an, ['verkauf@example.test']);
  assert.doesNotMatch(gesendet[0].text, /€/);
  assert.ok(Object.values(leseErgebnisse(ergebnissePfad(dir)).rechnungen)[0].gemeldetAm, 'nur einmal je Rechnung');
});
