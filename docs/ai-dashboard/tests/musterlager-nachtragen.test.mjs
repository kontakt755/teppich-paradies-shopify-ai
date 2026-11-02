// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { lagerKorrektur, lagerNochDa } from '../lib/musterlager-bestand.mjs';

// Nur synthetische Daten: erfundene Kunden, ausgedachte SKUs, Pseudonym-Lieferanten.
const muster = (li, sku, farbe) => ({
  id: `gid://shopify/LineItem/${li}`, sku, title: 'Muster Testteppich', variantTitle: farbe, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/9${li}`, sku, title: farbe, metafields: { nodes: [] }, lieferant: { nodes: [] },
    product: { id: 'gid://shopify/Product/9', handle: 'muster-testteppich', title: 'Muster Testteppich', productType: 'Musterservice', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const bestellung = (nr, zeilen, datum) => ({
  id: `gid://shopify/Order/${nr}`, name: `#T${nr}`, createdAt: datum, cancelledAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: `gid://shopify/Customer/${nr}`, displayName: `Testkunde ${nr}`, email: `testkunde${nr}@example.invalid`, phone: null },
  totalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: zeilen },
});
const MONA = { name: 'Mona Mitarbeiter', kuerzel: 'mona', rolle: 'mitarbeiter' };
const HANDLE = 'testteppich-teppichboden-400cm-500cm';

function umgebung() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lager-nachtragen-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [
    bestellung(1, [muster(11, 'M-TESTTEP4_101', 'Grau')], '2026-01-01T10:00:00Z'),
    bestellung(2, [muster(21, 'M-TESTTEP4_101', 'Grau')], '2026-01-03T10:00:00Z'),
  ] }));
  fs.mkdirSync(path.join(dir, 'lexikon'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify({ erstellt: '2026-01-01T00:00:00Z', produkte: [
    { handle: 'muster-testteppich', titel: 'Muster Testteppich', produktgruppe: 'Musterservice',
      varianten: [{ farbe: 'Grau', sku: 'M-TESTTEP4_101', einkauf: { lieferant: 'B' } }, { farbe: 'Blau', sku: 'M-TESTTEP4_102' }, { farbe: 'Rot', sku: 'M-TESTTEP4_103' }, { farbe: 'Gelb', sku: 'M-TESTTEP4_104', einkauf: { lieferant: 'UNGEKLAERT' } }] },
    { handle: HANDLE, titel: 'Testteppich Teppichboden 400cm 500cm', produktgruppe: 'Teppichboden',
      muster: { vorhanden: true, handle: 'muster-testteppich' },
      varianten: [{ farbe: 'Grau', sku: 'TESTTEP4_101', einkauf: { lieferant: 'A' } }, { farbe: 'Blau', sku: 'TESTTEP4_102', einkauf: { lieferant: 'Lieferant E' } }, { farbe: 'Rot', sku: 'TESTTEP4_103', einkauf: { lieferant: 'F' } }, { farbe: 'Gelb', sku: 'TESTTEP4_104', einkauf: {} }] },
  ] }));
  fs.mkdirSync(path.join(dir, 'lieferanten'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lieferanten', 'stammdaten.json'), JSON.stringify({ lieferanten: { A: { anzeigename: 'Beispiel GmbH' } } }));
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => new Date('2026-01-05T10:00:00Z') });
  return { api };
}

const eintragNach = (api, id) => api.einkaufMusterlager().eintraege.find(e => e.id === id);

test('Noch da setzen mit Verschicktem und Reserviertem: Bestand stimmt danach, Bestellung bleibt gedeckt', async () => {
  const { api } = umgebung();
  const r = await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: HANDLE, farben: ['Grau'], art: 'einzel', anzahl: 4, ort: 'Büro' }, MONA);
  const id = r.eintraege[0].id;
  // Beide Bestellungen sind aus dem Lager reserviert; die aeltere geht raus.
  assert.deepEqual(eintragNach(api, id).stand, { verbraucht: 0, reserviert: 2, rest: 2, reichtNoch: null, jeStueck: null });
  await api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: 'gid://shopify/Order/1', schritt: 'kunde_hat_muster' }, MONA);
  let e = eintragNach(api, id);
  assert.deepEqual([e.anzahl, e.stand.verbraucht, e.stand.reserviert, e.stand.rest], [4, 1, 1, 2]);
  assert.equal(lagerNochDa(e), 3, 'das Reservierte liegt noch in der Schublade');

  // Unveraendert speichern: nichts wird geschrieben, kein Stueck geht verloren.
  assert.equal(lagerKorrektur(e, { nochDa: lagerNochDa(e), ort: 'Büro' }), null);

  // Auf 2 gezaehlt: Gesamtzahl 3, eins bleibt reserviert, eins frei.
  await api.einkaufMusterlagerSetzen(lagerKorrektur(e, { nochDa: 2, ort: 'Büro' }), MONA);
  e = eintragNach(api, id);
  assert.deepEqual([e.anzahl, e.stand.verbraucht, e.stand.reserviert, e.stand.rest], [3, 1, 1, 1]);
  assert.equal(lagerNochDa(e), 2);
  assert.equal(api.kundenBestellungen().zeilen.find(z => z.orderId === 'gid://shopify/Order/2').auftrag.positionen[0].musterHerkunftQuelle, 'lager');

  // Auf 0 gezaehlt: die offene Bestellung geht wieder an den Lieferanten.
  await api.einkaufMusterlagerSetzen(lagerKorrektur(e, { nochDa: 0, ort: 'Büro' }), MONA);
  e = eintragNach(api, id);
  assert.deepEqual([e.anzahl, e.stand.reserviert, e.stand.rest, lagerNochDa(e)], [1, 0, 0, 0]);
  assert.equal(api.kundenBestellungen().zeilen.find(z => z.orderId === 'gid://shopify/Order/2').auftrag.positionen[0].musterHerkunftQuelle, undefined);
});

test('Einlagern auf ein leeres Einzelmuster: die alte Gesamtzahl lebt nicht wieder auf', async () => {
  const { api } = umgebung();
  const r = await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: HANDLE, farben: ['Grau'], art: 'einzel', anzahl: 5 }, MONA);
  const id = r.eintraege[0].id;
  await api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: 'gid://shopify/Order/1', schritt: 'kunde_hat_muster' }, MONA);
  await api.einkaufMusterlagerSetzen({ aktion: 'aendern', id, leer: true }, MONA);
  assert.equal(lagerNochDa(eintragNach(api, id)), 0);
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: HANDLE, farben: ['Grau'], art: 'einzel', anzahl: 2 }, MONA);
  const e = eintragNach(api, id);
  assert.deepEqual([e.leer, e.anzahl, e.stand.verbraucht, lagerNochDa(e)], [false, 3, 1, 2], 'genau die 2 neuen sind da, nicht 6');
});

test('Probestueck einlagern: eigener Eintrag neben dem Einzelmuster', async () => {
  const { api } = umgebung();
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: HANDLE, farben: ['Grau'], art: 'einzel', anzahl: 1 }, MONA);
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: HANDLE, farben: ['Grau'], art: 'probestueck', anzahl: 1 }, MONA);
  assert.deepEqual(api.einkaufMusterlager().eintraege.map(e => [e.art, e.anzahl]), [['einzel', 1], ['probestueck', 1]]);
});

test('Lieferant je Eintrag: ueber die Artikelnummern, Ware vor Musterprodukt, Name aus den Stammdaten', async () => {
  const { api } = umgebung();
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: HANDLE, farben: ['Grau', 'Blau', 'Rot', 'Gelb'], art: 'einzel', anzahl: 1 }, MONA);
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', schluessel: ['NICHT_IM_LEXIKON'], titel: 'Fremdmuster', art: 'einzel', anzahl: 1 }, MONA);
  const je = Object.fromEntries(api.einkaufMusterlager().eintraege.map(e => [e.farbe || e.titel, e.lieferant]));
  assert.equal(je.Grau.id, 'A');
  assert.equal(je.Grau.name, 'Beispiel GmbH');
  assert.deepEqual(je.Blau, { id: 'E', name: 'Lieferant E' }, 'Lexikon-Schreibweise "Lieferant E", Name faellt auf das Pseudonym zurueck');
  assert.equal(je.Rot.id, 'F');
  assert.equal(je.Gelb, null, 'UNGEKLAERT zaehlt nicht');
  assert.equal(je.Fremdmuster, null);
});
