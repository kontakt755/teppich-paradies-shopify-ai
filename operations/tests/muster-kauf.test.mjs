import assert from 'node:assert/strict';
import test from 'node:test';
import { musterKauf, warengruppe, kundeSchluessel } from '../lib/muster-kauf.mjs';
import { argumente, bericht } from '../scripts/muster-kauf.mjs';

const TAG = 24 * 60 * 60 * 1000;
const JETZT = Date.parse('2026-10-28T12:00:00Z');
const vor = (tage) => new Date(JETZT - tage * TAG).toISOString();

const muster = (titel, o = {}) => ({ title: titel, sku: o.sku ?? 'M-123', variant: { product: { productType: 'Musterservice' } }, customAttributes: o.attr ?? [], priceAfterAllDiscountsBeforeTaxesSet: { shopMoney: { amount: '0.0' } } });
const ware = (typ, betrag = 120) => ({ title: 'Ware', sku: 'W-1', variant: { product: { productType: typ } }, customAttributes: [], priceAfterAllDiscountsBeforeTaxesSet: { shopMoney: { amount: String(betrag) } } });
const bestellung = (name, tage, kunde, positionen, o = {}) => ({ name, createdAt: vor(tage), customer: kunde ? { id: kunde } : null, email: o.email ?? null, tags: o.tags ?? [], test: false, cancelledAt: o.storno ? vor(tage) : null, lineItems: positionen });

test('Warengruppe aus Mustertitel und Angaben', () => {
  assert.equal(warengruppe('Muster Wovena Teppich nach Maß'), 'Teppich nach Maß');
  assert.equal(warengruppe('Muster Nuvara Teppichboden'), 'Teppichboden');
  assert.equal(warengruppe('Kostenloses Muster Eichwald Eiche Greige – Vinylboden von der Rolle'), 'Vinyl');
  assert.equal(warengruppe('Muster Sisano Sisalläufer nach Maß'), 'Teppich nach Maß');
  assert.equal(warengruppe('Muster Kokosläufer Panama'), 'Läufer');
  assert.equal(warengruppe('Muster Belmora Sockelleiste'), 'Sockelleisten');
  assert.equal(warengruppe('Kostenloses Muster'), 'Sonstiges');
});

test('Kunde: Kennung vor E-Mail, ohne beides nicht zuordenbar', () => {
  assert.equal(kundeSchluessel({ customer: { id: 'gid://shopify/Customer/1' }, email: 'a@b.de' }), 'id:gid://shopify/Customer/1');
  assert.equal(kundeSchluessel({ customer: null, email: ' A@B.de ' }), 'mail:a@b.de');
  assert.equal(kundeSchluessel({ customer: null, email: null }), null);
});

test('Kauf binnen 30 Tagen zaehlt, spaeter oder vorher nicht', () => {
  const orders = [
    bestellung('#1', 60, 'k1', [muster('Muster Wovena Teppich nach Maß')]),
    bestellung('#2', 50, 'k1', [ware('Teppich nach Maß', 300)]), // 10 Tage spaeter -> Kauf
    bestellung('#3', 70, 'k2', [muster('Muster Nuvara Teppichboden')]),
    bestellung('#4', 20, 'k2', [ware('Teppichboden')]), // 50 Tage spaeter -> zu spaet
    bestellung('#5', 80, 'k3', [ware('Klebevinyl')]), // Ware vor dem Muster zaehlt nicht
    bestellung('#6', 75, 'k3', [muster('Kostenloses Muster', { sku: 'TP-MUSTER-000', attr: [{ key: 'Produkt', value: 'Solenta Eiche – Klebevinyl' }] })]),
  ];
  const e = musterKauf(orders, { jetzt: JETZT });
  assert.equal(e.gesamt.musterkunden, 3);
  assert.equal(e.gesamt.reif, 3);
  assert.equal(e.gesamt.kaufReif, 1);
  assert.equal(e.gesamt.quote, 33.3);
  assert.equal(e.gesamt.medianTage, 10);
  assert.deepEqual(e.gesamt.gekauft, { 'Teppich nach Maß': 1 });
  assert.equal(e.gruppen['Teppich nach Maß'].kaufReif, 1);
  assert.equal(e.gruppen.Vinyl.musterkunden, 1);
});

test('Junge Muster: Fenster offen, nicht in der Quote', () => {
  const orders = [
    bestellung('#1', 10, 'k1', [muster('Muster Halina Teppichboden')]),
    bestellung('#2', 5, 'k1', [ware('Teppichboden')]),
    bestellung('#3', 3, 'k2', [muster('Muster Halina Teppichboden')]),
  ];
  const e = musterKauf(orders, { jetzt: JETZT });
  assert.equal(e.gesamt.reif, 0);
  assert.equal(e.gesamt.quote, null);
  assert.equal(e.gesamt.fensterOffen, 2);
  assert.equal(e.gesamt.kaufOffen, 1);
});

test('Nicht gezaehlt: Ware mit beigelegtem Muster, Storno, Test, Service, 0-Euro-Ware', () => {
  const orders = [
    bestellung('#1', 60, 'k1', [ware('Teppichboden'), muster('Muster Halina Teppichboden')]), // keine reine Musterbestellung
    bestellung('#2', 60, 'k2', [muster('Muster Halina Teppichboden')]),
    bestellung('#3', 55, 'k2', [ware('Teppichboden')], { storno: true }),
    bestellung('#4', 54, 'k2', [ware('Teppichboden')], { tags: ['TESTBESTELLUNG'] }),
    bestellung('#5', 53, 'k2', [ware('Service', 90)]),
    bestellung('#6', 52, 'k2', [ware('Teppichboden', 0)]),
    bestellung('#7', 61, null, [muster('Muster Halina Teppichboden')]),
  ];
  const e = musterKauf(orders, { jetzt: JETZT });
  assert.equal(e.gesamt.musterkunden, 1);
  assert.equal(e.gesamt.kaufReif, 0);
  assert.equal(e.bestellungen.musterOhneKunde, 1);
  assert.equal(e.bestellungen.gezaehlt, 5);
});

test('Je Kunde zaehlt die erste Musterbestellung im Zeitraum', () => {
  const orders = [
    bestellung('#1', 100, 'k1', [muster('Muster Halina Teppichboden')]), // ausserhalb von 90 Tagen
    bestellung('#2', 60, 'k1', [muster('Muster Wovena Teppich nach Maß')]),
    bestellung('#3', 40, 'k1', [muster('Muster Halina Teppichboden')]),
  ];
  const e = musterKauf(orders, { jetzt: JETZT });
  assert.equal(e.gesamt.musterkunden, 1);
  assert.ok(e.gruppen['Teppich nach Maß']);
});

test('Argumente und Bericht ohne Kundendaten', () => {
  assert.deepEqual(argumente([]), { tage: 90, nach: 30, input: null, json: null, hilfe: false });
  assert.throws(() => argumente(['--tage', '0']));
  assert.throws(() => argumente(['--irgendwas']));
  const e = musterKauf([bestellung('#1', 60, 'k1', [muster('Muster Wovena Teppich nach Maß')])], { jetzt: JETZT });
  const text = bericht(e);
  assert.match(text, /Gesamt\s+1 Musterkunden · reif 1, davon gekauft 0 = 0 %/);
  assert.doesNotMatch(text, /k1|#1/);
});
