import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

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

test('Raummass in Metern, mit Einheit auch in cm', () => {
  assert.equal(L.raumMass('4'), 400);
  assert.equal(L.raumMass('4,5'), 450);
  assert.equal(L.raumMass('3.55 m'), 355);
  assert.equal(L.raumMass('450 cm'), 450);
  assert.equal(L.raumMass(''), null);
  assert.equal(L.raumMass('abc'), null);
  // 400 ohne Einheit waeren 400 m - das ist kein Raum.
  assert.equal(L.raumMass('400'), null);
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

test('Budget je m²: 500 EUR fuer 4 x 5 m = 25 EUR/m², auf Cent abgerundet', () => {
  assert.equal(L.proQm(500, 400, 500), 25);
  assert.equal(L.proQm(500, 350, 450), 31.74);
  assert.equal(L.proQm(null, 400, 500), null);
  assert.equal(L.proQm(500, null, 500), null);
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
  assert.deepEqual(n['bis 5 mm'], { name: 'Kurzflor', text: 'flach und ruhig', stufe: 1 });
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

test('Euro-Anzeige: ab 100 EUR ganze Euro', () => {
  assert.equal(L.euro(660), '660 €');
  assert.equal(L.euro(1234.4), '1.234 €');
  assert.equal(L.euro(25), '25 €');
  assert.equal(L.euro(24.9), '24,90 €');
});
