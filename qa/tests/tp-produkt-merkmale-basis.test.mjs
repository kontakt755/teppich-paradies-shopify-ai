import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

// Teppich nach Mass: Der Teppich traegt selbst keine technischen Merkmale, sie stehen am
// Teppichboden, aus dem zugeschnitten wird (service.einfass_basis). Das Snippet
// tp-produkt-merkmale-json bekommt ihn als basis herein; je Merkmal gewinnt der Wert am
// Produkt, nur sonst gilt der des Teppichbodens. Dieselbe Regel steht in
// blocks/tp-produktinfo-tabelle.liquid (sichtbare Tabelle).
const root = path.resolve(import.meta.dirname, '../..');
const lies = (d) => fs.readFileSync(path.join(root, d), 'utf8');
const ohneDoc = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/, '');
const quelle = ohneDoc(lies('snippets/tp-produkt-merkmale-json.liquid'));
const engine = new Liquid();

const text = (v) => ({ type: 'single_line_text_field', value: v });
const zahl = (v) => ({ type: 'number_decimal', value: v });
const liste = (feld, werte) => ({
  type: 'list.metaobject_reference',
  value: werte.map((w) => ({ [feld]: w })),
});

async function merkmale(custom, basisCustom) {
  const html = await engine.parseAndRender(quelle, {
    produkt: { metafields: { custom } },
    basis: basisCustom ? { metafields: { custom: basisCustom } } : undefined,
  });
  const roh = html.trim();
  return roh === '' ? [] : JSON.parse(`[${roh}]`);
}

test('fehlende Merkmale kommen vom Teppichboden (basis)', async () => {
  const m = await merkmale({}, {
    fasermaterial: liste('fasermaterial', ['Polyester']),
    florhohe: text('3,5 mm'),
    ruckenausstattung: text('Vliesrücken'),
    nutzungsklassen: liste('nutzungsklasse', ['Klasse 22 (Wohnen, normal)']),
  });
  const alsMap = Object.fromEntries(m.map((p) => [p.name, p.value]));
  assert.equal(alsMap.Fasermaterial, 'Polyester');
  assert.equal(alsMap['Florhöhe'], '3,5 mm');
  assert.equal(alsMap['Rückenausstattung'], 'Vliesrücken');
  assert.equal(alsMap.Nutzungsklassen, 'Klasse 22 (Wohnen, normal)');
});

test('Wert am Produkt geht dem Teppichboden vor', async () => {
  const m = await merkmale({ florhohe: text('10 mm') }, { florhohe: text('3,5 mm'), material: text('Polyester') });
  const alsMap = Object.fromEntries(m.map((p) => [p.name, p.value]));
  assert.equal(alsMap['Florhöhe'], '10 mm');
  assert.equal(alsMap.Material, 'Polyester');
});

test('was auch der Teppichboden nicht traegt, fehlt - nichts wird abgeleitet', async () => {
  const m = await merkmale({}, { florhohe: text('3,5 mm') });
  assert.deepEqual(m.map((p) => p.name), ['Florhöhe']);
});

test('Mengenangaben kommen nie vom Teppichboden', async () => {
  const m = await merkmale({}, { rollenbreite: zahl(4), qm_pro_paket: zahl(1.76), florhohe: text('3,5 mm') });
  assert.deepEqual(m.map((p) => p.name), ['Florhöhe']);
});

test('ohne basis bleibt die Ausgabe wie bisher', async () => {
  const eigene = { material: text('Wolle'), florhohe: text('6 mm') };
  assert.deepEqual(await merkmale(eigene, null), await merkmale(eigene, undefined));
  assert.equal((await merkmale(eigene, null)).length, 2);
});

test('das JSON-LD reicht den Teppichboden als basis herein, das Snippet liest nur custom', () => {
  const sd = lies('snippets/tp-product-structured-data.liquid');
  assert.match(sd, /assign tp_sd_basis = product_resource\.metafields\.service\.einfass_basis\.value/);
  assert.match(sd, /render 'tp-produkt-merkmale-json', produkt: product_resource, basis: tp_sd_basis/);
  const namespaces = [...lies('snippets/tp-produkt-merkmale-json.liquid').matchAll(/metafields\.([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(namespaces)], ['custom']);
});

test('die sichtbare Tabelle nutzt dieselbe Regel: Produktwert zuerst, sonst Teppichboden', () => {
  const tabelle = lies('blocks/tp-produktinfo-tabelle.liquid');
  assert.match(tabelle, /assign tp_pit_basis = product\.metafields\.service\.einfass_basis\.value/);
  assert.match(tabelle, /if metafield\.value == blank and tp_pit_basis != blank/);
  assert.match(tabelle, /assign metafield = tp_pit_basis\.metafields\.custom\[metafield_key\]/);
});
