import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('assets/paginated-list.js', 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default class PaginatedList', 'class PaginatedList');
const pageHTML = page => `<ul ref="grid"><li ref="cards[]" data-page="${page}"></li></ul>`;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

function setup(renderPage, page = 1) {
  const navigations = [], historyUrls = [], added = [], listeners = new Map();
  const location = {
    href: `https://shop.test/search?q=grauer+Teppichboden&type=product&filter.color=grau&filter.color=beige&sort_by=relevance&page=${page}#raster`,
    assign: url => navigations.push(url),
  };
  let onIntersection;
  class Component {
    connectedCallback() {}
    disconnectedCallback() {}
    querySelector() { return {}; }
    getAttribute() { return 'alte-main-section'; }
  }
  const context = vm.createContext({
    Component, URL, Map,
    sectionRenderer: { getSectionHTML: renderPage },
    requestIdleCallback() {},
    viewTransition: {},
    ThemeEvents: { FilterUpdate: 'filter:update' },
    PaginatedListAspectRatioHelper: class { processNewElements() {} },
    IntersectionObserver: class {
      constructor(callback) { onIntersection = callback; }
      observe() {}
      disconnect() {}
    },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout() {},
    DOMParser: class {
      parseFromString(html) {
        const match = html.match(/<ul ref="grid"><li ref="cards\[\]" data-page="(\d+)"/);
        return { querySelector: () => match ? { querySelectorAll: () => [{ dataset: { page: match[1] } }] } : null };
      }
    },
    document: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: name => listeners.delete(name),
    },
    window: { location, scrollY: 150, scrollTo() {} },
    history: { pushState: (state, unused, url) => { historyUrls.push(url); location.href = url; } },
  });
  vm.runInContext(`${source}\nglobalThis.PaginatedList = PaginatedList;`, context);
  const list = new context.PaginatedList();
  list.isConnected = true;
  const firstCard = { dataset: { page: String(page) }, getBoundingClientRect: () => ({ top: 0 }) };
  const grid = {
    dataset: { lastPage: '4' },
    firstElementChild: firstCard,
    append: (...items) => { added.push(...items); list.refs.cards.push(...items); },
    prepend: (...items) => { added.push(...items); list.refs.cards.unshift(...items); },
  };
  list.refs = { grid, cards: [firstCard], viewMoreNext: {}, viewMorePrevious: {} };
  list.connectedCallback();
  return {
    list, location, navigations, historyUrls, added,
    intersect: async direction => {
      await onIntersection([{ target: list.refs[direction === 'next' ? 'viewMoreNext' : 'viewMorePrevious'], isIntersecting: true }]);
      await flush();
    },
    filterUpdate: () => listeners.get('filter:update')(),
  };
}

for (const direction of ['next', 'previous']) {
  test(`${direction}: erfolgreiches Nachladen ergaenzt das Raster ohne Seitennavigation`, async () => {
    const state = setup(async (id, cache, url) => pageHTML(Number(url.searchParams.get('page'))), direction === 'next' ? 1 : 2);
    await flush();
    await state.intersect(direction);
    assert.deepEqual(state.navigations, []);
    assert.equal(state.added.length, 1);
    assert.equal(state.added[0].dataset.page, direction === 'next' ? '2' : '1');
    assert.equal(new URL(state.historyUrls[0]).searchParams.get('page'), direction === 'next' ? '2' : '1');
  });

  for (const failure of ['alte Section', 'leere Sectionantwort', 'Netzfehler']) {
    test(`${direction}: ${failure} navigiert erst beim aktiven Nachladen zur normalen Zielseite`, async () => {
      const state = setup(async (id, cache, url) => {
        url.searchParams.set('section_id', id);
        if (failure === 'Netzfehler') throw new TypeError('Failed to fetch');
        if (failure === 'leere Sectionantwort') return '';
        return '<h1>Section not found</h1>';
      }, direction === 'next' ? 1 : 2);
      await flush();
      assert.deepEqual(state.navigations, [], 'Hintergrund-Prefetch darf nicht navigieren');
      await state.intersect(direction);
      assert.equal(state.navigations.length, 1);
      const target = new URL(state.navigations[0]);
      assert.equal(target.pathname, '/search');
      assert.equal(target.searchParams.get('q'), 'grauer Teppichboden');
      assert.equal(target.searchParams.get('type'), 'product');
      assert.deepEqual(target.searchParams.getAll('filter.color'), ['grau', 'beige']);
      assert.equal(target.searchParams.get('sort_by'), 'relevance');
      assert.equal(target.searchParams.get('page'), direction === 'next' ? '2' : '1');
      assert.equal(target.hash, '#raster');
      assert.equal(target.searchParams.has('section_id'), false);
      assert.deepEqual(state.historyUrls, []);
    });
  }
}

for (const changed of ['URL', 'entferntes Element', 'neue Filtergeneration']) {
  test(`Verspaeteter Fehler nach ${changed} loest keine Navigation aus`, async () => {
    let calls = 0;
    const pending = deferred();
    const state = setup(async () => {
      if (++calls === 1) throw new TypeError('Prefetch failed');
      return pending.promise;
    });
    await flush();
    const active = state.intersect('next');
    await flush();
    if (changed === 'URL') state.location.href = 'https://shop.test/collections/vinylboden';
    if (changed === 'entferntes Element') { state.list.isConnected = false; state.list.disconnectedCallback(); }
    if (changed === 'neue Filtergeneration') state.filterUpdate();
    pending.reject(new TypeError('Old request failed'));
    await active;
    await flush();
    assert.deepEqual(state.navigations, []);
    assert.deepEqual(state.historyUrls, []);
  });
}

test('Ein abgebrochener aktiver Abruf erzwingt keine Seitennavigation', async () => {
  let calls = 0;
  const state = setup(async () => {
    if (++calls === 1) throw new TypeError('Prefetch failed');
    throw Object.assign(new Error('Request aborted'), { name: 'AbortError' });
  });
  await flush();
  await state.intersect('next');
  assert.deepEqual(state.navigations, []);
  assert.deepEqual(state.historyUrls, []);
});

test('Ein aelterer Abruf beendet den neueren aktiven Abruf derselben Seite nicht vorzeitig', async () => {
  const older = deferred(), newer = deferred();
  let calls = 0;
  const state = setup(async () => {
    calls++;
    if (calls === 1) throw new TypeError('Prefetch failed');
    return calls === 2 ? older.promise : newer.promise;
  });
  await flush();
  const first = state.intersect('next');
  await flush();
  const second = state.intersect('next');
  await flush();
  older.reject(new TypeError('Older request failed'));
  await first;
  assert.deepEqual(state.navigations, []);
  assert.equal(state.added.length, 0);
  newer.resolve(pageHTML(2));
  await second;
  await flush();
  assert.deepEqual(state.navigations, []);
  assert.equal(state.added.length, 1);
});
