import test from 'node:test';
import assert from 'node:assert/strict';
import { bestellzeile, fortschritt } from '../lib/bestellliste.mjs';
import { aufbereiten } from '../lib/bestelluebersicht.mjs';
import { positionKey } from '../lib/auftragsstatus.mjs';

const auftrag = { id: 'synthetisch', name: '#TEST', details: {}, checks: {}, positionen: [
  { lineItemId: 'ware', istMuster: false }, { lineItemId: 'muster', istMuster: true },
] };
test('Bestellantwort liefert positionsweisen aktuellen Stand und unabhaengigen Warenfortschritt', () => {
  const eintrag = { status: 'geliefert', beschaffung: { liefertermin: '2026-10-22' } };
  const statusAlle = { [positionKey(auftrag.id, 'ware')]: eintrag };
  const z = bestellzeile(auftrag, { statusAlle });
  assert.equal(z.fortschritt.stufe, 'offen');
  assert.equal(z.warenFortschritt.stufe, 'geliefert');
  assert.equal(z.warenFortschritt.gesamt, 1);
  assert.deepEqual(z.positionsstatus, { ware: eintrag, muster: null });
  assert.equal(z.auftrag, auftrag, 'Details behalten alle Positionen');
});

test('fremde Bestellpositionen gelangen nicht in den API-Stand und fehlende Kennung bleibt unklar', () => {
  const mitFehlenderKennung = { ...auftrag, positionen: [...auftrag.positionen, { istMuster: false }] };
  const statusAlle = { [positionKey('andere-bestellung', 'ware')]: { status: 'erledigt' } };
  const z = bestellzeile(mitFehlenderKennung, { statusAlle });
  assert.deepEqual(z.positionsstatus, { ware: null, muster: null });
  assert.equal(z.warenFortschritt.unklar, true);
  assert.equal(z.warenFortschritt.gesamt, 2);
  assert.equal(z.warenFortschritt.erledigt, 0);
});

test('reine Warenbestellung verwendet denselben vorhandenen Fortschrittsalgorithmus', () => {
  const a = { ...auftrag, positionen: [{ lineItemId: 'ware' }] };
  const statusAlle = { [positionKey(a.id, 'ware')]: { status: 'erledigt' } };
  const vorher = JSON.stringify({ a, statusAlle });
  assert.deepEqual(bestellzeile(a, { statusAlle }).warenFortschritt, fortschritt(a, statusAlle));
  assert.equal(JSON.stringify({ a, statusAlle }), vorher);
});

test('Warenhinweise verwenden vorhandene Pruefkriterien ausschliesslich auf Warenpositionen', () => {
  const a = { ...auftrag, bezahlt: 'PAID', offen: true, positionen: [
    { lineItemId: 'ware', istMuster: false, masspruefung: { status: 'abweichung' } },
    { lineItemId: 'muster', istMuster: true, grosshaendlerId: 'UNGEKLAERT' },
  ] };
  const z = bestellzeile(a);
  assert.deepEqual(z.warenWasFehlt, ['Maßprüfung offen (1)']);
  assert.ok(z.wasFehlt.includes('1 Position ohne Großhändler-ID'));
});

function modellMitService(handles) {
  return aufbereiten({ orders: [{ id: 'synthetisch-service', name: '#TEST-SERVICE',
    createdAt: '2026-10-20T12:00:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
    lineItems: { nodes: handles.map((handle, i) => ({ id: `test-position-${i}`, sku: `TEST-SERVICE-${i}`,
      title: `Testleistung ${i}`, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1, customAttributes: [],
      variant: { id: `test-variante-${i}`, metafields: { nodes: [] }, lieferant: { nodes: [] },
        product: { id: `test-produkt-${i}`, handle, productType: 'Service', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
    })) },
  }] }).auftraege[0];
}

test('erkannte Eigenleistungen brauchen trotz fehlender Artikelnummer und idGrund keine Lieferanten-ID', () => {
  const a = modellMitService(['kettelservice', 'wunschmass-pauschale', 'sperrgut-versand-treppenkante']);
  assert.ok(a.positionen.every(p => p.eigenleistung && p.grosshaendlerId === 'UNGEKLAERT' && p.idGrund),
    'Regression startet mit dem tatsaechlich abgeleiteten Modell, nicht mit bereinigten Servicefeldern');
  const vorher = JSON.stringify(a);
  const z = bestellzeile(a);
  assert.doesNotMatch(z.wasFehlt.join(' '), /Großhändler-ID/);
  assert.doesNotMatch(z.warenWasFehlt.join(' '), /Großhändler-ID/);
  assert.equal(JSON.stringify(a), vorher, 'Nur der Hinweis aendert sich, keine Positions- oder Statusdaten');
});

test('Service mit benoetigtem Material behaelt seinen fehlenden Lieferantenbezug neben Eigenleistung', () => {
  const a = modellMitService(['kettelservice', 'test-service-mit-material']);
  assert.equal(a.positionen[0].eigenleistung, true);
  assert.equal(a.positionen[1].eigenleistung, false, 'Produktart Service allein reicht nicht fuer Eigenleistung');
  const z = bestellzeile(a);
  assert.deepEqual(z.wasFehlt.filter(t => /Großhändler-ID/.test(t)), ['1 Position ohne Großhändler-ID']);
  assert.deepEqual(z.warenWasFehlt.filter(t => /Großhändler-ID/.test(t)), ['1 Position ohne Großhändler-ID']);
});

test('Eigenleistung bleibt ohne Bestellpositionskennung weiterhin nachvollziehbar zu klaeren', () => {
  const a = modellMitService(['kettelservice']);
  a.positionen[0].lineItemId = null;
  const z = bestellzeile(a);
  assert.ok(z.wasFehlt.some(t => /ohne Bestellpositionskennung/.test(t)));
  assert.ok(z.warenWasFehlt.some(t => /ohne Bestellpositionskennung/.test(t)));
  assert.equal(z.warenFortschritt.unklar, true);
});
