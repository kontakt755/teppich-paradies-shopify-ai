import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { offeneSuche, umschlagKennung } from '../lib/muster-packen.mjs';

const quelle = fs.readFileSync(new URL('../bausteine/palette.mjs', import.meta.url), 'utf8')
  .replace(/^import.*;\n/gm, '').replace(/^export\s/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
function palette({ packliste = null, produkte = [], kundenTreffer = [{ key: 'test', name: 'Synthetischer Kunde' }] } = {}) {
  const fahrten = [], timer = [];
  const api = vm.runInNewContext(quelle + '\n({ paletteItems, paletteFernSuche, paletteFern })', {
    state: { capabilities: { mode: 'local' }, tasks: [] }, AREAS: [], SAVED_VIEWS: [], URLSearchParams,
    offeneSuche, umschlagKennung, plural: (n, a, b) => `${n} ${n === 1 ? a : b}`, ensureMusterPacken: async () => packliste,
    darfAnsicht: view => !['arbeit', 'team'].includes(view), navigate: (...a) => fahrten.push(a),
    setTimeout: fn => { timer.push(fn); return timer.length; }, clearTimeout() {},
    fetchEinkauf: async pfad => pfad.startsWith('/api/kunden')
      ? { treffer: kundenTreffer }
      : { treffer: { items: produkte } },
  });
  return { ...api, fahrten, timer };
}

test('Packstation, Bestellungen und Muster bestellen sind auch fuer Mitarbeiter direkt auffindbar', () => {
  for (const [q, view, params] of [
    ['Packstation', 'kunden', { tab: 'muster' }],
    ['Lexikon', 'lexikon', {}],
    ['Bestellungen', 'kunden', { tab: 'bestellungen', bart: 'ware', bsort: 'wichtigkeit' }],
    ['Muster bestellen', 'einkauf', { tab: 'lieferant', art: 'muster', af: 'offen' }],
    ['Musterlager', 'einkauf', { tab: 'musterlager' }],
  ]) {
    const u = palette(), item = u.paletteItems(q)[0];
    assert.equal(item.label, q, 'genau benannter Arbeitsweg steht vor der allgemeinen Aufgabensuche');
    item.run();
    assert.deepEqual(JSON.parse(JSON.stringify(u.fahrten[0])), [view, params]);
  }
});

test('Aufgabensuche uebernimmt den eingegebenen Text in die vorhandene Teamliste', () => {
  const u = palette();
  const q = 'Synthetische Rückfrage';
  const item = u.paletteItems(q).find(i => i.kind === 'Aufgaben');
  assert.ok(item);
  item.run();
  assert.deepEqual(JSON.parse(JSON.stringify(u.fahrten[0])), ['organisation', { ob: 'team-aufgaben', oa: 'alle', og: 'alles', oq: q }]);
});

test('waehrend einer neuen Suche erscheinen keine Kunden zum alten Suchwort', async () => {
  const u = palette();
  u.paletteFernSuche('Testname', () => {});
  u.timer.shift()();
  await tick();
  assert.equal(u.paletteFern.kunden.length, 1);
  u.paletteFernSuche('Anderer Name', () => {});
  assert.equal(u.paletteFern.kunden.length, 0);
  assert.equal(u.paletteItems('Anderer Name').some(i => i.kind === 'Kunde'), false);
});

test('verzoegerte Treffer zur alten Eingabe werden nicht in die neue Suche uebernommen', async () => {
  const u = palette();
  u.paletteFernSuche('Alt', () => {});
  u.timer.shift()();
  u.paletteFernSuche('Neu', () => {});
  await tick();
  assert.equal(u.paletteFern.kunden.length, 0);
  assert.equal(u.paletteFern.q, 'Neu');
});

// Erfundene Daten: auf dem Muster steht der Lieferantenname, im Shop heisst das Produkt anders.
const muster = (id, shop, farbe, sku, produktname, farbnummer) => ({ lineItemId: id, bestellt: { titel: `Muster ${shop}`, farbe }, etikett: { serie: shop, farbe, sku },
  vorher: { produktname, farbnummer, kollektion: 'Linie 029', hersteller: null, artikelnummer: sku } });
const umschlag = (n, bereich, m) => ({ packSchluessel: `order${n}`, name: `Testkunde ${n}`, bereich, bestellungen: [{ orderId: `order${n}`, orderName: `#T${n}` }], muster: m });
const packliste = {
  verfuegbar: true,
  kunden: [
    umschlag(1, 'warten', [muster('l1', 'Shopname Eins', 'Hellgrau (073)', 'SKU_1', 'Teppichboden ORION 400 cm 029 Linie', '073')]),
    umschlag(2, 'warten', [muster('l2', 'Shopname Zwei', 'Grau (8H73)', 'SKU_2', 'Andere Ware 8H73', '8H73')]),
    umschlag(3, 'gepackt', [muster('l3', 'Shopname Drei', 'Blau (051)', 'SKU_3', 'Teppichboden VEGA 400 cm 029 Linie', '051')]),
  ],
  ausserhalb: [],
};
async function suche(q, optionen = {}) {
  const u = palette({ packliste, kundenTreffer: [], ...optionen });
  u.paletteFernSuche(q, () => {});
  u.timer.shift()();
  await tick();
  return { ...u, zeilen: u.paletteItems(q) };
}

test('Muster in der Hand: Lieferantenname und Farbnummer fuehren oben zur selben Bestellung wie in der Packstation', async () => {
  const u = await suche('Linie 029 Orion 73', { produkte: [{ titel: 'Shopname Eins', handle: 'eins' }] });
  const [erste] = u.zeilen;
  assert.equal(erste.kind, 'Muster', 'steht vor dem Produkt');
  assert.equal(erste.label, '#T1 Testkunde 1');
  assert.match(erste.sub, /Auf dem Muster: Teppichboden ORION/);
  assert.deepEqual(offeneSuche(packliste.kunden, 'Linie 029 Orion 73').treffer.map(t => t.packSchluessel), ['order1'], 'gleiche Funktion, gleicher Treffer');
  erste.run();
  assert.deepEqual(JSON.parse(JSON.stringify(u.fahrten[0])), ['kunden', { tab: 'muster', mpq: 'Linie 029 Orion 73' }]);
});

test('Nur eine fertige Bestellung passt genau: oben steht sie, der Klick zeigt sie in der Packstation', async () => {
  const u = await suche('Linie 029 Vega 51');
  const z = u.zeilen.find(i => i.kind === 'Muster');
  assert.equal(z.label, '1 fertige Bestellung zu „Linie 029 Vega 51“');
  z.run();
  assert.deepEqual(JSON.parse(JSON.stringify(u.fahrten[0])), ['kunden', { tab: 'muster', mpq: 'Linie 029 Vega 51', mpfertig: 'Linie 029 Vega 51' }]);
});

test('Teiltreffer verdraengen keinen genannten Arbeitsweg, und Enter beim Kundennamen bleibt beim Kunden', async () => {
  const breit = await suche('Muster bestellen');
  assert.equal(breit.zeilen[0].label, 'Muster bestellen');
  assert.match(breit.zeilen.find(i => i.kind === 'Muster').sub, /teilweise, nicht gefunden: bestellen/);
  const name = await suche('Testkunde 1', { kundenTreffer: [{ key: 'k1', name: 'Testkunde 1' }] });
  assert.deepEqual(Array.from(name.zeilen.slice(0, 2), i => i.kind), ['Kunde', 'Muster']);
});

test('Viele Umschlaege ergeben eine Zeile; ohne Treffer und ohne Packliste keine', async () => {
  const viele = { verfuegbar: true, ausserhalb: [], kunden: [1, 2, 3, 4].map(n => umschlag(n, 'warten', [muster(`l${n}`, 'Gleich', 'Grau', `S${n}`, 'Gleiche Ware', `${n}`)])) };
  const u = await suche('Gleiche Ware', { packliste: viele });
  assert.deepEqual(Array.from(u.zeilen.filter(i => i.kind === 'Muster'), i => i.sub), ['4 Bestellungen passen']);
  assert.equal((await suche('gibtsnicht')).zeilen.some(i => i.kind === 'Muster'), false);
  assert.equal((await suche('Orion', { packliste: { verfuegbar: false } })).zeilen.some(i => i.kind === 'Muster'), false);
});

test('Antwort zu alter Eingabe: Muster gehoeren nicht in die neue Suche', async () => {
  const u = await suche('Orion');
  u.paletteFernSuche('Vega', () => {});
  assert.equal(u.paletteItems('Vega').some(i => i.kind === 'Muster'), false);
});
