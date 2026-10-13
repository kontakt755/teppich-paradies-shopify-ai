// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner und kein echter Shopify-Zugang (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';
import { protokollPfad, letzteEintraege } from '../../../operations/lib/protokoll.mjs';
import { versandAttrappe, fo, li, BESTELLUNG } from '../../../operations/tests/versand-attrappe.mjs';
import { versandKandidaten, vorauswahl, versandRueckmeldung, istUebergabe } from '../lib/versand.mjs';

// Nur erfundene Daten: Bestellung #T5001 mit zwei Mustern und einem Kettelservice, Testkunde.
const position = (n, { sku = `M-TEST-${n}`, typ = 'Musterservice', handle = 'muster', menge = 1 } = {}) => ({
  id: li(n), sku, title: `Testartikel ${n}`, variantTitle: 'Grau', quantity: menge, currentQuantity: menge, unfulfilledQuantity: menge,
  customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/${n}`, sku, title: 'Grau', metafields: { nodes: [] }, lieferant: { nodes: [] },
    product: { id: `gid://shopify/Product/${n}`, handle, title: `Testartikel ${n}`, productType: typ, metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const bestellung = (id, zeilen, { tags = [] } = {}) => ({
  id, name: `#T${id.split('/').pop()}`, createdAt: '2026-10-10T10:00:00Z', cancelledAt: null, tags,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [],
  customer: { id: 'gid://shopify/Customer/1', displayName: 'Testkunde', email: 'testkunde@example.invalid', phone: null },
  totalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: zeilen },
});
const TEST = 'gid://shopify/Order/5002';
const ICH = { name: 'Mitarbeiter 1', rolle: 'mitarbeiter' };

function umgebung({ attrappe = versandAttrappe(), zugang = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-versand-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [
    bestellung(BESTELLUNG, [position(1), position(2)]),
    bestellung(TEST, [position(7)], { tags: ['TESTBESTELLUNG'] }),
  ] }));
  const z = { attrappe, aktiv: zugang };
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => new Date('2026-10-13T10:00:00Z'),
    shopifyZugang: async () => (z.aktiv ? { proxy: z.attrappe.proxy, art: 'client-credentials', scope: 'read_orders' } : { proxy: { execute: async () => null }, art: 'sammeln', scope: null }) });
  const setze = payload => api.einkaufAuftragsstatusSetzen(payload, ICH);
  const stand = () => api.einkaufAuftragsstatus().positionen;
  const eintrag = n => stand()[`${BESTELLUNG}::${li(n)}`];
  return { dir, api, z, setze, stand, eintrag };
}

test('Dialog-Schritt "raus" mit Auswahl: nur die angekreuzte Position, in Shopify gebucht, Vermerk und Protokoll', async () => {
  const u = umgebung();
  const r = await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(2)], versand: { sendungsnummer: 'ABC 123', versanddienst: 'GLS', benachrichtigen: true } });
  assert.equal(r.shopify.status, 'gebucht');
  assert.equal(r.shopify.kundeBenachrichtigt, true);
  assert.match(r.shopify.meldung, /Versandmail/);
  assert.equal(u.eintrag(2).status, 'raus');
  assert.equal(u.eintrag(1), undefined, 'Position 1 bleibt, wo sie war');
  assert.deepEqual([u.eintrag(2).sendungsnummer, u.eintrag(2).versanddienst], ['ABC123', 'GLS']);
  assert.equal(u.eintrag(2).shopifyVersand.status, 'gebucht');
  assert.ok(u.eintrag(2).shopifyVersand.fulfillmentId);
  const buchung = u.z.attrappe.buchungen()[0].variables.fulfillment;
  assert.deepEqual(buchung.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems.map(x => x.id), ['gid://shopify/FulfillmentOrderLineItem/12']);
  assert.deepEqual(buchung.trackingInfo, { number: 'ABC123', company: 'GLS' });
  const zeile = letzteEintraege(protokollPfad(), 5).find(e => e.aktion === 'Versand in Shopify gebucht');
  assert.match(zeile.objekt, /#T5001: 1 Artikel · Versandmail an Kunden · Sendung GLS ABC123/);
  assert.equal(r.versandNachholen, null);
});

test('Einzelweg (Status je Position, z. B. alte Oberflaeche in einer Schleife) bucht nie je Artikel: "ausstehend", dann ein Paket', async () => {
  const u = umgebung();
  const a = await u.setze({ orderId: BESTELLUNG, lineItemId: li(1), status: 'raus' });
  await u.setze({ orderId: BESTELLUNG, lineItemId: li(2), status: 'raus' });
  assert.equal(a.shopify.status, 'ausstehend');
  assert.equal(u.z.attrappe.aufrufe.length, 0, 'keine Buchung, keine Mail je Artikel');
  assert.deepEqual([u.eintrag(1).shopifyVersand.status, u.eintrag(2).shopifyVersand.status], ['ausstehend', 'ausstehend']);
  const zeile = u.api.kundenBestellungen().zeilen.find(z => z.orderId === BESTELLUNG);
  assert.equal(zeile.versandNachholen.ausstehend, true);
  const n = await u.setze({ aktion: 'versandNachholen', orderId: BESTELLUNG });
  assert.equal(n.shopify.gebucht, 2);
  assert.equal(u.z.attrappe.buchungen().length, 1, 'ein Paket, eine Mail');
  assert.equal(u.z.attrappe.buchungen()[0].variables.fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems.length, 2);
});

test('Doppelter Klick im Dialog bucht nie doppelt; danach nur noch der Rest', async () => {
  const u = umgebung({ attrappe: versandAttrappe({ verzoegerung: 15 }) });
  const klick = () => u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(1)] });
  const [a, b] = await Promise.all([klick(), klick()]);
  assert.equal(u.z.attrappe.buchungen().length, 1, 'genau eine Buchung in Shopify');
  assert.deepEqual([a.shopify?.status, b.shopify?.status], ['gebucht', undefined], 'der zweite Klick fand die Position schon raus');
  assert.equal(u.eintrag(1).shopifyVersand.status, 'gebucht');
  const c = await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus' });
  assert.equal(c.shopify.gebucht, 1);
  assert.equal(u.z.attrappe.buchungen().length, 2);
  assert.deepEqual(u.z.attrappe.buchungen()[1].variables.fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems.map(x => x.id), ['gid://shopify/FulfillmentOrderLineItem/12']);
});

test('Recht fehlt: Schritt steht trotzdem, Shopify unberuehrt, Klartext, nachholbar sobald das Recht da ist', async () => {
  const u = umgebung({ attrappe: versandAttrappe({ verweigert: 'buchen' }) });
  const r = await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus' });
  assert.equal(r.shopify.status, 'fehler');
  assert.equal(r.shopify.grund, 'recht-fehlt');
  assert.match(r.shopify.meldung, /write_merchant_managed_fulfillment_orders/);
  assert.equal(u.z.attrappe.zustand.fos[0].zeilen.every(z => z.offen === 1), true, 'in Shopify nichts gebucht');
  assert.deepEqual([u.eintrag(1).status, u.eintrag(2).status], ['raus', 'raus']);
  assert.deepEqual([r.versandNachholen.anzahl, r.versandNachholen.unklar], [2, false]);
  assert.ok(letzteEintraege(protokollPfad(), 5).some(e => e.aktion === 'Versand in Shopify nicht gebucht' && /write_merchant_managed/.test(e.objekt)));
  // Bestellliste und Akte tragen den Hinweis.
  const zeile = u.api.kundenBestellungen().zeilen.find(z => z.orderId === BESTELLUNG);
  assert.equal(zeile.versandHinweis, 'Versand in Shopify nicht gebucht – in der Bestellung nachholen');
  assert.equal(zeile.versandNachholen.anzahl, 2);
  // Recht erteilt (Dienst neu gestartet, frischer Token): nachholen.
  u.z.attrappe = versandAttrappe();
  const n = await u.setze({ aktion: 'versandNachholen', orderId: BESTELLUNG });
  assert.equal(n.shopify.status, 'gebucht');
  assert.equal(n.shopify.gebucht, 2);
  assert.equal(n.versandNachholen, null);
  assert.equal(u.api.kundenBestellungen().zeilen.find(z => z.orderId === BESTELLUNG).versandHinweis, null, 'gebucht - der Hinweis faellt, auch wenn der Export noch "unerfuellt" sagt');
  await assert.rejects(() => u.setze({ aktion: 'versandNachholen', orderId: BESTELLUNG }), e => e instanceof ApiError && e.status === 409);
});

test('Netzfehler und fehlender Zugang: Schritt steht, Fehler sichtbar; unklar wird nie als "nicht gebucht" gemeldet', async () => {
  const ohne = umgebung({ zugang: false });
  const r = await ohne.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(1)] });
  assert.deepEqual([r.shopify.status, r.shopify.grund], ['fehler', 'kein-zugang']);
  assert.equal(ohne.eintrag(1).status, 'raus');
  // Teillieferung (Position 2 noch nicht raus): der Hinweis steht trotzdem in der Bestellliste.
  assert.equal(ohne.api.kundenBestellungen().zeilen.find(z => z.orderId === BESTELLUNG).versandHinweis, 'Versand in Shopify nicht gebucht – in der Bestellung nachholen');

  const netz = umgebung({ attrappe: versandAttrappe({ antwortWeg: 'vor', lesenScheitert: [2] }) });
  const u = await netz.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(1)] });
  assert.equal(u.shopify.status, 'unklar');
  assert.equal(netz.eintrag(1).shopifyVersand.status, 'unklar');
  assert.ok(letzteEintraege(protokollPfad(), 5).some(e => e.aktion === 'Versand in Shopify unklar'));

  const verloren = umgebung({ attrappe: versandAttrappe({ antwortWeg: 'nach' }) });
  const v = await verloren.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(1)] });
  assert.equal(v.shopify.status, 'gebucht', 'Antwort verloren, laut erneutem Lesen gebucht');
});

test('Bereits in Shopify erfuellt: nichts geschrieben, Vermerk "bereits"', async () => {
  const u = umgebung({ attrappe: versandAttrappe({ fos: [fo('1', [{ n: 1, offen: 0 }, { n: 2, offen: 0 }], { status: 'CLOSED' })] }) });
  const r = await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus' });
  assert.equal(r.shopify.status, 'bereits');
  assert.equal(u.z.attrappe.schreibend().length, 0);
  assert.equal(u.eintrag(1).shopifyVersand.status, 'bereits');
});

test('Keine rueckwirkende Buchung: alte "raus"-Positionen ohne Vermerk bleiben unberuehrt, auch bei Korrekturen', async () => {
  const u = umgebung();
  fs.writeFileSync(path.join(u.dir, 'auftragsstatus.json'), JSON.stringify({ version: 1, positionen: {
    [`${BESTELLUNG}::${li(1)}`]: { orderId: BESTELLUNG, lineItemId: li(1), status: 'raus', rausAm: '2026-10-01T10:00:00Z' },
    [`${BESTELLUNG}::${li(2)}`]: { orderId: BESTELLUNG, lineItemId: li(2), status: 'erledigt', erledigtAm: '2026-10-02T10:00:00Z' },
  } }));
  await u.setze({ orderId: BESTELLUNG, lineItemId: li(1), status: 'erledigt' });
  await u.setze({ orderId: BESTELLUNG, lineItemId: li(2), status: 'raus' }); // Korrektur zurueck
  await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus' });
  assert.equal(u.z.attrappe.aufrufe.length, 0, 'Shopify nie angefragt');
  await assert.rejects(() => u.setze({ aktion: 'versandNachholen', orderId: BESTELLUNG }), e => e.status === 409);
});

test('Testbestellung: nicht in Shopify gebucht; persoenlich uebergebene Muster: gebucht ohne Versandmail', async () => {
  const u = umgebung();
  const t = await u.setze({ aktion: 'schritt', orderId: TEST, schritt: 'raus' });
  assert.equal(t.shopify.status, 'uebersprungen');
  assert.equal(u.z.attrappe.aufrufe.length, 0);

  await u.setze({ aktion: 'musterHerkunft', orderId: BESTELLUNG, herkunft: 'eigen_vorbei' });
  const r = await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'kunde_hat_muster' });
  assert.equal(r.shopify.status, 'gebucht');
  assert.equal(r.shopify.kundeBenachrichtigt, false);
  assert.equal(u.z.attrappe.buchungen()[0].variables.fulfillment.notifyCustomer, false);
});

test('Auswahl nur bei "raus", leere Auswahl abgelehnt; "Zurück auf offen" legt den Vermerk in den Verlauf', async () => {
  const u = umgebung();
  await assert.rejects(() => u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'bestellt', lineItemIds: [li(1)] }), e => e.status === 400);
  await assert.rejects(() => u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(99)] }), e => e.status === 400);
  await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(1)], versand: { sendungsnummer: 'X1' } });
  await u.setze({ aktion: 'zurueckAufOffen', orderId: BESTELLUNG, lineItemId: li(1) });
  const e = u.eintrag(1);
  assert.equal(e.shopifyVersand, undefined);
  assert.equal(e.sendungsnummer, undefined);
  assert.equal(e.verlauf.at(-1).vorher.shopifyVersand.status, 'gebucht');
  assert.equal(e.verlauf.at(-1).vorher.sendungsnummer, 'X1');
});

test('Browser-Regeln: Kandidaten, Vorauswahl (Eigenleistung mit der letzten Ware), Uebergabe, Rueckmeldung', () => {
  const auftrag = { id: 'O', positionen: [
    { lineItemId: 'A', titel: 'Teppich' }, { lineItemId: 'B', titel: 'Teppich 2' }, { lineItemId: 'K', titel: 'Kettelservice', eigenleistung: true }, { lineItemId: 'D', titel: 'schon raus' }, { lineItemId: null },
  ] };
  const k = versandKandidaten(auftrag, { 'O::D': { status: 'raus' }, 'O::A': { status: 'geliefert' } });
  assert.deepEqual(k.map(p => p.lineItemId), ['A', 'B', 'K']);
  assert.deepEqual([...vorauswahl(k)], ['A', 'B', 'K'], 'ganzer Auftrag: alles');
  assert.deepEqual([...vorauswahl(k, { geklickt: 'A' })], ['A'], 'B ist noch offen - Kettelservice wartet');
  assert.deepEqual([...vorauswahl(k.filter(p => p.lineItemId !== 'B'), { geklickt: 'A' })], ['A', 'K'], 'letzte Ware nimmt die Eigenleistung mit');
  assert.equal(istUebergabe([{ musterHerkunft: 'eigen_vorbei' }]), true);
  assert.equal(istUebergabe([{ musterHerkunft: 'eigen_vorbei' }, { musterHerkunft: 'lieferant' }]), false);
  assert.equal(istUebergabe([]), false);
  assert.deepEqual(versandRueckmeldung('Als verschickt eingetragen', null), { text: 'Als verschickt eingetragen', ton: '' });
  assert.equal(versandRueckmeldung('Als verschickt eingetragen', { status: 'gebucht', meldung: 'In Shopify als versendet gebucht.' }).ton, '');
  const f = versandRueckmeldung('Als verschickt eingetragen', { status: 'fehler', meldung: 'Versand nicht in Shopify gebucht: Recht fehlt.' });
  assert.deepEqual(f, { text: 'Als verschickt eingetragen – aber Versand nicht in Shopify gebucht: Recht fehlt.', ton: 'crit' });
});

test('Nachholen behaelt die Wahl "ohne Mail" und bucht je Sendungsnummer getrennt; endgueltige Gruende ohne roten Hinweis', async () => {
  const u = umgebung({ zugang: false });
  // Zwei Pakete, beide scheitern (kein Zugang): A mit GLS-Nummer, B mit DHL-Nummer und ohne Mail.
  await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(1)], versand: { sendungsnummer: 'G1', versanddienst: 'GLS', benachrichtigen: true } });
  await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(2)], versand: { sendungsnummer: 'D2', versanddienst: 'DHL', benachrichtigen: false } });
  assert.deepEqual([u.eintrag(1).versandMail, u.eintrag(2).versandMail], [true, false]);
  u.z.aktiv = true;
  const n = await u.setze({ aktion: 'versandNachholen', orderId: BESTELLUNG });
  assert.equal(n.shopify.status, 'gebucht');
  const b = u.z.attrappe.buchungen().map(x => x.variables.fulfillment);
  assert.equal(b.length, 2, 'eine Buchung je Sendung');
  assert.deepEqual(b.map(x => [x.trackingInfo.number, x.trackingInfo.company, x.notifyCustomer]), [['G1', 'GLS', true], ['D2', 'DHL', false]]);

  // Persoenlich vorbeigebrachtes Muster ohne Angabe zur Mail (Einzelweg, dann Nachholen): ohne Mail.
  const v = umgebung();
  await v.setze({ aktion: 'musterHerkunft', orderId: BESTELLUNG, herkunft: 'eigen_vorbei' });
  await v.setze({ orderId: BESTELLUNG, lineItemId: li(1), status: 'raus' });
  await v.setze({ aktion: 'versandNachholen', orderId: BESTELLUNG });
  assert.equal(v.z.attrappe.buchungen()[0].variables.fulfillment.notifyCustomer, false);

  // Storniert: Vermerk "uebersprungen", kein roter Hinweis, nichts nachzuholen.
  const s = umgebung({ attrappe: versandAttrappe({ storniert: true }) });
  const r = await s.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus' });
  assert.equal(r.shopify.status, 'uebersprungen');
  assert.equal(r.versandNachholen, null);
  assert.equal(s.eintrag(1).shopifyVersand.status, 'uebersprungen');
  await assert.rejects(() => s.setze({ aktion: 'versandNachholen', orderId: BESTELLUNG }), e => e.status === 409);
});

test('Nur unbekannte Positionen: "uebersprungen" in Antwort und Vermerk, kein roter Hinweis', async () => {
  const u = umgebung({ attrappe: versandAttrappe({ fos: [fo('1', [{ n: 3 }])] }) });
  const r = await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: [li(1)] });
  assert.deepEqual([r.shopify.status, r.shopify.grund], ['uebersprungen', 'unbekannt']);
  assert.equal(u.eintrag(1).shopifyVersand.status, 'uebersprungen');
  assert.equal(r.versandNachholen, null);
});
