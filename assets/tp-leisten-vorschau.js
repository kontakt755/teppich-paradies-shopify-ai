/*
  Farbvorschau fuer Leisten (blocks/tp-leisten-vorschau.liquid).

  Beim Variantenwechsel im Horizon-Variantenwaehler wird nur das Musterbild
  im SVG-Pattern getauscht. Farben ohne eigenes Musterbild zeigen den Hinweis
  statt einer geratenen Farbe.
*/
(function () {
  'use strict';

  function init(root) {
    if (root.dataset.tpVorschauReady) return;
    var mapNode = root.querySelector('[data-tp-vorschau-map]');
    var map = {};
    try {
      map = JSON.parse(mapNode ? mapNode.textContent : '{}') || {};
    } catch (e) {
      return;
    }
    root.dataset.tpVorschauReady = '1';

    var frame = root.querySelector('[data-tp-vorschau-frame]');
    var image = root.querySelector('[data-tp-vorschau-bild]');
    var name = root.querySelector('[data-tp-vorschau-name]');
    var foto = root.querySelector('[data-tp-vorschau-foto]');
    var art = root.querySelector('[data-tp-vorschau-art]');

    function picker() {
      return (root.parentElement && root.parentElement.querySelector('variant-picker')) || document.querySelector('variant-picker');
    }

    function currentValue() {
      var p = picker();
      if (!p) return '';
      var checked = Array.prototype.slice.call(p.querySelectorAll('input[type="radio"]')).filter(function (r) { return r.checked; });
      if (checked.length) return checked[0].value;
      var select = p.querySelector('select');
      return select ? select.value : '';
    }

    function show(value) {
      if (!value || !(value in map)) return;
      var entry = map[value] || {};
      var src = entry.src || '';
      var isFoto = !!entry.foto && !!src;
      if (name) name.textContent = value;
      if (image) image.setAttribute('href', isFoto ? '' : src);
      if (foto) foto.setAttribute('src', isFoto ? src : '');
      if (art) art.textContent = isFoto ? 'Herstellerfoto dieser Farbe' : 'Schematische Ansicht';
      if (frame) {
        frame.classList.toggle('tp-lv--ohne', !src);
        frame.classList.toggle('tp-lv--foto', isFoto);
      }
    }

    var p = picker();
    if (p) p.addEventListener('change', function () { show(currentValue()); });
    document.addEventListener('variant:update', function () { show(currentValue()); });
    show(currentValue());
  }

  function boot() {
    Array.prototype.slice.call(document.querySelectorAll('[data-tp-vorschau]')).forEach(init);
  }

  boot();
  new MutationObserver(boot).observe(document.body, { childList: true, subtree: true });
})();
