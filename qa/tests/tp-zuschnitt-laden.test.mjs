import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

// Hersteller-Direktbezug (Inhaber 2026-11-04): Zuschnitt auf Raumbreite im Laden,
// volle Rollenbreite bezahlt, Reststreifen bleibt im Laden. Das muss vor dem Kauf
// auf der Produktseite stehen - und nur bei Produkten mit Tag "zuschnitt-laden".
const root = path.resolve(import.meta.dirname, '../..');
const quelle = fs.readFileSync(path.join(root, 'blocks/tp-zuschnitt-laden.liquid'), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/, '')
  .replace(/{%-?\s*stylesheet\s*-?%}[\s\S]*?{%-?\s*endstylesheet\s*-?%}/, '')
  .replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/, '');
const engine = new Liquid();
const render = (tags, lieferzeit) => engine.parseAndRender(quelle, {
  product: { tags, metafields: { service: { lieferzeit: lieferzeit ? { value: lieferzeit } : undefined } } },
  block: { settings: { titel: 'Kostenloser Zuschnitt in unserem Laden' }, shopify_attributes: '' },
});

test('mit Tag: Zuschnitt, volle Rollenbreite, Reststreifen und Abstimmung stehen da', async () => {
  const html = await render(['art: teppichboden', 'zuschnitt-laden'], '5–7 Werktage');
  assert.match(html, /Kostenloser Zuschnitt in unserem Laden/);
  assert.match(html, /volle Rollenbreite/);
  assert.match(html, /Reststreifen bleibt bei uns/);
  assert.match(html, /nach der Bestellung mit Ihnen ab/);
  assert.match(html, /Lieferzeit: 5–7 Werktage\./);
});

test('ohne belegte Lieferzeit kein Lieferzeit-Satz; ohne Tag gar nichts', async () => {
  assert.doesNotMatch(await render(['zuschnitt-laden'], null), /Lieferzeit/);
  assert.equal((await render(['art: teppichboden'], '5–7 Werktage')).trim(), '');
});

test('die Rollenware-Vorlage zeigt den Hinweis direkt nach dem Rechner', () => {
  const t = JSON.parse(fs.readFileSync(path.join(root, 'templates/product.rolle.json'), 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
  const order = t.sections.main.blocks['product-details'].block_order;
  assert.equal(order[order.indexOf('tp_rollware_rechner_sales1') + 1], 'tp_zuschnitt_laden');
});
