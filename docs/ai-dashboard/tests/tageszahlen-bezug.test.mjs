// Tageszahlen nennen ihren Bezug (#1996, 06.11.2026): "beim Lieferanten" oder "hier", Ware bei uns heisst
// nicht "Nachhaken". Einkauf "Je Lieferant" und "Je Auftrag". Erfundene Daten, Lieferanten nur als Pseudonym.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lieferantenKartenHtml } from '../ansichten/einkauf/lieferanten.mjs';
import { viewEinkaufAblauf } from '../ansichten/einkauf/ablauf.mjs';
import { einkauf } from '../ansichten/einkauf/auftragsfluss.mjs';
import { kunden } from '../ansichten/kunden/gemeinsam.mjs';
import { state } from '../kern/zustand.mjs';

const vor = tage => new Date(Date.now() - tage * 864e5).toISOString();
const pos = (orderId, id, extra = {}) => ({ orderId, orderName: `#T${orderId}`, lineItemId: id, titel: `Artikel ${id}`, farbe: 'Grau',
  grosshaendlerId: `A-${id}`, bestellmenge: { menge: 1, text: '1 Stück' }, kundenmenge: '1', ...extra });
const m1 = pos('o1', 'm1', { istMuster: true });        // liegt seit 8 Tagen bei uns
const m2 = pos('o2', 'm2', { istMuster: true });        // seit 9 Tagen beim Lieferanten
const m3 = pos('o3', 'm3', { istMuster: true });        // seit 17 Tagen beim Lieferanten
const status = { 'o1::m1': { status: 'geliefert', bestelltAm: vor(12), geliefertAm: vor(8) },
  'o2::m2': { status: 'bestellt', bestelltAm: vor(9) }, 'o3::m3': { status: 'bestellt', bestelltAm: vor(17) } };
const daten = () => ({ verfuegbar: true, gruppen: [], gesperrteMuster: [], kundeInformiert: {}, kundentermine: {},
  musterGruppen: [{ lieferant: 'A', positionen: [m1, m2, m3] }],
  auftraege: ['o1', 'o2', 'o3'].map((id, i) => ({ id, name: `#T${id}`, offen: true, datum: vor(20 + i), positionen: [[m1, m2, m3][i]], details: { kunde: { name: 'Testkunde' } } })) });

function mit(query, fn) {
  const vorher = { params: state.route.params, view: state.route.view, b: einkauf.bestellungen, s: einkauf.auftragsstatus, l: einkauf.lieferanten, p: kunden.musterPacken };
  try {
    state.route.view = 'einkauf';
    state.route.params = new URLSearchParams(query);
    einkauf.bestellungen = daten();
    einkauf.auftragsstatus = { positionen: status };
    einkauf.lieferanten = { lieferanten: [{ id: 'A', stammdaten: { name: 'Lieferant A', ware: {}, muster: {} } }] };
    kunden.musterPacken = { verfuegbar: false };
    return fn();
  } finally {
    state.route.params = vorher.params; state.route.view = vorher.view;
    einkauf.bestellungen = vorher.b; einkauf.auftragsstatus = vorher.s; einkauf.lieferanten = vorher.l; kunden.musterPacken = vorher.p;
  }
}
const plaketten = html => [...html.matchAll(/class="ampel ampel-(rot|gelb)"[^>]*>(?:<span[^>]*>[^<]*<\/span>)([^<]*)</g)].map(m => `${m[1]}: ${m[2]}`);

test('Je Lieferant: bei uns "Liegt seit 8 Tagen hier" statt "Nachhaken · 8 Tage", beim Lieferanten mit Bezug - Farben gleich', () => {
  const html = mit('tab=lieferant', () => lieferantenKartenHtml({ daten: einkauf.bestellungen, gruppeKarte: () => '' }));
  assert.deepEqual(plaketten(html).sort(), ['gelb: Liegt seit 8 Tagen hier', 'gelb: Nachhaken · 9 Tage beim Lieferanten', 'rot: Überfällig · 17 Tage beim Lieferanten']);
  assert.doesNotMatch(html, /Nachhaken · 8 Tage/);
  assert.match(html, /title="Seit 8 Tagen bei uns – an den Kunden rausgeben"/);
});

test('Je Auftrag: die Kartenplakette nennt "beim Lieferanten"', () => {
  const html = mit('tab=auftrag&art=alle', () => viewEinkaufAblauf());
  assert.match(html, /×<\/span>Überfällig · 17 Tage beim Lieferanten</);
  assert.match(html, /!<\/span>Nachhaken · 9 Tage beim Lieferanten</);
});
