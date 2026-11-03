// Restrolle als ein Artikel: Raummass im Rechner, Abrechnung ueber das versteckte
// Raummass-Produkt, Bestand ueber das Zuschnitt-Bundle (Inhaber 2026-11-03).
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../blocks/tp-rollware-rechner.liquid', import.meta.url), 'utf8');
const start = source.indexOf('  var raumAnfrage =');
const end = source.indexOf('\n  var widths;', start);
const zuschnitt = [25, 50, 100, 300, 1000].map((cm, i) => ({ id: 900 + i, cm, price: 47, available: cm <= 300 }));

function angebot({ rest = {}, ...overrides } = {}) {
  const data = { rest_raum: { id: 77, price: 47, mindest_cent: 9900, max_laenge_cm: 1000, produkt: 'Antigua Raummaß', zuschnitt: [...zuschnitt, null], ...rest } };
  const c = vm.createContext({ data, wIdx: -1, variants: [{ id: 123, price: 3495, compare_at_price: 0, available: true }], cmExact: false, fallbackWidthCm: 400, ART: { wunschOk: () => false }, ...overrides });
  vm.runInContext(source.slice(start, end), c);
  return c;
}

test('Karte rechnet 47 EUR/m2 ueber das Raummass-Produkt, nie ueber die Rollen-Variante', () => {
  const c = angebot();
  assert.equal(c.raumAngebot.id, 77);
  assert.equal(c.raumAngebot.rest_raum, true);
  assert.equal(c.raumAngebot.price, 4700);
  assert.equal(c.raumAngebot.quote_only, undefined);
  assert.equal(c.raumMoeglich(c.raumAngebot), true);
  assert.equal(c.raumFest, true);
});

test('Menge in 0,01 m2, kleine Stuecke auf den Mindestpreis angehoben', () => {
  const c = angebot();
  assert.equal(c.restRaumMenge(200, 300), 600);
  assert.equal(c.restRaumMenge(50, 100), 211, '99 EUR / 0,47 EUR aufgerundet');
});

test('Kleinste kaufbare Zuschnittlaenge deckt die Laenge, sonst kein Angebot', () => {
  const c = angebot();
  assert.equal(c.restZuschnittFuer(260).cm, 300);
  assert.equal(c.restZuschnittFuer(300).cm, 300);
  assert.equal(c.restZuschnittFuer(301), null, 'die 1000-cm-Variante ist nicht verfuegbar');
});

test('Angebotsgrenze service.max_laenge_cm gilt auch bei laengerem Bundle', () => {
  const lang = [{ id: 1, cm: 1000, price: 47, available: true }];
  const c = angebot({ rest: { max_laenge_cm: 300, zuschnitt: lang } });
  assert.equal(c.restZuschnittFuer(300).cm, 1000);
  assert.equal(c.restZuschnittFuer(301), null);
});

test('Raumhelfer bekommt keinen Preis fuer eine Laenge, die der Rechner sperrt', () => {
  const beginn = source.indexOf('  root.tpRwcPreis = function (art, wCm, lenCm) {');
  const ende = source.indexOf('\n  };', beginn) + 5;
  const c = angebot({ rest: { max_laenge_cm: 300, zuschnitt: [{ id: 1, cm: 1000, price: 47, available: true }] }, root: {}, baseOptions: () => [], byWidth: w => w, variantFor: () => null, roundedHundredthsQty: (w, l) => Math.round(w * l / 100) });
  vm.runInContext('function raumVariant() { return raumAngebot; } function rateOf(v) { return v.price / 100; }' + source.slice(beginn, ende), c);
  assert.equal(c.root.tpRwcPreis('raum', 210, 300), 296.1);
  assert.equal(c.root.tpRwcPreis('raum', 210, 510), 0);
});

test('Fail closed: abweichender Zuschnittpreis, kein Bundle, andere Rollenart', () => {
  for (const opt of [
    { rest: { zuschnitt: [{ id: 1, cm: 100, price: 48, available: true }] } },
    { rest: { zuschnitt: [null] } },
    { rest: { price: 0 } },
    { rest: { max_laenge_cm: 0 } },
    { wIdx: 1 },
    { cmExact: true },
    { fallbackWidthCm: 0 },
    { variants: [{}, {}] },
  ]) {
    const c = angebot(opt);
    assert.equal(c.raumAngebot, null);
    assert.equal(c.raumFest, false);
  }
});

test('Anfrageangebot (Yasmin) hat Vorrang und bleibt ohne Warenkorb-ID', () => {
  const c = angebot({ data: { raummass_anfrage: true } });
  assert.equal(c.raumAngebot.quote_only, true);
  assert.equal(c.raumAngebot.id, null);
});

test('Warenkorbzweig traegt die Zeilen, die Warenkorbsperre und Bestellmail erwarten', () => {
  for (const teil of ["'_Einheit im Zuschnitt': '1'", "'_Rollenzuschnitt': String(restZs.cm)", "'Rollenzuschnitt': restZs.cm + ' cm'", "qty = restStueck - 1", "'Einfassung': 'ohne Einfassung'"]) {
    assert.ok(source.includes(teil), teil);
  }
});
