// Sonderposten von der Rolle (Tag "sonderposten", z. B. Vorwerk Passion Yasmin):
// "nur solange der Vorrat reicht" mit dem echten Restbestand unter dem Preis
// (blocks/tp-aktion-hinweis.liquid, snippets/tp-rollenrest.liquid). Eine Menge
// erscheint nur, wenn auch der Rollenrechner die Laenge auf diesen Rest begrenzt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => readFileSync(path.join(root, datei), 'utf8');
const ohneDoc = (code) => code.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const ohneStil = (code) => code.slice(0, code.indexOf('{% stylesheet %}'));

const engine = new Liquid({ templates: {
  'tp-meter-de': ohneDoc(lies('snippets/tp-meter-de.liquid')),
  'tp-rollenrest': ohneDoc(lies('snippets/tp-rollenrest.liquid')),
  'tp-aktion-laufend': ohneDoc(lies('snippets/tp-aktion-laufend.liquid')),
} });
// Shopify teilt ganze Zahlen ganzzahlig, liquidjs nicht.
engine.registerFilter('divided_by', (a, b) => Number.isInteger(a) && Number.isInteger(b) ? Math.floor(a / b) : a / b);

const r = async (snippet, vars) => (await engine.parseAndRender(`{% render '${snippet}', product: product, cm: cm %}`, vars)).trim();

function rolle({ limit = 2000, stock = 80, tracked = true, policy = 'deny', breite = 4, exact = false, variants = 1, tags = ['sonderposten'] } = {}) {
  return {
    tags,
    metafields: { custom: { max_roll_laenge_cm: { value: limit }, rollenbreite: { value: breite }, preis_pro_001_qm: { value: exact } } },
    variants: Array.from({ length: variants }, () => ({
      title: 'Default Title', metafields: { custom: {} },
      inventory_management: tracked ? 'shopify' : null, inventory_policy: policy, inventory_quantity: stock,
    })),
  };
}

test('Meter mit Komma ohne ueberfluessige Nullen', async () => {
  for (const [cm, aus] of [[2000, '20'], [1650, '16,5'], [1625, '16,25'], [1605, '16,05'], [75, '0,75'], [400, '4'], [0, '0'], [2000.0, '20']]) {
    assert.equal(await r('tp-meter-de', { cm }), aus, `${cm}`);
  }
});

test('Restbestand: 80 m2 bei 4 m Breite sind 20 m, Verkauf von 8 m2 laesst 18 m', async () => {
  assert.equal(await r('tp-rollenrest', { product: rolle() }), '2000|400|80');
  assert.equal(await r('tp-rollenrest', { product: rolle({ stock: 72 }) }), '1800|400|72');
  assert.equal(await r('tp-rollenrest', { product: rolle({ stock: 66 }) }), '1650|400|66');
  assert.equal(await r('tp-rollenrest', { product: rolle({ stock: 0 }) }), '0|400|0');
  assert.equal(await r('tp-rollenrest', { product: rolle({ stock: -2 }) }), '0|400|0');
});

test('Restbestand: Rollenbreite der Variante geht vor', async () => {
  const p = rolle({ breite: 5 });
  p.variants[0].metafields.custom.rollenbreite = { value: 4 };
  assert.equal(await r('tp-rollenrest', { product: p }), '2000|400|80');
});

test('Ohne gesicherten Bestand oder in anderer Mengeneinheit keine Menge', async () => {
  for (const opt of [{ tracked: false }, { policy: 'continue' }, { exact: true }, { breite: 0 }, { variants: 2 }, { limit: null }]) {
    assert.equal(await r('tp-rollenrest', { product: rolle(opt) }), '', JSON.stringify(opt));
  }
});

test('Gleiche Bedingung wie die Laengengrenze im Rollenrechner', async () => {
  const quelle = lies('blocks/tp-rollware-rechner.liquid');
  const start = quelle.indexOf('{%- liquid\n  assign tp_rc_max_laenge_cm');
  const ende = quelle.indexOf('-%}', start) + 3;
  assert.ok(start >= 0 && ende > start);
  for (const opt of [{}, { stock: 0 }, { tracked: false }, { policy: 'continue' }, { exact: true }, { breite: 0 }, { variants: 2 }, { limit: null }]) {
    const product = rolle(opt);
    const rechner = (await engine.parseAndRender(quelle.slice(start, ende) + '{{ tp_rc_bestand_gefuehrt }}', {
      product, tp_rc_cm_exact: !!opt.exact, tp_rc_fallback_width_cm: (opt.breite ?? 4) * 100,
    })).trim();
    const rest = await r('tp-rollenrest', { product });
    assert.equal(rechner === 'true', rest !== '', JSON.stringify(opt));
  }
});

const block = ohneStil(lies('blocks/tp-aktion-hinweis.liquid')).replace(/{%\s*doc\s*%}[\s\S]*?{%\s*enddoc\s*%}/, '');
const hinweis = async (product) => (await engine.parseAndRender(block, {
  closest: { product }, product, block: { shopify_attributes: '' }, settings: {},
  shop: { metaobjects: { tp_aktion: { values: [] } } },
})).replace(/\s+/g, ' ').trim();

test('Produktseite: Hinweis mit Restbestand unter dem Preis', async () => {
  const html = await hinweis(rolle());
  assert.match(html, /Sonderposten – nur solange der Vorrat reicht/);
  assert.match(html, /Restbestand: noch <strong>20 m<\/strong> Länge bei 4 m Rollenbreite \(80 m²\)\./);
  assert.match(await hinweis(rolle({ stock: 66 })), /noch <strong>16,5 m<\/strong>/);
});

test('Produktseite: ausverkauft statt Menge 0', async () => {
  const html = await hinweis(rolle({ stock: 0 }));
  assert.match(html, /Sonderposten – ausverkauft/);
  assert.doesNotMatch(html, /solange der Vorrat reicht/);
});

test('Produktseite: kein Hinweis ohne Tag oder ohne gesicherten Bestand', async () => {
  assert.doesNotMatch(await hinweis(rolle({ tags: [] })), /Vorrat|Restbestand/);
  assert.doesNotMatch(await hinweis(rolle({ tracked: false })), /Vorrat|Restbestand/);
  assert.doesNotMatch(await hinweis(rolle({ policy: 'continue' })), /Vorrat|Restbestand/);
});

test('Rechner zeigt "20 m" statt "20,0 m"', async () => {
  const quelle = lies('blocks/tp-rollware-rechner.liquid');
  assert.doesNotMatch(quelle, /tp_rc_max_laenge_cm \| divided_by: 100\.0 \| replace/);
  assert.match(quelle, /render 'tp-meter-de', cm: tp_rc_max_laenge_cm/);
});
