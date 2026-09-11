import assert from 'node:assert/strict';
import test from 'node:test';
import { erstellePlan, hundertstelPreis } from '../../scripts/masstepich/plan.mjs';
import { pruefeDaten, pruefeTheme } from '../../scripts/masstepich/guard.mjs';
import { wortHash, woerter } from '../../scripts/masstepich/lib.mjs';

const TESTNAME = 'lieferantx';
const hashes = new Set([wortHash(TESTNAME)]);
// SKU ohne Unterstrich: sonst waere deren Endung die Farbnummer (wie im Theme).
const V = (id, options, price, extra = {}) => ({ id, title: options.join(' / '), sku: `SKU-${id}`, price, options, metafields: {}, ...extra });

const snapshot = {
  products: [
    { id: 'A', title: 'Callista Teppichboden', handle: 'callista', vendor: 'Eigenmarke', metafields: {},
      options: [{ name: 'Farbe', values: ['Rot', 'Blau'] }, { name: 'Breite', values: ['400 cm', '500cm'] }],
      variants: [V('a1', ['Rot', '400 cm'], '84.90'), V('a2', ['Rot', '500cm'], '84.90'), V('a3', ['Blau', '400 cm'], '84.90'), V('a4', ['Blau', '500cm'], '90.00')] },
    { id: 'B', title: 'Kontura Teppichboden', handle: 'kontura', vendor: 'Eigenmarke', metafields: { 'custom.rollenbreite': 4 },
      options: [{ name: 'Farbe', values: ['Grau'] }], variants: [V('b1', ['Grau'], '30.00', { metafields: { 'custom.farbcode': '090' } })] },
    { id: 'C', title: 'Genau Teppichboden', handle: 'genau', vendor: 'Eigenmarke', metafields: { 'custom.preis_pro_001_qm': true },
      options: [{ name: 'Farbe', values: ['Weiss'] }, { name: 'Breite', values: ['400 cm'] }], variants: [V('c1', ['Weiss', '400 cm'], '0.50')] },
    { id: 'D', title: 'Fremd Teppichboden', handle: 'fremd', vendor: 'Eigenmarke', metafields: {},
      options: [{ name: 'Farbe', values: ['Gelb'] }, { name: 'Breite', values: ['400 cm'] }], variants: [V('d1', ['Gelb', '400 cm'], '20.00')] },
    { id: 'E', title: 'Akkord Teppichboden', handle: 'akkord', vendor: 'Eigenmarke', metafields: {},
      options: [{ name: 'Farbe', values: ['Beige'] }, { name: 'Breite', values: ['400 cm'] }], variants: [V('e1', ['Beige', '400 cm'], '20.00')] },
    { id: 'F', title: 'Lieferantx Teppichboden', handle: 'x', vendor: 'Eigenmarke', metafields: {},
      options: [{ name: 'Farbe', values: ['Rot'] }, { name: 'Breite', values: ['400 cm'] }], variants: [V('f1', ['Rot', '400 cm'], '20.00')] },
  ],
};
const konfig = { prozent: 35, max_laenge_cm: 1000, freigabe: ['A', 'B', 'C', 'E', 'F', 'Z'].map((id) => ({ id })), gesperrte_ids: ['E'], preise: { ketteln: 129, cover: 129.9 } };
const plan = erstellePlan(snapshot, konfig, hashes);
const grund = (id) => plan.konflikte.filter((k) => k.produktId === id).map((k) => k.grund).join(' | ');

test('A: Raummass nur fuer eindeutige Farben, Preis +35 %, eigene SKU', () => {
  const a = plan.wunschmass_anlegen.filter((x) => x.produktId === 'A');
  assert.equal(a.length, 1);
  assert.deepEqual(a[0].optionValues, ['Rot', 'Wunschmaß']);
  assert.equal(a[0].price, '114.62');
  assert.equal(a[0].sku, 'TP-RM-CALLISTA-ROT');
  assert.match(grund('A'), /nicht eindeutig/);
  assert.deepEqual(plan.einfassen_setzen.filter((x) => x.produktId === 'A').map((x) => x.variantId), ['a1', 'a2']);
});

test('B: ohne Breitenoption wird "400 cm" ergaenzt und Wunschmass hinten angehaengt', () => {
  assert.deepEqual(plan.breitenoption.map((x) => [x.produktId, x.wert]), [['B', '400 cm']]);
  const b = plan.wunschmass_anlegen.find((x) => x.produktId === 'B');
  assert.deepEqual(b.optionValues, ['Grau', 'Wunschmaß']);
  assert.equal(b.sku, 'TP-RM-KONTURA-090');
  assert.equal(b.kopiere_metafelder_von, 'b1');
  assert.equal(b.metafields['custom.farbcode'], undefined, 'nie aus Snapshot geraten');
});

test('C: Konflikte stoppen - cm-genau, gesperrter Lieferant, Lieferantenname, fehlend; Fremdprodukt unberuehrt', () => {
  assert.match(grund('C'), /0,01 m²/);
  assert.match(grund('E'), /gesperrten Lieferanten/);
  assert.match(grund('F'), /Lieferantenname/);
  assert.match(grund('Z'), /nicht im Snapshot/);
  for (const id of ['C', 'D', 'E', 'F']) {
    assert.equal(plan.wunschmass_anlegen.some((x) => x.produktId === id), false, id);
    assert.equal(plan.einfassen_setzen.some((x) => x.produktId === id), false, id);
    assert.equal(plan.einfassprodukte.some((x) => x.basisProduktId === id), false, id);
  }
});

test('D: vier Einfassprodukte je Meterware, Cover 10 cm schmaler, Preise nur in vollen Euro', () => {
  const a = plan.einfassprodukte.filter((x) => x.basisProduktId === 'A');
  assert.deepEqual(a.map((x) => x.art), ['cover', 'ketteln', 'einfassband', 'paspelband']);
  assert.deepEqual(a.map((x) => x.metafields['service.max_breite_cm']), [490, 500, 500, 500]);
  assert.equal(a[1].titel, 'Callista Kettelteppich nach Maß');
  assert.equal(a[1].handle, 'callista-kettelteppich-nach-mass');
  assert.equal(a[1].plan_status, 'bereit');
  assert.equal(a[1].varianten[0].price, '1.29');
  assert.equal(a[1].varianten[0].metafields['service.basisvariante'], 'a2', 'breiteste Rolle');
  assert.equal(a[0].plan_status, 'wartet_auf_preis');
  assert.match(grund('A'), /nur volle Euro/);
  assert.equal(a[2].plan_status, 'wartet_auf_preis');
  assert.equal(a[0].varianten.length, 1, 'Blau hat Konflikt und fehlt');
  assert.equal(hundertstelPreis(129), 0.0129 * 100);
  assert.equal(hundertstelPreis(129.9), null);
});

test('E: Guard - Tippfehler, fehlende Freigabe, falscher Raummass-Preis, Lieferantenname', () => {
  const snap = JSON.parse(JSON.stringify(snapshot));
  const a = snap.products[0];
  a.options[1].values.push('Wunschmaß');
  a.variants.push(V('a5', ['Rot', 'Wunschmaß'], '114.62', { metafields: { 'service.raummass': 'Verfügbar' } }));
  assert.deepEqual(pruefeDaten(snap, konfig, hashes).filter((f) => f.startsWith('Callista')), []);
  a.variants[4].price = '110.00';
  a.variants[0].metafields['service.einfassen'] = 'Verfugbar';
  snap.products[3].variants[0].metafields['service.einfassen'] = 'Verfügbar';
  snap.products[4].variants[0].metafields['service.einfassen'] = 'Verfügbar';
  snap.products[5].variants[0].metafields['service.raummass'] = 'Verfügbar';
  const f = pruefeDaten(snap, konfig, hashes).join('\n');
  assert.match(f, /Raummass-Preis 110.00 statt 114.62/);
  assert.match(f, /"Verfugbar" ist kein bekannter Wert/);
  assert.match(f, /Fremd Teppichboden.*ohne Freigabe/);
  assert.match(f, /gesperrter Lieferant mit service.einfassen/);
  assert.match(f, /Lieferantx Teppichboden: Lieferantenname/);
});

test('F: Wortzerlegung findet Namen auch in Bindestrich- und Unterstrich-Woertern', () => {
  assert.ok(woerter('Lieferantx-Design 555').includes(TESTNAME));
  assert.ok(woerter('ABC_lieferantx').includes(TESTNAME));
  assert.ok(!woerter('lieferantxy').includes(TESTNAME));
});

test('G: ausgeliefertes Theme ohne Lieferantennamen und ohne einkauf.*', () => {
  assert.deepEqual(pruefeTheme(), []);
});
