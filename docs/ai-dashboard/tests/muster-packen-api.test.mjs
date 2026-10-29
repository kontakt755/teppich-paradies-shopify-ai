import './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';

// Ausschliesslich synthetische Kunden, Anschriften und Artikel.
const quelle = { id: 'gid://shopify/ProductVariant/100', sku: 'ORIG-B', title: 'Sand', metafields: { nodes: [] }, product: { id: 'gid://shopify/Product/100', handle: 'testlinea-sand', title: 'Testlinea Sand – Klickvinyl', productType: 'Klickvinyl', metafields: { nodes: [] } } };
const muster = id => ({ id: `gid://shopify/LineItem/${id}`, sku: 'TP-MUSTER-000', title: 'Kostenloses Muster', variantTitle: null, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: '_Quellvariante_ID', value: '100' }], originalUnitPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } },
  variant: { id: 'gid://shopify/ProductVariant/900', sku: 'TP-MUSTER-000', title: 'Default Title', metafields: { nodes: [] }, product: { handle: 'kostenloses-muster', title: 'Kostenloses Muster', productType: 'Musterservice', metafields: { nodes: [] } } } });
const bestellung = (n, datum) => ({ id: `gid://shopify/Order/${n}`, name: `#T${n}`, createdAt: datum, cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', tags: [], customAttributes: [],
  customer: { id: 'gid://shopify/Customer/700', displayName: 'Testkunde Packen', email: 'packen@example.invalid' },
  shippingAddress: { name: 'Testkunde Packen', address1: 'Testweg 7', address2: null, zip: '00000', city: 'Musterstadt', country: 'Germany' },
  totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: [muster(n * 10 + 1)] } });

// Zwei Bestellungen desselben Kunden vom selben Tag: ein Umschlag (seit 29.10. nur noch dann).
function umgebung(t, orders = [bestellung(801, '2026-10-18T06:00:00Z'), bestellung(802, '2026-10-18T09:00:00Z')]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-muster-packen-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders, quellvarianten: [quelle] }));
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify({ produkte: [{ handle: 'testlinea-sand', titel: 'Testlinea Sand – Klickvinyl', eigenschaften: { marke: 'Testlinea' },
    varianten: [{ id: quelle.id, sku: quelle.sku, farbe: 'Sand', titel: 'Sand', einkauf: { produktname: 'Lieferant Sand 2mm', farbnummer: '7' } }] }] }));
  const verboten = () => assert.fail('Muster packen darf keine externen Werkzeuge oder Fachsysteme aufrufen');
  return { dir, api: createApi({ root: dir, privatDirPath: dir, gh: verboten, rebuild: verboten, shopifyZugang: verboten, now: () => new Date('2026-10-21T12:00:00Z') }) };
}

test('GET buendelt beide Bestellungen des Kunden vom selben Tag mit Anschrift, Aufklebern und vorher/nachher', t => {
  const { api, dir } = umgebung(t);
  const r = api.kundenMusterPacken();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.kunden.length, 1);
  assert.equal(r.offen, 1);
  const k = r.kunden[0];
  assert.deepEqual(k.bestellungen.map(b => b.orderName), ['#T801', '#T802']);
  assert.equal(k.wartetTage, 3);
  assert.equal(k.adresse.ort, 'Musterstadt');
  assert.deepEqual(k.muster.map(m => [m.etikett.sku, m.vorher?.produktname]), [['ORIG-B', 'Lieferant Sand 2mm'], ['ORIG-B', 'Lieferant Sand 2mm']]);
  assert.deepEqual(k.adressAufkleber.empfaenger.map(z => z.text), ['Testkunde Packen', 'Testweg 7', '00000 Musterstadt']);
  assert.equal(k.aufkleber, 3);
  assert.equal(fs.existsSync(path.join(dir, 'muster-packen.json')), false, 'GET schreibt nichts');
});

test('POST gepackt: Rolle lesen 403, unbekannter Kunde 409, sonst gespeichert und zuruecknehmbar', t => {
  const { api, dir } = umgebung(t);
  const pk = api.kundenMusterPacken().kunden[0].packSchluessel;
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: pk, gepackt: true }, { name: 'Gast', rolle: 'lesen' }), e => e.status === 403);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: 'gid://shopify/Order/1', gepackt: true }, { name: 'Laden', rolle: 'mitarbeiter' }), e => e.status === 409);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: pk }, { name: 'Laden', rolle: 'mitarbeiter' }), e => e.status === 400);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: pk, gepackt: true }), e => e.status === 409);
  api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'haken', lineItemIds: api.kundenMusterPacken().kunden[0].muster.map(m => m.lineItemId), an: true });
  api.kundenMusterPackenSetzen({ packSchluessel: pk, gepackt: true }, { name: 'Laden', rolle: 'mitarbeiter' });
  const k = api.kundenMusterPacken().kunden[0];
  assert.equal(k.gepackt.von, 'Laden');
  assert.equal(api.kundenMusterPacken().offen, 0);
  assert.ok(fs.existsSync(path.join(dir, 'muster-packen.json')));
  api.kundenMusterPackenSetzen({ packSchluessel: pk, gepackt: false }, { name: 'Laden', rolle: 'mitarbeiter' });
  assert.equal(api.kundenMusterPacken().kunden[0].gepackt, null);
});

test('beschaedigte Ablage wird gemeldet statt als leer ueberschrieben', t => {
  const { api, dir } = umgebung(t);
  fs.writeFileSync(path.join(dir, 'muster-packen.json'), '{kaputt');
  assert.throws(() => api.kundenMusterPacken(), e => e.status === 500 && /beschädigt/.test(e.message));
  assert.equal(fs.readFileSync(path.join(dir, 'muster-packen.json'), 'utf8'), '{kaputt');
});

test('ohne Bestellexport: Hinweis statt Fehler', t => {
  const { api, dir } = umgebung(t);
  fs.rmSync(path.join(dir, 'bestelluebersicht/orders.json'));
  assert.equal(api.kundenMusterPacken().verfuegbar, false);
});

test('Haken und zu klaeren: fehlend = nicht abgehakte Muster, "Fehlendes ist da" holt zurueck, Haken bleiben', t => {
  const { api, dir } = umgebung(t);
  const laden = { name: 'Laden', rolle: 'mitarbeiter' };
  const k0 = api.kundenMusterPacken().kunden[0];
  const [m1, m2] = k0.muster.map(m => m.lineItemId);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'haken', lineItemIds: ['gid://shopify/LineItem/fremd'], an: true }, laden), e => e.status === 400);
  api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'haken', lineItemIds: [m1], an: true }, laden);
  api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'klaeren', klaeren: true, notiz: 'zweites fehlt' }, laden);
  let k = api.kundenMusterPacken().kunden[0];
  assert.equal(k.bereich, 'klaeren');
  assert.deepEqual(k.klaeren.fehlt, [m2]);
  assert.equal(api.kundenMusterPacken().zahlen.klaeren, 1);
  api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'klaeren', klaeren: false }, laden);
  k = api.kundenMusterPacken().kunden[0];
  assert.equal(k.bereich, 'warten', 'Ruecknahme der Klaerung bestaetigt keinen Wareneingang');
  assert.ok(k.muster[0].abgehakt, 'Haken bleiben nach "Fehlendes ist da"');
  api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'haken', lineItemIds: [m2], an: true }, laden);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'klaeren', klaeren: true }, laden), e => e.status === 400);
  const roh = JSON.parse(fs.readFileSync(path.join(dir, 'muster-packen.json'), 'utf8'));
  assert.equal(Object.keys(roh.haken).length, 2);
});

test('Lieferantenname kommt aus den privaten Stammdaten', t => {
  const { api, dir } = umgebung(t);
  assert.equal(api.kundenMusterPacken().kunden[0].muster[0].lieferant, null, 'ohne Lieferant am Artikel kein Name');
  const produkte = JSON.parse(fs.readFileSync(path.join(dir, 'lexikon/produkte.json'), 'utf8'));
  produkte.produkte[0].varianten[0].einkauf.lieferant = 'A';
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify(produkte));
  const { api: api2 } = { api: createApi({ root: dir, privatDirPath: dir, now: () => new Date('2026-10-21T12:00:00Z') }) };
  assert.equal(api2.kundenMusterPacken().kunden[0].muster[0].lieferant, 'Lieferant A');
});


test('Gepackt sperrt fehlende Angaben und Teilrueckerstattung trotz aller Haken ohne neue Packmarke', t => {
  const order = bestellung(803, '2026-10-18');
  order.displayFinancialStatus = 'PARTIALLY_REFUNDED';
  const { api, dir } = umgebung(t, [order]);
  const k = api.kundenMusterPacken().kunden[0];
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: k.muster.map(m => m.lineItemId), an: true });
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true }), e => e.status === 409);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'muster-packen.json'))).eintraege, {});
});

test('Ruecknahme einer adressbezogenen Klaerung veraendert weder zweiten Umschlag noch alte gemeinsame Notiz', t => {
  const a = bestellung(804, '2026-10-18'), b = bestellung(805, '2026-10-19');
  b.shippingAddress.address1 = 'Zweiter Testweg 8';
  const { api, dir } = umgebung(t, [a, b]);
  const [k1, k2] = api.kundenMusterPacken().kunden;
  const alt = { notiz: 'Alte gemeinsame Notiz', fehlt: [] };
  fs.writeFileSync(path.join(dir, 'muster-packen.json'), JSON.stringify({ klaeren: { 'email:packen@example.invalid': alt }, haken: {}, eintraege: {} }));
  assert.ok(api.kundenMusterPacken().kunden.every(k => k.bereich === 'klaeren' && k.klaeren.notiz === alt.notiz));
  for (const k of [k1, k2]) api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'klaeren', klaeren: true, notiz: 'Eigene Klaerung' });
  api.kundenMusterPackenSetzen({ packSchluessel: k1.packSchluessel, aktion: 'klaeren', klaeren: false });
  const nachher = api.kundenMusterPacken().kunden;
  assert.equal(nachher[0].klaeren, null);
  assert.equal(nachher[1].klaeren.notiz, 'Eigene Klaerung');
  assert.match(nachher[0].altvermerk, /Alte gemeinsame Notiz/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'muster-packen.json'))).klaeren['email:packen@example.invalid'], alt);
});


test('Teilrueckerstattung braucht bewusste Restumfangfreigabe; Nachweis wird lokal gespeichert', t => {
  const order = bestellung(806, '2026-10-18');
  order.displayFinancialStatus = 'PARTIALLY_REFUNDED';
  const { api, dir } = umgebung(t, [order]);
  const k = api.kundenMusterPacken().kunden[0];
  assert.equal(k.restumfangPruefen, true);
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: k.muster.map(m => m.lineItemId), an: true });
  for (const flag of [undefined, false, 'true']) assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true, restumfangGeprueft: flag }), e => e.status === 409);
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true, restumfangGeprueft: true });
  assert.equal(api.kundenMusterPacken().kunden[0].bereich, 'gepackt');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'muster-packen.json'))).eintraege[k.packSchluessel].restumfangGeprueft, true);
});

test('Restumfangfreigabe kann Direktversand und fehlende Haken niemals umgehen', t => {
  const order = bestellung(807, '2026-10-18');
  order.displayFinancialStatus = 'PARTIALLY_REFUNDED';
  const { api } = umgebung(t, [order]);
  const k = api.kundenMusterPacken().kunden[0];
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true, restumfangGeprueft: true }), e => e.status === 409);
  const lesen = api.kundenMusterPacken.bind(api);
  api.kundenMusterPacken = () => {
    const r = lesen();
    r.kunden[0].direktversand = true;
    r.kunden[0].restumfangPruefen = false;
    r.kunden[0].hinweise.push('Direktversand – Versandweg prüfen, nicht lokal packen.');
    for (const m of r.kunden[0].muster) m.abgehakt = { zeit: '2026-10-21' };
    return r;
  };
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true, restumfangGeprueft: true }), e => e.status === 409);
});

const messungGrossbrief = { gramm: '499,5', dickeMm: '20', laengeMm: '353', breiteMm: '250' };
const gbPayload = (k, messung = messungGrossbrief) => ({ aktion: 'grossbrief', packSchluessel: k.packSchluessel, kontext: k.grossbrief.kontext, version: k.grossbrief.version, messung });

test('Grossbrief bleibt nach neuer API-Instanz erhalten, ohne Pack-/Versand- oder externe Aktionen', t => {
  const { api, dir } = umgebung(t);
  const k = api.kundenMusterPacken().kunden[0];
  const vorher = fs.readFileSync(path.join(dir, 'bestelluebersicht/orders.json'), 'utf8');
  const r = api.kundenMusterPackenSetzen(gbPayload(k), { name: 'Laden', rolle: 'mitarbeiter' });
  assert.equal(r.grossbrief.version, 1);
  const neueApi = createApi({ root: dir, privatDirPath: dir, gh: () => assert.fail('kein GitHub-Aufruf'), shopifyZugang: () => assert.fail('kein Shopify-Zugriff') });
  assert.deepEqual(neueApi.kundenMusterPacken().kunden[0].grossbrief.messung, messungGrossbrief);
  assert.equal(neueApi.kundenMusterPacken().kunden[0].gepackt, null);
  assert.equal(fs.existsSync(path.join(dir, 'muster-packen.json')), false);
  assert.equal(fs.existsSync(path.join(dir, 'auftragsstatus.json')), false);
  assert.equal(fs.readFileSync(path.join(dir, 'bestelluebersicht/orders.json'), 'utf8'), vorher);
  assert.equal(fs.statSync(path.join(dir, 'muster-grossbrief.json')).mode & 0o777, 0o600);
});

test('Grossbrief: lesen darf nicht speichern, veraltete Version verliert keine fremde Aenderung', t => {
  const { api, dir } = umgebung(t);
  const k = api.kundenMusterPacken().kunden[0];
  assert.throws(() => api.kundenMusterPackenSetzen(gbPayload(k), { rolle: 'lesen' }), e => e.status === 403);
  assert.equal(fs.existsSync(path.join(dir, 'muster-grossbrief.json')), false);
  api.kundenMusterPackenSetzen(gbPayload(k), { rolle: 'mitarbeiter' });
  assert.throws(() => api.kundenMusterPackenSetzen(gbPayload(k, { ...messungGrossbrief, gramm: '100' })), e => e.status === 409);
  assert.equal(api.kundenMusterPacken().kunden[0].grossbrief.messung.gramm, '499,5');
});

test('Grossbrief: andere Adresse, Inhalt oder Bestellgruppe erbt keine Messungen', t => {
  const { api, dir } = umgebung(t);
  const k = api.kundenMusterPacken().kunden[0];
  api.kundenMusterPackenSetzen(gbPayload(k));
  const file = path.join(dir, 'bestelluebersicht/orders.json');
  const original = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const aendern of [
    d => { for (const o of d.orders) o.shippingAddress.address1 = 'Anderer Testweg 3'; },
    d => { d.orders[0].lineItems.nodes[0].currentQuantity = 2; d.orders[0].lineItems.nodes[0].unfulfilledQuantity = 2; },
    // Dritte Bestellung vom selben Tag: sie kommt in diesen Umschlag, die Bestellgruppe aendert sich.
    d => { d.orders.push(bestellung(803, '2026-10-18T12:00:00Z')); },
  ]) {
    const d = structuredClone(original); aendern(d); fs.writeFileSync(file, JSON.stringify(d));
    const neu = createApi({ root: dir, privatDirPath: dir });
    const n = neu.kundenMusterPacken().kunden[0];
    assert.equal(n.grossbrief.version, 0);
    assert.equal(n.grossbrief.messung.gramm, '');
    assert.throws(() => neu.kundenMusterPackenSetzen(gbPayload(k)), e => e.status === 409);
  }
});

test('Grossbrief: unvollstaendige Messwerte als Entwurf, ungueltige Payloads ohne Schreiben', t => {
  const { api, dir } = umgebung(t);
  let k = api.kundenMusterPacken().kunden[0];
  const entwurf = { gramm: '12,', dickeMm: '', laengeMm: '', breiteMm: '' };
  api.kundenMusterPackenSetzen(gbPayload(k, entwurf));
  k = api.kundenMusterPacken().kunden[0];
  assert.deepEqual(k.grossbrief.messung, entwurf);
  const file = path.join(dir, 'muster-grossbrief.json');
  const vorher = fs.readFileSync(file, 'utf8');
  for (const m of [null, {}, { ...entwurf, gramm: '<script>' }, { ...entwurf, gramm: '1'.repeat(13) }, { ...entwurf, gramm: 12 }, { ...entwurf, gramm: '1e2' }]) {
    assert.throws(() => api.kundenMusterPackenSetzen(gbPayload(k, m)), e => e.status === 400);
    assert.equal(fs.readFileSync(file, 'utf8'), vorher);
  }
  assert.throws(() => api.kundenMusterPackenSetzen({ ...gbPayload(k), version: -1 }), e => e.status === 400);
});

test('Grossbrief: beschaedigte Ablage bleibt erhalten statt leer ueberschrieben zu werden', t => {
  const { api, dir } = umgebung(t);
  const k = api.kundenMusterPacken().kunden[0];
  const file = path.join(dir, 'muster-grossbrief.json');
  for (const text of ['', '{kaputt', '[]', '{"eintraege": []}', '{"eintraege":{"falsch":{}}}']) {
    fs.writeFileSync(file, text);
    assert.throws(() => api.kundenMusterPacken(), e => e.status === 500);
    assert.throws(() => api.kundenMusterPackenSetzen(gbPayload(k)), e => e.status === 500);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
});

test('Alle eingelegt: hakt genau die gezeigten offenen Muster ab und packt; veraltete Seite oder Rolle lesen schreibt nichts', t => {
  const { api, dir } = umgebung(t);
  const laden = { name: 'Laden', rolle: 'mitarbeiter' };
  const k = api.kundenMusterPacken().kunden[0];
  const [erstes, zweites] = k.muster.map(m => m.lineItemId);
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [erstes], an: true }, laden);
  const vorher = fs.readFileSync(path.join(dir, 'muster-packen.json'), 'utf8');
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true, alleEingelegt: true, lineItemIds: [zweites] }, { name: 'Gast', rolle: 'lesen' }), e => e.status === 403);
  // Die Seite zeigte noch beide Muster offen - inzwischen ist eins abgehakt.
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true, alleEingelegt: true, lineItemIds: [erstes, zweites] }, laden), e => e.status === 409 && /geändert/.test(e.message));
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true, alleEingelegt: true }, laden), e => e.status === 409);
  assert.equal(fs.readFileSync(path.join(dir, 'muster-packen.json'), 'utf8'), vorher, 'nichts geschrieben');
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true, alleEingelegt: true, lineItemIds: [zweites] }, laden);
  const neu = api.kundenMusterPacken().kunden[0];
  assert.equal(neu.bereich, 'gepackt');
  assert.deepEqual(neu.muster.map(m => m.abgehakt?.von), ['Laden', 'Laden']);
  // Ohne "alleEingelegt" gilt weiter: erst alles abhaken.
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: false }, laden);
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [zweites], an: false }, laden);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true }, laden), e => e.status === 409);
});

test('Zwei Bestelltage sind zwei Umschlaege; Klaerung und Packen des einen lassen den anderen unberuehrt (Rueckmeldung 29.10.)', t => {
  const { api } = umgebung(t, [bestellung(801, '2026-10-11T06:00:00Z'), bestellung(802, '2026-10-20T06:00:00Z')]);
  const laden = { name: 'Laden', rolle: 'mitarbeiter' };
  const r = api.kundenMusterPacken();
  assert.deepEqual(r.kunden.map(k => [k.bestellungen.map(b => b.orderName), k.wartetTage, k.weitere.map(w => w.bestellungen[0])]), [[['#T801'], 10, ['#T802']], [['#T802'], 1, ['#T801']]]);
  const [alt, neu] = r.kunden;
  api.kundenMusterPackenSetzen({ packSchluessel: neu.packSchluessel, aktion: 'klaeren', klaeren: true, notiz: 'fehlt' }, laden);
  assert.deepEqual(api.kundenMusterPacken().kunden.map(k => k.bereich), ['warten', 'klaeren']);
  api.kundenMusterPackenSetzen({ packSchluessel: alt.packSchluessel, aktion: 'haken', lineItemIds: alt.muster.map(m => m.lineItemId), an: true }, laden);
  api.kundenMusterPackenSetzen({ packSchluessel: alt.packSchluessel, gepackt: true }, laden);
  assert.deepEqual(api.kundenMusterPacken().kunden.map(k => [k.bestellungen[0].orderName, k.bereich]), [['#T802', 'klaeren'], ['#T801', 'gepackt']]);
  api.kundenMusterPackenSetzen({ packSchluessel: neu.packSchluessel, aktion: 'klaeren', klaeren: false }, laden);
  assert.deepEqual(api.kundenMusterPacken().kunden.map(k => k.bereich), ['warten', 'gepackt']);
});

test('GET liefert Musterbestellungen ausserhalb der Packliste mit Grund fuer die Suche', t => {
  const storniert = { ...bestellung(803, '2026-10-19T06:00:00Z'), cancelledAt: '2026-10-19T08:00:00Z' };
  const { api } = umgebung(t, [bestellung(801, '2026-10-18T06:00:00Z'), storniert]);
  const r = api.kundenMusterPacken();
  assert.equal(r.kunden.length, 1);
  assert.deepEqual(r.ausserhalb.map(b => [b.orderName, b.grund, b.muster.map(m => m.vorher?.produktname)]), [['#T803', 'storniert', ['Lieferant Sand 2mm']]]);
});

test('POST gedruckt: Umschlag vorbereitet fuer alle Geraete; lesen 403, frueherer Zeitpunkt nur belegbar, gepackt 409 (#1718)', t => {
  const { api } = umgebung(t);
  const laden = { name: 'Laden', rolle: 'mitarbeiter' };
  const k0 = api.kundenMusterPacken().kunden[0];
  const pk = k0.packSchluessel;
  assert.equal(k0.gedruckt, null);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'gedruckt', gedruckt: true }, { name: 'Gast', rolle: 'lesen' }), e => e.status === 403);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'gedruckt' }, laden), e => e.status === 400);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: 'gid://shopify/Order/1', aktion: 'gedruckt', gedruckt: true }, laden), e => e.status === 409);
  assert.equal(api.kundenMusterPacken().kunden[0].gedruckt, null, 'Abgelehntes schreibt nichts');
  // Uebernahme eines alten Geraetevermerks: der fruehere Druckzeitpunkt bleibt.
  api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'gedruckt', gedruckt: true, seit: '2026-10-19T09:30:00.000Z' }, laden);
  const k = api.kundenMusterPacken().kunden[0];
  assert.deepEqual(k.gedruckt, { zeit: '2026-10-19T09:30:00.000Z', von: 'Laden' });
  assert.equal(k.bereich, k0.bereich, 'vorbereitet aendert die Arbeitsliste nicht');
  // Ein Haken schreibt dieselbe Datei - der Vermerk bleibt stehen.
  api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'haken', lineItemIds: [k.muster[0].lineItemId], an: true }, laden);
  assert.equal(api.kundenMusterPacken().kunden[0].gedruckt?.zeit, '2026-10-19T09:30:00.000Z');
  // Zukunft, aelter als 30 Tage oder kein Datum: zaehlt ab jetzt.
  for (const seit of ['2026-11-01T00:00:00Z', '2026-08-01T00:00:00Z', 'Unsinn']) {
    api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'gedruckt', gedruckt: true, seit }, laden);
    assert.equal(api.kundenMusterPacken().kunden[0].gedruckt.zeit, '2026-10-21T12:00:00.000Z', seit);
  }
  api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'gedruckt', gedruckt: false }, laden);
  assert.equal(api.kundenMusterPacken().kunden[0].gedruckt, null, 'zuruecknehmbar');
  // Gepackt: der Vermerk verschwindet aus der Liste, ein neuer wird abgelehnt.
  api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'gedruckt', gedruckt: true }, laden);
  api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'gepackt', gepackt: true, alleEingelegt: true, lineItemIds: api.kundenMusterPacken().kunden[0].muster.filter(m => !m.abgehakt).map(m => m.lineItemId) }, laden);
  assert.equal(api.kundenMusterPacken().kunden[0].gedruckt, null);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'gedruckt', gedruckt: true }, laden), e => e.status === 409);
});
