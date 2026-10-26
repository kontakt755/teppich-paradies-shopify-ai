import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { Liquid } from 'liquidjs';
const root = path.resolve(import.meta.dirname, '../..');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerTag('doc', { parse(token, tokens) { while(tokens.length) { if(tokens.shift().name === 'enddoc') break; } }, render() { return ''; } });
const source = fs.readFileSync(path.join(root, 'snippets/tp-cart-versandhinweis.liquid'), 'utf8');
const item = (opts = {}) => ({ sku: opts.sample ? 'M-123' : 'B123', properties: {}, variant: {metafields:{custom:{rollenbreite:{value:opts.roll ?? null}}}}, product:{type: 'Teppich',metafields:{custom:{qm_pro_paket:{value:opts.pack ?? null}}}} });
const render = (items, total, threshold=50) => engine.parseAndRender(source,{cart:{items,total_price:total},settings:{tp_versand_frei_ab:threshold},pages:{}});
test('Kostenhinweis gilt auch fuer Teppiche ohne Speditionsmerkmale', async()=>{
  const out=await render([item()],5000);
  assert.match(out,/Versandkostenfrei in Deutschland\./);
  assert.doesNotMatch(out,/Bordsteinkante/);
});
test('Schwelle folgt dem rabattierten Gesamtbetrag und der Theme-Einstellung',async()=>{
  assert.match(await render([item()],4999),/ab 50 € Bestellwert/);
  assert.match(await render([item()],5000),/Versandkostenfrei in Deutschland\./);
  assert.match(await render([item()],5000,75),/ab 75 € Bestellwert/);
});
test('Nur echte Waren erzeugen den Speditionshinweis, auch bei Variantenbreite',async()=>{
  assert.match(await render([item({roll:4})],6000),/Bordsteinkante/);
  assert.match(await render([item({pack:3.34})],6000),/Bordsteinkante/);
  const samples=await render([item({sample:true,roll:4})],0);
  assert.match(samples,/Kostenloser Musterversand/);
  assert.doesNotMatch(samples,/Bordsteinkante|ab 50/);
  assert.match(await render([item({sample:true}),item()],4000),/ab 50/);
});
test('Leerer Warenkorb enthaelt keine Versandzusage',async()=>assert.equal((await render([],0)).trim(),''));
// Rundgang 2026-10-26 (#17): unter der Schwelle Versandbetrag und Rest zeigen,
// beides aus den Theme-Einstellungen. Reine Musterkoerbe bleiben kostenlos.
const renderPreis = (items, total, preis = '4,99 €') => engine.parseAndRender(source, { cart: { items, total_price: total }, settings: { tp_versand_frei_ab: 50, tp_versand_preis: preis }, pages: {} });
test('unter der Schwelle: Versandbetrag und Rest bis versandkostenfrei', async () => {
  engine.registerFilter('money', (cent) => (cent / 100).toFixed(2).replace('.', ',') + ' €');
  const out = (await renderPreis([item()], 1790)).replace(/\s+/g, ' ');
  assert.match(out, /Versand 4,99 €, noch 32,10 € bis versandkostenfrei/);
  assert.match(out, /ab 50 € Bestellwert/);
  assert.match(await renderPreis([item()], 5000), /Versandkostenfrei in Deutschland\./);
  const muster = await renderPreis([item({ sample: true })], 0);
  assert.match(muster, /Kostenloser Musterversand/);
  assert.doesNotMatch(muster, /4,99|noch/);
});
