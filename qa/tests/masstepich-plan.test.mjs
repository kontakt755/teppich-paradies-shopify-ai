import assert from 'node:assert/strict';
import test from 'node:test';
import { erstellePlan, hundertstelPreis } from '../../scripts/masstepich/plan.mjs';
import { pruefeDaten, pruefeTheme } from '../../scripts/masstepich/guard.mjs';
import { ladeLieferantenNamen, namenSet, woerter } from '../../scripts/masstepich/lib.mjs';

const namen = namenSet(['Lieferantx', 'Ab-Handel']);
// SKU ohne Unterstrich: sonst waere deren Endung die Farbnummer (wie im Theme).
const V = (id, options, price, extra = {}) => ({ id, title: options.join(' / '), sku: `SKU-${id}`, price, options, metafields: {}, ...extra });
const P = (id, title, options, variants, metafields = {}) => ({ id, title, handle: id.toLowerCase(), vendor: 'Eigenmarke', metafields, options, variants });

const snapshot = {
  products: [
    P('A', 'Callista Teppichboden', [{ name: 'Farbe', values: ['Rot', 'Blau'] }, { name: 'Breite', values: ['400 cm', '500cm'] }],
      [V('a1', ['Rot', '400 cm'], '84.90'), V('a2', ['Rot', '500cm'], '84.90'), V('a3', ['Blau', '400 cm'], '84.90'), V('a4', ['Blau', '500cm'], '90.00')]),
    P('B', 'Kontura Teppichboden', [{ name: 'Farbe', values: ['Grau'] }],
      [V('b1', ['Grau'], '30.00', { metafields: { 'custom.farbcode': '090' } })], { 'custom.rollenbreite': 4 }),
    P('C', 'Genau Teppichboden', [{ name: 'Farbe', values: ['Weiss'] }, { name: 'Breite', values: ['400 cm'] }],
      [V('c1', ['Weiss', '400 cm'], '0.50')], { 'custom.preis_pro_001_qm': true }),
    P('D', 'Fremd Teppichboden', [{ name: 'Farbe', values: ['Gelb'] }, { name: 'Breite', values: ['400 cm'] }], [V('d1', ['Gelb', '400 cm'], '20.00')]),
    P('E', 'Akkord Teppichboden', [{ name: 'Farbe', values: ['Beige'] }, { name: 'Breite', values: ['400 cm'] }], [V('e1', ['Beige', '400 cm'], '20.00')]),
    P('F', 'Lieferantx Teppichboden', [{ name: 'Farbe', values: ['Rot'] }, { name: 'Breite', values: ['400 cm'] }], [V('f1', ['Rot', '400 cm'], '20.00')]),
    // G: Blau gibt es nur 400 cm breit, Rot auch 500 cm
    P('G', 'Nordica Teppichboden', [{ name: 'Farbe', values: ['Rot', 'Blau'] }, { name: 'Breite', values: ['400 cm', '500 cm'] }],
      [V('g1', ['Rot', '400 cm'], '50.00'), V('g2', ['Rot', '500 cm'], '50.00'), V('g3', ['Blau', '400 cm'], '50.00')]),
    // H: neue Farbe Gruen nach der Freigabe; Weiss hat eine Wunschmass-Variante mit Handwert
    P('H', 'Woolara Teppichboden', [{ name: 'Farbe', values: ['Weiss', 'Gruen', 'Grau'] }, { name: 'Breite', values: ['400 cm', 'Wunschmaß'] }],
      [V('h1', ['Weiss', '400 cm'], '40.00'), V('h2', ['Weiss', 'Wunschmaß'], '54.00', { metafields: { 'service.raummass': 'Nicht verfügbar' } }),
        V('h3', ['Gruen', '400 cm'], '40.00'), V('h4', ['Grau', '400 cm'], '40.00')]),
  ],
};
const alleVarianten = (id) => snapshot.products.find((p) => p.id === id).variants.map((v) => v.id);
const konfig = {
  prozent: 35, max_laenge_cm: 1000, gesperrte_ids: ['E'], preise: { ketteln: 129, cover: 129.9 }, lieferantennamen: ['Lieferantx'],
  freigabe: [
    ...['A', 'B', 'C', 'E', 'F', 'G'].map((id) => ({ id, varianten: alleVarianten(id) })),
    { id: 'H', varianten: ['h1', 'h2', 'h4'] },
    { id: 'Z', varianten: ['z1'] },
  ],
};
const plan = erstellePlan(snapshot, konfig, namen);
const grund = (id) => plan.konflikte.filter((k) => k.produktId === id).map((k) => `${k.farbe || ''}: ${k.grund}`).join(' | ');

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
  assert.equal(b.rolleCm, 400);
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
  assert.equal(a[0].varianten.length, 1, 'Blau hat Konflikt und fehlt');
  assert.equal(hundertstelPreis(129), 0.0129 * 100);
  assert.equal(hundertstelPreis(129.9), null);
});

test('E: Rollenbreite je Farbe - Raummass je Farbe, Einfassprodukte bei verschiedenen Rollen gestoppt', () => {
  const g = plan.wunschmass_anlegen.filter((x) => x.produktId === 'G');
  assert.deepEqual(g.map((x) => [x.farbe, x.rolleCm]), [['Rot', 500], ['Blau', 400]]);
  assert.equal(plan.einfassprodukte.some((x) => x.basisProduktId === 'G'), false);
  assert.match(grund('G'), /verschieden breiten Rollen \(400 \/ 500 cm\)/);
});

test('F: Freigabe je Variante - neue Farbe nicht mitgenommen, Handwert an Wunschmass geht vor', () => {
  assert.match(grund('H'), /Gruen: 1 Variante\(n\) nicht in der Freigabeliste/);
  assert.match(grund('H'), /Weiss: von Hand auf "Nicht verfügbar" gesetzt/);
  const h = plan.einfassen_setzen.filter((x) => x.produktId === 'H').map((x) => x.variantId);
  assert.deepEqual(h, ['h4'], 'nur die freigegebene, unberuehrte Farbe Grau');
  assert.deepEqual(plan.wunschmass_anlegen.filter((x) => x.produktId === 'H').map((x) => x.farbe), ['Grau']);
  const ohneListe = erstellePlan(snapshot, { ...konfig, freigabe: [{ id: 'A' }] }, namen);
  assert.match(ohneListe.konflikte[0].grund, /ohne Variantenliste/);
  assert.equal(ohneListe.einfassen_setzen.length, 0);
});

test('G: Guard - Tippfehler, Variante ohne Freigabe, falscher Raummass-Preis, Lieferantenname', () => {
  const snap = JSON.parse(JSON.stringify(snapshot));
  const a = snap.products[0];
  a.options[1].values.push('Wunschmaß');
  a.variants.push(V('a5', ['Rot', 'Wunschmaß'], '114.62', { metafields: { 'service.raummass': 'Verfügbar', 'service.einfassen': 'Verfügbar' } }));
  a.variants[0].metafields['service.einfassen'] = 'Verfügbar';
  assert.deepEqual(pruefeDaten(snap, konfig, namen).filter((f) => f.startsWith('Callista')), []);
  a.variants[4].price = '110.00';
  a.variants[1].metafields['service.einfassen'] = 'Verfugbar';
  a.variants[0].metafields['service.raummass'] = 'Verfügbar';
  snap.products[3].variants[0].metafields['service.einfassen'] = 'Verfügbar';
  snap.products[4].variants[0].metafields['service.einfassen'] = 'Verfügbar';
  snap.products[5].variants[0].metafields['service.raummass'] = 'Verfügbar';
  snap.products[7].variants[2].metafields['service.einfassen'] = 'Verfügbar';
  const f = pruefeDaten(snap, konfig, namen).join('\n');
  assert.match(f, /Raummass-Preis 110.00 statt 114.62/);
  assert.match(f, /"Verfugbar" ist kein bekannter Wert/);
  assert.match(f, /Callista Teppichboden \/ Rot \/ 400 cm: service.raummass gehört nur an Wunschmaß-Varianten/);
  assert.match(f, /Fremd Teppichboden.*ohne Freigabe dieser Variante/);
  assert.match(f, /Woolara Teppichboden \/ Gruen \/ 400 cm: service.einfassen = Verfügbar ohne Freigabe dieser Variante/);
  assert.match(f, /gesperrter Lieferant mit service.einfassen/);
  assert.match(f, /Lieferantx Teppichboden: Lieferantenname/);
});

test('H: Namen kommen aus einer Liste, auch mit Bindestrich, nie als Teilwort', () => {
  assert.ok(woerter('Lieferantx-Design 555').some((w) => namen.has(w)));
  assert.ok(woerter('ABC_lieferantx').some((w) => namen.has(w)));
  assert.ok(woerter('abhandel').some((w) => namen.has(w)));
  assert.ok(!woerter('lieferantxy').some((w) => namen.has(w)));
  const alt = process.env.TP_LIEFERANTEN_NAMEN;
  process.env.TP_LIEFERANTEN_NAMEN = 'Testname';
  try { assert.ok(ladeLieferantenNamen('/gibt/es/nicht').has('testname')); } finally {
    if (alt === undefined) delete process.env.TP_LIEFERANTEN_NAMEN; else process.env.TP_LIEFERANTEN_NAMEN = alt;
  }
});

test('I: ausgeliefertes Theme ohne Lieferantennamen und ohne einkauf.*', () => {
  assert.deepEqual(pruefeTheme(), []);
});
