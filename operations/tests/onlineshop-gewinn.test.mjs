import test from 'node:test';
import assert from 'node:assert/strict';
import { bestellWarnung } from '../lib/bestellwarnung.mjs';
import {
  ZIEL_ROHERTRAG, kaufArt, erloes, kostenAusBeleg, gewinnJeKauf, monatsKopf, preisIndex,
  preisKontrolleKaeufe, ekJeVerkaufseinheit, preisKontrolleSortiment, fuerRolle, darfOnlineshop,
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
  assert.equal(a.kostenFaelle.length, 0);
  const heuteReicht = preisIndex([produkt('test', [variante('Test', 6.9, 'm2', 6.9, { sku: 'ART-1' })])]);
  assert.equal(preisKontrolleKaeufe([zeile], { preise: heuteReicht }).preisFaelle[0].stand, 'angehoben', 'inzwischen angehoben');
});

test('Preiskontrolle aus Kaeufen: reicht der Preis, sind Versand und Zuschlaege das Problem', () => {
  // Einkauf 3/m² bei 6 netto: 50 % Warenmarge. Erst 30 Lieferkosten druecken den Kauf unter das Ziel.
  const zeile = gewinnJeKauf({ auftrag: auftrag([pos('l1', { nettoGesamt: 60 })]), roh: roh({ brutto: 71.4, steuer: 11.4 }), warnungFuer: warnungMit(EK([eZeile('ART-1', 3)])), gebuehr: 1 });
  const a = preisKontrolleKaeufe([zeile], { preise: preisIndex([]) });
  assert.equal(a.preisFaelle.length, 0);
  assert.equal(a.kostenFaelle.length, 1);
  assert.equal(a.kostenFaelle[0].ursache, 'kosten');
  assert.equal(a.kostenFaelle[0].kosten, 31);
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
