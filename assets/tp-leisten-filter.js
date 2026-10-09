(function () {
  'use strict';
  if (window.tpLeistenFilterReady) return;
  window.tpLeistenFilterReady = true;

  var controller;
  var version = 0;

  function root() {
    return document.querySelector('[data-tp-leisten]');
  }

  function migrateHash() {
    var element = root();
    if (!element || window.location.hash.indexOf('#leisten:') !== 0) return false;
    var tags;
    try {
      tags = JSON.parse(element.querySelector('[data-tp-leisten-tags]').textContent);
    } catch (error) {
      return false;
    }
    var legacy = new URLSearchParams(window.location.hash.slice(9));
    var selected = [];
    ['material', 'hoehe'].forEach(function (group) {
      var key = legacy.get(group);
      if (!key) return;
      var tag = tags.find(function (entry) {
        var parts = entry.toLowerCase().split(':');
        return parts[0].trim() === group && parts.slice(1).join(':').trim() === key.toLowerCase();
      });
      if (tag) selected.push(tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    });
    var target = new URL(window.location.href);
    target.pathname = element.dataset.collectionUrl + (selected.length ? '/' + selected.join('+') : '');
    target.searchParams.delete('page');
    target.hash = 'bodenleisten-produkte';
    window.location.replace(target.href);
    return true;
  }

  function normalizeLegacyHeight() {
    var element = root();
    if (!element) return false;
    var currentTags;
    var heights;
    try {
      currentTags = JSON.parse(element.querySelector('[data-tp-leisten-current-tags]').textContent) || [];
      heights = JSON.parse(element.querySelector('[data-tp-leisten-heights]').textContent) || [];
    } catch (error) {
      return false;
    }
    var legacyHeights = currentTags.filter(function (tag) {
      return tag.toLowerCase().split(':')[0].trim() === 'hoehe';
    }).map(function (tag) {
      return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    });
    if (!legacyHeights.length) return false;
    var target = new URL(window.location.href);
    var nativeParam = 'filter.p.m.custom.leistenhoehe';
    if (!target.searchParams.has(nativeParam)) {
      var candidates = heights.filter(function (height) { return height.count > 0 && height.value; });
      if (candidates.length !== 1) return false;
      target.searchParams.set(nativeParam, candidates[0].value);
    }
    var base = element.dataset.collectionUrl;
    if (target.pathname.indexOf(base + '/') !== 0) return false;
    var remaining = target.pathname.slice(base.length + 1).split('+').filter(function (tag) {
      return legacyHeights.indexOf(tag) === -1;
    });
    if (remaining.length === target.pathname.slice(base.length + 1).split('+').length) return false;
    target.pathname = base + (remaining.length ? '/' + remaining.join('+') : '');
    target.searchParams.delete('page');
    target.hash = 'bodenleisten-produkte';
    window.location.replace(target.href);
    return true;
  }

  async function refresh() {
    if (migrateHash() || normalizeLegacyHeight()) return;
    var element = root();
    if (!element) return;
    if (controller) controller.abort();
    controller = new AbortController();
    var current = ++version;
    var url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('section_id', element.dataset.sectionId);
    try {
      var response = await fetch(url.href, { signal: controller.signal });
      if (!response.ok) throw new Error('Leistenauswahl konnte nicht aktualisiert werden');
      var html = await response.text();
      if (current !== version) return;
      var replacement = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-tp-leisten]');
      if (!replacement) throw new Error('Leistenauswahl fehlt in der Serverantwort');
      element.replaceWith(replacement);
    } catch (error) {
      if (error.name === 'AbortError') return;
      window.location.reload();
    }
  }

  document.addEventListener('filter:update', refresh);
  window.addEventListener('popstate', refresh);
  window.addEventListener('hashchange', migrateHash);
  if (!migrateHash()) normalizeLegacyHeight();
})();
