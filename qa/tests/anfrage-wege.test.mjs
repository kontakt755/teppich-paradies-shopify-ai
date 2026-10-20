import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const sampleSource = readFileSync(new URL('../../assets/tp-sample-request.js', import.meta.url), 'utf8');
const contactSource = readFileSync(new URL('../../sections/tp-start-kontakt.liquid', import.meta.url), 'utf8');
function node() {
  const attributes = new Map(), handlers = new Map();
  return { value: '', required: false, hidden: false, textContent: '', children: [], attributes, handlers,
    setAttribute(k,v) { attributes.set(k,v); }, getAttribute(k) { return attributes.get(k); },
    hasAttribute(k) { return attributes.has(k); }, addEventListener(k,f) { handlers.set(k,f); },
    appendChild(child) { this.children.push(child); }, setCustomValidity(text) { this.validationMessage = text; },
    focus() {}, contains() { return true; }, querySelector() { return null; }, isConnected: true,
  };
}
function samplePage(search, { products = [], message: initialMessage = '' } = {}) {
  const hidden = new Map(), timers = new Map(), frames = [], addresses = new Map();
  const input=node(), list=node(), direct=node(), directLink=node(), form=node(), root=node(), hint=node(), message=node();
  hint.hidden=true; message.value=initialMessage; message.required=true; list.hidden=true; input.form=form;
  const box = { querySelector(selector) { return ({ '[data-tp-produktwahl-feld]':input, '[data-tp-produktwahl-liste]':list,
    '[data-tp-produktwahl-direkt]':direct, '[data-tp-produktwahl-direkt-link]':directLink })[selector] || null; } };
  root.querySelector = selector => {
    if (selector==='[data-tp-produktwahl]') return box;
    if (selector==='[data-message-field]') return message;
    if (selector==='[data-tp-anfrage-hinweis]') return hint;
    const h=selector.match(/^\[data-tp-hidden-field="(.+)"\]$/)?.[1];
    if(h) { if(!hidden.has(h)) hidden.set(h,node()); return hidden.get(h); }
    if(selector.startsWith('input[name=')) { if(!addresses.has(selector)) addresses.set(selector,node()); return addresses.get(selector); }
    return null;
  };
  const body={};const document={body,documentElement:{},activeElement:body,querySelector:s=>s==='[data-tp-sample-request]'?root:null,
    addEventListener(){},removeEventListener(){},createElement:()=>node()};
  const window={location:{search,hash:'',origin:'https://shop.example'},performance:{getEntriesByType:()=>[{type:'navigate'}]},scrollX:0,scrollY:0,requestAnimationFrame:fn=>frames.push(fn)};
  vm.runInNewContext(sampleSource,{window,document,URLSearchParams,setTimeout:fn=>{const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    fetch:async url=>({ok:true,json:async()=>({resources:{results:{products}}})})});
  return {root,input,list,message,hidden,addresses,direct,form,
    type(value){input.value=value;input.handlers.get('input')();},
    async suggestions(){for(const fn of timers.values()) fn();timers.clear();for(let i=0;i<6;i++)await Promise.resolve();},
  };
}
test('Allgemeine Musteranfrage verlangt sichtbares Produkt, ohne Versandadresse zur Pflicht zu machen',()=>{
  const p=samplePage('?thema=musteranfrage');
  assert.equal(p.root.getAttribute('data-needs-product'),'true');assert.equal(p.input.required,true);
  assert.equal(p.root.getAttribute('data-mode'),undefined);assert.equal(p.addresses.size,0);assert.equal(p.message.required,true);
  p.type('  Parkett Eiche, natur  ');assert.equal(p.hidden.get('Produkt').value,'Parkett Eiche, natur');
  p.form.handlers.get('submit')();assert.equal(p.hidden.get('Produkt').value,'Parkett Eiche, natur');
});
test('Leere Beschreibung und Leerzeichen werden beanstandet, valide Beschreibung loescht den Fehler',()=>{
  const p=samplePage('?thema=musteranfrage');p.type('   ');assert.ok(p.input.validationMessage);
  p.type('Parkett Eiche');assert.equal(p.input.validationMessage,'');
});
test('Anfrage-Produktwahl findet auch Parkett, Selbstbedienungsmuster behalten bestehende Verfuegbarkeitsregel',async()=>{
  const product={title:'Parkett Eiche Natur',handle:'parkett-eiche',type:'Parkett',tags:[]};
  const request=samplePage('?thema=musteranfrage',{products:[product]});request.type('Parkett');await request.suggestions();
  assert.equal(request.list.children.length,1);request.list.children[0].children[0].handlers.get('click')();
  assert.equal(request.hidden.get('Produkt').value,product.title);assert.equal(request.hidden.get('Produkt-Handle').value,product.handle);
  assert.equal(request.direct.hidden,true);
  const self=samplePage('?thema=muster',{products:[product]});self.type('Parkett');await self.suggestions();assert.equal(self.list.children.length,0);
  assert.equal(self.root.getAttribute('data-mode'),'sample');assert.ok([...self.addresses.values()].filter(n=>n.required).length===3);
});
test('Produktbezogene Musteranfrage und andere Kontaktwege bekommen keine neue Pflichtangabe',()=>{
  for(const search of ['?thema=musteranfrage&produkt=Grandessa%20Eiche','?thema=beratung','?thema=angebot','']) {
    const p=samplePage(search);assert.equal(p.input.required,false,search);assert.equal(p.root.getAttribute('data-needs-product'),undefined,search);
  }
});
test('Mehrbahnen-Zuschnitt und optionaler Raum bleiben in der vorbereiteten Verlegeanfrage lesbar',()=>{
  const params=new URLSearchParams({thema:'verlegung',produkt:'Alvento',breite:'400 cm',laenge_cm:'1120',zuschnitt:'2 × (400 × 560 cm)',raum:'550 × 660 cm'});
  const p=samplePage('?'+params);assert.match(p.message.value,/Zuschnitt: 2 × \(400 × 560 cm\)/);assert.match(p.message.value,/Raum: 550 × 660 cm/);
  assert.match(p.message.value,/Breite 400 cm, Länge 1120 cm/);
  const normal=samplePage('?thema=verlegung&produkt=Alvento');assert.doesNotMatch(normal.message.value,/Zuschnitt:|Raum: 550/);
});
test('Vorhandene Kundennachricht wird durch Kontext nicht ueberschrieben',()=>{
  const p=samplePage('?thema=verlegung&zuschnitt=2%20Bahnen',{message:'Mein bereits geschriebener Text'});assert.equal(p.message.value,'Mein bereits geschriebener Text');
});
function startPage(hash='') {
  const events=new Map(),classes=new Set(),toggle=node(),card=node(),first=node(),frames=[],scrolls=[];let cardFocus=0,inputFocus=0;
  card.classList={add:s=>classes.add(s)};card.querySelector=selector=>selector==='input[type=text]'?first:null;first.focus=()=>{inputFocus++;};card.focus=options=>{cardFocus++;assert.equal(options.preventScroll,true);};
  card.scrollIntoView=options=>{assert.ok(classes.has('tp-kon__card--offen'));scrolls.push({...options});};
  toggle.closest=()=>card;const document={querySelectorAll:()=>[],querySelector:s=>s==='[data-tp-kon-toggle]'?toggle:null};
  const window={location:{hash},addEventListener:(n,f)=>events.set(n,f),requestAnimationFrame:fn=>frames.push(fn)};
  vm.runInNewContext(contactSource.match(/{% javascript %}([\s\S]*?){% endjavascript %}/)[1],{document,window,URLSearchParams});
  return {toggle,card,classes,window,scrolls,frames,get cardFocus(){return cardFocus;},get inputFocus(){return inputFocus;},hashChange(h){window.location.hash=h;events.get('hashchange')();},layoutFrame(){const pending=frames.splice(0);pending.forEach(fn=>fn());}};
}
test('Hero-CTA verwendet vorhandenen Formularanker, der Formular sofort oeffnet und sinnvoll fokussiert',()=>{
  const config=JSON.parse(readFileSync(new URL('../../templates/index.json',import.meta.url),'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, ''));
  assert.equal(config.sections.tp_start_hero.settings.cta2_link,'#tp-anfrage');
  const p=startPage('#tp-anfrage');assert.ok(p.classes.has('tp-kon__card--offen'));assert.equal(p.toggle.getAttribute('aria-expanded'),'true');assert.equal(p.cardFocus,1);assert.equal(p.inputFocus,0);
});
test('Allgemeiner Kontaktanker bleibt geschlossen; Hashwechsel zum Anfrageanker oeffnet ihn',()=>{
  const p=startPage('#tp-kontakt');assert.equal(p.classes.size,0);assert.equal(p.cardFocus,0);p.hashChange('#tp-anfrage');assert.ok(p.classes.has('tp-kon__card--offen'));assert.equal(p.cardFocus,1);
});
test('Anfrageanker richtet die offene Karte erst nach dem Layout aus und beendet nativen Smoothscroll',()=>{
  for(const initialHash of ['', '#tp-anfrage']) {
    const p=startPage(initialHash);
    if(!initialHash) p.hashChange('#tp-anfrage');
    assert.equal(p.scrolls.length,0);assert.equal(p.frames.length,1);
    p.layoutFrame();
    assert.deepEqual(p.scrolls,[{block:'start',behavior:'instant'}]);
    assert.equal(p.inputFocus,0);assert.equal(p.cardFocus,1);
  }
  assert.match(contactSource,/\.tp-kon__card--form\s*\{[^}]*scroll-margin-top:\s*calc\(var\(--header-height,/);
});
test('Ein anderer Anker oder eine entfernte Karte unterbindet die ausstehende Scrollkorrektur',()=>{
  const p=startPage('#tp-anfrage');p.hashChange('#tp-kontakt');p.layoutFrame();assert.equal(p.scrolls.length,0);
  const removed=startPage('#tp-anfrage');removed.card.isConnected=false;removed.layoutFrame();assert.equal(removed.scrolls.length,0);
  const other=startPage('#tp-kontakt');other.layoutFrame();assert.equal(other.scrolls.length,0);assert.equal(other.frames.length,0);
});
test('Manuelles Aufklappen behaelt den bewusst gewaehlten Eingabefokus ohne neuen Ankerscroll',()=>{
  const p=startPage();p.toggle.handlers.get('click')();p.layoutFrame();
  assert.ok(p.classes.has('tp-kon__card--offen'));assert.equal(p.toggle.getAttribute('aria-expanded'),'true');
  assert.equal(p.inputFocus,1);assert.equal(p.cardFocus,0);assert.equal(p.scrolls.length,0);
});
