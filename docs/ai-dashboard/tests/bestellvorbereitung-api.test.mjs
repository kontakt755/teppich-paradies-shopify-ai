// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import { PRIVAT_DIR } from './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vorbereitungStand } from '../../../operations/lib/bestellvorbereitung.mjs';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';

// Nur synthetische Daten: Pseudonyme und erfundene Kunden.
const mf = (namespace, key, value) => ({ namespace, key, value });
const ORDER = {
  id: 'gid://shopify/Order/90001', name: '#T1', createdAt: '2026-01-01T10:00:00Z', cancelledAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: 'gid://shopify/Customer/5001', displayName: 'Testkunde 1', email: 'testkunde1@example.invalid' },
  shippingAddress: { name: 'Testkunde 1', address1: 'Testweg 1', zip: '00000', city: 'Musterstadt', country: 'Deutschland' },
  totalPriceSet: { shopMoney: { amount: '123.45', currencyCode: 'EUR' } },
  lineItems: { nodes: [{
    id: 'gid://shopify/LineItem/1', sku: 'TEST-A-1', title: 'Testdiele Eiche', variantTitle: 'Natur', quantity: 3, currentQuantity: 3, unfulfilledQuantity: 3,
    customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '41.15', currencyCode: 'EUR' } },
    variant: {
      id: 'gid://shopify/ProductVariant/1', sku: 'TEST-A-1', title: 'Natur',
      metafields: { nodes: [mf('einkauf', 'lieferant', 'A'), mf('einkauf', 'artikelnummer', 'A-4711'), mf('einkauf', 'bestelleinheit', 'paket'), mf('einkauf', 'route', 'SUPPLIER_TO_TP')] },
      lieferant: { nodes: [] },
      product: { id: 'gid://shopify/Product/1', handle: 'testdiele', title: 'Testdiele Eiche', metafields: { nodes: [mf('custom', 'qm_pro_paket', '2,2')] }, grosshandel: { nodes: [] } },
    },
  }] },
};

function privat({ orders = true, stammdaten = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lief-'));
  if (orders) {
    fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [ORDER] }));
  }
  if (stammdaten) {
    fs.mkdirSync(path.join(dir, 'lieferanten'), { recursive: true });
    fs.copyFileSync(new URL('../../../operations/lib/lieferanten.beispiel.json', import.meta.url), path.join(dir, 'lieferanten', 'stammdaten.json'));
  }
  return dir;
}

const api = (dir) => createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => new Date('2026-01-10T10:00:00Z') });


const team = n => ({ id: `team-${n}`, name: `Team ${n}`, rolle: 'mitarbeiter' });
const scope = { lieferant: 'A', art: 'ware', ziel: 'laden' };
function umgebung(t) {
  const dir = privat();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, a: api(dir), file: path.join(dir, 'auftragsstatus.json') };
}
const vorbereiten = (a, person = team(1), extra = {}) => a.einkaufAuftragsstatusSetzen({ ...scope, ...extra, aktion: 'bestellVorbereitung' }, person);
const pruefen = (a, stand, person = team(1), extra = {}) => a.einkaufAuftragsstatusSetzen({ ...scope, ...extra, aktion: 'bestellPruefen', vorbereitungStand: stand }, person);

test('Vorbereitung uebernimmt lokal; Pruefen bleibt ohne Schreibwirkung und akzeptiert denselben eigenen Stand', async t => {
  const { a, file } = umgebung(t);
  const r = await vorbereiten(a);
  assert.equal(r.mails[0].positionen.length, 1);
  assert.match(r.vorbereitungStand, /^[a-f0-9]{64}$/);
  const vor = fs.readFileSync(file, 'utf8');
  const p = await pruefen(a, r.vorbereitungStand);
  assert.equal(p.vorbereitungStand, r.vorbereitungStand);
  assert.equal(fs.readFileSync(file, 'utf8'), vor);
  assert.equal(p.automatischGesendet, false);
});

test('Fremde Uebernahme sperrt atomar auch Inhaber; Pruefung uebernimmt nichts automatisch', async t => {
  const { a, file } = umgebung(t);
  const r = await vorbereiten(a);
  const vor = fs.readFileSync(file, 'utf8');
  await assert.rejects(vorbereiten(a, team(2)), e => e.status === 409);
  await assert.rejects(vorbereiten(a, { ...team(2), rolle: 'inhaber' }), e => e.status === 409);
  await assert.rejects(pruefen(a, r.vorbereitungStand, team(2)), e => e.status === 409);
  assert.equal(fs.readFileSync(file, 'utf8'), vor);
});

test('Lesender Zugang darf weder vorbereiten noch pruefen', async t => {
  const { a, file } = umgebung(t);
  const person = { ...team(1), rolle: 'lesen' };
  await assert.rejects(vorbereiten(a, person), e => e.status === 403);
  await assert.rejects(pruefen(a, 'x', person), e => e.status === 403);
  assert.equal(fs.existsSync(file), false);
});

test('Geaenderte Menge, Lieferziel oder Scope verlangt neue bewusste Vorbereitung ohne Schreibwirkung', async t => {
  const { a, dir, file } = umgebung(t);
  const r = await vorbereiten(a);
  const vor = fs.readFileSync(file, 'utf8');
  await assert.rejects(pruefen(a, r.vorbereitungStand, team(1), { ziel: 'kunde' }), e => e.status === 409);
  await assert.rejects(pruefen(a, r.vorbereitungStand, team(1), { auftrag: 'fremder-auftrag' }), e => e.status === 409);
  const orders = path.join(dir, 'bestelluebersicht/orders.json');
  const daten = JSON.parse(fs.readFileSync(orders));
  daten.orders[0].lineItems.nodes[0].unfulfilledQuantity = 2;
  fs.writeFileSync(orders, JSON.stringify(daten));
  await assert.rejects(pruefen(a, r.vorbereitungStand), e => e.status === 409);
  assert.equal(fs.readFileSync(file, 'utf8'), vor);
});

test('Vorher bestellte Positionen sind nicht erneut vorbereitet; alter Stand wird abgelehnt', async t => {
  const { a, file } = umgebung(t);
  const r = await vorbereiten(a);
  const roh = JSON.parse(fs.readFileSync(file));
  const eintraege = roh.positionen || roh;
  const key = Object.keys(eintraege).find(k => k.includes('::'));
  eintraege[key].status = 'bestellt';
  fs.writeFileSync(file, JSON.stringify(roh));
  await assert.rejects(pruefen(a, r.vorbereitungStand), e => e.status === 409);
  const neu = await vorbereiten(a);
  assert.equal(neu.mails[0].positionen.length, 0);
});

test('Kaputte Statusdatei wird weder beim Vorbereiten noch Pruefen ueberschrieben', async t => {
  const { a, file } = umgebung(t);
  fs.writeFileSync(file, '{kaputt');
  await assert.rejects(vorbereiten(a));
  await assert.rejects(pruefen(a, 'x'));
  assert.equal(fs.readFileSync(file, 'utf8'), '{kaputt');
});


test('Mehrpositionsvorbereitung schreibt bei fremder zweiter Position keinerlei Teiluebernahme', async t => {
  const { a, dir, file } = umgebung(t);
  const orders = path.join(dir, 'bestelluebersicht/orders.json');
  const daten = JSON.parse(fs.readFileSync(orders));
  const zweite = structuredClone(daten.orders[0].lineItems.nodes[0]);
  zweite.id = 'gid://shopify/LineItem/2';
  daten.orders[0].lineItems.nodes.push(zweite);
  fs.writeFileSync(orders, JSON.stringify(daten));
  await a.einkaufAuftragsstatusSetzen({ aktion: 'uebernahme', uebernahmeAktion: 'nehmen', positionen: [{ orderId: ORDER.id, lineItemId: zweite.id }] }, team(2));
  const vor = fs.readFileSync(file, 'utf8');
  await assert.rejects(vorbereiten(a), e => e.status === 409);
  assert.equal(fs.readFileSync(file, 'utf8'), vor);
});

test('Adresse oder Empfaenger geaendert: alte Vorlage ablehnen; fehlende Positionen nicht uebernehmen', async t => {
  const { a, dir, file } = umgebung(t);
  const r = await vorbereiten(a, team(1), { ziel: 'kunde' });
  const vor = fs.readFileSync(file, 'utf8');
  const orders = path.join(dir, 'bestelluebersicht/orders.json');
  const daten = JSON.parse(fs.readFileSync(orders));
  daten.orders[0].shippingAddress.address1 = 'Anderer Testweg 2';
  fs.writeFileSync(orders, JSON.stringify(daten));
  await assert.rejects(pruefen(a, r.vorbereitungStand, team(1), { ziel: 'kunde' }), e => e.status === 409);
  assert.equal(fs.readFileSync(file, 'utf8'), vor);
  daten.orders[0].shippingAddress = null;
  fs.writeFileSync(orders, JSON.stringify(daten));
  fs.rmSync(file);
  const leer = await vorbereiten(a, team(1), { ziel: 'kunde' });
  assert.equal(leer.mails[0].positionen.length, 0);
  assert.equal(leer.mails[0].fehlt.length, 1);
  assert.equal(fs.existsSync(file), false);
});

test('Arbeitsstand ist auf beiden Aktualisierungsantworten enthalten', t => {
  const { a } = umgebung(t);
  for (const r of [a.aktualisierung(), a.aktualisierungStatus()]) {
    assert.equal(r.arbeitsstand.verfuegbar, true);
    assert.match(r.arbeitsstand.kennung, /^[a-f0-9]{64}$/);
  }
});


test('Fingerabdruck ignoriert Zeitfelder, bindet aber Empfaenger, Positionen und Portalziel', () => {
  const mail = { an: 'test@example.invalid', betreff: 'Test', text: 'Zwei Muster', lieferziel: 'laden',
    portalUrl: 'https://lieferant-a.example/portal', positionen: [{ orderId: 'o1', lineItemId: 'li1', menge: 2 }], wartetage: 1 };
  const hash = vorbereitungStand({ mails: [mail] }, scope);
  assert.equal(vorbereitungStand({ mails: [{ ...mail, wartetage: 20, seit: 'morgen' }] }, scope), hash);
  for (const extra of [{ an: 'anders@example.invalid' }, { portalUrl: 'https://lieferant-b.example/portal' }, { positionen: [{ orderId: 'o1', lineItemId: 'li2', menge: 2 }] }]) {
    assert.notEqual(vorbereitungStand({ mails: [{ ...mail, ...extra }] }, scope), hash);
  }
});


test('Abschnittsstand bleibt nach Bestellung einer anderen Mail gueltig; eigene Aenderung sperrt', async t => {
  const { a, file } = umgebung(t);
  const lesen = a.einkaufBestellmail.bind(a);
  let ersteBestellt = false, zweiteGeaendert = false;
  a.einkaufBestellmail = p => {
    const r = lesen(p), m = r.mails[0];
    const zweite = { ...m, text: zweiteGeaendert ? 'Neue Menge im zweiten Teil' : 'Zweiter unveraenderter Teil',
      positionen: [{ ...m.positionen[0], orderId: 'test-o2', lineItemId: 'test-li2' }] };
    return { ...r, mails: ersteBestellt ? [zweite] : [m, zweite] };
  };
  const r = await vorbereiten(a);
  const mailStand = r.mails[1].vorbereitungStand;
  ersteBestellt = true;
  const vor = fs.readFileSync(file, 'utf8');
  const ok = await a.einkaufAuftragsstatusSetzen({ ...scope, aktion: 'bestellPruefen', mailStand }, team(1));
  assert.equal(ok.mails[0].vorbereitungStand, mailStand);
  await assert.rejects(pruefen(a, r.vorbereitungStand), e => e.status === 409);
  zweiteGeaendert = true;
  await assert.rejects(a.einkaufAuftragsstatusSetzen({ ...scope, aktion: 'bestellPruefen', mailStand }, team(1)), e => e.status === 409);
  assert.equal(fs.readFileSync(file, 'utf8'), vor);
});
