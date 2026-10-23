import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { blackFriday, zeitraum, zeitpunktBerlin, mutationen } from '../../scripts/aktion-plan.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const kalender = JSON.parse(readFileSync(path.join(root, 'domains/shopify/aktionskalender.json'), 'utf8'));
const welle = overrides => ({ id: 'testwelle', titel: 'Testaktion', von: '06-15', bis: '07-05',
  kollektion: 'test-kollektion', prozent: 15, freigegeben: true, ...overrides });

test('Jahreswellen bleiben ohne erfundene Rabattwerte und Freigabe gesperrt', () => {
  assert.equal(kalender.wellen.length, 7);
  for (const w of kalender.wellen) {
    assert.equal(w.prozent, null, w.id);
    assert.equal(w.freigegeben, false, w.id);
    assert.throws(() => mutationen(w, 2026), /fachlich noch nicht freigegeben/);
  }
  const r = spawnSync(process.execPath, ['scripts/aktion-plan.mjs', '--welle', 'black-week'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /fachlich noch nicht freigegeben/);
});

test('Direkter Generatoraufruf akzeptiert keine fehlenden oder ungueltigen Geschaeftswerte', () => {
  for (const prozent of [null, 0, -1, 51, 1.5, '15', Infinity]) {
    assert.throws(() => mutationen(welle({ prozent }), 2026), /Prozentsatz/);
  }
  assert.throws(() => mutationen(welle({ kollektion: '' }), 2026), /Kollektions-Handle/);
  assert.throws(() => mutationen(welle({ kollektion: 'test"/>' }), 2026), /Kollektions-Handle/);
  for (const jahr of [NaN, 0, 2026.5, 10000]) assert.throws(() => mutationen(welle(), jahr), /Jahr/);
  assert.throws(() => mutationen(welle({ von: '02-30' }), 2026), /Aktionsdatum/);
  assert.throws(() => mutationen(welle({ von: '12-31', bis: '01-01' }), 2026), /vor dem Start/);
});

test('Black Week folgt dem Black Friday und Cyber Monday des ausgewaehlten Jahres', () => {
  assert.equal(blackFriday(2026).toISOString().slice(0, 10), '2026-11-27');
  assert.deepEqual(zeitraum({ id: 'black-week' }, 2026), { von: '2026-11-23', bis: '2026-11-30' });
  assert.deepEqual(zeitraum({ id: 'black-week' }, 2027), { von: '2027-11-22', bis: '2027-11-29' });
});

test('Berliner Aktionsgrenzen beachten Sommerzeit und beide Zeitumstellungen', () => {
  assert.equal(zeitpunktBerlin('2026-01-07'), '2026-01-07T00:00:00+01:00');
  assert.equal(zeitpunktBerlin('2026-06-15'), '2026-06-15T00:00:00+02:00');
  assert.equal(zeitpunktBerlin('2026-03-29'), '2026-03-29T00:00:00+01:00');
  assert.equal(zeitpunktBerlin('2026-03-29', true), '2026-03-29T23:59:59+02:00');
  assert.equal(zeitpunktBerlin('2026-10-25'), '2026-10-25T00:00:00+02:00');
  assert.equal(zeitpunktBerlin('2026-10-25', true), '2026-10-25T23:59:59+01:00');
});

test('Vorbereitung erzeugt passenden Rabatt und absichtlich noch inaktive Anzeige', () => {
  const m = mutationen(welle(), 2026);
  assert.equal(m.rabatt.variables.d.startsAt, '2026-06-15T00:00:00+02:00');
  assert.equal(m.rabatt.variables.d.endsAt, '2026-07-05T23:59:59+02:00');
  assert.equal(m.rabatt.variables.d.customerGets.value.percentage, 0.15);
  assert.deepEqual(m.rabatt.variables.d.combinesWith, { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false });
  const fields = Object.fromEntries(m.anzeige.variables.m.fields.map(f => [f.key, f.value]));
  assert.equal(fields.prozent, '15');
  assert.equal(fields.aktiv, 'false');
  assert.equal(fields.kollektion, m.rabatt.variables.d.customerGets.items.collections.add[0]);
  assert.match(m.hinweis, /bereits reduzierte Ware, Muster, Zubehoer und Auslauf pruefen/);
  assert.match(m.hinweis, /Rabatt.*zuruecklesen/);
});

const source = name => readFileSync(path.join(root, name), 'utf8')
  .replace(/{%-?\s*(doc|stylesheet|schema)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '')
  .replace("assign tas_heute = 'now'", "assign tas_heute = '2026-10-23'");
const engine = new Liquid({ templates: { 'tp-aktion-shopweit': source('snippets/tp-aktion-shopweit.liquid') } });
const aktion = overrides => ({ aktiv: { value: true }, start: { value: '2026-10-01' }, ende: { value: '2026-10-31' },
  prozent: { value: 15 }, titel: { value: 'Herbstaktion' },
  kollektion: { value: { id: 1, title: 'Teppichboden', url: '/collections/test-kollektion' } }, ...overrides });
const shop = values => ({ metaobjects: { tp_aktion: { values } } });

test('Shopweite Anzeige ignoriert inaktive, zukuenftige, abgelaufene und unvollstaendige Aktionen', async () => {
  for (const a of [aktion({ aktiv: { value: false } }), aktion({ start: { value: '2026-11-01' } }),
    aktion({ ende: { value: '2026-10-22' } }), aktion({ start: { value: null } }),
    aktion({ kollektion: { value: null } }), ...[0, -1, 51].map(p => aktion({ prozent: { value: p } }))]) {
    assert.equal((await engine.parseAndRender(source('snippets/tp-aktion-shopweit.liquid'), { shop: shop([a]) })).trim(), '');
  }
});

test('Anfang und Ende zaehlen mit, bei Ueberlappung gewinnt der hoechste echte Prozentsatz', async () => {
  const a = aktion({ start: { value: '2026-10-23' }, ende: { value: '2026-10-23' } });
  const b = aktion({ prozent: { value: 20 }, titel: { value: 'Welle | zwei' } });
  const html = await engine.parseAndRender(source('snippets/tp-aktion-shopweit.liquid'), { shop: shop([a, b]) });
  assert.equal(html.trim(), '20|20261031|Welle  zwei|/collections/test-kollektion|Teppichboden');
  const inklusiv = await engine.parseAndRender(source('snippets/tp-aktion-shopweit.liquid'), { shop: shop([a]) });
  assert.match(inklusiv, /^15\|20261023\|/);
});

test('Topbar bleibt standardmaessig unveraendert und gibt Aktionstexte und Link sicher aus', async () => {
  const group = JSON.parse(readFileSync(path.join(root, 'sections/header-group.json'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
  const topbar = Object.values(group.sections).find(s => s.type === 'tp-topbar');
  assert.equal(topbar.settings.aktion_zeigen, false);
  const template = source('sections/tp-topbar.liquid');
  const settings = { ...topbar.settings };
  const normal = { id: 'normal', settings: { text: 'Bekannter Vorteil', link: '' } };
  const context = { shop: shop([aktion()]), section: { settings, blocks: [normal] } };
  const aus = await engine.parseAndRender(template, context, { globals: { shop: context.shop } });
  assert.doesNotMatch(aus, /data-tp-aktion=/);
  assert.match(aus, /Bekannter Vorteil/);
  const aktiverShop = shop([aktion({ titel: { value: '<img src=x onerror=alert(1)>' }, kollektion: { value: { title: '<b>Ware</b>', url: '/collections/test?q="bad"' } } })]);
  const aktiv = await engine.parseAndRender(template, { ...context, section: { settings: { ...settings, aktion_zeigen: true }, blocks: [normal] } }, { globals: { shop: aktiverShop } });
  assert.match(aktiv, /data-tp-aktion="15"/);
  assert.match(aktiv, /bis 31\.10\./);
  assert.doesNotMatch(aktiv, /<img src=x|<b>Ware/);
  assert.match(aktiv, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(aktiv, /href="\/collections\/test\?q=(?:&quot;|&#34;)bad(?:&quot;|&#34;)"/);
});
