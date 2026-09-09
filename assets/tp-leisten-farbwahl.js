/*
  Bildbasierte Farbwahl fuer Leisten (blocks/tp-leisten-farbwahl.liquid).

  Die Kacheln sind nur eine Oberflaeche ueber dem Horizon-Variantenwaehler:
  Ein Klick setzt den passenden Radio-Button, alles Weitere (Preis, Galerie,
  Warenkorb-Formular, URL) erledigt Horizon wie bisher. Nach jedem
  Variantenwechsel wird der gedrueckte Zustand aus den Radios uebernommen.
*/
(function () {
  'use strict';

  function init(root) {
    if (root.dataset.tpFarbwahlReady) return;
    var optionName = root.getAttribute('data-tp-farbwahl-option') || 'Farbe';
    var picker = root.parentElement && root.parentElement.querySelector('variant-picker');
    if (!picker) picker = document.querySelector('variant-picker');
    if (!picker) return;

    function radios() {
      return Array.prototype.slice.call(picker.querySelectorAll('input[type="radio"]')).filter(function (r) {
        return (r.name || '').indexOf(optionName) === 0 || picker.querySelectorAll('fieldset').length === 1;
      });
    }
    if (!radios().length) return;

    root.dataset.tpFarbwahlReady = '1';
    root.hidden = false;
    picker.classList.add('tp-lfw-picker-hidden');

    var tiles = Array.prototype.slice.call(root.querySelectorAll('[data-tp-farbwahl-value]'));
    var current = root.querySelector('[data-tp-farbwahl-current]');

    function sync() {
      var checked = radios().filter(function (r) { return r.checked; })[0];
      var value = checked ? checked.value : '';
      tiles.forEach(function (t) {
        t.setAttribute('aria-pressed', t.getAttribute('data-tp-farbwahl-value') === value ? 'true' : 'false');
      });
      // Angezeigt wird der Kundenname der Kachel, nicht der rohe Optionswert.
      var aktiv = tiles.filter(function (t) { return t.getAttribute('data-tp-farbwahl-value') === value; })[0];
      var label = aktiv ? aktiv.getAttribute('data-tp-farbwahl-name') : '';
      if (current && (label || value)) current.textContent = label || value;
    }

    tiles.forEach(function (tile) {
      tile.addEventListener('click', function () {
        var value = tile.getAttribute('data-tp-farbwahl-value');
        var target = radios().filter(function (r) { return r.value === value; })[0];
        if (!target || target.checked) return;
        target.click();
        sync();
      });
    });

    picker.addEventListener('change', sync);
    document.addEventListener('variant:update', sync);
    sync();
  }

  function boot() {
    Array.prototype.slice.call(document.querySelectorAll('[data-tp-farbwahl]')).forEach(init);
  }

  boot();
  // Horizon rendert den Produktbereich nach einem Variantenwechsel neu
  new MutationObserver(boot).observe(document.body, { childList: true, subtree: true });
})();
