import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTeil, planeNeueRestrolle } from '../../operations/lib/restrolle-neu.mjs';

const locationId = 'gid://shopify/Location/1';
// Entspricht der bestehenden Rolle TPR0011 (Beispiel Eiger, 03.11.2026)
const rolle = (mehr = {}) => ({
  code: 'TPR0011', sumupId: 'x1', name: 'Eiger Elite 91 Beige', vendor: 'TeppichParadies', farbcode: '91',
  breiteCm: 400, gemesseneLaengeCm: 2000, florhoeheMm: 14, preisQm: 29.95, uvpQm: 49.95,
  uvpBeleg: 'Preisliste', foto: 'eiger.jpg', ...mehr,
});
const feld = (plan, owner, key) => plan.metafields.find(m => m.owner === owner && m.key === key);

test('Der Plan trifft den Aufbau einer bestehenden Restrolle', () => {
  const plan = planeNeueRestrolle(rolle(), { locationId });
  const je = Object.fromEntries(plan.products.map(p => [p.role, p]));
  assert.equal(je.quelle.input.handle, 'eiger-elite-91-beige-teppichboden-400-cm-restrolle');
  assert.equal(je.kettelteppich.input.handle, 'eiger-elite-91-beige-teppich-nach-mass');
  assert.equal(je.raummass.input.handle, 'restvorlage-tpr0011-raummass');
  assert.equal(plan.bestandQm, 80);
  const v = je.quelle.input.variants[0];
  assert.equal(v.price, '29.95');
  assert.equal(v.compareAtPrice, '49.95');
  assert.equal(v.inventoryQuantities[0].quantity, 80);
  assert.equal(v.unitPriceMeasurement.referenceUnit, 'M2');
  assert.equal(je.raummass.input.variants[0].price, '0.40');
  assert.equal(je.zuschnitt.input.variants.length, 40);
  assert.equal(feld(plan, 'tpr0011:quelle', 'max_roll_laenge_cm').value, '2000');
  assert.equal(feld(plan, 'tpr0011:raummass', 'max_breite_cm').value, '400');
  assert.equal(feld(plan, 'tpr0011:raummass', 'max_laenge_cm').value, '1000');
  assert.equal(feld(plan, 'tpr0011:quelle', 'florhohe').value, 'ca. 14 mm');
  assert.equal(feld(plan, 'tpr0011:quelle', 'florklasse').value, 'Hochflor');
  assert.equal(feld(plan, 'tpr0011:quelle', 'vergleich_ist_uvp').value, 'true');
});

test('Sichtbarkeit und Tags halten Flow und Rechner am Laufen', () => {
  const plan = planeNeueRestrolle(rolle(), { locationId });
  const je = Object.fromEntries(plan.products.map(p => [p.role, p]));
  assert.equal(je.quelle.zielStatus, 'ACTIVE');
  assert.equal(je.kettelteppich.zielStatus, 'ACTIVE');
  assert.equal(je.raummass.zielStatus, 'UNLISTED');
  assert.equal(je.zuschnitt.zielStatus, 'UNLISTED');
  assert.ok(plan.products.every(p => p.input.status === 'DRAFT'));
  for (const tag of ['teppich-nach-mass', 'sonderposten']) assert.ok(je.raummass.input.tags.includes(tag));
  assert.ok(plan.products.every(p => !p.input.tags.some(t => ['aufmass-fehlt', 'bilder-fehlen', 'freigabe-fehlt'].includes(t))));
  assert.deepEqual(feld(plan, 'tpr0011:kettelteppich', 'einfass_gruppe').targets, ['tpr0011:kettelteppich']);
  assert.deepEqual(feld(plan, 'tpr0011:quelle', 'einfass_gruppe').targets, ['tpr0011:raummass', 'tpr0011:kettelteppich']);
});

test('Bestand wird abgerundet, kleine Reste begrenzen die Laenge', () => {
  const plan = planeNeueRestrolle(rolle({ breiteCm: 500, gemesseneLaengeCm: 1125 }), { locationId });
  assert.equal(plan.bestandQm, 56);
  assert.equal(plan.maxLaengeCm, 1000);
  const klein = planeNeueRestrolle(rolle({ gemesseneLaengeCm: 400 }), { locationId });
  assert.equal(klein.bestandQm, 16);
  assert.equal(klein.maxLaengeCm, 400);
});

test('Ohne Beleg, Foto oder Messung entsteht kein Plan', () => {
  assert.throws(() => planeNeueRestrolle(rolle({ uvpBeleg: '' }), { locationId }), /Beleg/);
  assert.throws(() => planeNeueRestrolle(rolle({ uvpQm: 20 }), { locationId }), /ueber dem Verkaufspreis/);
  assert.throws(() => planeNeueRestrolle(rolle({ foto: '' }), { locationId }), /Foto/);
  assert.throws(() => planeNeueRestrolle(rolle({ gemesseneLaengeCm: 0 }), { locationId }), /Laenge/);
  assert.throws(() => planeNeueRestrolle(rolle({ florhoeheMm: null }), { locationId }), /Florhoehe/);
});

test('Ohne UVP bleibt die Rolle ohne Vergleichspreis', () => {
  const plan = planeNeueRestrolle(rolle({ uvpQm: null, uvpBeleg: null }), { locationId });
  assert.equal(plan.products[0].input.variants[0].compareAtPrice, undefined);
  assert.equal(feld(plan, 'tpr0011:quelle', 'vergleich_ist_uvp'), undefined);
});

test('Handle-Teil ohne Umlaute und Sonderzeichen', () => {
  assert.equal(handleTeil('Antigua 41 (1756)'), 'antigua-41-1756');
  assert.equal(handleTeil('Grün Größe'), 'gruen-groesse');
});

test('Restrolle 3 m: Bestand abgerundet, Laengengrenze passt zur groessten Zuschnittstufe', () => {
  const plan = planeNeueRestrolle(rolle({ code: 'TPR0301', breiteCm: 300, gemesseneLaengeCm: 345 }), { locationId });
  assert.equal(plan.bestandQm, 10);
  assert.equal(plan.maxLaengeCm, 333);
  const je = Object.fromEntries(plan.products.map(p => [p.role, p]));
  assert.equal(je.quelle.input.handle, 'eiger-elite-91-beige-teppichboden-300-cm-restrolle');
  assert.equal(je.quelle.input.variants[0].inventoryQuantities[0].quantity, 10);
  assert.equal(feld(plan, 'tpr0301:raummass', 'max_breite_cm').value, '300');
  // die Stufe mit genau dem Bestand deckt die Laengengrenze ab
  const stufe = plan.relationships.find(r => r.quantity === plan.bestandQm);
  assert.equal(stufe.title, `${plan.maxLaengeCm} cm`);
  const zwei = planeNeueRestrolle(rolle({ code: 'TPR0201', breiteCm: 200, gemesseneLaengeCm: 1580 }), { locationId });
  assert.equal(zwei.bestandQm, 31);
  assert.equal(zwei.maxLaengeCm, 1000);
  assert.equal(zwei.products.find(p => p.role === 'zuschnitt').input.variants.length, 20);
});
