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

// ---------------------------------------------------------------------------
// Review-Befunde 2026-10-09 (PR #977): Verfuegbarkeit nur mit gesichertem
// Bestand, keine Abhol-Zusage, die der Checkout bricht, Streichpreis nur mit
// pruefbarem Beleg je Stueck.
// ---------------------------------------------------------------------------

const lies = (datei) => readFileSync(path.join(root, datei), 'utf8');
const ohneStil = (code) => code.slice(0, code.indexOf('{% stylesheet %}'));
const voll = new Liquid({ templates: {
  'tp-ist-sonderposten': ohneDoc('snippets/tp-ist-sonderposten.liquid'),
  'tp-sonderposten-flaeche': ohneDoc('snippets/tp-sonderposten-flaeche.liquid'),
  'tp-sonderposten-kaufstatus': ohneDoc('snippets/tp-sonderposten-kaufstatus.liquid'),
  'tp-sonderposten-preisbeleg': ohneDoc('snippets/tp-sonderposten-preisbeleg.liquid'),
  'tp-rabatt-sichtbar': ohneDoc('snippets/tp-rabatt-sichtbar.liquid'),
  'tp-aktion-aktiv': ohneDoc('snippets/tp-aktion-aktiv.liquid'),
  'tp-verkaufseinheit': ohneDoc('snippets/tp-verkaufseinheit.liquid'),
  'tp-zahl-de': ohneDoc('snippets/tp-zahl-de.liquid'),
} });
voll.registerFilter('money', (c) => `${(Number(c) / 100).toFixed(2).replace('.', ',')} €`);
voll.registerFilter('t', (k) => k);
voll.registerFilter('item_count_for_variant', () => 0);

/** Ein Reststueck 4,00 x 2,35 m mit Bestandseinstellungen wie in Shopify. */
const stueck = ({ available = true, management = 'shopify', policy = 'deny', menge = 1, versand = 'Abholung oder Versand', sp = {}, variante = {} } = {}) => ({
  type: 'Sonderposten',
  title: 'Velory Reststück Grau 4,00 × 2,35 m',
  metafields: { sonderposten: { art: { value: 'Reststück' }, breite_m: { value: 4 }, laenge_m: { value: 2.35 }, versand: { value: versand }, ...sp }, custom: {} },
  variants: [{ id: 1, title: 'Default Title', price: 8900, compare_at_price: null, available, inventory_management: management, inventory_policy: policy, inventory_quantity: menge, ...variante }],
  get selected_or_first_available_variant() { return this.variants[0]; },
});
const kaufstatus = async (product) => (await voll.parseAndRender("{% render 'tp-sonderposten-kaufstatus', product: product %}", { product })).trim();

test('Kaufstatus: frei nur mit gefuehrtem Bestand, ohne Ueberverkauf und Bestand > 0', async () => {
  assert.equal(await kaufstatus(stueck()), 'frei');
  assert.equal(await kaufstatus(stueck({ management: null, menge: 0 })), 'ungesichert', 'Bestand nicht gefuehrt: Shopify verkauft beliebig oft');
  assert.equal(await kaufstatus(stueck({ policy: 'continue' })), 'ungesichert', 'Ueberverkauf erlaubt, auch bei Bestand 1');
  assert.equal(await kaufstatus(stueck({ policy: 'continue', menge: 0 })), 'ungesichert', 'Bestand 0 mit Ueberverkauf ist weiter kaufbar');
  assert.equal(await kaufstatus(stueck({ available: false, menge: 0 })), 'verkauft');
  assert.equal(await kaufstatus(stueck({ versand: 'Nur Abholung' })), 'laden');
  assert.equal(await kaufstatus(stueck({ versand: 'Nur Abholung', management: null })), 'ungesichert', 'ungesichert geht vor laden');
  assert.equal(await kaufstatus({ ...stueck(), type: 'Teppichboden' }), '', 'Nicht-Sonderposten: kein Status');
});

const blockQuelle = ohneStil(ohneDoc('blocks/tp-sonderposten-daten.liquid'));
const block = (product) => voll.parseAndRender(blockQuelle, { closest: { product }, block: { shopify_attributes: '' } });

test('Produktseite: "verfuegbar" nur bei gesichertem Bestand, sonst "Online nicht bestellbar"', async () => {
  const frei = await block(stueck());
  assert.match(frei, /Nur 1× verfügbar/);
  assert.match(frei, /Abholung in Oranienburg oder Versand/);

  for (const [fall, p] of [['ungetrackt', stueck({ management: null, menge: 0 })], ['ueberverkaufbar', stueck({ policy: 'continue' })]]) {
    const html = await block(p);
    assert.match(html, /Online nicht bestellbar/, fall);
    assert.doesNotMatch(html, /verfügbar</, `${fall}: keine Verfuegbarkeitsangabe ohne gesicherten Bestand`);
    assert.doesNotMatch(html, /Versand/, `${fall}: kein Versandversprechen fuer ein nicht bestellbares Stueck`);
  }
  assert.match(await block(stueck({ available: false, menge: 0 })), /tp-sp__chip--weg">Verkauft/);
});

test('Produktseite: "Nur Abholung" wird nicht als Zusage neben einem Versand-Checkout gezeigt', async () => {
  const html = await block(stueck({ versand: 'Nur Abholung' }));
  assert.match(html, /Nur im Geschäft/);
  assert.match(html, /online ist es nicht bestellbar/);
  assert.doesNotMatch(html, /<strong>Nur Abholung<\/strong>/);
  assert.doesNotMatch(html, /Versand/);
});

// Kopf des Kaufblocks (alles bis zum ersten Markup) mit echtem Liquid ausfuehren.
const kaufkopf = lies('blocks/buy-buttons.liquid').match(/\{% liquid[\s\S]*?\n%\}/)[0];
const kaufknopf = async (product) => {
  const aus = await voll.parseAndRender(`${kaufkopf}{{ can_add_to_cart }}|{{ add_to_cart_text }}`, {
    closest: { product }, template: { name: 'product.sonderposten' }, request: {}, cart: {},
  });
  const [kann, text] = aus.trim().split('|');
  return { kann: kann === 'true', text };
};

test('Kaufknopf (und damit Express-Checkout) nur bei frei', async () => {
  assert.deepEqual(await kaufknopf(stueck()), { kann: true, text: 'products.product.add_to_cart' });
  assert.deepEqual(await kaufknopf(stueck({ management: null, menge: 0 })), { kann: false, text: 'Online nicht bestellbar' });
  assert.deepEqual(await kaufknopf(stueck({ policy: 'continue' })), { kann: false, text: 'Online nicht bestellbar' });
  assert.deepEqual(await kaufknopf(stueck({ versand: 'Nur Abholung' })), { kann: false, text: 'Nur im Geschäft erhältlich' });
  assert.deepEqual(await kaufknopf(stueck({ available: false, menge: 0 })), { kann: false, text: 'Verkauft' });
  assert.match(lies('blocks/accelerated-checkout.liquid'), /unless can_add_to_cart %\}\s*hidden/, 'Express-Checkout haengt an can_add_to_cart');
});

test('Kaufleiste und JSON-LD fragen denselben Kaufstatus', () => {
  const section = lies('sections/product-information.liquid');
  assert.match(section, /render 'tp-sonderposten-kaufstatus', product: product/);
  assert.match(section, /unless tp_pi_kaufbar %\}\s*disabled/);
  const sd = lies('snippets/tp-product-structured-data.liquid');
  assert.match(sd, /render 'tp-sonderposten-kaufstatus', product: product_resource/);
  assert.match(sd, /"availability": \{% if tp_sd_variant\.available and tp_sd_sp_gesperrt == false %\}/);
});

// --- Streichpreis: Beleg muss zu genau diesem Stueck passen -----------------

const rolle = (preis = 2590, extra = {}) => ({
  type: 'Teppichboden', title: 'Velory Teppichboden', tags: [], metafields: { custom: {} },
  variants: [
    { title: '400 cm', option1: '400 cm', price: preis, available: true, metafields: { custom: {} } },
    { title: 'Wunschmaß', option1: 'Wunschmaß', price: 3490, available: true, metafields: { custom: {} } },
    { title: 'Muster', option1: 'Muster', price: 0, available: true, metafields: { custom: {} } },
  ],
  ...extra,
});
const mitBeleg = ({ beleg = 'regulär 25,90 €/m² × 9,40 m²', vergleich = 24346, ursprung = rolle(), sp = {} } = {}) => stueck({
  sp: { preis_beleg: { value: beleg }, ursprungsprodukt: { value: ursprung }, ...sp },
  variante: { compare_at_price: vergleich },
});
const streichpreis = async (product) => (await voll.parseAndRender("{% render 'tp-rabatt-sichtbar', product: product %}", { product })).trim();

test('Streichpreis: pruefbarer Beleg je Stueck', async () => {
  assert.equal(await streichpreis(mitBeleg()), 'ja');
  assert.equal(await streichpreis(mitBeleg({ beleg: 'regulaer 25,90 EUR/m2 x 9,40 m2' })), 'ja', 'Schreibweise mit EUR/m2 und x');
  assert.equal(await streichpreis(mitBeleg({ ursprung: rolle(2600) })), 'ja', 'Meterpreis unter dem aktuellen Preis ist zulaessig');
});

test('Streichpreis: nicht belegbare Faelle zeigen nichts', async () => {
  const faelle = {
    'nur ein Text': mitBeleg({ beleg: 'regulärer Preis' }),
    'Beleg aus einem anderen Stueck kopiert (andere Flaeche)': mitBeleg({ beleg: 'regulär 25,90 €/m² × 10,00 m²', vergleich: 25900 }),
    'Rechnung ergibt nicht den Vergleichspreis': mitBeleg({ vergleich: 29900 }),
    'Meterpreis ueber dem aktuellen Preis der Ware': mitBeleg({ ursprung: rolle(2290) }),
    'ohne Ursprungsprodukt': mitBeleg({ ursprung: null }),
    'Ursprung nur mit Wunschmass und Muster': mitBeleg({ ursprung: { ...rolle(), variants: rolle().variants.slice(1) } }),
    'Vergleichspreis nicht ueber dem Stueckpreis': mitBeleg({ beleg: 'regulär 0,90 €/m² × 9,40 m²', vergleich: 846 }),
  };
  for (const [fall, p] of Object.entries(faelle)) assert.equal(await streichpreis(p), '', fall);
});

test('Streichpreis: Ursprung als Paketware oder mit Preis je 0,01 m2', async () => {
  const paket = { type: 'Klickvinyl', title: 'Vinyl', tags: [], metafields: { custom: { qm_pro_paket: { value: 2.5 } } },
    variants: [{ title: 'Default Title', price: 6475, available: true, metafields: { custom: {} } }] };
  assert.equal(await streichpreis(mitBeleg({ ursprung: paket })), 'ja', '64,75 € / 2,5 m2 = 25,90 €/m2');
  const zentimeter = rolle(26, { metafields: { custom: { preis_pro_001_qm: { value: true } } } });
  assert.equal(await streichpreis(mitBeleg({ ursprung: zentimeter })), 'ja', '0,26 € je 0,01 m2 = 26,00 €/m2');
});
