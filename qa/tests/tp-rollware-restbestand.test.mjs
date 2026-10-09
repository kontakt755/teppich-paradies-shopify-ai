// Echte Liquid-Obergrenze: Produktlimit und verfuegbarer voller Rollenbestand.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';
const source = readFileSync(new URL('../../blocks/tp-rollware-rechner.liquid', import.meta.url), 'utf8');
const start = source.indexOf('{%- liquid\n  assign tp_rc_max_laenge_cm');
const end = source.indexOf('-%}', start) + 3;
assert.ok(start >= 0 && end > start);
const engine = new Liquid();
engine.registerFilter('divided_by', (a, b) => Number.isInteger(b) ? Math.floor(a / b) : a / b);
async function grenze({ limit = 2000, stock = 80, tracked = true, policy = 'deny', width = 400, exact = false, variants = 1 } = {}) {
  const product = {
    metafields: { custom: { max_roll_laenge_cm: { value: limit } } },
    variants: Array.from({ length: variants }, () => ({ inventory_management: tracked ? 'shopify' : null, inventory_policy: policy, inventory_quantity: stock }))
  };
  const html = await engine.parseAndRender(source.slice(start, end) + '{{ tp_rc_max_laenge_cm }}|{{ tp_rc_bestand_gefuehrt }}', {
    product, tp_rc_cm_exact: exact, tp_rc_fallback_width_cm: width
  });
  return html.trim();
}
test('80 m2 sind 20 laufende Meter; Verkauf von 8 m2 laesst 18 m uebrig', async () => {
  assert.equal(await grenze(), '2000|true');
  assert.equal(await grenze({ stock: 72 }), '1800|true');
});
test('Kein, negativer und knapper Bestand setzen eine echte Obergrenze', async () => {
  assert.equal(await grenze({ stock: 0 }), '0|true');
  assert.equal(await grenze({ stock: -1 }), '0|true');
  assert.equal(await grenze({ stock: 7 }), '175|true');
  assert.equal(await grenze({ stock: 1 }), '25|true');
});
test('Groesserer Bestand erweitert das erlaubte Zuschnittmass nicht', async () => {
  assert.equal(await grenze({ stock: 100 }), '2000|true');
  assert.equal(await grenze({ limit: 5000, stock: 72 }), '1800|true');
});
test('Andere Mengeneinheiten und mehrere Varianten werden nicht als m2 interpretiert', async () => {
  for (const opt of [{ tracked: false }, { policy: 'continue' }, { exact: true }, { width: 0 }, { variants: 2 }]) {
    assert.equal(await grenze({ stock: 0, ...opt }), '2000|false');
  }
});
test('Ohne ausdrueckliches Produktlimit bleibt die bisherige Rollenware unveraendert', async () => {
  assert.equal(await grenze({ limit: null, stock: 0 }), '5000|false');
});
