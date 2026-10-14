(function () {
  var params = new URLSearchParams(window.location.search);
  var root = document.querySelector('[data-tp-sample-request]');
  if (!root) return;

  var isSample = params.get('thema') === 'muster';
  if (isSample) {
    root.setAttribute('data-mode', 'sample');
  } else {
    anfrageVorbelegen(params);
  }

  // Nach dem Absenden laedt Shopify die Seite neu. Den sichtbaren Ergebnistext
  // fokussieren, damit Fehler und Erfolg auch per Tastatur erreichbar sind.
  var result = root.querySelector('.tp-form-error');
  if (!result) result = root.querySelector(isSample ? '.tp-success--sample' : '.tp-success--generic');
  if (result) result.focus();

  if (!isSample) return;

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

  var produktwahl = produktwahlEinrichten();

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
      if (produktwahl) produktwahl.uebernehmen(product);
    })
    .catch(function () {
      /* Produktdaten optional - Musteranfrage funktioniert auch ohne */
    });

  // Pflichtfeld "Produkt und Dekor" (Audit 13.10.2026): Ohne ?produkt= kam die
  // Musteranfrage bis dahin ohne Belag an - Name und Adresse waren Pflicht, der
  // Boden nicht. Das sichtbare Feld hat keinen name; sein Text landet in
  // contact[Produkt]. Wer aus der Vorschlagsliste (Shopify Predictive Search)
  // waehlt, belegt zusaetzlich Produkt-Handle und Produkt-Link - dieselben
  // Felder wie der Weg mit ?produkt=. Hat das Produkt einen Musterweg im
  // Konfigurator, steht der direkte Link darunter.
  function produktwahlEinrichten() {
    var box = root.querySelector('[data-tp-produktwahl]');
    var feld = box && box.querySelector('[data-tp-produktwahl-feld]');
    var liste = box && box.querySelector('[data-tp-produktwahl-liste]');
    if (!feld || !liste) return null;
    var direkt = box.querySelector('[data-tp-produktwahl-direkt]');
    var direktLink = box.querySelector('[data-tp-produktwahl-direkt-link]');

    feld.required = true;
    var gewaehlt = null;
    var timer = null;
    var anfrage = 0;

    function zuklappen() {
      liste.hidden = true;
      liste.innerHTML = '';
      feld.setAttribute('aria-expanded', 'false');
    }

    function direktZeigen(product) {
      if (!direkt || !direktLink) return;
      var ok = product && hatMusterweg(product);
      if (ok) direktLink.href = '/pages/muster?produkt=' + encodeURIComponent(product.handle);
      direkt.hidden = !ok;
    }

    function uebernehmen(product) {
      gewaehlt = product;
      feld.value = product.title;
      setHiddenField('Produkt', product.title);
      setHiddenField('Produkt-Handle', product.handle);
      setHiddenField('Produkt-Link', window.location.origin + '/products/' + product.handle);
      zuklappen();
      direktZeigen(product);
    }

    function zeigen(produkte) {
      liste.innerHTML = '';
      produkte.forEach(function (product) {
        var li = document.createElement('li');
        li.setAttribute('role', 'presentation');
        var knopf = document.createElement('button');
        knopf.type = 'button';
        knopf.className = 'tp-produktwahl__option';
        knopf.setAttribute('role', 'option');
        var bild = (product.featured_image && product.featured_image.url) || product.image;
        if (bild) {
          var img = document.createElement('img');
          img.src = bild + (bild.indexOf('?') === -1 ? '?' : '&') + 'width=80';
          img.alt = '';
          img.width = 40;
          img.height = 40;
          img.loading = 'lazy';
          knopf.appendChild(img);
        }
        var text = document.createElement('span');
        text.textContent = product.title;
        knopf.appendChild(text);
        knopf.addEventListener('click', function () {
          uebernehmen(product);
          feld.focus();
        });
        li.appendChild(knopf);
        liste.appendChild(li);
      });
      var offen = produkte.length > 0;
      liste.hidden = !offen;
      feld.setAttribute('aria-expanded', offen ? 'true' : 'false');
    }

    function suchen(q) {
      var nr = ++anfrage;
      var url = '/search/suggest.json?q=' + encodeURIComponent(q) +
        '&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=last';
      fetch(url, { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (daten) {
          if (nr !== anfrage) return;
          var produkte = (daten && daten.resources && daten.resources.results && daten.resources.results.products) || [];
          zeigen(produkte.filter(hatMusterweg).slice(0, 6));
        })
        .catch(function () { zuklappen(); });
    }

    feld.addEventListener('input', function () {
      var text = feld.value.trim();
      // Freitext gilt immer; Handle/Link nur, solange der Text zur Auswahl passt.
      setHiddenField('Produkt', text);
      if (gewaehlt && text !== gewaehlt.title) {
        gewaehlt = null;
        setHiddenField('Produkt-Handle', '');
        setHiddenField('Produkt-Link', '');
        direktZeigen(null);
      }
      clearTimeout(timer);
      if (text.length < 2) { zuklappen(); return; }
      timer = setTimeout(function () { suchen(text); }, 250);
    });

    feld.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') zuklappen();
      if (event.key === 'ArrowDown' && !liste.hidden) {
        var erster = liste.querySelector('button');
        if (erster) { event.preventDefault(); erster.focus(); }
      }
    });

    liste.addEventListener('keydown', function (event) {
      var knoepfe = Array.prototype.slice.call(liste.querySelectorAll('button'));
      var i = knoepfe.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' && i < knoepfe.length - 1) { event.preventDefault(); knoepfe[i + 1].focus(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); (i > 0 ? knoepfe[i - 1] : feld).focus(); }
      if (event.key === 'Escape') { zuklappen(); feld.focus(); }
    });

    document.addEventListener('click', function (event) {
      if (!box.contains(event.target)) zuklappen();
    });

    var form = feld.form;
    if (form) {
      form.addEventListener('submit', function () {
        setHiddenField('Produkt', feld.value.trim());
      });
    }

    return { uebernehmen: uebernehmen };
  }

  // Dieselbe Regel wie snippets/tp-musteroption und canSample in
  // assets/tp-sample-checkout-core.js (qa/tests/muster-produktwahl.test.mjs
  // prueft den Gleichlauf): Laminat, Parkett, Kork, Zubehoer und ohne-muster
  // haben keinen kostenlosen Musterweg.
  function hatMusterweg(product) {
    var typ = String(product.type || '').trim().toLowerCase();
    if (['laminat', 'parkett', 'kork'].indexOf(typ) !== -1) return false;
    var tags = Array.isArray(product.tags) ? product.tags : String(product.tags || '').split(',');
    return !tags.some(function (tag) {
      var name = String(tag || '').trim().toLowerCase();
      return name === 'zubehoer' || name === 'ohne-muster';
    });
  }

  // Anfragen von der Produktseite (#163): Verlegung, Angebot, Beratungstermin.
  // Bis 2026-09-27 kam ?produkt= hier an und wurde ignoriert - die Anfrage
  // erreichte uns ohne Produkt und ohne Betreff.
  function anfrageVorbelegen(params) {
    // musteranfrage: Laminat, Parkett, Kork (Muster nur auf Anfrage, siehe
    // blocks/tp-muster-cta) - normale Anfrage, keine kostenlose Musterbestellung.
    var themen = {
      verlegung: 'Verlegeanfrage',
      angebot: 'Angebotsanfrage',
      beratung: 'Beratungstermin',
      musteranfrage: 'Musteranfrage'
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
      else if (thema === 'musteranfrage') zeilen.push('Ich interessiere mich für ein Muster' + (produkt ? ' von ' + produkt : '') + '. Bitte nennen Sie mir die Möglichkeiten.');
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
