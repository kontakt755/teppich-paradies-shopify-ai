import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';

const ORDER = 'test-packhilfe-auftrag';
const position = (id, breite) => ({ id, title: 'Synthetischer Teppich', quantity: breite * 170 / 100, currentQuantity: breite * 170 / 100,
  unfulfilledQuantity: breite * 170 / 100, customAttributes: [{ key: 'Maße', value: `${breite} × 170 cm` }, { key: 'Form', value: 'Rechteck' }, { key: 'Einfassung', value: 'Gekettelt' }],
  variant: { id: `variante-${id}`, title: 'Testfarbe', metafields: { nodes: [] }, product: { id: `produkt-${id}`, handle: `testteppich-${id}`, title: 'Synthetischer Teppich',
    metafields: { nodes: [{ namespace: 'custom', key: 'preis_pro_001_qm', value: 'true' }] } } } });

function umgebung(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-packhilfe-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  const raw = { orders: [{ id: ORDER, name: '#TEST', createdAt: '2026-10-20T12:00:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
    customAttributes: [{ key: 'Maße', value: '999 × 999 cm' }], lineItems: { nodes: [position('a', 120), position('b', 80)] } }] };
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify(raw));
  const verboten = () => assert.fail('GET-Packhilfe darf kein externes Fachsystem aufrufen');
  const api = createApi({ root: dir, privatDirPath: dir, gh: verboten, shopifyZugang: verboten, rebuild: verboten });
  const katalog = { produkte: [{ handle: 'testteppich-a', eigenschaften: { gesamtgewicht: '2,1 kg/m²', gesamtstaerke: '9 mm' } },
    { handle: 'testteppich-b', eigenschaften: { poleneinsatzgewicht: '700 g/m²', florhoehe: '6 mm' } }] };
  fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify(katalog));
  return { dir, api, raw, katalog };
}

test('bestehender GET liefert passende positionsbezogene Daten additiv und veraendert keine Ablage', t => {
  const u = umgebung(t);
  const datei = path.join(u.dir, 'bestelluebersicht', 'orders.json');
  const vorher = fs.readFileSync(datei, 'utf8');
  const r = u.api.einkaufKettelversand({ orderId: ORDER });
  assert.equal(r.positionen.length, 2);
  assert.equal(r.revision, 0);
  assert.deepEqual(r.pakete, []);
  assert.deepEqual(r.positionen.map(p => [p.packhilfe.breiteCm, p.packhilfe.laengeCm, p.packhilfe.menge]), [[120, 170, 1], [80, 170, 1]]);
  assert.equal(r.positionen[0].packhilfe.gewichtGm2, 2100);
  assert.equal(r.positionen[0].packhilfe.dickeMm, 9);
  assert.equal(r.positionen[1].packhilfe.gewichtGm2, null);
  assert.equal(r.positionen[1].packhilfe.dickeMm, null);
  assert.deepEqual(r.positionen[0].stand, {});
  assert.equal(fs.readFileSync(datei, 'utf8'), vorher);
  assert.deepEqual(fs.readdirSync(u.dir).sort(), ['bestelluebersicht', 'lexikon']);
});

test('fehlendes oder defektes Lexikon laesst Packweg und Bestellmasse bestehen, Materialwerte unbekannt', t => {
  const u = umgebung(t), datei = path.join(u.dir, 'lexikon', 'produkte.json');
  for (const text of [null, '{kaputt']) {
    if (text === null) fs.unlinkSync(datei); else fs.writeFileSync(datei, text);
    const r = u.api.einkaufKettelversand({ orderId: ORDER });
    assert.equal(r.positionen[0].packhilfe.breiteCm, 120);
    assert.equal(r.positionen[0].packhilfe.gewichtGm2, null);
    assert.equal(r.positionen[0].packhilfe.dickeMm, null);
    assert.equal(r.revision, 0);
  }
});

test('mehrdeutige Produktzuordnung uebernimmt keine Materialwerte des ersten Treffers', t => {
  const u = umgebung(t);
  u.katalog.produkte.push({ handle: 'testteppich-a', eigenschaften: { gesamtgewicht: '3000 g/m²', gesamtstaerke: '12 mm' } });
  fs.writeFileSync(path.join(u.dir, 'lexikon', 'produkte.json'), JSON.stringify(u.katalog));
  const p = u.api.einkaufKettelversand({ orderId: ORDER }).positionen[0].packhilfe;
  assert.equal(p.gewichtGm2, null);
  assert.equal(p.dickeMm, null);
  assert.equal(p.breiteCm, 120);
});
