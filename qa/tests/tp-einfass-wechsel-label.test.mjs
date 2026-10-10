// Chip-Beschriftung im Einfass-Wechsel (blocks/tp-einfass-wechsel.liquid): optional
// service.einfass_label (Text) am jeweiligen Produkt ersetzt die feste Beschriftung
// seines Chips (Cover, Gekettelt, Einfassband, Paspelband). Ohne Feld unveraendert.
// Rendert das echte Liquid mit LiquidJS; kein Netzwerk, kein Shopify-Zugriff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const block = readFileSync(path.join(root, 'blocks/tp-einfass-wechsel.liquid'), 'utf8');
const a = block.indexOf('{%- liquid');
const b = block.indexOf('\n{% stylesheet %}');
assert.ok(a >= 0 && b > a, 'Quelltext-Anker fehlen');
const source = block.slice(a, b);
const engine = new Liquid();
engine.registerFilter('json', (value) => JSON.stringify(value ?? null));

const val = (value) => ({ value });
function produkt(id, art, label) {
  const service = { einfassung: val(art) };
  if (label !== undefined) service.einfass_label = val(label);
  return { id, url: `/products/p${id}`, available: true, variants: [], metafields: { service } };
}

async function chips(labels = {}) {
  const gruppe = [
    produkt(1, 'Paspelband', labels.paspelband),
    produkt(2, 'Ketteln', labels.ketteln),
    produkt(3, 'Einfassband', labels.einfassband),
    produkt(4, 'Cover', labels.cover),
  ];
  const product = { ...gruppe[0], selected_or_first_available_variant: { id: 11 } };
  product.metafields.service.einfass_gruppe = val(gruppe);
  product.metafields.service.einfass_basis = val({ available: true, url: '/products/boden' });
  const html = await engine.parseAndRender(source, { product, block: { id: 'ew_1', shopify_attributes: '' } });
  const liste = [...html.matchAll(/<(span|a) class="tp-ew__chip[^"]*"[^>]*>([^<]*)<\/\1>/g)]
    .map((m) => ({ aktiv: m[1] === 'span', text: m[2] }));
  return { html, liste };
}

test('Regression: ohne Feld die festen Beschriftungen in fester Reihenfolge', async () => {
  const { liste } = await chips();
  assert.deepEqual(liste, [
    { aktiv: false, text: 'Cover' },
    { aktiv: false, text: 'Gekettelt' },
    { aktiv: false, text: 'Einfassband' },
    { aktiv: true, text: 'Paspelband' },
  ]);
});

test('eigenes Produkt: service.einfass_label ersetzt die Beschriftung des aktiven Chips', async () => {
  const { liste } = await chips({ paspelband: 'Paspel' });
  assert.deepEqual(liste.find((c) => c.aktiv), { aktiv: true, text: 'Paspel' });
  assert.deepEqual(liste.filter((c) => !c.aktiv).map((c) => c.text), ['Cover', 'Gekettelt', 'Einfassband']);
});

test('anderes Produkt der Gruppe: sein Label steht auf seinem Link-Chip, getrimmt', async () => {
  const { liste, html } = await chips({ cover: '  Umgeschlagene Kante ' });
  assert.deepEqual(liste.map((c) => c.text), ['Umgeschlagene Kante', 'Gekettelt', 'Einfassband', 'Paspelband']);
  assert.match(html, /href="\/products\/p4" data-ew-ziel="4">Umgeschlagene Kante</);
});

test('leeres oder nur aus Leerzeichen bestehendes Label zaehlt als fehlend', async () => {
  for (const label of ['', '   ', null]) {
    const { liste } = await chips({ paspelband: label, ketteln: label });
    assert.deepEqual(liste.map((c) => c.text), ['Cover', 'Gekettelt', 'Einfassband', 'Paspelband'], JSON.stringify(label));
  }
});

test('Label wird escaped', async () => {
  const { html } = await chips({ einfassband: 'Band <b>breit</b>' });
  assert.match(html, />Band &lt;b&gt;breit&lt;\/b&gt;</);
  assert.doesNotMatch(html, /<b>breit<\/b>/);
});
