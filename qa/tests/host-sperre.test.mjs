import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const snippet = readFileSync(new URL('../../snippets/tp-host-sperre.liquid', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../../layout/theme.liquid', import.meta.url), 'utf8');
const script = snippet.match(/<script>([\s\S]*?)<\/script>/)[1];

function aufruf(hostname, pathname = '/products/x', search = '?variant=1', hash = '') {
  let geschrieben = '';
  let iframe = null;
  const location = { hostname, pathname, search, hash };
  const document = {
    write: (html) => { geschrieben += html; },
    createElement: () => ({ attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
    documentElement: { appendChild: (el) => { iframe = el; } },
  };
  vm.runInNewContext(script, { window: { location }, document, JSON });
  if (!iframe) { assert.equal(geschrieben, ''); return null; }
  assert.equal(iframe.attrs.sandbox, 'allow-scripts allow-top-navigation');
  const ziel = JSON.parse(iframe.srcdoc.match(/top\.location\.href=(".*?")<\/script>/)[1]);
  assert.equal(geschrieben.match(/content="3;url=([^"]*)"/)[1], ziel);
  return ziel;
}

test('fremder Spiegel wird auf die echte Domain umgeleitet, Pfad bleibt', () => {
  assert.equal(aufruf('www.teppich-paradies.live'), 'https://www.teppich-paradies.net/products/x?variant=1');
  assert.equal(aufruf('teppich-paradies.live', '/', '', '#a'), 'https://www.teppich-paradies.net/#a');
  assert.equal(aufruf('evil.example'), 'https://www.teppich-paradies.net/products/x?variant=1');
});

test('echte Domain, Vorschau, Editor und Hilfsdienste bleiben unberuehrt', () => {
  for (const h of ['www.teppich-paradies.net', 'teppich-paradies.net', 'sjjyq1-6w.myshopify.com',
    'abc.shopifypreview.com', 'www-teppich--paradies-net.translate.goog', 'web.archive.org',
    'webcache.googleusercontent.com', '127.0.0.1', 'localhost']) {
    assert.equal(aufruf(h), null, h);
  }
});

test('Sonderzeichen im Pfad koennen das Meta-Tag nicht aufbrechen', () => {
  assert.equal(aufruf('x.example', '/a"><script>', ''), 'https://www.teppich-paradies.net/a%22%3E%3Cscript%3E');
});

test('Domain steht nicht als Klartext im Snippet (der Spiegel ersetzt sie sonst)', () => {
  assert.ok(!script.includes('teppich-paradies.net'));
  assert.ok(!script.includes('.net'));
});

test('Sperre steht als erstes im head', () => {
  assert.match(layout, /<head>\s*\{%- render 'tp-host-sperre' -%\}/);
});
