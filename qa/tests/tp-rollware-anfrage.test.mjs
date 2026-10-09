import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../blocks/tp-rollware-rechner.liquid', import.meta.url), 'utf8');
const start = source.indexOf('  var raumAnfrage =');
const end = source.indexOf('\n  var widths;', start);
function angebot(overrides = {}) {
  const original = { id: 123, price: 4195, compare_at_price: 6399, available: true };
  const c = vm.createContext({ data: { raummass_anfrage: true }, wIdx: -1, variants: [original], cmExact: false, fallbackWidthCm: 400, ART: { wunschOk: () => false }, ...overrides });
  vm.runInContext(source.slice(start, end), c);
  return { c, original };
}
test('Anfragepreis ohne bestellbare Varianten-ID; Originalbestand bleibt beim Originalartikel', () => {
  const { c, original } = angebot();
  assert.equal(c.raumAngebot.price, 5700);
  assert.equal(c.raumAngebot.id, null);
  assert.equal(c.raumAngebot.quote_only, true);
  assert.equal(c.raumAngebot.compare_at_price, 0);
  assert.equal(original.id, 123);
  assert.equal(original.price, 4195);
  assert.equal(c.raumMoeglich(c.raumAngebot), true);
  assert.equal(c.raumMoeglich({ ...c.raumAngebot }), false);
});
test('Kein Anfrageangebot fuer andere Produkte, mehrere Varianten oder andere Mengeneinheit', () => {
  for (const opt of [{ data: {} }, { wIdx: 1 }, { variants: [{}, {}] }, { cmExact: true }, { fallbackWidthCm: 0 }]) {
    assert.equal(angebot(opt).c.raumAngebot, null);
  }
  const { c } = angebot({ variants: [{ id: 123, price: 4195, available: false }] });
  assert.equal(c.raumMoeglich(c.raumAngebot), false);
});
test('Echter Klickzweig verlaesst Anfrage vor Warenkorbaufbau und nimmt Produkt sowie Masse mit', () => {
  const start = source.indexOf('  cta.addEventListener(\'click\', function () {');
  const end = source.indexOf('\n    var area = (w * len) / 10000;', start);
  let callback;
  let url;
  const c = vm.createContext({ URL, cta: { disabled: false, addEventListener: (_event, fn) => { callback = fn; } }, inFlight: false,
    fehlendesFeld: () => null, selectedWidth: () => 200, getEffectiveLengthCm: () => 300, artMode: () => 'raum',
    target: { id: null, quote_only: true, available: true, price: 5700 }, raumMoeglich: () => true,
    clearInvalid: () => {}, data: { product_title: 'Yasmin Anthrazit', product_handle: 'yasmin-anthrazit' },
    rateOf: v => v.price / 100, fmt: n => n.toFixed(2).replace('.', ','),
    window: { location: { origin: 'https://www.teppich-paradies.net', assign: value => { url = new URL(value); } } }
  });
  vm.runInContext(source.slice(start, end) + '\n throw new Error("Warenkorb darf nicht erreicht werden");\n });', c);
  callback();
  assert.equal(url.pathname, '/pages/kontakt');
  assert.equal(url.searchParams.get('thema'), 'angebot');
  assert.equal(url.searchParams.get('produkt'), 'Yasmin Anthrazit');
  assert.equal(url.searchParams.get('breite'), '200 cm');
  assert.equal(url.searchParams.get('laenge_cm'), '300');
  assert.match(url.searchParams.get('variante'), /57,00/);
});
