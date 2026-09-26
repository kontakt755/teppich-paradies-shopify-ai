import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {Liquid} from 'liquidjs';
const read=f=>fs.readFileSync(f,'utf8');
const file='blocks/color-swatch-picker.liquid',source=read(file),start=source.indexOf('    (function() {'),end=source.indexOf('  </script>',start);assert.ok(start>0&&end>start);
const manifest=JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes=[file,'blocks/tp-rollware-rechner.liquid'].map(file=>{const sha256=createHash('sha256').update(read(file)).digest('hex');assert.equal(sha256,manifest.files[file].live.sha256);return{file,sha256};});
const liquid=new Liquid();liquid.registerFilter('json',x=>JSON.stringify(x));
const variants=[{id:1,options:['Red','400cm'],available:true},{id:2,options:['Red','500cm'],available:true},{id:3,options:['Red','Wunschmaß'],available:true},{id:4,options:['Blue','400cm'],available:true}];
async function run(name,initialId,{forms=false,secondForm=false,search=''}={}){
 const selected=variants.find(v=>v.id===initialId),events=[],inputs=['Red','Blue'].map(value=>({value,checked:false,matches:()=>true})),label={textContent:''};let handler;
 const formInputs=forms?[{value:String(initialId),dispatchEvent(){}}]:[];if(secondForm)formInputs.push({value:'foreign-variant',dispatchEvent(){}});
 for(const input of formInputs){let value=input.value;Object.defineProperty(input,'value',{get:()=>value,set:v=>{value=String(v);}});}
 const picker={dataset:{},querySelectorAll:()=>inputs,querySelector:()=>label,addEventListener:(_,fn)=>handler=fn};
 const location={search};const history={replaceState(_state,_title,url){location.search=url.slice(url.indexOf('?'));}};
 const document={querySelector:s=>s.startsWith('color-swatch-picker-')?picker:s.includes('form[action')?formInputs[0]??null:null,querySelectorAll:s=>s.includes('form[action')?formInputs:[],dispatchEvent:e=>events.push(e.detail)};
 const code=await liquid.parseAndRender(source.slice(start,end),{color_picker_id:'audit',product:{variants,options:['Farbe','Breite'],url:'/products/audit'},color_option:{name:'Farbe'},color_option_index:0,selected_variant:selected,selected_color:'Red'});
 vm.runInNewContext(code,{document,window:{location,history},URLSearchParams,Event,CustomEvent});
 inputs[0].checked=false;inputs[1].checked=true;handler({target:inputs[1]});
 const effectiveId=formInputs[0]?.value||new URLSearchParams(location.search).get('variant')||String(initialId);
 const result={name,initialId,selectedRadio:inputs.find(i=>i.checked).value,label:label.textContent,effectiveId,events:events.length,formIds:formInputs.map(i=>i.value)};
 if(initialId===1){assert.equal(effectiveId,'4');assert.equal(label.textContent,'Blue');assert.equal(events.length,1);}
 else{assert.equal(effectiveId,String(initialId));assert.equal(label.textContent,'Red');assert.equal(events.length,0);result.defect='TP-015';}
 if(secondForm)assert.equal(formInputs[1].value,'4');
 return result;
}
const cases=[];
cases.push(await run('common-width-initial',1));
cases.push(await run('missing-500-initial',2));
cases.push(await run('missing-room-url',3,{search:'?variant=3'}));
cases.push(await run('missing-500-form',2,{forms:true}));
cases.push(await run('common-width-form',1,{forms:true}));
cases.push(await run('two-forms-global-write',1,{forms:true,secondForm:true}));
fs.writeFileSync('audit/evidence/color-picker-2026-09-22.json',JSON.stringify({session:'S20',task:'VAR-001a.1',status:'PASS',hashes,cases,limits:'Full original first picker IIFE rendered via Liquid; synthetic variants and radio/DOM/forms. Native radio check modeled before change. No browser or Shopify writes. Missing combination leaves old variant locally; current product reach unknown. Multi-form crosswrite conditional, native picker/media/tp-farbe consumers not run.'},null,2)+'\n');
console.log('PASS: 6 cases, 3 missing-combination defects, 2 historical hashes');
