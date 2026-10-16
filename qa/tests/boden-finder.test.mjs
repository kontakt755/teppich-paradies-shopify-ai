import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// Browser-Skripte (UMD an globalThis) - erst die Regeln des Rollenware-Rechners,
// dann der Finder, der sie benutzt.
const require = createRequire(import.meta.url);
require('../../assets/tp-rollware-art.js');
require('../../assets/tp-boden-finder.js');
const L = globalThis.TPBodenFinder.logik;

// Preise wie aus der Datenansicht: Cent, je m².
const produkt = (varianten, extra = {}) => ({
  handle: 'test',
  cm_exact: false,
  min_cm: 0,
  options: [{ name: 'Farbe', values: ['Grau'] }, { name: 'Breite', values: varianten.map(v => v[0]) }],
  variants: varianten.map(([breite, preis, extraV = {}]) => ({
    options: ['Grau', breite], price: preis, available: true, wunschmass: true, ...extraV
  })),
  ...extra
});

test('Raummass in Metern oder Zentimetern, ohne Einheit erkannt', () => {
  assert.equal(L.raumMass('4'), 400);
  assert.equal(L.raumMass('4,5'), 450);
  assert.equal(L.raumMass('3.55 m'), 355);
  assert.equal(L.raumMass('450 cm'), 450);
  // Ohne Einheit: unter 30 sind Meter, ab 30 Zentimeter.
  assert.equal(L.raumMass('450'), 450);
  assert.equal(L.raumMass('380'), 380);
  assert.equal(L.raumMass('29,5'), 2950);
  assert.equal(L.raumMass('30'), 30);
  assert.deepEqual(L.raumMassInfo('450'), { cm: 450, einheit: 'cm' });
  assert.deepEqual(L.raumMassInfo('4,5'), { cm: 450, einheit: 'm' });
  assert.deepEqual(L.raumMassInfo('4 m'), { cm: 400, einheit: 'm' });
  assert.equal(L.raumMass(''), null);
  assert.equal(L.raumMass('abc'), null);
  // Unter 10 cm oder ueber 50 m ist kein Raum.
  assert.equal(L.raumMass('5 cm'), null);
  assert.equal(L.raumMass('60 m'), null);
  assert.equal(L.raumMass('6000'), null);
});

test('Raumflaeche in m²', () => {
  assert.equal(L.qmFlaeche('18'), 18);
  assert.equal(L.qmFlaeche('18,5'), 18.5);
  assert.equal(L.qmFlaeche('18 m²'), 18);
  assert.equal(L.qmFlaeche('18qm'), 18);
  assert.equal(L.qmFlaeche(''), null);
  assert.equal(L.qmFlaeche('0'), null);
  assert.equal(L.qmFlaeche('5000'), null);
});

test('Geldbetraege mit Komma, Tausenderpunkt und Euro-Zeichen', () => {
  assert.equal(L.betrag('500'), 500);
  assert.equal(L.betrag('500,50'), 500.5);
  assert.equal(L.betrag('1.200'), 1200);
  assert.equal(L.betrag('1.200,50 €'), 1200.5);
  assert.equal(L.betrag('20 Euro'), 20);
  assert.equal(L.betrag(''), null);
  assert.equal(L.betrag('0'), null);
  assert.equal(L.betrag('zwanzig'), null);
});

test('Preisstufen aus der Einstellung: sortiert, ohne Doppelte, Dezimalkomma', () => {
  assert.deepEqual(L.preisStufen('20, 30, 45, 70'), [20, 30, 45, 70]);
  assert.deepEqual(L.preisStufen('45; 20 30 30'), [20, 30, 45]);
  assert.deepEqual(L.preisStufen('19,90, 29,90'), [19.9, 29.9]);
  assert.deepEqual(L.preisStufen(''), []);
});

test('ca.-Betrag am Preisrahmen: Rollenbreite eingerechnet, auf 10 EUR gerundet', () => {
  // 3,5 x 4,2 m: 4-m-Rolle quer zu 3,5 m -> 4,0 x 4,2 = 16,8 m².
  assert.equal(L.rollenFlaeche(350, 420), 16.8);
  // 4,5 x 6 m: 5-m-Rolle quer zu 4,5 m -> 5 x 6 = 30 m².
  assert.equal(L.rollenFlaeche(450, 600), 30);
  // Breiter als 5 m in beiden Richtungen: Raumflaeche.
  assert.equal(L.rollenFlaeche(600, 700), 42);
  assert.equal(L.stufenBetrag(20, 16.8), 340);
  assert.equal(L.stufenBetrag(30, 30), 900);
  assert.equal(L.stufenBetrag(20, null), null);
});

test('Raum 4 x 5 m aus 400er-Rolle: 20 m² Meterware', () => {
  const p = produkt([['400cm', 3300], ['500cm', 3300], ['Wunschmaß', 4490]]);
  const a = L.raumAngebot(p, 500, 400);
  assert.equal(a.art, 'meterware');
  assert.equal(a.qm, 20);
  assert.equal(a.betrag, 660);
  assert.equal(a.naht, false);
});

test('Raum 3,5 x 4,5 m: guenstigste Lage und Rolle, Verschnitt eingerechnet', () => {
  // Meterware: 400er quer 3,5 m -> 4,0 x 4,5 = 18 m²; 500er quer 4,5 m -> 5,0 x 3,5 = 17,5 -> 18 m².
  // Raummass: 3,5 x 4,5 = 15,75 -> 16 m² zu 44,90 = 718,40 - teurer als 18 x 33 = 594.
  const p = produkt([['400cm', 3300], ['500cm', 3300], ['Wunschmaß', 4490]]);
  const a = L.raumAngebot(p, 350, 450);
  assert.equal(a.art, 'meterware');
  assert.equal(a.qm, 18);
  assert.equal(a.betrag, 594);
});

test('Raummass gewinnt, wenn die Meterware viel Verschnitt haette', () => {
  // 2,5 x 3 m bei nur 500er-Rolle: Meterware 5 x 2,5 = 12,5 -> 13 m² x 30 = 390;
  // Raummass 2,5 x 3 = 7,5 -> 8 m² x 40 = 320.
  const p = produkt([['500cm', 3000], ['Wunschmaß', 4000]]);
  const a = L.raumAngebot(p, 250, 300);
  assert.equal(a.art, 'raummass');
  assert.equal(a.qm, 8);
  assert.equal(a.betrag, 320);
});

test('Beide Zuschnittarten fuer die Anzeige: genau zugeschnitten und von der Rolle', () => {
  // 3,5 x 4,5 m: von der Rolle 18 m² x 33 = 594; zugeschnitten 16 m² x 44,90 = 718,40.
  const p = produkt([['400cm', 3300], ['500cm', 3300], ['Wunschmaß', 4490]]);
  const w = L.raumWege(p, 350, 450);
  assert.equal(w.meterware.betrag, 594);
  assert.equal(w.meterware.rolle, 400);
  assert.equal(w.meterware.quer, 350);
  assert.equal(w.raummass.qm, 16);
  assert.equal(Math.round(w.raummass.betrag * 100) / 100, 718.4);
  // Ohne erlaubte Wunschmass-Variante gibt es nur die Rolle.
  const ohne = produkt([['400cm', 3300], ['Wunschmaß', 4490, { wunschmass: false }]]);
  assert.equal(L.raumWege(ohne, 350, 450).raummass, null);
  assert.ok(L.raumWege(ohne, 350, 450).meterware);
});

test('Raummass nur ueber eine erlaubte Wunschmass-Variante (fail closed wie im Rechner)', () => {
  const ohne = produkt([['500cm', 3000], ['Wunschmaß', 4000, { wunschmass: false }]]);
  assert.equal(L.raumAngebot(ohne, 250, 300).art, 'meterware');
  const nichtLieferbar = produkt([['500cm', 3000], ['Wunschmaß', 4000, { available: false }]]);
  assert.equal(L.raumAngebot(nichtLieferbar, 250, 300).art, 'meterware');
});

test('Raummass nur bis Rolle minus Zugabe: 4,98 m Breite geht nicht aus der 500er', () => {
  // quer 498 > 495 -> kein Raummass in dieser Lage; quer 300 (andere Lage) geht.
  const p = produkt([['500cm', 3000], ['Wunschmaß', 4000]]);
  const a = L.raumAngebot(p, 498, 300);
  assert.ok(a.art === 'meterware' || a.quer === 300);
});

test('Raum breiter als jede Rolle: Bahnen mit Naht', () => {
  const p = produkt([['400cm', 2000]]);
  const a = L.raumAngebot(p, 600, 700);
  assert.equal(a.naht, true);
  assert.equal(a.bahnen, 2);
  // 2 Bahnen x 4 m x 6 m = 48 m² (guenstigere Lage: Bahnen quer zur 6-m-Seite)
  assert.equal(a.qm, 48);
  assert.equal(a.betrag, 960);
});

test('Mindestlaenge hebt die Laenge an wie im Rechner', () => {
  const p = produkt([['400cm', 2000]], { min_cm: 800 });
  const a = L.raumAngebot(p, 300, 400);
  assert.equal(a.laenge, 800);
  assert.equal(a.qm, 32);
});

test('Ohne Rollenbreiten kein Raumangebot', () => {
  const p = { options: [{ name: 'Groesse', values: ['200x300'] }], variants: [{ options: ['200x300'], price: 10000, available: true }] };
  assert.equal(L.raumAngebot(p, 200, 300), null);
});

test('Optik-Namen: Filterwert = Name | Beschreibung, Stufe nach Zeile', () => {
  const n = L.optikNamen('Bis 5 mm = Kurzflor | flach und ruhig\nÜber 5 bis unter 10 mm = Mittelflor | spürbar weicher\nAb 10 mm = Hochflor');
  assert.deepEqual(n['bis 5 mm'], { name: 'Kurzflor', text: 'flach und ruhig', stufe: 1, bild: '' });
  assert.equal(n['über 5 bis unter 10 mm'].name, 'Mittelflor');
  assert.equal(n['ab 10 mm'].stufe, 3);
  assert.equal(n['ab 10 mm'].text, '');
});

test('Filteradresse: Farbe, Optik, Raum, Preis bis und Ansicht', () => {
  const url = L.filterUrl('/collections/teppichboden', {
    farbe: 'gid://shopify/TaxonomyValue/3',
    optikFilter: 'filter.p.m.custom.florhoehe_mm',
    optik: 'gid://shopify/FilterSettingGroup/380240206',
    raumFilter: 'filter.p.m.custom.zimmer',
    zimmer: ['gid://shopify/Metaobject/1720806834510']
  }, { view: 'boden-finder', preisBis: 25 });
  const u = new URL(url, 'https://example.test');
  assert.equal(u.pathname, '/collections/teppichboden');
  assert.equal(u.searchParams.get('view'), 'boden-finder');
  assert.equal(u.searchParams.get('filter.v.t.shopify.color-pattern'), 'gid://shopify/TaxonomyValue/3');
  assert.equal(u.searchParams.get('filter.p.m.custom.florhoehe_mm'), 'gid://shopify/FilterSettingGroup/380240206');
  assert.equal(u.searchParams.get('filter.p.m.custom.zimmer'), 'gid://shopify/Metaobject/1720806834510');
  assert.equal(u.searchParams.get('filter.v.price.lte'), '25.00');
  // Ohne Auswahl bleibt die Adresse nackt.
  assert.equal(L.filterUrl('/collections/teppichboden', {}, {}), '/collections/teppichboden');
});

test('Filteradresse mit mehreren Farben und Optiken (Shopify: oder)', () => {
  const url = L.filterUrl('/collections/teppichboden', {
    farben: ['gid://shopify/TaxonomyValue/6', 'gid://shopify/TaxonomyValue/8'],
    optikFilter: 'filter.p.m.custom.florhoehe_mm',
    optiken: ['gid://shopify/FilterSettingGroup/380207438', 'gid://shopify/FilterSettingGroup/380240206']
  }, { view: 'boden-finder' });
  const u = new URL(url, 'https://example.test');
  assert.deepEqual(u.searchParams.getAll('filter.v.t.shopify.color-pattern'), ['gid://shopify/TaxonomyValue/6', 'gid://shopify/TaxonomyValue/8']);
  assert.deepEqual(u.searchParams.getAll('filter.p.m.custom.florhoehe_mm'), ['gid://shopify/FilterSettingGroup/380207438', 'gid://shopify/FilterSettingGroup/380240206']);
});

test('Aufzaehlung mit "oder"', () => {
  assert.equal(L.oderListe(['Beige']), 'Beige');
  assert.equal(L.oderListe(['Beige', 'Grau']), 'Beige oder Grau');
  assert.equal(L.oderListe(['Beige', 'Grau', 'Blau']), 'Beige, Grau oder Blau');
  assert.equal(L.oderListe([]), '');
});

test('Euro-Anzeige: ab 100 EUR ganze Euro', () => {
  assert.equal(L.euro(660), '660 €');
  assert.equal(L.euro(1234.4), '1.234 €');
  assert.equal(L.euro(25), '25 €');
  assert.equal(L.euro(24.9), '24,90 €');
});

// ---------------------------------------------------------------------------
// Paketware (Vinyl): Preis je m² und Raumpreis in ganzen Paketen
// ---------------------------------------------------------------------------

const repo = new URL('../../', import.meta.url);
const lesen = (pfad) => readFileSync(new URL(pfad, repo), 'utf8');
const template = (pfad) => {
  const text = lesen(pfad);
  return JSON.parse(text.slice(text.indexOf('{')));
};

// Paketprodukt wie aus der Treffer-Ansicht: eine Variante, Preis = Paketpreis in Cent.
const paket = (qm, preis, extraV = {}) => ({
  handle: 'klick', qm_paket: qm, cm_exact: false, min_cm: 0,
  options: [{ name: 'Title', values: ['Default Title'] }],
  variants: [{ options: ['Default Title'], price: preis, available: true, wunschmass: true, ...extraV }]
});

test('Verschnitt wie der Paketrechner (blocks/paket-auswahl.liquid)', () => {
  const rechner = lesen('blocks/paket-auswahl.liquid');
  const m = rechner.match(/const WASTE_FACTOR = ([\d.]+);/);
  assert.ok(m, 'WASTE_FACTOR im Paketrechner nicht gefunden');
  assert.equal(L.PAKET_VERSCHNITT, Number(m[1]));
  // Dieselbe Formel: Flaeche x Verschnitt, auf volle Pakete aufgerundet, mindestens eines.
  assert.match(rechner, /Math\.max\(1, Math\.ceil\(requiredSqm \/ sqmPerPackage - FLOAT_EPSILON\)\)/);
});

test('Raum 4 x 5 m in Paketen zu 1,988 m²: 21 m² mit Verschnitt -> 11 Pakete', () => {
  const a = L.paketAngebot(paket(1.988, 10534), 20);
  assert.equal(a.pakete, 11);
  assert.equal(a.betrag, 1158.74);
  assert.equal(Math.round(a.qm * 1000) / 1000, 21.868);
  assert.equal(L.paketText(a), '11 Pakete à 1,988 m² = 21,868 m², inkl. 5 % Verschnitt');
});

test('Pakete, die genau aufgehen, werden nicht um eines aufgerundet', () => {
  // 2 x 2 m = 4 m², mit 5 % = 4,2 m² = genau 2 Pakete zu 2,1 m².
  assert.equal(L.paketRechnung(2.1, 50, 4).pakete, 2);
  // Kleiner Raum: mindestens ein Paket.
  const klein = L.paketRechnung(2.1, 50, 0.25);
  assert.equal(klein.pakete, 1);
  assert.equal(L.paketText(klein), '1 Paket à 2,10 m² = 2,10 m², inkl. 5 % Verschnitt');
  // Gegenprobe Paketrechner: 12 m² Klebevinyl zu 4,87 m² je Paket = 3 Pakete.
  assert.equal(L.paketRechnung(4.87, 155.79, 12).pakete, 3);
});

test('Paketangebot: guenstigstes lieferbares Paket, Rollenware ist keine Paketware', () => {
  const p = paket(2, 12000);
  p.variants.push({ options: ['B'], price: 9000, available: false });
  assert.equal(L.paketAngebot(p, 4).betrag, 3 * 120);
  assert.equal(L.paketAngebot(produkt([['400cm', 3300]]), 20), null);
  assert.equal(L.paketAngebot(p, null), null);
});

test('Preis je m² von Paketware wie auf der Karte: Paketpreis / m² je Paket, auf Cent', () => {
  assert.equal(L.abPreisQm(paket(1.988, 10534)), 52.99);
  assert.equal(L.abPreisQm(paket(5.02, 14302)), 28.49);
  // Rollenware unveraendert: guenstigste Rollenbreite.
  assert.equal(L.abPreisQm(produkt([['400cm', 1799], ['500cm', 2299]])), 17.99);
});

test('Preisliste: Eintraege mit Stelle, Preisstufe je m², Auslauf zuletzt', () => {
  const liste = L.preisEintraege([
    ['rolle-guenstig', 1799, 0, 1799, 0],
    ['klick-teuer', 5299, 1.988, 10534, 0],
    ['klebe-guenstig', 2849, 5.02, 14302, 0],
    ['auslauf', 2000, 2.1, 4200, 1],
    ['ohne-preis', 0, 0, 0, 0]
  ]);
  assert.deepEqual(liste.map((e) => e.pos), [0, 1, 2, 3, 4]);
  assert.equal(liste[2].qm, 28.49);
  assert.equal(liste[2].paket, 5.02);
  assert.equal(liste[2].preis, 143.02);
  assert.equal(liste[3].auslauf, true);
  assert.equal(liste[4].qm, null);

  // Stufe bis 30 EUR/m²; ohne Preis faellt das Produkt heraus.
  assert.deepEqual(L.imBudget(liste, 30).map((e) => e.handle), ['rolle-guenstig', 'klebe-guenstig', 'auslauf']);
  // Grenze genau auf der Stufe gehoert dazu.
  assert.deepEqual(L.imBudget(liste, 28.49).map((e) => e.handle), ['rolle-guenstig', 'klebe-guenstig', 'auslauf']);
  assert.deepEqual(L.imBudget(liste, 17.99).map((e) => e.handle), ['rolle-guenstig']);
  // Regulaere Ware vor Auslauf.
  assert.deepEqual(L.regulaerZuerst(liste.slice(2, 4).reverse(), (e) => e.auslauf).map((e) => e.handle), ['klebe-guenstig', 'auslauf']);
});

// Preisliste wie aus ?view=boden-finder-preise (Klebe-, Klickvinyl, Rolle, teuer).
const vinylListe = () => L.preisEintraege([
  ['klebe-a', 3199, 4.87, 15579, 0],
  ['klick-b', 2490, 1.77, 4407, 0],
  ['rolle-c', 2999, 0, 2999, 0],
  ['klick-teuer', 5299, 1.988, 10534, 0]
]);

test('ca.-Betrag der Preisstufe bei Paketware: teuerster Raumpreis der Stufe in ganzen Paketen', () => {
  const liste = vinylListe();
  // Live 16.10.: 4 x 3 m bis 35 EUR/m². Flaeche x 1,05 x Stufe waeren ca. 440 EUR,
  // der Klebevinyl-Vorschlag kostet 3 Pakete a 4,87 m² = 467,37 EUR.
  const qmRolle = L.rollenFlaeche(400, 300);
  assert.equal(qmRolle, 12);
  assert.equal(L.stufenBetrag(35, 12 * L.PAKET_VERSCHNITT), 440);
  assert.equal(L.paketRechnung(4.87, 155.79, 12).betrag, 467.37);
  assert.equal(L.stufenMaximum(liste, 35, 12, qmRolle), 470);
  // Bis 25 EUR/m² nur Klickvinyl: 12,6 m² / 1,77 = 8 Pakete = 352,56 EUR.
  assert.equal(L.stufenMaximum(liste, 25, 12, qmRolle), 360);
  // Rollenware: Preis je m² x Rollenflaeche, wie bisher am Preisrahmen.
  assert.equal(L.stufenMaximum(liste.filter((e) => e.paket === 0), 35, 12, qmRolle), 360);
  // Glatte Betraege werden nicht um 10 EUR angehoben: 2 Pakete a 50 EUR.
  assert.equal(L.stufenMaximum(L.preisEintraege([['p', 2381, 2.1, 5000, 0]]), 25, 4, 4), 100);
  // Ohne Raumgroesse, ohne Liste oder ohne Treffer in der Stufe kein Betrag.
  assert.equal(L.stufenMaximum(liste, 35, null, null), null);
  assert.equal(L.stufenMaximum(null, 35, 12, 12), null);
  assert.equal(L.stufenMaximum(liste, 20, 12, 12), null);
});

test('ca.-Betrag der Preisstufe liegt nie unter einem Paketvorschlag der Stufe', () => {
  const liste = vinylListe();
  [25, 35, 45, 60].forEach((stufe) => {
    for (let qm = 0.5; qm <= 60; qm += 0.5) {
      const betrag = L.stufenMaximum(liste, stufe, qm, qm);
      const preise = L.imBudget(liste, stufe).filter((e) => e.paket > 0)
        // Wie der Vorschlag unter der Karte: paketAngebot() mit dem Paketpreis.
        .map((e) => L.paketAngebot(paket(e.paket, Math.round(e.preis * 100)), qm).betrag);
      preise.forEach((p) => assert.ok(betrag >= p, `bis ${stufe} €/m², ${qm} m²: ${betrag} < ${p}`));
      if (preise.length) assert.ok(betrag < Math.max(...preise, qm * 29.99) + 10);
    }
  });
});

test('Preisstufen im Finder: Paketware ueber stufenMaximum, Teppichboden wie bisher', () => {
  const js = lesen('assets/tp-boden-finder.js');
  assert.match(js, /paket \? stufenMaximum\(liste, stufe, flaeche, qm, raum\) : stufenBetrag\(stufe, qm\)/);
  assert.match(js, /var raum = this\.raum\(\);\s+this\.qa\('\.tp-bf-preis'\)/);
});

// Rollenware wie aus ?view=boden-finder-preise: [..., [[Breite, Cent]], Mindestlaenge cm, je 0,01 m²].
// Daneben das Produkt, wie es die Treffer-Ansicht fuer die Karte liefert.
const rollen = [
  // Nur 2 m breit, Mindestlaenge 8 m (homogener PVC-Boden, live 16.10.).
  { roh: ['pvc-2m', 4749, 0, 4749, 0, [['200cm', 4749]], 800, 0], karte: produkt([['200cm', 4749]], { min_cm: 800 }) },
  // 2 m und 4 m, ohne Mindestlaenge.
  { roh: ['rolle-2-4', 1999, 0, 1999, 0, [['200 cm', 1999], ['400 cm', 1999]], 0, 0], karte: produkt([['200 cm', 1999], ['400 cm', 1999]]) },
  // 5-m-Rolle teurer als die 4-m-Rolle.
  { roh: ['rolle-4-5', 1799, 0, 1799, 0, [['400 cm', 1799], ['500 cm', 2299]], 0, 0], karte: produkt([['400 cm', 1799], ['500 cm', 2299]]) },
  // Nur 4 m.
  { roh: ['rolle-4', 3290, 0, 3290, 0, [['400 cm', 3290]], 0, 0], karte: produkt([['400 cm', 3290]]) },
  // Preis je 0,01 m² (cm-genau abgerechnet).
  { roh: ['rolle-cm', 2500, 0, 25, 0, [['400 cm', 25]], 0, 1], karte: produkt([['400 cm', 25]], { cm_exact: true }) }
];

test('Preisliste: Rollenware bringt Breiten, Preise und Mindestlaenge fuer raumKandidaten mit', () => {
  const liste = L.preisEintraege(rollen.map((r) => r.roh).concat([
    ['klick', 2490, 1.77, 4407, 0],
    ['rolle-alt', 1799, 0, 1799, 0],
    ['rolle-wunsch', 3000, 0, 3000, 0, [['Wunschmaß', 4000], ['500cm', 3000]], 0, 0],
    ['ohne-breite', 3000, 0, 3000, 0, [['Wunschmaß', 4000]], 0, 0]
  ]));
  assert.equal(liste[0].rolle.min_cm, 800);
  assert.equal(liste[0].rolle.cm_exact, false);
  assert.deepEqual(liste[0].rolle.variants, [{ options: ['200cm'], price: 4749, available: true }]);
  assert.equal(liste[4].rolle.cm_exact, true);
  // Paketware und alte Eintraege ohne Rollendaten: kein Rollenprodukt.
  assert.equal(liste[5].rolle, null);
  assert.equal(liste[6].rolle, null);
  // Wunschmass faellt heraus; ohne Rollenbreite bleibt nichts.
  assert.deepEqual(liste[7].rolle.options[0].values, ['500cm']);
  assert.equal(liste[8].rolle, null);
  // Je Eintrag derselbe Raumpreis wie unter der Karte.
  rollen.forEach((r, i) => {
    assert.equal(L.raumAngebot(liste[i].rolle, 400, 300).betrag, L.raumAngebot(r.karte, 400, 300).betrag, r.roh[0]);
  });
});

test('ca.-Betrag der Preisstufe bei Rollenware: guenstigster Weg je Rolle, auch Bahnen mit Naht', () => {
  const liste = L.preisEintraege(rollen.map((r) => r.roh));
  const raum = { laenge: 400, breite: 300 };
  const qmRolle = L.rollenFlaeche(400, 300);
  // Live 16.10., 4 x 3 m bis 60 EUR/m²: bisher Preis je m² x 12 m² = ca. 570 EUR,
  // die 2-m-Rolle kostet aber 2 Bahnen mit Naht x 2 m x 8 m = 32 m² = 1.519,68 EUR.
  const naht = L.raumAngebot(liste[0].rolle, 400, 300);
  assert.equal(naht.naht, true);
  assert.equal(naht.qm, 32);
  assert.equal(L.stufenMaximum(liste, 60, 12, qmRolle), 570);
  assert.equal(L.stufenMaximum(liste, 60, 12, qmRolle, raum), 1520);
  // Bis 35 EUR/m²: 4-m-Rolle zu 32,90 x 12 m² = 394,80 EUR.
  assert.equal(L.stufenMaximum(liste, 35, 12, qmRolle, raum), 400);
  // 3,5 x 4,5 m: rollenFlaeche rechnet mit der 5-m-Rolle (17,5 m²), die Rollen
  // ohne 5 m brauchen 4 x 4,5 = 18 m².
  assert.equal(L.rollenFlaeche(350, 450), 17.5);
  assert.equal(L.stufenMaximum(liste, 20, 15.75, 17.5, { laenge: 350, breite: 450 }), 360);
  // 7 x 5 m: nur die 5-m-Rolle passt quer, und die kostet 22,99 statt 17,99.
  assert.equal(L.stufenMaximum(liste.slice(2, 3), 20, 35, L.rollenFlaeche(700, 500), { laenge: 700, breite: 500 }), 810);
  // Nur Flaeche ohne Laenge und Breite: Preis je m² x Flaeche wie unter der Karte.
  assert.equal(L.stufenMaximum(liste, 35, 12, 12, null), 400);
});

test('ca.-Betrag der Preisstufe liegt nie unter einem Rollen- oder Paketvorschlag der Stufe', () => {
  const liste = L.preisEintraege(rollen.map((r) => r.roh).concat([
    ['klebe-a', 3199, 4.87, 15579, 0],
    ['klick-b', 2490, 1.77, 4407, 0],
    ['klick-teuer', 5299, 1.988, 10534, 0]
  ]));
  const karten = rollen.map((r) => r.karte);
  for (const stufe of [20, 25, 35, 45, 60]) {
    for (let a = 100; a <= 1000; a += 70) {
      for (let b = 100; b <= 800; b += 90) {
        const flaeche = (a * b) / 10000;
        const betrag = L.stufenMaximum(liste, stufe, flaeche, L.rollenFlaeche(a, b), { laenge: a, breite: b });
        const drin = L.imBudget(liste, stufe);
        const preise = drin.filter((e) => e.paket > 0)
          .map((e) => L.paketAngebot(paket(e.paket, Math.round(e.preis * 100)), flaeche).betrag)
          .concat(drin.filter((e) => e.rolle).map((e) => L.raumAngebot(karten[e.pos], a, b).betrag));
        preise.forEach((p) => assert.ok(betrag >= p, `bis ${stufe} €/m², ${a} x ${b} cm: ${betrag} < ${p}`));
        // Hoechstens bis zur naechsten vollen 10 EUR darueber.
        if (preise.length) assert.ok(betrag < Math.max(...preise) + 10, `bis ${stufe} €/m², ${a} x ${b} cm: ${betrag}`);
      }
    }
  }
});

test('Preis-Ansicht liefert Rollenbreiten und Mindestlaenge wie die Treffer-Ansicht', () => {
  const daten = lesen('sections/tp-boden-finder-daten.liquid');
  const preise = daten.slice(daten.indexOf('"preise": ['), daten.indexOf('{%- endpaginate -%}'));
  // Breitenoption nur bei Rollenware, Paare ohne Doppelte, Mindestlaenge wie in der Treffer-Ansicht.
  assert.match(preise, /if bf_qm == 0\s+for bf_opt in product\.options_with_values/);
  assert.match(preise, /unless bf_rolle contains bf_paar/);
  assert.match(preise, /mindestlaenge_lfm\.value \| times: 100 \| round/);
  assert.match(preise, /\[\{\{ bf_rolle \}\}\], \{\{ bf_min_cm \| json \}\}, \{% if product\.metafields\.custom\.preis_pro_001_qm\.value == true %\}1/);
});

test('Kartenseite der Treffer-Ansicht aus der Stelle in der Kollektion', () => {
  assert.equal(L.kartenSeite(0, 8), 1);
  assert.equal(L.kartenSeite(7, 8), 1);
  assert.equal(L.kartenSeite(8, 8), 2);
  assert.equal(L.kartenSeite(250, 8), 32);
});

test('Optik-Namen mit Dekorbild', () => {
  const n = L.optikNamen('Holzdekore = Holzoptik | Dielen | holz\nSalz und Pfeffer = Salz und Pfeffer | fein gesprenkelt | Punkte');
  assert.equal(n['holzdekore'].bild, 'holz');
  assert.equal(n['salz und pfeffer'].bild, 'punkte');
  assert.equal(L.optikNamen('Bis 5 mm = Kurzflor')['bis 5 mm'].bild, '');
});

test('Optiken in der Reihenfolge der Namen, nicht alphabetisch wie Shopify', () => {
  const namen = L.optikNamen('Holzdekore = Holzoptik | | holz\nSteindekore = Steinoptik | | stein');
  const werte = ['Fliesendekore', 'Holzdekore', 'Salz und Pfeffer', 'Steindekore'].map((label) => ({ label }));
  assert.deepEqual(L.optikReihenfolge(werte, namen).map((w) => w.label), ['Holzdekore', 'Steindekore', 'Fliesendekore', 'Salz und Pfeffer']);
  // Teppichboden: Filterreihenfolge = Namensreihenfolge, bleibt also gleich.
  const flor = L.optikNamen('Bis 5 mm = Kurzflor\nÜber 5 bis unter 10 mm = Mittelflor\nAb 10 mm = Hochflor');
  const fw = ['Bis 5 mm', 'Über 5 bis unter 10 mm', 'Ab 10 mm'].map((label) => ({ label }));
  assert.deepEqual(L.optikReihenfolge(fw, flor), fw);
});

test('Filteradresse mit Seite fuer die Treffer- und Preis-Ansicht', () => {
  const u = new URL(L.filterUrl('/collections/vinylboden-1', {}, { view: 'boden-finder-preise', seite: 3 }), 'https://example.test');
  assert.equal(u.searchParams.get('page'), '3');
  assert.equal(L.filterUrl('/collections/vinylboden-1', {}, { seite: 1 }), '/collections/vinylboden-1');
});

test('Vinyl im Finder: gleiche Bodenarten in allen Templates, Preis je m² gerechnet', () => {
  const finder = ['templates/index.json', 'templates/collection.teppichboden.json', 'templates/collection.vinylboden.json']
    .map((pfad) => [pfad, template(pfad).sections.tp_boden_finder]);
  const vinyl = finder.map(([pfad, s]) => {
    assert.ok(s, pfad + ': Boden-Finder fehlt');
    return s.blocks.art_vinyl.settings;
  });
  vinyl.forEach((v) => assert.deepEqual(v, vinyl[0]));
  const v = vinyl[0];
  assert.equal(v.status, 'aktiv');
  assert.equal(v.kollektion, 'vinylboden-1');
  // Paketpreis ist kein Preis je m²: nie per Shopify-Preisfilter.
  assert.equal(v.budget_preis, 'rechnen');
  assert.deepEqual(L.preisStufen(v.preis_stufen), [25, 35, 45, 60]);
  assert.equal(v.optik_filter, 'filter.p.m.custom.optik');
  assert.equal(v.raum_filter, 'filter.p.m.custom.arten');
  // Teppichboden bleibt beim Shopify-Preisfilter.
  finder.forEach(([, s]) => assert.notEqual(s.blocks.art_teppichboden.settings.budget_preis, 'rechnen'));
  // Der Preisfilter der Vinyl-Kategorie bleibt ausgeblendet.
  assert.match(lesen('blocks/filters.liquid'), /tp_preisfilter_aus = '[^']*\bvinylboden-1\b/);
});

test('Ansichten des Finders: Preise je m² in eigener Ansicht, Treffer-Seitengroesse bekannt', () => {
  const preise = template('templates/collection.boden-finder-preise.json');
  assert.equal(preise.layout, false);
  assert.equal(preise.sections.daten.settings.preise, true);
  const treffer = template('templates/collection.boden-finder-treffer.json');
  assert.equal(treffer.sections.daten.settings.treffer, true);
  const daten = lesen('sections/tp-boden-finder-daten.liquid');
  assert.match(daten, /"pro_seite": \{\{ bf_max \| json \}\}/);
  assert.match(daten, /"qm_paket":/);
  // Preis je m² wie snippets/price.liquid: Paketpreis / qm_pro_paket, gerundet.
  assert.match(daten, /divided_by: bf_qm \| round/);
  assert.match(lesen('snippets/price.liquid'), /divided_by: sqm_per_package \| round/);
});
