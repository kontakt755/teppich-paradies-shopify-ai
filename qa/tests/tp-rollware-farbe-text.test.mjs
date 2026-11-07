// WK-03 (Rundgang 06.11.): Die Eigenschaft "Farbe wie Teppichboden" der
// gekettelten Fussleiste darf die Farbnummer nicht doppelt tragen, wenn sie
// schon im Optionsnamen steht ("Grau (075) (075)"). Fuehrt die echte Funktion
// farbeText() aus blocks/tp-rollware-rechner.liquid in einer Node-VM aus.
// Kein Netzwerk, kein Shopify-Zugriff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(path.join(root, 'blocks/tp-rollware-rechner.liquid'), 'utf8');

const start = source.indexOf('  function farbeText() {');
const end = source.indexOf('\n  function updateExtras(', start);
assert.ok(start >= 0 && end > start, 'farbeText() nicht gefunden - Quelltext hat sich strukturell verändert');
const fnSource = source.slice(start, end);

function farbeText(options, farbnummer, wIdx = 0) {
  const ctx = { target: { options, farbnummer }, wIdx };
  vm.runInNewContext(`${fnSource}\nresult = farbeText();`, ctx);
  return ctx.result;
}

test('Nummer steht schon im Namen: nicht doppelt anhängen', () => {
  assert.equal(farbeText(['400 cm', 'Grau (075)'], '075'), 'Grau (075)');
});

test('Nummer fehlt im Namen: einmal anhängen', () => {
  assert.equal(farbeText(['400 cm', 'Grau'], '075'), 'Grau (075)');
});

test('ohne Farbnummer bleibt der Name unverändert', () => {
  assert.equal(farbeText(['400 cm', 'Grau'], ''), 'Grau');
});

test('Nummer nur als Teil einer anderen Zahl zählt nicht als vorhanden', () => {
  assert.equal(farbeText(['400 cm', 'Grau (0750)'], '075'), 'Grau (0750) (075)');
});

test('ohne Ziel-Variante leer', () => {
  const ctx = { target: null, wIdx: 0 };
  vm.runInNewContext(`${fnSource}\nresult = farbeText();`, ctx);
  assert.equal(ctx.result, '');
});
