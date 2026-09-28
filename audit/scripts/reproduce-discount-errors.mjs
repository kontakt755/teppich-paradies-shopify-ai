import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const read=f=>fs.readFileSync(f,'utf8');
const strip=f=>read(f).replace(/^import\s[\s\S]*?;\s*$/gm,'').replace(/^export /gm,'');
const manifest=JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes=['assets/cart-discount.js','assets/events.js','assets/utilities.js','snippets/cart-summary.liquid'].map(file=>{const sha256=createHash('sha256').update(read(file)).digest('hex');assert.equal(sha256,manifest.files[file].live.sha256);return{file,sha256};});
function harness(){
 class Element { constructor(){this.dataset={};this.value='SAVE';const s=new Set(['hidden']);this.classList={add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)};} querySelectorAll(){return [];} }
 const registry=new Map(),requests=[],events=[],morphs=[];
 const context=vm.createContext({Event,AbortController,Component:Element,HTMLElement:Element,HTMLInputElement:Element,HTMLFormElement:Element,HTMLLIElement:Element,
 document:{dispatchEvent:e=>events.push(e.type)},cartPerformance:{measureFromEvent(){}},Theme:{routes:{cart_update_url:'/cart/update.js'}},
 customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},morphSection:(id,html)=>morphs.push({id,html}),
 DOMParser:class{parseFromString(html){return{getElementById:()=>({querySelectorAll:()=>html==='shipping'?[]:[Object.assign(new Element(),{dataset:{discountCode:'SAVE'}})]})};}},
 fetch:(url,config)=>new Promise((resolve,reject)=>requests.push({url,body:JSON.parse(config.body),resolve,reject}))});
 vm.runInContext(strip('assets/events.js'),context);
 const u=read('assets/utilities.js'),a=u.indexOf('export function fetchConfig('),b=u.indexOf('/**\n * Creates a debounced',a);assert.ok(b>a);vm.runInContext(u.slice(a,b).replace(/^export /gm,''),context);
 vm.runInContext(strip('assets/cart-discount.js'),context);
 const component=new(registry.get('cart-discount-component'))();component.dataset.sectionId='cart';component.refs={cartDiscountError:new Element(),cartDiscountErrorDiscountCode:new Element(),cartDiscountErrorShipping:new Element()};
 const input=new Element(),form=new Element();form.querySelector=()=>input;
 const apply=()=>component.applyDiscount({target:form,preventDefault(){},stopPropagation(){}});
 return{component,input,apply,requests,events,morphs};
}
const cases=[];
for(const kind of ['valid','invalid','shipping','network','http-json','invalid-json']){
 const h=harness(),p=h.apply();
 assert.deepEqual(h.requests[0].body,{discount:'SAVE',sections:['cart']});
 if(kind==='network')h.requests[0].reject(new Error('synthetic-network'));
 else if(kind==='http-json')h.requests[0].resolve({ok:false,status:500,json:async()=>({errors:'synthetic-server'})});
 else if(kind==='invalid-json')h.requests[0].resolve({ok:false,status:502,json:async()=>{throw new SyntaxError('synthetic-non-json');}});
 else h.requests[0].resolve({ok:true,json:async()=>({discount_codes:[{code:'SAVE',applicable:kind!=='invalid'}],sections:{cart:kind}})});
 await p;
 const visible=!h.component.refs.cartDiscountError.classList.contains('hidden');
 assert.equal(visible,kind==='invalid'||kind==='shipping');assert.equal(h.events.length,kind==='valid'?1:0);assert.equal(h.morphs.length,kind==='valid'?1:0);
 if(['network','http-json','invalid-json'].includes(kind)){
  assert.equal(h.input.value,'SAVE');const retry=h.apply();assert.equal(h.requests.length,2);h.requests[1].resolve({json:async()=>({discount_codes:[{code:'SAVE',applicable:true}],sections:{cart:'valid'}})});await retry;assert.equal(h.morphs.length,1);
 }
 cases.push({kind,errorVisible:visible,explicitRetrySucceeds:['network','http-json','invalid-json'].includes(kind),defect:['network','http-json','invalid-json'].includes(kind)?'TP-013':null});
}
fs.writeFileSync('audit/evidence/discount-errors-2026-09-22.json',JSON.stringify({session:'S14',task:'CART-003b.1',status:'PASS',hashes,cases,limits:'Original discount/events/fetchConfig; mocked Component/DOM/fetch. No live discount, browser or production changes. Removal/concurrency/cart-note still open.'},null,2)+'\n');
console.log('PASS: 6 cases, 3 silent-failure cases, 4 historical hashes');
