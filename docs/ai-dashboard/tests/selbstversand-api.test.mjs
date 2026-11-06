// "Von uns abschicken" und Lagerware im Server (#1995) - nur erfundene Daten (TEST-LAGER-1, Lieferant A).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';

const mf = (namespace, key, value) => ({ namespace, key, value });
const O = 'gid://shopify/Order/99501', T = 'gid://shopify/Order/99502';
const L = { lager: 'gid://shopify/LineItem/995011', ware: 'gid://shopify/LineItem/995012', muster: 'gid://shopify/LineItem/995013', test: 'gid://shopify/LineItem/995021' };
const mitarbeiter = { name: 'Testperson', kuerzel: 'test', rolle: 'mitarbeiter' };
const fehler = status => e => e.status === status;

function zeile(id, sku, title, { muster = false } = {}) {
  return {
    id, sku, title, variantTitle: 'Grau', quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1, customAttributes: [],
    originalUnitPriceSet: { shopMoney: { amount: muster ? '0.00' : '20.00', currencyCode: 'EUR' } },
    variant: { id: `${id}-v`, sku, title: 'Grau',
      metafields: { nodes: muster ? [] : [mf('einkauf', 'lieferant', 'A'), mf('einkauf', 'artikelnummer', `A-${sku}`), mf('einkauf', 'bestelleinheit', 'stueck'), mf('einkauf', 'route', 'SUPPLIER_TO_TP')] },
      lieferant: { nodes: [] },
      product: { id: `${id}-p`, handle: `testprodukt-${sku}`.toLowerCase(), title, productType: muster ? 'Musterservice' : null, metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
  };
}
const bestellung = (id, name, zeilen, tags = []) => ({
  id, name, createdAt: '2026-11-01T09:00:00Z', cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
  customAttributes: [], tags, customer: { id: `${id}-c`, displayName: 'Testkunde', email: 'testkunde@example.invalid' },
  shippingAddress: { name: 'Testkunde', address1: 'Testweg 1', zip: '00000', city: 'Musterstadt', country: 'Deutschland' }, lineItems: { nodes: zeilen },
});

function umgebung({ regeln = { _zweck: 'Test', regeln: [{ skuPraefix: 'TEST-LAGER', hinweis: 'Rolle im Testlager' }] } } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-selbstversand-api-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht')); fs.mkdirSync(path.join(dir, 'lieferanten'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders: [
    bestellung(O, '#TEST-LAGER-1', [zeile(L.lager, 'TEST-LAGER-1', 'Testunterlage'), zeile(L.ware, 'TEST-WARE-1', 'Testboden'), zeile(L.muster, 'M-TEST-1', 'Muster Testboden', { muster: true })]),
    bestellung(T, '#TEST-LAGER-2', [zeile(L.test, 'TEST-LAGER-2', 'Testunterlage')], ['testbestellung']),
  ] }));
  if (regeln !== null) fs.writeFileSync(path.join(dir, 'lieferanten/lagerware.json'), typeof regeln === 'string' ? regeln : JSON.stringify(regeln));
  let shopify = 0;
  const api = createApi({ root: dir, privatDirPath: dir, env: {}, gh: async () => '', now: () => new Date('2026-11-06T10:00:00Z'),
    shopifyZugang: async () => { shopify++; throw new Error('Shopify darf nicht aufgerufen werden'); } });
  const setze = (lineItemId, extra, benutzer = mitarbeiter) => api.einkaufAuftragsstatusSetzen({ orderId: lineItemId === L.test ? T : O, lineItemId, ...extra }, benutzer);
  return { dir, api, setze, shopify: () => shopify };
}

test('aktion selbstversand: lesen 403, Mitarbeiter 200, Testauftrag gefunden, ohne Shopify', async () => {
  const u = umgebung();
  await assert.rejects(() => u.setze(L.lager, { aktion: 'selbstversand', schritt: 'zugeschnitten', an: true }, { ...mitarbeiter, rolle: 'lesen' }), fehler(403));
  const r = await u.setze(L.lager, { aktion: 'selbstversand', schritt: 'zugeschnitten', an: true });
  assert.equal(r.ok, true);
  assert.deepEqual([r.eintrag.status, r.eintrag.ueber, r.eintrag.selbstversand.zugeschnitten.von], ['geliefert', 'lager', 'Testperson']);
  const g = await u.setze(L.lager, { aktion: 'selbstversand', schritt: 'gepackt', an: true });
  assert.ok(g.eintrag.selbstversand.gepackt);
  const zurueck = await u.setze(L.lager, { aktion: 'selbstversand', schritt: 'gepackt', an: false });
  assert.equal(zurueck.eintrag.selbstversand.gepackt, undefined);
  assert.equal((await u.setze(L.test, { aktion: 'selbstversand', schritt: 'zugeschnitten', an: true })).eintrag.status, 'geliefert', 'Testbestellung wird gefunden');
  // Heute liest den Stand aus der Bestellliste: Lagerware ist markiert, der Eintrag steht dran.
  const z = u.api.kundenBestellungen().zeilen.find(x => x.orderId === O);
  assert.equal(z.auftrag.positionen.find(p => p.lineItemId === L.lager).lagerware, true);
  assert.equal(z.positionsstatus[L.lager].selbstversand.zugeschnitten.von, 'Testperson');
  // "Zurück auf offen…" geht weiter und nimmt Zugeschnitten mit.
  const offen = await u.setze(L.lager, { aktion: 'zurueckAufOffen' });
  assert.equal(u.api.einkaufAuftragsstatus().positionen[`${O}::${L.lager}`].status, null, JSON.stringify(offen).slice(0, 200));
  assert.equal(u.shopify(), 0);
});

test('aktion selbstversand: Grenzen - Muster 409, Direktware 409, Ware ueber uns nicht "zugeschnitten", Eingaben 400/404', async () => {
  const u = umgebung();
  await assert.rejects(() => u.setze(L.muster, { aktion: 'selbstversand', schritt: 'gepackt', an: true }), fehler(409));
  await assert.rejects(() => u.setze(L.ware, { aktion: 'selbstversand', schritt: 'zugeschnitten', an: true }), fehler(409), 'nur Lagerware wird zugeschnitten');
  await assert.rejects(() => u.setze(L.ware, { aktion: 'selbstversand', schritt: 'gepackt', an: true }), fehler(409), 'noch nicht bei uns');
  await u.setze(L.ware, { status: 'bestellt', ueber: 'kunde' });
  await assert.rejects(() => u.setze(L.ware, { aktion: 'selbstversand', schritt: 'gepackt', an: true }), fehler(409), 'Hersteller schickt direkt');
  await assert.rejects(() => u.setze(L.lager, { aktion: 'selbstversand', schritt: 'gefaltet', an: true }), fehler(400));
  await assert.rejects(() => u.setze(L.lager, { aktion: 'selbstversand', schritt: 'gepackt' }), fehler(400));
  await assert.rejects(() => u.setze('gid://shopify/LineItem/fremd', { aktion: 'selbstversand', schritt: 'gepackt', an: true }), fehler(404));
});

test('Lagerware: "bestellt" 409 mit klarem Text, Sammelknopf ueberspringt sie, Bestellmail fuehrt sie unter "nicht bestellen"', async () => {
  const u = umgebung();
  await assert.rejects(() => u.setze(L.lager, { status: 'bestellt' }), e => e.status === 409 && /Aus eigenem Lager – nicht bestellen, als zugeschnitten markieren/.test(e.message));
  await assert.rejects(() => u.setze(L.ware, { status: 'bestellt', ueber: 'lager' }), fehler(409), 'Vermerk "aus Lager" ist auch kein Bestellen');
  const vorlage = u.api.einkaufBestellmail({ lieferant: 'A', art: 'ware' });
  const positionen = vorlage.mails.flatMap(m => m.positionen || []);
  assert.deepEqual(positionen.map(p => p.lineItemId), [L.ware], 'nur die Ware vom Lieferanten');
  assert.ok(vorlage.mails.some(m => (m.ohneBestellung || []).some(f => f.gruende.includes('aus eigenem Lager – nicht bestellen'))));
  assert.doesNotMatch(JSON.stringify(vorlage.mails.map(m => m.text)), /A-TEST-LAGER-1/, 'Artikelnummer der Lagerware steht in keinem Mailtext');
  // Sammelknopf "Ware ist bestellt" (Zeitleiste): setzt die Ware, laesst die Lagerware aus.
  await u.api.einkaufAuftragsstatusSetzen({ orderId: O, aktion: 'schritt', schritt: 'bestellt' }, mitarbeiter);
  const stand = u.api.einkaufAuftragsstatus().positionen;
  assert.equal(stand[`${O}::${L.ware}`]?.status, 'bestellt');
  assert.equal(stand[`${O}::${L.lager}`]?.status ?? null, null);
  // Ist nur noch Lagerware offen, sagt der Sammelknopf, was stattdessen zu tun ist.
  await assert.rejects(() => u.api.einkaufAuftragsstatusSetzen({ orderId: O, aktion: 'schritt', schritt: 'bestellt' }, mitarbeiter),
    e => e.status === 409 && /als zugeschnitten markieren/.test(e.message));
});

test('Regeldatei: fehlt = keine Lagerware; beschaedigt = laut, Bestellmail und "bestellt" gesperrt', async () => {
  const ohne = umgebung({ regeln: null });
  assert.equal(ohne.api.kundenBestellungen().lagerwareFehler, null);
  assert.equal((await ohne.setze(L.lager, { status: 'bestellt' })).eintrag.status, 'bestellt', 'ohne Regel ist es normale Ware');
  const kaputt = umgebung({ regeln: '{ kaputt' });
  assert.match(kaputt.api.kundenBestellungen().lagerwareFehler, /lagerware\.json ist beschädigt/);
  assert.throws(() => kaputt.api.einkaufBestellmail({ lieferant: 'A', art: 'ware' }), e => e.status === 409 && /beschädigt/.test(e.message));
  await assert.rejects(() => kaputt.setze(L.ware, { status: 'bestellt' }), fehler(409));
  assert.ok(kaputt.api.einkaufBestellmail({ lieferant: 'A', art: 'muster' }).verfuegbar, 'Muster sind nicht betroffen');
});

test('E3/G1: "Ware ist angekommen" setzt nur Ware vom Lieferanten - Lagerware und Direktware bleiben, wie sie sind', async () => {
  const u = umgebung();
  await u.setze(L.ware, { status: 'bestellt', ueber: 'laden' });
  const vorher = u.api.kundenBestellungen().zeilen.find(x => x.orderId === O).naechsterSchritt;
  assert.equal(vorher.aktion, 'geliefert');
  assert.match(vorher.text, /1 Position von uns zuschneiden/);
  const r = await u.api.einkaufAuftragsstatusSetzen({ orderId: O, aktion: 'schritt', schritt: 'geliefert' }, mitarbeiter);
  assert.ok(r.ok);
  const stand = u.api.einkaufAuftragsstatus().positionen;
  assert.equal(stand[`${O}::${L.ware}`].status, 'geliefert');
  assert.equal(stand[`${O}::${L.lager}`]?.status ?? null, null, 'Lagerware wurde nicht "angekommen"');
  assert.equal(stand[`${O}::${L.lager}`]?.selbstversand, undefined);
  // Direktware des Herstellers: der Sammelschritt laesst sie aus; ist nichts anderes offen, 409 mit Weg.
  const d = umgebung();
  await d.setze(L.ware, { status: 'bestellt', ueber: 'kunde' });
  await d.setze(L.lager, { aktion: 'selbstversand', schritt: 'zugeschnitten', an: true });
  await d.setze(L.muster, { status: 'geliefert' });
  await assert.rejects(() => d.api.einkaufAuftragsstatusSetzen({ orderId: O, aktion: 'schritt', schritt: 'geliefert' }, mitarbeiter),
    e => e.status === 409 && /kommt nicht vom Lieferanten zu uns/.test(e.message));
  assert.equal(d.api.einkaufAuftragsstatus().positionen[`${O}::${L.ware}`].status, 'bestellt');
  // Bewusste Korrektur ("Etwas anderes ist passiert"): Ware ueber uns schon raus, Lagerware noch nicht
  // geschnitten - die Ware geht zurueck auf "bei uns", die Lagerware bleibt offen (kein 409).
  const k = umgebung();
  const roh = { version: 1, positionen: { [`${O}::${L.ware}`]: { orderId: O, lineItemId: L.ware, status: 'raus', ueber: 'laden', bestelltAm: '2026-11-02T08:00:00Z', geliefertAm: '2026-11-03T08:00:00Z', rausAm: '2026-11-04T08:00:00Z' },
    [`${O}::${L.muster}`]: { orderId: O, lineItemId: L.muster, status: 'geliefert', geliefertAm: '2026-11-03T08:00:00Z' } } };
  fs.writeFileSync(path.join(k.dir, 'auftragsstatus.json'), JSON.stringify(roh));
  assert.ok((await k.api.einkaufAuftragsstatusSetzen({ orderId: O, aktion: 'schritt', schritt: 'geliefert' }, mitarbeiter)).ok);
  const korrigiert = k.api.einkaufAuftragsstatus().positionen;
  assert.equal(korrigiert[`${O}::${L.ware}`].status, 'geliefert');
  assert.equal(korrigiert[`${O}::${L.lager}`]?.status ?? null, null, 'Lagerware bleibt "noch zuschneiden"');
  // Einzelweg: nie bestellte Lagerware ist nicht "eingetroffen".
  const e = umgebung();
  await assert.rejects(() => e.setze(L.lager, { status: 'geliefert' }), e2 => e2.status === 409 && /als zugeschnitten markieren/.test(e2.message));
});

test('G4/B1: nach "Zugeschnitten", "Rückgängig" und "Zurück auf offen" ist die Position wieder bestellbar, sobald die Regel weg ist', async () => {
  const u = umgebung();
  // Altfall #1119: Lagerware stand ohne Vermerk auf "bestellt" (vor der Regel geklickt).
  const roh = { version: 1, positionen: { [`${O}::${L.lager}`]: { orderId: O, lineItemId: L.lager, status: 'bestellt', bestelltAm: '2026-11-06T08:00:00Z', bestelltVon: 'test' } } };
  fs.writeFileSync(path.join(u.dir, 'auftragsstatus.json'), JSON.stringify(roh));
  await u.setze(L.lager, { aktion: 'selbstversand', schritt: 'zugeschnitten', an: true });
  await u.setze(L.lager, { aktion: 'selbstversand', schritt: 'gepackt', an: true });
  await u.setze(L.lager, { aktion: 'selbstversand', schritt: 'gepackt', an: false });
  const zurueck = await u.setze(L.lager, { aktion: 'selbstversand', schritt: 'zugeschnitten', an: false });
  assert.deepEqual([zurueck.eintrag.status, zurueck.eintrag.ueber], ['bestellt', undefined], 'kein "aus Lager" mehr');
  await u.setze(L.lager, { aktion: 'zurueckAufOffen' });
  assert.equal(u.api.einkaufAuftragsstatus().positionen[`${O}::${L.lager}`].ueber, undefined);
  // Lagerrolle leer, Regel entfernt: die Position ist normale Ware und laesst sich bestellen.
  fs.writeFileSync(path.join(u.dir, 'lieferanten/lagerware.json'), JSON.stringify({ _zweck: 'Test', regeln: [] }));
  assert.equal((await u.setze(L.lager, { status: 'bestellt' })).eintrag.status, 'bestellt');
  const mail = u.api.einkaufBestellmail({ lieferant: 'A', art: 'ware' });
  assert.ok(!mail.mails.some(m => (m.ohneBestellung || []).length), 'nicht mehr unter "nicht bestellen"');
});

test('E8/G2: alter Vermerk "direkt an Kunden" ohne Schritt macht Lagerware nicht wieder zur Bestellware', async () => {
  const u = umgebung();
  const roh = { version: 1, positionen: { [`${O}::${L.lager}`]: { orderId: O, lineItemId: L.lager, status: null, ueber: 'kunde', zurueckGesetztAm: '2026-11-05T08:00:00Z' } } };
  fs.writeFileSync(path.join(u.dir, 'auftragsstatus.json'), JSON.stringify(roh));
  await assert.rejects(() => u.setze(L.lager, { status: 'bestellt' }), fehler(409));
  const mail = u.api.einkaufBestellmail({ lieferant: 'A', art: 'ware' });
  assert.deepEqual(mail.mails.flatMap(m => m.positionen || []).map(p => p.lineItemId), [L.ware]);
  const r = await u.setze(L.lager, { aktion: 'selbstversand', schritt: 'zugeschnitten', an: true });
  assert.deepEqual([r.eintrag.status, r.eintrag.ueber], ['geliefert', 'lager']);
});
