// Zwei-Wege-Abgleich Control Center <-> Shopify (operations/lib/shopify-abgleich.mjs).
// Nur erfundene IDs und Namen, keine echten Bestellungen; kein Test spricht Shopify.
import test from 'node:test';
import assert from 'node:assert/strict';
import { uebernimmAusShopify, abweichungen, entfernteBestellt, shopifyPositionen, UEBERNOMMEN_NOTIZ, STORNIERT_NOTIZ, EXPORT_NACHLAUF_MS } from '../lib/shopify-abgleich.mjs';

const O = n => `gid://shopify/Order/${n}`;
const L = n => `gid://shopify/LineItem/${n}`;
const K = (o, l) => `${O(o)}::${L(l)}`;
const JETZT = new Date('2026-10-19T12:00:00Z');

/** Bestellung mit Zeilen [{ n, menge, offen }]. */
function bestellung(n, zeilen, { storniert = null, test = false, tags = [], sendungAm = '2026-10-18T09:00:00Z' } = {}) {
  return {
    id: O(n), name: `#T${n}`, cancelledAt: storniert, test, tags,
    shippingAddress: { name: 'Testkunde' },
    fulfillments: sendungAm ? [{ status: 'SUCCESS', createdAt: sendungAm }] : [],
    lineItems: { nodes: zeilen.map(z => ({ id: L(z.n), quantity: z.menge ?? 1, currentQuantity: z.menge ?? 1, unfulfilledQuantity: z.offen ?? 0 })) },
  };
}
const eintrag = (o, l, status, extra = {}) => ({ orderId: O(o), lineItemId: L(l), status, ...(status ? { [`${status}Am`]: '2026-10-10T08:00:00Z' } : {}), ...extra });

test('Shopify erfuellt hebt lokal auf "raus" - aus "bestellt", "geliefert" und ohne Stand, mit Vermerk und Zeitpunkt', () => {
  const orders = [bestellung(1, [{ n: 1 }, { n: 2 }, { n: 3 }])];
  const vorher = { [K(1, 1)]: eintrag(1, 1, 'bestellt', { lieferantBestellnummer: 'LB-1' }), [K(1, 2)]: eintrag(1, 2, 'geliefert') };
  const r = uebernimmAusShopify(vorher, orders, { jetzt: JETZT });
  assert.deepEqual(r.gehoben.map(x => x.vonStatus), ['bestellt', 'geliefert', null]);
  for (const l of [1, 2, 3]) {
    const e = r.positionen[K(1, l)];
    assert.equal(e.status, 'raus');
    assert.equal(e.rausNotiz, UEBERNOMMEN_NOTIZ);
    assert.equal(e.rausVon, 'Shopify');
    assert.equal(e.rausAm, '2026-10-18T09:00:00Z', 'Zeitpunkt der Sendung aus Shopify');
    assert.equal(e.ausShopify.am, JETZT.toISOString());
    assert.equal(e.shopifyVersand.status, 'bereits');
  }
  assert.equal(r.positionen[K(1, 1)].lieferantBestellnummer, 'LB-1', 'bisherige Angaben bleiben');
  assert.equal(r.positionen[K(1, 1)].bestelltAm, '2026-10-10T08:00:00Z');
  assert.equal(vorher[K(1, 1)].status, 'bestellt', 'Eingabe wird nicht veraendert');
});

test('Nie herabstufen, nie "erledigt" anfassen; idempotent', () => {
  const orders = [bestellung(1, [{ n: 1 }, { n: 2 }])];
  const vorher = {
    [K(1, 1)]: eintrag(1, 1, 'erledigt', { erledigtNotiz: 'Kunde fertig', shopifyVersand: { status: 'gebucht', am: '2026-10-11T00:00:00Z' } }),
    [K(1, 2)]: eintrag(1, 2, 'raus', { shopifyVersand: { status: 'gebucht', am: '2026-10-11T00:00:00Z' } }),
  };
  const r = uebernimmAusShopify(vorher, orders, { jetzt: JETZT });
  assert.equal(r.gehoben.length + r.storniert.length + r.vermerkt.length, 0);
  assert.deepEqual(r.positionen, vorher);
  const einmal = uebernimmAusShopify({}, orders, { jetzt: JETZT });
  const zweimal = uebernimmAusShopify(einmal.positionen, orders, { jetzt: new Date('2026-10-19T12:10:00Z') });
  assert.equal(zweimal.gehoben.length + zweimal.storniert.length + zweimal.vermerkt.length, 0, 'zweiter Lauf aendert nichts');
  assert.deepEqual(zweimal.positionen, einmal.positionen);
});

test('Nur vollstaendig erfuellte Zeilen; Teilmenge, entfernte Zeile und alter Export ohne Mengen entscheiden nichts', () => {
  const orders = [{
    ...bestellung(1, []),
    lineItems: { nodes: [
      { id: L(1), quantity: 3, currentQuantity: 3, unfulfilledQuantity: 1 },
      { id: L(2), quantity: 1, currentQuantity: 0, unfulfilledQuantity: 0 },
      { id: L(3), quantity: 1 },
    ] },
  }];
  const vorher = { [K(1, 1)]: eintrag(1, 1, 'bestellt'), [K(1, 2)]: eintrag(1, 2, 'bestellt'), [K(1, 3)]: eintrag(1, 3, 'bestellt') };
  const r = uebernimmAusShopify(vorher, orders, { jetzt: JETZT });
  assert.equal(r.gehoben.length, 0);
  assert.deepEqual(r.positionen, vorher);
  const s = shopifyPositionen(orders);
  assert.deepEqual([s.get(K(1, 1)).offen, s.get(K(1, 2)).offen, s.get(K(1, 3)).offen], [true, false, false]);
});

test('Von Hand zurueckgesetzt NACH der Sendung: die Entscheidung gilt; davor zurueckgesetzt: wird gehoben', () => {
  const orders = [bestellung(1, [{ n: 1 }, { n: 2 }, { n: 3 }])];
  const vorher = {
    [K(1, 1)]: eintrag(1, 1, null, { zurueckGesetztAm: '2026-10-18T10:00:00Z' }),
    [K(1, 2)]: eintrag(1, 2, 'geliefert', { wiederGeoeffnetAm: '2026-10-18T11:00:00Z' }),
    [K(1, 3)]: eintrag(1, 3, 'bestellt', { zurueckGesetztAm: '2026-10-17T10:00:00Z' }),
  };
  const r = uebernimmAusShopify(vorher, orders, { jetzt: JETZT });
  assert.deepEqual(r.gehoben.map(x => x.lineItemId), [L(3)]);
  assert.equal(r.positionen[K(1, 1)].status, null);
  assert.equal(r.positionen[K(1, 2)].status, 'geliefert');
});

test('Stornierte Bestellung: begonnene Positionen werden erledigt (nicht mehr offene Arbeit), ohne Stand passiert nichts', () => {
  const orders = [bestellung(1, [{ n: 1, offen: 1 }, { n: 2, offen: 1 }, { n: 3, offen: 1 }], { storniert: '2026-10-15T10:00:00Z', sendungAm: null })];
  const vorher = { [K(1, 1)]: eintrag(1, 1, 'bestellt'), [K(1, 2)]: eintrag(1, 2, 'erledigt', { erledigtNotiz: 'alt' }) };
  const r = uebernimmAusShopify(vorher, orders, { jetzt: JETZT });
  assert.deepEqual(r.storniert.map(x => x.lineItemId), [L(1)]);
  assert.equal(r.positionen[K(1, 1)].status, 'erledigt');
  assert.equal(r.positionen[K(1, 1)].erledigtNotiz, STORNIERT_NOTIZ);
  assert.equal(r.positionen[K(1, 1)].ausShopify.grund, 'storniert');
  assert.equal(r.positionen[K(1, 2)].erledigtNotiz, 'alt', 'erledigt bleibt, wie es war');
  assert.equal(r.positionen[K(1, 3)], undefined, 'kein Eintrag ohne Stand');
  assert.equal(abweichungen(r.positionen, orders).length, 0, 'storniert ist nie eine Abweichung');
});

test('Schon raus/erledigt, Vermerk "nicht gebucht" oder keiner: Shopify hat versendet - Vermerk wird richtiggestellt', () => {
  const orders = [bestellung(1, [{ n: 1 }, { n: 2 }, { n: 3 }])];
  const vorher = {
    [K(1, 1)]: eintrag(1, 1, 'raus'),
    [K(1, 2)]: eintrag(1, 2, 'erledigt', { shopifyVersand: { status: 'fehler', grund: 'recht-fehlt' } }),
    [K(1, 3)]: eintrag(1, 3, 'raus', { shopifyVersand: { status: 'uebersprungen', grund: 'testbestellung' } }),
  };
  const r = uebernimmAusShopify(vorher, orders, { jetzt: JETZT });
  assert.deepEqual(r.vermerkt.map(x => x.lineItemId), [L(1), L(2)]);
  assert.equal(r.positionen[K(1, 2)].status, 'erledigt');
  assert.equal(r.positionen[K(1, 2)].shopifyVersand.status, 'bereits');
  assert.equal(r.positionen[K(1, 3)].shopifyVersand.status, 'uebersprungen');
});

test('Abweichungen: im Dashboard abgehakt, in Shopify offen - je Bestellung eine Zeile, aelteste zuerst', () => {
  const exportiertAm = '2026-10-19T11:00:00Z';
  const frueh = new Date(Date.parse(exportiertAm) - EXPORT_NACHLAUF_MS - 60_000).toISOString();
  const orders = [
    bestellung(1, [{ n: 1, offen: 1 }, { n: 2, offen: 1 }, { n: 3, offen: 1 }], { sendungAm: null }),
    bestellung(2, [{ n: 4, offen: 2, menge: 2 }], { sendungAm: null }),
    bestellung(3, [{ n: 5, offen: 1 }], { test: true, sendungAm: null }),
    bestellung(4, [{ n: 6, offen: 1 }], { tags: ['TESTBESTELLUNG'], sendungAm: null }),
    bestellung(5, [{ n: 7, offen: 1 }], { sendungAm: null }),
    bestellung(6, [{ n: 8, offen: 1 }], { sendungAm: null }),
  ];
  const pos = {
    [K(1, 1)]: eintrag(1, 1, 'erledigt', { erledigtAm: '2026-10-05T10:00:00Z' }),
    [K(1, 2)]: eintrag(1, 2, 'raus', { rausAm: '2026-10-06T10:00:00Z', shopifyVersand: { status: 'fehler' } }),
    [K(1, 3)]: eintrag(1, 3, 'bestellt'),
    [K(2, 4)]: eintrag(2, 4, 'erledigt', { erledigtAm: '2026-10-01T10:00:00Z' }),
    [K(3, 5)]: eintrag(3, 5, 'erledigt'),
    [K(4, 6)]: eintrag(4, 6, 'erledigt'),
    // Gerade gebucht, der Export kennt es noch nicht: keine Abweichung.
    [K(5, 7)]: eintrag(5, 7, 'raus', { shopifyVersand: { status: 'gebucht', am: '2026-10-19T10:50:00Z' } }),
    // Laengst gebucht, Shopify fuehrt es trotzdem offen (Sendung dort storniert): Abweichung.
    [K(6, 8)]: eintrag(6, 8, 'raus', { rausAm: '2026-10-09T10:00:00Z', shopifyVersand: { status: 'gebucht', am: frueh } }),
  };
  const a = abweichungen(pos, orders, { exportiertAm });
  assert.deepEqual(a.map(z => z.orderId), [O(2), O(1), O(6)]);
  assert.deepEqual(a[1].lineItemIds, [L(1), L(2)]);
  assert.equal(a[1].seit, '2026-10-05T10:00:00Z');
  assert.equal(a[1].kunde, 'Testkunde');
  assert.deepEqual(a[1].positionen.map(p => [p.status, p.versand]), [['erledigt', null], ['raus', 'fehler']]);
  // Uebersprungen (endgueltig, z. B. Shopify-Testbestellung) zaehlt nie.
  pos[K(2, 4)] = { ...pos[K(2, 4)], shopifyVersand: { status: 'uebersprungen' } };
  assert.deepEqual(abweichungen(pos, orders, { exportiertAm }).map(z => z.orderId), [O(1), O(6)]);
});

test('Aus der Bestellung entfernt, beim Lieferanten "bestellt": je Bestellung eine Zeile; sonst nichts', () => {
  const zeile = (n, menge, aktuell) => ({ id: L(n), quantity: menge, currentQuantity: aktuell, unfulfilledQuantity: 0 });
  const orders = [
    { ...bestellung(1, []), lineItems: { nodes: [zeile(1, 2, 0), zeile(2, 1, 0), zeile(3, 3, 3), zeile(4, 1, 0), { id: L(5), quantity: 1 }] } },
    { ...bestellung(2, [], { storniert: '2026-10-12T08:00:00Z' }), lineItems: { nodes: [zeile(6, 1, 0)] } },
    { ...bestellung(3, [], { test: true }), lineItems: { nodes: [zeile(7, 1, 0)] } },
  ];
  const pos = {
    [K(1, 1)]: eintrag(1, 1, 'bestellt', { bestelltAm: '2026-10-11T08:00:00Z', lieferantBestellnummer: 'AB-1' }),
    [K(1, 2)]: eintrag(1, 2, 'bestellt', { bestelltAm: '2026-10-10T09:00:00Z' }),
    [K(1, 3)]: eintrag(1, 3, 'bestellt'),            // noch in der Bestellung
    [K(1, 4)]: eintrag(1, 4, 'erledigt'),            // schon abgehakt
    [K(1, 5)]: eintrag(1, 5, 'bestellt'),            // alter Export ohne aktuelle Menge
    [K(2, 6)]: eintrag(2, 6, 'bestellt'),            // storniert: erledigt uebernimmAusShopify
    [K(3, 7)]: eintrag(3, 7, 'bestellt'),            // Testbestellung
  };
  const s = shopifyPositionen(orders);
  assert.deepEqual([1, 2, 3, 5].map(n => s.get(K(1, n)).entfernt), [true, true, false, false]);
  const r = entfernteBestellt(pos, orders);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].lineItemIds, [L(1), L(2)]);
  assert.equal(r[0].seit, '2026-10-10T09:00:00Z');
  assert.equal(r[0].kunde, 'Testkunde');
  assert.deepEqual(r[0].positionen[0], { lineItemId: L(1), bestelltAm: '2026-10-11T08:00:00Z', lieferantBestellnummer: 'AB-1' });
  // Zurueck auf offen (kein Status mehr): faellt heraus.
  assert.deepEqual(entfernteBestellt({ ...pos, [K(1, 1)]: { ...pos[K(1, 1)], status: null }, [K(1, 2)]: { ...pos[K(1, 2)], status: null } }, orders), []);
});
