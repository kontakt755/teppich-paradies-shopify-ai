import test from 'node:test';
import assert from 'node:assert/strict';
import { aufbereiten } from '../lib/bestelluebersicht.mjs';
import { bestellliste, fortschritt, istFertig, wasFehlt, kundenFortschritt, wendeFilterAn, FILTERCHIPS } from '../lib/bestellliste.mjs';
import { kundenIndex, sucheKunden } from '../lib/kundensuche.mjs';
import { positionKey } from '../lib/auftragsstatus.mjs';

// Nur synthetische Testdaten: erfundene Kundennamen, keine echten Bestell- oder Kontaktdaten.
const mf = (namespace, key, value) => ({ namespace, key, value });

function zeile({ id, sku, title, variantTitle = null, quantity = 1, attrs = [], einkauf = [], lieferant = [], custom = [], gh = null, handle = 'testprodukt', variant = true }) {
  return {
    id: `gid://shopify/LineItem/${id}`, sku, title, variantTitle, quantity, currentQuantity: quantity, unfulfilledQuantity: quantity,
    customAttributes: attrs,
    variant: variant ? {
      id: `gid://shopify/ProductVariant/${id}`, sku, title: variantTitle ?? 'Default Title',
      metafields: { nodes: einkauf.map(([k, v]) => mf('einkauf', k, v)) },
      lieferant: { nodes: lieferant.map(([k, v]) => mf('lieferant', k, v)) },
      product: {
        id: `gid://shopify/Product/${id}`, handle, title,
        metafields: { nodes: custom.map(([k, v]) => mf('custom', k, v)) },
        grosshandel: { nodes: gh ? [mf('grosshandel', 'sku', gh)] : [] },
      },
    } : null,
  };
}

function bestellung(nr, zeilen, extra = {}) {
  return {
    id: `gid://shopify/Order/9000${nr}`, name: `#T${nr}`, createdAt: `2026-01-0${nr}T10:00:00Z`, cancelledAt: null,
    displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
    customer: { id: `gid://shopify/Customer/500${nr}`, displayName: `Testkunde ${nr}`, email: `testkunde${nr}@example.invalid`, phone: `+4930000000${nr}` },
    sourceName: 'web',
    lineItems: { nodes: zeilen }, ...extra,
  };
}

const zeileA = zeile({ id: 1, sku: 'TEST-A-1', title: 'Testdiele Eiche', variantTitle: 'Natur', quantity: 3,
  einkauf: [['lieferant', 'B'], ['bestelleinheit', 'paket'], ['route', 'SUPPLIER_TO_TP']],
  lieferant: [['lieferant_b_artikelnummer', 'B-4711']], custom: [['qm_pro_paket', '2,2']] });
const zeileB = zeile({ id: 2, sku: 'TEST-B-1', title: 'Testboden Vinyl', variantTitle: 'Grau', quantity: 2,
  einkauf: [['lieferant', 'A'], ['bestelleinheit', 'paket'], ['route', 'SUPPLIER_TO_TP']],
  lieferant: [['lieferant_a_artikelnummer', 'A-0815']], custom: [['qm_pro_paket', '1,5']] });

const modell = aufbereiten({
  orders: [
    bestellung(1, [zeileA]),
    bestellung(2, [zeileB], { name: '#T2', displayFinancialStatus: 'PENDING', tags: ['BERATUNG-JA'], customAttributes: [{ key: 'Beratung', value: 'Ja' }] }),
    bestellung(3, [zeileA, zeileB], { name: '#T3', cancelledAt: '2026-01-04T00:00:00Z' }),
    { ...bestellung(4, [zeileA], { name: '#TEST-4', tags: ['TESTBESTELLUNG'] }) },
  ],
});

test('fortschritt: schwaechste Position bestimmt den Gesamtstatus', () => {
  const auftrag = modell.auftraege.find(a => a.name === '#T3');
  const [p1, p2] = auftrag.positionen;
  const statusAlle = {
    [positionKey(auftrag.id, p1.lineItemId)]: { status: 'erledigt' },
    [positionKey(auftrag.id, p2.lineItemId)]: { status: 'bestellt' },
  };
  const f = fortschritt(auftrag, statusAlle);
  assert.equal(f.stufe, 'bestellt');
  assert.equal(f.erledigt, 1);
  assert.equal(f.gesamt, 2);
});

test('fortschritt: ohne jeden Eintrag ist die Bestellung "offen"', () => {
  const auftrag = modell.auftraege.find(a => a.name === '#T1');
  const f = fortschritt(auftrag, {});
  assert.equal(f.stufe, 'offen');
  assert.equal(f.text, 'Offen');
});

test('fortschritt: alle Positionen erledigt ergibt "erledigt"', () => {
  const auftrag = modell.auftraege.find(a => a.name === '#T1');
  const statusAlle = { [positionKey(auftrag.id, auftrag.positionen[0].lineItemId)]: { status: 'erledigt' } };
  const f = fortschritt(auftrag, statusAlle);
  assert.equal(f.stufe, 'erledigt');
});

test('wasFehlt: nennt fehlendes Telefon trotz Beratung', () => {
  const auftrag = modell.auftraege.find(a => a.name === '#T2');
  assert.ok(wasFehlt(auftrag, null).includes('Telefon fehlt trotz Beratung'));
});

test('bestellliste: fertig/fortschritt/wasFehlt stehen auf jeder Zeile', () => {
  const zeilen = bestellliste(modell);
  const z1 = zeilen.find(z => z.orderName === '#T1');
  assert.equal(typeof z1.fertig, 'boolean');
  assert.ok(z1.fortschritt);
  assert.ok(Array.isArray(z1.wasFehlt));
});

test('bestellliste: Testbestellungen bleiben ausserhalb der Standardliste', () => {
  const zeilen = wendeFilterAn(bestellliste(modell), '');
  assert.ok(!zeilen.some(z => z.testbestellung));
});

test('FILTERCHIPS: "nicht_fertig" steht an erster Stelle (Voreinstellung)', () => {
  assert.equal(FILTERCHIPS[0], 'nicht_fertig');
});

test('wendeFilterAn "nicht_fertig" und "fertig" schliessen sich aus und Testbestellungen bleiben draussen', () => {
  const zeilen = bestellliste(modell);
  const nicht = wendeFilterAn(zeilen, 'nicht_fertig');
  const fertig = wendeFilterAn(zeilen, 'fertig');
  assert.ok(nicht.every(z => !z.fertig && !z.testbestellung));
  assert.ok(fertig.every(z => z.fertig && !z.testbestellung));
});

test('kundenFortschritt: zaehlt offene Bestellungen ueber mehrere Auftraege', () => {
  const auftraege = modell.auftraege.filter(a => a.name === '#T1' || a.name === '#T3');
  const f = kundenFortschritt(auftraege, {});
  assert.equal(f.gesamt, 2);
  assert.equal(f.fertig, false);
});

test('kundenFortschritt: Testbestellungen zaehlen nicht mit', () => {
  const nurTest = modell.testauftraege;
  const f = kundenFortschritt(nurTest, {});
  assert.equal(f.gesamt, 0);
  assert.equal(f.fertig, true);
});

test('kundenIndex traegt den Fortschritt je Kunde', () => {
  const idx = kundenIndex(modell, { statusAlle: {} });
  assert.ok(idx.every(k => k.fortschritt));
  const t1 = idx.find(k => k.auftraege.some(a => a.name === '#T1'));
  assert.equal(t1.fortschritt.fertig, false);
});

test('sucheKunden gibt den Fortschritt mit zurueck', () => {
  const treffer = sucheKunden(modell, 'Testkunde 1', { statusAlle: {} });
  assert.equal(treffer.length, 1);
  assert.ok(treffer[0].fortschritt);
});

test('alleKunden: Standardfilter zeigt keine Testbestellungen', async () => {
  const { alleKunden } = await import('../lib/kundensuche.mjs');
  const alle = alleKunden(modell, { statusAlle: {} });
  assert.ok(!alle.some(k => k.nurTestbestellungen));
});

test('alleKunden: "in_arbeit" zeigt nur nicht fertige Kunden, nicht fertige zuerst sortiert', async () => {
  const { alleKunden } = await import('../lib/kundensuche.mjs');
  const liste = alleKunden(modell, { statusAlle: {}, filter: 'in_arbeit' });
  assert.ok(liste.every(k => !k.fortschritt.fertig));
});

test('alleKunden: "test" zeigt nur Kunden mit ausschliesslich Testbestellungen', async () => {
  const { alleKunden } = await import('../lib/kundensuche.mjs');
  const liste = alleKunden(modell, { statusAlle: {}, filter: 'test' });
  assert.ok(liste.length >= 1);
  assert.ok(liste.every(k => k.nurTestbestellungen));
});

test('Positionen ohne lineItemId gelten nicht still als fertig', () => {
  const auftrag = { id: 'gid://shopify/Order/77', positionen: [{ lineItemId: null, titel: 'Teppichboden' }] };
  const f = fortschritt(auftrag, {});
  assert.equal(f.unklar, true);
  assert.match(f.text, /Nicht nachverfolgbar/);
  assert.equal(istFertig(auftrag, {}), false);
  // Eine Bestellung ganz ohne Positionen bleibt wie bisher "fertig"
  assert.equal(istFertig({ id: 'gid://shopify/Order/78', positionen: [] }, {}), true);
});
