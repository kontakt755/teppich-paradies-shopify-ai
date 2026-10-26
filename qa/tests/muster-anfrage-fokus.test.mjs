import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../assets/tp-sample-request.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../../sections/contact-form.liquid', import.meta.url), 'utf8');

function seite(options = {}) {
  const focus = [];
  const scroll = [];
  const frames = [];
  const listeners = new Map();
  const fields = new Map();
  const attributes = new Map();
  const rootAttributes = new Map();
  const document = {
    body: {}, documentElement: {},
    querySelector: selector => selector === '[data-tp-sample-request]' ? root : null,
    addEventListener(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
    },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
  };
  document.activeElement = options.active || document.body;
  const message = { value: options.message || '', required: true };
  const hint = {
    hidden: true, textContent: '', isConnected: true,
    hasAttribute: name => attributes.has(name),
    setAttribute: (name, value) => attributes.set(name, value),
    focus(settings) { focus.push({ target: 'hint', settings }); document.activeElement = hint; },
    scrollIntoView(settings) { scroll.push(settings); },
  };
  const error = { focus() { focus.push({ target: 'error' }); document.activeElement = error; } };
  const success = { focus() { focus.push({ target: 'success' }); document.activeElement = success; } };
  const root = {
    setAttribute(name, value) { rootAttributes.set(name, value); },
    querySelector(selector) {
      if (selector === '[data-tp-anfrage-hinweis]') return options.noHint ? null : hint;
      if (selector === '[data-message-field]') return message;
      if (selector === '.tp-form-error') return options.error ? error : null;
      if (selector.startsWith('.tp-success--')) return options.success ? success : null;
      const name = selector.match(/^\[data-tp-hidden-field="(.+)"\]$/)?.[1];
      if (name) {
        if (!fields.has(name)) fields.set(name, { value: '' });
        return fields.get(name);
      }
      return null;
    },
  };
  const window = {
    location: {
      search: options.search ?? '?thema=musteranfrage&produkt=Grandessa%20Eiche&handle=grandessa-eiche',
      origin: 'https://shop.example', hash: options.hash || '',
    },
    performance: options.noNavigationApi ? {} : { getEntriesByType: () => options.noNavigationEntry ? [] : [{ type: options.navigation || 'navigate' }] },
    scrollX: 0, scrollY: 0,
    requestAnimationFrame: callback => frames.push(callback),
  };
  const context = { window, document, URLSearchParams, fetch() { throw new Error('Kein Produktabruf im Anfrage-Einstieg'); } };
  const run = () => vm.runInNewContext(source, context);
  run();
  return {
    window, document, hint, focus, scroll, message, fields, frames, run, rootAttributes,
    flush() { while (frames.length) frames.shift()(); },
    event(name) { for (const listener of listeners.get(name) || []) listener(); },
    listenerCount() { return [...listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0); },
  };
}

test('Produktanfrage: vorhandenen Kontext fokussieren, Felder und Nachricht unveraendert vorbelegen', () => {
  const p = seite();
  assert.equal(p.hint.textContent, 'Musteranfrage: Grandessa Eiche');
  assert.equal(p.hint.hidden, false);
  assert.equal(p.fields.get('Betreff').value, 'Musteranfrage');
  assert.equal(p.fields.get('Produkt').value, 'Grandessa Eiche');
  assert.equal(p.fields.get('Produkt-Handle').value, 'grandessa-eiche');
  assert.equal(p.fields.get('Produkt-Link').value, 'https://shop.example/products/grandessa-eiche');
  assert.match(p.message.value, /kostenloses Muster von Grandessa Eiche/);
  assert.equal(p.message.required, true);
  assert.equal(p.focus.length, 0);
  p.flush();
  assert.equal(p.document.activeElement, p.hint);
  assert.deepEqual(JSON.parse(JSON.stringify(p.focus)), [{ target: 'hint', settings: { preventScroll: true } }]);
  assert.deepEqual(JSON.parse(JSON.stringify(p.scroll)), [{ block: 'start', behavior: 'instant' }]);
  assert.equal(p.listenerCount(), 0);
});

test('Allgemeine Musteranfrage ohne Produkt behaelt den vorhandenen Kontext', () => {
  const p = seite({ search: '?thema=musteranfrage' });
  p.flush();
  assert.equal(p.hint.textContent, 'Musteranfrage');
  assert.equal(p.document.activeElement, p.hint);
  assert.equal(p.fields.get('Produkt').value, '');
});

test('Andere Themen und selbstbedienter Mustermodus erhalten keinen Einstiegssprung', () => {
  for (const thema of ['', 'angebot', 'beratung', 'verlegung', 'muster', 'unbekannt']) {
    const p = seite({ search: thema ? '?thema=' + thema : '' });
    p.flush();
    assert.equal(p.focus.length, 0, thema);
    assert.equal(p.scroll.length, 0, thema);
  }
});

test('Fehler und Erfolg behalten Vorrang, Fehler auch bei gleichzeitigem Erfolgsmarkup', () => {
  for (const state of [{ error: true }, { success: true }, { error: true, success: true }]) {
    const p = seite(state);
    p.flush();
    assert.deepEqual(p.focus.map(x => x.target), [state.error ? 'error' : 'success']);
    assert.equal(p.scroll.length, 0);
    assert.equal(p.frames.length, 0);
  }
});

test('Reload, Zuruecknavigation und explizite Fragmente erhalten den Browserzustand', () => {
  for (const state of [{ navigation: 'reload' }, { navigation: 'back_forward' }, { hash: '#kontakt' }, { hash: '#ContactForm-sample' }]) {
    const p = seite(state);
    p.flush();
    assert.equal(p.focus.length, 0, JSON.stringify(state));
    assert.equal(p.scroll.length, 0, JSON.stringify(state));
  }
  const p = seite();
  p.window.location.hash = '#anderes-ziel';
  p.flush();
  assert.equal(p.focus.length, 0);
});

test('Manueller Fokus oder Scrollstand vor dem Sprung wird nicht ueberschrieben', () => {
  for (const change of [
    p => { p.document.activeElement = {}; },
    p => { p.window.scrollY = 200; },
    p => { p.window.scrollX = 20; },
  ]) {
    const p = seite();
    change(p);
    p.flush();
    assert.equal(p.focus.length, 0);
    assert.equal(p.scroll.length, 0);
    assert.equal(p.listenerCount(), 0);
  }
});

test('Tippen, Zeigen, Touch oder Rad vor dem naechsten Bild verhindern den Fokuswechsel', () => {
  for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    const p = seite();
    p.event(event);
    p.flush();
    assert.equal(p.focus.length, 0, event);
    assert.equal(p.scroll.length, 0, event);
    assert.equal(p.listenerCount(), 0, event);
  }
});

test('Entferntes oder verborgenes Ziel sowie fehlender Hinweis bleiben ohne Sprung', () => {
  for (const change of [p => { p.hint.isConnected = false; }, p => { p.hint.hidden = true; }]) {
    const p = seite();
    change(p);
    p.flush();
    assert.equal(p.focus.length, 0);
    assert.equal(p.listenerCount(), 0);
  }
  assert.equal(seite({ noHint: true }).frames.length, 0);
});

test('Erneute Skriptausfuehrung fokussiert dieselbe Formularinstanz hoechstens einmal', () => {
  const p = seite({ message: 'Mein vorhandener Text' });
  p.run();
  assert.equal(p.frames.length, 1);
  p.flush();
  p.run();
  p.flush();
  assert.equal(p.focus.length, 1);
  assert.equal(p.message.value, 'Mein vorhandener Text');
});

test('Ohne Navigation-Timing-API oder Navigationseintrag bleibt der Browserzustand erhalten', () => {
  for (const state of [{ noNavigationApi: true }, { noNavigationEntry: true }]) {
    const p = seite(state);
    p.flush();
    assert.equal(p.document.activeElement, p.document.body);
    assert.equal(p.focus.length, 0);
    assert.equal(p.scroll.length, 0);
    assert.equal(p.frames.length, 0);
  }
});

test('Vorhandener Hinweis ist fokussierbar, ohne Eingabe-Autofokus oder neuen Tabstopp', () => {
  assert.match(markup, /<p[^>]*data-tp-anfrage-hinweis[^>]*tabindex="-1"[^>]*hidden/);
  assert.match(markup, /\.tp-anfrage-hinweis\s*\{\s*scroll-margin-top:\s*calc\(var\(--header-height,/);
  assert.doesNotMatch(markup, /\sautofocus(?:\s|=|>)/);
});

test('Verlege- und Angebotsanfrage blenden PLZ und Telefon ein, andere Themen nicht', () => {
  for (const thema of ['verlegung', 'angebot']) {
    const p = seite({ search: '?thema=' + thema + '&produkt=Eiche%20Hell' });
    assert.equal(p.rootAttributes.has('data-anfrage-felder'), true, thema);
  }
  for (const thema of ['beratung', 'musteranfrage', '', 'muster']) {
    const p = seite({ search: thema ? '?thema=' + thema : '' });
    assert.equal(p.rootAttributes.has('data-anfrage-felder'), false, thema);
  }
  // Im Markup tragen genau PLZ und Telefon die Markierung, beide ohne required.
  const felder = [...markup.matchAll(/<div data-sample-field data-anfrage-feld>\s*<label for="(\w+)"[\s\S]*?<input([^>]*)>/g)];
  assert.deepEqual(felder.map(m => m[1]), ['ContactFormZip', 'ContactFormPhone']);
  for (const m of felder) assert.doesNotMatch(m[2], /required/);
  assert.match(markup, /\[data-tp-sample-request\]\[data-anfrage-felder\] \[data-anfrage-feld\] \{\s*display: block;/);
});
