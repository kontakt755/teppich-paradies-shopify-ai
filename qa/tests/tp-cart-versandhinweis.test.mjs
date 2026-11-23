import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { Liquid } from 'liquidjs';
const root = path.resolve(import.meta.dirname, '../..');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerTag('doc', { parse(token, tokens) { while(tokens.length) { if(tokens.shift().name === 'enddoc') break; } }, render() { return ''; } });
engine.registerTag('stylesheet', { parse(token, tokens) { while(tokens.length) { if(tokens.shift().name === 'endstylesheet') break; } }, render() { return ''; } });
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
  assert.match(samples,/Musterversand innerhalb Deutschlands: 4,99 €/);
  assert.doesNotMatch(samples,/Bordsteinkante|ab 50/);
  assert.match(await render([item({sample:true}),item()],4000),/ab 50/);
});
test('Leerer Warenkorb enthaelt keine Versandzusage',async()=>assert.equal((await render([],0)).trim(),''));
// Rundgang 2026-10-26 (#17): unter der Schwelle Versandbetrag und Rest zeigen,
// beides aus den Theme-Einstellungen. Reine Musterkoerbe zeigen den Musterversand 4,99 € (Mustergebuehr-Test ab 01.12.2026).
const renderPreis = (items, total, preis = '4,99 €') => engine.parseAndRender(source, { cart: { items, total_price: total }, settings: { tp_versand_frei_ab: 50, tp_versand_preis: preis }, pages: {} });
test('unter der Schwelle: Versandbetrag und Rest bis versandkostenfrei', async () => {
  engine.registerFilter('money', (cent) => (cent / 100).toFixed(2).replace('.', ',') + ' €');
  const out = (await renderPreis([item()], 1790)).replace(/\s+/g, ' ');
  assert.match(out, /Versand 4,99 €, noch 32,10 € bis versandkostenfrei/);
  assert.match(out, /ab 50 € Bestellwert/);
  assert.match(await renderPreis([item()], 5000), /Versandkostenfrei in Deutschland\./);
  const muster = await renderPreis([item({ sample: true })], 0);
  assert.match(muster, /Musterversand innerhalb Deutschlands: 4,99 €\.<\/strong> Ab 150 € Warenwert angerechnet\./);
  assert.doesNotMatch(muster, /noch|bis versandkostenfrei/);
});

// Herstellermuster (Inhaber 21.11.2026): kostenlos nur, wenn alle Musterzeilen vom Hersteller kommen.
const hm = (handle, vendor = 'TeppichParadies') => ({ sku: 'M-X', properties: {}, variant: { metafields: { custom: { rollenbreite: { value: null } } } }, product: { type: 'Musterservice', handle, vendor, tags: [], metafields: { custom: { qm_pro_paket: { value: null } } } } });
test('Warenkorb: nur Herstellermuster kostenlos, gemischt einmal 4,99 €, nur andere wie bisher', async () => {
  const nur = await renderPreis([hm('muster-jab-x', 'JAB Anstoetz'), hm('muster-arvessa-teppichboden-400cm')], 0);
  assert.match(nur, /Muster kostenlos inklusive Versand, direkt vom Hersteller/);
  assert.doesNotMatch(nur, /4,99|angerechnet/);
  const gemischt = await renderPreis([hm('muster-vw-x', 'Vorwerk'), hm('muster-nicht-h-400cm')], 0);
  assert.match(gemischt.replace(/\s+/g, ' '), /Herstellermuster kostenlos, die übrigen Muster zusammen 4,99 € Versand\.<\/strong> Ab 150 € Warenwert angerechnet/);
  assert.match(await renderPreis([hm('muster-nicht-h-400cm')], 0), /Musterversand innerhalb Deutschlands: 4,99 €/);
  const sonder = { ...hm('muster-vw-x', 'Vorwerk') }; sonder.product = { ...sonder.product, tags: ['sonderposten'] };
  assert.match(await renderPreis([sonder], 0), /Musterversand innerhalb Deutschlands: 4,99 €/);
});
