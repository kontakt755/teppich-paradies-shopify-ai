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

  async function refresh() {
    if (migrateHash()) return;
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
  migrateHash();
})();
