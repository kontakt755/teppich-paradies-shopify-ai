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
  var cartSampleCount = 0;
  var remaining = window.TPSampleCheckoutCore ? window.TPSampleCheckoutCore.MAX_SAMPLES : 3;
  var submitting = false;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
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

  function updateCount() {
    var status = core.getSelectionStatus(cartSampleCount, selected.size);
    countEl.textContent = status.message;
    countEl.classList.toggle('tp-sample__count--limit', status.limitReached);
    submitEl.disabled = submitting || selected.size === 0;
    cartLinkEl.hidden = cartSampleCount === 0 && !status.limitReached;

    gridEl.querySelectorAll('[data-sample-color]').forEach(function (card) {
      var value = card.getAttribute('data-sample-color');
      var checkbox = card.querySelector('input[type="checkbox"]');
      var alreadyInCart = existingKeys.has(makeCardKey({ value: value }));
      var blockedByLimit = status.limitReached && !selected.has(value);
      checkbox.disabled = alreadyInCart || blockedByLimit;
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
    if (selected.size >= remaining || selected.size >= core.MAX_SAMPLES) {
      checkbox.checked = false;
      return;
    }

    selected.add(color.value);
    card.setAttribute('data-selected', 'true');
    checkbox.checked = true;
    updateCount();
  }

  function renderColors() {
    gridEl.textContent = '';

    colors.forEach(function (color) {
      var key = makeCardKey(color);
      var disabled = existingKeys.has(key);

      var card = document.createElement('label');
      card.className = 'tp-sample__card';
      card.setAttribute('data-sample-color', color.value);
      card.setAttribute('data-selected', 'false');
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
      card.appendChild(check);
      gridEl.appendChild(card);
    });

    updateCount();
  }

  function submitSelection() {
    if (submitting || selected.size === 0) return;
    submitting = true;
    submitEl.disabled = true;
    hideError();

    var chosenColors = colors.filter(function (color) {
      return selected.has(color.value);
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
      loadingEl.hidden = true;
      showError('Für dieses Produkt sind aktuell keine Muster hinterlegt.');
      return;
    }

    Promise.all([
      fetchJson('/products/' + handle + '.js'),
      fetchJson('/products/kostenloses-muster.js'),
      fetchJson('/cart.js'),
    ]).then(function (results) {
      product = results[0];
      var sampleProduct = results[1];
      var cart = results[2];

      var sampleVariant = (sampleProduct.variants || []).find(function (variant) {
        return variant.available;
      });
      if (!sampleVariant) throw new Error('no-sample-variant');
      sampleVariantId = sampleVariant.id;

      colors = core.getUniqueColors(product);
      if (colors.length === 0) throw new Error('no-colors');

      // Beschriftungen an das Sortiment anpassen: "Farben" oder "Dekore".
      optionName = core.getOptionName(product);
      root.querySelectorAll('[data-sample-term]').forEach(function (el) {
        el.textContent = core.getOptionTerm(product, el.getAttribute('data-sample-term'));
      });

      var state = core.getSampleState(cart, sampleVariantId);
      existingKeys = state.keys;
      cartSampleCount = state.count;
      remaining = state.remaining;

      productImageEl.src = product.featured_image || '';
      productNameEl.textContent = product.title;
      productWrapEl.hidden = false;

      loadingEl.hidden = true;
      fieldsetEl.hidden = false;
      renderColors();
    }).catch(function () {
      loadingEl.hidden = true;
      showError('Für dieses Produkt sind aktuell keine Muster hinterlegt.');
    });
  }

  submitEl.addEventListener('click', submitSelection);
  init();
})();
