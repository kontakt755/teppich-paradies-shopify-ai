import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Regressionstest zur Mengensperre im Warenkorb. Die Erkennung steht an genau
// einer Stelle, snippets/tp-cart-gruppe.liquid; snippets/cart-products.liquid
// rendert nur deren Teile. Frueher stand dieselbe Regel in beiden Dateien und
// lief auseinander (Merge #371).
//
// Hintergrund: Berechnete Zeilen tragen ihr Mass in der Menge (ganze m2 bei
// Zuschnittware, Hundertstel-m2 bzw. Hundertstel-Meter bei Teppich nach Mass
// und Kettelservice). Wer die Menge im Warenkorb aendert, aendert den Preis,
// ohne dass sich die Massangaben in den Eigenschaften mitaendern. Die Sperre
// greift ueber datengetriebene Kennzeichen; faellt eines weg, ist eine
// Produktgruppe wieder offen. Genau das prueft dieser Test - und er haelt
// ausserdem fest, was die Sperre NICHT leistet (siehe letzter Test).

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const snippet = readFileSync(join(root, 'snippets', 'tp-cart-gruppe.liquid'), 'utf8');
const cart = readFileSync(join(root, 'snippets', 'cart-products.liquid'), 'utf8');

// Die eine Bedingung, die eine Zeile als berechnet einstuft.
const block = snippet.match(/assign tp_gz_berechnet = false\s*\n\s*if ([^\n]+)\n\s*assign tp_gz_berechnet = true/);

test('die Klassifikation existiert als eine Bedingung im Snippet', () => {
  assert.ok(block, 'Bedingung "assign tp_gz_berechnet = false ... = true" fehlt');
});

const regeln = [
  ['Zuschnittware / Raummass (Gewuenschte Laenge)', /tp_gz_p\['Gewünschte Länge'\] != blank/],
  ['Teppich nach Mass (custom.preis_pro_001_qm)', /tp_gz_flaechenware/],
  ['Rechner-Zusatzzeilen wie Kettelservice (_Gruppe)', /tp_gz_gruppe != blank/],
  ['Service-Zeilen', /tp_gz_service/],
  ['Optionswert Wunschmass', /tp_gz_wunsch/],
];

for (const [name, muster] of regeln) {
  test(`Regel greift: ${name}`, () => {
    assert.match(block[1], muster);
  });
}

test('Flaechenware haengt am Metafeld custom.preis_pro_001_qm', () => {
  assert.match(snippet, /line_item\.product\.metafields\.custom\.preis_pro_001_qm\.value == true\s*\n\s*assign tp_gz_flaechenware = true/);
});

test('cart-products sperrt die Menge nur ueber das Ergebnis des Snippets', () => {
  assert.match(cart, /render 'tp-cart-gruppe', line_item: item, teil: 'berechnet'[\s\S]{0,120}?if tp_gz_berechnet contains 'ja'[\s\S]{0,80}?assign can_update_quantity = false/);
});

// Genau das war der Fehler: eine zweite, abweichende Regelkopie im Warenkorb.
test('cart-products klassifiziert nicht selbst', () => {
  assert.doesNotMatch(cart, /preis_pro_001_qm|item\.properties\[|tp_cart_zuschnitt|tp_cart_hauptzeile/);
});

test('keine Erkennung ueber Handle oder Produktnamen', () => {
  assert.doesNotMatch(block[1], /handle|product\.title|contains 'Kettel|contains "Kettel/i);
});

const hinweis = snippet.match(/elsif teil == 'mengenhinweis'[\s\S]*?\{%- elsif teil == 'hinweis' -%\}/);

test('cart-products rendert den Mengenhinweis aus dem Snippet', () => {
  assert.match(cart, /render 'tp-cart-gruppe', line_item: item, teil: 'mengenhinweis'/);
  assert.ok(hinweis, "Zweig teil == 'mengenhinweis' fehlt");
});

test('die Hauptzeile zeigt den Hinweis mit Link zurueck zur Produktseite', () => {
  const haupt = hinweis[0].slice(hinweis[0].indexOf('{%- else -%}'));
  assert.match(haupt, /Menge ergibt sich aus dem Maß\.[\s\S]*?line_item\.url/);
});

// line_item.url einer Zusatzzeile (Kettelservice, Fussleiste, Haftunterlage) fuehrt zum
// Zusatzprodukt, nicht zum Rechner des Teppichs - dort darf kein Link stehen.
test('Zusatzzeilen bekommen den Hinweis ohne Link', () => {
  const zusatz = hinweis[0].match(/if tp_gz_service -%\}[\s\S]*?\{%- else -%\}/);
  assert.ok(zusatz, 'Zweig fuer Zusatzzeilen fehlt');
  assert.match(zusatz[0], /Menge ergibt sich aus dem Maß des zugehörigen Teppichs/);
  assert.doesNotMatch(zusatz[0], /<a\s|line_item\.url/);
});

test('Waisen bekommen keinen Mengenhinweis, sondern ihre Warnung', () => {
  assert.match(snippet, /elsif teil == 'mengenhinweis' and tp_gz_berechnet and tp_gz_waise == blank/);
});

// Bewusst dokumentierte Grenze: Die Sperre wirkt nur in der Bedienoberflaeche.
// Ein direkter POST auf /cart/change.js kann die Menge weiterhin aendern -
// eine serverseitige Sperre braucht eine Shopify Cart/Checkout-Validation-
// Function (eigene App-Extension) und ist eine Inhaberentscheidung. Der Test
// stellt sicher, dass diese Grenze im Code benannt bleibt und nicht als
// "vollstaendig behoben" verkauft wird.
test('die Grenze der UI-Sperre ist im Code dokumentiert', () => {
  assert.match(snippet, /\/cart\/change\.js/);
  assert.match(cart, /\/cart\/change\.js/);
});
