import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const read=f=>fs.readFileSync(f,'utf8');
const strip=f=>read(f).replace(/^import\s[\s\S]*?;\s*$/gm,'').replace(/^export /gm,'');
const manifest=JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes=['assets/cart-discount.js','assets/events.js','assets/utilities.js','snippets/cart-summary.liquid'].map(file=>{const sha256=createHash('sha256').update(read(file)).digest('hex');assert.equal(sha256,manifest.files[file].live.sha256);return{file,sha256};});
function harness(existing=[]){
 class Element { constructor(){this.dataset={};this.value='SAVE';const s=new Set(['hidden']);this.classList={add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)};} querySelectorAll(){return [];} }
 const registry=new Map(),requests=[],events=[],morphs=[];
 class Mouse extends Event {}
 class Keyboard extends Event {}
 const context=vm.createContext({Event,MouseEvent:Mouse,KeyboardEvent:Keyboard,AbortController,Component:Element,HTMLElement:Element,HTMLInputElement:Element,HTMLFormElement:Element,HTMLLIElement:Element,
 document:{dispatchEvent:e=>events.push(e.type)},cartPerformance:{measureFromEvent(){}},Theme:{routes:{cart_update_url:'/cart/update.js'}},
 customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},morphSection:(id,html)=>morphs.push({id,html}),
 DOMParser:class{parseFromString(html){return{getElementById:()=>({querySelectorAll:()=>html==='shipping'?[]:[Object.assign(new Element(),{dataset:{discountCode:'SAVE'}})]})};}},
 fetch:(url,config)=>new Promise((resolve,reject)=>{ requests.push({url,body:JSON.parse(config.body),signal:config.signal,resolve,reject}); config.signal.addEventListener('abort',()=>reject(new Error('synthetic-AbortError')),{once:true}); })});
 vm.runInContext(strip('assets/events.js'),context);
 const u=read('assets/utilities.js'),a=u.indexOf('export function fetchConfig('),b=u.indexOf('/**\n * Creates a debounced',a);assert.ok(b>a);vm.runInContext(u.slice(a,b).replace(/^export /gm,''),context);
 vm.runInContext(strip('assets/cart-discount.js'),context);
 const component=new(registry.get('cart-discount-component'))();component.dataset.sectionId='cart';component.refs={cartDiscountError:new Element(),cartDiscountErrorDiscountCode:new Element(),cartDiscountErrorShipping:new Element()};
 const pills=existing.map(code=>Object.assign(new Element(),{dataset:{discountCode:code}})); component.querySelectorAll=()=>pills;
 const input=new Element(),form=new Element();form.querySelector=()=>input;
 const apply=()=>component.applyDiscount({target:form,preventDefault(){},stopPropagation(){}});
 const remove=(index=0)=>{ const target=new Element(); target.closest=()=>pills[index]; const e=new Mouse('click',{cancelable:true}); Object.defineProperty(e,'target',{value:target}); return component.removeDiscount(e); };
 return{component,input,apply,remove,requests,events,morphs};
}
const cases=[];
const success=(h,i,label='valid')=>h.requests[i].resolve({json:async()=>({discount_codes:[],sections:{cart:label}})});
for(const existing of [['A','B'],['A']]){
 const h=harness(existing),p=h.remove();assert.equal(h.requests[0].body.discount,existing.slice(1).join(','));success(h,0);await p;assert.equal(h.events.length,1);assert.equal(h.morphs.length,1);
 cases.push({name:'remove-'+existing.length,discount:h.requests[0].body.discount,eventAndMorph:true});
}
{
 const h=harness(['A']),p=h.remove();h.requests[0].reject(new Error('network'));await p;assert.equal(h.events.length,0);assert.equal(h.component.refs.cartDiscountError.classList.contains('hidden'),true);
 cases.push({name:'remove-network-failure',defect:'TP-013 extension',feedbackVisible:false});
}
for(const firstAction of ['apply','remove']){
 const h=harness(firstAction==='remove'?['A']:[]);
 const a=firstAction==='remove'?h.remove():h.apply();
 h.input.value='SECOND';const b=h.apply();assert.equal(h.requests[0].signal.aborted,true);await a;
 h.input.value='THIRD';const c=h.apply();assert.equal(h.requests[1].signal.aborted,false);
 success(h,2,'newest');await c;success(h,1,'older');await b;
 assert.equal(h.morphs.at(-1).html,'older');
 cases.push({name:firstAction+'-apply-apply',defect:'TP-014',firstAborted:true,secondAbortedByThird:false,morphOrder:h.morphs.map(x=>x.html)});
}
{
 const h=harness();const a=h.apply();success(h,0);await a;h.input.value='NEXT';const b=h.apply();success(h,1);await b;assert.equal(h.events.length,2);
 cases.push({name:'sequential-success-control',events:2});
}
fs.writeFileSync('audit/evidence/discount-concurrency-2026-09-22.json',JSON.stringify({session:'S15',task:'CART-003b.2',status:'PASS',hashes,cases,limits:'Original classes/fetchConfig; modeled DOM and abort-aware fetch. Client controller loss proven; final snapshots synthetic, no server ordering or live browser proof. Native keyboard activation not tested; template binds remove to button click.'},null,2)+'\n');
console.log('PASS: 6 cases, 2 controller-loss cases, 4 historical hashes');
