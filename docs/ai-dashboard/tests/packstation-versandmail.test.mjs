// "Verschickt – Kunde informieren" (#1810) bucht die Muster eines gepackten Umschlags in Shopify als
// versendet - Shopify schickt die Versandmail (Mitarbeiter 29.10.2026). Seit #1811 auf dem Server, ganz
// oder gar nicht. "Umschlag gepackt" allein bucht nichts. Kein Test spricht echtes Shopify: die Attrappe
// aus operations/tests.
import './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { versandAttrappe, fo, li, BESTELLUNG } from '../../../operations/tests/versand-attrappe.mjs';

// Nur erfundene Daten: Bestellung #T5001 mit zwei Mustern, Testkunde.
const quelle = { id: 'gid://shopify/ProductVariant/100', sku: 'ORIG-B', title: 'Sand', metafields: { nodes: [] }, product: { id: 'gid://shopify/Product/100', handle: 'testlinea-sand', title: 'Testlinea Sand – Klickvinyl', productType: 'Klickvinyl', metafields: { nodes: [] } } };
const muster = n => ({ id: li(n), sku: 'TP-MUSTER-000', title: 'Kostenloses Muster', variantTitle: null, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: '_Quellvariante_ID', value: '100' }], originalUnitPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } },
  variant: { id: 'gid://shopify/ProductVariant/900', sku: 'TP-MUSTER-000', title: 'Default Title', metafields: { nodes: [] }, product: { handle: 'kostenloses-muster', title: 'Kostenloses Muster', productType: 'Musterservice', metafields: { nodes: [] } } } });
const bestellung = { id: BESTELLUNG, name: '#T5001', createdAt: '2026-10-18T06:00:00Z', cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', tags: [], customAttributes: [],
  customer: { id: 'gid://shopify/Customer/700', displayName: 'Testkunde Packen', email: 'packen@example.invalid' },
  shippingAddress: { name: 'Testkunde Packen', address1: 'Testweg 7', address2: null, zip: '00000', city: 'Musterstadt', country: 'Germany' },
  totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: [muster(1), muster(2)] } };
const ICH = { name: 'Mitarbeiter 1', rolle: 'mitarbeiter' };

function umgebung(t, { attrappe = versandAttrappe({ fos: [fo('1', [{ n: 1 }, { n: 2 }])] }), zugang = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-packstation-versand-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders: [bestellung], quellvarianten: [quelle] }));
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify({ produkte: [{ handle: 'testlinea-sand', titel: 'Testlinea Sand – Klickvinyl', eigenschaften: { marke: 'Testlinea' },
    varianten: [{ id: quelle.id, sku: quelle.sku, farbe: 'Sand', titel: 'Sand', einkauf: { produktname: 'Lieferant Sand 2mm', farbnummer: '7' } }] }] }));
  const verboten = () => assert.fail('Die Packstation darf weder gh noch einen Neuaufbau anstossen');
  const api = createApi({ root: dir, privatDirPath: dir, gh: verboten, rebuild: verboten, now: () => new Date('2026-10-21T12:00:00Z'),
    shopifyZugang: async () => (zugang ? { proxy: attrappe.proxy, art: 'client-credentials', scope: 'write_orders' } : { proxy: { execute: async () => null }, art: 'sammeln', scope: null }) });
  const kunde = () => api.kundenMusterPacken().kunden[0];
  const packen = () => api.kundenMusterPackenSchreiben({ packSchluessel: kunde().packSchluessel, aktion: 'gepackt', gepackt: true, alleEingelegt: true, lineItemIds: kunde().muster.filter(m => !m.abgehakt).map(m => m.lineItemId) }, ICH);
  const verschicken = (pk = kunde().packSchluessel, wer = ICH) => api.kundenMusterPackenSchreiben({ packSchluessel: pk, aktion: 'verschickt' }, wer);
  const status = () => JSON.parse(fs.readFileSync(path.join(dir, 'auftragsstatus.json'), 'utf8'));
  const eintrag = n => { const s = status(); return (s.positionen || s)[`${BESTELLUNG}::${li(n)}`]; };
  return { dir, api, attrappe, kunde, packen, verschicken, eintrag };
}

test('Umschlag gepackt bucht nichts; Verschickt: Muster lokal "raus", in Shopify mit Versandmail, Umschlag aus der Packstation', async t => {
  const u = umgebung(t);
  const pk = u.kunde().packSchluessel;
  const gepackt = await u.packen();
  assert.equal(gepackt.gepackt?.von, 'Mitarbeiter 1', 'Packstand gespeichert');
  assert.equal(gepackt.versand, undefined);
  assert.equal(u.attrappe.buchungen().length, 0, 'Gepackt allein schickt keine Mail - der Grossbrief kann noch vorbereitet werden');
  assert.equal(u.kunde().bereich, 'gepackt');
  const r = await u.verschicken();
  assert.equal(r.ok, true);
  assert.deepEqual(r.versand.map(v => [v.orderName, v.status, v.kundeBenachrichtigt]), [['#T5001', 'gebucht', true]]);
  assert.match(r.versand[0].meldung, /Versandmail/);
  const buchungen = u.attrappe.buchungen();
  assert.equal(buchungen.length, 1);
  assert.equal(buchungen[0].variables.fulfillment.notifyCustomer, true);
  assert.equal(buchungen[0].variables.fulfillment.trackingInfo ?? null, null, 'Musterbrief ohne Sendungsnummer');
  assert.deepEqual([u.eintrag(1).status, u.eintrag(2).status], ['raus', 'raus']);
  assert.equal(u.eintrag(1).shopifyVersand.status, 'gebucht');
  // Versendet ist fertig: der Umschlag steht nicht mehr in der Arbeitsliste, die Suche kennt ihn als erledigt.
  const liste = u.api.kundenMusterPacken();
  assert.equal(liste.kunden.find(k => k.packSchluessel === pk), undefined);
  assert.deepEqual(liste.ausserhalb.map(b => [b.orderName, b.grund]), [['#T5001', 'erledigt']]);
});

test('Verschickt nur fuer gepackte Umschlaege; zweiter Klick und Zuruecknehmen danach aendern Shopify nicht', async t => {
  const u = umgebung(t);
  const pk = u.kunde().packSchluessel;
  await assert.rejects(u.verschicken(pk), e => e.status === 409 && /noch nicht gepackt/.test(e.message));
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ aktion: 'verschickt' }, ICH), e => e.status === 400);
  assert.equal(u.attrappe.buchungen().length, 0);
  await u.packen();
  await u.verschicken(pk);
  await assert.rejects(u.verschicken(pk), e => e.status === 409);
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ packSchluessel: pk, aktion: 'gepackt', gepackt: true }, ICH), e => e.status === 409);
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ packSchluessel: pk, aktion: 'gepackt', gepackt: false }, ICH), e => e.status === 409);
  assert.equal(u.attrappe.buchungen().length, 1, 'keine zweite Buchung, keine zweite Mail');
  assert.deepEqual([u.eintrag(1).status, u.eintrag(2).status], ['raus', 'raus'], 'nichts zurueckgesetzt');
});

test('ohne Shopify-Zugang: Schritt "raus" gespeichert, die Antwort nennt den Fehler', async t => {
  const u = umgebung(t, { zugang: false });
  await u.packen();
  const r = await u.verschicken();
  assert.equal(r.ok, true);
  assert.equal(r.versand[0].status, 'fehler');
  assert.match(r.versand[0].meldung, /kein Zugang/);
  assert.equal(u.attrappe.buchungen().length, 0);
  // Der Vermerk fuehrt die Bestellung unter "In Shopify buchen" - nie still verloren.
  assert.equal(u.eintrag(1).status, 'raus');
  assert.equal(u.eintrag(1).shopifyVersand.status, 'fehler');
});

test('persoenlich vorbeigebrachte Muster: in Shopify gebucht, aber ohne Mail', async t => {
  const u = umgebung(t);
  await u.api.einkaufAuftragsstatusSetzen({ aktion: 'musterHerkunft', orderId: BESTELLUNG, herkunft: 'eigen_vorbei' }, ICH);
  await u.packen();
  const r = await u.verschicken();
  assert.deepEqual(r.versand.map(v => [v.status, v.kundeBenachrichtigt]), [['gebucht', false]]);
  assert.equal(u.attrappe.buchungen()[0].variables.fulfillment.notifyCustomer, false);
});

test('Haken und Rolle lesen buchen nichts', async t => {
  const u = umgebung(t);
  const pk = u.kunde().packSchluessel;
  const haken = await u.api.kundenMusterPackenSchreiben({ packSchluessel: pk, aktion: 'haken', lineItemIds: [li(1)], an: true }, ICH);
  assert.equal(haken.versand, undefined);
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ packSchluessel: pk, gepackt: true }, { name: 'Gast', rolle: 'lesen' }), e => e.status === 403);
  await u.packen();
  await assert.rejects(u.verschicken(pk, { name: 'Gast', rolle: 'lesen' }), e => e.status === 403);
  assert.equal(u.attrappe.buchungen().length, 0);
});

// Ein Umschlag, zwei Bestellungen desselben Kunden (Pruefung 29.10.): der Packschluessel ergibt sich
// aus den noch offenen Bestellungen - scheitert "raus" fuer eine, darf nichts halb geschrieben sein.
function zweiBestellungen(t, vorStatus = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-packstation-zwei-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  const zweite = { ...bestellung, id: 'gid://shopify/Order/5002', name: '#T5002', createdAt: '2026-10-19T06:00:00Z', lineItems: { nodes: [muster(3)] } };
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders: [{ ...bestellung, lineItems: { nodes: [muster(1)] } }, zweite], quellvarianten: [quelle] }));
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify({ produkte: [{ handle: 'testlinea-sand', titel: 'Testlinea Sand – Klickvinyl', eigenschaften: { marke: 'Testlinea' },
    varianten: [{ id: quelle.id, sku: quelle.sku, farbe: 'Sand', titel: 'Sand', einkauf: { produktname: 'Lieferant Sand 2mm', farbnummer: '7' } }] }] }));
  if (vorStatus) fs.writeFileSync(path.join(dir, 'auftragsstatus.json'), JSON.stringify({ version: 1, positionen: vorStatus }));
  let freigabe;
  const halt = new Promise(r => { freigabe = r; });
  const verboten = () => assert.fail('Die Packstation darf weder gh noch einen Neuaufbau anstossen');
  // Shopify antwortet erst nach freigabe() - und hat dann keinen Zugang: es geht nur um den lokalen Stand.
  const api = createApi({ root: dir, privatDirPath: dir, gh: verboten, rebuild: verboten, now: () => new Date('2026-10-21T12:00:00Z'),
    shopifyZugang: async () => { await halt; return { proxy: { execute: async () => null }, art: 'sammeln', scope: null }; } });
  const kunden = () => api.kundenMusterPacken().kunden;
  const packen = () => { const k = kunden()[0]; return api.kundenMusterPackenSchreiben({ packSchluessel: k.packSchluessel, aktion: 'gepackt', gepackt: true, alleEingelegt: true, lineItemIds: k.muster.map(m => m.lineItemId) }, ICH); };
  const verschicken = () => api.kundenMusterPackenSchreiben({ packSchluessel: kunden()[0].packSchluessel, aktion: 'verschickt' }, ICH);
  const status = () => (fs.existsSync(path.join(dir, 'auftragsstatus.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'auftragsstatus.json'), 'utf8')).positionen || {} : {});
  return { dir, api, kunden, packen, verschicken, status, freigabe };
}

for (const [fall, eintrag] of [
  ['Musterautomatik noch ungeklaert', { uebernahme: { id: 'musterautomatik', person: 'Musterautomatik', seit: '2026-10-19T07:00:00Z' } }],
  ['bestaetigte Fehlmenge', { status: 'geliefert', beschaffung: { wareneingang: { soll: 1, angekommen: 1, verwendbar: 0, einheit: 'muster' } } }],
]) {
  test(`zwei Bestellungen, eine darf nicht raus (${fall}): 409, nichts geschrieben, nichts gebucht`, async t => {
    const key = `gid://shopify/Order/5002::${li(3)}`;
    const u = zweiBestellungen(t, { [key]: { orderId: 'gid://shopify/Order/5002', lineItemId: li(3), ...eintrag } });
    u.freigabe();
    await u.packen();
    const vorher = u.kunden().map(k => [k.packSchluessel, k.bereich]);
    assert.deepEqual(vorher.map(([, b]) => b), ['gepackt'], 'ein gepackter Umschlag fuer beide Bestellungen');
    const stand = JSON.stringify(u.status());
    await assert.rejects(u.verschicken(), e => e.status === 409 && /Nicht verschickt, keine Mail – #T5002/.test(e.message));
    assert.deepEqual(u.kunden().map(k => [k.packSchluessel, k.bereich]), vorher, 'Umschlag bleibt unter "Gepackt"');
    assert.equal(JSON.stringify(u.status()), stand, 'auch die erste Bestellung bleibt, wie sie war');
    assert.notEqual(u.status()[`${BESTELLUNG}::${li(1)}`]?.status, 'raus');
  });
}

test('zwei Bestellungen: beide lokal "raus", bevor Shopify antwortet - der Umschlag zerfaellt nie', async t => {
  const u = zweiBestellungen(t);
  await u.packen();
  const lauf = u.verschicken();
  await new Promise(r => setImmediate(r));
  // Waehrend Shopify noch rechnet: kein halber Umschlag mehr in der Packstation.
  assert.deepEqual(u.kunden(), []);
  assert.deepEqual([u.status()[`${BESTELLUNG}::${li(1)}`]?.status, u.status()[`gid://shopify/Order/5002::${li(3)}`]?.status], ['raus', 'raus']);
  u.freigabe();
  const r = await lauf;
  assert.deepEqual(r.versand.map(v => [v.orderName, v.status]), [['#T5001', 'fehler'], ['#T5002', 'fehler']]);
});

test('nur Abgehaktes geht raus: gepackter Umschlag nimmt keinen Haken mehr an, ein fehlender Haken sperrt Verschickt', async t => {
  const u = umgebung(t);
  const pk = u.kunde().packSchluessel;
  await u.packen();
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ packSchluessel: pk, aktion: 'haken', lineItemIds: [li(2)], an: false }, ICH), e => e.status === 409 && /schon gepackt/.test(e.message));
  // Veraltete Seite oder nachbestelltes Muster: der Haken fehlt trotzdem (direkt in der Ablage entfernt).
  const datei = path.join(u.dir, 'muster-packen.json');
  const stand = JSON.parse(fs.readFileSync(datei, 'utf8'));
  delete stand.haken[li(2)];
  fs.writeFileSync(datei, JSON.stringify(stand));
  assert.equal(u.kunde().bereich, 'gepackt');
  await assert.rejects(u.verschicken(pk), e => e.status === 409 && /nicht jedes Muster abgehakt/.test(e.message));
  assert.equal(u.attrappe.buchungen().length, 0, 'keine Buchung, keine Mail');
});
