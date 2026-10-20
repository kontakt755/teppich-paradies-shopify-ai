(function () {
  if (document.documentElement.hasAttribute('data-tp-produktberatung-bereit')) return;
  document.documentElement.setAttribute('data-tp-produktberatung-bereit', '');

  function vorbereiten(event) {
    var link = event.target.closest('a[data-tp-produktberatung]');
    if (!link) return;
    try {
      var id = link.getAttribute('data-tp-produkt-id');
      if (!/^\d+$/.test(id)) return;
      var main = link.closest('main');
      if (!main) return;
      var scope = link.closest('.shopify-section') || main;
      var config = scope && scope.querySelector('[data-tp-beratung-daten="' + id + '"]');
      if (!config) return;
      var data = JSON.parse(config.textContent);
      var pickers = main.querySelectorAll('variant-picker[data-template-product-match="true"][data-product-id="' + id + '"]');
      var picker = pickers.length === 1 ? pickers[0] : null;
      var fields = picker ? picker.querySelectorAll('.variant-option') : [];
      var rolls = main.querySelectorAll('[id^="tp-rwc-"][data-product-id="' + id + '"]');
      var roll = rolls.length === 1 ? rolls[0] : null;
      var colors = main.querySelectorAll('[data-tp-farbwahl][data-product-id="' + id + '"]');
      var color = colors.length === 1 ? colors[0].querySelector('input[name^="color-swatch-"]:checked') : null;
      var selection = data.options.map(function (option, index) {
        if (rolls.length && /breite/i.test(option.name)) return '';
        if (/^(farbe|color|dekor)$/i.test(option.name)) {
          if (colors.length > 1) return '';
          if (color) return color.value;
        }
        if (pickers.length > 1) return '';
        var field = fields[index];
        var input = field && field.querySelector('input:checked, select');
        var single = field && field.querySelector('[data-testid="variant-option-single-value"]');
        var value = input ? input.value : (single ? single.textContent.trim() : option.value);
        return value === 'Default Title' ? '' : value;
      }).filter(Boolean).join(' / ');
      var size = roll && typeof roll.tpRwcBestellmass === 'function' ? roll.tpRwcBestellmass() : null;
      var width = size && Number.isFinite(size.breite) && size.breite > 0 ? String(size.breite) : '';
      var length = size && Number.isFinite(size.laenge) && size.laenge > 0 ? String(size.laenge) : '';
      var productUrl = new URL(data.url, window.location.origin);
      var url = new URL(link.href, window.location.origin);

      if (link.getAttribute('data-tp-produktberatung') === 'whatsapp') {
        if (url.hostname !== 'wa.me') return;
        var lines = [data.labels.intro, data.title];
        if (selection) lines.push(data.labels.selection + ': ' + selection);
        if (width || length) {
          var dimensions = [];
          if (width) dimensions.push(data.labels.width + ' ' + width + ' cm');
          if (length) dimensions.push(data.labels.length + ' ' + length + ' cm');
          lines.push(data.labels.size + ' (' + (size.art === 'raum' ? data.labels.room : data.labels.roll) + '): ' + dimensions.join(', '));
        }
        lines.push(productUrl.toString());
        url.searchParams.set('text', lines.join('\n'));
      } else {
        if (url.origin !== window.location.origin) return;
        url.searchParams.set('produkt', data.title);
        url.searchParams.set('handle', data.handle);
        if (selection) url.searchParams.set('variante', selection);
        else url.searchParams.delete('variante');
        if (width) url.searchParams.set('breite', width + ' cm');
        else url.searchParams.delete('breite');
        if (length) url.searchParams.set('laenge_cm', length);
        else url.searchParams.delete('laenge_cm');
      }
      link.href = url.toString();
    } catch (_) {}
  }
  ['click', 'auxclick', 'contextmenu'].forEach(function (name) {
    document.addEventListener(name, vorbereiten);
  });
})();
