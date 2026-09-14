import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

// Berechnete Warenkorbzeilen: Erkennung, Gruppenbindung, Waisen und
// Kundeneinheit. Browser-Skript (UMD an globalThis) - einmal laden.
createRequire(import.meta.url)('../../assets/tp-cart-gruppen.js');
const G = globalThis.TPCartGruppen;

const root = path.resolve(import.meta.dirname, '../..');
const lies = (datei) => fs.readFileSync(path.join(root, datei), 'utf8');

// Zeilen so, wie Rollenrechner (blocks/tp-rollware-rechner.liquid) und
// Einfass-Konfigurator (assets/tp-einfass-konfigurator.js) sie schreiben.
const meterware = (g) => ({
  key: 'm1', titel: 'Piumera Teppichboden 400cm 500cm', quantity: 17, preisPro001Qm: false, optionen: ['Sand Hell', '400cm'],
  properties: { 'Art': 'Meterware', 'Rollenbreite': '400 cm', 'Gewünschte Länge': '420 cm', 'Fläche (aufgerundet)': '17 m²', 'Farbnummer': '004', ...(g ? { _Gruppe: g } : {}) },
});
const raummass = () => ({
  key: 'r1', titel: 'Piumera Teppichboden 400cm 500cm', quantity: 12, preisPro001Qm: false, optionen: ['Sand Hell', 'Wunschmaß'],
  properties: { 'Art': 'Raummaß', 'Ihre Breite': '352 cm', 'Aus Rolle': '400 cm', 'Gewünschte Länge': '463 cm', 'Fläche (aufgerundet)': '17 m²' },
});
const fussleiste = (g) => ({
  key: 'f1', titel: 'Teppich-Fußleiste gekettelt', quantity: 19, preisPro001Qm: false, optionen: ['6 cm'], typ: 'Service',
  properties: { 'Zu Teppichboden': 'Piumera Teppichboden 400cm 500cm', 'Farbe wie Teppichboden': 'Sand Hell', 'Höhe': '6 cm', 'Länge': '19 m', _Gruppe: g },
});
const haft = (g) => ({
  key: 'h1', titel: 'Antirutsch-Unterlage', quantity: 5, preisPro001Qm: false, optionen: ['200 cm'],
  properties: { 'Zu Teppichboden': 'Piumera Teppichboden 400cm 500cm', 'Ausführung': '200 cm', 'Bahnen': '2', _Gruppe: g },
});
const mass = (g, extra = {}) => ({
  key: 't1', titel: 'Piumera Teppich nach Maß', quantity: 600, preisPro001Qm: true, optionen: ['Sand Hell'],
  properties: { 'Einfassung': 'Gekettelt', 'Form': 'Rechteck', 'Maße': '200 × 300 cm', 'Fläche (abgerechnet)': '6,00 m²', 'Kante umlaufend': '10,00 m', 'Farbnummer': '004', 'Garn': 'Ton in Ton', '_Zuschnitt aus Rolle': '400 cm', ...(g ? { _Gruppe: g } : {}), ...extra },
});
const kettel = (g) => ({
  key: 'k1', titel: 'Kettelservice', quantity: 1000, preisPro001Qm: false, optionen: ['je 0,01 laufender Meter'], typ: 'Service',
  properties: { 'Zu Teppich': 'Piumera Teppich nach Maß', 'Farbe': 'Sand Hell', 'Kante umlaufend': '10,00 m', ...(g ? { _Gruppe: g } : {}) },
});
const stueck = () => ({ key: 's1', titel: 'Schwelle', quantity: 2, preisPro001Qm: false, optionen: ['Default Title'], properties: {} });

test('A: berechnete Zeilen werden datengetrieben erkannt, Stueckware nicht', () => {
  assert.equal(G.istBerechnet(meterware()), true, 'Art Meterware');
  assert.equal(G.istBerechnet(raummass()), true, 'Art Raummass');
  assert.equal(G.istBerechnet(mass()), true, 'preis_pro_001_qm');
  assert.equal(G.istBerechnet(kettel('K1')), true, '_Gruppe');
  assert.equal(G.istBerechnet(kettel()), true, 'Zu Teppich ohne Gruppe');
  assert.equal(G.istBerechnet(fussleiste('T1')), true, 'Zu Teppichboden');
  // Wunschmass-Variante ohne Rechner (direkt per /cart/add.js)
  assert.equal(G.istBerechnet({ key: 'w', quantity: 1, optionen: ['Sand Hell', 'Wunschmaß'], properties: {} }), true);
  assert.equal(G.istBerechnet(stueck()), false);
  assert.equal(G.istBerechnet(null), false);
});

test('B: Service-Zeile vs Hauptzeile - Teppich mit Kante ist keine Service-Zeile', () => {
  assert.equal(G.istService(mass('K1')), false, 'Hauptzeile traegt Masse');
  assert.equal(G.istService(kettel('K1')), true);
  assert.equal(G.istService(fussleiste('T1')), true);
  assert.equal(G.istService(haft('T1')), true);
  assert.equal(G.istService(meterware('T1')), false);
});

test('C: Kundeneinheit aus den Properties, Fallback Stueckzahl, nie ein Preis', () => {
  assert.equal(G.kundeneinheit(meterware()), '17 m²');
  assert.equal(G.kundeneinheit(mass()), '6,00 m²');
  assert.equal(G.kundeneinheit(mass('K1', { Mindestpreis: 'angewendet', 'Fläche (abgerechnet)': '0,25 m²' })), '0,25 m² (Mindestpreis)');
  assert.equal(G.kundeneinheit(kettel('K1')), '10,00 m Kettelkante');
  assert.equal(G.kundeneinheit(fussleiste('T1')), '19 m Fußleiste');
  assert.equal(G.kundeneinheit(haft('T1')), '5 lfm (2 Bahnen)');
  assert.equal(G.kundeneinheit({ key: 'x', quantity: 3, properties: { _Gruppe: 'T1' } }), '3 Stück');
  for (const z of [meterware(), mass(), kettel('K1'), fussleiste('T1'), haft('T1')]) {
    assert.doesNotMatch(G.kundeneinheit(z), /€/);
  }
});

test('D: Gruppen - Hauptzeile ist die Zeile ohne Service-Property, Hinweis nennt sie', () => {
  const zeilen = [stueck(), mass('K1'), kettel('K1'), meterware('T1'), fussleiste('T1'), haft('T1')];
  const grps = G.gruppen(zeilen);
  assert.deepEqual(Object.keys(grps).sort(), ['K1', 'T1']);
  assert.equal(grps.K1.haupt.key, 't1');
  assert.equal(grps.K1.mitglieder.length, 2);
  assert.equal(grps.T1.haupt.key, 'm1');
  assert.equal(grps.T1.mitglieder.length, 3);
  assert.equal(G.gruppenHinweis(kettel('K1'), zeilen), 'Gehört zu Piumera Teppich nach Maß; wird gemeinsam entfernt');
  assert.equal(G.gruppenHinweis(fussleiste('T1'), zeilen), 'Gehört zu Piumera Teppichboden 400cm 500cm; wird gemeinsam entfernt');
  assert.equal(G.gruppenHinweis(mass('K1'), zeilen), '', 'Hauptzeile bekommt keinen Hinweis');
  assert.equal(G.gruppenHinweis(stueck(), zeilen), '');
});

test('E: Loeschen einer Gruppenzeile entfernt alle Zeilen der Gruppe, egal von welcher Seite', () => {
  const zeilen = [stueck(), mass('K1'), kettel('K1'), meterware('T1'), fussleiste('T1'), haft('T1')];
  assert.deepEqual(G.zuEntfernen(mass('K1'), zeilen).sort(), ['k1', 't1']);
  assert.deepEqual(G.zuEntfernen(kettel('K1'), zeilen).sort(), ['k1', 't1']);
  assert.deepEqual(G.zuEntfernen(fussleiste('T1'), zeilen).sort(), ['f1', 'h1', 'm1']);
  assert.deepEqual(G.zuEntfernen(stueck(), zeilen), ['s1'], 'ohne Gruppe nur die Zeile selbst');
  assert.deepEqual(G.updateBody(['k1', 't1']), { updates: { k1: 0, t1: 0 } });
});

test('F: Waisen - Service ohne Hauptzeile, Service ohne Gruppe, Flaechenware ohne Mass', () => {
  assert.deepEqual(G.waisen([stueck(), mass('K1'), kettel('K1'), meterware('T1'), fussleiste('T1')]), [], 'vollstaendige Gruppen sind keine Waisen');

  // T17: Teppich geloescht, Kettelservice bleibt
  const w1 = G.waisen([kettel('K1')]);
  assert.equal(w1.length, 1);
  assert.equal(w1[0].grund, G.GRUND.GRUPPE_OHNE_HAUPT);
  assert.match(w1[0].text, /nicht mehr im Warenkorb/);

  // T17 umgekehrt: Kettelservice geloescht, Teppich "Gekettelt" bleibt - keine
  // Waise im Sinne der Sperre (Hauptzeile ist vollstaendig), aber die
  // Gruppenbindung verhindert diesen Zustand beim Loeschen im Theme (Test E).
  assert.deepEqual(G.waisen([mass('K1')]), []);

  // T18: Kettelservice direkt per /cart/add.js ohne Gruppe
  const w2 = G.waisen([kettel()]);
  assert.equal(w2[0].grund, G.GRUND.SERVICE_OHNE_GRUPPE);
  assert.match(w2[0].text, /Maßangabe/);
  // ... und ganz ohne Properties: nur der Produkttyp "Service" verraet die Zeile
  const roh = { key: 'k0', titel: 'Kettelservice', quantity: 1, optionen: ['je 0,01 laufender Meter'], typ: 'Service', properties: {} };
  assert.equal(G.istService(roh), true);
  assert.equal(G.waisen([roh])[0].grund, G.GRUND.SERVICE_OHNE_GRUPPE);
  assert.equal(G.kundeneinheit(roh), '1 Stück');
  // Stueckware bleibt Stueckware, auch mit anderem Typ
  assert.equal(G.istService({ ...stueck(), typ: 'Zubehör' }), false);

  // T18: Mass-Produkt ohne Masse (nur Variante) und Wunschmass-Variante ohne Breite
  const w3 = G.waisen([{ key: 'x', quantity: 1, preisPro001Qm: true, optionen: ['Sand Hell'], properties: {} }]);
  assert.equal(w3[0].grund, G.GRUND.OHNE_MASS);
  const w4 = G.waisen([{ key: 'y', quantity: 1, preisPro001Qm: false, optionen: ['Sand Hell', 'Wunschmaß'], properties: {} }]);
  assert.equal(w4[0].grund, G.GRUND.OHNE_MASS);

  // Fussleiste allein (Teppichboden geloescht)
  assert.equal(G.waisen([fussleiste('T1')])[0].grund, G.GRUND.GRUPPE_OHNE_HAUPT);
});

test('G: Checkout-Sperre nur bei Waisen', () => {
  assert.equal(G.checkoutGesperrt([stueck(), meterware('T1'), fussleiste('T1')]), false);
  assert.equal(G.checkoutGesperrt([stueck(), kettel('K1')]), true);
  assert.equal(G.checkoutGesperrt([]), false);
});

test('H: Liquid-Seite kennt dieselben Property-Namen und Texte wie das JS', () => {
  const liquid = lies('snippets/tp-cart-gruppe.liquid');
  for (const key of ['_Gruppe', 'Zu Teppich', 'Zu Teppichboden', 'Kante umlaufend', 'Maße', 'Fläche (abgerechnet)', 'Fläche (aufgerundet)', 'Ihre Breite', 'Rollenbreite', 'Länge', 'Höhe', 'Bahnen', 'Mindestpreis']) {
    assert.ok(liquid.includes(key), `Liquid kennt ${key}`);
  }
  assert.ok(liquid.includes('preis_pro_001_qm'));
  assert.ok(liquid.includes("product.type == 'Service'"), 'Service-Typ als Signal fuer rohe Service-Zeilen');
  for (const text of Object.values(G.TEXT)) {
    assert.ok(liquid.includes(text), `Liquid kennt Text: ${text}`);
  }
  assert.ok(liquid.includes('wird gemeinsam entfernt'));
  assert.ok(liquid.includes('data-tp-cart-gesperrt'), 'Sperrmarke fuer JS/CSS');
  assert.match(liquid, /name="updates\[\]"/, 'feste Menge bleibt im Formular an ihrer Position');
});

test('I: cart-products.liquid bindet Sperre, Menge und Hinweis ein; Mengenwaehler bleibt im Formular', () => {
  const produkte = lies('snippets/cart-products.liquid');
  assert.match(produkte, /\{%-?\s*capture tp_gz_berechnet\s*-?%\}\{%-?\s*render 'tp-cart-gruppe', line_item: item, teil: 'berechnet'\s*-?%\}\{%-?\s*endcapture\s*-?%\}/);
  assert.match(produkte, /render 'tp-cart-gruppe', line_item: item, teil: 'menge'/);
  assert.match(produkte, /render 'tp-cart-gruppe', line_item: item, teil: 'hinweis'/);
  assert.match(produkte, /render 'tp-cart-gruppe', teil: 'sperre'/);
  assert.match(produkte, /tp-cart-gruppen\.js/, 'Logik-Asset wird geladen');
  // PR #200 (Flaechenware je Zeile 1) verlangt, dass cart-products.liquid selbst
  // nicht auf preis_pro_001_qm verzweigt - das bleibt im Snippet.
  assert.doesNotMatch(produkte, /preis_pro_001_qm/);
  // Der Mengentext steht nach dem Mengenwaehler; der Waehler selbst bleibt.
  assert.ok(produkte.indexOf("render 'quantity-selector'") < produkte.indexOf("teil: 'menge'"));
});

test('J: component-cart-items.js loescht Gruppen ueber /cart/update.js und sperrt den Checkout', () => {
  const js = lies('assets/component-cart-items.js');
  assert.match(js, /Theme\.routes\.cart_update_url/);
  assert.match(js, /TPCartGruppen/);
  assert.match(js, /data-tp-gruppe/);
  assert.match(js, /data-tp-cart-gesperrt/);
  assert.match(js, /\.cart__checkout-button/);
});
