import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';

export function testDaten(dir) {
  const jetzt = new Date();
  const schreibe = (relativ, wert) => { const f = path.join(dir, relativ); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(wert), { mode: 0o600 }); };
  const mf = (key, value) => ({ namespace: 'einkauf', key, value });
  const orderId = 'gid://shopify/Order/90001', lineItemId = 'gid://shopify/LineItem/90001';
  const produkt = { id: 'gid://shopify/Product/700', handle: 'testteppich', title: 'Testteppich', metafields: { nodes: [] } };
  const q = { id: 'gid://shopify/ProductVariant/777', sku: 'TEST-1', title: 'Grau', metafields: { nodes: [mf('lieferant', 'A'), mf('artikelnummer', 'TEST-1'), mf('farbnummer', '050')] }, product: produkt };
  schreibe('bestelluebersicht/orders.json', { orders: [{ id: orderId, name: '#T90001', createdAt: jetzt.toISOString(), cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', tags: [], customAttributes: [],
    customer: { id: 'gid://shopify/Customer/90001', displayName: 'Testkunde Automatik', email: 'kunde@example.invalid' },
    shippingAddress: { name: 'Testkunde Automatik', address1: 'Testweg 1', zip: '00000', city: 'Teststadt', country: 'Deutschland' },
    totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } },
    lineItems: { nodes: [{ id: lineItemId, sku: 'M-TEST-1', title: 'Kostenloses Muster', quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1, customAttributes: [{ key: '_Quellvariante_ID', value: '777' }, { key: 'Produkt', value: 'Testteppich' }, { key: 'Farbe', value: 'Grau' }], originalUnitPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } }, variant: { id: 'gid://shopify/ProductVariant/778', sku: 'M-TEST-1', title: 'Grau', metafields: { nodes: [] }, product: { ...produkt, handle: 'muster-testteppich' } } }] }
  }], quellvarianten: [q] });
  schreibe('lexikon/produkte.json', { produkte: [{ handle: 'testteppich', titel: 'Testteppich', produktgruppe: 'Teppichboden', varianten: [] }] });
  schreibe('lieferanten/stammdaten.json', { absender: { firma: 'Testfirma' }, lieferanten: { A: { kundennummer: 'TEST', muster: { weg: 'mail', mail: 'muster@lieferant-a.example', lieferung: 'laden' } } } });
  schreibe('muster-bestellung/konfiguration.json', { aktiv: true, ab: new Date(jetzt.getTime() - 1000).toISOString(), lieferanten: { A: { kostenlos: true, empfaenger: 'muster@lieferant-a.example', lieferziel: 'laden', produktgruppen: ['Teppichboden'] } } });
  schreibe('nachfassen/postfach.json', { host: 'mail.example.invalid', port: 465, benutzer: 'buero@example.invalid', absender: 'buero@example.invalid', passwort: 'synthetisch' });
  return { orderId, lineItemId };
}

test('Echter API-Pfad: aus Shopify-Export Muster bestellen und ohne Handarbeit je Kunde anzeigen', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-muster-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { orderId } = testDaten(dir);
  const api = createApi({ root: dir, privatDirPath: dir, gh: async () => '' });
  let anzahl = 0;
  assert.equal((await api.musterBestellungenAutomatisch({ probe: true })).geplant, 1);
  const r = await api.musterBestellungenAutomatisch({ senden: async (_, mail) => { anzahl++; assert.match(mail.text, /TEST-1/); assert.match(mail.text, /050/); return {}; } });
  assert.equal(r.verschickt, 1);
  const liste = api.kundenBestellungen();
  assert.equal(liste.musterAutomatik.aktiv, true);
  const z = liste.zeilen.find(z => z.orderId === orderId);
  assert.equal(z.kundenname, 'Testkunde Automatik');
  assert.equal(z.musterAutomatik.bestellt[0].positionen[0].farbe, 'Grau');
  assert.equal(z.musterAutomatik.geplant, 0);
  await api.musterBestellungenAutomatisch({ senden: async () => anzahl++ });
  assert.equal(anzahl, 1);
});
