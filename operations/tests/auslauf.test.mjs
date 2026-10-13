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
