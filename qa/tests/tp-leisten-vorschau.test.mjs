import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

// Leisten-Farbvorschau: Ein img ohne Bildquelle darf nie im HTML stehen.
// Frueher stand bei Art "muster" und "ohne" ein verstecktes img ohne src als
// Platzhalter fuer einen spaeteren Farbwechsel (Befund Shop-Pruefung 14.10.2026).

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const engine = new Liquid();
engine.registerTag('doc', { parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'enddoc') {} }, render() { return ''; } });
engine.registerFilter('asset_url', (value) => value);
engine.registerFilter('image_url', (media, ...args) => `https://cdn.example/${media.id}.jpg?width=${args.flat().find((a) => typeof a === 'number')}`);

// Hilfs-Snippets durch feste Werte ersetzen: Merkmale (Hoehe 40 mm) und Farbname.
const blockSource = read('blocks/tp-leisten-vorschau.liquid')
  .split('{% stylesheet %}')[0]
  .replace(/render 'tp-leisten-merkmale'[^\n]*/, "echo 'Kunststoff|40 mm|3|kunststoff|40mm'")
  .replace(/render 'tp-farbe-daten'[^\n]*/, 'echo tp_lv_selected');

const media = (id, width, height) => ({ id, preview_image: { width, height } });
const variante = (farbe, featured_media) => ({ options: [farbe], featured_media });

function produkt(selected, variants) {
  return {
    title: 'Feldwin Sockelleiste 40mm',
    tags: ['hoehe: 40mm'],
    options_with_values: [{ name: 'Farbe', position: 1, values: variants.map((v) => v.options[0]), selected_value: selected }],
    variants,
  };
}

const varianten = [
  variante('Weiß RAL 9010', media(1, 800, 800)), // quadratische RAL-Kachel -> muster
  variante('Anthrazit', media(2, 2000, 1500)), // Produktfoto -> foto
  variante('Grau', null), // kein Bild -> ohne
];

const render = (selected) => {
  const product = produkt(selected, varianten);
  return engine.parseAndRender(blockSource, { closest: { product }, product, block: { id: 'Abc_1', shopify_attributes: '' } });
};

for (const [farbe, art] of [['Weiß RAL 9010', 'muster'], ['Anthrazit', 'foto'], ['Grau', 'ohne']]) {
  test(`Art ${art}: kein img ohne src, kein leeres href`, async () => {
    const html = await render(farbe);
    assert.match(html, new RegExp(`data-tp-vorschau-art="${art}"`));
    for (const img of html.match(/<img\b[^>]*>/g) || []) {
      assert.match(img, /\ssrc="[^"]+"/, `img ohne Bildquelle: ${img}`);
      assert.match(img, /\salt="[^"]+"/, `Foto ohne Alt-Text: ${img}`);
    }
    assert.doesNotMatch(html, /href=""/);
  });
}

test('Foto nur bei Art foto, mit Produktname und Farbe im Alt-Text', async () => {
  assert.doesNotMatch(await render('Weiß RAL 9010'), /<img\b/);
  assert.doesNotMatch(await render('Grau'), /<img\b/);
  const foto = await render('Anthrazit');
  assert.match(foto, /<img\s+class="tp-lv__foto"\s+data-tp-vorschau-foto\s+src="https:\/\/cdn\.example\/2\.jpg\?width=900"/);
  assert.match(foto, /alt="Feldwin Sockelleiste 40mm, Farbe Anthrazit"/);
  assert.match(await render('Weiß RAL 9010'), /<image data-tp-vorschau-bild href="https:\/\/cdn\.example\/1\.jpg\?width=960"/);
});

// ---- Farbwechsel im Browser: assets/tp-leisten-vorschau.js mit Mini-DOM ----

class El {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parent = null;
    this.textContent = '';
    children.forEach((c) => this.appendChild(c));
    const self = this;
    this.classList = {
      remove: (...n) => { self.attrs.class = (self.attrs.class || '').split(' ').filter((c) => c && !n.includes(c)).join(' '); },
      add: (n) => { self.attrs.class = `${self.attrs.class || ''} ${n}`.trim(); },
    };
  }
  get id() { return this.attrs.id || ''; }
  get firstChild() { return this.children[0] || null; }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  insertBefore(c, ref) { c.parent = this; const i = ref ? this.children.indexOf(ref) : -1; this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  matches(sel) {
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    if (sel.startsWith('.')) return (this.attrs.class || '').split(' ').includes(sel.slice(1));
    const m = sel.match(/^\[([\w-]+)\]$/);
    return Boolean(m && m[1] in this.attrs);
  }
  querySelector(sel) {
    for (const c of this.children) {
      if (c.matches(sel)) return c;
      const tief = c.querySelector(sel);
      if (tief) return tief;
    }
    return null;
  }
  clone() { const k = new El(this.tagName, this.attrs, this.children.map((c) => c.clone())); k.textContent = this.textContent; return k; }
}

function vorschau(art, { foto, href } = {}) {
  const frame = new El('div', { class: 'tp-lv__frame' }, [
    ...(foto ? [new El('img', { class: 'tp-lv__foto', 'data-tp-vorschau-foto': '', src: foto, alt: `Leiste, Farbe ${foto}` })] : []),
    new El('svg', {}, [new El('image', href ? { 'data-tp-vorschau-bild': '', href } : { 'data-tp-vorschau-bild': '' })]),
  ]);
  const name = new El('strong', { 'data-tp-vorschau-name': '' });
  name.textContent = foto || href || 'leer';
  return new El('tp-leisten-vorschau', { id: 'tp-lv-abc1', class: `tp-lv tp-lv--${art}`, 'data-tp-vorschau-art': art }, [frame, name]);
}

function ladeKomponente() {
  const registry = new Map();
  const listeners = {};
  const sandbox = {
    HTMLElement: El,
    customElements: { get: (n) => registry.get(n), define: (n, k) => registry.set(n, k) },
    document: {
      importNode: (node) => node.clone(),
      addEventListener: (typ, fn) => { listeners[typ] = fn; },
    },
    window: {},
    Set,
  };
  vm.runInNewContext(read('assets/tp-leisten-vorschau.js'), sandbox);
  const Klasse = registry.get('tp-leisten-vorschau');
  return (start) => {
    // Methoden der Komponente auf das Mini-DOM-Element setzen
    Object.setPrototypeOf(start, Klasse.prototype);
    start.connectedCallback();
    return (neu) => listeners['variant:update']({ detail: { data: { html: new El('html', {}, [neu]) } } });
  };
}

const imgs = (el) => {
  const out = [];
  const lauf = (e) => { if (e.tagName === 'IMG') out.push(e); e.children.forEach(lauf); };
  lauf(el);
  return out;
};

test('Farbwechsel muster -> foto -> ohne -> muster: Foto kommt und geht, nie ohne src', () => {
  const verbinde = ladeKomponente();
  const el = vorschau('muster', { href: 'muster-1.jpg' });
  const wechsel = verbinde(el);

  wechsel(vorschau('foto', { foto: 'foto-2.jpg' }));
  assert.equal(el.getAttribute('data-tp-vorschau-art'), 'foto');
  assert.equal(imgs(el).length, 1);
  assert.equal(imgs(el)[0].getAttribute('src'), 'foto-2.jpg');
  assert.equal(imgs(el)[0].getAttribute('alt'), 'Leiste, Farbe foto-2.jpg');
  assert.equal(el.querySelector('[data-tp-vorschau-bild]').getAttribute('href'), null);

  wechsel(vorschau('foto', { foto: 'foto-3.jpg' }));
  assert.equal(imgs(el).length, 1, 'Foto wird angeglichen, nicht verdoppelt');
  assert.equal(imgs(el)[0].getAttribute('src'), 'foto-3.jpg');
  assert.equal(el.querySelector('[data-tp-vorschau-name]').textContent, 'foto-3.jpg');

  wechsel(vorschau('ohne'));
  assert.equal(imgs(el).length, 0, 'ohne Foto bleibt kein img zurueck');
  assert.match(el.getAttribute('class'), /tp-lv--ohne/);

  wechsel(vorschau('muster', { href: 'muster-4.jpg' }));
  assert.equal(imgs(el).length, 0);
  assert.equal(el.querySelector('[data-tp-vorschau-bild]').getAttribute('href'), 'muster-4.jpg');
});
