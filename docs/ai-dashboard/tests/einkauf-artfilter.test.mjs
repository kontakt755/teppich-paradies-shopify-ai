import test from 'node:test';
import assert from 'node:assert/strict';
import { bestellartDaten, lieferantenKartenHtml } from '../ansichten/einkauf/lieferanten.mjs';
import { state } from '../kern/zustand.mjs';
import { einkauf } from '../ansichten/einkauf/auftragsfluss.mjs';

const ware = { orderId: 'o1', lineItemId: 'ware', titel: 'Nur Ware', istMuster: false };
const muster = { orderId: 'o1', lineItemId: 'muster', titel: 'Nur Muster', istMuster: true };
const eigen = { ...muster, lineItemId: 'eigen', route: 'SAMPLE_STOCK' };
const d = { verfuegbar: true, gruppen: [{ lieferant: 'A', positionen: [ware] }], musterGruppen: [{ lieferant: 'UNGEKLAERT', positionen: [muster] }, { lieferant: 'B', positionen: [eigen] }],
  auftraege: [{ id: 'o1', positionen: [ware, muster], details: { positionen: [{ titel: ware.titel }, { titel: muster.titel }] } }],
  testauftraege: [{ id: 'testware', positionen: [ware] }, { id: 'testmuster', positionen: [muster] }] };

test('Musterfilter grenzt vorhandenes Modell und Details ohne Mutation vollstaendig ein', () => {
  const r = bestellartDaten(d, 'muster');
  assert.deepEqual(r.gruppen, []);
  assert.equal(r.musterGruppen.length, 2, 'nicht zugeordnete und eigene Muster bleiben sichtbar');
  assert.deepEqual(r.auftraege[0].positionen, [muster]);
  assert.deepEqual(r.auftraege[0].details.positionen, [{ titel: muster.titel }]);
  assert.deepEqual(r.testauftraege.map(a => a.id), ['testmuster']);
  assert.equal(d.auftraege[0].positionen.length, 2);
  assert.equal(bestellartDaten(d), d);
  assert.deepEqual(bestellartDaten(d, 'ware').musterGruppen, []);
});

test('Lieferantenkarten mit Musterroute erzeugen keine Warenzeilen oder Warenbestellaktion', () => {
  const vorher = { params: state.route.params, bestellungen: einkauf.bestellungen, lieferanten: einkauf.lieferanten, status: einkauf.auftragsstatus };
  try {
    state.route.params = new URLSearchParams('tab=lieferant&art=muster&af=offen');
    einkauf.bestellungen = d;
    einkauf.auftragsstatus = { positionen: {} };
    einkauf.lieferanten = { lieferanten: [] };
    const gesehen = [];
    const html = lieferantenKartenHtml({ daten: d, gruppeKarte: (g, i, art) => { gesehen.push(art); return g.positionen.map(p => p.titel).join(); } });
    assert.ok(gesehen.length);
    assert.ok(gesehen.every(a => a === 'muster'));
    assert.doesNotMatch(html, /data-lf-art="ware"|Nur Ware/);
    assert.match(html, /Nur Muster/);
    assert.match(html, /Lieferant nicht zugeordnet/);
  } finally {
    state.route.params = vorher.params;
    einkauf.bestellungen = vorher.bestellungen;
    einkauf.lieferanten = vorher.lieferanten;
    einkauf.auftragsstatus = vorher.status;
  }
});
