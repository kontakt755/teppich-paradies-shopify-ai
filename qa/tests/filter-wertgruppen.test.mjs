import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Liquid } from 'liquidjs';
import vm from 'node:vm';

// Audit 13.10.2026: Rohwerte neben Bereichsgruppen und doppelte Schreibweisen
// im Filter (snippets/tp-filter-wertgruppen.liquid).
const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerTag('doc', {
  parse(token, tokens) {
    while (tokens.length && tokens.shift().name !== 'enddoc') {}
  },
  render() {
    return '';
  },
});

const G = 'gid://shopify/FilterSettingGroup/';
const wert = (label, value = label, count = 1, active = false) => ({ label, value, count, active });

async function tokens(filter, extra = {}) {
  const out = await engine.parseAndRender(read('snippets/tp-filter-wertgruppen.liquid'), { filter, ...extra });
  return out.trim();
}

test('Florhoehe: Rohwerte landen im passenden Bereich (Grenzen inklusiv/exklusiv)', async () => {
  const filter = {
    param_name: 'filter.p.m.custom.florhoehe_mm',
    values: [
      wert('Bis 5 mm', G + '1', 70),
      wert('Über 5 bis unter 10 mm', G + '2', 55),
      wert('Ab 10 mm', G + '3', 26),
      wert('4.5'),
      wert('5.0'),
      wert('5.1'),
      wert('9.6'),
      wert('10.0'),
      wert('17.0'),
    ],
  };
  const t = (await tokens(filter)).split(';').filter(Boolean);
  assert.equal(t.length, 9);
  assert.equal(t[0], 'R01~4.5|5.0');
  assert.equal(t[1], 'R01~5.1|9.6');
  assert.equal(t[2], 'R01~10.0|17.0');
  assert.deepEqual(t.slice(3), ['X0', 'X0', 'X1', 'X1', 'X2', 'X2']);
});

test('Nutzschicht: 0,4/0,40 und 0,7/0,70 werden ein Eintrag, laengere Schreibweise sichtbar', async () => {
  const filter = {
    param_name: 'filter.p.m.custom.nutzschicht',
    values: [
      wert('2 mm'),
      wert('0,30 mm', G + '9'),
      wert('0,4 mm', '0,4 mm', 174),
      wert('0,40 mm', '0,40 mm', 108),
      wert('0,55 mm'),
      wert('0,7 mm', '0,7 mm', 8, true),
      wert('0,70 mm'),
      wert('ca. 3,0 mm'),
    ],
  };
  const t = (await tokens(filter)).split(';').filter(Boolean);
  assert.deepEqual(t, ['N', 'N', 'X3', 'R01~0,4 mm', 'N', 'X6', 'R11~0,7 mm', 'N']);
  assert.equal(await tokens(filter, { nur_anzahl: true }), '1');
});

test('Gesamtstaerke Vinyl: Rohwerte in Bereiche, ohne passende Gruppe bleiben sie sichtbar', async () => {
  const filter = {
    param_name: 'filter.p.m.custom.gesamtstarke',
    values: [
      wert('2 mm'),
      wert('9 mm'),
      wert('2,2 mm'),
      wert('Bis 3 mm', G + 'a', 0),
      wert('Über 6 bis 9 mm', G + 'c'),
      wert('Über 12 mm', G + 'd'),
      wert('13 mm'),
    ],
  };
  const t = (await tokens(filter)).split(';').filter(Boolean);
  // "Bis 3 mm" hat selbst keine Treffer, ueber die Rohwerte aber doch (e = 1)
  assert.deepEqual(t, ['X3', 'X4', 'X3', 'R01~2 mm|2,2 mm', 'R01~9 mm', 'R01~13 mm', 'X5']);

  const kautschuk = { param_name: 'filter.p.m.custom.gesamtstarke', values: [wert('2 mm'), wert('3 mm'), wert('Über 3 bis 6 mm', G + 'b')] };
  assert.equal(await tokens(kautschuk), 'N;N;N;');
});

test('Andere Filter bleiben unberuehrt', async () => {
  const filter = { param_name: 'filter.v.m.custom.rollenbreite', values: [wert('4.0'), wert('4.00')] };
  assert.equal(await tokens(filter), '');
});

test('Theme nutzt die Wertgruppen in Liste, Chips, Zaehlung und Florhoehen-Navigation', () => {
  assert.match(read('snippets/list-filter.liquid'), /render 'tp-filter-wertgruppen'/);
  assert.match(read('snippets/list-filter.liquid'), /data-tp-mitwerte=/);
  assert.match(read('snippets/filter-remove-buttons.liquid'), /data-tp-mitwerte-name=/);
  assert.match(read('snippets/tp-flor-navigation.liquid'), /data-tp-flor-mitwerte=/);
  assert.equal((read('blocks/filters.liquid').match(/nur_anzahl: true/g) ?? []).length, 3);
  const facets = read('assets/facets.js');
  assert.match(facets, /li\[data-tp-mitwerte\]/);
  assert.match(facets, /tpMitwerteName/);
});

test('Preisfilter ist auf Paketware-Kollektionen ausgeblendet', () => {
  const block = read('blocks/filters.liquid');
  const liste = block.match(/assign tp_preisfilter_aus = '([^']+)'/)[1].split(',');
  for (const handle of ['laminat', 'parkett', 'korkboden', 'kautschukboden', 'vinylboden-1', 'teppichfliesen']) {
    assert.ok(liste.includes(handle), handle);
  }
  assert.ok(!liste.includes('teppichboden'));
  assert.equal((block.match(/tp_preisfilter_aus contains collection\.handle/g) ?? []).length, 1);
  // Beide Preisfilter (Leiste und Filterfenster) haengen an derselben Entscheidung.
  assert.equal((block.match(/request\.page_type == 'search' or tp_preisfilter_versteckt/g) ?? []).length, 2);
});

test('Preisfilter ist auf allen Teppich- und Laeufer-nach-Mass-Kollektionen ausgeblendet', async () => {
  // Variantenpreis je 0,01 m2 bzw. je cm: der Shopify-Preisfilter rechnet dort in Cent-Betraegen.
  const block = read('blocks/filters.liquid');
  const kopf = block.slice(block.indexOf('assign tp_preisfilter_aus'), block.indexOf('assign tp_teppich_unterkategorie'));
  const engine = new Liquid();
  const versteckt = async (handle, title) =>
    (await engine.parseAndRender(`{%- liquid\n${kopf}\necho tp_preisfilter_versteckt\n-%}`, { collection: { handle, title } })).trim();
  const mass = [
    ['sisal-kokos-teppiche-nach-mass', 'Sisal- & Kokosteppiche nach Maß'],
    ['laeufer-nach-mass', 'Läufer nach Maß'],
    ['designteppiche-nach-mass', 'Designteppiche nach Maß'],
    ['auslauf-teppich-nach-mass', 'Auslauf Teppich nach Maß – nur noch kurze Zeit'],
    ['kokoslaeufer', 'Kokosläufer nach Maß'],
    ['sisallaeufer', 'Sisalläufer nach Maß'],
    ['teppich-nach-mass', 'Teppich nach Maß'],
  ];
  for (const [handle, title] of mass) assert.equal(await versteckt(handle, title), 'true', handle);
  for (const [handle, title] of [['teppichboden', 'Teppichboden'], ['teppiche-standardgroessen', 'Teppiche in Standardgrößen'], ['teppiche', 'Teppiche']]) {
    assert.equal(await versteckt(handle, title), 'false', handle);
  }
  assert.equal(await versteckt('laminat', 'Laminat'), 'true');
});


test('Groessen: normale und geschuetzte Leerzeichen teilen keine Produkte mehr auf', async () => {
  const filter = { param_name: 'filter.v.option.größe', values: [
    wert('120 × 170 cm', '120 × 170 cm', 279),
    wert('120\u00a0×\u00a0170 cm', '120\u00a0×\u00a0170 cm', 12, true),
    wert('120 × 180 cm'), wert('140 × 200 cm'),
    wert('140\u202f×\u202f200 cm', '140\u202f×\u202f200 cm', 0),
    wert('170 × 120 cm'), wert('120 × 170 cm oval'), wert('Ø 120 cm'),
  ] };
  assert.deepEqual((await tokens(filter)).split(';').filter(Boolean), [
    'R11~120\u00a0×\u00a0170 cm', 'X0', 'N', 'R01~140\u202f×\u202f200 cm', 'X3', 'N', 'N', 'N',
  ]);
  assert.equal(await tokens(filter, { nur_anzahl: true }), '1');
  filter.values[0].active = true;
  assert.equal(await tokens(filter, { nur_anzahl: true }), '1');
});

test('Groessen: auch die zweite Schreibweise bleibt waehlbar, wenn die erste keine Treffer hat', async () => {
  const filter = { param_name: 'filter.v.option.größe', values: [
    wert('120 × 170 cm', '120 × 170 cm', 0), wert('120\u00a0×\u00a0170 cm', '120\u00a0×\u00a0170 cm', 12),
  ] };
  assert.equal(await tokens(filter), 'R01~120\u00a0×\u00a0170 cm;X0;');
});

test('Groessen-Wertgruppen erweitern die bestehende Filter-URL auf Desktop und Mobile, nach Redraw und beim Abwaehlen', async () => {
  const name = 'filter.v.option.größe';
  const first = '120 × 170 cm';
  const second = '120\u00a0×\u00a0170 cm';
  const source = read('assets/facets.js');
  const start = source.indexOf('  createURLParameters(');
  const end = source.indexOf('\n  get sectionId()', start);
  class Input { constructor() { this.name = name; this.value = first; } }
  for (const width of [390, 1440]) {
    const context = vm.createContext({ URL, URLSearchParams, HTMLInputElement: Input,
      window: { innerWidth: width, location: { href: 'https://shop.example/collections/teppiche' } }, SEARCH_QUERY: 'q' });
    vm.runInContext(`globalThis.FilterForm = class { ${source.slice(start, end)} };`, context);
    const form = new context.FilterForm();
    for (let redraw = 0; redraw < 2; redraw++) {
      const input = new Input();
      form.refs = { facetsForm: { querySelectorAll: () => [{ querySelector: () => input, getAttribute: () => second }] } };
      const data = new URLSearchParams([[name, first], ['sort_by', 'most-relevant'], ['sort_by', 'price-ascending']]);
      const url = form.createURLParameters(data);
      assert.deepEqual(url.getAll(name), [first, second]);
      assert.equal(url.get('sort_by'), width === 390 ? 'most-relevant' : 'price-ascending');
      const without = form.createURLParameters(new URLSearchParams());
      assert.deepEqual(without.getAll(name), []);
    }
  }
});
