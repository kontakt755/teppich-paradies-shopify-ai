// Rueckmeldung nach "Im Laden verkauft" (lib/sonderposten.mjs). Anlass: Codex-Review
// 2026-10-09 - bei Antwortverlust stand "Es wurde nichts gebucht", obwohl die
// Shopify-Mutation schon durch sein konnte. Eine Negativbestaetigung darf nur
// erscheinen, wo der Server sie belegt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { meldungNachBuchung, TEXT_ERFOLG, TEXT_OHNE_ANTWORT } from '../lib/sonderposten.mjs';
import { ERGEBNIS_UNKLAR, RECHT_FEHLT } from '../../../operations/lib/sonderposten.mjs';

const OK = { gebucht: true, gegenprobe: 'ok', ok: true, bestandNachher: 0, onlineGesperrt: true, felderFehler: null };

test('keine Antwort vom Dashboard: unklar, Liste neu laden - nie "nichts gebucht"', () => {
  const m = meldungNachBuchung({ verbindung: false });
  assert.equal(m.erfolg, false);
  assert.equal(m.text, TEXT_OHNE_ANTWORT);
  assert.match(m.text, /unklar/);
  assert.doesNotMatch(m.text, /nichts gebucht/i);
  assert.equal(m.neuLaden, true);
});

test('Erfolg nur bei Bestand 0, online gesperrt und gespeicherten Feldern', () => {
  assert.deepEqual(meldungNachBuchung({ ok: true, ergebnis: OK }), { erfolg: true, klasse: null, text: TEXT_ERFOLG, neuLaden: true });
});

test('gebucht, aber die Gegenprobe konnte nicht lesen: angenommen, bitte pruefen - kein Fehlschlag', () => {
  const m = meldungNachBuchung({ ok: true, ergebnis: { ...OK, ok: false, gegenprobe: 'fehlgeschlagen', bestandNachher: null, onlineGesperrt: null } });
  assert.equal(m.erfolg, false);
  assert.equal(m.klasse, 'warn');
  assert.match(m.text, /hat die Buchung angenommen/);
  assert.doesNotMatch(m.text, /nicht geklappt|nichts gebucht/i);
});

test('Gegenprobe: Bestand nicht 0 oder Ueberverkauf an -> Warnung mit Handgriff', () => {
  assert.match(meldungNachBuchung({ ok: true, ergebnis: { ...OK, ok: false, bestandNachher: 1, onlineGesperrt: false } }).text, /Bestand 1 statt 0/);
  const p = meldungNachBuchung({ ok: true, ergebnis: { ...OK, ok: false, onlineGesperrt: false } });
  assert.match(p.text, /fortsetzen“ eingeschaltet – online weiter bestellbar/);
  assert.doesNotMatch(p.text, /online nicht mehr bestellbar/, 'keine falsche Zusage');
  assert.match(meldungNachBuchung({ ok: true, ergebnis: { ...OK, felderFehler: 'Wert nicht erlaubt' } }).text, /Wert nicht erlaubt/);
});

test('200 ohne lesbares Ergebnis: unklar', () => {
  const m = meldungNachBuchung({ ok: true, ergebnis: {} });
  assert.match(m.text, /unklar/);
  assert.equal(m.neuLaden, true);
});

test('Serverfehler: Text des Servers, unklar bleibt unklar, leere 5xx-Antwort ist unklar', () => {
  assert.deepEqual(meldungNachBuchung({ ok: false, status: 504, grund: 'unklar', text: ERGEBNIS_UNKLAR }),
    { erfolg: false, klasse: 'warn', text: ERGEBNIS_UNKLAR, neuLaden: true });
  assert.equal(meldungNachBuchung({ ok: false, status: 502, grund: null, text: '' }).text, TEXT_OHNE_ANTWORT);
  assert.equal(meldungNachBuchung({ ok: false, status: 403, grund: 'recht-fehlt', text: RECHT_FEHLT }).klasse, 'warn');
  const besetzt = meldungNachBuchung({ ok: false, status: 409, grund: 'bestand', text: 'Dieses Stück ist bereits verkauft (Bestand 0) – nichts gebucht.' });
  assert.equal(besetzt.klasse, 'crit');
  assert.equal(besetzt.neuLaden, true);
  assert.match(meldungNachBuchung({ ok: false, status: 401, text: '' }).text, /Anmeldung ist abgelaufen/);
});

test('die Ansicht nimmt ihre Rueckmeldung aus lib/sonderposten.mjs und behauptet ohne Antwort nichts', async () => {
  const { readFileSync } = await import('node:fs');
  const quelle = readFileSync(new URL('../ansichten/sonderposten.mjs', import.meta.url), 'utf8');
  assert.match(quelle, /import \{ meldungNachBuchung(, rollenRechnung)? \} from '\.\.\/lib\/sonderposten\.mjs'/);
  // Beide Dialoge (Einzelstueck und Restrolle) werten fehlende Antworten als "unklar".
  assert.equal(quelle.match(/catch \{ antwort = \{ verbindung: false \}; \}/g)?.length, 2);
  assert.doesNotMatch(quelle, /Es wurde nichts gebucht/);
});

// -- Restrollen (Inhaber 2026-10-12) -------------------------------------------

test('rollenRechnung: Laenge x volle Breite, aufgerundet, Rest in m2 und m; zu viel wird abgelehnt', async () => {
  const { rollenRechnung, leseMeter } = await import('../lib/sonderposten.mjs');
  const { qmFuerLaenge } = await import('../../../operations/lib/sonderposten.mjs');
  assert.equal(leseMeter('3,5'), 3.5);
  assert.equal(leseMeter(' 3.5 m '), 3.5);
  assert.equal(leseMeter('3,5,1'), null);
  const r = rollenRechnung('3,5', 4, 80);
  assert.equal(r.ok, true);
  assert.equal(r.qm, 14);
  assert.equal(r.text, '3,5 m × 4 m = 14 m² · danach noch 66 m² (16,5 m)');
  assert.match(rollenRechnung('3,3', 4, 80).text, /13,2 m², aufgerundet 14 m²/);
  assert.match(rollenRechnung('20,01', 4, 80).fehler, /nur noch 80 m² \(20 m\)/);
  assert.equal(rollenRechnung('', 4, 80).leer, true);
  assert.equal(rollenRechnung('3,456', 4, 80).ok, false);
  assert.equal(rollenRechnung('0', 4, 80).ok, false);
  // Browser und Server rechnen gleich (Server bucht, Browser zeigt vorher an).
  for (let cm = 1; cm <= 2000; cm += 7) {
    for (const breite of [2, 4, 5]) {
      assert.equal(rollenRechnung(String(cm / 100).replace('.', ','), breite, 1e6).qm, qmFuerLaenge(cm / 100, breite), `${cm} cm bei ${breite} m`);
    }
  }
});

test('Rolle gebucht: Rest in Metern und m2, leer = online nicht mehr bestellbar', () => {
  const basis = { typ: 'rolle', gebucht: true, gegenprobe: 'ok', ok: true, qm: 14, bestandVorher: 80, bestandErwartet: 66, bestandNachher: 66, restLaengeM: 16.5 };
  const m = meldungNachBuchung({ ok: true, ergebnis: basis });
  assert.equal(m.erfolg, true);
  assert.equal(m.text, '14 m² abgebucht – noch 16,5 m (66 m²) auf der Rolle');
  const leer = meldungNachBuchung({ ok: true, ergebnis: { ...basis, bestandErwartet: 0, bestandNachher: 0, restLaengeM: 0 } });
  assert.match(leer.text, /Rolle ist jetzt leer und online nicht mehr bestellbar/);
});

test('Rolle gebucht, aber Gegenprobe weicht ab oder ist nicht lesbar: Warnung, kein Fehlschlag', () => {
  const basis = { typ: 'rolle', gebucht: true, qm: 14, bestandVorher: 80, bestandErwartet: 66, restLaengeM: null };
  const nichtLesbar = meldungNachBuchung({ ok: true, ergebnis: { ...basis, gegenprobe: 'fehlgeschlagen', ok: false, bestandNachher: null } });
  assert.equal(nichtLesbar.erfolg, false);
  assert.equal(nichtLesbar.klasse, 'warn');
  assert.match(nichtLesbar.text, /angenommen \(80 → 66 m²\)/);
  const abweichend = meldungNachBuchung({ ok: true, ergebnis: { ...basis, gegenprobe: 'ok', ok: false, bestandNachher: 62 } });
  assert.match(abweichend.text, /62 m² statt 66 m²/);
});
