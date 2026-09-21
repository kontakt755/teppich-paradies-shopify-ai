// Issue 162: Das Preisbeispiel vor der ersten Eingabe (preisBeispiel) darf nie
// einen anderen Betrag nennen als die Rechnung in calculate(). Extrahiert die
// echten Funktionen aus blocks/tp-rollware-rechner.liquid und prueft sie gegen
// die Ausdruecke, die calculate() verwendet - und dass diese Ausdruecke dort
// noch woertlich stehen. Kein Netzwerk, kein Shopify-Zugriff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rollFile = 'blocks/tp-rollware-rechner.liquid';
const source = readFileSync(path.join(root, rollFile), 'utf8');

function extract(signature) {
  const start = source.indexOf(signature);
  const end = source.indexOf('\n  }', start) + '\n  }'.length;
  assert.ok(start >= 0 && end > start, `${signature} nicht gefunden - Quelltext hat sich strukturell veraendert`);
  return source.slice(start, end);
}

const context = vm.createContext({});
vm.runInContext(
  extract('  function roundedHundredthsQty(wCm, lenCm) {') + '\n' +
  extract('  function preisBeispiel(wCm, lenCm, priceCents, exakt) {') +
  '\nthis.preisBeispiel = preisBeispiel;',
  context,
  { filename: rollFile, timeout: 1000 },
);
const { preisBeispiel } = context;

test('volle Quadratmeter: 400 x 500 cm zu 32,90 EUR/m2', () => {
  const b = preisBeispiel(400, 500, '3290', false);
  assert.equal(b.area, 20);
  assert.equal(b.billedArea, 20);
  assert.equal(Math.round(b.total * 100), 65800);
});

test('aufrundender Modus rechnet volle m2 ab, nicht die krumme Flaeche', () => {
  const b = preisBeispiel(365, 500, '3290', false);
  assert.equal(b.area, 18.25);
  assert.equal(b.billedArea, 19);
  assert.equal(Math.round(b.total * 100), 62510);
});

test('cm-genauer Modus: Preis je 0,01 m2 in Cent, Menge in Hundertsteln', () => {
  const b = preisBeispiel(365, 500, '89', true);
  assert.equal(b.billedArea, 18.25);
  assert.equal(Math.round(b.total * 100), 162425);
});

test('calculate() verwendet weiterhin dieselben Ausdruecke', () => {
  for (const ausdruck of [
    'var area = (w * len) / 10000;',
    'var rate = cmExact ? parseFloat(target.price) : parseFloat(target.price) / 100;',
    'var qty = cmExact ? roundedHundredthsQty(w, len) : Math.ceil(area);',
    'var billedArea = cmExact ? qty / 100 : qty;',
    'var total = billedArea * rate;',
  ]) {
    assert.ok(source.includes(ausdruck), `calculate() hat sich geaendert, preisBeispiel() nachziehen: ${ausdruck}`);
  }
});
