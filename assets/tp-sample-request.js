(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get('thema') !== 'muster') {
    anfrageVorbelegen(params);
    return;
  }

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

  // Anfragen von der Produktseite (#163): Verlegung, Angebot, Beratungstermin.
  // Bis 2026-09-27 kam ?produkt= hier an und wurde ignoriert - die Anfrage
  // erreichte uns ohne Produkt und ohne Betreff.
  function anfrageVorbelegen(params) {
    var themen = {
      verlegung: 'Verlegeanfrage',
      angebot: 'Angebotsanfrage',
      beratung: 'Beratungstermin'
    };
    var thema = params.get('thema');
    var betreff = themen[thema];
    var produkt = params.get('produkt');
    if (!betreff && !produkt) return;

    var root = document.querySelector('[data-tp-sample-request]');
    if (!root) return;

    function feld(name, value) {
      var input = root.querySelector('[data-tp-hidden-field="' + name + '"]');
      if (input && value) input.value = value;
    }

    feld('Betreff', betreff || 'Anfrage zum Produkt');
    feld('Produkt', produkt);
    var handle = params.get('handle');
    if (handle && /^[a-z0-9-]+$/.test(handle)) {
      feld('Produkt-Handle', handle);
      feld('Produkt-Link', window.location.origin + '/products/' + handle);
    }

    var hinweis = root.querySelector('[data-tp-anfrage-hinweis]');
    if (hinweis) {
      hinweis.textContent = (betreff || 'Anfrage') + (produkt ? ': ' + produkt : '');
      hinweis.hidden = false;
    }

    // Nachricht nur vorbelegen, wenn sie leer ist (nach einem Fehler steht
    // dort bereits der Text des Kunden).
    var nachricht = root.querySelector('[data-message-field]');
    if (nachricht && !nachricht.value) {
      var zeilen = [];
      if (thema === 'angebot') zeilen.push('Bitte senden Sie mir ein Angebot' + (produkt ? ' für ' + produkt : '') + '.');
      else if (thema === 'beratung') zeilen.push('Ich möchte einen Beratungstermin vereinbaren' + (produkt ? ' zu ' + produkt : '') + '.');
      else if (thema === 'verlegung') zeilen.push('Ich interessiere mich für die Verlegung' + (produkt ? ' von ' + produkt : '') + '.');
      var variante = params.get('variante');
      if (variante) zeilen.push('Variante: ' + variante);
      var breite = params.get('breite');
      var laenge = params.get('laenge_cm');
      if (breite || laenge) zeilen.push('Maße: ' + [breite ? 'Breite ' + breite : '', laenge ? 'Länge ' + laenge + ' cm' : ''].filter(Boolean).join(', '));
      zeilen.push('Fläche / Raum: ');
      nachricht.value = zeilen.join('\n');
    }
  }
})();
