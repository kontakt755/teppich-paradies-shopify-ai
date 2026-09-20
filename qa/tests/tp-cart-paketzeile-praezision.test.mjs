// TP-008: der Warenkorb rechnete die Paketfläche immer auf Hundertstel
// (× 100 | round, dann ganz/rest aus 100), unabhängig davon, wie viele
// Nachkommastellen das custom.qm_pro_paket-Metafeld tatsächlich führt. Ein
// dreistelliges Metafeld (0,794 m²) verlor dadurch beim Wechsel von der
// Produktseite in den Warenkorb seine dritte Stelle (16 × 1,892 m² zeigte
// 30,27 statt 30,272 m²), obwohl Menge und Preis stimmten.
//
// Rendert das echte snippets/tp-cart-paketzeile.liquid mit LiquidJS. LiquidJS'
// eingebauter divided_by-Filter macht - anders als Shopifys reales Liquid -
// KEINE Ganzzahldivision bei zwei Integer-Operanden, sondern immer
// Gleitkommadivision; deshalb wird hier derselbe divided_by-Shim registriert
// wie in audit/scripts/reproduce-package-contracts.mjs, um Shopifys
// tatsächliches Verhalten (Integer/Integer -> Integer) nachzubilden. Kein
// Netzwerk, kein Shopify-Zugriff.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const snippetFile = 'snippets/tp-cart-paketzeile.liquid';
let source = readFileSync(path.join(root, snippetFile), 'utf8');
source = source.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
source = source.slice(0, source.indexOf('{% stylesheet %}'));

const engine = new Liquid();
engine.registerFilter('divided_by', (a, b) => Math.floor(Number(a) / Number(b)));

function lineItem({ qmProPaket, menge, stueckProPaket = null, stueckBezeichnung = '', formatCm = '' }) {
  return {
    quantity: menge,
    product: {
      metafields: {
        custom: {
          qm_pro_paket: { value: qmProPaket },
          stueck_pro_paket: { value: stueckProPaket },
          stueck_bezeichnung: { value: stueckBezeichnung },
          format_cm: { value: formatCm },
        },
      },
    },
  };
}

async function render(o) {
  const html = await engine.parseAndRender(source, { line_item: lineItem(o) });
  const flaeche = html.match(/Gesamtfläche: ([\d,]+)/)?.[1] ?? null;
  const stueck = html.match(/<span>(\d+) ([^<]+?)(?:<\/span>|à)/)?.[0] ?? null;
  return { flaeche, stueck, html };
}

test('TP-008: dreistelliges Paketmetafeld behält seine Präzision im Warenkorb', async () => {
  assert.equal((await render({ qmProPaket: 0.794, menge: 1 })).flaeche, '0,794');
  assert.equal((await render({ qmProPaket: 0.794, menge: 2 })).flaeche, '1,588');
  assert.equal((await render({ qmProPaket: 1.892, menge: 16 })).flaeche, '30,272');
});

test('Regression: zweistellige/glatte Paketmetafelder bleiben unverändert', async () => {
  assert.equal((await render({ qmProPaket: 5, menge: 4 })).flaeche, '20,00');
  assert.equal((await render({ qmProPaket: 3.34, menge: 6 })).flaeche, '20,04');
  assert.equal((await render({ qmProPaket: 2.2, menge: 5 })).flaeche, '11,00');
});

test('Regression: Quadra-Preisfixture (4 Pakete, 80 Fliesen, 20,00 m²)', async () => {
  const result = await render({ qmProPaket: 5, menge: 4, stueckProPaket: 20, stueckBezeichnung: 'Fliesen' });
  assert.equal(result.flaeche, '20,00');
  assert.match(result.html, /80 Fliesen/);
});

test('Regression: Klebevinyl-Fixture (6 Pakete, 20,04 m²)', async () => {
  const result = await render({ qmProPaket: 3.34, menge: 6 });
  assert.equal(result.flaeche, '20,04');
});

test('nach echter Mengenänderung im Warenkorb wird aus der neuen Menge neu gerechnet, keine eingefrorene alte Fläche', async () => {
  // Gleiches Metafeld, unterschiedliche Zeilenmenge - die Rechnung folgt
  // ausschliesslich line_item.quantity x custom.qm_pro_paket, nie einer beim
  // Hinzufuegen gespeicherten Property (siehe Doc-Kommentar der Datei).
  assert.equal((await render({ qmProPaket: 1.892, menge: 1 })).flaeche, '1,892');
  assert.equal((await render({ qmProPaket: 1.892, menge: 2 })).flaeche, '3,784');
  assert.equal((await render({ qmProPaket: 1.892, menge: 16 })).flaeche, '30,272');
});
