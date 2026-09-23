import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { istMusterPosition } from '../../operations/lib/muster.mjs';

// Rendert das echte snippets/tp-muster-position.liquid und vergleicht das
// Ergebnis mit der Node-Regel: beide Seiten muessen dieselbe Antwort geben.
// Der doc-Block ist Shopify-eigen, LiquidJS kennt ihn nicht - er wird fuer den
// Test entfernt, die Logik bleibt unveraendert.
const root = path.resolve(import.meta.dirname, '../..');
const quelle = fs
  .readFileSync(path.join(root, 'snippets/tp-muster-position.liquid'), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/, '');
const engine = new Liquid();

const zeile = ({ sku = null, typ = null, musterId = null } = {}) => ({
  sku,
  properties: musterId ? { _Muster_ID: musterId } : {},
  product: { type: typ },
});

const faelle = [
  ['Konfigurator-Muster (Property)', { musterId: '60835668492622:sand-hell' }, true],
  ['Muster mit eigener Variante', { sku: 'M-TEPDOLCE4_004', typ: 'Musterservice' }, true],
  ['Muster, SKU klein geschrieben', { sku: 'm-tepdolce4_004' }, true],
  ['Sammelprodukt Altmodell', { sku: 'TP-MUSTER-000', typ: 'Musterservice' }, true],
  ['nur Produkttyp gesetzt', { typ: 'Musterservice' }, true],
  ['Teppichboden', { sku: 'TEPDOLCE4_004', typ: 'Teppichboden' }, false],
  ['Klickvinyl mit Dessin im Namen', { sku: 'NANTES-FG-01', typ: 'Klickvinyl' }, false],
  ['SKU faengt mit M an, ohne Bindestrich', { sku: 'MARANO-01', typ: 'Vinylboden' }, false],
  ['Sockelleiste', { sku: 'DOELLKEN-2251', typ: 'Sockelleiste' }, false],
  ['Kettelservice', { sku: 'SRV-KETTEL', typ: 'Service' }, false],
  ['ohne jede Angabe', {}, false],
];

for (const [name, daten, soll] of faelle) {
  test(`tp-muster-position: ${name} -> ${soll ? 'ja' : 'nein'}`, async () => {
    const line_item = zeile(daten);
    const html = (await engine.parseAndRender(quelle, { line_item })).trim();
    assert.equal(html, soll ? 'ja' : 'nein');
    // Node-Regel muss dasselbe sagen.
    assert.equal(
      istMusterPosition({ sku: daten.sku, musterId: daten.musterId, produktTyp: daten.typ }),
      soll,
      'operations/lib/muster.mjs weicht ab'
    );
  });
}

test('tp-muster-position gibt nur ja oder nein aus, ohne Umbrueche', async () => {
  const html = await engine.parseAndRender(quelle, { line_item: zeile({ sku: 'M-1' }) });
  assert.equal(html, 'ja');
});
