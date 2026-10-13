/*
 * Vinyl-Muster hoechstens 3 je Bestellung (Inhaber 13.10.2026).
 *
 * Die Produktseite rendert den Musterknopf fuer Vinyl in beiden Zustaenden
 * (snippets/tp-muster-grenze, blocks/tp-muster-cta, blocks/tp-rollware-rechner):
 * [data-tp-mg-offen] = Link zum Konfigurator, [data-tp-mg-voll] = deaktivierter
 * Knopf mit Erklaerung. Der Server kennt den Warenkorb nur beim Laden der Seite;
 * dieses Skript schaltet nach einer Aenderung im Warenkorb-Drawer (cart:update)
 * und nach dem Zurueck-Knopf (Seite aus dem Browser-Cache) um.
 *
 * Grenze und Kennzeichen wie in assets/tp-sample-checkout-core.js (VINYL_MAX,
 * _Muster_Gruppe = vinyl). Durchgesetzt wird die Grenze im Konfigurator.
 */
(function () {
  if (window.TPMusterGrenze) return;
  var VINYL_MAX = 3;
  window.TPMusterGrenze = { VINYL_MAX: VINYL_MAX };

  function vinylMuster(cart) {
    return ((cart && cart.items) || []).reduce(function (summe, item) {
      var gruppe = item && item.properties ? item.properties._Muster_Gruppe : '';
      return summe + (gruppe === 'vinyl' ? Number(item.quantity || 0) : 0);
    }, 0);
  }

  function setze(voll) {
    document.querySelectorAll('[data-tp-muster-grenze]').forEach(function (box) {
      box.setAttribute('data-tp-muster-grenze', voll ? 'voll' : 'vinyl');
      box.querySelectorAll('[data-tp-mg-offen]').forEach(function (el) { el.hidden = voll; });
      box.querySelectorAll('[data-tp-mg-voll]').forEach(function (el) { el.hidden = !voll; });
    });
  }

  function pruefe(cart) {
    if (!document.querySelector('[data-tp-muster-grenze]')) return;
    var laden = cart && Array.isArray(cart.items)
      ? Promise.resolve(cart)
      : fetch('/cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; });
    laden.then(function (c) {
      if (c) setze(vinylMuster(c) >= VINYL_MAX);
    }).catch(function () {});
  }

  document.addEventListener('cart:update', function (event) {
    pruefe(event && event.detail ? event.detail.resource : null);
  });
  window.addEventListener('pageshow', function (event) {
    if (event && event.persisted) pruefe(null);
  });

  window.TPMusterGrenze.vinylMuster = vinylMuster;
  window.TPMusterGrenze.setze = setze;
})();
