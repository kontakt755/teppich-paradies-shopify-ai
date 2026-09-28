// PR-022: local original-source audit. No network or shop mutation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const blockFile = 'blocks/tp-rollware-rechner.liquid', artFile = 'assets/tp-rollware-art.js';
const source = read(blockFile);
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing source anchors ${start} / ${end}`);
  return source.slice(a, b);
}
const stripDocs = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const liquid = new Liquid({ relativeReference: false, fs: {
  resolve: (_dir, file) => path.join(root, 'snippets', file + '.liquid'),
  exists: async (file) => existsSync(file), existsSync,
  readFile: async (file) => stripDocs(readFileSync(file, 'utf8')),
  readFileSync: (file) => stripDocs(readFileSync(file, 'utf8')), contains: () => true,
} });
liquid.registerFilter('json', (v) => JSON.stringify(v ?? null));
const contract = between('{%- liquid', '\n<div class="tp-rwc-') +
  between('<script type="application/json" data-rwc-data-', '\n<style>');
const val = (value) => ({ value });
const baseCatalog = [
  { width: 80, price: 935 }, { width: 120, price: 1400 },
  { width: 180, price: 1900 }, { width: 200, price: 2400 },
];
function productData(o) {
  const main = [400, 500, 'Wunschmaß'].map((width) => ({
    id: `audit-main-${width}`, title: `Auditfarbe / ${width}`, available: o.mainAvailable ?? true,
    options: ['Auditfarbe', typeof width === 'number' ? width + 'cm' : width],
    price: width === 'Wunschmaß' ? (o.cmExact ? 89 : 8900) : (o.cmExact ? 66 : 6590),
    metafields: { custom: { rollenbreite: val(typeof width === 'number' ? width / 100 : null), farbcode: val('TEST') },
      service: { einfassen: val(o.release ?? 'Verfügbar'), raummass: val('Verfügbar') } },
  }));
  const catalog = o.catalog ?? baseCatalog;
  const haft = catalog.map((v, i) => ({ id: `audit-haft-${i}`, title: v.title ?? `1 mm, ${v.width} cm breit (je lfm)`, price: v.price, available: v.available ?? true }));
  return {
    product: { id: 'audit-product', title: 'Synthetic roll fixture', variants: main,
      selected_or_first_available_variant: main[0],
      options_with_values: [{ name: 'Farbe', position: 1, values: ['Auditfarbe'] }, { name: 'Breite', position: 2, values: ['400cm', '500cm', 'Wunschmaß'] }],
      metafields: { custom: { preis_pro_001_qm: val(o.cmExact ?? false) }, service: { einfass_gruppe: val([]) } } },
    block: { id: 'audit_roll', settings: {
      haftunterlage_produkt: o.configured === false ? null : { variants: haft },
      kettelleisten_produkt: { variants: [{ id: 'audit-leiste', title: '5 cm', price: 1095, available: true }] },
    } },
  };
}
async function renderData(o) {
  const html = await liquid.parseAndRender(contract, productData(o));
  return JSON.parse(html.match(/<script[^>]+>([\s\S]*?)<\/script>/)[1]);
}
class Element {
  constructor(value = '', tagName = 'DIV') {
    this.value = value; this.tagName = tagName; this.textContent = ''; this.hidden = false;
    this.disabled = false; this.checked = false; this.validity = { badInput: false };
    this.children = []; this.options = []; this.attributes = new Map(); this.listeners = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  appendChild(el) {
    this.children.push(el);
    if (this.tagName === 'SELECT') { this.options.push(el); if (!this.value) this.value = el.value; }
  }
  removeChild(el) { this.children.splice(this.children.indexOf(el), 1); }
  get firstChild() { return this.children[0] ?? null; }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  removeAttribute(k) { this.attributes.delete(k); }
  addEventListener(event, fn) { this.listeners.set(event, fn); }
  emit(event) { this.listeners.get(event)?.(); }
  focus() {}
}
const helpers = between('  function norm(s)', '\n  // Schritt 2 je Farbe') +
  between('  function getEffectiveLengthCm()', '\n  var SVG_NS') +
  between('  function fehlendesFeld()', '\n  var target =');
const extrasSource = between('  var leisteBox =', '\n  var einfassBox =');
const calculateSource = between('  function calculate() {', '\n  // Zuschnitt und Kettelung');
const submitSource = between("  cta.addEventListener('click', function () {", '\n\n  calculate();\n}');
const selectionSource = between('      var beste = null;', '\n      if (hHint)');
const select = vm.runInNewContext(`(function(w, len, haftVarianten) { var showH = true; ${selectionSource} return beste; })`);
const ceilRatio = (a, b) => Math.floor((a + b - 1) / b);
const money = (c) => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
function candidates(w, length, catalog) {
  // Independent integer oracle; each candidate has its own explicit known cm width.
  return catalog.map((v) => {
    const strips = ceilRatio(w, v.width), meters = strips * ceilRatio(length, 100);
    return { id: v.id, width: v.width, strips, meters, cents: meters * v.price };
  }).sort((a, b) => a.cents - b.cents);
}
function allowedCatalog(o) {
  if (o.configured === false || (o.release ?? 'Verfügbar') !== 'Verfügbar') return [];
  return (o.catalog ?? baseCatalog).map((v, i) => ({ ...v, id: `audit-haft-${i}` }))
    .filter((v) => v.available !== false && v.price > 0 && !v.unrecognized);
}
async function harness(o = {}) {
  const data = await renderData({skirt:true});
  const original = data.variants.filter(Boolean);
  data.variants = original.concat(original.filter(v=>v.options[1]==='400cm').map(v=>({...v,id:'blue-400',options:['Blue','400cm'],price:3000,einfassen:'Nicht verfügbar'})),original.map(v=>({...v,id:'green-'+v.id,options:['Green',v.options[1]],available:v.options[1]!=='Wunschmaß'})));

  const width = o.width ?? 400, length = o.length ?? 200, mode = o.mode ?? 'meter';
  const nodes = Object.fromEntries(['messRaum','wunschError','errComma','errMin','errMax','errStock','calcBox','drawFigure',
    'formulaArea','formulaRound','formulaPrice','outTotal','cta','ctaHint','cartLink','meterTipp','widthSeg'].map((n) => [n, new Element()]));
  const fields = new Map();
  const q = (s) => {
    if (!fields.has(s)) fields.set(s, new Element('', s === '[data-leiste-hoehe]' ? 'SELECT' : 'DIV'));
    return fields.get(s);
  };
  const haftBox = new Element(), leisteBox = new Element(), formulaExtras = new Element();
  haftBox.querySelector = leisteBox.querySelector = q;
  q('[data-haft-an]').checked = o.underlay !== false;
  q('[data-leiste-an]').checked = true; q('[data-leiste-meter]').value='7'; q('[data-leiste-meter]').setAttribute('data-touched','1');
  if (o.skirtLength !== undefined) { q('[data-leiste-meter]').value = String(o.skirtLength); q('[data-leiste-meter]').setAttribute('data-touched', '1'); }
  const wunschInput = new Element(String(width), 'INPUT'), lengthInput = new Element(String(length), 'INPUT');
  const ui = Object.fromEntries(['artField','artRaumCard','artSubMeter','artSubRaum','widthField','widthStep','widthLabel','lengthNumber','wunschBox','wunschHint'].map(n=>[n,new Element()]));
  function radios(values,selected){ const list=values.map(v=>new Element(String(v)));for(const el of list){let checked=el.value===String(selected);Object.defineProperty(el,'checked',{get:()=>checked,set:v=>{checked=v;if(v)for(const other of list)if(other!==el)other.checked=false;}});}return list;}
  const widthRadios=radios([400,500],500),artRadios=radios(['meter','raum'],'raum');
  const chipByWidth=Object.fromEntries(widthRadios.map(input=>[input.value,{input,label:new Element()}]));
  const rootEl = { querySelector: (s) => {
    if (s === '[data-extra="haft"]') return o.configured === false ? null : haftBox;
    if (s === '[data-extra="leiste"]') return leisteBox;
    if (s === '[data-formula-extras]') return formulaExtras;
    return (s.includes('tp-rwc-art-')?artRadios:widthRadios).find(r=>r.checked);
  } };
  const requests = [], events = [], timers=[];
  const context = vm.createContext({
    ...nodes, ...ui, artRadios, chipByWidth, data, variants: data.variants.filter(Boolean), cmExact: data.cm_exact,
    wunschInput, lengthInput, root: rootEl, wIdx: 1, widths: [400,500], farbBreiten: [400,500],
    WUNSCH_MIN_CM: 50, MAX_LENGTH_CM: 5000, target: null, inFlight: false,
    selectedMeterWidth:()=>Number(widthRadios.find(r=>r.checked)?.value||400), syncArtUi() {}, updateEinfassChips() {}, draw() {},
    renumberSteps() {}, applyServiceState() {}, clearInvalid() {}, markInvalid() {}, updateMeterTipp() {}, setTimeout(fn) { timers.push(fn); },
    window: { location: { search: '' } }, URLSearchParams,
    document: { querySelector: () => null, createElement: (tag) => new Element('', tag.toUpperCase()),
      dispatchEvent: (event) => events.push(event.detail) },
    CustomEvent: class { constructor(_type, init) { this.detail = init.detail; } },
    fetch: async (url, options) => { requests.push({ url, method: options.method, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ intercepted: true }) }; },
  });
  vm.runInContext(read(artFile), context, { filename: artFile, timeout: 1000 });
  vm.runInContext('var ART=window.TPRollwareArt; function maxRaumBreite() { return ART.maxRaumBreite(farbBreiten); }', context);
  assert.equal(context.ART.findWidthOption(data.options), 1);
  vm.runInContext(between('  function artMode()', '\n  var lengthInput =') + helpers + between('  function syncArtUi()', '\n  // Im Raummass sagen') + extrasSource + calculateSource + submitSource, context, { filename: blockFile, timeout: 1000 });
  return {context,nodes,requests,timers,q,widthRadios,artRadios,haftBox,leisteBox};
}

const h=await harness({width:250,length:200});
const cases=[];
const stages=[['initial-room','audit-main-Wunschmaß','raum','audit-main-Wunschmaß',true],['blue-no-room-or-500','blue-400','meter','blue-400',false],['return-original','audit-main-400','meter','audit-main-400',true],['green-unavailable-room','green-audit-main-400','meter','green-audit-main-400',true]];
for(const [name,url,expectedMode,expectedId,extras]of stages){
 if(name==='green-unavailable-room')h.artRadios.find(r=>r.value==='raum').checked=true;
 h.context.window.location.search='?variant='+url;vm.runInContext('calculate()',h.context);
 assert.equal(vm.runInContext('artMode()',h.context),expectedMode);assert.equal(h.context.target.id,expectedId);
 assert.equal(vm.runInContext('selectedWidth()',h.context),expectedMode==='raum'?250:400);
 const before=h.requests.length;h.nodes.cta.emit('click');await new Promise(r=>setImmediate(r));assert.equal(h.requests.length,before+1);
 const body=h.requests.at(-1).body,items=body.items||[body];assert.equal(items[0].id,expectedId);assert.equal(items[0].properties.Art,expectedMode==='raum'?'Raummaß':'Meterware');assert.equal(items.length,extras?3:1);
 if(extras){assert.equal(items[1].quantity,7);assert.ok(items.every(i=>i.properties._Gruppe===items[0].properties._Gruppe));}
 const prices=new Map([...h.context.variants,...h.context.data.leiste,...h.context.data.haft].filter(Boolean).map(v=>[v.id,Number(v.price)]));
 const totalCents=items.reduce((sum,i)=>sum+i.quantity*prices.get(i.id),0);assert.equal(h.nodes.outTotal.textContent,money(totalCents));
 cases.push({totalCents,name,id:expectedId,mode:expectedMode,selectedWidth:vm.runInContext('selectedWidth()',h.context),items,displayTotal:h.nodes.outTotal.textContent});
 for(const fn of h.timers.splice(0))fn();
}
const manifest=JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes=[blockFile,artFile].map(file=>{const sha256=sha(read(file));assert.equal(sha256,manifest.files[file].live.sha256);return{file,sha256};});
const {writeFileSync}=await import('node:fs');
writeFileSync(path.join(root,'audit/evidence/roll-state-submit-2026-09-22.json'),JSON.stringify({session:'S19',task:'CALC-001a.2',status:'PASS',hashes,cases,limits:'Original Liquid baseline, selection/syncArtUi/calculate/extras/submit; synthetic color variants added. Radio exclusivity modeled, draw/service UI/einfass chips and timing adapted. No native picker/URL/morph or live request. Four sequential captured submits; no old diagnostic replay.'},null,2)+'\n');
console.log('PASS: 4 sequential transitions/submits, 2 historical hashes');
