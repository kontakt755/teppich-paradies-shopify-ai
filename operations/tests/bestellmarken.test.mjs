import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setzeHaken, leseAlle } from '../lib/bestellmarken.mjs';

function tmpDatei() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-bestellmarken-')), 'bestellmarken.json');
}

test('fehlende Datei heisst: nichts abgehakt', () => {
  assert.deepEqual(leseAlle(tmpDatei()), {});
});

test('Haken setzen, lesen und zuruecknehmen', () => {
  const d = tmpDatei();
  const jetzt = new Date('2026-10-22T10:00:00Z');
  const r = setzeHaken(d, 'gid://shopify/Order/1', { erledigt: true, von: 'Lena', jetzt });
  assert.deepEqual(r.abgehakt, { zeit: jetzt.toISOString(), von: 'Lena' });
  assert.deepEqual(Object.keys(leseAlle(d)), ['gid://shopify/Order/1']);
  assert.equal(setzeHaken(d, 'gid://shopify/Order/1', { erledigt: false }).abgehakt, null);
  assert.deepEqual(leseAlle(d), {});
});

test('beschaedigte Datei wirft statt alle Haken zu verlieren', () => {
  const d = tmpDatei();
  fs.writeFileSync(d, '{kaputt');
  assert.throws(() => leseAlle(d), /beschädigt/);
  assert.throws(() => setzeHaken(d, 'x', { erledigt: true }), /beschädigt/);
});

test('ohne Bestellung kein Haken', () => {
  assert.throws(() => setzeHaken(tmpDatei(), '  ', { erledigt: true }), /Keine Bestellung/);
});
