import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const source = readFileSync(new URL('../../assets/tp-produktberatung.js', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../locales/de.json', import.meta.url), 'utf8');
const labels = JSON.parse(locale.slice(locale.indexOf('{'))).tp_product_advice;

function seite(options = {}) {
  const listeners = new Map();
  const attributes = new Map();
  const selections = [{ value: 'Beige' }, { value: '400 cm' }];
  const data = {
    title: 'Wohnteppich & mehr', handle: 'wohnteppich', url: '/products/wohnteppich', labels,
    options: options.options || [{ name: 'Farbe', value: 'Rot' }, { name: 'Breite', value: '400 cm' }],
  };
  let size = options.size === undefined ? { art: 'raum', breite: 250, laenge: 300 } : options.size;
  const roll = options.noRoll ? null : { tpRwcBestellmass: options.noMethod ? undefined : () => size };
  const fields = selections.map(input => ({ querySelector: selector => selector === 'input:checked, select' ? input : null }));
  const picker = { querySelectorAll: () => fields };
  const scope = {
    querySelector(selector) {
      if (selector === '[data-tp-beratung-daten="42"]') return { textContent: options.badJson ? '{' : JSON.stringify(data) };
      if (selector === 'variant-picker[data-product-id="42"]') return options.noPicker ? null : picker;
      if (selector === '[id^="tp-rwc-"][data-product-id="42"]') return roll;
      return null;
    },
  };
  const link = {
    href: options.href || 'https://wa.me/4912345',
    getAttribute(name) { return name === 'data-tp-produkt-id' ? '42' : (options.mode || 'whatsapp'); },
    closest() { return scope; },
  };
  const document = {
    documentElement: { hasAttribute: name => attributes.has(name), setAttribute: (name, value) => attributes.set(name, value) },
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
    },
  };
  const context = { document, window: { location: { origin: 'https://shop.example', search: '?variant=999&preview_theme_id=123' } }, URL, URLSearchParams };
  const run = () => vm.runInNewContext(source, context);
  run();
  return {
    link, data, selections, listeners, run,
    size(value) { size = value; },
    activate(name = 'click') { for (const listener of listeners.get(name) || []) listener({ target: { closest: () => link } }); },
    message() { return new URL(link.href).searchParams.get('text'); },
  };
}

test('WhatsApp liest aktuelle Farbe und bestehendes normalisiertes Raummass erst beim Aktivieren', () => {
  const p = seite();
  assert.equal(new URL(p.link.href).searchParams.has('text'), false);
  p.activate();
  assert.match(p.message(), /Wohnteppich & mehr/);
  assert.match(p.message(), /Auswahl: Beige/);
  assert.match(p.message(), /Maße im Rechner \(Raummaß\): Breite 250 cm, Länge 300 cm/);
  assert.doesNotMatch(p.message(), /Rot|400 cm|preview_theme_id|variant=999/);
  assert.match(p.message(), /https:\/\/shop\.example\/products\/wohnteppich$/);
  p.selections[0].value = 'Grau';
  p.size({ art: 'meter', breite: 500, laenge: 550 });
  p.activate();
  assert.match(p.message(), /Auswahl: Grau/);
  assert.match(p.message(), /\(Meterware\): Breite 500 cm, Länge 550 cm/);
  assert.doesNotMatch(p.message(), /Beige|250 cm/);
});

test('Bestehende Verlegeanfrage behält Thema und übernimmt aktuelle Auswahl sowie cm-Werte', () => {
  const p = seite({ mode: 'kontakt', href: 'https://shop.example/pages/kontakt?thema=verlegung&variante=Rot&breite=Alt&laenge_cm=Alt' });
  p.activate();
  const params = new URL(p.link.href).searchParams;
  assert.equal(params.get('thema'), 'verlegung');
  assert.equal(params.get('produkt'), 'Wohnteppich & mehr');
  assert.equal(params.get('handle'), 'wohnteppich');
  assert.equal(params.get('variante'), 'Beige');
  assert.equal(params.get('breite'), '250 cm');
  assert.equal(params.get('laenge_cm'), '300');
  p.size({ art: 'raum', breite: 0, laenge: 0 });
  p.activate();
  assert.equal(new URL(p.link.href).searchParams.has('breite'), false);
  assert.equal(new URL(p.link.href).searchParams.has('laenge_cm'), false);
});

test('Standardprodukte behalten alle aktuellen Optionen und benötigen keinen Rechner', () => {
  const p = seite({ noRoll: true });
  p.activate('auxclick');
  assert.match(p.message(), /Auswahl: Beige \/ 400 cm/);
  assert.doesNotMatch(p.message(), /Maße im Rechner/);
});

test('Ohne Picker bleibt die gerenderte Auswahl erhalten, Standardtitel und ungültige Maße fallen weg', () => {
  const p = seite({ noPicker: true, options: [{ name: 'Title', value: 'Default Title' }], size: { art: 'raum', breite: NaN, laenge: Infinity } });
  p.activate('contextmenu');
  assert.doesNotMatch(p.message(), /Auswahl|Default Title|Maße im Rechner/);
});

test('Mehrfach gerenderte Komponenten registrieren jeden Aktivierungsweg nur einmal', () => {
  const p = seite();
  p.run();
  assert.deepEqual([...p.listeners.values()].map(listeners => listeners.length), [1, 1, 1]);
});

test('Fehlender Rechner oder fehlerhafte optionale Daten blockieren keine vorhandenen Links', () => {
  const p = seite({ noMethod: true });
  p.activate();
  assert.doesNotMatch(p.message(), /Maße im Rechner/);
  const broken = seite({ badJson: true });
  assert.doesNotThrow(() => broken.activate());
  assert.equal(broken.link.href, 'https://wa.me/4912345');
});

test('Produktdaten werden nur an vorhandene WhatsApp- bzw. eigene Kontaktziele angehängt', () => {
  for (const mode of ['whatsapp', 'kontakt']) {
    const p = seite({ mode, href: 'https://elsewhere.example/form' });
    p.activate();
    assert.equal(p.link.href, 'https://elsewhere.example/form');
  }
});

test('Produkt- und Auswahlnamen bleiben Daten, auch wenn sie HTML-Script-Enden enthalten', async () => {
  const engine = new Liquid();
  engine.registerFilter('json', value => JSON.stringify(value));
  engine.registerFilter('t', key => labels[key.split('.').at(-1)]);
  engine.registerFilter('asset_url', value => '/assets/' + value);
  const template = readFileSync(new URL('../../snippets/tp-produktberatung.liquid', import.meta.url), 'utf8').replace(/\{% doc %\}[\s\S]*?\{% enddoc %\}/, '');
  const title = '</script><img src=x onerror=alert(1)>';
  const html = await engine.parseAndRender(template, {
    product: { id: 42, title, handle: 'wohnteppich', url: '/products/wohnteppich', options_with_values: [{ name: 'Farbe', selected_value: title }] },
  });
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.equal((html.match(/<\/script>/g) || []).length, 2);
  const payload = JSON.parse(html.match(/data-tp-beratung-daten="42">([\s\S]*?)<\/script>/)[1]);
  assert.equal(payload.title, title);
  assert.equal(payload.options[0].value, title);
  assert.doesNotMatch(html, /<img/);
});
