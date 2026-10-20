import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Liquid } from 'liquidjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const block = read('blocks/tp-einfass-konfigurator.liquid');
const start = block.indexOf('<div class="tp-ek__schritt" data-schritt="masse">');
const end = block.indexOf('\n      {%- comment -%}', start);
assert.ok(start >= 0 && end > start, 'Massabschnitt fehlt');
const templates = Object.fromEntries(['tp-step-heading', 'tp-teppich-groessenhilfe'].map((name) => [name, read(`snippets/${name}.liquid`)]));
const locale = read('locales/de.json');
const translations = JSON.parse(locale.slice(locale.indexOf('{')));

const engine = new Liquid({ templates });
for (const name of ['doc', 'stylesheet']) engine.registerTag(name, {
  parse(_token, tokens) { while (tokens.length && tokens.shift().name !== `end${name}`) {} },
  render() { return ''; },
});
engine.registerFilter('t', (key) => key.split('.').reduce((value, part) => value?.[part], translations));

// HTMLParser prueft den tatsaechlich gerenderten Baum statt Quelltextanker
// auf eine bestimmte Render-Anweisung festzuschreiben. Python gehoert zur CI.
function nodes(html) {
  return JSON.parse(execFileSync('python3', ['-c', `
from html.parser import HTMLParser
import json,sys
class Parser(HTMLParser):
 def __init__(self):
  super().__init__();self.nodes=[]
 def handle_starttag(self,tag,attrs):
  self.nodes.append({'tag':tag,'attrs':dict(attrs)})
p=Parser();p.feed(sys.stdin.read());print(json.dumps(p.nodes))
`], { input: html, encoding: 'utf8' }));
}

async function render(wort = 'teppich') {
  const html = await engine.parseAndRender(block.slice(start, end), {
    tp_ek_id: 'test', tp_ek_wort: wort, tp_ek_min_cm: 50,
    tp_ek_ph: ['250', '400', wort === 'matte' ? 'Matten' : 'Teppiche'],
  });
  return nodes(html);
}

test('Gerenderte Massfelder, Grenzen und Alarm bleiben vor der aufklappbaren Hilfe', async () => {
  const dom = await render();
  const index = (predicate) => dom.findIndex(predicate);
  const breite = index((node) => 'data-breite' in node.attrs);
  const laenge = index((node) => 'data-laenge' in node.attrs);
  const grenzen = index((node) => 'data-grenzen' in node.attrs);
  const fehler = index((node) => 'data-fehler' in node.attrs);
  const hilfe = index((node) => node.attrs.class === 'tp-groessenhilfe');
  assert.ok(breite >= 0 && laenge > breite);
  assert.ok(grenzen > laenge && fehler > grenzen);
  assert.ok(hilfe > fehler, 'Ein offener Ratgeber darf nicht mehr zwischen Massfeldern und Fehlermeldung stehen');
  assert.equal(dom[fehler].attrs.role, 'alert');
  assert.equal(dom[hilfe].tag, 'details');
  assert.ok(!('open' in dom[hilfe].attrs));
});

test('Matten behalten Grenzen und Fehler ohne unpassende Sofa-/Esstischhilfe', async () => {
  const dom = await render('matte');
  assert.ok(dom.some((node) => 'data-grenzen' in node.attrs));
  assert.ok(dom.some((node) => 'data-fehler' in node.attrs && node.attrs.role === 'alert'));
  assert.ok(!dom.some((node) => node.attrs.class === 'tp-groessenhilfe'));
});
