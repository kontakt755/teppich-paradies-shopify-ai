import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const read=f=>fs.readFileSync(f,'utf8');
const manifest=JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes=['assets/variant-picker.js','assets/events.js','assets/product-form.js'].map(file=>{const sha256=createHash('sha256').update(read(file)).digest('hex');assert.equal(sha256,manifest.files[file].live.sha256);return{file,sha256};});
const flush=()=>new Promise(r=>setImmediate(r));
function harness(){
 class Element extends EventTarget{constructor(){super();this.dataset={};this.refs={};}closest(){return null;}}
 const requests=[],events=[],logs=[],morphs=[],registry=new Map(),option=new Element();option.dataset={optionValueId:'opt-2',variantId:'2'};
 const context=vm.createContext({Event,AbortController,URL,Component:Element,HTMLElement:Element,HTMLInputElement:Element,HTMLOptionElement:Element,HTMLSelectElement:class{},OverflowList:class{},ResizeNotifier:class{observe(){}disconnect(){}},getViewParameterValue:()=>'',yieldToMainThread:()=>Promise.resolve(),window:{location:{href:'https://fixture.invalid/products/test'}},history:{replaceState(){}},
 customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},console:{warn:e=>logs.push(String(e)),error:e=>logs.push(e.message)},
 DOMParser:class{parseFromString(text){return{querySelector:selector=>selector.includes('script')?(text==='missing'?null:{textContent:text==='malformed'?'{':JSON.stringify({id:2,available:true})}):null};}},
 fetch:(url,config)=>new Promise((resolve,reject)=>{requests.push({url,signal:config.signal,resolve,reject});config.signal.addEventListener('abort',()=>reject(Object.assign(new Error('abort'),{name:'AbortError'})),{once:true});})});
 vm.runInContext(read('assets/events.js').replace(/^export /gm,''),context);
 vm.runInContext(read('assets/variant-picker.js').replace(/^import .*;\n/gm,'').replace('export default class','class'),context);
 const picker=new(registry.get('variant-picker'))();picker.dataset={productId:'P',productUrl:'/products/test',templateProductMatch:'true'};picker.querySelector=()=>option;picker.querySelectorAll=()=>[option];picker.updateSelectedOption=()=>{};picker.updateVariantPicker=()=>{morphs.push('picker');};picker.addEventListener('variant:selected',e=>events.push(e.type));picker.addEventListener('variant:update',e=>events.push(e.type));
 return{picker,option,requests,events,logs,morphs};
}
const cases=[];
for(const outcome of ['success','missing','malformed','network']){
 const h=harness();h.picker.variantChanged({target:h.option});assert.equal(h.events[0],'variant:selected');assert.equal(h.requests[0].url,'/products/test?option_values=opt-2');
 if(outcome==='network')h.requests[0].reject(new Error('synthetic-network'));else h.requests[0].resolve({text:async()=>outcome});await flush();
 assert.equal(h.events.includes('variant:update'),outcome==='success');
 cases.push({name:outcome,events:h.events,morphs:h.morphs,logs:h.logs});
}
{
 const h=harness();h.picker.variantChanged({target:h.option});h.picker.variantChanged({target:h.option});assert.equal(h.requests[0].signal.aborted,true);h.requests[1].resolve({text:async()=>'success'});await flush();assert.equal(h.events.filter(e=>e==='variant:update').length,1);cases.push({name:'abort-then-success',events:h.events,logs:h.logs});
}
{
 const h=harness();h.picker.variantChanged({target:h.option});h.requests[0].reject(new Error('network'));await flush();h.picker.variantChanged({target:h.option});h.requests[1].resolve({text:async()=>'success'});await flush();assert.equal(h.events.at(-1),'variant:update');cases.push({name:'explicit-next-selection-recovers',events:h.events});
}
fs.writeFileSync('audit/evidence/variant-responses-2026-09-22.json',JSON.stringify({session:'S22',task:'VAR-001a.2b.1',status:'PASS',hashes,cases,limits:'Original VariantPicker class/events with original variantChanged/buildRequestUrl/fetchUpdatedSection; selected-option DOM, updateSelectedOption and updateVariantPicker/morph adapted. Product-form queue only source-read, not executed. No live requests or UI. Missing completion is H-017 pending consumer integration.'},null,2)+'\n');
console.log('PASS: 6 cases, 3 historical hashes');
