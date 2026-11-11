(function () {
  var root = document.querySelector('[data-tp-sample-checkout]');
  if (!root) return;

  var core = window.TPSampleCheckoutCore;
  var HANDLE_PATTERN = /^[a-z0-9-]+$/;

  var loadingEl = root.querySelector('[data-sample-loading]');
  var errorEl = root.querySelector('[data-sample-error]');
  var fieldsetEl = root.querySelector('[data-sample-fieldset]');
  var gridEl = root.querySelector('[data-sample-grid]');
  var countEl = root.querySelector('[data-sample-count]');
  var submitEl = root.querySelector('[data-sample-submit]');
  var cartLinkEl = root.querySelector('[data-sample-cart-link]');
  var productWrapEl = root.querySelector('[data-sample-product]');
  var productImageEl = root.querySelector('[data-sample-product-image]');
  var productNameEl = root.querySelector('[data-sample-product-name]');

  var selected = new Set();
  var sampleVariantId = null;
  var product = null;
  var colors = [];
  var optionName = 'Farbe';
  var existingKeys = new Set();
  // Warenkorbstand (core.getSampleState). Die Grenze haengt seit dem Lager-Bonus
  // (w-325) auch an der Auswahl und wird je Frage neu gerechnet: grenze().
  var cartState = { count: 0, vinylCount: 0, lagerCount: 0 };
  // Alle Muster im Warenkorb (fuer den Warenkorb-Link).
  var cartTotalCount = 0;
  var submitting = false;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function musterAufAnfrage(p) {
    var typ = String((p && p.type) || '').trim().toLowerCase();
    if (['laminat', 'parkett', 'kork'].indexOf(typ) === -1) return false;
    var tags = Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',');
    return !tags.some(function (tag) {
      var name = String(tag || '').trim().toLowerCase();
      return name === 'zubehoer' || name === 'ohne-muster';
    });
  }

  // Neutraler Hinweis (data-sample-none) mit Links statt rotem Fehlerkasten.
  function zeigeOhneMuster(text, links) {
    var noneEl = root.querySelector('[data-sample-none]');
    if (!noneEl) {
      showError(text);
      return;
    }
    noneEl.textContent = text;
    var linksEl = document.createElement('span');
    linksEl.className = 'tp-sample__keine-links';
    links.forEach(function (link) {
      var a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.text;
      linksEl.appendChild(a);
    });
    noneEl.appendChild(linksEl);
    noneEl.hidden = false;
  }

  function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function getParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name) || '';
  }

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (response) {
      if (!response.ok) throw new Error('request-failed');
      return response.json();
    });
  }

  // Uebernimmt den Warenkorbstand: schon bestellte Farben und Anzahl.
  function applyCart(cart) {
    cartState = core.getSampleState(cart);
    existingKeys = cartState.keys;
    cartTotalCount = cartState.count;
  }

  // Bindende Grenze fuer Warenkorb + Auswahl (+ eine weitere Farbe): Gesamtgrenze,
  // mit Lagermuster eins mehr, bei Vinyl die engere Vinyl-Grenze (core.getLimit).
  function grenze(dazu) {
    var auswahl = colors.filter(function (color) { return selected.has(color.value); });
    return core.getLimit(product, cartState, dazu ? auswahl.concat(dazu) : auswahl);
  }

  function passt(color) {
    return selected.size < grenze(color).remaining;
  }

  // Vinyl: Hinweis auf die Grenze von 2 je Bestellung.
  function showVinylLimit() {
    if (!core.isVinyl(product)) return;
    root.querySelectorAll('[data-sample-max]').forEach(function (el) {
      el.textContent = String(core.VINYL_MAX);
    });
    var vinylEl = root.querySelector('[data-sample-vinyl]');
    if (vinylEl) vinylEl.hidden = false;
  }

  // JAB und Vorwerk: Muster kommt direkt vom Hersteller (statt "ca. A5").
  function showHerstellerHinweis() {
    if (!core.isHerstellerMuster(product)) return;
    var infoEl = root.querySelector('[data-sample-info]');
    var herstellerEl = root.querySelector('[data-sample-hersteller]');
    if (!herstellerEl) return;
    if (infoEl) infoEl.hidden = true;
    herstellerEl.hidden = false;
  }

  function updateCount() {
    var limit = grenze();
    var bonusOffen = Boolean(limit.bonusOffen) && colors.some(function (color) {
      return color.sampleSofort && core.isSelectable(color) && !selected.has(color.value) && !existingKeys.has(makeCardKey(color)) && passt(color);
    });
    var status = core.getSelectionStatus(limit.inCart, selected.size, limit.max, limit.word, bonusOffen);
    countEl.textContent = status.message;
    countEl.classList.toggle('tp-sample__count--limit', status.limitReached);
    submitEl.disabled = submitting || selected.size === 0;
    cartLinkEl.hidden = cartTotalCount === 0;

    gridEl.querySelectorAll('[data-sample-color]').forEach(function (card) {
      var value = card.getAttribute('data-sample-color');
      var checkbox = card.querySelector('input[type="checkbox"]');
      var alreadyInCart = existingKeys.has(makeCardKey({ value: value }));
      var color = colors.find(function (entry) { return entry.value === value; });
      var blockedByLimit = !selected.has(value) && !passt(color);
      // Gesperrtes Muster (Mustervariante nicht verfuegbar): immer deaktiviert.
      var unavailable = card.getAttribute('data-sample-unavailable') !== null;
      checkbox.disabled = unavailable || alreadyInCart || blockedByLimit;
      if (checkbox.disabled) {
        card.setAttribute('aria-disabled', 'true');
      } else {
        card.removeAttribute('aria-disabled');
      }
    });
  }

  function makeCardKey(color) {
    return core.sampleKey(product.handle, color.value);
  }

  function toggleCard(card, color) {
    var key = makeCardKey(color);
    var isSelected = selected.has(color.value);
    var checkbox = card.querySelector('input[type="checkbox"]');

    if (!core.isSelectable(color)) {
      checkbox.checked = false;
      return;
    }

    if (isSelected) {
      selected.delete(color.value);
      card.setAttribute('data-selected', 'false');
      checkbox.checked = false;
      updateCount();
      return;
    }

    if (existingKeys.has(key)) {
      checkbox.checked = false;
      return;
    }
    if (!passt(color)) {
      checkbox.checked = false;
      return;
    }

    selected.add(color.value);
    card.setAttribute('data-selected', 'true');
    checkbox.checked = true;
    updateCount();
  }

  // SKUs der Muster im Musterlager (snippets/tp-muster-sofort); fehlt oder kaputt: kein Hinweis.
  function sofortListe() {
    var el = document.querySelector('script[data-tp-muster-sofort]');
    try { return core.sofortListe(JSON.parse(el ? el.textContent : 'null')); } catch (e) { return []; }
  }

  function renderColors() {
    gridEl.textContent = '';
    // Gemessen 09.11.2026 (Shopify-Bestellungen ab 16.10., Bestellung bis Versandbuchung, mittlere 60 %):
    // Lieferant 37 Bestellungen 3-8 Werktage, Hersteller 23 Bestellungen 4-10 - gleich in snippets/tp-muster-lieferzeit.
    var lieferzeit = core.isHerstellerMuster(product)
      ? 'vom Hersteller, Versand meist nach 4–\u206010 Werktagen'
      : 'Versand meist nach 3–\u20608 Werktagen';

    colors.forEach(function (color) {
      var key = makeCardKey(color);
      // Gesperrte Farbe bleibt sichtbar, damit der Kunde sieht, dass es sie
      // gibt - nur das Muster ist derzeit nicht lieferbar.
      var unavailable = !core.isSelectable(color);
      var disabled = unavailable || existingKeys.has(key);

      var card = document.createElement('label');
      card.className = 'tp-sample__card';
      card.setAttribute('data-sample-color', color.value);
      card.setAttribute('data-selected', 'false');
      if (unavailable) card.setAttribute('data-sample-unavailable', '');
      if (disabled) card.setAttribute('aria-disabled', 'true');

      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'tp-sample__card-input';
      checkbox.disabled = disabled;
      checkbox.addEventListener('change', function () {
        toggleCard(card, color);
      });

      var image = document.createElement('img');
      image.loading = 'lazy';
      image.alt = '';
      image.src = color.image || '';

      var label = document.createElement('span');
      label.className = 'tp-sample__card-label';
      label.textContent = color.value;

      var check = document.createElement('span');
      check.className = 'tp-sample__card-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';

      card.appendChild(checkbox);
      card.appendChild(image);
      card.appendChild(label);
      if (unavailable) {
        var status = document.createElement('span');
        status.className = 'tp-sample__card-status';
        status.textContent = 'Kein Muster verfügbar';
        card.appendChild(status);
      } else if (color.sampleSofort) {
        // Wortlaut Benutzer 09.11.: "sofort lieferbar solange der Vorrat reicht, Muster auf Lager" -
        // ueberbucht ein Kunde den Vorrat, kommt sein Muster ganz normal vom Lieferanten.
        card.setAttribute('data-sample-sofort', '');
        var plakette = document.createElement('span');
        plakette.className = 'tp-sample__card-plakette';
        plakette.textContent = 'Muster auf Lager';
        card.appendChild(plakette);
        var sofort = document.createElement('span');
        sofort.className = 'tp-sample__card-sofort';
        sofort.textContent = 'sofort lieferbar, solange der Vorrat reicht';
        card.appendChild(sofort);
      } else {
        var zeit = document.createElement('span');
        zeit.className = 'tp-sample__card-lieferzeit';
        zeit.textContent = lieferzeit;
        card.appendChild(zeit);
      }
      card.appendChild(check);
      gridEl.appendChild(card);
    });

    updateCount();
  }

  // Die Produktseite haengt die dort gewaehlte Farbe als ?farbe= an
  // (assets/tp-farbauswahl.js). Vorauswahl ueber denselben Weg wie ein Tipp
  // des Kunden, damit Limit und bereits bestellte Muster weiter gelten.
  // Unbekannter Wert: nichts passiert. Ohne Wert wird nur gewaehlt, wenn es
  // genau ein Dekor gibt (Einzeldekor wie Klickvinyl) - sonst muesste der
  // Kunde das einzige Kaestchen selbst antippen (Fehleranalyse 13.10.).
  function vorauswahl(farbe) {
    var cards = gridEl.querySelectorAll('[data-sample-color]');
    if (!farbe) {
      if (cards.length !== 1) return;
      var einzige = cards[0].querySelector('input[type="checkbox"]');
      if (einzige && !einzige.disabled && !einzige.checked) einzige.click();
      return;
    }
    for (var i = 0; i < cards.length; i += 1) {
      if (cards[i].getAttribute('data-sample-color') !== farbe) continue;
      var checkbox = cards[i].querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.disabled && !checkbox.checked) checkbox.click();
      cards[i].scrollIntoView({ block: 'center' });
      return;
    }
  }

  function submitSelection() {
    if (submitting || selected.size === 0 || !core.canSample(product)) return;
    submitting = true;
    submitEl.disabled = true;
    hideError();

    // Warenkorb unmittelbar vor dem Hinzufuegen neu lesen: In einem zweiten
    // Tab koennen inzwischen Muster dazugekommen sein. Passt die Auswahl
    // nicht mehr unter die Grenze, wird nichts hinzugefuegt, sondern die
    // Auswahl mit dem neuen Stand angezeigt.
    fetchJson('/cart.js').catch(function () { return null; }).then(function (cart) {
      if (cart) {
        applyCart(cart);
        var doppelt = false;
        selected.forEach(function (value) {
          if (existingKeys.has(makeCardKey({ value: value }))) doppelt = true;
        });
        var limit = grenze();
        var ueber = selected.size > limit.remaining;
        if (doppelt || ueber) {
          selected.clear();
          submitting = false;
          renderColors();
          showError(ueber
            ? 'Im Warenkorb liegen inzwischen weitere Muster. Je Bestellung sind höchstens ' + limit.max + ' ' + limit.word + ' möglich – bitte wählen Sie erneut.'
            : 'Ein ausgewähltes Muster liegt inzwischen schon im Warenkorb. Bitte prüfen Sie Ihre Auswahl.');
          return;
        }
      }
      addSelection();
    });
  }

  function addSelection() {
    var chosenColors = colors.filter(function (color) {
      return selected.has(color.value) && core.isSelectable(color);
    });

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        items: core.buildCartItems({
          product: product,
          colors: chosenColors,
          optionName: optionName,
          sampleVariantId: sampleVariantId,
          origin: window.location.origin,
        }),
      }),
    }).then(function (response) {
      if (!response.ok) throw new Error('add-failed');
      cartLinkEl.hidden = false;
      window.location.href = window.TP_SAMPLE_CART_URL || '/cart';
    }).catch(function () {
      submitting = false;
      updateCount();
      showError('Das Hinzufügen hat nicht funktioniert. Bitte versuchen Sie es erneut oder kontaktieren Sie uns.');
    });
  }

  function init() {
    var handle = getParam('produkt');
    if (!handle || !HANDLE_PATTERN.test(handle)) {
      // Ohne Produkt kommt der Kunde aus Top-Leiste, Chips oder SEO-Links:
      // Weg erklaeren statt Fehlermeldung und ausgegrautem Button.
      loadingEl.hidden = true;
      var emptyEl = root.querySelector('[data-sample-empty]');
      var introEl = root.querySelector('[data-sample-intro]');
      if (emptyEl) {
        emptyEl.hidden = false;
        submitEl.hidden = true;
        if (introEl) introEl.hidden = true;
        return;
      }
      showError('Für dieses Produkt sind aktuell keine Muster hinterlegt.');
      return;
    }

    // Musterprodukt der Qualitaet zuerst (eigene Variante je Farbe). Fehlt es
    // bei einem Teppich nach Mass, das Musterprodukt des Teppichbodens
    // (ladeBasisMuster). Das Sammelprodukt "Kostenloses Muster" bleibt der
    // Rueckfall fuer alles, was keine eigene Mustervariante findet.
    function fetchOptional(url) {
      return fetchJson(url).catch(function () { return null; });
    }

    // sections/tp-muster-basis nennt im Kontext des Produkts, welche
    // Musterprodukte es gibt: muster-<handle> und - fuer Teppiche nach Mass -
    // das Musterprodukt des Teppichbodens (service.einfass_basis). Abgerufen
    // wird nur, was dort steht; ein blinder Abruf von muster-<handle> erzeugte
    // bei jedem Produkt ohne eigenes Muster einen 404 in der Konsole
    // (Fehleranalyse 13.10.). Scheitert die Section, bleibt es beim Sammelprodukt.
    function ladeSection() {
      return fetch(core.basisSectionUrl(handle), { headers: { Accept: 'text/html' } })
        .then(function (response) { return response.ok ? response.text() : ''; })
        .catch(function () { return ''; });
    }

    // Ergebnis: [eigenes Musterprodukt, Musterprodukt des Teppichbodens].
    // Das Basis-Muster zaehlt nur, wenn es kein eigenes gibt.
    function ladeMuster(html) {
      var quelle = core.parseMusterQuelle(html);
      if (quelle) {
        var eigen = quelle.eigen ? fetchOptional('/products/' + quelle.eigen + '.js') : Promise.resolve(null);
        return eigen.then(function (musterProdukt) {
          if (musterProdukt || !quelle.basis) return [musterProdukt, null];
          return fetchOptional('/products/' + quelle.basis + '.js').then(function (basisMuster) {
            return [null, basisMuster];
          });
        });
      }
      // Section ohne Angabe (z. B. aelterer Theme-Stand im Cache): wie bisher
      // erst muster-<handle> probieren, dann den Basis-Handle.
      return fetchOptional('/products/' + core.sampleProductHandle(handle) + '.js').then(function (musterProdukt) {
        if (musterProdukt) return [musterProdukt, null];
        var basis = core.parseBasisHandle(html, handle);
        if (!basis) return [null, null];
        return fetchOptional('/products/' + core.sampleProductHandle(basis) + '.js').then(function (basisMuster) {
          return [null, basisMuster];
        });
      });
    }

    Promise.all([
      fetchJson('/products/' + handle + '.js'),
      fetchJson('/products/kostenloses-muster.js'),
      fetchJson('/cart.js'),
      ladeSection(),
    ]).then(function (results) {
      product = results[0];
      if (!core.canSample(product)) {
        loadingEl.hidden = true;
        // Kein Muster ueber diese Seite: die Zeile "Muster ca. A5 ..." passt
        // dann nicht zum Hinweis darunter (Laminat, Parkett, Kork, ohne Muster).
        var infoEl = root.querySelector('[data-sample-info]');
        if (infoEl) infoEl.hidden = true;
        // Kein Warenkorbweg: Auswahl-Intro und Knopf passen nicht, der Hinweis
        // steht neutral statt als Fehler (Rundgang 06.11.2026).
        var introEl = root.querySelector('[data-sample-intro]');
        if (introEl) introEl.hidden = true;
        submitEl.hidden = true;
        var produktLink = { text: 'Zurück zu ' + product.title, href: '/products/' + handle };
        if (musterAufAnfrage(product)) {
          // Laminat, Parkett, Kork: kostenlos, aber nur auf Anfrage
          // (Inhaber 14.10.2026, blocks/tp-muster-cta). Alte Links landen hier.
          // Linktext ohne "kostenlos" wie der Knopf auf der Produktseite (w-161).
          zeigeOhneMuster('Muster für ' + product.title + ' sind kostenlos wie alle unsere Muster. Weil sie wertiger sind, senden wir sie nach kurzer Anfrage zu.', [
            { text: 'Muster anfragen', href: '/pages/kontakt?thema=musteranfrage&produkt=' + encodeURIComponent(product.title) + '&handle=' + encodeURIComponent(product.handle) },
            produktLink,
          ]);
          return;
        }
        zeigeOhneMuster('Für diesen Boden gibt es leider keine Muster. Wir beraten Sie gern.', [
          { text: 'Beratung anfragen', href: '/pages/kontakt?thema=beratung' },
          produktLink,
        ]);
        return;
      }
      var sampleProduct = results[1];
      var cart = results[2];
      var sectionHtml = results[3];

      var sampleVariant = (sampleProduct.variants || []).find(function (variant) {
        return variant.available;
      });
      if (!sampleVariant) throw new Error('no-sample-variant');
      sampleVariantId = sampleVariant.id;

      colors = core.getUniqueColors(product);
      if (colors.length === 0) throw new Error('no-colors');

      // Beschriftungen an das Sortiment anpassen: "Farben" oder "Dekore".
      optionName = core.getOptionName(product);
      return ladeMuster(sectionHtml).then(function (muster) {
        colors = core.markSofort(core.applySperrliste(core.assignSampleVariantsWithBasis(colors, muster[0], muster[1], optionName), product.handle), sofortListe());
        root.querySelectorAll('[data-sample-term]').forEach(function (el) {
          el.textContent = core.getOptionTerm(product, el.getAttribute('data-sample-term'));
        });

        applyCart(cart);
        showVinylLimit();
        showHerstellerHinweis();

        productImageEl.src = product.featured_image || '';
        productNameEl.textContent = product.title;
        var klebeEl = root.querySelector('[data-sample-klebe]');
        if (klebeEl) klebeEl.hidden = (product.tags || []).indexOf('muster-klebevariante') === -1;
        productWrapEl.hidden = false;

        loadingEl.hidden = true;
        // Alle Farben gesperrt: Hinweis statt Karten, kein Bestellknopf.
        if (core.allSamplesUnavailable(colors)) {
          var noneEl = root.querySelector('[data-sample-none]');
          var introEl = root.querySelector('[data-sample-intro]');
          if (introEl) introEl.hidden = true;
          submitEl.hidden = true;
          cartLinkEl.hidden = cartTotalCount === 0;
          if (noneEl) {
            noneEl.hidden = false;
          } else {
            showError('Für dieses Produkt sind derzeit keine Muster verfügbar.');
          }
          return;
        }
        fieldsetEl.hidden = false;
        var ablaufEl = root.querySelector('[data-sample-ablauf]');
        if (ablaufEl) ablaufEl.hidden = false;
        var auchEl = root.querySelector('[data-sample-auch]');
        if (auchEl) auchEl.hidden = !colors.some(function (c) { return c.sampleSofort; });
        // Lager-Bonus (w-325) in der Ueberschrift; bei Vinyl bleibt es bei 2 Vinyl-Mustern.
        var plusEl = root.querySelector('[data-sample-lager-plus]');
        if (plusEl) plusEl.hidden = core.isVinyl(product) || !colors.some(function (c) { return c.sampleSofort; });
        renderColors();
        vorauswahl(getParam('farbe'));
      });
    }).catch(function () {
      loadingEl.hidden = true;
      showError('Für dieses Produkt sind aktuell keine Muster hinterlegt.');
    });
  }

  submitEl.addEventListener('click', submitSelection);
  // Zurueck-Knopf aus dem Warenkorb: Seiten aus dem Browser-Cache tragen den
  // alten Warenkorbstand - neu laden, damit Grenze und Auswahl stimmen.
  if (window.addEventListener) {
    window.addEventListener('pageshow', function (event) {
      if (event && event.persisted) window.location.reload();
    });
  }
  init();
})();
