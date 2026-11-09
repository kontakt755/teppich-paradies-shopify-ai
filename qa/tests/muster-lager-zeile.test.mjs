// Produktseite: "Muster dieser Farbe auf Lager - sofort lieferbar" am Musterknopf (09.11.2026).
// Liquid-Seite (snippets/tp-muster-lager): Produktfarbe -> Mustervariante -> SKU -> Metafeld custom.muster_sofort.
// JS-Seite (assets/tp-muster-lager.js): Farbwechsel und veraltete Liste. Kein Netzwerk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const engine = new Liquid();
for (const tag of ['doc', 'stylesheet']) engine.registerTag(tag, {
  parse(token, tokens) { while (tokens.length && tokens.shift().name !== `end${tag}`) {} },
  render() { return ''; },
});
engine.registerFilter('asset_url', name => `/assets/${name}`);

const vorStunden = h => new Date(Date.now() - h * 3600 * 1000).toISOString();
const m = (sku, farbe, available = true) => ({ sku, option1: farbe, available });

// Fame: Rolle mit Farbe + Breite, Wunschmass-Varianten ohne SKU; Nougat und Steingrau liegen im Lager.
const musterFame = { id: 1, variants: [
  m('M-JAB-3753-271', 'Nougat (271)'), m('M-JAB-3753-332', 'Cognac (332)'), m('M-JAB-3753-373', 'Steingrau (373)'),
  m('M-JAB-3753-456', 'Anthrazit (456)', false),
] };
const fame = (farbe = 'Nougat (271)', extra = {}) => ({
  handle: 'fame-400', options_with_values: [{ name: 'Farbe' }, { name: 'Breite' }],
  selected_or_first_available_variant: { options: [farbe, 'Wunschmaß'] }, metafields: { service: {} }, ...extra,
});
const metafeld = (stand = vorStunden(1), skus = ['JAB-3753-271', 'JAB-3753-373', 'JAB-3753-456']) => ({ custom: { muster_sofort: { value: { skus, stand } } } });

const render = (product, { shop = { metafields: metafeld() }, all_products = { 'muster-fame-400': musterFame } } = {}) =>
  engine.parseAndRender(read('snippets/tp-muster-lager.liquid'), { product, shop, all_products });
const farbenAus = html => JSON.parse(html.match(/data-tp-ms-farben="([^"]*)"/)[1].replaceAll('&quot;', '"').replaceAll('&#34;', '"'));
const versteckt = html => /data-tp-ms-option="[^"]*"\s+hidden\s*>/.test(html);
const sichtbar = html => html.includes('data-tp-ms-zeile') && !versteckt(html);

test('Farbe mit Lagermuster: Zeile sichtbar, Wortlaut, Farben klein und ohne gesperrte Muster', async () => {
  const html = await render(fame('Nougat (271)'));
  assert.match(html, /Muster dieser Farbe auf Lager – sofort lieferbar/);
  assert.deepEqual(farbenAus(html), ['nougat (271)', 'steingrau (373)'], 'Anthrazit steht in der Liste, ist aber nicht verfuegbar');
  assert.ok(sichtbar(html));
  assert.match(html, /tp-muster-lager\.js/);
});

test('Farbe ohne Lagermuster: Zeile steht im HTML, aber versteckt (Farbwechsel schaltet um)', async () => {
  const html = await render(fame('Cognac (332)'));
  assert.ok(versteckt(html));
  assert.deepEqual(farbenAus(html), ['nougat (271)', 'steingrau (373)']);
});

test('Wunschmass-Variante ohne SKU: der Farbwert entscheidet, nicht die SKU der Produktvariante', async () => {
  const produkt = fame('Steingrau (373)');
  assert.equal(produkt.selected_or_first_available_variant.options[1], 'Wunschmaß');
  assert.ok(sichtbar(await render(produkt)));
});

test('Liste aelter als 2 Stunden, fehlendes Metafeld, leere Liste: nichts ausgegeben', async () => {
  for (const shop of [
    { metafields: metafeld(vorStunden(3)) },
    { metafields: metafeld(vorStunden(1), []) },
    { metafields: { custom: {} } },
    { metafields: metafeld('') },
  ]) assert.equal((await render(fame(), { shop })).trim(), '');
  assert.ok((await render(fame(), { shop: { metafields: metafeld(vorStunden(1.9)) } })).includes('data-tp-ms-zeile'), 'knapp unter 2 Stunden gilt noch');
});

test('Kein eigenes Musterprodukt: Musterprodukt des Teppichbodens (service.einfass_basis), sonst nichts', async () => {
  const mass = fame('Nougat (271)', { handle: 'fame-nach-mass', metafields: { service: { einfass_basis: { value: { handle: 'fame-400' } } } } });
  assert.ok(sichtbar(await render(mass)), 'Basis-Muster wie im Konfigurator');
  assert.equal((await render(fame('Nougat (271)', { handle: 'ohne-muster-produkt' }))).trim(), '', 'weder eigenes noch Basis-Muster');
  const eigen = { 'muster-fame-nach-mass': { id: 2, variants: [m('M-X-1', 'Nougat (271)')] }, 'muster-fame-400': musterFame };
  assert.equal((await render(mass, { all_products: eigen })).trim(), '', 'eigenes Musterprodukt geht vor der Basis (wie assignSampleVariantsWithBasis)');
});

test('Ohne Farboption (Zubehoer, Einzeldekor): keine Zeile', async () => {
  assert.equal((await render(fame('Nougat (271)', { options_with_values: [{ name: 'Breite' }] }))).trim(), '');
});

test('Einbindung: Musterknopf-Block und Rollenware-Rechner rendern das Snippet, im Muster-Aufruf nicht bei "Muster anfragen"', () => {
  const cta = read('blocks/tp-muster-cta.liquid');
  assert.match(cta, /unless tp_mc_anfrage[\s\S]{0,40}render 'tp-muster-lager', product: product/);
  assert.match(read('blocks/tp-rollware-rechner.liquid'), /render 'tp-muster-lager', product: product/);
});

test('Stil: Plakette weiss auf --tp-ink, kein Rot, Schrift aus der Skala', () => {
  const css = read('snippets/tp-muster-lager.liquid').split('{% stylesheet %}')[1];
  assert.match(css, /background: var\(--tp-ink/);
  assert.match(css, /font-size: var\(--tp-fs-xs\)/);
  assert.doesNotMatch(css, /c8102e|b3261e|B0303F|tp-hauptaktion/i);
  assert.doesNotMatch(css, /font-size: \d/);
});

// ---- JS ----
function skript(jetzt = Date.now()) {
  const wurzel = { radios: [], selects: [], querySelectorAll(sel) { return sel.includes('radio') ? this.radios : this.selects; } };
  const zeilen = [];
  const document = { zeilen, listener: {}, querySelectorAll: () => zeilen, addEventListener(typ, fn) { this.listener[typ] = fn; } };
  const kontext = { window: {}, document, Date: class extends Date { static now() { return jetzt; } } };
  vm.runInNewContext(read('assets/tp-muster-lager.js'), kontext);
  const zeile = (farben, stand) => {
    const z = { hidden: true, getAttribute: n => ({ 'data-tp-ms-farben': JSON.stringify(farben), 'data-tp-ms-stand': stand, 'data-tp-ms-option': 'Farbe' })[n], closest: () => wurzel };
    zeilen.push(z);
    return z;
  };
  return { wurzel, document, zeile, api: kontext.window.TPMusterLager };
}
const stand = h => new Date(Date.parse('2026-11-09T12:00:00Z') - h * 3600 * 1000).toISOString();
const JETZT = Date.parse('2026-11-09T12:00:00Z');

test('JS: Farbwaehler-Block (color-swatch) und Horizon-Knoepfe: Wechsel schaltet die Zeile; Breite und Gross/Klein stoeren nicht', () => {
  const s = skript(JETZT);
  const z = s.zeile(['nougat (271)', 'steingrau (373)'], stand(1));
  s.wurzel.radios = [{ name: 'color-swatch-abc', value: ' Nougat (271) ' }, { name: 'Breite-block-1', value: '400 cm' }];
  s.document.listener.change();
  assert.equal(z.hidden, false);
  s.wurzel.radios = [{ name: 'color-swatch-abc', value: 'Cognac (332)' }, { name: 'Breite-block-1', value: '400 cm' }];
  s.document.listener['tp:farbe-wechsel']();
  assert.equal(z.hidden, true);
  s.wurzel.radios = [{ name: 'Farbe-block-1', value: 'Steingrau (373)' }];
  s.document.listener['variant:update']();
  assert.equal(z.hidden, false, 'Horizon-Knopf "<Option>-<Block>-<Produkt>"');
});

test('JS: fremde Radiofelder (z. B. Bandfarbe im Einfassung-Konfigurator) zaehlen nicht als Farbe', () => {
  const s = skript(JETZT);
  const z = s.zeile(['sand'], stand(1));
  s.wurzel.radios = [{ name: 'tp-ek-bandfarbe', value: 'Sand' }];
  s.api.aktualisiere();
  assert.equal(z.hidden, true, 'kein Farbwaehler gefunden: Zustand vom Server bleibt (hier: versteckt)');
  s.wurzel.radios = [{ name: 'tp-ek-bandfarbe', value: 'Sand' }, { name: 'color-swatch-x', value: 'Anthrazit' }];
  s.api.aktualisiere();
  assert.equal(z.hidden, true, 'Sand als Bandfarbe zaehlt nicht, die Produktfarbe ist Anthrazit');
});

test('JS: Auswahlliste (select) zaehlt wie Radiofelder', () => {
  const s = skript(JETZT);
  const z = s.zeile(['grau'], stand(1));
  s.wurzel.selects = [{ name: 'options[Farbe]', value: 'Grau' }, { name: 'quantity', value: 'grau' }];
  s.api.aktualisiere();
  assert.equal(z.hidden, false);
  s.wurzel.selects = [{ name: 'options[Breite]', value: 'Grau' }];
  s.wurzel.radios = [{ name: 'color-swatch-x', value: 'Rot' }];
  s.api.aktualisiere();
  assert.equal(z.hidden, true);
});

test('JS: Seite lange offen (Liste aelter als 2 Stunden): Zeile weg, auch bei Lagerfarbe', () => {
  const s = skript(JETZT);
  const z = s.zeile(['grau'], stand(2.5));
  s.wurzel.radios = [{ name: 'color-swatch-x', value: 'Grau' }];
  s.api.aktualisiere();
  assert.equal(z.hidden, true);
  const s2 = skript(JETZT);
  const z2 = s2.zeile(['grau'], stand(2));
  s2.wurzel.radios = [{ name: 'color-swatch-x', value: 'Grau' }];
  s2.api.aktualisiere();
  assert.equal(z2.hidden, false, 'genau 2 Stunden gilt noch');
});

test('JS: ohne Variantenwaehler bleibt der Zustand vom Server; kaputtes Attribut verbirgt', () => {
  const s = skript(JETZT);
  const z = s.zeile(['grau'], stand(1));
  z.hidden = false;
  s.api.aktualisiere();
  assert.equal(z.hidden, false);
  const kaputt = s.zeile([], stand(1));
  kaputt.getAttribute = n => (n === 'data-tp-ms-farben' ? '{kaputt' : stand(1));
  kaputt.hidden = false;
  s.wurzel.radios = [{ name: 'color-swatch-x', value: 'Grau' }];
  s.api.aktualisiere();
  assert.equal(kaputt.hidden, true);
});
