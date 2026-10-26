// Verspaetete Antworten mit kuenstlichem DOM und kontrolliertem fetch:
// Kundeninteraktion, Formular-Default und Fokus statt Quelltext-Invarianten.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';

const read = file => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const rechner = read('assets/tp-teppich-rechner.js');
const section = read('sections/tp-zubehoer-produkte.liquid');
const reihenScript = section.split('{% javascript %}')[1].split('{% endjavascript %}')[0];
const tick = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor(tag = 'div', attrs = {}, doc) {
    this.tag = tag; this.attrs = { ...attrs }; this.doc = doc; this.children = [];
    this.listeners = {}; this.value = ''; this.textContent = ''; this.hidden = false;
    this.classes = new Set((attrs.class || '').split(' '));
    this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c), contains: c => this.classes.has(c) };
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  removeEventListener(k, fn) { this.listeners[k] = (this.listeners[k] || []).filter(x => x !== fn); }
  dispatchEvent(e) { e.target ||= this; for (const fn of [...(this.listeners[e.type] || [])]) fn(e); return !e.defaultPrevented; }
  requestSubmit() { const e = { type: 'submit', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; if (this.dispatchEvent(e)) this.navigations = (this.navigations || 0) + 1; }
  appendChild(n) { n.parent = this; this.children.push(n); return n; }
  get firstChild() { return this.children[0]; }
  removeChild(n) { this.children = this.children.filter(x => x !== n); n.parent = null; }
  contains(n) { return n === this || this.children.some(c => c.contains(n)); }
  matches(s) {
    if (s.startsWith('.')) return this.classes.has(s.slice(1));
    const m = s.match(/^(\w+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/);
    return m && (!m[1] || this.tag === m[1]) && (!m[2] || (this.hasAttribute(m[2]) && (m[3] === undefined || this.getAttribute(m[2]) === m[3])));
  }
  querySelectorAll(s) { return this.children.flatMap(c => [...(c.matches(s) ? [c] : []), ...c.querySelectorAll(s)]); }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  closest(s) { return this.matches(s) ? this : this.parent?.closest(s) || null; }
  focus() { if (this.getClientRects().length) this.doc.activeElement = this; }
  scrollIntoView() {}
  getBoundingClientRect() { return { top: 0, bottom: 100, width: 100, height: 100 }; }
  getClientRects() { return this.getAttribute('style') === 'display: contents' || this.hidden ? [] : [this.getBoundingClientRect()]; }
  replaceWith(n) {
    if (this.contains(this.doc.activeElement)) this.doc.activeElement = this.doc.body;
    n.parent = this.parent; this.parent.children[this.parent.children.indexOf(this)] = n; this.parent = null;
  }
}
function documentHarness() {
  const doc = { readyState: 'complete', listeners: {}, addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }, createElement(tag) { return new Element(tag, {}, doc); } };
  doc.body = new Element('body', {}, doc); doc.documentElement = new Element('html', {}, doc); doc.activeElement = doc.body;
  doc.querySelectorAll = s => doc.body.querySelectorAll(s); doc.querySelector = s => doc.body.querySelector(s);
  doc.importNode = n => {
    const copy = new Element(n.tag, n.attrs, doc); copy.hidden = n.hidden; copy.textContent = n.textContent;
    n.children.forEach(c => copy.appendChild(doc.importNode(c))); return copy;
  };
  const requests = [];
  const fetch = url => new Promise((resolve, reject) => requests.push({ url, resolve, reject }));
  return { doc, requests, fetch, node: (tag, attrs) => new Element(tag, attrs, doc) };
}
// Produktionsaufbau aus tp-teppich-rechner-daten.liquid, ohne echte Katalogdaten.
// Beide Listen enden absichtlich mit null statt einem nachgestellten Komma.
const daten = JSON.stringify({ kettel: null, pauschale: null, gesamt: 1, teppiche: [{
  id: 1, titel: 'Test', url: '/test', bild: null, qualitaet: '', art: 'cover', kante_inkl: false,
  max_l: 600, mindest: 0, kg_qm: 0, max_kg: 0, farben: [{ id: 1, p: 100, alt: 0, w: 400 }, null],
}, null] });
function rechnerHarness(saved = { w: 200, l: 300 }) {
  const h = documentHarness(); const root = h.doc.body.appendChild(h.node('div', { 'data-tp-rechner-root': '' }));
  const form = root.appendChild(h.node('form', { 'data-tp-rechner': '' }));
  const w = form.appendChild(h.node('input', { 'data-tp-rechner-breite': '' }));
  const l = form.appendChild(h.node('input', { 'data-tp-rechner-laenge': '' }));
  for (const key of ['daten', 'fehler', 'ergebnis', 'liste', 'summe']) root.appendChild(h.node('div', { [`data-tp-rechner-${key}`]: '' }));
  root.querySelector('[data-tp-rechner-daten]').setAttribute('data-tp-rechner-quelle', '/data');
  let storage = JSON.stringify(saved);
  const context = vm.createContext({ document: h.doc, URL, fetch: h.fetch, sessionStorage: { getItem: () => storage, setItem: (_, v) => { storage = v; }, removeItem: () => { storage = 'null'; } }, window: { location: { href: 'https://example.test/collection', replace() {} } } });
  vm.runInContext(read('assets/tp-masstepich-rechnung.js'), context); vm.runInContext(rechner, context);
  return { ...h, root, form, w, l, storage: () => JSON.parse(storage), async answer(text = daten, ok = true) { h.requests.at(-1).resolve({ ok, status: ok ? 200 : 503, text: async () => text }); await tick(); } };
}

test('Frueher Submit erhaelt 350 x 350 statt gespeicherter 200 x 300', async () => {
  const h = rechnerHarness(); h.w.value = '350'; h.l.value = '350'; h.form.requestSubmit(); await h.answer();
  assert.deepEqual(h.storage(), { w: 350, l: 350 }); assert.equal(h.form.navigations || 0, 0);
  assert.match(h.root.querySelector('[data-tp-rechner-summe]').textContent, /350 × 350/);
});
test('Teilweise Eingabe und bewusstes Leeren bleiben erhalten; unberuehrter Rueckweg restauriert', async () => {
  const partial = rechnerHarness(); partial.w.value = '350'; await partial.answer(); assert.equal(partial.w.value, '350'); assert.equal(partial.l.value, '');
  const cleared = rechnerHarness(); cleared.form.dispatchEvent({ type: 'input' }); await cleared.answer(); assert.equal(cleared.w.value, ''); assert.equal(cleared.l.value, '');
  const untouched = rechnerHarness(); await untouched.answer(); assert.equal(untouched.w.value, 200); assert.equal(untouched.l.value, 300);
});
for (const payload of ['ungueltiges JSON', '{}', '{"teppiche":{}}', '{"teppiche":[false]}', '{"teppiche":[5]}', '{"teppiche":[{"farben":[false]}]}']) {
  test('Ungueltige Antwort schuetzt Submit und kann wiederholt werden: ' + payload, async () => {
    const h = rechnerHarness(); h.w.value = '350'; h.l.value = '350'; h.form.requestSubmit(); await h.answer(payload);
    assert.equal(h.form.navigations || 0, 0); assert.equal(h.root.hasAttribute('data-tp-rechner-bereit'), false);
    assert.equal(h.root.querySelector('[data-tp-rechner-fehler]').hidden, false);
    h.form.requestSubmit(); assert.equal(h.requests.length, 2); await h.answer();
    assert.deepEqual(h.storage(), { w: 350, l: 350 }); assert.equal(h.form.navigations || 0, 0);
  });
}
test('Rechner uebersteht zwei 503 und rechnet nach dem dritten Versuch', async () => {
  const h = rechnerHarness(null); h.w.value = '350'; h.l.value = '350'; h.form.requestSubmit(); await h.answer('', false);
  h.form.requestSubmit(); await h.answer('', false); h.form.requestSubmit(); await h.answer();
  assert.equal(h.requests.length, 3); assert.deepEqual(h.storage(), { w: 350, l: 350 }); assert.equal(h.form.navigations || 0, 0);
});

test('Fehleingabe nach gueltigem Mass verbirgt das alte Ergebnis', async () => {
  for (const [w, l] of [['30', '30'], ['abc', '300'], ['', '300']]) {
    const h = rechnerHarness(null); h.w.value = '200'; h.l.value = '300'; h.form.requestSubmit(); await h.answer();
    const ergebnis = h.root.querySelector('[data-tp-rechner-ergebnis]');
    assert.equal(ergebnis.hidden, false); assert.equal(h.doc.documentElement.classList.contains('tp-rechner-aktiv'), true);
    h.w.value = w; h.l.value = l; h.form.requestSubmit();
    assert.equal(h.root.querySelector('[data-tp-rechner-fehler]').hidden, false, `${w} x ${l}: Fehlermeldung`);
    assert.equal(ergebnis.hidden, true, `${w} x ${l}: altes Ergebnis 200 x 300 verborgen`);
    assert.equal(h.doc.documentElement.classList.contains('tp-rechner-aktiv'), false, 'Raster wieder sichtbar');
    h.w.value = '250'; h.l.value = '300'; h.form.requestSubmit();
    assert.equal(ergebnis.hidden, false); assert.match(h.root.querySelector('[data-tp-rechner-summe]').textContent, /250 × 300 cm/);
  }
});
test('Komma und Punkt: auf ganze cm aufgerundet und sichtbar gesagt, wie auf der Produktseite', async () => {
  const h = rechnerHarness(null); h.w.value = '200,5'; h.l.value = '300.2'; h.form.requestSubmit(); await h.answer();
  assert.equal(h.root.querySelector('[data-tp-rechner-fehler]').hidden, true);
  assert.equal(h.w.value, '201'); assert.equal(h.l.value, '301');
  const summe = h.root.querySelector('[data-tp-rechner-summe]').textContent;
  assert.match(summe, /201 × 301 cm \(aufgerundet: 200,5 → 201 cm, 300,2 → 301 cm\)/);
  assert.deepEqual(h.storage(), { w: 201, l: 301 });
  const glatt = rechnerHarness(null); glatt.w.value = '200,0'; glatt.l.value = '300'; glatt.form.requestSubmit(); await glatt.answer();
  assert.equal(glatt.w.value, '200');
  assert.doesNotMatch(glatt.root.querySelector('[data-tp-rechner-summe]').textContent, /aufgerundet/);
  for (const falsch of ['200,', ',5', '2,0,0', '200 cm']) {
    const f = rechnerHarness(null); f.w.value = falsch; f.l.value = '300'; f.form.requestSubmit(); await f.answer();
    assert.equal(f.root.querySelector('[data-tp-rechner-fehler]').hidden, false, falsch);
  }
});

test('Querverweise unter dem Ergebnis nehmen das gerechnete Mass mit', async () => {
  const h = rechnerHarness(null);
  const ergebnis = h.root.querySelector('[data-tp-rechner-ergebnis]');
  const link = ergebnis.appendChild(h.node('a', { 'data-tp-mass-link': '/collections/jab-anstoetz-teppiche-nach-mass' }));
  h.w.value = '200'; h.l.value = '300'; h.form.requestSubmit(); await h.answer();
  assert.equal(link.href, '/collections/jab-anstoetz-teppiche-nach-mass?breite=200&laenge=300');
  h.w.value = '250,4'; h.form.requestSubmit();
  assert.equal(link.href, '/collections/jab-anstoetz-teppiche-nach-mass?breite=251&laenge=300');
});

function reihenHarness() {
  const h = documentHarness(); const row = h.doc.body.appendChild(h.node('section', { class: 'tp-zubehoer-produkte--teppich-gruppe', 'data-tp-reihe-gruppe': 'weich', 'data-tp-reihe-nachladen': '/rows' }));
  function cards(count) {
    const area = h.node('div', { 'data-tp-reihe-karten': '' });
    for (let i = 0; i < count; i++) {
      const card = area.appendChild(h.node('div', { class: 'resource-list__item' }));
      // Horizon-Karten: der umschliessende Link hat display: contents;
      // der spaetere CTA kann mit derselben Zieladresse wirklich Fokus tragen.
      card.appendChild(h.node('a', { href: '/product-' + i, style: 'display: contents' }));
      card.appendChild(h.node('a', { href: '/product-' + i, class: 'qa-visible-cta' }));
      card.appendChild(h.node('img', { src: '/bild.jpg?width=3840', srcset: '/bild.jpg?width=600 600w, /bild.jpg?width=1440 1440w', loading: 'lazy', sizes: 'auto, (min-width: 750px) 25.0vw, 50vw' }));
    }
    area.appendChild(h.node('button', { 'data-tp-gruppe-mehr': '' })); return area;
  }
  row.appendChild(cards(4));
  const fallback = row.appendChild(h.node('div', { 'data-tp-reihe-ersatz': '' }));
  const status = fallback.appendChild(h.node('p', { 'data-tp-reihe-fehler': '' })); status.hidden = true;
  const retry = fallback.appendChild(h.node('button', { 'data-tp-reihe-erneut': '' })); retry.hidden = true;
  fallback.appendChild(h.node('a', { href: '/collections/teppich-nach-mass?view=teppiche-alle' }));
  const loaded = { querySelector: () => cards(7) };
  let idle;
  const css = { supports: () => true };
  vm.runInNewContext(reihenScript, { document: h.doc, CSS: css, window: { CSS: css, requestIdleCallback(fn) { idle = fn; } }, fetch: h.fetch, DOMParser: class { parseFromString() { return loaded; } } });
  idle();
  return { ...h, row, fallback, status, retry, click(target) { for (const fn of h.doc.listeners.click) fn({ target }); }, async answer(ok = true) { h.requests.at(-1).resolve({ ok, status: ok ? 200 : 503, text: async () => 'synthetische Reihen' }); await tick(); } };
}
test('Reihen: wiederholter 503 laesst Retry und Liste erreichbar, Erfolg beendet Fehlerzustand', async () => {
  const h = reihenHarness(); await h.answer(false);
  assert.equal(h.retry.hidden, false); assert.equal(h.status.hidden, false); assert.equal(h.fallback.hidden, false);
  h.retry.focus(); h.click(h.retry); await h.answer(false); assert.equal(h.retry.hidden, false);
  h.click(h.retry); await h.answer(); assert.equal(h.requests.length, 3); assert.equal(h.fallback.hidden, true);
  assert.equal(h.row.querySelectorAll('.resource-list__item').length, 7); assert.equal(h.doc.activeElement.getAttribute('href'), '/product-0');
});
test('Reihen: nachgeladene Kartenbilder kommen ohne sizes=auto (kein 1440-px-Abruf vor dem Layout)', async () => {
  const h = reihenHarness();
  assert.equal(h.row.querySelectorAll('img')[0].getAttribute('sizes'), 'auto, (min-width: 750px) 25.0vw, 50vw');
  await h.answer();
  const bilder = h.row.querySelectorAll('img');
  assert.equal(bilder.length, 7);
  for (const img of bilder) {
    assert.equal(img.getAttribute('sizes'), '(min-width: 750px) 25.0vw, 50vw');
    // importNode kopiert in Attributreihenfolge: srcset erst nach loading und sizes.
    const reihenfolge = Object.keys(img.attrs);
    assert.deepEqual(reihenfolge.slice(-2), ['src', 'srcset']);
    assert.ok(reihenfolge.indexOf('loading') < reihenfolge.indexOf('srcset'));
    assert.equal(img.getAttribute('srcset'), '/bild.jpg?width=600 600w, /bild.jpg?width=1440 1440w');
  }
});
test('Reihen: fokussierter vorhandener Produktlink bleibt nach Ersatz beim selben Produkt', async () => {
  const h = reihenHarness(); h.row.querySelectorAll('.qa-visible-cta')[2].focus(); await h.answer();
  assert.equal(h.doc.activeElement.getAttribute('href'), '/product-2'); assert.equal(h.row.contains(h.doc.activeElement), true);
  assert.equal(h.doc.activeElement.classList.contains('qa-visible-cta'), true);
});
test('Reihen: frueher Mehrklick fuehrt Fokus zur ersten neu sichtbaren Karte', async () => {
  const h = reihenHarness(); const more = h.row.querySelector('[data-tp-gruppe-mehr]'); more.focus(); h.click(more);
  assert.equal(h.row.classList.contains('is-offen'), false, 'Noch keine neuen Karten: Mobile muss den Mehrknopf weiter zeigen');
  assert.equal(h.doc.activeElement, more);
  await tick(); assert.equal(h.row.classList.contains('is-offen'), false);
  await h.answer();
  assert.equal(h.doc.activeElement.getAttribute('href'), '/product-4'); assert.equal(h.row.classList.contains('is-offen'), true);
});
test('Reihen: nach fruehem Mehrklick wird zwischenzeitlich anderer Fokus nicht zurueckgezogen', async () => {
  const h = reihenHarness(); const more = h.row.querySelector('[data-tp-gruppe-mehr]'); more.focus(); h.click(more);
  const outside = h.doc.body.appendChild(h.node('input')); outside.focus(); await h.answer();
  assert.equal(h.doc.activeElement, outside); assert.equal(h.row.classList.contains('is-offen'), true);
});
test('Reihen: frueher Mehrklick und 503 lassen denselben Mehrknopf fuer erneuten Versuch stehen', async () => {
  const h = reihenHarness(); const more = h.row.querySelector('[data-tp-gruppe-mehr]'); more.focus(); h.click(more); await h.answer(false);
  assert.equal(h.row.classList.contains('is-offen'), false); assert.equal(h.doc.activeElement, more); assert.equal(h.row.contains(more), true);
  h.click(more); await h.answer(false); assert.equal(h.row.classList.contains('is-offen'), false);
  h.click(more); await h.answer(); assert.equal(h.doc.activeElement.getAttribute('href'), '/product-4'); assert.equal(h.row.classList.contains('is-offen'), true);
});
test('Reihen: nur fokussierter Mehrknopf bleibt bei geschlossener Reihe erhalten', async () => {
  const h = reihenHarness(); h.row.querySelector('[data-tp-gruppe-mehr]').focus(); await h.answer();
  assert.equal(h.doc.activeElement.hasAttribute('data-tp-gruppe-mehr'), true); assert.equal(h.row.contains(h.doc.activeElement), true);
});
test('Reihen: Mehrklick nach abgeschlossenem Nachladen fuehrt Fokus zur fuenften Karte', async () => {
  const h = reihenHarness(); await h.answer();
  const more = h.row.querySelector('[data-tp-gruppe-mehr]'); more.focus();
  // Wie im nativen Mobile-Fall: ein per CSS verborgener Knopf verliert Fokus.
  const add = h.row.classList.add;
  h.row.classList.add = cls => { add(cls); if (cls === 'is-offen' && h.doc.activeElement === more) h.doc.activeElement = h.doc.body; };
  h.click(more);
  assert.equal(h.doc.activeElement.getAttribute('href'), '/product-4'); assert.equal(h.row.classList.contains('is-offen'), true);
});
test('Reihen: Mehrklick nach Nachladen stiehlt keinen anderswo stehenden Fokus', async () => {
  const h = reihenHarness(); await h.answer();
  const outside = h.doc.body.appendChild(h.node('input')); outside.focus(); h.click(h.row.querySelector('[data-tp-gruppe-mehr]'));
  assert.equal(h.doc.activeElement, outside); assert.equal(h.row.classList.contains('is-offen'), true);
});
test('Reihen: Fokus ausserhalb wird nicht entzogen', async () => {
  const h = reihenHarness(); const outside = h.doc.body.appendChild(h.node('input')); outside.focus(); await h.answer(); assert.equal(h.doc.activeElement, outside);
});
test('Ohne JavaScript rendert der Ersatzweg eine ehrliche normale Liste, keine toten Filter', async () => {
  const fallback = section.match(/{%- if tp_tg_gesamt > list_items_array.size -%}[\s\S]*?data-tp-reihe-ersatz[\s\S]*?{%- endif -%}/)[0];
  const engine = new Liquid();
  for (const url of ['/collections/teppich-nach-mass', '/de/collections/teppich-nach-mass']) {
    const html = await engine.parseAndRender(fallback, { tp_tg_gesamt: 7, list_items_array: [1, 2, 3, 4], collection: { url } });
    assert.match(html, /Alle Maßteppiche als Liste ansehen/);
    assert.ok(html.includes(`href="${url}?view=teppiche-alle"`));
    assert.doesNotMatch(html, /filter\.|<noscript/);
  }
});
test('Ersatzansicht rendert serverseitige Folgeseiten statt JavaScript-Nachladen', async () => {
  const template = JSON.parse(read('templates/collection.teppiche-alle.json').replace(/^\s*\/\*[\s\S]*?\*\//, ''));
  const section = Object.values(template.sections).find(s => s.type === 'main-collection');
  const engine = new Liquid({ root: fileURLToPath(new URL('../../snippets/', import.meta.url)), extname: '.liquid' });
  for (const tag of ['doc', 'style', 'stylesheet']) {
    engine.registerTag(tag, { parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'end' + tag) {} }, render() { return ''; } });
  }
  engine.registerFilter('inline_asset_content', () => '');
  engine.registerFilter('t', value => value);
  const next = '/collections/teppich-nach-mass?view=teppiche-alle&page=2';
  const html = await engine.parseAndRender(read('snippets/product-grid.liquid'), {
    section: { ...section, id: 'qa-list' }, products: [{}], children: '<li>Testqualität</li>', request: { design_mode: true },
    enable_infinite_scroll: section.settings.enable_infinite_scroll,
    paginate: { pages: 6, current_page: 1, next: { url: next }, parts: [{ title: '1', is_link: false }, { title: '2', is_link: true, url: next }] },
  });
  assert.match(html, /class="pagination"/); assert.ok(html.includes(`href="${next}"`));
  assert.doesNotMatch(html, /ref="viewMoreNext"/);
});
