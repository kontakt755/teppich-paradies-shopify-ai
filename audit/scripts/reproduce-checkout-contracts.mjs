// S13 local checkout contract; no browser access or requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Liquid } from 'liquidjs';
const read = f => fs.readFileSync(f,'utf8');
const files = ['snippets/cart-summary.liquid','snippets/cart-products.liquid','snippets/header-actions.liquid','snippets/tp-cart-gruppe.liquid'];
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes = files.map(file => { const sha256 = createHash('sha256').update(read(file)).digest('hex'); assert.equal(sha256,manifest.files[file].live.sha256); return {file,sha256}; });
const summary = read(files[0]), products = read(files[1]), header = read(files[2]), group = read(files[3]);
const start = summary.indexOf('<div class="cart__ctas">'), end = summary.indexOf('{% stylesheet %}',start); assert.ok(start>0 && end>start);
const liquid = new Liquid(); liquid.registerFilter('t',x=>x);
const cases = [];
for (const platform of [false,true]) for (const setting of [false,true]) for (const vertical of [false,true]) {
  const html = await liquid.parseAndRender(summary.slice(start,end), {cart:{items:[{quantity:1}]},additional_checkout_buttons:platform,settings:{show_accelerated_checkout_buttons:setting}, accelerated_checkout_buttons_layout:vertical?'vertical':'',content_for_additional_checkout_buttons:'<fixture-express></fixture-express>'});
  assert.match(html,/type="submit"/); assert.match(html,/name="checkout"/); assert.match(html,/form="cart-form"/);
  assert.equal(html.includes('<fixture-express>'),platform && setting);
  assert.equal(html.includes('additional-checkout-buttons--vertical'),platform && setting && vertical);
  cases.push({name:'cta-render',platform,setting,vertical,expressRendered:platform&&setting});
}
const formStart = products.indexOf('<form'), formEnd = products.indexOf('</form>',formStart), lock = products.indexOf("render 'tp-cart-gruppe', teil: 'sperre'");
assert.ok(formStart<lock && lock<formEnd); assert.match(products.slice(formStart,formStart+200),/id="cart-form"/); assert.match(products.slice(formStart,formStart+200),/method="post"/);
assert.match(header,/if settings.cart_type == 'drawer' and template.name != 'cart'/);
assert.match(group,/name="tp_cart_sperre"\s+value=""\s+required/);
assert.match(group,/body:has\(\[data-tp-cart-gesperrt\]\) \.additional-checkout-buttons\s*\{\s*pointer-events:\s*none;\s*opacity:\s*0\.4;/);
cases.push({name:'static-form-contract',lockInsidePostForm:true,drawerExcludedOnCartTemplate:true,requiredEmptyTextGuard:true,expressPointerBlockedByCSS:true});
const report={session:'S13',task:'CART-003a',status:'PASS',hashes,cases,limitations:'Eight original CTA fragment Liquid renders plus static form/guard/header/CSS contract. Does not execute browser constraint validation or accelerated checkout. S08 classification not rerun. No live-theme verification or server validation proof.'};
fs.writeFileSync('audit/evidence/checkout-contracts-2026-09-22.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',cases:cases.length,hashes:hashes.length}));
