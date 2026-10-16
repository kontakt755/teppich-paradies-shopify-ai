import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('assets/facets.js', 'utf8');
const helper = source.slice(source.indexOf('function renderFacetsSection('), source.indexOf('function restoreFilterDialogFocus('));

function setup(renderSection, href = 'https://shop.test/search?q=grauer+Teppichboden&filter.color=grau&filter.color=beige&sort_by=relevance#raster') {
  const navigations = [];
  const location = { href, replace: url => navigations.push(url) };
  const context = vm.createContext({ window: { location }, sectionRenderer: { renderSection } });
  vm.runInContext(`${helper}\nglobalThis.render = renderFacetsSection;`, context);
  return { render: context.render, location, navigations };
}

test('Erfolgreiches Filtern behaelt Section-Rendering ohne Seitennavigation', async () => {
  const calls = [];
  const { render, navigations } = setup(async id => { calls.push(id); return '<section>Treffer</section>'; });
  assert.equal(await render('main'), '<section>Treffer</section>');
  assert.deepEqual(calls, ['main']);
  assert.deepEqual(navigations, []);
});

test('Fehlende Section nach Themewechsel und Netzfehler laden die exakt gewaehlte normale Filter-URL', async () => {
  for (const error of [new Error('Section main not found in the section rendering response'), new TypeError('Failed to fetch')]) {
    const { render, location, navigations } = setup(async () => { throw error; });
    await render('alte-section');
    assert.deepEqual(navigations, [location.href]);
    const target = new URL(navigations[0]);
    assert.equal(target.searchParams.get('q'), 'grauer Teppichboden');
    assert.deepEqual(target.searchParams.getAll('filter.color'), ['grau', 'beige']);
    assert.equal(target.searchParams.get('sort_by'), 'relevance');
    assert.equal(target.hash, '#raster');
    assert.equal(target.searchParams.has('section_id'), false);
  }
});

test('Spaeter Fehler einer alten Auswahl ueberschreibt keine inzwischen neuere Filter-URL', async () => {
  let reject;
  const { render, location, navigations } = setup(() => new Promise((resolve, fail) => { reject = fail; }));
  const pending = render('alte-section');
  location.href = 'https://shop.test/search?q=vinyl&filter.color=schwarz';
  reject(new Error('Section not found'));
  await pending;
  assert.deepEqual(navigations, []);
});

test('Absichtlich abgebrochene Anfrage loest keine Seitennavigation aus', async () => {
  const { render, navigations } = setup(async () => { throw new DOMException('Abgebrochen', 'AbortError'); });
  await render('main');
  assert.deepEqual(navigations, []);
});
