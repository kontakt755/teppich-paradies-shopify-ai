/*
 * Produktseite: Zeile "Muster dieser Farbe auf Lager" (snippets/tp-muster-lager) an die gewaehlte
 * Farbe binden. Der Server rendert den Startzustand; die Farbwaehler rendern den Musterknopf beim
 * Wechsel nicht neu, deshalb schaltet dieses Skript um.
 *
 * Gewaehlt ist, was in der Section der Zeile angehakt ist - in einem der drei Waehler, die das
 * Theme fuer die Farbe kennt: blocks/color-swatch-picker (Radiofelder "color-swatch-..."),
 * Horizon-Knoepfe ("<Option>-<Block>-<Produkt>") und Auswahlliste ("options[<Option>]").
 * Die Farbnamen der Zeile stehen klein geschrieben im Attribut data-tp-ms-farben.
 * Liste aelter als 2 Stunden: keine Zeile (wie sofortListe in tp-sample-checkout-core.js).
 */
(function () {
  if (window.TPMusterLager) return;
  var MAX_ALTER_MS = 2 * 60 * 60 * 1000;

  function gewaehlteWerte(wurzel, option) {
    var name = String(option || '').trim().toLowerCase();
    var werte = [];
    wurzel.querySelectorAll('input[type="radio"]:checked').forEach(function (radio) {
      var feld = String(radio.name || '').toLowerCase();
      if (feld.indexOf('color-swatch-') === 0 || feld === 'options[' + name + ']' || (name && feld.indexOf(name + '-') === 0)) werte.push(radio.value);
    });
    wurzel.querySelectorAll('select').forEach(function (auswahl) {
      if (String(auswahl.name || '').toLowerCase() === 'options[' + name + ']') werte.push(auswahl.value);
    });
    return werte.map(function (wert) { return String(wert || '').trim().toLowerCase(); });
  }

  // true = zeigen, false = verbergen, null = nichts zu entscheiden (kein Variantenwaehler)
  function entscheide(zeile) {
    var stand = Date.parse(zeile.getAttribute('data-tp-ms-stand'));
    if (!isFinite(stand) || Date.now() - stand > MAX_ALTER_MS) return false;
    var farben;
    try { farben = JSON.parse(zeile.getAttribute('data-tp-ms-farben')); } catch (e) { return false; }
    if (!Array.isArray(farben)) return false;
    var werte = gewaehlteWerte(zeile.closest('.shopify-section') || document, zeile.getAttribute('data-tp-ms-option'));
    if (!werte.length) return null;
    return werte.some(function (wert) { return farben.indexOf(wert) !== -1; });
  }

  function aktualisiere() {
    document.querySelectorAll('[data-tp-ms-zeile]').forEach(function (zeile) {
      var zeigen = entscheide(zeile);
      if (zeigen === null) return;
      zeile.hidden = !zeigen;
    });
  }

  window.TPMusterLager = { entscheide: entscheide, aktualisiere: aktualisiere };
  document.addEventListener('change', aktualisiere);
  document.addEventListener('variant:update', aktualisiere);
  document.addEventListener('tp:farbe-wechsel', aktualisiere);
  aktualisiere();
})();
