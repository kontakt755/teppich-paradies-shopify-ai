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
  assert.match(quelle, /import \{ meldungNachBuchung \} from '\.\.\/lib\/sonderposten\.mjs'/);
  assert.match(quelle, /catch \{ antwort = \{ verbindung: false \}; \}/);
  assert.doesNotMatch(quelle, /Es wurde nichts gebucht/);
});
