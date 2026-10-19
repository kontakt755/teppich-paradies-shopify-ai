import './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR und kein echter Shopify-Zugang
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { modellName, tokenText } from '../lib/verbrauch.mjs';

const JETZT = new Date('2026-10-16T10:00:00Z');

function privatMit(daten) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-verbrauch-api-'));
  if (daten !== undefined) {
    fs.mkdirSync(path.join(dir, 'verbrauch'));
    fs.writeFileSync(path.join(dir, 'verbrauch', 'claude.json'), typeof daten === 'string' ? daten : JSON.stringify(daten));
  }
  return dir;
}

const stand = (erzeugtAm) => ({ schema: 1, erzeugtAm, summe: { sitzungen: 3 }, sitzungen: [] });

test('Verbrauch: ohne Datei Hinweis mit Befehl, keine Demo-Zahlen; Neuberechnung startet', () => {
  const aufrufe = [];
  const api = createApi({ privatDirPath: privatMit(), now: () => JETZT, verbrauchSammeln: (dir) => { aufrufe.push(dir); return new Promise(() => {}); } });
  const d = api.verbrauchClaude();
  assert.equal(d.verfuegbar, false);
  assert.equal(d.befehl, 'npm run verbrauch:sammeln');
  assert.equal(d.wirdErneuert, true);
  assert.equal(d.summe, undefined);
  // Ein zweiter Aufruf, waehrend der erste rechnet, startet keinen zweiten Lauf.
  api.verbrauchClaude();
  assert.equal(aufrufe.length, 1);
});

test('Verbrauch: frischer Stand wird ohne Neuberechnung geliefert', () => {
  let gestartet = 0;
  const api = createApi({ privatDirPath: privatMit(stand('2026-10-16T09:50:00Z')), now: () => JETZT, verbrauchSammeln: () => { gestartet++; } });
  const d = api.verbrauchClaude();
  assert.equal(d.verfuegbar, true);
  assert.equal(d.wirdErneuert, false);
  assert.equal(d.summe.sitzungen, 3);
  assert.equal(gestartet, 0);
});

test('Verbrauch: veralteter Stand kommt sofort, Neuberechnung im Hintergrund', () => {
  let gestartet = 0;
  const api = createApi({ privatDirPath: privatMit(stand('2026-10-16T08:00:00Z')), now: () => JETZT, verbrauchSammeln: () => { gestartet++; } });
  const d = api.verbrauchClaude();
  assert.equal(d.verfuegbar, true);
  assert.equal(d.wirdErneuert, true);
  assert.equal(gestartet, 1);
});

test('Verbrauch: beschaedigte Datei wird als Fehler gemeldet, nicht als leer', () => {
  const api = createApi({ privatDirPath: privatMit('{kaputt'), now: () => JETZT, verbrauchSammeln: () => {} });
  const d = api.verbrauchClaude();
  assert.equal(d.verfuegbar, false);
  assert.match(d.fehler, /beschädigt/);
});

test('Verbrauch: ohne eingehaengte Berechnung (Tests) startet nichts', () => {
  const api = createApi({ privatDirPath: privatMit(), now: () => JETZT });
  assert.equal(api.verbrauchClaude().wirdErneuert, false);
});

test('Verbrauch: Modellnamen und Tokenzahlen lesbar', () => {
  assert.equal(modellName('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(modellName('claude-haiku-4-5-20251001'), 'Haiku 4.5');
  assert.equal(modellName('claude-sonnet-5'), 'Sonnet 5');
  assert.equal(modellName('claude-opus-5-5[1m]'), 'Opus 5.5 (1M)');
  assert.equal(modellName('etwas-anderes'), 'etwas-anderes');
  assert.equal(tokenText(14_057_333_194), '14,1 Mrd.');
  assert.equal(tokenText(24_920_187), '24,9 Mio.');
  assert.equal(tokenText(12_756), '13 Tsd.');
  assert.equal(tokenText(950), '950');
});
