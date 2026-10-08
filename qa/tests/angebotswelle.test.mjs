import assert from 'node:assert/strict';
import test from 'node:test';
import { aufNeunzig, ende, istRaummass, ladeExport, plane, planeVariante, sperrgrund } from '../../operations/scripts/angebotswelle.mjs';

const P = (o) => ({ id: 'gid://shopify/Product/1', handle: 'velours-x', productType: 'Teppichboden', status: 'ACTIVE', ...o });
const V = (o) => ({ id: 'gid://shopify/ProductVariant/1', title: '400 cm', sku: 'S1', price: '20.00', compareAtPrice: null, product: P(), ...o });
const opt = { prozent: 15, start: '2026-11-03', ende: '2026-11-16', typ: 'Teppichboden' };

test('regulaerer Preis wird Vergleichspreis, Aktionspreis gerundet', () => {
  assert.deepEqual(planeVariante(V(), 15), { price: '17.00', compareAtPrice: '20.00' });
  assert.deepEqual(planeVariante(V({ price: '49.95' }), 15), { price: '42.46', compareAtPrice: '49.95' });
});

test('Muster, Nullpreis und schon reduzierte Varianten bleiben unberuehrt', () => {
  assert.equal(planeVariante(V({ sku: 'M-1' }), 15).grund, 'Muster');
  assert.equal(planeVariante(V({ price: '0' }), 15).grund, 'Preis 0');
  assert.equal(planeVariante(V({ compareAtPrice: '25.00' }), 15).grund, 'schon reduziert');
});

test('30-Tage-Sperre nach der letzten Aktion (PAngV 11)', () => {
  assert.match(sperrgrund(P({ ende: '2026-11-01' }), '2026-11-20'), /frei ab 2026-12-02/);
  assert.equal(sperrgrund(P({ ende: '2026-11-01' }), '2026-12-02'), null);
  assert.equal(sperrgrund(P({ status: 'DRAFT' }), '2026-12-02'), 'nicht aktiv');
});

test('Plan liefert Setzen, Rueckstellen und Aktionsdaten passend zueinander', () => {
  const r = plane([V(), V({ id: 'v2', product: P({ productType: 'Klickvinyl' }) })], opt);
  assert.equal(r.csv.length, 1);
  assert.deepEqual(r.setzen.get(P().id), [{ id: V().id, price: '17.00', compareAtPrice: '20.00' }]);
  assert.deepEqual(r.zurueck.get(P().id), [{ id: V().id, price: '20.00', compareAtPrice: null }]);
  const felder = Object.fromEntries(r.metafelder[0].metafields.map((m) => [m.key, m.value]));
  assert.deepEqual(felder, { start: '2026-11-03', ende: '2026-11-16', klasse: 'aktion' });
});

test('Auswahl per Handle und Plausibilitaet der Eingaben', () => {
  assert.equal(plane([V()], { ...opt, typ: undefined, handles: ['anders'] }).csv.length, 0);
  assert.throws(() => plane([V()], { ...opt, prozent: 0 }), /prozent/);
  assert.throws(() => plane([V()], { ...opt, ende: '2026-11-01' }), /Ende/);
});

test('Ende stellt nur abgelaufene, noch reduzierte Produkte zurueck', () => {
  const ab = P({ ende: '2026-11-01', klasse: 'preisanker' });
  const r = ende([
    V({ price: '17.00', compareAtPrice: '20.00', product: ab }),
    V({ id: 'v2', price: '17.00', compareAtPrice: '20.00', product: P({ id: 'p2', ende: '2026-11-30' }) }),
    V({ id: 'v3', price: '20.00', compareAtPrice: null, product: ab }),
  ], { stichtag: '2026-11-02' });
  assert.deepEqual([...r.zurueck.values()].flat(), [{ id: V().id, price: '20.00', compareAtPrice: null }]);
  assert.equal(ende([V({ price: '17.00', compareAtPrice: '20.00', product: ab })], { stichtag: '2026-11-02', klasse: 'aktion' }).csv.length, 0);
});

test('Bulk-Export mit __parentId wird eingebettet', () => {
  const text = [
    JSON.stringify({ id: 'gid://shopify/Product/9', handle: 'h', status: 'ACTIVE', ende: { value: '2026-11-01' }, klasse: null }),
    JSON.stringify({ id: 'gid://shopify/ProductVariant/7', price: '1.00', __parentId: 'gid://shopify/Product/9' }),
  ].join('\n');
  const [v] = ladeExport(text);
  assert.equal(v.product.handle, 'h');
  assert.equal(v.product.ende, '2026-11-01');
});

// Raummass-Variante wie im Export vom 08.10.2026: Option "Breite" = "Wunschmaß"
const RM = (o) => V({ title: 'Sand Hell / Wunschmaß', selectedOptions: [{ name: 'Farbe', value: 'Sand Hell' }, { name: 'Breite', value: 'Wunschmaß' }], ...o });
const MW = (o) => V({ title: 'Sand Hell / 400 cm', selectedOptions: [{ name: 'Farbe', value: 'Sand Hell' }, { name: 'Breite', value: '400 cm' }], ...o });
const abgelaufen = P({ ende: '2026-10-18', klasse: 'preisanker' });
const zielpreise = (r) => Object.fromEntries([...r.zurueck.values()].flat().map((z) => [z.id, z]));

test('Raummass wird an Option Wunschmass erkannt, Titel nur ohne Optionen', () => {
  assert.equal(istRaummass(RM()), true);
  assert.equal(istRaummass(MW()), false);
  assert.equal(istRaummass({ title: 'Beige Mittel / Wunschmaß' }), true);
  assert.equal(istRaummass({ title: 'Beige Mittel / 500 cm' }), false);
  assert.equal(istRaummass({ title: 'Wunschmaßband', selectedOptions: [{ name: 'Farbe', value: 'Wunschmaßband' }] }), false);
});

test('aufNeunzig: naechstgelegener ,90-Betrag (Inhaber 2026-10-05)', () => {
  assert.equal(aufNeunzig(10400), 10390);
  assert.equal(aufNeunzig(5000), 4990);
  assert.equal(aufNeunzig(11490), 11490);
  assert.equal(aufNeunzig(11462), 11490);
  assert.equal(aufNeunzig(4395), 4390);
});

test('Ende: Meterware auf Vergleichspreis, Raummass voller Euro auf ,90 darunter', () => {
  const r = ende([
    MW({ id: 'mw', price: '32.90', compareAtPrice: '36.90', product: abgelaufen }),
    RM({ id: 'rm', price: '93.60', compareAtPrice: '104.00', product: abgelaufen }),
    RM({ id: 'rm2', price: '45.00', compareAtPrice: '50.00', product: abgelaufen }),
  ], { stichtag: '2026-10-19', klasse: 'preisanker' });
  const z = zielpreise(r);
  assert.deepEqual(z.mw, { id: 'mw', price: '36.90', compareAtPrice: null });
  assert.deepEqual(z.rm, { id: 'rm', price: '103.90', compareAtPrice: null });
  assert.deepEqual(z.rm2, { id: 'rm2', price: '49.90', compareAtPrice: null });
  assert.match(r.csv.find((c) => c.includes('Wunschmaß')), /;Raummaß;93\.60;104\.00;103\.90;2026-10-18$/);
});

test('Ende: Raummass, das schon auf ,90 endet, bleibt beim Vergleichspreis', () => {
  const r = ende([RM({ price: '97.90', compareAtPrice: '114.90', product: abgelaufen })], { stichtag: '2026-10-19' });
  assert.equal(zielpreise(r)[V().id].price, '114.90');
});

test('Ende: Muster und Produkte anderer Klasse bleiben aussen vor', () => {
  const r = ende([
    RM({ id: 'muster-sku', sku: 'M-TEPX_004', price: '0.50', compareAtPrice: '1.00', product: abgelaufen }),
    MW({ id: 'muster-handle', price: '0.50', compareAtPrice: '1.00', product: P({ id: 'pm', handle: 'muster-velours-x', ende: '2026-10-18', klasse: 'preisanker' }) }),
    RM({ id: 'normal', price: '45.00', compareAtPrice: '50.00', product: P({ id: 'pn', ende: '2026-10-18', klasse: 'normal' }) }),
    RM({ id: 'treffer', price: '45.00', compareAtPrice: '50.00', product: abgelaufen }),
  ], { stichtag: '2026-10-19', klasse: 'preisanker' });
  assert.deepEqual(Object.keys(zielpreise(r)), ['treffer']);
  assert.equal(r.csv.length, 1);
});

test('Plan: vorab berechnete Rueckstellung folgt derselben Raummass-Regel', () => {
  const r = plane([MW({ id: 'mw', price: '36.90' }), RM({ id: 'rm', price: '104.00' })], opt);
  const z = Object.fromEntries([...r.zurueck.values()].flat().map((x) => [x.id, x.price]));
  assert.deepEqual(z, { mw: '36.90', rm: '103.90' });
});

test('JSON-Array-Export mit getrennter Produktdatei (--produkte)', () => {
  const varianten = JSON.stringify([{ id: 'gid://shopify/ProductVariant/7', title: 'A / Wunschmaß', price: '45.00', compareAtPrice: '50.00', product: { id: 'gid://shopify/Product/9' } }]);
  const produkte = JSON.stringify([{ id: 'gid://shopify/Product/9', handle: 'h', status: 'ACTIVE', ende: { value: '2026-10-18' }, klasse: { value: 'preisanker' } }]);
  const [v] = ladeExport(varianten, produkte);
  assert.equal(v.product.handle, 'h');
  assert.equal(v.product.klasse, 'preisanker');
  assert.throws(() => ladeExport(varianten), /--produkte/);
});
