// Bestellen › Je Lieferant (#1996, 06.11.2026): ein gesperrtes Muster ist kein "Muster zu bestellen" und kein
// "ohne Großhändler-ID", es steht mit "× Gesperrt" ohne Bestellknopf da. Erfundene Daten, Pseudonyme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { viewEinkaufBestellungen } from '../ansichten/einkauf/bestellungen.mjs';
import { einkauf } from '../ansichten/einkauf/auftragsfluss.mjs';
import { state } from '../kern/zustand.mjs';

const senf = { orderId: 'o1', orderName: '#TEST1', lineItemId: 'g1', titel: 'Muster Testfliese', farbe: 'Senf (1)', sku: 'M-TEST-1', istMuster: true,
  grosshaendlerId: 'UNGEKLAERT', idGrund: 'Quellvariante ohne ID-Metafeld', bestellmenge: { menge: 1, text: '1 Muster' }, kundenmenge: '1', orderDatum: '2026-11-04' };
const gelb = { ...senf, lineItemId: 'm2', farbe: 'Gelb (2)', sku: 'M-TEST-2', grosshaendlerId: 'A-2' };
const daten = gesperrteMuster => ({
  verfuegbar: true, gruppen: [], gesperrteMuster,
  musterGruppen: [{ lieferant: 'UNGEKLAERT', positionen: [senf] }, { lieferant: 'A', positionen: [gelb] }],
  auftraege: [{ id: 'o1', name: '#TEST1', offen: true, datum: '2026-11-04', positionen: [senf, gelb], ampel: 'rot',
    hinweise: ['1 Position(en) ohne Großhändler-ID'], ohneIdPositionen: ['g1'], ampelOhneIdGrund: 'gruen' }],
});

function ansicht(gesperrteMuster) {
  const vorher = { params: state.route.params, view: state.route.view, b: einkauf.bestellungen, s: einkauf.auftragsstatus, l: einkauf.lieferanten };
  try {
    state.route.view = 'einkauf';
    state.route.params = new URLSearchParams('tab=lieferant');
    einkauf.bestellungen = daten(gesperrteMuster);
    einkauf.auftragsstatus = { positionen: {} };
    einkauf.lieferanten = { lieferanten: [{ id: 'A', stammdaten: { name: 'Lieferant A' } }] };
    return viewEinkaufBestellungen();
  } finally {
    state.route.params = vorher.params; state.route.view = vorher.view;
    einkauf.bestellungen = vorher.b; einkauf.auftragsstatus = vorher.s; einkauf.lieferanten = vorher.l;
  }
}
const kachel = (html, label) => Number(html.match(new RegExp(`<span class="n">(\\d+)</span><span class="l">${label}</span>`))?.[1]);

test('gesperrt: Kachel ohne das Muster, kein "Zuerst klären", Zeile mit "Gesperrt" und ohne Bestellknopf', () => {
  const vorher = ansicht([]);
  const nachher = ansicht(['g1']);
  assert.deepEqual([kachel(vorher, 'Muster zu bestellen'), kachel(nachher, 'Muster zu bestellen')], [2, 1]);
  assert.match(vorher, /Zuerst klären/);
  assert.doesNotMatch(nachher, /Zuerst klären/);
  assert.doesNotMatch(nachher, /ohne Großhändler-ID/);
  assert.match(nachher, /Stand: kommt nicht – Kunde informieren/);
  assert.match(nachher, /class="ampel[^"]*"[^>]*>[\s\S]{0,120}Gesperrt/);
  // Die gesperrte Zeile hat keinen "Als bestellt markieren"-Knopf mehr, das lieferbare Muster schon.
  assert.doesNotMatch(nachher, /data-af-item="g1"[^>]*data-af-status="bestellt"|data-af-status="bestellt"[^>]*data-af-item="g1"/);
  assert.doesNotMatch(nachher, /Muster Testfliese[^|]*\| ungeklärt/);
  assert.match(nachher, /Alle offenen<span class="c">· 2 Positionen</);
});

test('ohne Sperrliste bleibt alles wie bisher', () => {
  const html = ansicht(undefined);
  assert.match(html, /Zuerst klären/);
  assert.match(html, /1 Artikel ohne Großhändler-ID/);
  assert.doesNotMatch(html, /kommt nicht – Kunde informieren/);
});

test('Lieferantenkarte: gesperrtes, noch nicht bestelltes Muster steht unter "Muster nicht lieferbar", nicht unter "Muster bestellen"', async () => {
  const { lieferantenKartenHtml } = await import('../ansichten/einkauf/lieferanten.mjs');
  const vorher = { params: state.route.params, b: einkauf.bestellungen, s: einkauf.auftragsstatus, l: einkauf.lieferanten };
  try {
    state.route.params = new URLSearchParams('tab=lieferant');
    const nurA = { ...senf, grosshaendlerId: 'A-1' };
    einkauf.bestellungen = { ...daten(['g1']), musterGruppen: [{ lieferant: 'A', positionen: [nurA] }] };
    einkauf.auftragsstatus = { positionen: {} };
    einkauf.lieferanten = { lieferanten: [{ id: 'A', stammdaten: { name: 'Lieferant A' } }] };
    const html = lieferantenKartenHtml({ daten: einkauf.bestellungen, gruppeKarte: () => '' });
    assert.match(html, /Muster nicht lieferbar/);
    assert.doesNotMatch(html, />Muster bestellen</);
  } finally {
    state.route.params = vorher.params; einkauf.bestellungen = vorher.b; einkauf.auftragsstatus = vorher.s; einkauf.lieferanten = vorher.l;
  }
});
