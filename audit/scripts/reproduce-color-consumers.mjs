import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const read=f=>fs.readFileSync(f,'utf8'),manifest=JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes=['assets/tp-farbe.js','assets/events.js','snippets/tp-farbe-properties.liquid'].map(file=>{const sha256=createHash('sha256').update(read(file)).digest('hex');assert.equal(sha256,manifest.files[file].live.sha256);return{file,sha256};});
function harness(type='tp-farbe-properties'){
 const registry=new Map(),document=new EventTarget(),section=new EventTarget(),fields=new Map();
 class Element extends EventTarget{constructor(){super();this.dataset={productId:'P'};this.hidden=false;this.textContent='';this.value='';this.disabled=false;this.style={setProperty(){},removeProperty(){}};this.classList={add(){},remove(){}};}closest(){return section;}querySelector(s){return fields.get(s)??null;}}
 const map={'1':{name:'Red',nummer:' 111 ',intern:' Red internal ',bild:''},'2':{name:'Blue',nummer:'222',intern:'Blue internal',bild:'fixture.jpg'}};
 fields.set('script[data-tp-farbe-map]',{textContent:JSON.stringify(map)});
 for(const key of ['input[data-tp-farbe-nummer]','input[data-tp-farbe-intern]','[data-tp-farbe-name]','[data-tp-farbe-nummer]','[data-tp-farbe-hinweis]','[data-tp-farbe-swatch]'])fields.set(key,new Element());
 const context=vm.createContext({Event,CustomEvent,AbortController,HTMLElement:Element,document,console,customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)}});
 vm.runInContext(read('assets/events.js').replace(/^export /gm,''),context);vm.runInContext(read('assets/tp-farbe.js'),context);
 const host=new(registry.get(type))();host.connectedCallback();
 const native=(id,productId='P')=>{context.eventId=id;context.productId=productId;section.dispatchEvent(vm.runInContext("new VariantUpdateEvent({id:eventId},'picker',{productId})",context));};
 const custom=id=>document.dispatchEvent(new CustomEvent('tp:farbe-wechsel',{detail:{variantId:id}}));
 const state=()=>({number:fields.get('input[data-tp-farbe-nummer]').value,disabled:fields.get('input[data-tp-farbe-nummer]').disabled,name:fields.get('[data-tp-farbe-name]').textContent});
 return{host,native,custom,state};
}
const cases=[];
{
 const h=harness();h.native('1');assert.equal(h.state().number,'111');h.native('2','foreign');assert.equal(h.state().number,'111');h.native('2');assert.equal(h.state().number,'222');cases.push({name:'native-product-scope',state:h.state()});
}
{
 const h=harness();h.custom('1');assert.equal(h.state().number,'111');h.custom('foreign-id');assert.equal(h.state().number,'');assert.equal(h.state().disabled,true);cases.push({name:'global-foreign-custom-event',state:h.state(),boundary:'H-016 synthetic multi-product reach; no confirmed live order loss.'});
}
{
 const h=harness('tp-farbe-anzeige');h.custom('1');h.custom('foreign-id');assert.equal(h.state().name,'Red');cases.push({name:'display-unknown-id',state:h.state()});
}
for(const type of ['tp-farbe-properties','tp-farbe-anzeige'])for(const eventType of ['native','custom']){
 const h=harness(type);h[eventType]('1');h.host.disconnectedCallback();h.host.connectedCallback();h[eventType]('2');const actual=type==='tp-farbe-properties'?h.state().number:h.state().name;assert.equal(actual,type==='tp-farbe-properties'?'111':'Red');cases.push({name:type+'-reconnect-'+eventType,defect:'TP-016',state:h.state()});
}
{
 const h=harness();h.native('1');h.host.disconnectedCallback();h.native('2');assert.equal(h.state().number,'111');cases.push({name:'disconnect-removes-listener-control',state:h.state()});
}
fs.writeFileSync('audit/evidence/color-consumers-2026-09-22.json',JSON.stringify({session:'S21',task:'VAR-001a.2a',status:'PASS',hashes,cases,limits:'Full original tp-farbe classes and VariantUpdateEvent; native Node EventTarget/AbortController, modeled host/querySelector/section. Reconnect invoked on same instance; actual browser morph/reinsert reach not verified. No shop request.'},null,2)+'\n');
console.log('PASS: 8 cases, 4 reconnect defects, 3 hashes');
