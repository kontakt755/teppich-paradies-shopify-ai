(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get('thema') !== 'muster') return;

  var root = document.querySelector('[data-tp-sample-request]');
  if (!root) return;

  root.setAttribute('data-mode', 'sample');

  // Nachricht ist bei einer Musteranfrage optional, bei der normalen
  // Kontaktanfrage bleibt sie Pflichtfeld (siehe data-message-field im
  // Standard-Markup, das unveraendert required bleibt ohne diesen Modus).
  var messageField = root.querySelector('[data-message-field]');
  if (messageField) messageField.required = false;

  var streetInput = root.querySelector('input[name="contact[Straße und Hausnummer]"]');
  var zipInput = root.querySelector('input[name="contact[PLZ]"]');
  var cityInput = root.querySelector('input[name="contact[Ort]"]');
  if (streetInput) streetInput.required = true;
  if (zipInput) zipInput.required = true;
  if (cityInput) cityInput.required = true;

  function setHiddenField(name, value) {
    var input = root.querySelector('[data-tp-hidden-field="' + name + '"]');
    if (input) input.value = value;
  }

  setHiddenField('Betreff', 'Kostenlose Musteranfrage');

  var handle = params.get('produkt');
  if (!handle) return;

  fetch('/products/' + encodeURIComponent(handle) + '.js', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      return response.ok ? response.json() : null;
    })
    .then(function (product) {
      if (!product) return;

      var introText = root.querySelector('[data-tp-intro]');
      if (introText) {
        introText.textContent = 'Wir senden Ihnen gerne ein Muster von ' + product.title + '.';
      }

      var nameEl = root.querySelector('[data-tp-product-name]');
      if (nameEl) nameEl.textContent = product.title;

      var imgEl = root.querySelector('[data-tp-product-image]');
      if (imgEl && product.featured_image) {
        imgEl.src = product.featured_image + '&width=160';
        imgEl.alt = product.title;
        imgEl.hidden = false;
        imgEl.style.display = 'block';
      }

      setHiddenField('Produkt', product.title);
      setHiddenField('Produkt-Handle', product.handle);
      setHiddenField('Produkt-Link', window.location.origin + '/products/' + product.handle);
    })
    .catch(function () {
      /* Produktdaten optional - Musteranfrage funktioniert auch ohne */
    });
})();
