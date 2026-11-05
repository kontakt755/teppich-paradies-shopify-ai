/*
 * Frische Warenkorb-Abschnitte fuer die eigenen Kaufwege (Konfigurator, Rollenware,
 * Laengenzuschnitt, Pakete). Ohne sie oeffnet das Warenkorbfenster mit dem alten
 * Inhalt und zeigt beim ersten Artikel eine halbe Sekunde "leer", bis
 * component-cart-items.js nachgeladen hat.
 *
 * Bewusst ein eigener Abruf nach dem Hinzufuegen und nach dem Zuschnitt-Abgleich:
 * Die Abschnitte aus der Antwort von /cart/add.js kennen das Zuschnitt-Attribut noch
 * nicht und zeigen deshalb die Checkout-Sperre aus snippets/tp-cart-gruppe.liquid.
 *
 * Schlaegt der Abruf fehl oder dauert er zu lange, kommt null zurueck. Dann laedt
 * component-cart-items.js wie bisher selbst nach; der Kauf haengt nie daran.
 */
(function (global) {
  var HOECHSTENS_MS = 2500;

  function abschnitte() {
    var ids = [];
    document.querySelectorAll('cart-items-component').forEach(function (el) {
      var id = el.dataset.sectionId;
      if (id && ids.indexOf(id) === -1) ids.push(id);
    });
    if (!ids.length) return Promise.resolve(null);

    // Ohne Accept-Kopf: Auf einer Produktseite liefert "application/json" das Produkt statt der Abschnitte.
    var abruf = fetch(global.location.pathname + '?sections=' + encodeURIComponent(ids.join(',')), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; });
    var zeitlimit = new Promise(function (fertig) { setTimeout(function () { fertig(null); }, HOECHSTENS_MS); });
    return Promise.race([abruf, zeitlimit]).catch(function () { return null; });
  }

  if (!global.TPWarenkorbAbschnitte) global.TPWarenkorbAbschnitte = abschnitte;
})(window);
