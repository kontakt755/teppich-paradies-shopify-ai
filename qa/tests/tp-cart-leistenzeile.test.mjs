// Shop-Analyse 13.10.2026 (P2/P3 Leisten): der Warenkorb zeigte bei
// Sockelleisten nur die Stueckzahl, nicht die bestellte Gesamtlaenge.
// Rendert das echte snippets/tp-cart-leistenzeile.liquid mit LiquidJS
// (divided_by-Shim wie in tp-cart-paketzeile-praezision.test.mjs:
// Shopify teilt Ganzzahl durch Ganzzahl ganzzahlig).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let source = readFileSync(path.join(root, 'snippets/tp-cart-leistenzeile.liquid'), 'utf8');
source = source.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');

const engine = new Liquid();
engine.registerFilter('divided_by', (a, b) => Math.floor(Number(a) / Number(b)));

async function zeile({ stange, menge, qmProPaket = null }) {
  const html = await engine.parseAndRender(source, {
    line_item: { quantity: menge, product: { metafields: { custom: {
      stangenlaenge: { value: stange }, qm_pro_paket: { value: qmProPaket },
    } } } },
  });
  return html.match(/cart-items__paket-menge">([^<]+)</)?.[1].replace(/&nbsp;/g, ' ') ?? null;
}

test('Befund: 8 Leisten à 2,5 m = 20 m', async () => {
  assert.equal(await zeile({ stange: 2.5, menge: 8 }), '8 Leisten = 20 m');
});

test('Einzahl und Nachkommastellen', async () => {
  assert.equal(await zeile({ stange: 2.5, menge: 1 }), '1 Leiste = 2,5 m');
  assert.equal(await zeile({ stange: 5.15, menge: 3 }), '3 Leisten = 15,45 m');
  assert.equal(await zeile({ stange: 2.4, menge: 7 }), '7 Leisten = 16,8 m');
  assert.equal(await zeile({ stange: 2.01, menge: 3 }), '3 Leisten = 6,03 m');
});

test('ohne belegte Laenge oder bei Paketware keine Zeile', async () => {
  assert.equal(await zeile({ stange: null, menge: 8 }), null);
  assert.equal(await zeile({ stange: 0, menge: 8 }), null);
  assert.equal(await zeile({ stange: 2.5, menge: 8, qmProPaket: 1.988 }), null);
});
