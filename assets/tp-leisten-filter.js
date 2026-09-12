/*
  Schnellauswahl fuer Bodenleisten (sections/tp-leisten-einstiege.liquid).

  Die Kategorie hat in Search & Discovery nur Preis- und Verfuegbarkeitsfilter;
  Material und Hoehe stehen als Produkt-Tags am Produkt. Dieses Script blendet
  Karten im Horizon-Raster ein und aus, ohne die Shopify-Filter, Sortierung
  oder das Nachladen anzufassen. Die Zuordnung Produkt -> Merkmale liefert die
  Sektion als JSON, die Karten werden ueber ihren Produktlink erkannt.

  Ohne JavaScript sind die Einstiege normale Sprunglinks zum Raster.
*/
(function () {
  'use strict';

  var root = document.querySelector('[data-tp-leisten]');
  if (!root) return;

  var dataNode = root.querySelector('[data-tp-leisten-data]');
  var products = {};
  try {
    products = JSON.parse(dataNode ? dataNode.textContent : '{}') || {};
  } catch (e) {
    return;
  }

  var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-tp-leisten-group]'));
  var status = root.querySelector('[data-tp-leisten-status]');
  var resetButton = root.querySelector('[data-tp-leisten-reset]');
  var emptyNote = root.querySelector('[data-tp-leisten-empty]');
  var active = { material: '', hoehe: '' };

  function gridItems() {
    var grid = document.querySelector('#ResultsList .product-grid, results-list .product-grid, .product-grid');
    if (!grid) return [];
    return Array.prototype.slice.call(grid.querySelectorAll(':scope > .product-grid__item')).filter(function (li) {
      return li.querySelector('a[href*="/products/"]');
    });
  }

  function handleOf(li) {
    var link = li.querySelector('a[href*="/products/"]');
    if (!link) return '';
    var m = link.getAttribute('href').match(/\/products\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function matches(handle) {
    var p = products[handle];
    if (!p) return true; // unbekannte Karten nie verstecken
    if (active.material && p.material !== active.material) return false;
    if (active.hoehe && p.hoehe !== active.hoehe) return false;
    return true;
  }

  function apply() {
    var items = gridItems();
    var visible = 0;
    items.forEach(function (li) {
      var show = matches(handleOf(li));
      if (show) {
        li.removeAttribute('hidden');
        visible += 1;
      } else {
        li.setAttribute('hidden', '');
      }
    });

    var anyActive = !!(active.material || active.hoehe);
    buttons.forEach(function (btn) {
      var group = btn.getAttribute('data-tp-leisten-group');
      var value = btn.getAttribute('data-tp-leisten-value');
      var on = value ? active[group] === value : !active[group];
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (status) {
      if (!anyActive) {
        status.textContent = items.length ? items.length + ' Leisten' : '';
      } else {
        status.textContent = visible + ' von ' + items.length + ' Leisten';
      }
    }
    if (resetButton) resetButton.hidden = !anyActive;
    if (emptyNote) emptyNote.hidden = !(anyActive && items.length > 0 && visible === 0);
    root.classList.toggle('tp-le--active', anyActive);

    var hash = [];
    if (active.material) hash.push('material=' + encodeURIComponent(active.material));
    if (active.hoehe) hash.push('hoehe=' + encodeURIComponent(active.hoehe));
    var next = hash.length ? '#leisten:' + hash.join('&') : window.location.pathname + window.location.search;
    try {
      window.history.replaceState(null, '', next);
    } catch (e) {
      /* Verlauf nicht beschreibbar - egal */
    }
  }

  function readHash() {
    var h = window.location.hash || '';
    if (h.indexOf('#leisten:') !== 0) return false;
    h.slice(9).split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0] === 'material' || kv[0] === 'hoehe') active[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    return true;
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      var group = btn.getAttribute('data-tp-leisten-group');
      var value = btn.getAttribute('data-tp-leisten-value') || '';
      active[group] = active[group] === value ? '' : value;
      apply();
      var grid = document.getElementById('bodenleisten-produkte');
      if (grid && btn.tagName === 'A') {
        event.preventDefault();
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  if (resetButton) {
    resetButton.addEventListener('click', function () {
      active.material = '';
      active.hoehe = '';
      apply();
    });
  }

  // Sortierung, Shopify-Filter und Nachladen tauschen das Raster aus -
  // danach die Auswahl erneut anwenden.
  var list = document.querySelector('results-list') || document.body;
  var pending = null;
  var observer = new MutationObserver(function () {
    if (pending) return;
    pending = window.requestAnimationFrame(function () {
      pending = null;
      apply();
    });
  });
  observer.observe(list, { childList: true, subtree: true });

  function applyFromHash(scroll) {
    active.material = '';
    active.hoehe = '';
    var had = readHash();
    apply();
    if (had && scroll) {
      var grid = document.getElementById('bodenleisten-produkte') || root;
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Die Navigation im Kopfbereich verlinkt auf "#leisten:material=..." bzw.
  // "#leisten:hoehe=...". Ist die Kategorieseite schon offen, laedt der Browser
  // nichts nach - dann muss hashchange die Auswahl uebernehmen.
  window.addEventListener('hashchange', function () {
    applyFromHash(true);
  });

  applyFromHash(false);

  // Kommt man ueber einen Menuelink mit Filter-Hash von einer anderen Seite, laedt
  // die Kategorieseite neu. Ohne Sprung lag das gefilterte Raster unsichtbar unter
  // dem Einstieg (bei 390 px Breite 1630 px tief, gemessen 2026-09-11, #193).
  if ((window.location.hash || '').indexOf('#leisten:') === 0) {
    window.requestAnimationFrame(function () {
      var grid = document.getElementById('bodenleisten-produkte') || root;
      if (grid) grid.scrollIntoView({ block: 'start' });
    });
  }
})();
