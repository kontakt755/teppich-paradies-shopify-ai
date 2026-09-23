import test from 'node:test';
import assert from 'node:assert/strict';
import { leseIntervallMinuten, hatZugang, starteDienst, STANDARD_INTERVALL_MINUTEN } from '../scripts/sync-dienst.mjs';

function stummesProtokoll() {
  const zeilen = { log: [], warn: [], error: [] };
  return { protokoll: { log: (m) => zeilen.log.push(m), warn: (m) => zeilen.warn.push(m), error: (m) => zeilen.error.push(m) }, zeilen };
}

test('leseIntervallMinuten: Standard 10, respektiert TP_SYNC_INTERVALL_MINUTEN, lehnt Unsinn ab', () => {
  assert.equal(leseIntervallMinuten({}), STANDARD_INTERVALL_MINUTEN);
  assert.equal(leseIntervallMinuten({ TP_SYNC_INTERVALL_MINUTEN: '5' }), 5);
  assert.throws(() => leseIntervallMinuten({ TP_SYNC_INTERVALL_MINUTEN: '0' }), /ungueltig/);
  assert.throws(() => leseIntervallMinuten({ TP_SYNC_INTERVALL_MINUTEN: 'abc' }), /ungueltig/);
});

test('hatZugang erkennt Token und Client-Credentials, sonst false', () => {
  assert.equal(hatZugang({}), false);
  assert.equal(hatZugang({ SHOPIFY_ADMIN_TOKEN: 'shpat_x' }), true);
  assert.equal(hatZugang({ SHOPIFY_CLIENT_ID: 'a', SHOPIFY_CLIENT_SECRET: 'b' }), true);
  assert.equal(hatZugang({ SHOPIFY_CLIENT_ID: 'a' }), false);
});

test('starteDienst ruft lauf() mehrfach im Intervall auf und wartet dazwischen', async () => {
  let aufrufe = 0;
  const gewarteteMs = [];
  const { protokoll } = stummesProtokoll();
  const laeufe = await starteDienst({
    intervallMinuten: 7,
    lauf: async () => { aufrufe += 1; return { ergebnisse: [{ teil: 'x', erfolg: true }] }; },
    warten: async (ms) => { gewarteteMs.push(ms); },
    protokoll,
    maxLaeufe: 3,
  });
  assert.equal(aufrufe, 3);
  assert.equal(laeufe, 3);
  // Wartezeit nur zwischen den Laeufen, nicht nach dem letzten (maxLaeufe erreicht).
  assert.deepEqual(gewarteteMs, [7 * 60000, 7 * 60000]);
});

test('starteDienst bricht sofort ab, wenn signal schon aborted ist', async () => {
  const controller = new AbortController();
  controller.abort();
  let aufrufe = 0;
  const { protokoll } = stummesProtokoll();
  const laeufe = await starteDienst({ intervallMinuten: 1, lauf: async () => { aufrufe += 1; return { ergebnisse: [] }; }, signal: controller.signal, protokoll });
  assert.equal(aufrufe, 0);
  assert.equal(laeufe, 0);
});

test('SIGTERM waehrend der Wartezeit beendet den Dienst, ohne einen laufenden Lauf abzubrechen', async () => {
  const controller = new AbortController();
  let aufrufe = 0;
  const { protokoll } = stummesProtokoll();
  const warten = async (ms, signal) => new Promise((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
  const p = starteDienst({ intervallMinuten: 1, lauf: async () => { aufrufe += 1; return { ergebnisse: [] }; }, warten, signal: controller.signal, protokoll });
  // Erster Lauf ist durch, Dienst wartet jetzt - Abbruch simulieren.
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  const laeufe = await p;
  assert.equal(aufrufe, 1);
  assert.equal(laeufe, 1);
});

test('ein Fehler in lauf() wird protokolliert, der Dienst laeuft danach weiter', async () => {
  let aufrufe = 0;
  const { protokoll, zeilen } = stummesProtokoll();
  const laeufe = await starteDienst({
    intervallMinuten: 1,
    lauf: async () => { aufrufe += 1; if (aufrufe === 1) throw new Error('Netzwerk kaputt'); return { ergebnisse: [{ teil: 'bestellungen', erfolg: true }] }; },
    warten: async () => {},
    protokoll,
    maxLaeufe: 2,
  });
  assert.equal(aufrufe, 2);
  assert.equal(laeufe, 2);
  assert.equal(zeilen.error.length, 1);
  assert.match(zeilen.error[0], /Netzwerk kaputt/);
});

test('ein fehlgeschlagener Teil (erfolg:false) wird als Warnung protokolliert, nicht als Absturz', async () => {
  const { protokoll, zeilen } = stummesProtokoll();
  const laeufe = await starteDienst({
    intervallMinuten: 1,
    lauf: async () => ({ ergebnisse: [{ teil: 'lexikon', erfolg: false, meldung: 'Kein Zugang' }, { teil: 'kennzahlen', erfolg: true }] }),
    warten: async () => {},
    protokoll,
    maxLaeufe: 1,
  });
  assert.equal(laeufe, 1);
  assert.equal(zeilen.warn.length, 1);
  assert.match(zeilen.warn[0], /lexikon: Kein Zugang/);
  assert.equal(zeilen.error.length, 0);
});
