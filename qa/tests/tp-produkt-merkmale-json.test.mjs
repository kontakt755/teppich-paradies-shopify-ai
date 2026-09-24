import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

// snippets/tp-produkt-merkmale-json.liquid liefert den Inhalt eines
// JSON-Arrays. Hier wird das echte Snippet gerendert und das Ergebnis geparst -
// ein Komma zu viel macht das gesamte Product-JSON-LD ungueltig.
const root = path.resolve(import.meta.dirname, '../..');
const lies = (d) => fs.readFileSync(path.join(root, d), 'utf8');
const quelle = lies('snippets/tp-produkt-merkmale-json.liquid')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/, '');
const engine = new Liquid();

const text = (v) => ({ type: 'single_line_text_field', value: v });
const zahl = (v) => ({ type: 'number_decimal', value: v });
const objekt = (feld, v) => ({ type: 'metaobject_reference', value: { [feld]: v } });
const liste = (feld, werte) => ({
  type: 'list.metaobject_reference',
  value: werte.map((w) => ({ [feld]: w })),
});

async function merkmale(custom) {
  const html = await engine.parseAndRender(quelle, { produkt: { metafields: { custom } } });
  const roh = html.trim();
  return roh === '' ? [] : JSON.parse(`[${roh}]`);
}

test('leeres Produkt liefert nichts', async () => {
  assert.deepEqual(await merkmale({}), []);
});

test('Textfeld, Metaobjekt und Metaobjekt-Liste werden gleich behandelt', async () => {
  const m = await merkmale({
    material: text('Polyamid'),
    fusbodenheizung: objekt('fusbodenheizung', 'Geeignet'),
    nutzungsklassen: liste('nutzungsklasse', ['23', '33']),
  });
  const alsMap = Object.fromEntries(m.map((p) => [p.name, p.value]));
  assert.equal(alsMap.Material, 'Polyamid');
  assert.equal(alsMap['Fußbodenheizung'], 'Geeignet');
  assert.equal(alsMap.Nutzungsklassen, '23, 33');
  for (const p of m) assert.equal(p['@type'], 'PropertyValue');
});

test('Reihenfolge folgt der sichtbaren Merkmalstabelle', async () => {
  const m = await merkmale({ florhohe: text('6 mm'), marke: text('TeppichParadies'), material: text('PVC') });
  assert.deepEqual(m.map((p) => p.name), ['Marke', 'Material', 'Florhöhe']);
});

test('Mengenangaben bekommen ihre Einheit', async () => {
  const m = await merkmale({ rollenbreite: zahl(4), qm_pro_paket: zahl(1.76), stueck_pro_paket: zahl(8) });
  const alsMap = Object.fromEntries(m.map((p) => [p.name, p.value]));
  assert.equal(alsMap.Rollenbreite, '4 m');
  assert.equal(alsMap['Inhalt je Paket'], '1.76 m²');
  assert.equal(alsMap['Stück je Paket'], '8');
});

test('Ein einzelnes Merkmal erzeugt kein fuehrendes Komma', async () => {
  const roh = (await engine.parseAndRender(quelle, { produkt: { metafields: { custom: { material: text('Wolle') } } } })).trim();
  assert.ok(!roh.startsWith(','), roh.slice(0, 30));
  assert.ok(!roh.endsWith(','), roh.slice(-30));
  JSON.parse(`[${roh}]`);
});

test('Keine Lieferanten- oder Einkaufsfelder im oeffentlichen Snippet', () => {
  const s = lies('snippets/tp-produkt-merkmale-json.liquid');
  assert.ok(!/metafields\.(lieferant|einkauf|grosshandel)/.test(s));
  // Alle gelesenen Metafelder liegen im Namespace custom.
  const namespaces = [...s.matchAll(/metafields\.([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(namespaces)], ['custom']);
});

test('Das ProductGroup-JSON-LD haengt die Merkmale ein, das native bleibt unangetastet', () => {
  const sd = lies('snippets/tp-product-structured-data.liquid');
  assert.match(sd, /render 'tp-produkt-merkmale-json', produkt: product_resource/);
  assert.match(sd, /"additionalProperty": \[\{\{ tp_sd_merkmale \}\}\],/);
  // Der native Zweig bleibt eine einzige Zeile structured_data.
  assert.match(sd, /\{\{ product_resource \| structured_data \}\}/);
  const nativ = sd.slice(sd.indexOf('{%- else -%}'));
  assert.ok(!nativ.includes('additionalProperty'), 'kein zweiter Product-Knoten im nativen Zweig');
});
