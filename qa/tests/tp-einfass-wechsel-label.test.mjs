// Kantenwahl fuer Teppiche nach Mass. Seit 2026-10-12 zeigt der Konfigurator die
// Einfassarten als Bildkacheln (snippets/tp-einfass-kanten.liquid); die Chips in
// blocks/tp-einfass-wechsel.liquid bleiben nur fuer Teppiche mit einer einzigen
// Einfassart (dann nur der Weg zur Meterware). Optional service.einfass_label (Text)
// am jeweiligen Produkt ersetzt die feste Beschriftung seiner Kachel.
// Rendert das echte Liquid mit LiquidJS; kein Netzwerk, kein Shopify-Zugriff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

const engine = new Liquid({ root: [path.join(root, 'snippets')], extname: '.liquid' });
engine.registerFilter('json', (value) => JSON.stringify(value ?? null));
engine.registerFilter('money_without_currency', (cent) => (Number(cent) / 100).toFixed(2).replace('.', ','));
engine.registerFilter('image_url', (img) => String(img?.src ?? img ?? ''));
engine.registerFilter('image_tag', (url) => `<img src="${url}">`);
// {% doc %} kennt LiquidJS nicht - Inhalt ueberspringen wie Shopify.
engine.registerTag('doc', {
  parse(_token, remain) {
    while (remain.length) {
      const t = remain.shift();
      if (t.name === 'enddoc') return;
    }
  },
  render() {},
});

const kanten = readFileSync(path.join(root, 'snippets/tp-einfass-kanten.liquid'), 'utf8');
const wechselBlock = readFileSync(path.join(root, 'blocks/tp-einfass-wechsel.liquid'), 'utf8');
const wa = wechselBlock.indexOf('{%- liquid');
const wb = wechselBlock.indexOf('\n{% stylesheet %}');
assert.ok(wa >= 0 && wb > wa, 'Quelltext-Anker fehlen');
const wechsel = wechselBlock.slice(wa, wb);

const val = (value) => ({ value });
function produkt(id, art, label) {
  const service = { einfassung: val(art), mindestpreis: val(99), max_laenge_cm: val(600) };
  if (label !== undefined) service.einfass_label = val(label);
  const variante = {
    id: id * 10 + 1, price: 79, available: true,
    metafields: { service: { einfassen: val('Verfügbar'), basisvariante: val({ id: 500 }) } },
  };
  return { id, url: `/products/p${id}`, available: true, variants: [variante], metafields: { service } };
}

function gruppe(labels = {}, arten = ['Paspelband', 'Ketteln', 'Einfassband', 'Cover']) {
  const keys = { Paspelband: 'paspelband', Ketteln: 'ketteln', Einfassband: 'einfassband', Cover: 'cover' };
  const liste = arten.map((art, i) => produkt(i + 1, art, labels[keys[art]]));
  const product = { ...liste[0], selected_or_first_available_variant: liste[0].variants[0] };
  product.metafields.service.einfass_gruppe = val(liste);
  product.metafields.service.einfass_basis = val({ available: true, url: '/products/boden' });
  return product;
}

async function kacheln(labels) {
  const product = gruppe(labels);
  const html = await engine.parseAndRender(kanten, { product, bilder: {}, kettel_cent: 0 });
  const liste = [...html.matchAll(/<a\s+class="tp-ek__kante( is-aktiv)?"[\s\S]*?<span class="tp-ek__kante-name">([^<]*)<\/span>/g)]
    .map((m) => ({ aktiv: !!m[1], text: m[2] }));
  return { html, liste };
}

test('Kacheln: ohne Feld die festen Beschriftungen, Reihenfolge Kettelung bis Cover', async () => {
  const { liste } = await kacheln();
  assert.deepEqual(liste, [
    { aktiv: false, text: 'Gekettelt' },
    { aktiv: true, text: 'Paspel' },
    { aktiv: false, text: 'Einfassband' },
    { aktiv: false, text: 'Cover' },
  ]);
});

test('Kacheln: service.einfass_label ersetzt die Beschriftung, getrimmt', async () => {
  const { liste } = await kacheln({ paspelband: 'Paspel (Premium)', cover: '  Umgeschlagene Kante ' });
  assert.deepEqual(liste.map((c) => c.text), ['Gekettelt', 'Paspel (Premium)', 'Einfassband', 'Umgeschlagene Kante']);
});

test('Kacheln: leeres oder nur aus Leerzeichen bestehendes Label zaehlt als fehlend', async () => {
  for (const label of ['', '   ', null]) {
    const { liste } = await kacheln({ paspelband: label, ketteln: label });
    assert.deepEqual(liste.map((c) => c.text), ['Gekettelt', 'Paspel', 'Einfassband', 'Cover'], JSON.stringify(label));
  }
});

test('Kacheln: Label wird escaped', async () => {
  const { html } = await kacheln({ einfassband: 'Band <b>breit</b>' });
  assert.match(html, />Band &lt;b&gt;breit&lt;\/b&gt;</);
  assert.doesNotMatch(html, /<b>breit<\/b>/);
});

test('Kacheln: Link nimmt die Variante derselben Farbe mit, Preis je m2 aus dem Variantenpreis', async () => {
  const { html } = await kacheln();
  assert.match(html, /href="\/products\/p2\?variant=21#tp-ek-kanten"/);
  assert.match(html, /79&nbsp;€\/m²/);
  assert.match(html, /"500": \[21, 79\]/);
});

test('Kacheln: Herstellerfotos nur fuer die eigene Marke, sonst allgemeines Bild oder Zeichnung', async () => {
  const bilder = {
    bild_ketteln: 'allgemein-kette.jpg',
    marke_bilder_vendor: 'JAB Anstoetz', marke_bild_paspelband: 'jab-paspel.jpg', marke_bild_cover: 'jab-cover.jpg',
    marke2_bilder_vendor: 'Vorwerk', marke2_bild_paspelband: 'vw-paspel.jpg', marke2_bild_ketteln: 'vw-kette.jpg',
  };
  const fuer = async (vendor) => {
    const product = { ...gruppe(), vendor };
    const html = await engine.parseAndRender(kanten, { product, bilder, kettel_cent: 0 });
    return [...html.matchAll(/data-kante-art="(\w+)"[\s\S]*?<span\s+class="tp-ek__kante-bild([^"]*)"[\s\S]*?(?:<img src="([^"]+)"|<span class="tp-ek__kante-ecke">)/g)]
      .map((m) => [m[1], m[3] || 'zeichnung']);
  };
  assert.deepEqual(await fuer('JAB Anstoetz'), [['ketteln', 'allgemein-kette.jpg'], ['paspelband', 'jab-paspel.jpg'], ['einfassband', 'zeichnung'], ['cover', 'jab-cover.jpg']]);
  assert.deepEqual(await fuer('Vorwerk'), [['ketteln', 'vw-kette.jpg'], ['paspelband', 'vw-paspel.jpg'], ['einfassband', 'zeichnung'], ['cover', 'zeichnung']]);
  assert.deepEqual(await fuer('TeppichParadies'), [['ketteln', 'allgemein-kette.jpg'], ['paspelband', 'zeichnung'], ['einfassband', 'zeichnung'], ['cover', 'zeichnung']]);
});

test('Kacheln: zwei Paspel-Produkte (Premium fest, Kontrast mit Herstellerfarben) - beide, mit eigenem Text und Bild', async () => {
  const liste = gruppe({ paspelband: 'Paspel (Premium)' }, ['Ketteln', 'Paspelband', 'Cover']);
  const premium = liste.metafields.service.einfass_gruppe.value[1];
  premium.metafields.service.bandfarbe_fest = val('Ton in Ton');
  const kontrast = produkt(9, 'Paspelband', 'Paspel (Kontrast)');
  kontrast.metafields.service.bandfarben = val('Sand|#c8b79b;Anthrazit|#43464a;Schwarz|#1f1f21');
  liste.metafields.service.einfass_gruppe.value.push(kontrast);
  const product = { ...liste, vendor: 'Vorwerk' };
  const bilder = { marke2_bilder_vendor: 'Vorwerk', marke2_bild_paspelband: 'vw-premium.jpg', marke2_bild_paspelwahl: 'vw-paspel.jpg' };
  const html = await engine.parseAndRender(kanten, { product, bilder, kettel_cent: 0 });
  const namen = [...html.matchAll(/<span class="tp-ek__kante-name">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(namen, ['Gekettelt', 'Paspel (Premium)', 'Paspel (Kontrast)', 'Cover']);
  assert.match(html, /Farbe nach Wahl: Sand, Anthrazit oder Schwarz/);
  assert.match(html, /in der Farbe des Teppichs/);
  assert.match(html, /<img src="vw-premium\.jpg">[\s\S]*<img src="vw-paspel\.jpg">/);
  // JSON-Index je Kachel passt zur Reihenfolge der Kacheln
  const daten = JSON.parse(html.match(/<script type="application\/json" data-kanten-daten>([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(daten.kanten.filter(Boolean).map((k) => k.url), ['/products/p1', '/products/p2', '/products/p9', '/products/p3']);
});

test('Kacheln: eine einzige Einfassart ist keine Wahl - nichts rendern', async () => {
  const product = gruppe({}, ['Ketteln']);
  const html = await engine.parseAndRender(kanten, { product, bilder: {}, kettel_cent: 0 });
  assert.equal(html.trim(), '');
});

test('Wechsel-Block: bei mehreren Einfassarten nichts mehr (Kacheln uebernehmen)', async () => {
  const product = gruppe();
  const html = await engine.parseAndRender(wechsel, { product, block: { id: 'ew_1', shopify_attributes: '' } });
  assert.equal(html.trim(), '');
});

test('Wechsel-Block: eine Einfassart allein zeigt weiter den Weg zur Meterware', async () => {
  const product = gruppe({}, ['Ketteln']);
  const html = await engine.parseAndRender(wechsel, { product, block: { id: 'ew_1', shopify_attributes: '' } });
  assert.match(html, /Als Teppichboden von der Rolle bestellen/);
  assert.doesNotMatch(html, /tp-ew__chip/);
});
