// "Eingeworfen" (#1937): gepackt allein bucht nichts, der Klick vermerkt nur. Erst nach der Frist bucht der
// Dienst ueber den bisherigen Weg, bis dahin ist alles spurlos zuruecknehmbar. Kein Test spricht echtes
// Shopify (Attrappe aus operations/tests); nur erfundene Daten.
import './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { einwurfListen, EINWURF_FRIST_MINUTEN } from '../lib/muster-packen.mjs';
import { versandAttrappe, fo, li, BESTELLUNG } from '../../../operations/tests/versand-attrappe.mjs';

const quelle = { id: 'gid://shopify/ProductVariant/100', sku: 'ORIG-B', title: 'Sand', metafields: { nodes: [] }, product: { id: 'gid://shopify/Product/100', handle: 'testlinea-sand', title: 'Testlinea Sand – Klickvinyl', productType: 'Klickvinyl', metafields: { nodes: [] } } };
const muster = n => ({ id: li(n), sku: 'TP-MUSTER-000', title: 'Kostenloses Muster', variantTitle: null, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: '_Quellvariante_ID', value: '100' }], originalUnitPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } },
  variant: { id: 'gid://shopify/ProductVariant/900', sku: 'TP-MUSTER-000', title: 'Default Title', metafields: { nodes: [] }, product: { handle: 'kostenloses-muster', title: 'Kostenloses Muster', productType: 'Musterservice', metafields: { nodes: [] } } } });
const bestellung = { id: BESTELLUNG, name: '#T5001', createdAt: '2026-10-18T06:00:00Z', cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', tags: [], customAttributes: [],
  customer: { id: 'gid://shopify/Customer/700', displayName: 'Testkunde Einwurf', email: 'einwurf@example.invalid' },
  shippingAddress: { name: 'Testkunde Einwurf', address1: 'Testweg 7', address2: null, zip: '00000', city: 'Musterstadt', country: 'Germany' },
  totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: [muster(1), muster(2)] } };
const ICH = { name: 'Mitarbeiter 1', rolle: 'mitarbeiter' };
const MIN = 60_000;

function umgebung(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-packstation-einwurf-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders: [bestellung], quellvarianten: [quelle] }));
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify({ produkte: [{ handle: 'testlinea-sand', titel: 'Testlinea Sand – Klickvinyl', eigenschaften: { marke: 'Testlinea' },
    varianten: [{ id: quelle.id, sku: quelle.sku, farbe: 'Sand', titel: 'Sand', einkauf: { produktname: 'Lieferant Sand 2mm', farbnummer: '7' } }] }] }));
  const uhr = { jetzt: new Date('2026-10-21T12:00:00Z').getTime() };
  const attrappe = versandAttrappe({ fos: [fo('1', [{ n: 1 }, { n: 2 }])] });
  const verboten = () => assert.fail('Die Packstation darf weder gh noch einen Neuaufbau anstossen');
  const api = createApi({ root: dir, privatDirPath: dir, gh: verboten, rebuild: verboten, now: () => new Date(uhr.jetzt), env: {},
    shopifyZugang: async () => ({ proxy: attrappe.proxy, art: 'client-credentials', scope: 'write_orders' }) });
  const kunde = () => api.kundenMusterPacken().kunden[0];
  const packen = () => api.kundenMusterPackenSchreiben({ packSchluessel: kunde().packSchluessel, aktion: 'gepackt', gepackt: true, alleEingelegt: true, lineItemIds: kunde().muster.filter(m => !m.abgehakt).map(m => m.lineItemId) }, ICH);
  const status = () => { try { const s = JSON.parse(fs.readFileSync(path.join(dir, 'auftragsstatus.json'), 'utf8')); return s.positionen || s; } catch { return {}; } };
  return { dir, api, attrappe, uhr, kunde, packen, eintrag: n => status()[`${BESTELLUNG}::${li(n)}`] };
}

test('Der Klick bucht nichts: erst nach der Frist "raus" und Shopify mit Versandmail', async t => {
  const u = umgebung(t);
  await u.packen();
  const pk = u.kunde().packSchluessel;
  const r = await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen', packSchluessel: [pk] }, ICH);
  assert.deepEqual(r.angenommen, [pk]);
  assert.deepEqual(r.abgelehnt, []);
  assert.equal(new Date(r.buchtAb).getTime() - u.uhr.jetzt, EINWURF_FRIST_MINUTEN * MIN);
  assert.equal(u.attrappe.buchungen().length, 0, 'keine Mail vor Ablauf der Frist');
  assert.notEqual(u.eintrag(1)?.status, 'raus');
  assert.equal(u.kunde().eingeworfen.von, 'Mitarbeiter 1');
  assert.equal(u.kunde().bereich, 'gepackt', 'der Umschlag bleibt bis zur Buchung sichtbar');

  u.uhr.jetzt += (EINWURF_FRIST_MINUTEN * MIN) - 1000;
  assert.deepEqual(await u.api.einwurfBuchen(), { gebucht: 0, probleme: 0 }, 'eine Sekunde zu früh: nichts');
  assert.equal(u.attrappe.buchungen().length, 0);

  u.uhr.jetzt += 2000;
  assert.deepEqual(await u.api.einwurfBuchen(), { gebucht: 1, probleme: 0 });
  const buchungen = u.attrappe.buchungen();
  assert.equal(buchungen.length, 1);
  assert.equal(buchungen[0].variables.fulfillment.notifyCustomer, true, 'Kundenmail wie beim bisherigen Knopf');
  assert.deepEqual([u.eintrag(1).status, u.eintrag(2).status], ['raus', 'raus']);
  assert.equal(u.eintrag(1).rausVon, 'Mitarbeiter 1', 'gebucht im Namen dessen, der eingeworfen hat');
  assert.equal(u.api.kundenMusterPacken().kunden.length, 0);
  assert.deepEqual(u.api.kundenMusterPacken().einwurf.probleme, []);

  assert.deepEqual(await u.api.einwurfBuchen(), { gebucht: 0, probleme: 0 }, 'zweiter Lauf bucht nichts doppelt');
  assert.equal(u.attrappe.buchungen().length, 1);
});

test('Rueckgaengig vor der Frist: spurlos, kein Status, keine Mail; danach "zu spaet"', async t => {
  const u = umgebung(t);
  await u.packen();
  const pk = u.kunde().packSchluessel;
  await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen', packSchluessel: [pk] }, ICH);
  const z = await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen-zurueck', packSchluessel: [pk] }, ICH);
  assert.deepEqual(z, { ok: true, zurueck: [pk], zuSpaet: [] });
  assert.equal(u.kunde().eingeworfen, undefined);
  assert.equal(u.kunde().bereich, 'gepackt');
  u.uhr.jetzt += 10 * MIN;
  assert.deepEqual(await u.api.einwurfBuchen(), { gebucht: 0, probleme: 0 });
  assert.equal(u.attrappe.buchungen().length, 0);
  assert.notEqual(u.eintrag(1)?.status, 'raus');

  await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen', packSchluessel: [pk] }, ICH);
  u.uhr.jetzt += 10 * MIN;
  await u.api.einwurfBuchen();
  assert.deepEqual((await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen-zurueck', packSchluessel: [pk] }, ICH)).zuSpaet, [pk]);
  assert.equal(u.eintrag(1).status, 'raus', 'gebucht bleibt gebucht');
});

test('Sammelaktion: jeder Umschlag fuer sich; Ungepacktes, Lesezugang und "Gepackt zuruecknehmen" sind gesperrt', async t => {
  const u = umgebung(t);
  const pk = u.kunde().packSchluessel;
  const vorher = await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen', packSchluessel: [pk] }, ICH);
  assert.deepEqual(vorher.angenommen, [], 'nicht gepackt: gepackt ist die Voraussetzung');
  assert.match(vorher.abgelehnt[0].meldung, /noch nicht gepackt/);
  await u.packen();
  const beide = await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen', packSchluessel: [pk, 'gibt-es-nicht'] }, ICH);
  assert.deepEqual(beide.angenommen, [pk]);
  assert.deepEqual(beide.abgelehnt.map(a => a.packSchluessel), ['gibt-es-nicht']);
  const erstFrist = u.kunde().eingeworfen.buchtAb;
  u.uhr.jetzt += MIN;
  await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen', packSchluessel: [pk] }, ICH);
  assert.equal(u.kunde().eingeworfen.buchtAb, erstFrist, 'zweiter Klick verschiebt die Frist nicht');
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ packSchluessel: pk, aktion: 'gepackt', gepackt: false }, ICH), /Rückgängig/);
  const lesen = { name: 'Nur Lesen', rolle: 'lesen' };
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen', packSchluessel: [pk] }, lesen), /nur ansehen/);
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen-zurueck', packSchluessel: [pk] }, lesen), /nur ansehen/);
});

test('Scheitert die Buchung, bleibt ein sichtbarer Hinweis, bis jemand ihn bestaetigt', async t => {
  const u = umgebung(t);
  await u.packen();
  const pk = u.kunde().packSchluessel;
  await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen', packSchluessel: [pk] }, ICH);
  // Ablage nach dem Klick veraendert (z. B. Rueckspielung einer Sicherung): die Sperre von "verschickt" greift.
  const ablage = path.join(u.dir, 'muster-packen.json');
  const stand = JSON.parse(fs.readFileSync(ablage, 'utf8'));
  delete stand.haken[li(1)];
  fs.writeFileSync(ablage, JSON.stringify(stand));
  u.uhr.jetzt += 10 * MIN;
  assert.deepEqual(await u.api.einwurfBuchen(), { gebucht: 0, probleme: 1 });
  assert.equal(u.attrappe.buchungen().length, 0);
  const [problem] = u.api.kundenMusterPacken().einwurf.probleme;
  assert.equal(problem.packSchluessel, pk);
  assert.deepEqual(problem.bestellungen, ['#T5001']);
  assert.match(problem.meldung, /nicht jedes Muster abgehakt/);
  assert.deepEqual(await u.api.einwurfBuchen(), { gebucht: 0, probleme: 0 }, 'kein zweiter Versuch von selbst');
  await u.api.kundenMusterPackenSchreiben({ aktion: 'eingeworfen-zurueck', packSchluessel: [pk] }, ICH);
  assert.deepEqual(u.api.kundenMusterPacken().einwurf.probleme, []);
});

const k = (name, seit, gepacktAm, extra = {}) => ({ name, seit, bereich: 'gepackt', gepackt: { zeit: gepacktAm }, bestellungen: [{ orderId: name, orderName: name }], ...extra });

test('Gruppen: heute Gepacktes in der Sammelaktion, Altfaelle aelteste Bestellung zuerst, Wartendes getrennt', () => {
  const jetzt = new Date('2026-11-05T15:00:00Z');
  const { wartend, heute, alt, altBestellungen } = einwurfListen([
    k('neu', '2026-11-04T09:00:00Z', '2026-11-05T08:00:00Z'),
    k('alt-b', '2026-10-25T09:00:00Z', '2026-10-30T08:00:00Z'),
    k('alt-a', '2026-10-20T09:00:00Z', '2026-11-01T08:00:00Z'),
    k('wartet', '2026-11-03T09:00:00Z', '2026-11-05T09:00:00Z', { eingeworfen: { buchtAb: '2026-11-05T15:05:00Z' } }),
    k('problem', '2026-10-19T09:00:00Z', '2026-10-22T09:00:00Z', { eingeworfen: { problem: 'x' } }),
    { name: 'offen', bereich: 'packen', bestellungen: [] },
  ], jetzt);
  assert.deepEqual(wartend.map(x => x.name), ['wartet']);
  assert.deepEqual(heute.map(x => x.name), ['neu']);
  assert.deepEqual(alt.map(x => x.name), ['problem', 'alt-a', 'alt-b']);
  assert.equal(altBestellungen, 3);
});

test('Der Tageswechsel zaehlt nach Berlin, nicht nach UTC', () => {
  const { heute, alt } = einwurfListen([k('kurz-nach-mitternacht', '2026-11-01T09:00:00Z', '2026-11-04T23:30:00Z')], new Date('2026-11-05T15:00:00Z'));
  assert.deepEqual(heute.map(x => x.name), ['kurz-nach-mitternacht']);
  assert.equal(alt.length, 0);
});
