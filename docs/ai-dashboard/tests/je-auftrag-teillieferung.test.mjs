// Einkauf "Je Auftrag" (#1996, 06.11.2026): Teillieferung ohne "Ware ist da", Filter Ware | Muster | Alle,
// Musterversand als eine Zeile zur Packstation, Kopfzeile zaehlt jeden Auftrag einmal.
// Erfundene Testdaten - keine Kunden, Lieferanten nur als Pseudonym.
import test from 'node:test';
import assert from 'node:assert/strict';
import { viewEinkaufAblauf } from '../ansichten/einkauf/ablauf.mjs';
import { einkauf } from '../ansichten/einkauf/auftragsfluss.mjs';
import { kunden } from '../ansichten/kunden/gemeinsam.mjs';
import { state } from '../kern/zustand.mjs';

const pos = (orderId, id, extra = {}) => ({ orderId, orderName: `#T${orderId}`, lineItemId: id, titel: `Artikel ${id}`, farbe: 'Grau', grosshaendlerId: `A-${id}`, bestellmenge: { menge: 1 }, ...extra });
const auftrag = (id, positionen, datum) => ({ id, name: `#T${id}`, offen: true, datum, positionen, details: { kunde: { name: 'Testkunde' } } });

// o1: Ware, Teillieferung (Unterlage da, Teppich unterwegs). o2: reiner Musterauftrag, alles da, Umschlag packbereit.
// o3: reiner Musterauftrag, 1 von 2 Mustern da.
const w1 = pos('o1', 'w1', { titel: 'Unterlage' });
const w2 = pos('o1', 'w2', { titel: 'Teppich', farbe: 'Rot' });
const m1 = pos('o2', 'm1', { istMuster: true });
const m2 = pos('o3', 'm2', { istMuster: true });
const m3 = pos('o3', 'm3', { istMuster: true });
const daten = () => ({
  verfuegbar: true,
  gruppen: [{ lieferant: 'lieferant-a', positionen: [w1, w2] }],
  musterGruppen: [{ lieferant: 'lieferant-b', positionen: [m1, m2, m3] }],
  auftraege: [auftrag('o1', [w1, w2], '2026-11-02'), auftrag('o2', [m1], '2026-11-01'), auftrag('o3', [m2, m3], '2026-11-01')],
  kundeInformiert: {}, kundentermine: {}, gesperrteMuster: [],
});
const status = { 'o1::w1': 'geliefert', 'o1::w2': 'bestellt', 'o2::m1': 'geliefert', 'o3::m2': 'geliefert', 'o3::m3': 'bestellt' };

function ansicht(query, { pack = true, ohneWare = false, gesperrt = [], bereichO2 = 'packen' } = {}) {
  const vorher = { params: state.route.params, view: state.route.view, b: einkauf.bestellungen, s: einkauf.auftragsstatus, l: einkauf.lieferanten, p: kunden.musterPacken };
  try {
    state.route.view = 'einkauf';
    state.route.params = new URLSearchParams(query);
    einkauf.bestellungen = { ...daten(), gesperrteMuster: gesperrt };
    // Ware schon beim Kunden: kein Warenauftrag mehr unter "Jetzt zu tun".
    if (ohneWare) einkauf.bestellungen.auftraege = einkauf.bestellungen.auftraege.filter(a => a.id !== 'o1');
    einkauf.auftragsstatus = { positionen: Object.fromEntries(Object.entries(status).map(([k, st]) => [k, { status: st, bestelltAm: '2026-11-03T09:00:00Z' }])) };
    einkauf.lieferanten = { lieferanten: [{ id: 'lieferant-a', stammdaten: { name: 'Lieferant A' } }] };
    kunden.musterPacken = pack ? { verfuegbar: true, offen: 2, zahlen: { packen: 1, warten: 1, klaeren: 0, gepackt: 0 },
      kunden: [{ bestellungen: [{ orderId: 'o2' }], bereich: bereichO2 }, { bestellungen: [{ orderId: 'o3' }], bereich: 'warten' }] } : { verfuegbar: false };
    return viewEinkaufAblauf();
  } finally {
    state.route.params = vorher.params; state.route.view = vorher.view;
    einkauf.bestellungen = vorher.b; einkauf.auftragsstatus = vorher.s; einkauf.lieferanten = vorher.l; kunden.musterPacken = vorher.p;
  }
}
const karten = html => [...html.matchAll(/<h3><a [^>]*>(#T\w+) ↗/g)].map(m => m[1]);

test('Teillieferung: ruhige Zeile mit dem Fehlenden, kein "Ware ist da", kein Knopf "Nachricht an Kunde"', () => {
  const html = ansicht('');
  assert.match(html, /<p class="small ab-teilstand">Teillieferung: 1 von 2 Warenartikeln da – fehlt noch: Teppich · Rot \(Lieferant A\)<\/p>/);
  assert.doesNotMatch(html, /Ware ist da – Kunde noch nicht informiert/);
  assert.doesNotMatch(html, /data-ab-kunde=/);
  assert.match(html, /aria-current="step"><span class="ab-nr" aria-hidden="true">3<\/span><span class="ab-text">Unterwegs · 1 von 2 da</);
});

test('Vorgabe "Ware", solange ein Warenauftrag zu tun ist; Musterversand als eine Zeile zur Packstation', () => {
  const html = ansicht('');
  assert.match(html, /data-param="art" data-value="ware" aria-pressed="true">Ware<span class="c">1</);
  assert.match(html, /data-value="muster" aria-pressed="false">Muster<span class="c">1</);
  assert.match(html, /data-value="alle" aria-pressed="false">Alle<span class="c">2</);
  assert.deepEqual(karten(html.slice(0, html.indexOf('ab-gruppe') > 0 ? html.indexOf('ab-gruppe') : html.length)), ['#To1']);
  // Die Zeile zaehlt Auftraege wie der Chip "Muster" - "Packbereit" der Packstation zaehlt Umschlaege (Review 06.11.2026).
  assert.match(html, /href="#\/kunden\?tab=muster&amp;mpbereich=packen">1 Musterauftrag zum Verschicken → Packstation</);
  // Kopfzeile zaehlt nur, was im Filter steht - und jeden Auftrag einmal.
  assert.match(html, /<strong>1 Auftrag jetzt zu tun<\/strong> \(1× von uns abschicken\)/);
});

test('"Alle" zeigt wieder alle Karten; Kopfzeile: Teilzahlen ergeben die Gesamtzahl', () => {
  const html = ansicht('art=alle');
  assert.match(html, /<strong>2 Aufträge jetzt zu tun<\/strong> \(1× von uns abschicken · 1× Muster verschicken\)/);
  assert.doesNotMatch(html, /ab-packbereit/, 'die Musterkarte steht selbst da');
  const jetzt = html.slice(html.indexOf('Jetzt zu tun'), html.indexOf('ab-gruppe'));
  assert.deepEqual(karten(jetzt), ['#To1', '#To2']);
  // 1 von 2 Mustern da: wartet eingeklappt unter "Unterwegs", nie "Beim Kunden".
  assert.match(html, /Unterwegs \(1\)/);
  assert.doesNotMatch(html, /Beim Kunden \(/);
});

test('Filter "Muster"; ohne Warenauftrag zu tun gilt "Alle"; Packstand nicht geladen: Zeile zaehlt die Auftraege', () => {
  const muster = ansicht('art=muster');
  assert.deepEqual(karten(muster.slice(0, muster.indexOf('ab-gruppe'))), ['#To2']);
  const ohneWare = ansicht('', { ohneWare: true });
  assert.match(ohneWare, /data-value="alle" aria-pressed="true"/);
  assert.doesNotMatch(ohneWare, /ab-packbereit/);
  const ohnePack = ansicht('', { pack: false });
  assert.match(ohnePack, /1 Musterauftrag zum Verschicken → Packstation/);
});

test('Filter "Ware": rote Musterauftraege verschwinden nicht hinter dem Chip, gepackt und nie eingetragen ist rot (Review 06.11.2026)', () => {
  // m3 gesperrt: o3 ist rot ("Muster kommt nicht") - im Filter "Ware" eine rote Zeile mit Sprung zu "Muster".
  const html = ansicht('', { gesperrt: ['m3'] });
  assert.match(html, /<p class="small warnc ab-packbereit"><a href="#\/einkauf\?art=muster">1 Musterauftrag mit Problem → Muster<\/a>/);
  assert.doesNotMatch(ansicht(''), /mit Problem → Muster/, 'ohne Rot keine Zeile');
  // o2: alles da, Umschlag gepackt und nicht eingetragen - "Jetzt zu tun" mit rotem Rand, nicht "Unterwegs".
  const gepackt = ansicht('art=muster', { bereichO2: 'gepackt' });
  assert.match(gepackt, /1× Versand eintragen/);
  assert.match(gepackt, /Gepackt, nicht eingetragen:/);
  assert.match(gepackt, /mpbereich=gepackt/);
});
