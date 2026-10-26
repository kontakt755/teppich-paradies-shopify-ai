// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aufraeumFall, aufraeumListe, letzteBewegung, packBefund, AUFRAEUMEN_AB_TAGEN } from '../lib/aufraeumen.mjs';
import { belegtFertigGrund, bestellungAusgeblendet, bestellArbeitsstand } from '../lib/bestellarbeit.mjs';
import { aufraeumenBlock } from '../ansichten/heute/aufraeumen.mjs';
import { createApi } from '../../../scripts/dashboard-api.mjs';

// Nur synthetische Daten: erfundene Kunden, keine echten Bestellungen.
const O = 'gid://shopify/Order/71';
const L = n => `gid://shopify/LineItem/71${n}`;
const JETZT = Date.parse('2026-10-26T09:00:00Z');
const vorTagen = n => new Date(JETZT - n * 86_400_000).toISOString();
function zeile({ art = 'muster', datum = vorTagen(30), status = {}, notizen = [], verlauf = [], ...extra } = {}) {
  const ids = [L(1), L(2)];
  return {
    orderId: O, orderName: '#T71', datum, kundenname: 'Testkunde', kundenSchluessel: 'email:t71@example.invalid',
    offen: true, storniert: false, testbestellung: false, fertig: false, fulfillmentstatus: 'UNFULFILLED', zahlungsstatus: 'PAID',
    auftragsart: art, zeitleisteAbgeschlossen: false, verlauf, verlaufNotizen: notizen,
    positionsstatus: Object.fromEntries(ids.map(id => [id, status[id] || null])),
    auftrag: { positionen: ids.map(lineItemId => ({ lineItemId, istMuster: art === 'muster' })) },
    ...extra,
  };
}
const bestellt = (tage, extra = {}) => ({ status: 'bestellt', bestelltAm: vorTagen(tage), aktualisiertAm: vorTagen(tage), ...extra });
const geliefert = (tage) => ({ status: 'geliefert', bestelltAm: vorTagen(tage + 2), geliefertAm: vorTagen(tage), aktualisiertAm: vorTagen(tage) });
const fall = (z, opts = {}) => aufraeumFall(z, { jetzt: JETZT, ...opts });

test('belegt fertig: in Shopify archiviert oder voll erstattet faellt ohne Klick aus der Liste', () => {
  assert.equal(belegtFertigGrund({ archiviert: true }), 'In Shopify archiviert');
  assert.equal(belegtFertigGrund({ zahlungsstatus: 'REFUNDED' }), 'Vollständig erstattet');
  assert.equal(belegtFertigGrund({ zahlungsstatus: 'VOIDED' }), 'Vollständig erstattet');
  assert.equal(belegtFertigGrund({ zahlungsstatus: 'PARTIALLY_REFUNDED' }), null, 'Teilerstattung ist kein Abschluss');
  assert.equal(belegtFertigGrund({ storniert: true, archiviert: true }), null, 'Storno regelt der Aufrufer selbst');
  assert.equal(bestellungAusgeblendet({ archiviert: true, fulfillmentstatus: 'UNFULFILLED' }), true);
  assert.equal(bestellungAusgeblendet({ zahlungsstatus: 'REFUNDED' }), true);
  assert.equal(bestellungAusgeblendet({ zahlungsstatus: 'PAID', fulfillmentstatus: 'UNFULFILLED' }), false);
  assert.deepEqual(bestellArbeitsstand({ archiviert: true }), { stand: 'In Shopify archiviert', naechstes: 'Nichts mehr zu tun' });
});

test('junge Bestellungen und belegt fertige sind kein Aufraeumfall', () => {
  assert.equal(fall(zeile({ datum: vorTagen(5), status: { [L(1)]: bestellt(5), [L(2)]: bestellt(5) } })), null);
  const alt = { status: { [L(1)]: bestellt(25), [L(2)]: bestellt(25) } };
  assert.ok(fall(zeile(alt)));
  for (const extra of [{ testbestellung: true }, { storniert: true }, { offen: false }, { archiviert: true }, { fertig: true },
    { fulfillmentstatus: 'FULFILLED' }, { abgehakt: { zeit: vorTagen(40) } }, { zeitleisteAbgeschlossen: true }, { zahlungsstatus: 'REFUNDED' },
    { fortschritt: { unklar: true } }]) {
    assert.equal(fall(zeile({ ...alt, ...extra })), null, JSON.stringify(extra));
  }
});

test('Grenze: Muster ab 14, Ware ab 30 Tagen ohne Bewegung', () => {
  assert.deepEqual(AUFRAEUMEN_AB_TAGEN, { muster: 14, ware: 30 });
  const muster = t => fall(zeile({ datum: vorTagen(t), status: { [L(1)]: bestellt(t), [L(2)]: bestellt(t) } }));
  assert.equal(muster(13), null);
  assert.equal(muster(14).tage, 14);
  const ware = t => fall(zeile({ art: 'ware', datum: vorTagen(t), status: { [L(1)]: bestellt(t), [L(2)]: bestellt(t) } }));
  assert.equal(ware(29), null);
  const w = ware(31);
  assert.equal(w.art, 'ware');
  assert.deepEqual(w.lineItemIds, [], 'Ware bekommt keinen Abschluss-Knopf');
  assert.equal(w.vorschlag.notiz, null);
});

test('jede belegte Bewegung setzt die Uhr zurueck: Status, Notiz, Zeitleiste, Packstation', () => {
  const basis = { status: { [L(1)]: bestellt(25), [L(2)]: bestellt(25) } };
  assert.equal(letzteBewegung(zeile(basis)), vorTagen(25));
  assert.equal(fall(zeile({ ...basis, notizen: [{ am: vorTagen(3), text: 'Läuft noch – beim Aufräumen bestätigt' }] })), null);
  assert.equal(fall(zeile({ ...basis, verlauf: [{ schritt: 'nachgefasst', am: vorTagen(2) }] })), null);
  const packen = { gepackt: { [`gid://shopify/Order/1,${O}`]: { zeit: vorTagen(4) } }, haken: {}, klaeren: {} };
  assert.equal(packBefund(zeile(basis), packen).gepacktAm, vorTagen(4));
  assert.equal(fall(zeile(basis), { packen }), null, 'gepackt vor 4 Tagen ist Arbeit der Packstation, kein Altfall');
  assert.equal(fall(zeile(basis), { packen: { gepackt: {}, haken: { [L(1)]: { zeit: vorTagen(1) } }, klaeren: {} } }), null);
  assert.ok(fall(zeile(basis), { packen: { gepackt: { 'gid://shopify/Order/99': { zeit: vorTagen(1) } }, haken: {}, klaeren: {} } }), 'fremder Umschlag zaehlt nicht');
});

test('Vorschlaege sagen nur, was belegt ist', () => {
  const direkt = fall(zeile({ status: { [L(1)]: bestellt(25), [L(2)]: bestellt(25) } }));
  assert.match(direkt.vorschlag.text, /direkt vom Lieferanten an den Kunden/);
  assert.equal(direkt.vorschlag.notiz, 'Aufgeräumt: wohl direkt vom Lieferanten an den Kunden (nicht belegt)');
  assert.deepEqual(direkt.lineItemIds, [L(1), L(2)]);
  assert.ok(direkt.belege.includes('Nie als angekommen erfasst'));

  // Seit dem 24.10. ist das Lieferziel gespeichert - dann kein "wahrscheinlich direkt".
  const spaet = aufraeumFall(zeile({ datum: '2026-10-24T08:00:00Z', status: { [L(1)]: { status: 'bestellt', bestelltAm: '2026-10-24T09:00:00Z' }, [L(2)]: { status: 'bestellt', bestelltAm: '2026-10-24T09:00:00Z' } } }), { jetzt: Date.parse('2026-11-10T09:00:00Z') });
  assert.match(spaet.vorschlag.text, /kamen nie an/);

  const nv = fall(zeile({ status: { [L(1)]: bestellt(22), [L(2)]: bestellt(22) }, notizen: [{ am: vorTagen(17), text: 'Muster aktuell nicht Verfügbar, Kunde per Mail informiert' }] }));
  assert.match(nv.vorschlag.text, /nicht verfügbar/);
  assert.match(nv.vorschlag.notiz, /^Aufgeräumt: Muster nicht verfügbar \(Notiz vom \d\d\.\d\d\.\)$/);

  const da = fall(zeile({ status: { [L(1)]: geliefert(20), [L(2)]: geliefert(20) } }));
  assert.match(da.vorschlag.text, /waren da/);
  const teil = fall(zeile({ status: { [L(1)]: geliefert(20), [L(2)]: bestellt(22) } }));
  assert.match(teil.vorschlag.notiz, /nur 1 von 2 Mustern/);
  const nie = fall(zeile({ datum: vorTagen(20) }));
  assert.match(nie.vorschlag.text, /Nie beim Lieferanten bestellt/);
  const folge = fall(zeile({ status: { [L(1)]: bestellt(25), [L(2)]: bestellt(25) },
    verlauf: [{ schritt: 'ergebnis', automatisch: true, am: vorTagen(20), folgeOrderName: '#T80' }] }));
  assert.match(folge.vorschlag.notiz, /Kunde hat danach bestellt \(#T80\)/);
  const halt = fall(zeile({ fulfillmentstatus: 'ON_HOLD', status: { [L(1)]: bestellt(25), [L(2)]: bestellt(25) } }));
  assert.ok(halt.belege.includes('In Shopify zurückgehalten'));
});

test('Liste: am laengsten ruhende zuerst; Block erscheint nur mit Faellen und escaped alles', () => {
  const a = { ...zeile({ status: { [L(1)]: bestellt(20), [L(2)]: bestellt(20) } }), orderId: 'A', orderName: '#A' };
  const b = { ...zeile({ status: { [L(1)]: bestellt(30), [L(2)]: bestellt(30) } }), orderId: 'B', orderName: '#B', kundenname: '<b>Kunde</b>' };
  const zeilen = [a, b].map(z => ({ ...z, aufraeumen: fall(z) }));
  assert.deepEqual(aufraeumListe(zeilen).map(z => z.orderName), ['#B', '#A']);
  assert.equal(aufraeumenBlock({ daten: { verfuegbar: true, zeilen: [] } }), '');
  assert.equal(aufraeumenBlock({ daten: { verfuegbar: false } }), '');
  const html = aufraeumenBlock({ daten: { verfuegbar: true, zeilen } });
  assert.match(html, /Alte Bestellungen aufräumen · 2/);
  assert.match(html, /&lt;b&gt;Kunde&lt;\/b&gt;/);
  assert.equal((html.match(/data-aufraeumen-abschliessen=/g) || []).length, 2);
  assert.equal((html.match(/data-aufraeumen-laeuft=/g) || []).length, 2);
  const lesend = aufraeumenBlock({ daten: { verfuegbar: true, zeilen }, lesend: true });
  assert.doesNotMatch(lesend, /data-aufraeumen-(abschliessen|laeuft)=/, 'Rolle "lesen" sieht nur "Ansehen"');
});

// API: der Server haengt den Fall an /api/kunden/bestellungen, "Läuft noch" (Notiz) nimmt ihn heraus.
const muster = id => ({
  id: `gid://shopify/LineItem/${id}`, sku: `M-TEST-${id}`, title: 'Muster Testteppich', variantTitle: 'Grau', quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/9${id}`, sku: `M-TEST-${id}`, title: 'Grau', metafields: { nodes: [] }, lieferant: { nodes: [] },
    product: { id: 'gid://shopify/Product/9', handle: 'muster', title: 'Muster', productType: 'Musterservice', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const bestellung = (nr, extra = {}) => ({
  id: `gid://shopify/Order/${nr}`, name: `#T${nr}`, createdAt: '2026-09-30T10:00:00Z', cancelledAt: null, closedAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: `gid://shopify/Customer/${nr}`, displayName: `Testkunde ${nr}`, email: `testkunde${nr}@example.invalid`, phone: null },
  totalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: [muster(nr * 10 + 1)] }, ...extra,
});

test('API: Aufraeumfall an der Bestellzeile, archivierte Bestellung belegt fertig, "Läuft noch" setzt die Uhr zurueck', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-aufraeumen-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [bestellung(1), bestellung(2, { closedAt: '2026-10-02T10:00:00Z' })] }));
  const uhr = { jetzt: new Date('2026-10-01T10:00:00Z') };
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, env: {}, now: () => uhr.jetzt,
    shopifyZugang: async () => { throw new Error('Shopify darf nicht aufgerufen werden'); } });
  const ich = { name: 'Mitarbeiter 1', rolle: 'mitarbeiter' };
  await api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: 'gid://shopify/Order/1', schritt: 'bestellt' }, ich);

  uhr.jetzt = new Date('2026-10-26T10:00:00Z');
  const zeilen = () => Object.fromEntries(api.kundenBestellungen().zeilen.map(z => [z.orderName, z]));
  const z1 = zeilen()['#T1'];
  assert.equal(z1.aufraeumen.art, 'muster');
  assert.equal(z1.aufraeumen.tage, 25);
  assert.deepEqual(z1.aufraeumen.lineItemIds, ['gid://shopify/LineItem/11']);
  const z2 = zeilen()['#T2'];
  assert.equal(z2.aufraeumen, null, 'in Shopify archiviert');
  assert.equal(bestellungAusgeblendet(z2), true);

  await api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: 'gid://shopify/Order/1', schritt: 'notiz', notiz: 'Läuft noch – beim Aufräumen bestätigt' }, ich);
  assert.equal(zeilen()['#T1'].aufraeumen, null);
  uhr.jetzt = new Date('2026-11-10T10:00:00Z');
  assert.equal(zeilen()['#T1'].aufraeumen.tage, 15, 'nach 14 Tagen fragt die Liste wieder');
});
