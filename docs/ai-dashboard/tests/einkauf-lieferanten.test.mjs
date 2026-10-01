import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lieferantenKarten, karteImFilter, ueberfaelligText, hauptAktion, bestellwegText, feldKlartext,
  telLink, werktageZwischen, verlauf, lieferzeiten, stufeVon, wartetage, warnstufe,
} from '../lib/einkauf-lieferanten.mjs';

// Nur erfundene Daten: Pseudonyme (Lieferant A/B), *.example-Adressen.
const JETZT = new Date('2026-01-20T10:00:00Z').getTime();
const vor = tage => new Date(JETZT - tage * 864e5).toISOString();
const pos = (id, extra = {}) => ({ orderId: 'o1', orderName: '#T1', lineItemId: id, titel: `Artikel ${id}`, ...extra });

const STATUS = {
  a2: { status: 'bestellt', bestelltAm: vor(9), lieferantBestellnummer: 'AB-1' },
  a3: { status: 'geliefert', bestelltAm: vor(20), geliefertAm: vor(15) },
  a4: { status: 'erledigt', bestelltAm: vor(30), geliefertAm: vor(25), erledigtAm: vor(24) },
  c1: { status: 'bestellt', bestelltAm: vor(3) },
};
const eintragFuer = p => STATUS[p.lineItemId] || null;
const STAMM_A = { id: 'A', name: 'Lieferant A', kundennummer: 'K-1', ware: { weg: 'portal', portalUrl: 'https://lieferant-a.example/haendler', mail: 'bestellung@lieferant-a.example', telefon: '+49 30 1111111' }, muster: { weg: 'mail', ansprechperson: 'Frau Muster', mail: 'muster@lieferant-a.example' }, fehlend: [], hinterlegt: true };

function karten() {
  return lieferantenKarten({
    gruppen: [
      { lieferant: 'UNGEKLAERT', positionen: [pos('u1')] },
      { lieferant: 'A', schluessel: 'A|SUPPLIER_TO_TP|TP', positionen: [pos('a1'), pos('a2'), pos('a3'), pos('a4')] },
      { lieferant: 'C', positionen: [pos('c1')] },
    ],
    musterGruppen: [{ lieferant: 'A', positionen: [pos('m1', { istMuster: true })] }],
    lieferanten: [{ id: 'A', stammdaten: STAMM_A }, { id: 'B', stammdaten: { id: 'B', name: 'Lieferant B', ware: {}, muster: {}, fehlend: ['ware.weg'], hinterlegt: false } }],
    eintragFuer, jetzt: JETZT,
  });
}

test('Stufe, Wartezeit und Warnstufe einer Position', () => {
  assert.equal(stufeVon(null), 'zuBestellen');
  assert.equal(stufeVon('raus'), 'unterwegs');
  assert.equal(wartetage({ status: 'bestellt', bestelltAm: vor(9) }, JETZT), 9);
  assert.equal(wartetage({ status: 'raus', bestelltAm: vor(9) }, JETZT), null);
  assert.deepEqual([6, 7, 13, 14, null].map(t => warnstufe(t)), [null, 'warn', 'warn', 'crit', null]);
  assert.equal(warnstufe(5, { nachhakenTage: 3, problemTage: 10 }), 'warn');
});

test('lieferantenKarten: zaehlt je Stufe, Muster getrennt, erledigt zaehlt nicht als offen', () => {
  const k = karten();
  const a = k.find(x => x.id === 'A');
  assert.deepEqual(a.zahlen, { zuBestellen: 1, bestellt: 1, unterwegs: 1, musterOffen: 1, musterLaufend: 0 });
  assert.equal(a.offenGesamt, 4);
  assert.equal(a.ware.erledigt.length, 1);
  assert.equal(a.name, 'Lieferant A');
  assert.equal(a.wareGruppen.length, 1);
  assert.equal(a.musterGruppen.length, 1);
});

test('lieferantenKarten: ueberfaellig ab 7 Tagen gelb, ab 14 rot - auch fuer "geliefert an uns"', () => {
  const a = karten().find(x => x.id === 'A');
  // a2 wartet 9 Tage (bestellt), a3 15 Tage (geliefert, noch nicht raus).
  assert.deepEqual({ stufe: a.ueberfaellig.stufe, anzahl: a.ueberfaellig.anzahl, problem: a.ueberfaellig.problem, maxTage: a.ueberfaellig.maxTage }, { stufe: 'crit', anzahl: 2, problem: 1, maxTage: 15 });
  assert.match(ueberfaelligText(a.ueberfaellig).text, /^Überfällig: 2 Bestellungen warten, die älteste seit 15 Tagen\.$/);
  assert.deepEqual(ueberfaelligText({ stufe: 'warn', anzahl: 1, maxTage: 9 }), { stufe: 'warn', text: 'Nachhaken: 1 Bestellung wartet, die älteste seit 9 Tagen.' });
  const c = karten().find(x => x.id === 'C');
  assert.equal(c.ueberfaellig.stufe, null);
  assert.equal(ueberfaelligText(c.ueberfaellig), null);
});

test('lieferantenKarten: Reihenfolge - zu tun zuerst, nicht zugeordnet zuletzt; unbekannter Lieferant bekommt leere Stammdaten', () => {
  const k = karten();
  assert.deepEqual(k.map(x => x.id), ['A', 'C', 'B', 'UNGEKLAERT']);
  const c = k.find(x => x.id === 'C');
  assert.equal(c.stammdaten.hinterlegt, false);
  assert.equal(c.name, 'Lieferant C');
  const u = k.at(-1);
  assert.equal(u.zugeordnet, false);
  assert.equal(u.name, 'Lieferant nicht zugeordnet');
});

test('karteImFilter: ohne Filter alles Offene, mit Filter nur die Stufe', () => {
  const k = karten();
  const sichtbar = af => k.filter(x => karteImFilter(x, af)).map(x => x.id);
  assert.deepEqual(sichtbar(''), ['A', 'C', 'UNGEKLAERT']);
  assert.deepEqual(sichtbar('offen'), ['A', 'UNGEKLAERT']);
  assert.deepEqual(sichtbar('bestellt'), ['A', 'C']);
  assert.deepEqual(sichtbar('unterwegs'), ['A']);
  assert.deepEqual(sichtbar('erledigt'), ['A']);
  assert.deepEqual(sichtbar('quatsch'), []);
});

test('hauptAktion: ein Knopf je Bestellweg', () => {
  assert.deepEqual(hauptAktion(STAMM_A, 'ware'), { weg: 'portal', label: 'Im Portal bestellen', href: 'https://lieferant-a.example/haendler', neuerTab: true });
  assert.deepEqual(hauptAktion(STAMM_A, 'muster'), { weg: 'mail', label: 'Bestellmail öffnen', href: null, neuerTab: false });
  assert.deepEqual(hauptAktion({ ware: { weg: 'telefon', telefon: '+49 30 1111111' } }), { weg: 'telefon', label: 'Anrufen', href: 'tel:+49301111111', neuerTab: false });
  // Portal ohne Adresse: Knopf bleibt, oeffnet aber nur den Dialog.
  assert.equal(hauptAktion({ ware: { weg: 'portal', portalUrl: null } }).href, null);
  assert.deepEqual(hauptAktion({ ware: {} }), { weg: null, label: 'Bestellliste öffnen', href: null, neuerTab: false });
  assert.equal(hauptAktion(null).weg, null);
});

test('bestellwegText, feldKlartext, telLink', () => {
  assert.equal(bestellwegText(STAMM_A, 'ware'), 'im Händlerportal');
  assert.equal(bestellwegText(STAMM_A, 'muster'), 'per E-Mail an Frau Muster');
  assert.equal(bestellwegText({ ware: {} }, 'ware'), null);
  assert.equal(feldKlartext('muster.lieferung'), 'wohin Muster gehen (Kunde oder Laden)');
  assert.equal(feldKlartext('unbekannt.feld'), 'unbekannt.feld');
  assert.equal(telLink('+49 (30) 11-11'), 'tel:+49301111');
  assert.equal(telLink(''), null);
});

test('werktageZwischen zaehlt Mo-Fr', () => {
  // 2026-01-16 ist ein Freitag.
  assert.equal(werktageZwischen('2026-01-16T10:00:00', '2026-01-19T09:00:00'), 1);
  assert.equal(werktageZwischen('2026-01-12T10:00:00', '2026-01-16T10:00:00'), 4);
  assert.equal(werktageZwischen('2026-01-12T08:00:00', '2026-01-12T17:00:00'), 0);
  assert.equal(werktageZwischen('2026-01-16T10:00:00', '2026-01-12T10:00:00'), null);
  assert.equal(werktageZwischen('unsinn', '2026-01-12'), null);
});

test('verlauf: je Tag und Schritt eine Zeile, neueste zuerst', () => {
  const eintraege = [
    { pos: pos('x1', { orderName: '#T1' }), eintrag: { bestelltAm: '2026-01-05T09:00:00Z', bestelltVon: 'tp', lieferantBestellnummer: 'AB-1', geliefertAm: '2026-01-12T09:00:00Z' } },
    { pos: pos('x2', { orderName: '#T2' }), eintrag: { bestelltAm: '2026-01-05T11:00:00Z', bestelltVon: 'tp', lieferantBestellnummer: 'AB-1' } },
    { pos: pos('x3', { orderName: '#T3', istMuster: true }), eintrag: { bestelltAm: '2026-01-05T12:00:00Z' } },
    { pos: pos('x4'), eintrag: null },
  ];
  const v = verlauf(eintraege);
  assert.deepEqual(v.map(z => [z.wort, z.anzahl, z.muster, z.bestellnummer]), [['geliefert', 1, false, null], ['bestellt', 1, true, null], ['bestellt', 2, false, 'AB-1']]);
  assert.deepEqual(v[2].auftraege, ['#T1', '#T2']);
  assert.equal(v[2].von, 'tp');
  assert.equal(verlauf(eintraege, { max: 1 }).length, 1);
  assert.deepEqual(verlauf([]), []);
});

test('lieferzeiten: Werktage bestellt -> geliefert, gleiche Lieferung zaehlt einmal', () => {
  const e = (b, g) => ({ pos: pos('x'), eintrag: { bestelltAm: b, geliefertAm: g } });
  const r = lieferzeiten([
    e('2026-01-05T09:00:00', '2026-01-09T09:00:00'), e('2026-01-05T10:00:00', '2026-01-09T12:00:00'), // eine Lieferung, 4 Werktage
    e('2026-01-12T09:00:00', '2026-01-20T09:00:00'),                                                  // 6 Werktage
    { pos: pos('y'), eintrag: { bestelltAm: '2026-01-12T09:00:00' } },                                // noch nicht geliefert
  ]);
  assert.equal(r.anzahl, 2);
  assert.deepEqual(r.werte.map(w => w.werktage), [4, 6]);
  assert.equal(r.schnitt, 5);
  assert.deepEqual(lieferzeiten([]), { anzahl: 0, schnitt: null, werte: [] });
});
