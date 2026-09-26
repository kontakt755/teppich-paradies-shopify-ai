import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const read=f=>fs.readFileSync(f,'utf8');
const manifest=JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes=['assets/cart-note.js','assets/utilities.js','assets/component.js','snippets/cart-summary.liquid','config/settings_data.json'].map(file=>{const sha256=createHash('sha256').update(read(file)).digest('hex');const historicalMatch=sha256===manifest.files[file].live.sha256;if(file!=='config/settings_data.json')assert.equal(historicalMatch,true);return{file,sha256,historicalMatch};});
const flush=()=>new Promise(r=>setImmediate(r));
function harness(){
 class Element{constructor(){this.value='';}disconnectedCallback(){}}
 const timers=new Map(),requests=[],marks=[];let tick=0,id=0;const registry=new Map();
 const context=vm.createContext({Component:Element,HTMLTextAreaElement:Element,AbortController,
 setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:tick+ms});return id;},clearTimeout:id=>timers.delete(id),
 customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},Theme:{routes:{cart_update_url:'/cart/update.js'}},
 cartPerformance:{measureFromEvent:x=>marks.push(x)},
 fetch:(url,config)=>new Promise((resolve,reject)=>{requests.push({body:JSON.parse(config.body),signal:config.signal,resolve,reject});config.signal.addEventListener('abort',()=>reject(new Error('AbortError')),{once:true});})});
 const u=read('assets/utilities.js'),a=u.indexOf('export function fetchConfig('),b=u.indexOf('/**\n * Creates a throttled',a);assert.ok(b>a);vm.runInContext(u.slice(a,b).replace(/^export /gm,''),context);
 vm.runInContext(read('assets/cart-note.js').replace(/^import .*;\n/gm,''),context);
 const note=new(registry.get('cart-note'))(),input=new Element();
 const type=value=>{input.value=value;note.updateCartNote({target:input});};
 const advance=ms=>{tick+=ms;for(const [key,t]of timers)if(t.at<=tick){timers.delete(key);t.fn();}};
 return{note,type,advance,requests,marks,input};
}
const cases=[];
{
 const h=harness();h.type('A');h.advance(100);h.type('B');h.advance(199);assert.equal(h.requests.length,0);h.advance(1);assert.equal(h.requests[0].body.note,'B');h.requests[0].resolve({ok:true});await flush();cases.push({name:'200ms-burst',requests:1,lastValue:'B'});
}
for(const value of ['', 'Bitte klingeln: Größe 2 × 3 m']){
 const h=harness();h.type(value);h.advance(200);assert.equal(h.requests[0].body.note,value);h.requests[0].resolve({ok:true});await flush();cases.push({name:'payload',value});
}
for(const error of ['network','http500']){
 const h=harness();h.type('Notiz');h.advance(200);if(error==='network')h.requests[0].reject(new Error('network'));else h.requests[0].resolve({ok:false,status:500});await flush();assert.equal(h.marks.length,1);assert.equal(h.input.value,'Notiz');
 h.type('Retry');h.advance(200);assert.equal(h.requests.length,2);h.requests[1].resolve({ok:true});await flush();cases.push({name:error,measurementStillRuns:true,inputPreserved:true,explicitEditRetries:true,boundary:'No persistence assertion; form fallback exists, note locally disabled.'});
}
{
 const h=harness();h.type('A');h.advance(200);h.type('B');h.advance(200);assert.equal(h.requests[0].signal.aborted,true);await flush();h.type('C');h.advance(200);assert.equal(h.requests[1].signal.aborted,false);h.requests[1].resolve({ok:true});h.requests[2].resolve({ok:true});await flush();cases.push({name:'controller-ownership',defect:'TP-014 conditional note extension',secondAbortedByThird:false});
}
{
 const h=harness();h.type('pending');h.note.disconnectedCallback();h.advance(200);assert.equal(h.requests.length,1);h.requests[0].resolve({ok:true});await flush();cases.push({name:'disconnect-before-timer',requestStillRuns:true,boundary:'Base disconnect modeled; real morph/attachment not exercised.'});
}
const summary=read('snippets/cart-summary.liquid');assert.match(summary, /if settings.show_cart_note/);assert.match(summary,/<textarea\s+form="cart-form"[\s\S]*?name="note"[\s\S]*?>{{ cart.note }}<\/textarea>/);
const settings=JSON.parse(read('config/settings_data.json').replace(/^\s*\/\*[\s\S]*?\*\/\s*/,''));assert.equal(settings.current.show_cart_note,false);
fs.writeFileSync('audit/evidence/cart-note-2026-09-22.json',JSON.stringify({session:'S16',task:'CART-003b.3',status:'PASS',hashes,cases,contract:{localShowCartNote:false,form:'cart-form',name:'note'},limits:'Original note/fetchConfig/debounce with virtual timers and abort-aware fetch; Component/textarea modeled. No live setting, server persistence, checkout or native form test. No new confirmed issue; TP-014 conditional extension.'},null,2)+'\n');
console.log('PASS: 7 cases, 5 hashes (4 historical matches, config differs); local note setting disabled');
