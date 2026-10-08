// Sonderposten (Einzelstuecke mit festen Massen): Erkennung, Flaeche, Zahlformat und
// Verkaufsart. Hintergrund: docs/weiterentwicklung/sonderposten.md - ein Reststueck darf nie
// als Rollen- oder Paketware behandelt werden, sonst greifen m2-Rechner und Mengenfelder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ohneDoc = (datei) => readFileSync(path.join(root, datei), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid({ templates: {
  'tp-ist-sonderposten': ohneDoc('snippets/tp-ist-sonderposten.liquid'),
  'tp-sonderposten-flaeche': ohneDoc('snippets/tp-sonderposten-flaeche.liquid'),
  'tp-zahl-de': ohneDoc('snippets/tp-zahl-de.liquid'),
  'tp-verkaufseinheit': ohneDoc('snippets/tp-verkaufseinheit.liquid'),
} });
const r = async (snippet, vars) => (await engine.parseAndRender(`{% render '${snippet}', product: product, zahl: zahl %}`, vars)).trim();

test('Erkennung nur ueber den Produkttyp', async () => {
  assert.equal(await r('tp-ist-sonderposten', { product: { type: 'Sonderposten' } }), 'ja');
  assert.equal(await r('tp-ist-sonderposten', { product: { type: 'Teppichboden' } }), '');
});

test('Zahlformat mit zwei Nachkommastellen und Komma', async () => {
  for (const [ein, aus] of [[4, '4,00'], [2.35, '2,35'], [9.4, '9,40'], [0.05, '0,05'], [12.345, '12,35']]) {
    assert.equal(await r('tp-zahl-de', { zahl: ein }), aus, `${ein}`);
  }
});

test('Flaeche: Metafeld vor Breite x Laenge, ohne Daten nichts', async () => {
  const p = (sp) => ({ product: { metafields: { sonderposten: sp } } });
  assert.equal(Number(await r('tp-sonderposten-flaeche', p({ breite_m: { value: 4 }, laenge_m: { value: 2.35 } }))), 9.4);
  assert.equal(Number(await r('tp-sonderposten-flaeche', p({ flaeche_m2: { value: 8.75 }, breite_m: { value: 4 }, laenge_m: { value: 2.35 } }))), 8.75);
  assert.equal(await r('tp-sonderposten-flaeche', p({ breite_m: { value: 4 } })), '', 'nie schaetzen');
});

test('Verkaufsart: Sonderposten immer einzel, auch mit Rollen-Tags und Rollenbreite', async () => {
  const product = {
    type: 'Sonderposten',
    tags: ['art: teppichboden', 'maß: wunschmaß'],
    metafields: { custom: { rollenbreite: { value: 4, type: 'number_decimal' }, qm_pro_paket: { value: 2.5 } } },
    variants: [{ title: 'Default Title', metafields: { custom: { rollenbreite: { value: 4 } } } }],
  };
  assert.equal(await r('tp-verkaufseinheit', { product }), 'einzel');
  assert.equal(await r('tp-verkaufseinheit', { product: { ...product, type: 'Teppichboden' } }), 'paket',
    'Gegenprobe: ohne Sonderposten-Typ gilt die bisherige Reihenfolge');
});
