import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Regressionstest zur Mengensperre im Warenkorb (snippets/cart-products.liquid).
//
// Hintergrund: Berechnete Zeilen tragen ihr Mass in der Menge (ganze m2 bei
// Zuschnittware, Hundertstel-m2 bzw. Hundertstel-Meter bei Teppich nach Mass
// und Kettelservice). Wer die Menge im Warenkorb aendert, aendert den Preis,
// ohne dass sich die Massangaben in den Eigenschaften mitaendern. Die Sperre
// greift ueber drei datengetriebene Kennzeichen; faellt eines weg, ist eine
// Produktgruppe wieder offen. Genau das prueft dieser Test - und er haelt
// ausserdem fest, was die Sperre NICHT leistet (siehe letzter Test).

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const liquid = readFileSync(join(root, 'snippets', 'cart-products.liquid'), 'utf8');

// Der eine Liquid-Block, der can_update_quantity fuer berechnete Zeilen auf false setzt.
const block = liquid.match(/assign tp_cart_zuschnitt = false[\s\S]*?endif/);

test('die Mengensperre existiert als ein zusammenhaengender Liquid-Block', () => {
  assert.ok(block, 'Block "assign tp_cart_zuschnitt = false ... endif" fehlt');
});

const regeln = [
  ['Zuschnittware / Raummass', /item\.properties\['Gewünschte Länge'\] != blank/],
  ['Teppich nach Mass (custom.preis_pro_001_qm)', /item\.product\.metafields\.custom\.preis_pro_001_qm\.value/],
  ['Rechner-Zusatzzeilen wie Kettelservice (_Gruppe)', /item\.properties\['_Gruppe'\] != blank/],
];

for (const [name, muster] of regeln) {
  test(`Regel greift: ${name}`, () => {
    assert.match(block[0], muster);
  });
}

test('jede Regel setzt can_update_quantity auf false', () => {
  const treffer = block[0].match(/assign can_update_quantity = false/g) || [];
  assert.equal(treffer.length, regeln.length, 'jede Erkennungsregel braucht ihre eigene Sperrzuweisung');
});

test('keine Erkennung ueber Handle oder Produktnamen', () => {
  assert.doesNotMatch(block[0], /handle|product\.title|contains 'Kettel|contains "Kettel/i);
});

test('die Hauptzeile zeigt den Hinweis mit Link zurueck zur Produktseite', () => {
  assert.match(liquid, /if tp_cart_hauptzeile[\s\S]*?cart-items__zuschnitt-hinweis[\s\S]*?Menge ergibt sich aus dem Maß\.[\s\S]*?item\.url/);
});

// item.url einer Zusatzzeile (Kettelservice, Fussleiste, Haftunterlage) fuehrt zum
// Zusatzprodukt, nicht zum Rechner des Teppichs - dort darf kein "Mass aendern" stehen.
test('Zusatzzeilen bekommen den Hinweis ohne Link', () => {
  const zusatz = liquid.match(/elsif tp_cart_zuschnitt -%\}[\s\S]*?\{%- endif -%\}/);
  assert.ok(zusatz, 'Zweig fuer Zusatzzeilen fehlt');
  assert.match(zusatz[0], /Menge ergibt sich aus dem Maß des zugehörigen Teppichs/);
  assert.doesNotMatch(zusatz[0], /<a\s|item\.url/);
});

test('nur Hauptzeilen-Regeln setzen tp_cart_hauptzeile', () => {
  const treffer = block[0].match(/assign tp_cart_hauptzeile = true/g) || [];
  assert.equal(treffer.length, 2, 'Gewuenschte Laenge und preis_pro_001_qm sind Hauptzeilen, _Gruppe nicht');
});

// Bewusst dokumentierte Grenze: Die Sperre wirkt nur in der Bedienoberflaeche.
// Ein direkter POST auf /cart/change.js kann die Menge weiterhin aendern -
// eine serverseitige Sperre braucht eine Shopify Cart/Checkout-Validation-
// Function (eigene App-Extension) und ist eine Inhaberentscheidung. Der Test
// stellt sicher, dass diese Grenze im Code benannt bleibt und nicht als
// "vollstaendig behoben" verkauft wird.
test('die Grenze der UI-Sperre ist im Code dokumentiert', () => {
  assert.match(liquid, /\/cart\/change\.js/);
});
