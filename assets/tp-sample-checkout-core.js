(function (global) {
  var SAMPLE_HANDLE = 'kostenloses-muster';
  var MAX_SAMPLES = 3;

  function colorPosition(product) {
    var option = (product.options || []).find(function (entry) {
      return String(entry.name || '').trim().toLowerCase() === 'farbe';
    });
    return option ? Number(option.position) : 0;
  }

  // Technische Varianten des Preisrechners. Sie tragen einen generierten
  // Titel wie "opc-1771104793780" und sind keine echte Farbe. Ohne diesen
  // Filter erscheinen sie als bestellbares Muster - siehe Softiq Teppichboden,
  // wo genau das passierte. Der Rollenware-Rechner filtert sie an anderer
  // Stelle bereits nach demselben Muster.
  function isTechnicalVariant(variant, value) {
    return /^opc-/i.test(String(value || '')) || /opc-/i.test(String(variant.title || ''));
  }

  function getUniqueColors(product) {
    var position = colorPosition(product);
    if (!position) return [];
    var seen = Object.create(null);
    return (product.variants || []).reduce(function (colors, variant) {
      var value = variant['option' + position];
      if (isTechnicalVariant(variant, value)) return colors;
      if (!variant.available || !value || seen[value]) return colors;
      seen[value] = true;
      colors.push({
        value: value,
        variantId: variant.id,
        image: variant.featured_image && variant.featured_image.src
          ? variant.featured_image.src
          : product.featured_image || '',
      });
      return colors;
    }, []);
  }

  function slug(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function sampleKey(handle, color) {
    return slug(handle) + '--' + slug(color);
  }

  function getSampleState(cart, sampleVariantId) {
    var keys = new Set();
    var count = (cart.items || []).reduce(function (total, item) {
      if (Number(item.variant_id) !== Number(sampleVariantId)) return total;
      if (item.properties && item.properties._Muster_ID) keys.add(item.properties._Muster_ID);
      return total + Number(item.quantity || 0);
    }, 0);
    return { count: count, remaining: Math.max(0, MAX_SAMPLES - count), keys: keys };
  }

  function getSelectionStatus(cartCount, selectedCount) {
    var inCart = Math.max(0, Number(cartCount || 0));
    var newlySelected = Math.max(0, Number(selectedCount || 0));
    var total = Math.min(MAX_SAMPLES, inCart + newlySelected);
    var remaining = Math.max(0, MAX_SAMPLES - total);
    var message;

    if (total === 0) {
      message = '0 von 3 Mustern ausgewählt';
    } else if (total >= MAX_SAMPLES) {
      message = '3 von 3 Mustern erreicht. Entfernen Sie zuerst ein Muster im Warenkorb, um ein anderes auszuwählen.';
    } else {
      var location = newlySelected === 0 ? ' im Warenkorb' : ' insgesamt ausgewählt';
      var possibility = remaining === 1 ? 'noch 1 weiteres möglich' : remaining + ' weitere möglich';
      message = total + ' von 3 Mustern' + location + ' · ' + possibility;
    }

    return {
      total: total,
      remaining: remaining,
      limitReached: total >= MAX_SAMPLES,
      message: message,
    };
  }

  function buildCartItems(args) {
    return args.colors.map(function (color) {
      return {
        id: Number(args.sampleVariantId),
        quantity: 1,
        properties: {
          Produkt: args.product.title,
          Farbe: color.value,
          _Muster_ID: sampleKey(args.product.handle, color.value),
          _Quellprodukt: args.product.handle,
          _Quellprodukt_ID: String(args.product.id),
          _Quellvariante_ID: String(color.variantId),
          _Bild: color.image || '',
          _Produktlink: args.origin + '/products/' + args.product.handle,
        },
      };
    });
  }

  global.TPSampleCheckoutCore = {
    SAMPLE_HANDLE: SAMPLE_HANDLE,
    MAX_SAMPLES: MAX_SAMPLES,
    getUniqueColors: getUniqueColors,
    sampleKey: sampleKey,
    getSampleState: getSampleState,
    getSelectionStatus: getSelectionStatus,
    buildCartItems: buildCartItems,
  };
})(window);
