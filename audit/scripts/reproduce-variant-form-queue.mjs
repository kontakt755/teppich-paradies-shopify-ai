import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8');
const prior=JSON.parse(read('audit/evidence/variant-responses-2026-09-22.json'));
const hashes=prior.hashes.map(h=>{assert.equal(createHash('sha256').update(read(h.file)).digest('hex'),h.sha256);return h;});
const cases=[];
for(const outcome of ['success','missing','malformed','network']) {
 const scope=new EventTarget(), registry=new Map(),requests=[];
 class Component extends EventTarget {constructor(){super();this.dataset={productId:'P'};this.refs={variantId:{value:'1'},liveRegion:{}};}connectedCallback(){}closest(){return scope;}querySelectorAll(){return [];}querySelector(){return null;}}
 const document=new EventTarget();document.querySelectorAll=()=>[];
 const context=vm.createContext({Component,Event,AbortController,URL,document,window:{location:{href:'https://fixture.invalid/products/test?variant=2'}},customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},Theme:{routes:{cart_add_url:'/cart/add.js'}},fetch:(url,config)=>{requests.push({url,payload:JSON.parse(config.body)});return Promise.resolve({json:async()=>({items:[]})});},console});
 vm.runInContext(read('assets/events.js').replace(/^export /gm,''),context);
 vm.runInContext(read('assets/product-form.js').slice(read('assets/product-form.js').indexOf('class ProductFormComponent extends Component')),context);
 const form=new(registry.get('product-form-component'))();form.connectedCallback();
 const emit=(type,id=2)=>{context.scope=scope;context.recoveryId=id;vm.runInContext(type==='variant:selected'?"scope.dispatchEvent(new VariantSelectedEvent({id:'opt-2'}))":"scope.dispatchEvent(new VariantUpdateEvent({id:recoveryId,available:true},'opt-2',{productId:'P',html:{querySelector:()=>null}}))",context);};
 // Replay S22's captured event boundary; no second picker diagnosis or live requests.
 const trace=prior.cases.find(c=>c.name===outcome).events;
 emit(trace[0]);form.handleSubmit({preventDefault(){}});
 assert.equal(requests.length,0);
 if(trace.includes('variant:update'))emit('variant:update');
 await new Promise(r=>setImmediate(r));
 if(outcome==='success')assert.equal(requests.length,1);
 else {
  assert.equal(requests.length,0);
  form.handleSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(requests.length,0);
  // Explicit successful new selection releases both queued clicks from the failed selection.
  context.window.location.href='https://fixture.invalid/products/test?variant=3';
  emit('variant:selected');emit('variant:update',3);await new Promise(r=>setImmediate(r));
  assert.equal(requests.length,1);assert.equal(requests[0].payload.items.length,2);
 }
 assert.equal(requests[0].payload.items[0].id,2);
 assert.equal(requests[0].payload.items[0].quantity,1);
 cases.push({outcome,trace,requestsBeforeRecovery:outcome==='success'?1:0,releasedPayload:requests[0].payload});
}
const report={session:'S23',task:'VAR-001a.2b.2',status:'PASS',hashes,cases,limits:'Original complete ProductFormComponent and events, native EventTarget; S22 picker event transcripts replayed at section boundary. DOM/refs adapted, no button animations or actual picker rerun, no browser or live requests. Recovery event resource and URL use id 3; retained queue still submits id 2. Combined picker DOM selection not executed.'};
fs.writeFileSync('audit/evidence/variant-form-queue-2026-09-22.json',JSON.stringify(report,null,2)+'\n');console.log('PASS: 4 consumer cases, 3 source hashes');
