import test from 'node:test';
import assert from 'node:assert/strict';
import { bestellWarnung, fertigpreis } from '../lib/bestellwarnung.mjs';
import {
  ZIEL_ROHERTRAG, kaufArt, erloes, kostenAusBeleg, gewinnJeKauf, monatsKopf, preisIndex,
  preisKontrolleKaeufe, ekJeVerkaufseinheit, preisKontrolleSortiment, fuerRolle, darfOnlineshop, mindestBrutto, KANTE_REFERENZ,
} from '../lib/onlineshop-gewinn.mjs';

// Nur erfundene Werte: Artikel, Preise, Kostensaetze und Bestellnummern gibt es nicht.
const EK = zeilen => ({ verfuegbar: true, stand: '2099-01-01', zeilen: new Map(zeilen.map(z => [z.artikelnummer, [z]])), handles: new Map() });
const eZeile = (artikelnummer, ek, extra = {}) => ({ artikelnummer, handle: 'test', bezug: 'm²', vk_einheit: 'm²', ek_bezug: ek, ek_vk_einheit: ek, sicherheit: 'belegt', variante: 'Test', ...extra });
const KOSTEN = { lieferanten: { A: { paket: 5, paketBisCm: 200, paketBisKg: 30, fracht: 20, mindermenge: 10, mindermengeUnterEk: 100, ekAufschlag: 0, anKundenNurImLiefergebiet: false } }, kettler: null };
const pos = (id, extra = {}) => ({ lineItemId: id, orderId: 'o1', titel: 'Testboden', handle: 'test', farbe: 'Test', lieferant: 'A', istMuster: false, eigenleistung: false,
  grosshaendlerId: 'ART-1', sku: 'ART-1', mengeBestellt: 10, nettoGesamt: 100, masspruefung: { einheit: 'm²' }, ausfuehrung: [], bestellmenge: { menge: 2.5, einheit: 'lfm' }, ...extra });
const auftrag = (positionen, extra = {}) => ({ id: 'o1', name: '#T1', datum: '2099-03-05T10:00:00Z', positionen, details: { lieferadresse: { plz: '50000', land: 'Deutschland' }, summen: { versand: { betrag: 0 } } }, ...extra });
const geldSet = x => ({ shopMoney: { amount: String(x) } });
const roh = ({ brutto = 119, steuer = 19, original = brutto, status = 'PAID', zeilen = [{ id: 'l1', quantity: 10 }], ...rest } = {}) => ({
  id: 'o1', displayFinancialStatus: status, totalPriceSet: geldSet(original), currentTotalPriceSet: geldSet(brutto), currentTotalTaxSet: geldSet(steuer), lineItems: { nodes: zeilen }, ...rest,
});
const warnungMit = ek => a => bestellWarnung({ auftrag: a, kosten: KOSTEN, ek, tarif: null, statusAlle: {}, absender: null, nahPlz: /^1/, jetzt: new Date('2099-03-06T10:00:00Z'), immer: true });
const TARIF = { prozentBrutto: 2.5, fix: 0.35 };

test('Welche Bestellungen zaehlen: nur bezahlte Warenkaeufe', () => {
  const ware = auftrag([pos('l1')]);
  assert.equal(kaufArt(ware, roh()), 'ware');
  assert.equal(kaufArt(auftrag([pos('l1', { istMuster: true })]), roh()), 'muster', 'Gratismuster sind kein Warenkauf');
  assert.equal(kaufArt({ ...ware, testbestellung: true }, roh()), 'test');
  assert.equal(kaufArt(ware, roh({ cancelledAt: '2099-01-01' })), 'storniert');
  assert.equal(kaufArt(ware, roh({ status: 'REFUNDED', brutto: 0, original: 119 })), 'erstattet');
  assert.equal(kaufArt(ware, roh({ status: 'PENDING' })), 'unbezahlt');
  assert.equal(kaufArt(ware, null), 'fehlt');
});

test('Erloes: nach Erstattung, ohne Steuer in Shopify trotzdem netto', () => {
  assert.deepEqual(erloes(roh()), { brutto: 119, netto: 100, erstattetBrutto: 0, hinweise: [] });
  const teil = erloes(roh({ brutto: 119, steuer: 19, original: 238 }));
  assert.equal(teil.netto, 100);
  assert.equal(teil.erstattetBrutto, 119);
  assert.match(teil.hinweise[0], /Erstattung/);
  const ohneSteuer = erloes(roh({ brutto: 119, steuer: 0 }));
  assert.equal(ohneSteuer.netto, 100);
  assert.match(ohneSteuer.hinweise[0], /ohne Umsatzsteuer/);
});

test('Geschaetzt: EK-Liste, Lieferkosten und Gebuehr nach Tarif ergeben den Rohertrag', () => {
  const z = gewinnJeKauf({ auftrag: auftrag([pos('l1')]), roh: roh(), warnungFuer: warnungMit(EK([eZeile('ART-1', 3)])), gebuehrTarif: TARIF });
  // 100 netto - 30 Einkauf - 20 Fracht - 10 Mindermenge - (119 x 2,5 % + 0,35 = 3,33) Gebuehr
  assert.equal(z.guete, 'geschaetzt');
  assert.deepEqual([z.ware, z.zuschlag, z.weg, z.gebuehr, z.rohertrag], [30, 30, 0, 3.33, 36.67]);
  assert.ok(z.hinweise.some(h => /Annahme: Lieferweg nicht vermerkt/.test(h)), 'der uebliche Weg ist als Annahme genannt');
  assert.equal(z.gebuehrGuete, 'geschaetzt');
});

test('Erstattung senkt den Erloes und damit den Rohertrag', () => {
  const voll = gewinnJeKauf({ auftrag: auftrag([pos('l1')]), roh: roh(), warnungFuer: warnungMit(EK([eZeile('ART-1', 3)])), gebuehr: 3 });
  const teil = gewinnJeKauf({ auftrag: auftrag([pos('l1')]), roh: roh({ brutto: 59.5, steuer: 9.5, original: 119 }), warnungFuer: warnungMit(EK([eZeile('ART-1', 3)])), gebuehr: 3 });
  assert.equal(voll.rohertrag - teil.rohertrag, 50);
  assert.ok(teil.hinweise.some(h => /Erstattung/.test(h)));
});

test('Fehlender Einkauf: unbekannt mit Grund, keine einzige Kostenzahl', () => {
  const z = gewinnJeKauf({ auftrag: auftrag([pos('l1')]), roh: roh(), warnungFuer: warnungMit(EK([])), gebuehrTarif: TARIF });
  assert.equal(z.guete, 'unbekannt');
  assert.deepEqual([z.ware, z.weg, z.gebuehr, z.rohertrag, z.quote], [null, null, null, null, null]);
  assert.match(z.gruende[0], /Einkaufspreis fehlt: Testboden/);
});

test('Ohne Gebuehrentarif und ohne belegte Gebuehr: unbekannt', () => {
  const z = gewinnJeKauf({ auftrag: auftrag([pos('l1')]), roh: roh(), warnungFuer: warnungMit(EK([eZeile('ART-1', 3)])) });
  assert.equal(z.rohertrag, null);
  assert.ok(z.gruende.includes('Zahlungsgebühr: Tarif fehlt'));
});

test('Belegt: Kosten aus Rechnung, Verschnitt getrennt, Gebuehr belegt', () => {
  const beleg = { klasse: 'R', qm_verkauft: 2, qm_berechnet: 4, kosten: [
    { art: 'ware', betrag: 40, klasse: 'R' }, { art: 'zuschlag', betrag: 12, klasse: 'R' }, { art: 'kettel', kettler_m: 6, klasse: 'A' }, { art: 'versand', betrag: 7, klasse: 'G' },
  ] };
  const k = kostenAusBeleg(beleg, { kettler_bis6qm: 2 });
  assert.deepEqual([k.ware, k.verschnitt, k.kettel, k.zuschlag, k.weg, k.guete], [40, 20, 12, 12, 7, 'belegt']);
  assert.ok(k.hinweise.some(h => /Nicht belegt: Ketteln aus einem Beleg abgeleitet, Versand geschätzt/.test(h)));
  const z = gewinnJeKauf({ auftrag: auftrag([pos('l1')]), roh: roh(), warnungFuer: warnungMit(EK([])), beleg, belegTarife: { kettler_bis6qm: 2 }, gebuehr: 3 });
  assert.equal(z.guete, 'belegt');
  assert.equal(z.rohertrag, 100 - 40 - 12 - 12 - 7 - 3);
  assert.equal(z.positionen[0].ekBeleg, 20, 'fuer die Preisfrage zaehlt der Einkauf ohne Verschnitt');
  assert.equal(kostenAusBeleg({ ...beleg, kosten: [{ art: 'ware', betrag: 40, klasse: 'U' }] }), null, 'unbekannter Einkauf ist kein Beleg');
  assert.equal(kostenAusBeleg({ ...beleg, klasse: 'A' }, { kettler_bis6qm: 2 }).guete, 'geschaetzt');
  assert.equal(kostenAusBeleg(beleg, {}), null, 'Kettelpreis fehlt: keine Zahl');
});

test('Kopf je Monat: Rohertrag nur ueber rechenbare Kaeufe, Abdeckung und Verlustfaelle', () => {
  const k = monatsKopf([
    { monat: '2099-03', netto: 100, rohertrag: 30, guete: 'belegt' },
    { monat: '2099-03', netto: 50, rohertrag: -5, guete: 'geschaetzt' },
    { monat: '2099-03', netto: 50, rohertrag: null, guete: 'unbekannt' },
    { monat: '2099-02', netto: 10, rohertrag: null, guete: 'unbekannt' },
  ]);
  assert.deepEqual(k.map(m => m.monat), ['2099-03', '2099-02']);
  assert.deepEqual([k[0].kaeufe, k[0].rechenbar, k[0].umsatzNetto, k[0].umsatzRechenbar, k[0].anteilRechenbar, k[0].rohertrag, k[0].verlust], [3, 2, 200, 150, 0.75, 25, 1]);
  assert.equal(k[1].rohertrag, null, 'ohne rechenbaren Kauf keine Summe');
});

const produkt = (handle, varianten, extra = {}) => ({ handle, titel: `Produkt ${handle}`, status: 'ACTIVE', produktgruppe: 'Test', varianten, ...extra });
const variante = (titel, preis, einheit, betrag = preis, extra = {}) => ({ titel, sku: null, preis, preisJeEinheit: { einheit, betrag }, einkauf: { lieferant: 'A' }, ...extra });

test('Preiskontrolle aus Kaeufen: Preisfall mit noetigem Preis, Kontrolle gegen den heutigen Preis', () => {
  // Verkauft 10 m² fuer 50 netto, Einkauf 4/m² - unter Ziel. Noetig: 4 / 0,7 = 5,714 netto = 6,80 brutto je m².
  const zeile = gewinnJeKauf({ auftrag: auftrag([pos('l1', { nettoGesamt: 50 })]), roh: roh({ brutto: 59.5, steuer: 9.5 }), warnungFuer: warnungMit(EK([eZeile('ART-1', 4)])), gebuehr: 1 });
  assert.ok(zeile.quote < ZIEL_ROHERTRAG);
  const heuteZuNiedrig = preisIndex([produkt('test', [variante('Test', 5.95, 'm2', 5.95, { sku: 'ART-1' })])]);
  const a = preisKontrolleKaeufe([zeile], { preise: heuteZuNiedrig });
  assert.equal(a.preisFaelle.length, 1);
  assert.deepEqual([a.preisFaelle[0].noetigBrutto, a.preisFaelle[0].verkauftBrutto, a.preisFaelle[0].stand, a.preisFaelle[0].einheit], [6.8, 5.95, 'offen', 'je m²']);
  assert.equal(a.kaufFaelle[0].ursache, 'preis');
  const heuteReicht = preisIndex([produkt('test', [variante('Test', 6.9, 'm2', 6.9, { sku: 'ART-1' })])]);
  const b = preisKontrolleKaeufe([zeile], { preise: heuteReicht });
  assert.equal(b.preisFaelle[0].stand, 'angehoben', 'inzwischen angehoben');
  assert.deepEqual([a.kaufFaelle[0].stand, b.kaufFaelle[0].stand], ['offen', 'angehoben'], 'auch der Kauf selbst gilt dann nicht mehr als offen');
  assert.equal(preisKontrolleKaeufe([zeile], { preise: preisIndex([]) }).kaufFaelle[0].stand, 'offen', 'ohne heutigen Preis bleibt er offen');
});

test('Kauf unter Ziel: reicht die Ware, sind Zuschlaege die groesste Ursache; Mindestbetrag mit Gebuehr', () => {
  // Einkauf 3/m² bei 6 netto: Ware 50 %. Erst 30 Lieferkosten druecken den Kauf unter das Ziel.
  const zeile = gewinnJeKauf({ auftrag: auftrag([pos('l1', { nettoGesamt: 60 })]), roh: roh({ brutto: 71.4, steuer: 11.4 }), warnungFuer: warnungMit(EK([eZeile('ART-1', 3)])), gebuehr: 1 });
  const a = preisKontrolleKaeufe([zeile], { preise: preisIndex([]), gebuehrTarif: TARIF });
  assert.equal(a.preisFaelle.length, 0);
  const f = a.kaufFaelle[0];
  assert.deepEqual([f.ursache, f.groesste, f.groessteBetrag], ['kosten', 'zuschlag', 30]);
  assert.match(f.hinweis, /Mindermengen/);
  // 60 Kosten ohne Gebuehr: B/1,19 x 0,7 - B x 2,5 % - 0,35 >= 60  ->  B >= 60,35 / 0,5632 = 107,15
  assert.equal(f.mindestBrutto, mindestBrutto(60, { prozent: 0.025, fix: 0.35 }));
  assert.equal(f.mindestBrutto, 107.15);
  assert.equal(f.mehrBrutto, 35.75);
});

test('Kante gehoert zu den Herstellkosten: reichen Ware und Kante nicht, ist es ein Preisfall', () => {
  const z = { name: '#T5', datum: '2099-03-05', guete: 'belegt', netto: 100, brutto: 119, ware: 55, verschnitt: 0, kettel: 20, zuschlag: 0, weg: 5, gebuehr: 3, rohertrag: 17, quote: 0.17,
    positionen: [{ titel: 'Testteppich', variante: 'Grau', handle: 'tt', einheit: '× 0,01 m²', menge: 400, netto: 100, ek: 55, ekZeile: null }] };
  const a = preisKontrolleKaeufe([z], { preise: preisIndex([produkt('tt', [variante('Grau', 0.3, 'm2', 30)])]) });
  assert.deepEqual([a.kaufFaelle[0].ursache, a.kaufFaelle[0].groesste], ['preis', 'ware']);
  // Ware 55 + Kante 20 auf 4 m²: 18,75 netto/m² -> noetig 18,75 / 0,7 x 1,19 = 31,88 brutto je m²
  assert.deepEqual([a.preisFaelle[0].noetigBrutto, a.preisFaelle[0].mitKante, a.preisFaelle[0].stand], [31.88, true, 'offen']);
  // Hat der Kunde die Kante als Kettelservice extra bezahlt, zaehlt dieser Erloes zur Ware: kein Preisfall.
  const mitService = preisKontrolleKaeufe([{ ...z, nettoNebenleistung: 40 }], { preise: preisIndex([]) });
  assert.equal(mitService.preisFaelle.length, 0);
});

test('Fertiger Teppich: Kante im Preis, ohne Vermerk direkt vom Hersteller, Mindestflaeche, nie zusaetzlich unser Kettler', () => {
  const rug = eZeile('RUG-1', 30, { produktart: 'Teppich nach Maß', vk_einheit: '0,01 m² (Konfigurator)', menge_bezug: 0.01, ek_vk_einheit: 0.3,
    quelle: 'Herstellerliste netto, Spalte rug_kettelung', bemerkung: 'Rugs: unter 3 m² werden 3 m² berechnet; Direktlieferung 40 € je Auftrag' });
  assert.deepEqual(fertigpreis(rug), { minM2: 3 });
  assert.equal(fertigpreis({ ...rug, bemerkung: 'nur Material (Rolle); Kettel-/Einfasskosten und Verschnitt fehlen', quelle: 'UVP x Faktor' }), null);
  assert.deepEqual(fertigpreis({ ...rug, quelle: 'Teppiche PL 2099, UVP netto x Faktor', bemerkung: '' }), { minM2: null });
  assert.equal(fertigpreis({ ...rug, produktart: 'Teppichboden', quelle: 'Teppiche PL 2099', bemerkung: '' }), null, 'Rollenware aus derselben Liste ist kein Fertigpreis');
  const kosten = { lieferanten: { E: { paket: null, paketBisCm: null, paketBisKg: null, fracht: 40, mindermenge: null, mindermengeUnterEk: null, ekAufschlag: 0, anKundenNurImLiefergebiet: false } }, kettler: { bis6qmJeLfm: 4, ab6qmJeLfm: 5 } };
  const teppich = pos('t1', { lieferant: 'E', grosshaendlerId: 'RUG-1', sku: 'RUG-1', mengeBestellt: 200, nettoGesamt: 300, masspruefung: { einheit: '× 0,01 m²' },
    ausfuehrung: ['Fertigmaß: 100 × 200 cm (Rechteck)', 'Einfassung: Gekettelt, umlaufend 6,00 m, Garn Ton in Ton'] });
  const basis = { auftrag: auftrag([teppich]), kosten, ek: EK([rug]), tarif: null, absender: { kettelservice: { plz: '10000' } }, nahPlz: /^1/, jetzt: new Date('2099-03-06T10:00:00Z'), immer: true };
  const w = bestellWarnung({ ...basis, statusAlle: {} });
  // 2 m² verkauft, 3 m² berechnet: 90 Einkauf + 40 Lieferpauschale, kein Ketteln, keine offene Frage
  assert.deepEqual(w.details.offen, []);
  assert.equal(w.details.ekSumme, 90);
  assert.deepEqual(w.details.posten.map(x => [x.art, x.betrag]), [['weg', 40]]);
  assert.equal(w.details.positionen[0].ziel, 'kunde');
  assert.equal(w.rohertrag, 300 - 90 - 40);
  // Ueber unseren Kettler vermerkt: der Fertigpreis ist nicht der Materialeinkauf - keine Zahl.
  const vermerkt = bestellWarnung({ ...basis, statusAlle: { 'o1::t1': { ueber: 'kettler', status: 'bestellt', bestelltAm: '2099-03-01' } } });
  assert.equal(vermerkt.rohertrag, null);
  assert.ok(vermerkt.details.offen.some(g => /fertigen Teppichs/.test(g)));
  const zeile = gewinnJeKauf({ auftrag: auftrag([teppich]), roh: roh({ brutto: 357, steuer: 57, zeilen: [{ id: 't1', quantity: 200 }] }), warnungFuer: () => w, gebuehr: 5 });
  assert.ok(zeile.hinweise.some(h => /Annahme: Fertiger Teppich direkt vom Hersteller, Kante im Einkaufspreis, berechnet mindestens 3 m²/.test(h)));
});

test('Fertiger Teppich mit hinterlegtem Kettelpreis des Lieferanten: Kante nicht doppelt', () => {
  const rug = eZeile('RUG-2', 30, { produktart: 'Teppich nach Maß', vk_einheit: '0,01 m² (Konfigurator)', menge_bezug: 0.01, ek_vk_einheit: 0.3, quelle: 'Herstellerliste netto, Spalte rug_kettelung' });
  const kosten = { lieferanten: { E: { paket: null, paketBisCm: null, paketBisKg: null, fracht: 40, mindermenge: null, mindermengeUnterEk: null, ekAufschlag: 0, anKundenNurImLiefergebiet: false, kettelnJeLfm: 4 } }, kettler: null };
  const teppich = pos('t1', { lieferant: 'E', grosshaendlerId: 'RUG-2', sku: 'RUG-2', mengeBestellt: 200, nettoGesamt: 300, masspruefung: { einheit: '× 0,01 m²' },
    ausfuehrung: ['Fertigmaß: 100 × 200 cm (Rechteck)', 'Einfassung: Gekettelt, umlaufend 6,00 m, Garn Ton in Ton'] });
  const w = bestellWarnung({ auftrag: auftrag([teppich]), kosten, ek: EK([rug]), tarif: null, statusAlle: {}, absender: null, nahPlz: /^1/, jetzt: new Date('2099-03-06T10:00:00Z'), immer: true });
  assert.deepEqual(w.details.posten.map(x => [x.art, x.betrag]), [['weg', 40]]);
});

test('Preisfall mit zwei Kaeufen derselben Variante: der offene bleibt offen, in jeder Reihenfolge', () => {
  const kauf = (name, netto, ek, neben) => ({ name, datum: '2099-03-05', guete: 'belegt', netto: netto + neben, brutto: (netto + neben) * 1.19, ware: ek, verschnitt: 0, kettel: 10, zuschlag: 0, weg: 0, gebuehr: 1, rohertrag: 0, quote: 0, nettoNebenleistung: neben,
    positionen: [{ titel: 'Testteppich', variante: 'Grau', handle: 'tt', einheit: '× 0,01 m²', menge: 100, netto, ek, ekBeleg: ek, ekZeile: null }] });
  const preise = preisIndex([produkt('tt', [variante('Grau', 1.19, 'm2', 119)])]);
  const offen = kauf('#T7', 100, 100, 0);
  // Unter Ziel verkauft, heute aber gedeckt (mit seinem groesseren Kettelservice).
  const gedeckt = kauf('#T8', 80, 90, 50);
  assert.equal(preisKontrolleKaeufe([gedeckt], { preise }).preisFaelle[0].stand, 'angehoben');
  for (const reihe of [[offen, gedeckt], [gedeckt, offen]]) {
    const [f] = preisKontrolleKaeufe(reihe, { preise }).preisFaelle;
    assert.equal(f.stand, 'offen');
    assert.ok(f.noetigBrutto > f.heuteBrutto);
    assert.deepEqual(f.kaeufe.slice().sort(), ['#T7', '#T8']);
  }
});

test('Kauf unter Ziel nur wegen der Gebuehr: Ursache ist die Gebuehr, nicht ein Verschnitt von 0', () => {
  const z = { name: '#T9', datum: '2099-03-05', guete: 'belegt', netto: 100, brutto: 119, ware: 70, verschnitt: 0, kettel: 0, zuschlag: 0, weg: 0, gebuehr: 3, rohertrag: 27, quote: 0.27, positionen: [] };
  const [f] = preisKontrolleKaeufe([z], { preise: preisIndex([]) }).kaufFaelle;
  assert.deepEqual([f.ursache, f.groesste, f.groessteBetrag], ['kosten', 'gebuehr', 3]);
  assert.match(f.hinweis, /Zahlungsgebühr/);
});

test('Teppich nach Mass in 0,01 m²: je m² gezeigt, nicht je Einheit', () => {
  const z = eZeile('TNM-1', 20, { vk_einheit: '0,01 m² (Konfigurator)', menge_bezug: 0.01, ek_vk_einheit: 0.2, vk_brutto: 0.39 });
  const e = ekJeVerkaufseinheit(z, variante('Taupe', 0.39, 'm2', 39));
  assert.deepEqual([e.ek, e.faktor, e.text], [0.2, 100, 'je m²']);
  // Grundpreis passt nicht zum Konfigurator (39 statt 0,39 je Einheit): nicht vergleichbar.
  assert.ok(ekJeVerkaufseinheit(z, variante('Taupe', 39, 'm2', 39)).grund);
});

test('Einheiten: Paket, Stueck und Widersprueche', () => {
  const paket = eZeile('P-1', 20, { vk_einheit: 'Paket', menge_bezug: 2.5, ek_vk_einheit: 50 });
  assert.equal(ekJeVerkaufseinheit(paket, variante('Grau', 100, 'm2', 40)).ek, 50);
  assert.match(ekJeVerkaufseinheit(paket, variante('Grau', 100, 'm2', 100)).grund, /Shop verkauft nach m²/);
  const stueck = eZeile('S-1', 30, { bezug: 'Stück', vk_einheit: 'Stück' });
  assert.equal(ekJeVerkaufseinheit(stueck, variante('80 × 150', 99, 'stueck')).ek, 30);
  // EK je m², Shop je Stueck (z. B. Wunschmass ohne Grundpreis): nie raten.
  assert.match(ekJeVerkaufseinheit(eZeile('M-1', 30), variante('Wunschmaß', 65, 'stueck')).grund, /je Stück/);
  assert.match(ekJeVerkaufseinheit(eZeile('L-1', 3, { bezug: 'lfm', vk_einheit: 'lfm' }), variante('1 lfm', 9, 'stueck')).grund, /Einheit lfm/);
  assert.match(ekJeVerkaufseinheit(eZeile('X-1', 3, { vk_brutto: 10 }), variante('Test', 25, 'm2')).grund, /verdoppelt/);
});

test('Sortiment: Verlust zuerst, dann verkauft; Zaehler fuer geprueft, ohne EK, nicht vergleichbar', () => {
  const ek = [
    eZeile('A1', 10, { handle: 'verlust', variante: 'Rot' }),
    eZeile('B1', 7.5, { handle: 'knapp', variante: 'Blau' }),
    eZeile('C1', 7.5, { handle: 'verkauft', variante: 'Grün' }),
    eZeile('D1', 2, { handle: 'gut', variante: 'Gelb' }),
    eZeile('E1', 5, { handle: 'gut', variante: 'Wunschmaß' }),
    eZeile('F1', 5, { handle: 'offen', variante: 'Grau', sicherheit: 'offen', ek_vk_einheit: null }),
  ];
  const produkte = [
    produkt('verlust', [variante('Rot', 11.9, 'm2')]), // Preis wird unten auf 9 netto gesetzt: unter EK 10
    produkt('knapp', [variante('Blau', 11.9, 'm2')]),
    produkt('verkauft', [variante('Grün', 11.9, 'm2')]),
    produkt('gut', [variante('Gelb', 11.9, 'm2'), variante('Wunschmaß', 11.9, 'stueck')]),
    produkt('offen', [variante('Grau', 11.9, 'm2')]),
    produkt('muster-gut', [variante('Gelb', 0, 'stueck')]),
    produkt('entwurf', [variante('Gelb', 1, 'm2')], { status: 'DRAFT' }),
  ];
  produkte[0].varianten[0].preis = 10.71; // 9 netto < 10 EK
  produkte[0].varianten[0].preisJeEinheit.betrag = 10.71;
  const s = preisKontrolleSortiment({ produkte, ekZeilen: ek, verkaufteHandles: new Set(['verkauft']) });
  assert.deepEqual([s.geprueft, s.ohneEk, s.nichtVergleichbar, s.imZiel, s.unterZiel, s.verlust], [6, 1, 1, 1, 3, 1]);
  assert.deepEqual(s.produkte.map(p => p.handle), ['verlust', 'verkauft', 'knapp']);
  assert.equal(s.produkte[0].noetigBrutto, 17, 'EK 10 / 0,7 x 1,19 = 17,00');
  assert.equal(s.nichtVergleichbarGruende[0].anzahl, 1);
});

test('Sortiment: Kante bei Material-EK fuer das Referenzmass mitgerechnet, Fertigpreis ohne, unbelegt sichtbar ohne Kante', () => {
  assert.deepEqual(KANTE_REFERENZ, { breiteCm: 200, laengeCm: 300 });
  const tnm = (handle, extra) => eZeile(`${handle}-1`, 20, { handle, variante: 'Rot', produktart: 'Teppich nach Maß', vk_einheit: '0,01 m² (Konfigurator)', menge_bezug: 0.01, ek_vk_einheit: 0.2, ...extra });
  const ek = [
    tnm('material', { bemerkung: 'nur Material (Rolle); Kettel-/Einfasskosten und Verschnitt fehlen' }),
    tnm('fertig', { quelle: 'Liste, Spalte rug_premium' }),
    tnm('unklar', { quelle: 'Kosten pro Artikel' }),
  ];
  // 33,32 brutto je m² = 28 netto: 20 EK = 28,6 %, unter Ziel. Mit Kante 10 m x 3 / 6 m² = 5 je m²: 25 EK.
  const produkte = ['material', 'fertig', 'unklar'].map(h => produkt(h, [variante('Rot', 0.3332, 'm2', 33.32)]));
  const s = preisKontrolleSortiment({ produkte, ekZeilen: ek, kettler: { bis6qmJeLfm: 3, ab6qmJeLfm: 4 } });
  const je = Object.fromEntries(s.produkte.map(p => [p.handle, p]));
  assert.deepEqual([je.material.kante, je.fertig.kante, je.unklar.kante], ['mitgerechnet', 'enthalten', 'ohne']);
  assert.equal(je.material.noetigBrutto, 42.5, '25 / 0,7 x 1,19 = 42,50 je m²');
  assert.equal(je.fertig.noetigBrutto, 34);
  assert.deepEqual([s.kanteMitgerechnet, s.ohneKante], [1, 1]);
  // Kettelservice 19 brutto je m: 10 m x 15,97 / 6 m² = 26,61 Erloes je m² zusaetzlich - Kante gedeckt.
  const mitService = preisKontrolleSortiment({ produkte, ekZeilen: ek, kettler: { bis6qmJeLfm: 3, ab6qmJeLfm: 4 }, kettelVkJeLfmBrutto: 19 });
  assert.equal(mitService.produkte.some(p => p.handle === 'material'), false);
  assert.equal(mitService.kanteMitgerechnet, 1);
  const ohneTarif = preisKontrolleSortiment({ produkte, ekZeilen: ek });
  assert.equal(ohneTarif.produkte.find(p => p.handle === 'material').kante, 'ohne', 'ohne Kettlertarif keine erfundene Kante');
});

test('Sortiment: EK-Aufschlag des Lieferanten zaehlt mit', () => {
  const ek = [eZeile('A1', 6, { handle: 'p', variante: 'Rot' })];
  const produkte = [produkt('p', [variante('Rot', 11.9, 'm2')])];
  assert.equal(preisKontrolleSortiment({ produkte, ekZeilen: ek }).unterZiel, 0, '6 bei 10 netto = 40 %');
  assert.equal(preisKontrolleSortiment({ produkte, ekZeilen: ek, ekAufschlag: { A: 0.25 } }).unterZiel, 1, '7,50 bei 10 netto = 25 %');
});

test('Rechte: Mitarbeiter und lesen bekommen keine Betraege, Inhaber und Notzugang alles', () => {
  assert.deepEqual([null, { rolle: 'inhaber' }, { rolle: 'mitarbeiter' }, { rolle: 'lesen' }, {}].map(darfOnlineshop), [true, true, false, false, false]);
  const antwort = { verfuegbar: true, kaeufe: [{ netto: 100, rohertrag: 30 }] };
  assert.equal(fuerRolle(antwort, null), antwort);
  assert.equal(fuerRolle(antwort, { rolle: 'inhaber' }), antwort);
  for (const rolle of ['mitarbeiter', 'lesen']) {
    const r = fuerRolle(antwort, { rolle });
    assert.equal(JSON.stringify(r).match(/\d/), null, `${rolle}: keine Zahl in der Antwort`);
    assert.equal(r.nurInhaber, true);
  }
});
