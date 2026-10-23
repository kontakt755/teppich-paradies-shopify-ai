import test from 'node:test';
import assert from 'node:assert/strict';
import { packhilfeDaten } from '../lib/packhilfe-daten.mjs';

const position = { bestellmenge: { menge: 1, einheit: 'stueck' }, ausfuehrung: ['Fertigmaß: 120 × 170 cm (Rechteck)', 'Einfassung: Gekettelt'] };
const roh = (masse, form = 'Rechteck', extra = {}) => ({ quantity: 204, currentQuantity: 204,
  customAttributes: Object.entries({ 'Maße': masse, Form: form, ...extra }).map(([key, value]) => ({ key, value })) });
const daten = (rohPosition, eigenschaften = {}, p = position) => packhilfeDaten({ position: p, rohPosition, produkt: { eigenschaften } });

test('belegte Fertigmasse und ganze Teppichanzahl statt Shopify-Hundertstelquadratmeter', () => {
  const d = daten(roh('120 × 170 cm'), { gesamtgewicht: '2,1 kg/m²', gesamtstaerke: '9,5 mm' });
  assert.deepEqual({ ...d, quellen: undefined }, { breiteCm: 120, laengeCm: 170, form: 'rechteck', menge: 1,
    gewichtGm2: 2100, dickeMm: 9.5, quellen: undefined });
  assert.match(d.quellen.masse, /Bestellposition/);
  assert.match(d.quellen.gewicht, /Gesamtgewicht/);
  assert.match(d.quellen.dicke, /Gesamtdicke/);
});

test('Masshilfe konvertiert ausschliesslich explizite cm/mm/m und erkennt Rund/Oval', () => {
  const rund = daten(roh('Ø 1,6 m', 'Rund'));
  assert.deepEqual([rund.breiteCm, rund.laengeCm, rund.form], [160, 160, 'rund']);
  const oval = daten(roh('800 mm x 1,7 m', 'Oval'));
  assert.deepEqual([oval.breiteCm, oval.laengeCm, oval.form], [80, 170, 'oval']);
  const rechteck = daten(roh('1,2 × 1,7 m'));
  assert.deepEqual([rechteck.breiteCm, rechteck.laengeCm], [120, 170]);
});

test('unbelegte Einheiten, ungueltige Masse und widerspruechliche Kreisform werden nicht geraten', () => {
  for (const [mass, form] of [['120 × 170', 'Rechteck'], ['120 × 170 Zoll', 'Rechteck'], ['0 × 170 cm', 'Rechteck'],
    ['-120 × 170 cm', 'Rechteck'], ['120 × 170 cm', 'Rund'], ['Ø 170 cm', 'Oval'], ['ca. 120 × 170 cm', 'Rechteck']]) {
    const d = daten(roh(mass, form));
    assert.equal(d.breiteCm, null);
    assert.equal(d.laengeCm, null);
    assert.equal(d.quellen.masse, null, 'defekte Quellwerte nicht durch alte Anzeige ersetzen');
  }
});

test('Massangabe allein erfindet keine Rechteckform; alte eindeutige Auftragsanzeige bleibt nutzbar', () => {
  assert.equal(daten(roh('120 × 170 cm', '')).form, null);
  const d = packhilfeDaten({ position });
  assert.equal(d.breiteCm, 120);
  assert.equal(d.laengeCm, 170);
  assert.equal(d.form, 'rechteck');
  assert.match(d.quellen.masse, /Auftragsposition/);
  const unklar = packhilfeDaten({ position: { ...position, ausfuehrung: [...position.ausfuehrung, 'Fertigmaß: 80 × 100 cm (Rechteck)'] } });
  assert.equal(unklar.breiteCm, null);
});

test('Stueckzahl braucht eigene Belege und wird bei Widerspruch oder Bruchteilen unbekannt', () => {
  assert.equal(daten(roh('120 × 170 cm'), {}, { bestellmenge: { menge: 204, einheit: 'm2' } }).menge, null);
  assert.equal(daten(roh('120 × 170 cm', 'Rechteck', { Anzahl: '2 Stück' }), {}, { bestellmenge: { menge: 2, einheit: 'stueck' } }).menge, 2);
  assert.equal(daten(roh('120 × 170 cm', 'Rechteck', { Anzahl: '2 Stück' })).menge, null);
  for (const m of [0, -1, 1.5, Infinity, null]) assert.equal(daten(null, {}, { bestellmenge: { menge: m, einheit: 'stueck' } }).menge, null);
});

test('Polgewicht und Florhoehe sind keine Material-Gesamtwerte', () => {
  const d = daten(roh('120 × 170 cm'), { poleneinsatzgewicht: '700 g/m²', polgewicht: '800 g/m²', florhoehe: '8 mm' });
  assert.equal(d.gewichtGm2, null);
  assert.equal(d.dickeMm, null);
  assert.equal(d.quellen.gewicht, null);
  assert.equal(d.quellen.dicke, null);
});

test('Materialeinheiten sind streng: Gewicht ohne Flaechenbezug oder nackte Zahlen bleiben unbekannt', () => {
  for (const gesamtgewicht of ['2100', 2100, '2.1 kg', '2100 g', '2100 mg/m²', '0 g/m²', '2-3 kg/m²', 'ca. 2 kg/m²']) {
    assert.equal(daten(null, { gesamtgewicht }).gewichtGm2, null);
  }
  for (const gesamtstaerke of ['9.5', 9.5, '8-10 mm', '0 mm', '5 cm Florhöhe', '9 in']) {
    assert.equal(daten(null, { gesamtstaerke }).dickeMm, null);
  }
});

test('Gesamtwerte unterstuetzen g/kg pro Quadratmeter und belegte Dickenumrechnung', () => {
  for (const [gesamtgewicht, erwartung] of [['2100 g/m2', 2100], ['2,1 kg / m²', 2100], [{ value: 2.1, unit: 'kg/m²' }, 2100]]) {
    assert.equal(daten(null, { gesamtgewicht }).gewichtGm2, erwartung);
  }
  assert.equal(daten(null, { gesamtstaerke: '0,95 cm' }).dickeMm, 9.5);
});

test('mehrere widerspruechliche Gesamtwerte bleiben offen; identische Werte sind ein Beleg', () => {
  assert.equal(daten(null, { gesamtgewicht: ['2100 g/m²', '2200 g/m²'] }).gewichtGm2, null);
  assert.equal(daten(null, { gesamtgewicht: ['2100 g/m²', '2100 g/m²'] }).gewichtGm2, 2100);
  assert.equal(daten(null, { gesamtgewicht: '2100 g/m²', Gesamtgewicht: '2200 g/m²' }).gewichtGm2, null);
  assert.equal(daten(null, { gesamtstaerke: '9 mm', Gesamtdicke: '10 mm' }).dickeMm, null);
});

test('fehlende Daten sind null; Ableitung schreibt keine Eingabedaten um', () => {
  assert.deepEqual(packhilfeDaten(), { breiteCm: null, laengeCm: null, form: null, menge: null,
    gewichtGm2: null, dickeMm: null, quellen: { masse: null, gewicht: null, dicke: null } });
  const input = { position, rohPosition: roh('120 × 170 cm'), produkt: { eigenschaften: { gesamtgewicht: '2100 g/m²' } } };
  const vorher = JSON.stringify(input);
  packhilfeDaten(input);
  assert.equal(JSON.stringify(input), vorher);
});
