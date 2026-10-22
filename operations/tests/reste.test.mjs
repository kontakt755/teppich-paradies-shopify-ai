import test from 'node:test';
import assert from 'node:assert/strict';
import { restRegel, wirdVerlegt, kennwoerter, herstellerPasst, farbnummerNorm, abgleichIndex, sucheBeiAC, acTrefferFuer } from '../lib/reste.mjs';
import { vorschlaege } from '../lib/musterlager.mjs';

// Nur synthetische Daten: Pseudonym-Lieferanten, ausgedachte Hersteller, Qualitaeten und SKUs.
function produkt(handle, titel, produktgruppe, varianten, status = 'ACTIVE') {
  return { handle, titel, produktgruppe, status, varianten };
}
function variante(sku, farbe, einkauf) {
  return { sku, farbe, einkauf: { farbnummer: null, kollektion: null, marke: null, ...einkauf } };
}
const LEXIKON = [
  produkt('kalvia-teppichboden', 'Kalvia Teppichboden 400cm 500cm', 'Teppichboden', [
    variante('TEPORBIS4_033', 'Sand', { lieferant: 'A', produktname: 'Teppichboden Orbis 400 cm Linie 027', farbnummer: '33', hersteller: 'Xantos Yarns Europe NV (B-Testdorf)' }),
    variante('TEPORBIS5_033', 'Sand', { lieferant: 'A', produktname: 'Teppichboden Orbis 500 cm Linie 027', farbnummer: '33', hersteller: 'Xantos Yarns Europe NV (B-Testdorf)' }),
    variante('TEPORBIS4_098', 'Graphit', { lieferant: 'A', produktname: 'Teppichboden Orbis 400 cm Linie 027', farbnummer: '98', hersteller: 'Xantos Yarns Europe NV (B-Testdorf)' }),
  ]),
  produkt('pernia-teppichboden', 'Pernia Teppichboden 400cm', 'Teppichboden', [
    variante('2208-000901', 'Leinen', { lieferant: 'C', produktname: 'Hausmarke Akzent 2409 FB 31 Beige 400 cm', farbnummer: '31', hersteller: 'Xantos Yarns Europe NV, Testdorf' }),
  ]),
  produkt('lumo-klickvinyl', 'Lumo Eiche – Klickvinyl', 'Klickvinyl', [
    variante('CVLUMO_A80', 'Eiche Natur', { lieferant: 'C', produktname: 'Klick Lumo 5mm', farbnummer: null, hersteller: null }),
  ]),
  produkt('alt-teppichboden', 'Alt Teppichboden', 'Teppichboden', [variante('TEPALT_1', 'Rot', { lieferant: 'A', produktname: 'Orbis Alt', hersteller: 'Xantos Yarns' })], 'ARCHIVED'),
  produkt('fremd-teppichboden', 'Fremd Teppichboden', 'Teppichboden', [variante('FR-ORBIS-33', 'Sand', { lieferant: 'D', produktname: 'Orbis 400 cm', farbnummer: '033', hersteller: 'Xantos Yarns Europe NV' })]),
  produkt('leiste', 'Sockelleiste', 'Sockelleisten', [variante('SL_1', 'Weiss', { lieferant: 'A', produktname: 'Orbis Leiste', hersteller: 'Xantos Yarns' })]),
];

test('restRegel: A/C-Ware in Teppichboden und Vinyl aufheben, andere Quelle abgleichen, Rest nie', () => {
  assert.equal(restRegel({ lieferant: 'A', produktgruppe: 'Teppichboden' }), 'aufheben');
  assert.equal(restRegel({ lieferant: 'c', produktgruppe: 'Klebevinyl' }), 'aufheben');
  assert.equal(restRegel({ lieferant: 'D', produktgruppe: 'Vinyl von der Rolle' }), 'abgleichen');
  assert.equal(restRegel({ lieferant: null, produktgruppe: 'Klickvinyl' }), 'abgleichen');
  assert.equal(restRegel({ lieferant: 'A', produktgruppe: 'Sockelleisten' }), null);
  assert.equal(restRegel({ lieferant: 'A', produktgruppe: 'Teppich nach Maß' }), null);
  assert.equal(restRegel({ lieferant: 'A', produktgruppe: 'Teppichboden', istMuster: true }), null);
});

test('wirdVerlegt: Baustelle oder gebuchte Verlegung; Direktversand nie', () => {
  assert.equal(wirdVerlegt({ route: 'SUPPLIER_TO_SITE' }), true);
  assert.equal(wirdVerlegt({ route: 'SUPPLIER_TO_TP' }, { checks: { verlegung: 'Ja' } }), true);
  assert.equal(wirdVerlegt({ route: 'SUPPLIER_TO_TP' }, { checks: { verlegung: 'Nein' } }), false);
  assert.equal(wirdVerlegt({ route: 'SUPPLIER_DIRECT' }, { checks: { verlegung: 'Ja' } }), false);
});

test('kennwoerter, farbnummerNorm, herstellerPasst', () => {
  assert.deepEqual(kennwoerter('Teppichboden Orbis 400 cm Linie 027'), ['orbis', 'linie', '027']);
  assert.equal(farbnummerNorm('033'), '33');
  assert.equal(farbnummerNorm('FB 31'), '31');
  assert.equal(farbnummerNorm('2F84'), '2F84');
  assert.equal(farbnummerNorm('–'), null);
  assert.equal(herstellerPasst('Xantos Yarns', 'Xantos Yarns Europe NV (B-Testdorf)'), true);
  assert.equal(herstellerPasst('XY', 'Xantos Yarns Europe NV (B-Testdorf)'), true, 'Kuerzel = Anfangsbuchstaben');
  assert.equal(herstellerPasst('QZ', 'Xantos Yarns Europe NV'), false);
  assert.equal(herstellerPasst('Quorra Mills', 'Xantos Yarns'), false);
  assert.equal(herstellerPasst('XY', null), null);
});

test('abgleichIndex: nur aktive A/C-Varianten der Reste-Gruppen', () => {
  const idx = abgleichIndex(LEXIKON);
  assert.deepEqual(idx.map(x => x.sku).sort(), ['2208-000901', 'CVLUMO_A80', 'TEPORBIS4_033', 'TEPORBIS4_098', 'TEPORBIS5_033']);
});

test('sucheBeiAC: Qualitaet + Farbnummer trifft die Farbe, anderer Hersteller schliesst aus', () => {
  const idx = abgleichIndex(LEXIKON);
  const r = sucheBeiAC(idx, { hersteller: 'XY', qualitaet: 'Orbis', farbnummer: '033' });
  assert.equal(r.length, 1);
  assert.equal(r[0].handle, 'kalvia-teppichboden');
  assert.equal(r[0].farbeGefunden, true);
  assert.deepEqual(r[0].farben.map(f => f.sku), ['TEPORBIS4_033', 'TEPORBIS5_033']);
  assert.deepEqual(sucheBeiAC(idx, { hersteller: 'Quorra Mills', qualitaet: 'Orbis' }), []);
  // Ohne Farbnummer: alle Farben zur Auswahl.
  assert.equal(sucheBeiAC(idx, { qualitaet: 'Orbis' })[0].farben.length, 3);
  // Unbekannte Qualitaet: nichts.
  assert.deepEqual(sucheBeiAC(idx, { qualitaet: 'Gibtsnicht' }), []);
});

test('sucheBeiAC: Hersteller allein zeigt alles von ihm bei A/C (auch unter eigenem Namen)', () => {
  const idx = abgleichIndex(LEXIKON);
  const r = sucheBeiAC(idx, { hersteller: 'XY', farbnummer: '31' });
  assert.deepEqual(r.map(t => t.handle), ['pernia-teppichboden', 'kalvia-teppichboden']);
  assert.equal(r[0].farbeGefunden, true);
  // Ohne Hersteller beim Lieferanten: bleibt, aber als offen markiert.
  const lumo = sucheBeiAC(idx, { hersteller: 'XY', qualitaet: 'Lumo' });
  assert.equal(lumo[0].handle, 'lumo-klickvinyl');
  assert.equal(lumo[0].herstellerOffen, true);
  assert.deepEqual(sucheBeiAC(idx, {}), []);
});

test('acTrefferFuer: Variante anderer Quelle mit Hersteller und Farbnummer findet das A/C-Gegenstueck', () => {
  const idx = abgleichIndex(LEXIKON);
  const fremd = LEXIKON.find(p => p.handle === 'fremd-teppichboden').varianten[0];
  const t = acTrefferFuer(idx, fremd);
  assert.equal(t[0]?.handle, 'kalvia-teppichboden');
  assert.deepEqual(t[0].farben.map(f => f.sku), ['TEPORBIS4_033', 'TEPORBIS5_033']);
  // Ohne Farbnummer oder Hersteller: kein automatischer Treffer.
  assert.deepEqual(acTrefferFuer(idx, { ...fremd, sku: 'X', einkauf: { ...fremd.einkauf, farbnummer: null } }), []);
  assert.deepEqual(acTrefferFuer(idx, { ...fremd, einkauf: { ...fremd.einkauf, hersteller: null } }), []);
  // A/C-Ware selbst gleicht nicht ab.
  assert.deepEqual(acTrefferFuer(idx, LEXIKON[0].varianten[0]), []);
});

test('vorschlaege: eingetroffene Verlegeware von A/C und abgeglichene Fremdware als Verlegerest', () => {
  const jetzt = new Date('2026-10-21T12:00:00Z');
  const idx = abgleichIndex(LEXIKON);
  const gruppen = new Map(LEXIKON.map(p => [p.handle, p.produktgruppe]));
  const jeSku = new Map(LEXIKON.flatMap(p => p.varianten.map(v => [v.sku, v])));
  const ware = (id, sku, handle, extra = {}) => ({ lineItemId: id, istMuster: false, sku, handle, titel: 'Kalvia Teppichboden 400cm', farbe: 'Sand', lieferant: 'A', route: 'SUPPLIER_TO_SITE', ...extra });
  const modell = {
    auftraege: [
      { id: 'O1', name: '#O1', datum: '2026-10-10T10:00:00Z', positionen: [ware('L1', 'TEPORBIS4_098', 'kalvia-teppichboden', { farbe: 'Graphit' })] },
      // Abholung ohne Verlegung: kein Rest bei uns.
      { id: 'O2', name: '#O2', datum: '2026-10-10T10:00:00Z', checks: { verlegung: 'Nein' }, positionen: [ware('L1', 'CVLUMO_A80', 'lumo-klickvinyl', { route: 'SUPPLIER_TO_TP', lieferant: 'C' })] },
      // Fremdware mit Gegenstueck bei A.
      { id: 'O3', name: '#O3', datum: '2026-10-11T10:00:00Z', checks: { verlegung: 'Ja' }, positionen: [ware('L1', 'FR-ORBIS-33', 'fremd-teppichboden', { route: 'SUPPLIER_TO_TP', lieferant: 'D', titel: 'Fremd Teppichboden' })] },
      // Noch nicht geliefert.
      { id: 'O4', name: '#O4', datum: '2026-10-12T10:00:00Z', positionen: [ware('L1', '2208-000901', 'pernia-teppichboden', { lieferant: 'C' })] },
      // Zubehoer: nie.
      { id: 'O5', name: '#O5', datum: '2026-10-12T10:00:00Z', positionen: [ware('L1', 'SL_1', 'leiste')] },
    ],
  };
  const geliefert = { status: 'geliefert', geliefertAm: '2026-10-15T09:00:00Z' };
  const statusAlle = { 'O1::L1': geliefert, 'O2::L1': geliefert, 'O3::L1': geliefert, 'O5::L1': geliefert };
  const v = vorschlaege(modell, {
    lager: { eintraege: [] }, statusAlle, produktgruppe: h => gruppen.get(h) ?? null, jetzt,
    acTreffer: p => acTrefferFuer(idx, jeSku.get(p.sku)),
  });
  assert.deepEqual(v.map(x => [x.grund, x.schluessel, x.artVorschlag]), [['verlegerest', 'TEPORBIS4_033', 'rest'], ['verlegerest', 'TEPORBIS4_098', 'rest']]);
  const fremd = v.find(x => x.schluessel === 'TEPORBIS4_033');
  assert.deepEqual(fremd.schluesselAlle, ['TEPORBIS4_033', 'TEPORBIS5_033']);
  assert.equal(fremd.handle, 'kalvia-teppichboden');
  assert.deepEqual(fremd.verlegerest, { am: '2026-10-15T09:00:00Z', orderName: '#O3', lieferant: 'D', ueber: 'A' });
  assert.equal(v.find(x => x.schluessel === 'TEPORBIS4_098').verlegerest.ueber, null);

  // Schon im Lager oder laenger als 45 Tage her: kein Vorschlag mehr.
  assert.equal(vorschlaege(modell, { lager: { eintraege: [{ id: 'ml-1', art: 'rest', schluessel: ['TEPORBIS4_098'] }] }, statusAlle, produktgruppe: h => gruppen.get(h) ?? null, jetzt })
    .some(x => x.schluessel === 'TEPORBIS4_098'), false);
  assert.deepEqual(vorschlaege(modell, { lager: { eintraege: [] }, statusAlle, produktgruppe: h => gruppen.get(h) ?? null, jetzt: new Date('2026-12-31T12:00:00Z') }), []);
});
