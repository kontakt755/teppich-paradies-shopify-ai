import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

createRequire(import.meta.url)('../../assets/tp-raummass.js');
const RM = globalThis.TPRaummass;
const source = readFileSync(new URL('../../blocks/tp-rollware-rechner.liquid', import.meta.url), 'utf8');
const start = source.indexOf('  root.tpRwcPreis = function (art, wCm, lenCm) {');
const end = source.indexOf('\n  };', start) + 5;
assert.ok(start >= 0 && end > start);

function preis({ wIdx = -1, fallbackWidthCm = 400, cmExact = false } = {}) {
  const context = vm.createContext({ root: {}, wIdx, fallbackWidthCm, cmExact,
    raumVariant: () => ({ rate: 75 }),
    variantFor: (_options, width) => ({ rate: width === 500 ? 60 : 41.95 }),
    baseOptions: () => [], byWidth: w => w, rateOf: v => v?.rate || 0,
    ART: { wunschOk: () => true },
    roundedHundredthsQty: (w, l) => Math.round(w * l / 100)
  });
  vm.runInContext(source.slice(start, end), context);
  return context.root.tpRwcPreis;
}

test('Yasmin: 250 x 450 cm hat eine passende Bahn, mit und ohne Zugabe', () => {
  for (const [breite, laenge] of [[250, 450], [450, 250]]) {
    const v = RM.rolleVorschlag({ breite, laenge, rollen: [400], raum: false, preis: preis() });
    assert.equal(v.naht, false);
    assert.equal(v.empfohlen.breite, 400);
    assert.equal(v.empfohlen.laenge, 460);
    assert.equal(v.empfohlen.preis, 19 * 41.95);
    assert.equal(v.genau.laenge, 450);
    assert.equal(v.genau.preis, 18 * 41.95);
  }
});

test('feste Breite ohne Breitenoption akzeptiert keine fremde Breite oder Wunschmass', () => {
  const p = preis();
  assert.equal(p('meter', 400, 200), 335.6);
  assert.equal(p('meter', 500, 200), 0);
  assert.equal(p('raum', 250, 450), 0);
  assert.equal(p('meter', 400, 0), 0);
});

test('beide Seiten ueber Rollenbreite bleiben als Nahtfall erkennbar', () => {
  const v = RM.rolleVorschlag({ breite: 450, laenge: 550, rollen: [400], raum: false, preis: preis() });
  assert.equal(v.naht, true);
});

test('Artikel mit Breitenoption und cm-genauem Raummass behalten ihre Preise', () => {
  const p = preis({ wIdx: 1, cmExact: true });
  assert.equal(p('meter', 500, 200), 600);
  assert.equal(p('raum', 200, 250), 375);
});
