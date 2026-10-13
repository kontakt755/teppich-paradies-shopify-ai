import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefziele, bewerteSeite, bewerteSuche, zusammenfassen, gesamtStand, seitenText } from '../lib/auslauf.mjs';

// Nur erfundene Daten und Pseudonym-Adressen.
const v = einkauf => ({ einkauf });
const PRODUKTE = [
  { handle: 'testboden', status: 'ACTIVE', varianten: [
    v({ lieferant: 'A', artikelnummer: 'CVTEST_1' }), v({ lieferant: 'A', artikelnummer: 'CVTEST_1' }), v({ lieferant: 'A', artikelnummer: 'CVTEST_2' }),
  ] },
  { handle: 'muster-testboden', status: 'UNLISTED', varianten: [v({ lieferant: 'A', artikelnummer: 'CVTEST_1' })] },
  { handle: 'testteppich', status: 'ACTIVE', varianten: [
    v({ lieferant: 'C', artikelnummer: '2014-1', url: 'https://lieferant-c.example/p/2014-1' }),
    v({ lieferant: 'C', artikelnummer: '2014-1', url: 'https://lieferant-c.example/p/2014-1' }),
    v({ lieferant: 'E', farbnummer: '2F84', url: 'https://lieferant-e.example/x/2f84' }),
    v({ lieferant: 'B', artikelnummer: '69240' }),
  ] },
  { handle: 'alt', status: 'ARCHIVED', varianten: [v({ lieferant: 'A', artikelnummer: 'CVALT' })] },
];

test('pruefziele: je Artikelnummer (A) bzw. Seite (C/D/E), Archiviertes faellt weg, B ist nicht online pruefbar', () => {
  const z = pruefziele(PRODUKTE);
  assert.deepEqual(z.A.map(x => [x.kennung, x.handles]), [['CVTEST_1', ['muster-testboden', 'testboden']], ['CVTEST_2', ['testboden']]]);
  assert.deepEqual(z.C, [{ kennung: '2014-1', url: 'https://lieferant-c.example/p/2014-1', handles: ['testteppich'] }]);
  assert.equal(z.E[0].kennung, '2F84');
  assert.deepEqual(z.D, []);
  assert.deepEqual(z.ohneOnline, { B: 1 });
});

test('bewerteSeite: Fehlcodes je Lieferant, Auslauf-Woerter mit Wortgrenze, fehlende Kennung', () => {
  assert.equal(bewerteSeite('C', { code: 500 }).ergebnis, 'fehlt');
  assert.equal(bewerteSeite('E', { code: 500 }).ergebnis, 'fehler');
  assert.equal(bewerteSeite('D', { code: 410 }).ergebnis, 'fehlt');
  assert.equal(bewerteSeite('D', { code: 0 }).ergebnis, 'fehler');
  assert.equal(bewerteSeite('E', { code: 200, body: '<h1>Strato 2F84</h1>', kennung: '2f84' }).ergebnis, 'ok');
  assert.equal(bewerteSeite('E', { code: 200, body: '<h1>Strato 2F84</h1><p>Artikel ist ein Auslaufmodell</p>' }).ergebnis, 'hinweis');
  // Marken- und Aktionswoerter in Fusszeile oder als Wortteil sind kein Auslauf.
  assert.equal(bewerteSeite('D', { code: 200, body: '<p>2F84</p><p>Markenabverkaufsstelle</p><footer>Abverkauf</footer>' }).ergebnis, 'ok');
  assert.equal(bewerteSeite('C', { code: 200, body: '<h1>Anderer Artikel</h1>', kennung: '2014-1' }).ergebnis, 'verdacht');
  assert.equal(seitenText('<script>auslauf</script><b>a</b>&nbsp;b').trim(), 'a b');
});

test('bewerteSuche: nur der exakte Treffer zaehlt, Fehler sind kein Auslauf', () => {
  assert.equal(bewerteSuche({ gefunden: true }).ergebnis, 'ok');
  assert.equal(bewerteSuche({ gefunden: false }).ergebnis, 'fehlt');
  assert.equal(bewerteSuche({ fehler: 'timeout' }).ergebnis, 'fehler');
});

test('zusammenfassen: einzelne Befunde melden, ab 5 % Fehler oder Fehlmeldungen nur den Ausfall', () => {
  const ok = n => Array.from({ length: n }, (_, i) => ({ kennung: `k${i}`, ergebnis: 'ok' }));
  const einer = zusammenfassen('A', [...ok(99), { kennung: 'CVTEST_2', handles: ['testboden'], ergebnis: 'fehlt', grund: 'weg' }]);
  assert.equal(einer.ausfall, null);
  assert.deepEqual(einer.befunde, [{ lieferant: 'A', ergebnis: 'fehlt', kennung: 'CVTEST_2', url: null, handles: ['testboden'], grund: 'weg' }]);

  const stoerung = zusammenfassen('D', [...ok(90), ...Array.from({ length: 10 }, () => ({ ergebnis: 'fehler' }))]);
  assert.match(stoerung.ausfall, /10 von 100 Abrufen gescheitert/);
  assert.deepEqual(stoerung.befunde, []);

  const umstellung = zusammenfassen('C', [...ok(90), ...Array.from({ length: 10 }, () => ({ ergebnis: 'fehlt' }))]);
  assert.match(umstellung.ausfall, /angeblich weg/);
  assert.equal(zusammenfassen('E', []).ausfall, 'nichts geprueft');
});

test('gesamtStand: rot bei Fehlendem, gelb bei Hinweis oder Ausfall, sonst gruen', () => {
  const t = (lieferant, befunde = [], ausfall = null) => ({ lieferant, geprueft: 10, befunde, ausfall });
  assert.equal(gesamtStand([t('A'), t('C')]).ampel, 'gruen');
  assert.equal(gesamtStand([t('A', [{ ergebnis: 'hinweis' }])]).ampel, 'gelb');
  assert.equal(gesamtStand([t('D', [], 'gestoert')]).ampel, 'gelb');
  const rot = gesamtStand([t('A', [{ ergebnis: 'fehlt' }]), t('D', [], 'gestoert')], { ohneOnline: { B: 3 }, geprueftAm: '2026-10-13T04:00:00Z' });
  assert.equal(rot.ampel, 'rot');
  assert.deepEqual(rot.ausfaelle, [{ lieferant: 'D', grund: 'gestoert' }]);
  assert.equal(rot.lieferanten.A.befunde, undefined);
  assert.deepEqual(rot.ohneOnline, { B: 3 });
});

test('artikelStamm und gehoertZuStamm: Breitenziffern gehoeren zum Stamm, andere Buchstaben nicht', async () => {
  const { artikelStamm, gehoertZuStamm } = await import('../lib/auslauf.mjs');
  assert.equal(artikelStamm('CVTESTA3_A80'), 'CVTESTA');
  assert.equal(artikelStamm('CVTESTA_A21'), 'CVTESTA');
  assert.equal(artikelStamm('PVCTEST30C_3121'), 'PVCTEST30C');
  assert.equal(artikelStamm('ZUBTEST108'), null);
  assert.equal(artikelStamm('PARTEST5895_E103'), 'PARTEST5895');
  assert.equal(gehoertZuStamm('PARTEST5895_E1', 'PARTEST'), false);
  assert.equal(gehoertZuStamm('CVTESTA4_B10', 'CVTESTA'), true);
  assert.equal(gehoertZuStamm('CVTESTAX_B10', 'CVTESTA'), false);
  assert.equal(gehoertZuStamm('CVTESTA', 'CVTESTA'), false);
});

test('neuheitenZiele, neueArtikel, neuSeitVorlauf: archivierte Nummern sind bekannt, gemeldet wird nur Neues seit dem Vorlauf', async () => {
  const { neuheitenZiele, neueArtikel, neuSeitVorlauf } = await import('../lib/auslauf.mjs');
  const z = neuheitenZiele([
    { status: 'ACTIVE', varianten: [{ einkauf: { lieferant: 'A', artikelnummer: 'CVTESTA3_A80' } }, { einkauf: { lieferant: 'C', artikelnummer: 'X_1' } }] },
    { status: 'ARCHIVED', varianten: [{ einkauf: { lieferant: 'A', artikelnummer: 'CVALT_A1' } }, { einkauf: { lieferant: 'A', artikelnummer: 'CVTESTA3_A99' } }] },
  ]);
  assert.deepEqual(z.staemme, ['CVTESTA']);
  assert.equal(z.bekannt.has('CVTESTA3_A99'), true);
  const neu = neueArtikel('CVTESTA', [
    { material_number: 'CVTESTA', name: 'Elternartikel' },
    { material_number: 'CVTESTA3_A80', name: 'bekannt' },
    { material_number: 'CVTESTA3_A99', name: 'archiviert' },
    { material_number: 'CVTESTA4_A80', name: 'Testboden   400cm' },
    { material_number: 'CVTESTA4_A80', name: 'doppelt' },
    { material_number: 'CVTESTAX_A1', name: 'andere Linie' },
  ], z.bekannt);
  assert.deepEqual(neu, [{ stamm: 'CVTESTA', nr: 'CVTESTA4_A80', name: 'Testboden 400cm' }]);
  assert.deepEqual(neuSeitVorlauf(neu, null), []);
  assert.deepEqual(neuSeitVorlauf(neu, [{ nr: 'CVTESTA4_A80' }]), []);
  assert.deepEqual(neuSeitVorlauf(neu, []), neu);
});
