import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILTER = path.join(wurzel, 'qa', 'log-filter.mjs');

/** Schreibt ein Ergebnis-JSON in eine Wegwerf-Datei und laesst den Filter darauf los. */
function filtere(findings, { status = 'WARN', summary } = {}) {
  const datei = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'tp-log-filter-')),
    'ergebnis.json'
  );
  fs.writeFileSync(datei, JSON.stringify({
    status,
    summary: summary ?? { errors: 0, warnings: findings.length, passes: 0 },
    findings,
  }));
  const r = spawnSync('node', [FILTER, datei], { encoding: 'utf8' });
  return r.stdout;
}

const warnung = (code) => ({ severity: 'WARN', code, page: 'Startseite', message: 'Etwas ist auffaellig' });

// SHP-003: Der Filter suchte nach severity 'WARNING'. Die QA-Werkzeuge
// schreiben aber 'WARN'. Bei einem Lauf ohne ERROR blieb der Abschnitt
// "First Relevant Assertion" deshalb leer - uebrig blieben Zaehler.
test('WARN wird als Befund erkannt, nicht nur gezaehlt', () => {
  const aus = filtere([warnung('TOUCH_TARGET')]);
  assert.match(aus, /First Relevant Assertion/);
  assert.match(aus, /TOUCH_TARGET/);
});

test('WARNING bleibt als Schreibweise zulaessig', () => {
  const aus = filtere([{ severity: 'WARNING', code: 'ALT_TEXT', message: 'x' }]);
  assert.match(aus, /ALT_TEXT/);
});

test('ERROR geht WARN vor', () => {
  const aus = filtere([warnung('TOUCH_TARGET'), { severity: 'ERROR', code: 'META_FEHLT', message: 'x' }]);
  assert.match(aus, /Severity: ERROR/);
  assert.match(aus, /META_FEHLT/);
});

test('FAIL zaehlt wie ERROR', () => {
  const aus = filtere([warnung('TOUCH_TARGET'), { severity: 'FAIL', code: 'SEITE_TOT', message: 'x' }]);
  assert.match(aus, /Severity: FAIL/);
  assert.match(aus, /SEITE_TOT/);
});

test('PASS allein erzeugt keinen Befundabschnitt', () => {
  const aus = filtere([{ severity: 'PASS', code: 'OK', message: 'x' }], { status: 'PASS' });
  assert.doesNotMatch(aus, /First Relevant Assertion/);
});

// Akzeptanzkriterium aus SHP-003: hoechstens 30 relevante Zeilen.
test('Ausgabe bleibt unter 30 Zeilen, auch bei langer Meldung', () => {
  const lang = { severity: 'WARN', code: 'LANG', page: 'x', message: Array.from({ length: 80 }, (_, i) => `Zeile ${i}`).join('\n') };
  const aus = filtere([lang, ...Array.from({ length: 50 }, (_, i) => warnung(`W${i}`))]);
  const zeilen = aus.split('\n').filter((z) => z.trim() !== '').length;
  assert.ok(zeilen <= 30, `Ausgabe hat ${zeilen} Zeilen, erlaubt sind 30`);
});
