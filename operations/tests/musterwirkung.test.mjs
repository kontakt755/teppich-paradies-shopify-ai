import test from 'node:test';
import assert from 'node:assert/strict';
import { musterwirkung } from '../lib/musterwirkung.mjs';

const jetzt = new Date('2026-10-22T12:00:00Z');
const geld = amount => ({ shopMoney: { amount: String(amount), currencyCode: 'EUR' } });
const position = (muster = false, betrag = 50) => ({
  id: 'test-position', sku: muster ? 'TP-MUSTER-TEST' : 'TEST-WARE', quantity: 1, currentQuantity: 1,
  originalUnitPriceSet: geld(100), priceAfterAllDiscountsBeforeTaxesSet: geld(betrag),
  variant: { product: { handle: 'synthetischer-boden', productType: 'Teppichboden' } },
});
function bestellung(nr, datum, muster = false, extra = {}) {
  return { id: `test-order-${nr}`, createdAt: `${datum}T12:00:00Z`, updatedAt: `${datum}T12:00:00Z`,
    customer: { id: 'test-kunde-1', email: 'test@example.invalid', displayName: 'Synthetischer Kunde' },
    displayFinancialStatus: 'PAID', totalPriceSet: geld(muster ? 0 : 50),
    lineItems: { nodes: [position(muster, muster ? 0 : 50)] }, ...extra };
}
const analyse = (orders, opt = {}) => musterwirkung({ orders, exportiertAm: jetzt.toISOString() }, { jetzt, ...opt });

test('ein Musterkunde zaehlt trotz Wiederholungsmustern und mehreren Warenkaeufen nur einmal', () => {
  const orders = [bestellung(1, '2026-09-01', true), bestellung(2, '2026-09-05', true), bestellung(3, '2026-09-07', true), bestellung(4, '2026-09-11'), bestellung(5, '2026-09-15')];
  const vorher = JSON.stringify(orders);
  const { zahlen: z } = analyse([...orders, orders[0]]);
  assert.equal(z.musterkunden, 1);
  assert.equal(z.musterbestellungen, 3);
  assert.equal(z.musterstuecke, 3);
  assert.equal(z.wiederholungsmusterkunden, 1);
  assert.equal(z.weitereMusterbestellungen, 2);
  assert.equal(z.musterkundenMitWarenkauf, 1);
  assert.equal(z.kaufabstandMedianTage, 10);
  assert.equal(JSON.stringify(orders), vorher, 'Analyse veraendert keine Rohdaten');
});

test('Direktkaeufer, frueherer Warenkauf, gemischte Auftraege und gleiche Zeitpunkte bleiben verschieden', () => {
  assert.equal(analyse([bestellung(1, '2026-09-01')]).zahlen.warenkaeuferOhneBeobachtetesMuster, 1);
  const vorher = analyse([bestellung(1, '2026-09-01'), bestellung(2, '2026-09-10', true)]);
  assert.equal(vorher.zahlen.musterkundenMitVorherigemWarenkauf, 1);
  assert.equal(vorher.zahlen.musterkundenMitWarenkauf, 0);
  const gemischt = analyse([bestellung(1, '2026-09-01', false, { lineItems: { nodes: [position(true, 0), position()] } })]);
  assert.equal(gemischt.qualitaet.gemischteBestellungen, 1);
  assert.equal(gemischt.zahlen.musterkundenMitWarenkauf, 0);
  assert.equal(gemischt.zahlen.warenkaeuferOhneBeobachtetesMuster, 0);
  assert.equal(analyse([bestellung(1, '2026-09-01', true), bestellung(2, '2026-09-01')]).zahlen.musterkundenMitWarenkauf, 0);
});

test('fehlende Allrabattwerte und kostenloser Warenartikel mit Versandkosten sind kein positiver Kaufbeleg', () => {
  const ohne = bestellung(2, '2026-09-11'); delete ohne.lineItems.nodes[0].priceAfterAllDiscountsBeforeTaxesSet;
  const alt = analyse([bestellung(1, '2026-09-01', true), ohne]);
  assert.equal(alt.zahlen.musterkundenMitWarenkauf, 0);
  assert.equal(alt.zahlen.musterkundenMitUnklaremWarenkauf, 1);
  assert.equal(alt.qualitaet.unklareRabattwerte, 1);
  assert.equal(alt.zahlen.ausgereifteMusterkundenOhneBeobachtetenKauf, 0, 'unklar ist kein belegter Nichtkauf');
  const kostenlos = bestellung(3, '2026-09-11', false, { totalPriceSet: geld(5), lineItems: { nodes: [position(false, 0)] } });
  assert.equal(analyse([bestellung(1, '2026-09-01', true), kostenlos]).zahlen.musterkundenMitWarenkauf, 0);
});

test('Test, Storno, unbezahlt und voll erstattet erzeugen keine Kaufwirkung; Teilrefund bleibt unklar', () => {
  const muster = bestellung(1, '2026-09-01', true);
  for (const extra of [{ test: true }, { tags: ['TESTBESTELLUNG'] }, { cancelledAt: '2026-09-12' }, { displayFinancialStatus: 'PENDING' }, { displayFinancialStatus: 'REFUNDED' }]) {
    assert.equal(analyse([muster, bestellung(2, '2026-09-11', false, extra)]).zahlen.musterkundenMitWarenkauf, 0);
  }
  const r = analyse([muster, bestellung(2, '2026-09-11', false, { displayFinancialStatus: 'PARTIALLY_REFUNDED' })]);
  assert.equal(r.zahlen.musterkundenMitUnklaremWarenkauf, 1);
  assert.equal(r.qualitaet.unklareErstattungswerte, 1);
});

test('stabile Kunden-ID verbindet geaenderte Mail; eindeutige Gastmail kann an bekanntes Konto anknuepfen', () => {
  const muster = bestellung(1, '2026-09-01', true);
  const kauf = bestellung(2, '2026-09-11', false, { customer: { id: 'test-kunde-1', email: 'anders@example.invalid' } });
  assert.equal(analyse([muster, kauf]).zahlen.musterkundenMitWarenkauf, 1);
  const gast = bestellung(2, '2026-09-11', false, { customer: null, email: ' TEST@EXAMPLE.INVALID ' });
  assert.equal(analyse([muster, gast]).zahlen.musterkundenMitWarenkauf, 1);
});

test('geteilte Mail verbindet verschiedene Kunden-IDs nie; mehrdeutiger Gast wird ausgeschlossen', () => {
  const r = analyse([bestellung(1, '2026-09-01', true),
    bestellung(2, '2026-09-11', false, { customer: { id: 'test-kunde-2', email: 'test@example.invalid' } }),
    bestellung(3, '2026-09-12', false, { customer: null, email: 'test@example.invalid' })]);
  assert.equal(r.zahlen.musterkundenMitWarenkauf, 0);
  assert.equal(r.zahlen.warenkaeuferOhneBeobachtetesMuster, 1);
  assert.equal(r.qualitaet.mehrdeutigeEmails, 1);
  assert.equal(r.qualitaet.mehrdeutigeGastbestellungen, 1);
});

test('Name und Telefon sind keine sichere Kennung; widerspruechliche Gastkontakte werden nicht geraten', () => {
  const kunde = { displayName: 'Gleicher Testname', phone: '+4930000000' };
  const r = analyse([bestellung(1, '2026-09-01', true, { customer: kunde }), bestellung(2, '2026-09-11', false, { customer: kunde })]);
  assert.equal(r.zahlen.musterkunden, 0);
  assert.equal(r.qualitaet.ohneSichereIdentitaet, 2);
  const konflikt = analyse([bestellung(1, '2026-09-01', true, { customer: { email: 'a@example.invalid' }, email: 'b@example.invalid' })]);
  assert.equal(konflikt.qualitaet.widerspruechlicheKontaktangaben, 1);
  assert.equal(konflikt.zahlen.musterkunden, 0);
});

test('junge Kunden sind kein Misserfolg; Beobachtungsdauer endet am Export und bleibt ohne Datum unbekannt', () => {
  assert.equal(analyse([bestellung(1, '2026-10-20', true)]).zahlen.nochJungeMusterkunden, 1);
  assert.equal(analyse([bestellung(1, '2026-09-01', true)]).zahlen.ausgereifteMusterkundenOhneBeobachtetenKauf, 1);
  const orders = [bestellung(1, '2026-09-20', true)];
  const alt = musterwirkung({ orders, exportiertAm: '2026-10-01T12:00:00Z' }, { jetzt });
  assert.equal(alt.zahlen.nochJungeMusterkunden, 1, 'nicht bis zum heutigen Tag unbeobachtete Zeit dazurechnen');
  const unbekannt = musterwirkung({ orders }, { jetzt });
  assert.equal(unbekannt.zahlen.beobachtungsdauerUnklar, 1);
  assert.equal(unbekannt.zahlen.ausgereifteMusterkundenOhneBeobachtetenKauf, 0);
  assert.equal(unbekannt.abdeckung.vollarchiv, false);
});

test('zentrale Mustermerkmale statt Titel oder Gratispreis; Eigenleistung und Gutschein sind keine Ware', () => {
  const p = position(false, 0); p.sku = 'SKU-TEST'; p.customAttributes = [{ key: '_Muster_ID', value: 'test' }];
  assert.equal(analyse([bestellung(1, '2026-09-01', true, { lineItems: { nodes: [p] } })]).zahlen.musterkunden, 1);
  for (const p of [
    { ...position(), variant: { product: { handle: 'kettelservice' } } },
    { ...position(), isGiftCard: true },
  ]) assert.equal(analyse([bestellung(1, '2026-09-01', false, { lineItems: { nodes: [p] } })]).zahlen.warenkaeuferOhneBeobachtetesMuster, 0);
});

test('fehlende Positionen, geloeschte Produktzuordnung und widerspruechliche Dubletten bleiben unklar', () => {
  const kauf = bestellung(2, '2026-09-11'); delete kauf.lineItems.nodes[0].variant;
  const r = analyse([bestellung(1, '2026-09-01', true), kauf]);
  assert.equal(r.qualitaet.unklareWarenzuordnung, 1);
  assert.equal(r.zahlen.musterkundenMitWarenkauf, 0);
  const kaputt = bestellung(1, '2026-09-01', true, { lineItems: { nodes: [position(true)], pageInfo: { hasNextPage: true } } });
  assert.equal(analyse([kaputt]).qualitaet.fehlendePositionsdaten, 1);
  const a = bestellung(1, '2026-09-01', true), b = { ...a, displayFinancialStatus: 'PENDING' };
  const doppelt = analyse([a, b]);
  assert.equal(doppelt.qualitaet.widerspruechlicheBestellungen, 1);
  assert.equal(doppelt.zahlen.musterkunden, 0);
});

test('Ausgabe bleibt aggregiert ohne Kundenkennungen, Namen, Adressen oder Bestellkennungen', () => {
  const r = analyse([bestellung(1, '2026-09-01', true), bestellung(2, '2026-09-11')]);
  const text = JSON.stringify(r);
  for (const geheim of ['test-kunde-1', 'test@example.invalid', 'Synthetischer Kunde', 'test-order-1']) assert.ok(!text.includes(geheim));
  assert.equal(r.zahlen.kaufabstandMedianTage, 10);
  assert.ok(r.hinweise.some(t => /kein Beweis/.test(t)));
  assert.ok(r.hinweise.some(t => /Kosten und Margen fehlen/.test(t)));
  assert.throws(() => analyse([], { beobachtungTage: 0 }), /Ungueltiger/);
});


test('fehlender oder semantisch defekter Bestellbestand ist keine verfuegbare Nullauswertung', () => {
  for (const eingabe of [undefined, null, {}, { orders: null }, { orders: {} }, { orders: { nodes: 'kaputt' } },
    { data: { orders: { nodes: {} } } }, { orders: [null] }, { orders: [{}] },
    { orders: [bestellung(1, '2026-09-01', true), 'kaputter Eintrag'] },
    { orders: [bestellung(1, '2026-09-01', true, { lineItems: {} })] }, '{kaputt']) {
    const r = musterwirkung(eingabe, { jetzt });
    assert.equal(r.verfuegbar, false);
    assert.equal(r.fehler, true);
    assert.ok(r.hinweis);
    assert.equal(r.zahlen, undefined, 'keine scheinbar gueltigen Nullzahlen');
  }
});

test('echte leere Arrays und gaengige Exportformen bleiben gueltige leere Bestandsbeobachtungen', () => {
  for (const eingabe of [[], { orders: [] }, { orders: { nodes: [] } }, { data: { orders: { nodes: [] } } }, JSON.stringify({ orders: [] })]) {
    const r = musterwirkung(eingabe, { jetzt });
    assert.equal(r.verfuegbar, true);
    assert.equal(r.zahlen.musterkunden, 0);
    assert.equal(r.abdeckung.vollarchiv, false);
  }
});

test('Storno und Erstattung lassen bekannte E-Mail-Mehrdeutigkeit niemals verschwinden', () => {
  for (const ausgeschlossen of [{ cancelledAt: '2026-09-03' }, { displayFinancialStatus: 'REFUNDED' }, { test: true }]) {
    const muster = bestellung(1, '2026-09-01', true);
    const anderer = bestellung(2, '2026-09-02', false, { customer: { id: 'test-kunde-2', email: 'test@example.invalid' }, ...ausgeschlossen });
    const gast = bestellung(3, '2026-09-11', false, { customer: null, email: 'test@example.invalid' });
    const r = analyse([muster, anderer, gast]);
    assert.equal(r.qualitaet.mehrdeutigeEmails, 1);
    assert.equal(r.qualitaet.mehrdeutigeGastbestellungen, 1);
    assert.equal(r.zahlen.musterkundenMitWarenkauf, 0, 'Gastkauf nicht wegen Ausschluss eines Identitaetsbelegs dem Musterkunden zuordnen');
  }
});

test('Muster vor dem Betriebsfenster haben lueckenhafte Zwischenhistorie statt vollbeobachteter Negativkohorte', () => {
  const alt = bestellung(1, '2026-01-01', true);
  const r = analyse([alt]);
  assert.equal(r.zahlen.musterkunden, 1);
  assert.equal(r.zahlen.musterkundenMitLueckenhafterHistorie, 1);
  assert.equal(r.zahlen.ausgereifteMusterkundenOhneBeobachtetenKauf, 0);
  assert.equal(r.zahlen.nochJungeMusterkunden, 0);
  const belegt = analyse([alt, bestellung(2, '2026-09-11')]);
  assert.equal(belegt.zahlen.musterkundenMitWarenkauf, 1, 'belegte spaetere Kaeufe bleiben trotz lueckenhafter Vorgeschichte positiv belegt');
  assert.equal(belegt.zahlen.musterkundenMitLueckenhafterHistorie, 0, 'Ergebniskategorien bleiben getrennt');
});

test('Musterbestellung, vollstaendige Versandbuchung und Zustellnachweis sind getrennte Kundenaggregate', () => {
  const sendung = { status: 'SUCCESS', displayStatus: 'DELIVERED', createdAt: '2026-09-02T12:00:00Z' };
  const offen = bestellung(1, '2026-09-01', true);
  const gebucht = bestellung(2, '2026-09-01', true, { customer: { id: 'test-kunde-2' }, displayFulfillmentStatus: 'FULFILLED' });
  const geliefert = bestellung(3, '2026-09-01', true, { customer: { id: 'test-kunde-3' }, displayFulfillmentStatus: 'FULFILLED', fulfillments: [sendung] });
  const wiederholung = bestellung(4, '2026-09-03', true, { customer: { id: 'test-kunde-3' }, displayFulfillmentStatus: 'FULFILLED' });
  const { zahlen: z, hinweise } = analyse([offen, gebucht, geliefert, wiederholung]);
  assert.equal(z.musterkunden, 3);
  assert.equal(z.musterkundenMitVersandbuchung, 2);
  assert.equal(z.musterkundenOhneVersandbuchung, 1);
  assert.equal(z.musterkundenMitZustellnachweis, 1);
  assert.equal(z.musterkundenMitVersandbuchung + z.musterkundenOhneVersandbuchung, z.musterkunden);
  assert.ok(hinweise.some(h => /Produktübereinstimmung.*nicht geprüft/.test(h)));
  assert.ok(hinweise.some(h => /keinen physischen Empfang/.test(h)));
});

test('gemischte Teillieferung wird nicht auf Muster heruntergeraten; Storno ist kein Musterbeleg', () => {
  const extra = { displayFulfillmentStatus: 'PARTIALLY_FULFILLED', fulfillments: [{ status: 'SUCCESS', displayStatus: 'DELIVERED', createdAt: '2026-09-02T12:00:00Z' }], lineItems: { nodes: [position(true, 0), position()] } };
  const { zahlen: z } = analyse([bestellung(1, '2026-09-01', true, extra)]);
  assert.equal(z.musterkunden, 1);
  assert.equal(z.musterkundenMitVersandbuchung, 0);
  assert.equal(z.musterkundenOhneVersandbuchung, 1);
  assert.equal(z.musterkundenMitZustellnachweis, 0);
  assert.equal(analyse([bestellung(1, '2026-09-01', true, { ...extra, cancelledAt: '2026-09-03', displayFulfillmentStatus: 'FULFILLED' })]).zahlen.musterkunden, 0);
});

test('Zustellung braucht vollstaendigen nicht stornierten Sendungsbeleg mit zeitlicher Provenienz', () => {
  const gut = { status: 'SUCCESS', displayStatus: 'DELIVERED', createdAt: '2026-09-02T12:00:00Z' };
  for (const fulfillments of [undefined, [], [null], [{ ...gut, status: 'CANCELLED' }], [{ ...gut, status: 'PENDING' }],
    [{ ...gut, createdAt: null }], [{ ...gut, createdAt: '2026-08-01T12:00:00Z' }], [{ ...gut, createdAt: '2026-11-01T12:00:00Z' }],
    [gut, { ...gut, displayStatus: 'IN_TRANSIT' }], Array(10).fill(gut)]) {
    const z = analyse([bestellung(1, '2026-09-01', true, { displayFulfillmentStatus: 'FULFILLED', fulfillments })]).zahlen;
    assert.equal(z.musterkundenMitVersandbuchung, 1, 'vollstaendiger Auftragsstatus bleibt Versandbuchungsbeleg');
    assert.equal(z.musterkundenMitZustellnachweis, 0, 'kein positiver Zustellbeleg aus unvollstaendigen Daten');
  }
  const z = analyse([bestellung(1, '2026-09-01', true, { displayFulfillmentStatus: 'FULFILLED', fulfillments: [gut, { status: 'CANCELLED' }] })]).zahlen;
  assert.equal(z.musterkundenMitZustellnachweis, 1, 'stornierter alter Sendungsversuch zaehlt nicht als aktive Sendung');
});
