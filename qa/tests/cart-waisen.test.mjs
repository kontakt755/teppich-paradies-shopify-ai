import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Waisen im Warenkorb: Ein Service ohne seinen Teppich (z. B. Kettelung, nachdem
// die Teppichzeile geloescht wurde) blieb allein stehen und war bestellbar -
// 190 EUR fuer die Kante eines Teppichs, den niemand kauft. snippets/
// tp-cart-gruppe.liquid erkennt das serverseitig und sperrt den Checkout.
//
// Liquid laesst sich hier nicht ausfuehren; geprueft werden die Regeln als
// Struktur. Das gerenderte Verhalten steht im PR-Beleg (Arbeitstheme).

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const snippet = readFileSync(join(root, 'snippets', 'tp-cart-gruppe.liquid'), 'utf8');
const cart = readFileSync(join(root, 'snippets', 'cart-products.liquid'), 'utf8');

test('das Snippet kennt genau die zwei benutzten Teile', () => {
  assert.match(snippet, /\{%- if teil == 'hinweis' -%\}/);
  assert.match(snippet, /\{%- elsif teil == 'sperre' and tp_gz_gesperrt -%\}/);
  // Die ungenutzten Zweige der Vorlage sind entfernt - kein toter Code.
  assert.doesNotMatch(snippet, /teil == 'berechnet'|teil == 'menge'/);
});

test('cart-products bindet beide Teile ein', () => {
  assert.match(cart, /render 'tp-cart-gruppe', line_item: item, teil: 'hinweis'/);
  assert.match(cart, /render 'tp-cart-gruppe', teil: 'sperre'/);
});

const serviceRegeln = [
  ['Zu Teppich / Zu Teppichboden', /\['Zu Teppich'\] != blank or tp_gz_p\['Zu Teppichboden'\] != blank/],
  ['Kante umlaufend ohne eigene Masse', /\['Kante umlaufend'\] != blank and tp_gz_p\['Maße'\] == blank/],
  ['Produkttyp Service', /line_item\.product\.type == 'Service'/],
];
for (const [name, muster] of serviceRegeln) {
  test(`Service wird erkannt an: ${name}`, () => assert.match(snippet, muster));
}

test('Waise: Service mit Gruppe, aber ohne Hauptzeile', () => {
  assert.match(snippet, /if tp_gz_gruppe != blank and tp_gz_service and tp_gz_haupt_titel == blank\s*\n\s*assign tp_gz_waise = 'Dieser Service gehört zu einem Artikel, der nicht mehr im Warenkorb ist/);
});

test('Waise: Service ganz ohne Gruppe', () => {
  assert.match(snippet, /elsif tp_gz_gruppe == blank and tp_gz_service\s*\n\s*assign tp_gz_waise =/);
});

test('Waise: Flaechenware oder Wunschmass ohne Massangabe', () => {
  assert.match(snippet, /elsif tp_gz_hat_mass == false\s*\n\s*if tp_gz_flaechenware or tp_gz_wunsch\s*\n\s*assign tp_gz_waise =/);
});

// Fail safe: Die Sperre haengt nicht an JavaScript. Der Kasse-Knopf ist ein
// submit auf das Warenkorbformular; ein leeres Pflichtfeld darin blockiert die
// Absendung auch dann, wenn kein Skript laeuft.
test('die Sperre blockiert ohne JavaScript', () => {
  const sperre = snippet.match(/elsif teil == 'sperre'[\s\S]*?\{%- endif -%\}/);
  assert.ok(sperre, 'Sperr-Zweig fehlt');
  assert.match(sperre[0], /name="tp_cart_sperre"/);
  assert.match(sperre[0], /\brequired\b/);
  assert.match(sperre[0], /role="alert"/);
});

test('die Sperre steht im Warenkorbformular, nicht daneben', () => {
  const form = cart.match(/<form[\s\S]*?<\/form>/);
  assert.ok(form, 'Warenkorbformular nicht gefunden');
  assert.match(form[0], /render 'tp-cart-gruppe', teil: 'sperre'/);
});

test('die Sperre nennt den Grund im Text', () => {
  assert.match(snippet, /Bestellung nicht möglich: \{\{ tp_gz_sperr_text \}\}/);
});

// Der Hinweis an der Zusatzzeile darf nichts versprechen, was nicht passiert:
// gemeinsames Loeschen ist NICHT umgesetzt (dafuer braeuchte es den
// JS-Umbau aus PR #288).
test('der Gruppenhinweis verspricht kein gemeinsames Entfernen', () => {
  assert.match(snippet, /Gehört zu \{\{ tp_gz_haupt_titel \| escape \}\}/);
  assert.doesNotMatch(snippet, /gemeinsam entfernt/);
});
