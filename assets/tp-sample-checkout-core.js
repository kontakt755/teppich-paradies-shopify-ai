(function (global) {
  var SAMPLE_HANDLE = 'kostenloses-muster';
  // Grundgrenze 3; Newsletter-Abonnenten bekommen ein viertes Muster als
  // Bonus (Inhaber 2026-09-25). Erkannt wird das an window.TPMusterBonus
  // (eingeloggter Kunde mit Werbe-Einwilligung, gesetzt in
  // sections/tp-sample-checkout.liquid) oder am Bonus-Link aus der
  // Willkommensmail (?muster-bonus=1), der im Browser gemerkt wird. Die
  // Grenze ist wie bisher nur eine Browser-Grenze - Muster sind kostenlos,
  // es gibt keine serverseitige Pruefung.
  var BASE_SAMPLES = 3;
  var BONUS_KEY = 'tp-muster-bonus';

  function hasSampleBonus() {
    if (global.TPMusterBonus === true) return true;
    try {
      if (global.location && /[?&]muster-bonus=1(&|$)/.test(global.location.search || '')) {
        global.localStorage.setItem(BONUS_KEY, '1');
        return true;
      }
      return global.localStorage && global.localStorage.getItem(BONUS_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  var HAS_BONUS = hasSampleBonus();
  var MAX_SAMPLES = BASE_SAMPLES + (HAS_BONUS ? 1 : 0);

  // Der Konfigurator listet die Werte EINER Produktoption als Muster. Welche
  // Option das ist, heisst je nach Sortiment anders: Teppich- und Vinylboden
  // fuehren "Farbe", folierte Sockelleisten "Dekor". Dieselbe Liste steht in
  // snippets/tp-musteroption.liquid, das entscheidet, wohin der Muster-Link
  // zeigt - beide muessen gleich bleiben.
  var OPTION_NAMES = ['farbe', 'dekor', 'color'];

  function findOption(product) {
    return (product.options || []).find(function (entry) {
      return OPTION_NAMES.indexOf(String(entry.name || '').trim().toLowerCase()) !== -1;
    });
  }

  function colorPosition(product) {
    var option = findOption(product);
    return option ? Number(option.position) : 0;
  }

  // Sichtbare Bezeichnung fuer Oberflaeche und Warenkorbzeile: der echte
  // Optionsname des Produkts, nicht ein fest verdrahtetes "Farbe".
  function getOptionName(product) {
    var option = findOption(product);
    var name = option ? String(option.name || '').trim() : '';
    return name || 'Farbe';
  }

  function getOptionTerm(product, form) {
    var name = getOptionName(product).toLowerCase();
    if (name === 'dekor') return form === 'plural' ? 'Dekore' : 'Dekor';
    return form === 'plural' ? 'Farben' : 'Farbe';
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
      // "image" darf auf das Produkt-Hauptbild zurueckfallen - das traegt die
      // Auswahlkarte auf /pages/muster, wo jede Farbe ohnehin ein Bild zeigen
      // soll. "exactImage" bleibt leer, wenn die Variante kein eigenes Bild
      // hat: das ist die Grundlage fuer das Warenkorb-Musterfoto, das lieber
      // gar kein Bild zeigt als moeglicherweise die falsche Farbe.
      var exactImage = variant.featured_image && variant.featured_image.src
        ? variant.featured_image.src
        : '';
      colors.push({
        value: value,
        variantId: variant.id,
        image: exactImage || product.featured_image || '',
        exactImage: exactImage,
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

  // Musterzeilen erkennt man an der Property _Muster_ID, nicht an einer
  // Varianten-ID: seit 2026-09-16 hat jedes Muster eine eigene Variante im
  // Musterprodukt seiner Qualitaet ("Muster Piumera Teppichboden" / Farbe).
  // Das Sammelprodukt "Kostenloses Muster" bleibt nur als Rueckfall.
  function getSampleState(cart) {
    var keys = new Set();
    var count = (cart.items || []).reduce(function (total, item) {
      if (!item.properties || !item.properties._Muster_ID) return total;
      keys.add(item.properties._Muster_ID);
      return total + Number(item.quantity || 0);
    }, 0);
    return { count: count, remaining: Math.max(0, MAX_SAMPLES - count), keys: keys };
  }

  // Handle des Musterprodukts einer Qualitaet. Angelegt wird es je
  // Quellprodukt mit einer Variante pro Farbe, SKU "M-<Quell-SKU>"; so steht
  // die Farbe im Variantentitel und damit auf Lieferschein, Kommissionierliste,
  // in beiden Bestellmails und im Admin - ohne Sonderlogik.
  function sampleProductHandle(productHandle) {
    return 'muster-' + slug(productHandle);
  }

  // Ordnet jeder Farbe die passende Variante des Musterprodukts zu. Fehlt
  // dort eine Farbe (Farbe im Quellprodukt neu, Musterprodukt noch nicht
  // nachgezogen), bleibt sampleVariantId leer und buildCartItems nimmt den
  // Rueckfall - das Muster ist dann weiter bestellbar, nur ohne eigene SKU.
  function assignSampleVariants(colors, sampleProduct, optionName) {
    var index = Object.create(null);
    var position = 0;
    (sampleProduct && sampleProduct.options || []).forEach(function (entry) {
      if (String(entry.name || '').trim().toLowerCase() === String(optionName || '').trim().toLowerCase()) {
        position = Number(entry.position);
      }
    });
    if (position) {
      (sampleProduct.variants || []).forEach(function (variant) {
        var value = String(variant['option' + position] || '').trim().toLowerCase();
        if (value && variant.available) index[value] = variant.id;
      });
    }
    return colors.map(function (color) {
      var hit = index[String(color.value || '').trim().toLowerCase()];
      var copy = {};
      Object.keys(color).forEach(function (key) { copy[key] = color[key]; });
      copy.sampleVariantId = hit || null;
      return copy;
    });
  }

  function getSelectionStatus(cartCount, selectedCount) {
    var inCart = Math.max(0, Number(cartCount || 0));
    var newlySelected = Math.max(0, Number(selectedCount || 0));
    var total = Math.min(MAX_SAMPLES, inCart + newlySelected);
    var remaining = Math.max(0, MAX_SAMPLES - total);
    var message;

    if (total === 0) {
      message = '0 von ' + MAX_SAMPLES + ' Mustern ausgewählt';
    } else if (total >= MAX_SAMPLES) {
      message = MAX_SAMPLES + ' von ' + MAX_SAMPLES + ' Mustern erreicht. Entfernen Sie zuerst ein Muster im Warenkorb, um ein anderes auszuwählen.';
    } else {
      var location = newlySelected === 0 ? ' im Warenkorb' : ' insgesamt ausgewählt';
      var possibility = remaining === 1 ? 'noch 1 weiteres möglich' : remaining + ' weitere möglich';
      message = total + ' von ' + MAX_SAMPLES + ' Mustern' + location + ' · ' + possibility;
    }

    return {
      total: total,
      remaining: remaining,
      limitReached: total >= MAX_SAMPLES,
      message: message,
    };
  }

  function buildCartItems(args) {
    var optionName = args.optionName || getOptionName(args.product);
    return args.colors.map(function (color) {
      var eigeneVariante = Boolean(color.sampleVariantId);
      var properties = {
        _Muster_ID: sampleKey(args.product.handle, color.value),
        _Quellprodukt: args.product.handle,
        _Quellprodukt_ID: String(args.product.id),
        _Quellvariante_ID: String(color.variantId),
        // Nur das eigene Variantenbild, nie der Produkt-Fallback von
        // "image" - der Warenkorb soll kein Bild zeigen, statt moeglicherweise
        // die falsche Farbe.
        _Bild: color.exactImage || '',
        _Produktlink: args.origin + '/products/' + args.product.handle,
      };
      // Mit eigener Variante stehen Produkt und Farbe im Titel der Zeile
      // ("Muster Piumera Teppichboden - Taupe Dunkel"). Nur der Rueckfall auf
      // das Sammelprodukt "Kostenloses Muster" braucht sie als Properties,
      // sonst wuesste niemand, welches Muster gemeint ist.
      if (!eigeneVariante) {
        properties.Produkt = args.product.title;
        properties[optionName] = color.value;
      }
      return {
        id: Number(eigeneVariante ? color.sampleVariantId : args.sampleVariantId),
        quantity: 1,
        properties: properties,
      };
    });
  }

  global.TPSampleCheckoutCore = {
    SAMPLE_HANDLE: SAMPLE_HANDLE,
    MAX_SAMPLES: MAX_SAMPLES,
    HAS_BONUS: HAS_BONUS,
    getUniqueColors: getUniqueColors,
    getOptionName: getOptionName,
    getOptionTerm: getOptionTerm,
    sampleKey: sampleKey,
    getSampleState: getSampleState,
    sampleProductHandle: sampleProductHandle,
    assignSampleVariants: assignSampleVariants,
    getSelectionStatus: getSelectionStatus,
    buildCartItems: buildCartItems,
  };
})(window);
