import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const read=f=>fs.readFileSync(f,'utf8');
const file='blocks/tp-rollware-rechner.liquid',source=read(file);
const between=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return source.slice(i,j);};
const manifest=JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes=[file,'assets/tp-rollware-art.js'].map(file=>{const sha256=createHash('sha256').update(read(file)).digest('hex');assert.equal(sha256,manifest.files[file].live.sha256);return{file,sha256};});
class Element{
 constructor(value='',tagName='DIV'){this.value=value;this.tagName=tagName;this.checked=false;this.options=[];this.children=[];this.attrs=new Map();this.hidden=false;this.textContent='';}
 appendChild(e){this.children.push(e);if(this.tagName==='SELECT'){this.options.push(e);if(!this.value)this.value=e.value;}}
 removeChild(e){this.children.splice(this.children.indexOf(e),1);}get firstChild(){return this.children[0];}
 getAttribute(k){return this.attrs.get(k)??null;}setAttribute(k,v){this.attrs.set(k,v);}
}
const nodes=new Map();const q=s=>{if(!nodes.has(s))nodes.set(s,new Element('',s==='[data-leiste-hoehe]'?'SELECT':'DIV'));return nodes.get(s);};
const leiste=new Element(),haft=new Element(),lines=new Element();leiste.querySelector=haft.querySelector=q;
q('[data-leiste-an]').checked=q('[data-haft-an]').checked=true;
q('[data-leiste-meter]').value='7';q('[data-leiste-meter]').setAttribute('data-touched','1');
const variants=[['R',400,1000,true],['R','Wunschmaß',1500,true],['B',400,2000,false],['B','Wunschmaß',2500,false]].map(([c,w,p,allowed],i)=>({id:String(i+1),options:[c,typeof w==='number'?w+'cm':w],price:p,available:true,einfassen:allowed?'Verfügbar':'Nicht verfügbar',farbnummer:c}));
let formVariant=null,mode='meter';
const context=vm.createContext({URLSearchParams,data:{selected_options:['R','400cm'],product_title:'Synthetic roll',leiste:[{id:'L',title:'5 cm',price:100}],haft:[{id:'H',title:'200 cm',price:200}]},variants,wIdx:1,cmExact:false,target:null,
 artMode:()=>mode,root:{querySelector:s=>s==='[data-extra="leiste"]'?leiste:s==='[data-extra="haft"]'?haft:s==='[data-formula-extras]'?lines:{value:'400'}},
 window:{location:{search:''}},document:{querySelector:()=>formVariant?{value:formVariant}:null,createElement:t=>new Element('',t.toUpperCase())}});
vm.runInContext(read('assets/tp-rollware-art.js'),context);vm.runInContext('var ART=window.TPRollwareArt;',context);
vm.runInContext(between('  function norm(s)','\n  // Schritt 2 je Farbe')+between('  var leisteBox =','\n  var einfassBox ='),context);
const cases=[];
for(const [name,id,art,width,expectedId,extras]of [['red-meter','1','meter',400,'1',2],['red-room','2','raum',250,'2',2],['blue-room-blocked-extras','4','raum',250,'4',0],['blue-meter-blocked-extras','3','meter',400,'3',0],['return-red','1','meter',400,'1',2]]){
 context.window.location.search='?variant='+id;mode=art;context.auditWidth=width;
 const r=vm.runInContext('target=findVariant(auditWidth); ({id:target.id,rate:rateOf(target),extras:updateExtras(auditWidth,200,8)})',context);
 assert.equal(r.id,expectedId);assert.equal(r.rate,variants.find(v=>v.id===expectedId).price/100);assert.equal(r.extras.items.length,extras);assert.equal(q('[data-leiste-meter]').value,'7');assert.equal(q('[data-leiste-an]').checked,true);
 if(extras){assert.equal(r.extras.items[0].properties['Farbe wie Teppichboden'],'R (R)');assert.equal(r.extras.items[0].quantity,7);}
 cases.push({name,id:r.id,rate:r.rate,extraCount:extras,skirtInputPreserved:true,extrasHidden:leiste.hidden});
}
formVariant='3';context.window.location.search='?variant=1';assert.equal(vm.runInContext('findVariant(400).id',context),'3');cases.push({name:'form-priority-over-url',id:'3',boundary:'Synthetic simultaneous form/URL; real scoped picker contract still open.'});
const scheduled=[];let change;
const eventContext=vm.createContext({document:{addEventListener:(name,fn)=>{assert.equal(name,'change');change=fn;}},setTimeout:(fn,ms)=>scheduled.push(ms),calculate(){}});
vm.runInContext(between("  document.addEventListener('change', function (e)","  cta.addEventListener('click'"),eventContext);
for(const [name,inForm,swatch,want] of [['swatch',false,true,[120]],['form',true,false,[100]],['irrelevant',false,false,[]]]){
 scheduled.length=0;change({target:{name:swatch?'color-swatch-fixture':'other',closest:()=>inForm?{}:null}});assert.deepEqual(scheduled,want);cases.push({name:'change-'+name,scheduled:[...scheduled]});
}
fs.writeFileSync('audit/evidence/roll-extra-transitions-2026-09-22.json',JSON.stringify({session:'S18',task:'CALC-001a.1',status:'PASS',hashes,cases,limits:'Original selection/extras functions and original document change handler. Synthetic variant data, persistent DOM fields; artMode controlled, calculate scheduling recorded, not executed by native picker. No full syncArtUi/submit/morph test. H-003 partly covered only; historical pricing math not rerun.'},null,2)+'\n');
console.log('PASS: 9 transition/contract cases, 2 historical hashes');
