// Gepackt = verschickt (Benutzer, Muster-Verantwortlicher, 06.11.2026): "Umschlag gepackt" bei einem Umschlag,
// in dem jedes Muster abgehakt ist, geht sofort den Weg von "verschickt" - Schritt "raus", Lagerabgang,
// Shopify mit Versandmail. Loeste "Eingeworfen" mit 5 Minuten Frist ab (#1937). Kein Test spricht echtes
// Shopify (Attrappe aus operations/tests); nur erfundene Daten.
import './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';
import { frueherGepackt, gepacktNichtVerschickt, umschlagMusterIds } from '../lib/muster-packen.mjs';
import { versandIds, versandKandidaten } from '../lib/versand.mjs';
import { ALT_NIE_GEBUCHT } from '../../../operations/lib/muster-packen.mjs';
import { versandAttrappe, fo, li, BESTELLUNG } from '../../../operations/tests/versand-attrappe.mjs';

const quelle = { id: 'gid://shopify/ProductVariant/100', sku: 'ORIG-B', title: 'Sand', metafields: { nodes: [] }, product: { id: 'gid://shopify/Product/100', handle: 'testlinea-sand', title: 'Testlinea Sand – Klickvinyl', productType: 'Klickvinyl', metafields: { nodes: [] } } };
const muster = n => ({ id: li(n), sku: 'TP-MUSTER-000', title: 'Kostenloses Muster', variantTitle: null, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: '_Quellvariante_ID', value: '100' }], originalUnitPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } },
  variant: { id: 'gid://shopify/ProductVariant/900', sku: 'TP-MUSTER-000', title: 'Default Title', metafields: { nodes: [] }, product: { handle: 'kostenloses-muster', title: 'Kostenloses Muster', productType: 'Musterservice', metafields: { nodes: [] } } } });
const ware = n => ({ id: li(n), sku: 'ORIG-B', title: 'Testlinea Sand – Klickvinyl', variantTitle: 'Sand', quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1, customAttributes: [],
  originalUnitPriceSet: { shopMoney: { amount: '49', currencyCode: 'EUR' } }, variant: { ...quelle, id: quelle.id, metafields: { nodes: [] } } });
const bestellung = { id: BESTELLUNG, name: '#T5001', createdAt: '2026-10-18T06:00:00Z', cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', tags: [], customAttributes: [],
  customer: { id: 'gid://shopify/Customer/700', displayName: 'Testkunde Gepackt', email: 'gepackt@example.invalid' },
  shippingAddress: { name: 'Testkunde Gepackt', address1: 'Testweg 7', address2: null, zip: '00000', city: 'Musterstadt', country: 'Germany' },
  totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: [muster(1), muster(2)] } };
const ICH = { name: 'Mitarbeiter 1', rolle: 'mitarbeiter' };
const LESEN = { name: 'Gast', rolle: 'lesen' };

function umgebung(t, { orders = [bestellung], fos = [fo('1', [{ n: 1 }, { n: 2 }])], zugang = true, vorStatus = null, shopifyZugang = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-packstation-gepackt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders, quellvarianten: [quelle] }));
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify({ produkte: [{ handle: 'testlinea-sand', titel: 'Testlinea Sand – Klickvinyl', eigenschaften: { marke: 'Testlinea' },
    varianten: [{ id: quelle.id, sku: quelle.sku, farbe: 'Sand', titel: 'Sand', einkauf: { produktname: 'Lieferant Sand 2mm', farbnummer: '7' } }] }] }));
  if (vorStatus) fs.writeFileSync(path.join(dir, 'auftragsstatus.json'), JSON.stringify({ version: 1, positionen: vorStatus }));
  const attrappe = versandAttrappe({ fos });
  const verboten = () => assert.fail('Die Packstation darf weder gh noch einen Neuaufbau anstossen');
  const api = createApi({ root: dir, privatDirPath: dir, gh: verboten, rebuild: verboten, now: () => new Date('2026-10-21T12:00:00Z'), env: {},
    shopifyZugang: shopifyZugang || (async () => (zugang ? { proxy: attrappe.proxy, art: 'client-credentials', scope: 'write_orders' } : { proxy: { execute: async () => null }, art: 'sammeln', scope: null })) });
  const kunden = () => api.kundenMusterPacken().kunden;
  const kunde = () => kunden()[0];
  // Wie die Seite nach "Ja, gepackt und verschickt": alle offenen Muster abhaken, packen, verschicken.
  const packen = (k = kunde(), extra = {}) => api.kundenMusterPackenSchreiben({ packSchluessel: k.packSchluessel, aktion: 'gepackt', gepackt: true, verschicken: true, alleEingelegt: true, lineItemIds: k.muster.filter(m => !m.abgehakt).map(m => m.lineItemId), ...extra }, ICH);
  // Altfall: vor dem 06.11. gepackt, nie eingetragen - nur der lokale Packstand.
  const altGepackt = (k = kunde()) => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'gepackt', gepackt: true, alleEingelegt: true, lineItemIds: k.muster.filter(m => !m.abgehakt).map(m => m.lineItemId) }, ICH);
  const ablage = path.join(dir, 'muster-packen.json');
  const packStand = () => (fs.existsSync(ablage) ? JSON.parse(fs.readFileSync(ablage, 'utf8')) : null);
  const status = () => { try { const s = JSON.parse(fs.readFileSync(path.join(dir, 'auftragsstatus.json'), 'utf8')); return s.positionen || s; } catch { return {}; } };
  return { dir, api, attrappe, kunden, kunde, packen, altGepackt, ablage, packStand, status, eintrag: (n, order = BESTELLUNG) => status()[`${order}::${li(n)}`] };
}

test('Gepackt bucht sofort: "raus", Lagerabgang-Weg, Shopify mit Versandmail, Umschlag unter "Erledigt"', async t => {
  const u = umgebung(t);
  const r = await u.packen();
  assert.equal(r.ok, true);
  assert.equal(r.gepackt?.von, 'Mitarbeiter 1', 'Packstand gespeichert');
  assert.deepEqual(r.versand.map(v => [v.orderName, v.status, v.kundeBenachrichtigt]), [['#T5001', 'gebucht', true]]);
  const buchungen = u.attrappe.buchungen();
  assert.equal(buchungen.length, 1);
  assert.equal(buchungen[0].variables.fulfillment.notifyCustomer, true, 'der Kunde bekommt die Versandmail');
  assert.deepEqual([u.eintrag(1).status, u.eintrag(2).status], ['raus', 'raus']);
  assert.equal(u.eintrag(1).rausVon, 'Mitarbeiter 1', 'im Namen dessen, der gepackt hat');
  const liste = u.api.kundenMusterPacken();
  assert.deepEqual(liste.kunden, [], 'nichts bleibt unter "Gepackt" stehen');
  assert.deepEqual(liste.ausserhalb.map(b => [b.orderName, b.grund]), [['#T5001', 'erledigt']]);
  assert.deepEqual(liste.versandProbleme, []);
});

test('Ohne "verschicken: true" (alte Seite) und mit Lesezugang: 409/403, nichts geschrieben, keine Mail', async t => {
  const u = umgebung(t);
  const k = u.kunde();
  await assert.rejects(u.packen(k, { verschicken: undefined }), e => e.status === 409 && /veraltet/.test(e.message));
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ packSchluessel: k.packSchluessel, gepackt: true, verschicken: true }, LESEN), e => e.status === 403);
  // "Eingeworfen" gibt es nicht mehr: eine offene alte Seite bekommt eine klare Antwort statt "Unbekannte Aktion".
  for (const aktion of ['eingeworfen', 'eingeworfen-zurueck']) {
    await assert.rejects(u.api.kundenMusterPackenSchreiben({ aktion, packSchluessel: [k.packSchluessel] }, ICH), e => e.status === 409 && /neu laden/.test(e.message));
  }
  assert.equal(u.packStand(), null, 'keine Ablage geschrieben');
  assert.deepEqual(u.status(), {});
  assert.equal(u.attrappe.buchungen().length, 0);
});

test('Nicht jedes Muster abgehakt: 409 "Nicht gepackt, nichts verschickt", weder Haken noch Packstand noch Mail', async t => {
  const u = umgebung(t);
  const k = u.kunde();
  await u.api.kundenMusterPackenSchreiben({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [li(1)], an: true }, ICH);
  const vorher = JSON.stringify(u.packStand());
  // Ohne "Alle eingelegt" bleibt ein Muster offen.
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ packSchluessel: k.packSchluessel, aktion: 'gepackt', gepackt: true, verschicken: true }, ICH),
    e => e.status === 409 && /^Nicht gepackt, nichts verschickt/.test(e.message));
  // Veraltete Seite: sie hat andere offene Muster gezeigt.
  await assert.rejects(u.packen(k), e => e.status === 409 && /geändert/.test(e.message));
  assert.equal(JSON.stringify(u.packStand()), vorher);
  assert.notEqual(u.eintrag(2)?.status, 'raus');
  assert.equal(u.attrappe.buchungen().length, 0);
  assert.equal(u.kunde().bereich === 'gepackt', false);
});

for (const [fall, eintrag] of [
  ['Musterautomatik noch ungeklaert', { uebernahme: { id: 'musterautomatik', person: 'Musterautomatik', seit: '2026-10-19T07:00:00Z' } }],
  ['bestaetigte Fehlmenge', { status: 'geliefert', beschaffung: { wareneingang: { soll: 1, angekommen: 1, verwendbar: 0, einheit: 'muster' } } }],
]) {
  test(`Zwei Bestellungen in einem Umschlag, eine darf nicht raus (${fall}): erst alle pruefen - nichts gepackt, nichts gebucht`, async t => {
    const zweite = { ...bestellung, id: 'gid://shopify/Order/5002', name: '#T5002', createdAt: '2026-10-18T08:00:00Z', lineItems: { nodes: [muster(3)] } };
    const key = `gid://shopify/Order/5002::${li(3)}`;
    const u = umgebung(t, { orders: [{ ...bestellung, lineItems: { nodes: [muster(1)] } }, zweite], vorStatus: { [key]: { orderId: 'gid://shopify/Order/5002', lineItemId: li(3), ...eintrag } } });
    assert.equal(u.kunden().length, 1, 'ein Umschlag fuer beide Bestellungen');
    const stand = JSON.stringify(u.status());
    await assert.rejects(u.packen(), e => e.status === 409 && /^Nicht gepackt, nichts verschickt, keine Mail – #T5002/.test(e.message));
    assert.equal(u.packStand(), null, 'kein Haken, kein Gepackt-Vermerk');
    assert.equal(JSON.stringify(u.status()), stand, 'auch die erste Bestellung bleibt, wie sie war');
    assert.equal(u.attrappe.buchungen().length, 0);
  });
}

test('Zwei Bestellungen: beide lokal "raus", bevor Shopify antwortet - der Umschlag zerfaellt nie', async t => {
  let freigabe;
  const halt = new Promise(r => { freigabe = r; });
  const zweite = { ...bestellung, id: 'gid://shopify/Order/5002', name: '#T5002', createdAt: '2026-10-18T08:00:00Z', lineItems: { nodes: [muster(3)] } };
  const u = umgebung(t, { orders: [{ ...bestellung, lineItems: { nodes: [muster(1)] } }, zweite],
    shopifyZugang: async () => { await halt; return { proxy: { execute: async () => null }, art: 'sammeln', scope: null }; } });
  const lauf = u.packen();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(u.kunden(), [], 'waehrend Shopify noch rechnet: kein halber Umschlag in der Packstation');
  assert.deepEqual([u.eintrag(1)?.status, u.eintrag(3, 'gid://shopify/Order/5002')?.status], ['raus', 'raus']);
  freigabe();
  const r = await lauf;
  assert.deepEqual(r.versand.map(v => [v.orderName, v.status]), [['#T5001', 'fehler'], ['#T5002', 'fehler']]);
});

test('Ohne Shopify-Zugang: "raus" steht, der rote Hinweis bleibt fuer alle Geraete, bis jemand "Verstanden" drueckt', async t => {
  const u = umgebung(t, { zugang: false });
  const r = await u.packen();
  assert.equal(r.versand[0].status, 'fehler');
  assert.equal(u.eintrag(1).status, 'raus');
  assert.equal(u.eintrag(1).shopifyVersand.status, 'fehler', 'der Vermerk fuehrt die Bestellung unter "In Shopify buchen"');
  const [problem] = u.api.kundenMusterPacken().versandProbleme;
  assert.deepEqual(problem.bestellungen, ['#T5001']);
  assert.deepEqual(problem.orderIds, [BESTELLUNG]);
  assert.match(problem.meldung, /kein Zugang/);
  await assert.rejects(u.api.kundenMusterPackenSchreiben({ aktion: 'versand-verstanden', packSchluessel: [problem.packSchluessel] }, LESEN), e => e.status === 403);
  const weg = await u.api.kundenMusterPackenSchreiben({ aktion: 'versand-verstanden', packSchluessel: [problem.packSchluessel] }, ICH);
  assert.deepEqual(weg.weg, [problem.packSchluessel]);
  assert.deepEqual(u.api.kundenMusterPacken().versandProbleme, []);
  assert.equal(u.eintrag(1).status, 'raus', 'Verstanden aendert am Versand nichts');
});

test('Scheitert der Eintrag nach dem Packen trotz Vorpruefung: Umschlag bleibt unter "Gepackt", Hinweis steht', async t => {
  const u = umgebung(t);
  u.api.kundenMusterVerschicken = async () => { throw new ApiError(500, 'Nicht verschickt, keine Mail – #T5001: Platte voll'); };
  const r = await u.packen();
  assert.deepEqual(r.versand.map(v => [v.orderName, v.status]), [['#T5001', 'nicht-eingetragen']]);
  assert.match(r.versand[0].meldung, /^Gepackt, aber nicht verschickt: .*Platte voll/);
  assert.equal(u.kunde().bereich, 'gepackt', 'der Umschlag ist zu, er wartet unter "Gepackt" auf "Verschickt"');
  assert.match(u.api.kundenMusterPacken().versandProbleme[0].meldung, /Platte voll/);
  assert.equal(u.attrappe.buchungen().length, 0);
  // Ampel (06.11.): gepackt und nie eingetragen ist rot, die Muster darin sind ruhig (liegen im Umschlag).
  assert.deepEqual([u.kunde().ampel.stufe, u.kunde().ampel.wort], ['rot', 'Nicht eingetragen']);
  assert.deepEqual(u.kunde().muster.map(m => m.ampel.stufe), [null, null]);
});

test('Persoenlich vorbeigebrachte Muster: gebucht, aber ohne Mail; die Packliste kennzeichnet sie', async t => {
  const u = umgebung(t);
  await u.api.einkaufAuftragsstatusSetzen({ aktion: 'musterHerkunft', orderId: BESTELLUNG, herkunft: 'eigen_vorbei' }, ICH);
  assert.ok(u.kunde().muster.every(m => m.persoenlich), 'die Rueckfrage sagt dann "ohne Versandmail"');
  const r = await u.packen();
  assert.deepEqual(r.versand.map(v => [v.status, v.kundeBenachrichtigt]), [['gebucht', false]]);
  assert.equal(u.attrappe.buchungen()[0].variables.fulfillment.notifyCustomer, false);
});

test('Mischbestellung: Gepackt und "War schon frueher raus" buchen nur die Muster, nie die Ware', async t => {
  const misch = { ...bestellung, totalPriceSet: { shopMoney: { amount: '49', currencyCode: 'EUR' } }, lineItems: { nodes: [muster(1), muster(2), ware(3)] } };
  const fos = [fo('1', [{ n: 1 }, { n: 2 }, { n: 3 }])];
  const u = umgebung(t, { orders: [misch], fos });
  await u.packen();
  const gebucht = u.attrappe.buchungen()[0].variables.fulfillment.lineItemsByFulfillmentOrder.flatMap(x => x.fulfillmentOrderLineItems.map(l => l.id));
  assert.equal(gebucht.length, 2);
  assert.ok(gebucht.every(id => !/3$/.test(id)), 'die Ware ist nicht dabei');
  assert.notEqual(u.eintrag(3)?.status, 'raus');

  // Altfall derselben Art: der Versanddialog bekommt die Musterpositionen des Umschlags und schickt genau diese.
  const v = umgebung(t, { orders: [misch], fos });
  v.altGepackt();
  const nur = umschlagMusterIds(v.kunde(), BESTELLUNG);
  assert.deepEqual(nur, [li(1), li(2)]);
  const auftrag = { id: BESTELLUNG, positionen: [{ lineItemId: li(1), istMuster: true }, { lineItemId: li(2), istMuster: true }, { lineItemId: li(3) }] };
  const bereit = versandKandidaten(auftrag, {}, { nur });
  assert.deepEqual(bereit.map(p => p.lineItemId), nur, 'die offene Ware steht nicht im Dialog');
  assert.equal(versandKandidaten(auftrag, {}).length, 3, 'ohne Begrenzung wie bisher alles');
  const ids = versandIds({ bereit, gewaehlt: bereit.map(p => p.lineItemId), nur });
  await v.api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'raus', lineItemIds: ids, versand: { benachrichtigen: false } }, ICH);
  assert.deepEqual([v.eintrag(1).status, v.eintrag(2).status], ['raus', 'raus']);
  assert.notEqual(v.eintrag(3)?.status, 'raus');
  assert.equal(v.attrappe.buchungen()[0].variables.fulfillment.notifyCustomer, false, 'Mail aus wie im Dialog gewählt');
});

test('Dialog ohne geladene Bestellung bucht mit Begrenzung nie die ganze Bestellung', () => {
  assert.deepEqual(versandIds({ bereit: [], nur: ['m1', 'm2'] }), ['m1', 'm2']);
  assert.equal(versandIds({ bereit: [] }), null, 'ohne Begrenzung wie bisher: der Server nimmt alles');
  assert.deepEqual(versandIds({ bereit: [{ lineItemId: 'm1' }, { lineItemId: 'm2' }], gewaehlt: ['m2'], nur: ['m1', 'm2'] }), ['m2']);
  assert.deepEqual(versandIds({ nurGeklickt: true, lineItemId: 'x', bereit: [] }), ['x']);
  assert.deepEqual(umschlagMusterIds(undefined, 'a'), []);
});

test('Altfall unter "Gepackt": "Verschickt" bucht mit Mail, ein alter Hinweis zu diesem Umschlag faellt weg', async t => {
  const u = umgebung(t);
  u.altGepackt();
  const pk = u.kunde().packSchluessel;
  assert.equal(u.kunde().bereich, 'gepackt');
  assert.equal(u.attrappe.buchungen().length, 0, 'der lokale Packstand allein bucht nichts');
  await assert.rejects(u.packen(u.kunde()), e => e.status === 409 && /schon gepackt/.test(e.message));
  // Alter Vermerk aus "Eingeworfen" (vor dem 06.11.): ohne Problem heisst er "nie gebucht".
  const stand = u.packStand();
  stand.eingeworfen = { [pk]: { zeit: '2026-11-05T09:00:00Z', von: 'Team', buchtAb: '2026-11-05T09:05:00Z', orderIds: [BESTELLUNG], bestellungen: ['#T5001'] } };
  fs.writeFileSync(u.ablage, JSON.stringify(stand));
  assert.deepEqual(u.api.kundenMusterPacken().versandProbleme.map(p => [p.packSchluessel, p.meldung]), [[pk, ALT_NIE_GEBUCHT]]);
  const r = await u.api.kundenMusterPackenSchreiben({ packSchluessel: pk, aktion: 'verschickt' }, ICH);
  assert.deepEqual(r.versand.map(v => [v.status, v.kundeBenachrichtigt]), [['gebucht', true]]);
  assert.deepEqual(u.api.kundenMusterPacken().versandProbleme, [], 'sauber verschickt: der Hinweis ist erledigt');
  const danach = u.packStand();
  assert.equal(danach.eingeworfen, undefined, 'die alte Ablage ist beim Schreiben in versandProbleme aufgegangen');
  assert.deepEqual(danach.versandProbleme, {});
});

test('Alte Ablage "eingeworfen": Problemvermerke bleiben sichtbar, "Verstanden" raeumt sie weg', async t => {
  const u = umgebung(t);
  fs.writeFileSync(u.ablage, JSON.stringify({ eintraege: {}, haken: {}, klaeren: {}, gedruckt: {},
    eingeworfen: { a: { orderIds: ['o1'], bestellungen: ['#T1'], problem: 'Versand nicht gebucht', problemAm: '2026-11-05T10:00:00Z' }, b: { orderIds: ['o2'], bestellungen: ['#T2'], zeit: '2026-11-05T11:00:00Z' } } }));
  const probleme = u.api.kundenMusterPacken().versandProbleme;
  assert.deepEqual(probleme.map(p => [p.packSchluessel, p.meldung]), [['a', 'Versand nicht gebucht'], ['b', ALT_NIE_GEBUCHT]]);
  await u.api.kundenMusterPackenSchreiben({ aktion: 'versand-verstanden', packSchluessel: ['a', 'b'] }, ICH);
  assert.deepEqual(u.api.kundenMusterPacken().versandProbleme, []);
});

const k = (name, seit, gepacktAm) => ({ name, seit, bereich: 'gepackt', gepackt: { zeit: gepacktAm }, bestellungen: [{ orderId: name, orderName: name }] });

test('Reiter "Gepackt": nur Gepacktes, aelteste Bestellung zuerst; "frueher" zaehlt nach Berlin, nicht nach UTC', () => {
  const liste = gepacktNichtVerschickt([
    k('neu', '2026-11-04T09:00:00Z', '2026-11-05T08:00:00Z'),
    k('alt-b', '2026-10-25T09:00:00Z', '2026-10-30T08:00:00Z'),
    k('alt-a', '2026-10-20T09:00:00Z', '2026-11-01T08:00:00Z'),
    { name: 'offen', bereich: 'packen', bestellungen: [] },
  ]);
  assert.deepEqual(liste.map(x => x.name), ['alt-a', 'alt-b', 'neu']);
  const jetzt = new Date('2026-11-05T15:00:00Z');
  assert.equal(frueherGepackt(k('heute', '', '2026-11-04T23:30:00Z'), jetzt), false, 'kurz nach Mitternacht in Berlin ist heute');
  assert.equal(frueherGepackt(k('gestern', '', '2026-11-04T22:30:00Z'), jetzt), true);
  assert.equal(frueherGepackt({ bereich: 'gepackt' }, jetzt), false);
});
