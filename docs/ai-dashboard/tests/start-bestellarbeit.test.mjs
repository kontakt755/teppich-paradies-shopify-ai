import test from 'node:test';
import assert from 'node:assert/strict';
import { startBestellarbeit } from '../lib/start-bestellarbeit.mjs';
import { aufbereiten } from '../../../operations/lib/bestelluebersicht.mjs';
import { bestellmail } from '../../../operations/lib/lieferanten.mjs';

// Ausschliesslich erfundene Artikel und Pseudonyme.
const JETZT = new Date('2026-10-22T12:00:00Z');
const vor = tage => new Date(Number(JETZT) - tage * 864e5).toISOString();
const p = (id, extra = {}) => ({ orderId: 'o1', orderName: '#TEST1', lineItemId: id,
  orderDatum: vor(4), grosshaendlerId: 'A-TEST', bestellmenge: { menge: 1, einheit: 'stueck' }, ...extra });
const m = (id, extra = {}) => p(id, { istMuster: true, ...extra });
const gruppe = (lieferant, positionen) => ({ lieferant, positionen });
const daten = (musterGruppen = [], gruppen = []) => ({ verfuegbar: true, musterGruppen, gruppen });
const statusFuer = (position, status) => ({ [`${position.orderId}::${position.lineItemId}`]: { status } });
const start = (d, opt = {}) => startBestellarbeit({ daten: d, statusAlle: {}, jetzt: JETZT, ...opt });
const zahlen = menge => ({ positionen: menge.positionen, kunden: menge.kunden, aeltesteTage: menge.aeltesteTage });

test('fehlende oder gescheiterte Quellen erscheinen niemals als null Bestellarbeit erledigt', () => {
  for (const r of [startBestellarbeit(), startBestellarbeit({ daten: daten() }),
    startBestellarbeit({ statusAlle: {} })]) {
    assert.equal(r.verfuegbar, false);
    assert.equal(r.laedt, true);
    assert.equal(r.gesamt, null);
  }
  const exportFehler = start({ verfuegbar: false, hinweis: 'Testexport fehlt' });
  assert.equal(exportFehler.laedt, false);
  assert.equal(exportFehler.hinweis, 'Testexport fehlt');
  assert.equal(exportFehler.gesamt, null);
  const statusFehler = start(daten(), { statusAlle: { verfuegbar: false, hinweis: 'Teststatus fehlt' } });
  assert.equal(statusFehler.laedt, false);
  assert.equal(statusFehler.hinweis, 'Teststatus fehlt');
  for (const r of [start({ verfuegbar: true }), start(daten(), { statusAlle: { positionen: null } }),
    start(daten(), { jetzt: NaN })]) {
    assert.equal(r.verfuegbar, false);
    assert.equal(r.gesamt, null);
  }
});

test('erst nach bereitgestellten leeren Quellen ist die Bestellarbeit nachweislich leer', () => {
  const r = start(daten());
  assert.equal(r.verfuegbar, true);
  assert.equal(r.laedt, false);
  assert.deepEqual(r.lieferanten, []);
  assert.deepEqual(zahlen(r.gesamt.muster), { positionen: 0, kunden: 0, aeltesteTage: null });
  assert.deepEqual(zahlen(r.gesamt.ware), { positionen: 0, kunden: 0, aeltesteTage: null });
});

test('je Lieferant sind Kundenbestellungen eindeutig, mehrere Farben bleiben eigene Positionen', () => {
  const r = start(daten([gruppe('A', [m('m1'), m('m2'), m('m3', { orderId: 'o2', orderDatum: vor(9) })])],
    [gruppe('A', [p('w1', { orderId: 'o3' })])]), {
    lieferanten: [{ id: 'A', stammdaten: { name: 'Lieferant A' } }],
  });
  assert.equal(r.lieferanten[0].id, 'A');
  assert.equal(r.lieferanten[0].name, 'Lieferant A');
  assert.deepEqual(zahlen(r.lieferanten[0].muster), { positionen: 3, kunden: 2, aeltesteTage: 9 });
  assert.deepEqual(zahlen(r.lieferanten[0].ware), { positionen: 1, kunden: 1, aeltesteTage: 4 });
  assert.equal(r.lieferanten[0].muster.eintraege.length, 3);
  assert.equal(r.gesamt.muster.kunden, 2);
});

test('vorhandener Auftragsfluss schliesst bestellte, eingetroffene und erledigte Positionen aus', () => {
  const positionen = [m('offen'), m('bestellt'), m('geliefert'), m('raus'), m('erledigt')];
  const status = Object.assign({}, ...positionen.slice(1).map(x => statusFuer(x, x.lineItemId)));
  const r = start(daten([gruppe('A', positionen)]), { statusAlle: { verfuegbar: true, positionen: status } });
  assert.equal(r.gesamt.muster.positionen, 1);
  assert.deepEqual(r.lieferanten[0].muster.eintraege.map(x => x.pos.lineItemId), ['offen']);
  assert.equal(start(daten([gruppe('A', [positionen[1]])]), { statusAlle: status }).lieferanten.length, 0);
});

test('eigenes Musterlager und Zuschnitt werden separat genannt und nie beim Lieferanten bestellt', () => {
  const r = start(daten([gruppe('A', [m('lieferant'), m('lager', { musterRoute: 'SAMPLE_STOCK' }),
    m('zuschnitt', { route: 'SAMPLE_CUT' }), m('vorbei', { musterHerkunft: 'eigen_vorbei' }),
    m('eigen', { musterHerkunft: 'eigen_versand' })])]));
  assert.equal(r.gesamt.muster.positionen, 1);
  assert.equal(r.eigen.muster.positionen, 4);
  assert.equal(r.lieferanten[0].muster.positionen, 1);
  assert.deepEqual(r.eigen.muster.eintraege.map(x => x.pos.lineItemId), ['lager', 'zuschnitt', 'vorbei', 'eigen']);
});

test('blockierte und nicht zugeordnete Positionen bleiben getrennt sichtbar und im Gesamttotal enthalten', () => {
  const r = start(daten([gruppe('A', [m('bereit'), m(null)]), gruppe('UNGEKLAERT', [m('unbekannt')])],
    [gruppe('A', [p('w1', { grosshaendlerId: 'UNGEKLAERT' }),
      p('w2', { bestellmenge: { menge: 'UNGEKLAERT' } }), p('w3')]),
    gruppe(null, [p('w4', { grosshaendlerId: 'UNGEKLAERT' })])]));
  assert.equal(r.blockiert.muster.positionen, 1);
  assert.equal(r.blockiert.ware.positionen, 2);
  assert.equal(r.nichtZugeordnet.muster.positionen, 1);
  assert.equal(r.nichtZugeordnet.ware.positionen, 1, 'unbekannt und blockiert wird nicht doppelt gezaehlt');
  assert.equal(r.gesamt.muster.positionen, 3);
  assert.equal(r.gesamt.ware.positionen, 4);
  assert.equal(r.lieferanten.length, 1);
  for (const art of ['muster', 'ware']) {
    assert.equal(r.gesamt[art].positionen,
      r.lieferanten.reduce((summe, k) => summe + k[art].positionen, 0)
      + r.blockiert[art].positionen + r.nichtZugeordnet[art].positionen);
  }
});

test('Muster ohne Artikelnummer oder positive Bestellmenge bleiben vollstaendig in der Klaerung statt als vorbereitbar zu zaehlen', () => {
  const positionen = [
    ...[undefined, null, '', '  ', 'UNGEKLAERT', '–', 0].map((grosshaendlerId, i) => m(`nr-${i}`, { grosshaendlerId })),
    ...[undefined, null, '', 'UNGEKLAERT', 0, -1, NaN].map((menge, i) => m(`menge-${i}`, { bestellmenge: { menge } })),
    m('ohne-bestellmenge', { bestellmenge: null }),
  ];
  const r = start(daten([gruppe('A', positionen)]));
  assert.deepEqual(r.lieferanten, []);
  assert.equal(r.blockiert.muster.positionen, positionen.length);
  assert.equal(r.gesamt.muster.positionen, positionen.length, 'keine fehlende Position darf zur falschen Nullmeldung werden');
  assert.equal(r.gesamt.muster.kunden, 1, 'mehrere fehlende Farben sind eine Kundenbestellung');
  assert.equal(r.nichtZugeordnet.muster.positionen, 0);
});

test('Muster mit Artikelnummer und Menge bleiben ohne Produktlink vorbereitbar; Lieferziel bleibt Dialogsache', () => {
  const r = start(daten([gruppe('A', [m('m1', { grosshaendlerId: 'A-TEST', lieferantUrl: null,
    bestellmenge: { menge: 2 } })])]));
  assert.equal(r.lieferanten[0].muster.positionen, 1);
  assert.equal(r.blockiert.muster.positionen, 0);
});

test('Startseiten-Klaerung entspricht den harten Kriterien des echten Muster-Bestellmail-Backends', () => {
  const faelle = [m('bereit'), m('nummer-als-text', { grosshaendlerId: '123', bestellmenge: { menge: '2' } }),
    m('nummer-fehlt', { grosshaendlerId: undefined }), m('nummer-null', { grosshaendlerId: null }),
    m('nummer-leer', { grosshaendlerId: '  ' }), m('nummer-unklar', { grosshaendlerId: 'UNGEKLAERT' }),
    m('nummer-strich', { grosshaendlerId: '–' }), m('nummer-nullwert', { grosshaendlerId: 0 }),
    m('menge-fehlt', { bestellmenge: null }), m('menge-null', { bestellmenge: { menge: 0 } }),
    m('menge-unklar', { bestellmenge: { menge: 'UNGEKLAERT' } })];
  for (const pos of faelle) {
    const modell = daten([gruppe('A', [pos])]);
    const r = start(modell);
    const mail = bestellmail({ modell, lieferant: 'A', art: 'muster', ziel: 'laden', jetzt: JETZT }).mails[0];
    assert.equal(r.blockiert.muster.positionen, mail.fehlt.length, pos.lineItemId);
    assert.equal(r.lieferanten.reduce((n, l) => n + l.muster.positionen, 0), mail.positionen.length, pos.lineItemId);
    assert.equal(r.gesamt.muster.positionen, 1, 'auch abgelehnte Muster bleiben im Gesamttotal');
  }
});

test('aelteste Kundenwartezeit ordnet die Lieferanten; unbekannte Datumswerte werden nicht erfunden', () => {
  const r = start(daten([gruppe('A', [m('a', { orderDatum: vor(3) })]),
    gruppe('B', [m('b', { orderDatum: vor(11) })]),
    gruppe('C', [m('c', { orderDatum: 'nicht-belegt' })]),
    gruppe('D', [m('d', { orderDatum: vor(-2) })])]));
  assert.deepEqual(r.lieferanten.map(k => k.id), ['B', 'A', 'D', 'C']);
  assert.equal(r.lieferanten.find(k => k.id === 'C').muster.aeltesteTage, null);
  assert.equal(r.lieferanten.find(k => k.id === 'D').muster.aeltesteTage, 0);
  assert.equal(r.gesamt.muster.aeltesteTage, 11);
});

test('fehlende Stammdaten behalten neutrale Namen und verursachen keine verschwundenen Bestellpositionen', () => {
  const r = start(daten([gruppe('A', [m('m1')])]));
  assert.equal(r.lieferanten[0].name, 'Lieferant A');
  const mitAntwort = start(daten([gruppe('A', [m('m1')])]), { lieferanten: {
    verfuegbar: true, lieferanten: [{ id: 'A', stammdaten: { name: 'Lieferant A' } }],
    schwellen: { nachhakenTage: 3, problemTage: 10 },
  } });
  assert.equal(mitAntwort.lieferanten[0].muster.positionen, 1);
});

test('die Ableitung uebernimmt den bestehenden Modellausschluss von Test, Storno, Archiv und fertigen Bestellungen', () => {
  const order = (id, extra = {}) => ({ id: `gid://shopify/Order/${id}`, name: `#TEST${id}`,
    createdAt: vor(5), displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
    lineItems: { nodes: [{ id: `gid://shopify/LineItem/${id}`, sku: 'TEST-WARE', title: 'Testware', quantity: 1,
      unfulfilledQuantity: 1, variant: { id: `gid://shopify/ProductVariant/${id}`, sku: 'TEST-WARE',
        metafields: [{ namespace: 'einkauf', key: 'lieferant', value: 'A' },
          { namespace: 'einkauf', key: 'bestelleinheit', value: 'stueck' },
          { namespace: 'lieferant', key: 'lieferant_a_artikelnummer', value: 'A-TEST' }],
        product: { id: `gid://shopify/Product/${id}`, handle: 'testware', title: 'Testware' } } }] }, ...extra });
  const modell = aufbereiten({ orders: [order(1), order(2, { test: true }),
    order(3, { cancelledAt: vor(1) }), order(4, { closedAt: vor(1) }),
    order(5, { displayFulfillmentStatus: 'FULFILLED' })] });
  const r = start({ ...modell, verfuegbar: true });
  assert.equal(r.gesamt.ware.positionen, 1);
  assert.equal(r.lieferanten[0].ware.kunden, 1);
  assert.equal(r.lieferanten[0].ware.eintraege[0].pos.orderId, 'gid://shopify/Order/1');
});

test('die reine Ableitung schreibt weder Quelldaten noch Auftragsstatus um', () => {
  const d = daten([gruppe('A', [m('m1')])]);
  const statusAlle = {};
  const vorher = JSON.stringify({ d, statusAlle });
  start(d, { statusAlle });
  assert.equal(JSON.stringify({ d, statusAlle }), vorher);
});
