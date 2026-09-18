/*
  Berechnete Warenkorbzeilen: Erkennung, Gruppen und Kundeneinheit.

  Reine Funktionen ohne DOM. Dieselbe Datei laeuft im Shop
  (assets/component-cart-items.js) und in den Tests
  (qa/tests/cart-gruppen.test.mjs). Die Server-Seite ist
  snippets/tp-cart-gruppe.liquid - beide setzen dieselben Regeln um; die
  Tests hier pruefen den JS-Teil, der Liquid-Teil wird per Grep auf die
  gleichen Property-Namen geprueft.

  Eine Zeile ist "berechnet", wenn Rollenrechner oder Einfass-Konfigurator
  sie erzeugt haben - ihre Menge ergibt sich aus Massen, nicht aus einer
  Stueckzahl. Erkannt wird das datengetrieben, nie ueber Handles:
    (a) Property _Gruppe vorhanden
    (b) Property Art mit Wert Meterware oder Raummass
    (c) Produkt-Metafeld custom.preis_pro_001_qm == true
    (d) Property "Zu Teppich"/"Zu Teppichboden" oder "Kante umlaufend"
        (Service-Zeile: Kettelservice, Fussleiste, Haftunterlage) - oder
        Produkttyp "Service" (so tragen Kettelservice und Fussleiste ihn im
        Shop; eine Service-Zeile ohne Properties kam ohne Rechner herein)
    (e) Optionswert "Wunschmass" (Raummass-Variante)

  Fail safe: Eine Zeile, die ohne Rechner in den Warenkorb kam (Service ohne
  Gruppe, Flaechenware ohne Mass, Gruppe ohne Hauptzeile), sperrt den
  Checkout, statt still zum Variantenpreis durchzulaufen.

  Eingabeformat einer Zeile (aus /cart.js oder aus Liquid-Attributen):
    { key, quantity, properties: {..}, preisPro001Qm: bool, optionen: [..], typ, titel }
*/
(function (root) {
  'use strict';

  var ART_WERTE = /^(meterware|raumma(ß|ss))$/i;
  var WUNSCH = /^wunschma(ß|ss)$/i;
  var FLAECHE_KEYS = ['Fläche (abgerechnet)', 'Fläche', 'Fläche (aufgerundet)', 'Fläche (berechnet)'];
  var MASS_KEYS = FLAECHE_KEYS.concat(['Ihre Breite', 'Rollenbreite', 'Breite', 'Maße']);
  var SERVICE_KEYS = ['Zu Teppich', 'Zu Teppichboden'];
  var SERVICE_TYP = /^service$/i;

  var GRUND = {
    GRUPPE_OHNE_HAUPT: 'gruppe-ohne-haupt',
    OHNE_MASS: 'ohne-mass',
    SERVICE_OHNE_GRUPPE: 'service-ohne-gruppe'
  };

  var TEXT = {};
  TEXT[GRUND.GRUPPE_OHNE_HAUPT] =
    'Dieser Service gehört zu einem Artikel, der nicht mehr im Warenkorb ist – bitte entfernen';
  TEXT[GRUND.OHNE_MASS] =
    'Dieser Artikel braucht eine Maßangabe – bitte über die Produktseite konfigurieren';
  TEXT[GRUND.SERVICE_OHNE_GRUPPE] = TEXT[GRUND.OHNE_MASS];

  function props(zeile) {
    return (zeile && zeile.properties) || {};
  }

  function prop(zeile, key) {
    var v = props(zeile)[key];
    if (v == null) return '';
    return String(v).trim();
  }

  function hatProp(zeile, key) {
    return prop(zeile, key) !== '';
  }

  function gruppe(zeile) {
    return prop(zeile, '_Gruppe');
  }

  function istFlaechenware(zeile) {
    return !!(zeile && (zeile.preisPro001Qm === true || zeile.preisPro001Qm === 'true'));
  }

  function istWunschmass(zeile) {
    var opts = (zeile && zeile.optionen) || [];
    for (var i = 0; i < opts.length; i++) {
      if (WUNSCH.test(String(opts[i] == null ? '' : opts[i]).trim())) return true;
    }
    return false;
  }

  // Service-Zeile: haengt an einem anderen Artikel (Kettelservice, Fussleiste,
  // Haftunterlage). Erkannt an "Zu Teppich…" - oder an "Kante umlaufend" ohne
  // eigene Masse (die Teppich-Hauptzeile traegt "Maße" dazu).
  function istServiceTyp(zeile) {
    return SERVICE_TYP.test(String(zeile && zeile.typ != null ? zeile.typ : '').trim());
  }

  function istService(zeile) {
    for (var i = 0; i < SERVICE_KEYS.length; i++) {
      if (hatProp(zeile, SERVICE_KEYS[i])) return true;
    }
    if (hatProp(zeile, 'Kante umlaufend') && !hatProp(zeile, 'Maße')) return true;
    return istServiceTyp(zeile);
  }

  function istBerechnet(zeile) {
    if (!zeile) return false;
    if (gruppe(zeile)) return true;
    if (ART_WERTE.test(prop(zeile, 'Art'))) return true;
    if (hatProp(zeile, 'Gewünschte Länge')) return true;
    if (istFlaechenware(zeile)) return true;
    if (istService(zeile)) return true;
    if (hatProp(zeile, 'Kante umlaufend')) return true;
    if (istWunschmass(zeile)) return true;
    return false;
  }

  function hatMass(zeile) {
    for (var i = 0; i < MASS_KEYS.length; i++) {
      if (hatProp(zeile, MASS_KEYS[i])) return true;
    }
    return false;
  }

  function flaechenText(zeile) {
    for (var i = 0; i < FLAECHE_KEYS.length; i++) {
      var v = prop(zeile, FLAECHE_KEYS[i]);
      if (v) return v;
    }
    return '';
  }

  // Menge in Kundeneinheit, aus den Properties abgeleitet. Kein Preis.
  // Fallback ist die Stueckzahl, damit nie eine Zeile ohne Mengenangabe steht.
  function kundeneinheit(zeile) {
    if (!zeile) return '';
    var fl = flaechenText(zeile);
    if (fl) {
      return hatProp(zeile, 'Mindestpreis') ? fl + ' (Mindestpreis)' : fl;
    }
    if (istService(zeile)) {
      var kante = prop(zeile, 'Kante umlaufend');
      if (kante) return kante + ' Kettelkante';
      var laenge = prop(zeile, 'Länge');
      if (laenge && hatProp(zeile, 'Höhe')) return laenge + ' Fußleiste';
      if (laenge) return laenge;
      var bahnen = prop(zeile, 'Bahnen');
      if (bahnen) return String(zeile.quantity) + ' lfm (' + bahnen + (bahnen === '1' ? ' Bahn' : ' Bahnen') + ')';
    }
    var kante2 = prop(zeile, 'Kante umlaufend');
    if (kante2) return kante2;
    var q = zeile.quantity == null ? '' : String(zeile.quantity);
    return q ? q + ' Stück' : '';
  }

  // Gruppen: { kennung: { haupt: zeile|null, mitglieder: [zeile] } }
  function gruppen(zeilen) {
    var out = {};
    (zeilen || []).forEach(function (z) {
      var g = gruppe(z);
      if (!g) return;
      if (!out[g]) out[g] = { haupt: null, mitglieder: [] };
      out[g].mitglieder.push(z);
      if (!istService(z) && !out[g].haupt) out[g].haupt = z;
    });
    return out;
  }

  function hauptzeile(zeile, zeilen) {
    var g = gruppe(zeile);
    if (!g) return null;
    var grp = gruppen(zeilen)[g];
    return grp ? grp.haupt : null;
  }

  // Hinweis fuer eine Nebenzeile: zu welcher Hauptzeile sie gehoert.
  function gruppenHinweis(zeile, zeilen) {
    if (!gruppe(zeile) || !istService(zeile)) return '';
    var h = hauptzeile(zeile, zeilen);
    if (!h) return '';
    var t = h.titel || prop(zeile, 'Zu Teppich') || prop(zeile, 'Zu Teppichboden');
    return 'Gehört zu ' + t + '; wird gemeinsam entfernt';
  }

  // Waisen: Zeilen, die nicht bestellt werden duerfen. Liefert je Zeile
  // {index, key, grund} oder nichts.
  function waisen(zeilen) {
    var out = [];
    var grps = gruppen(zeilen);
    (zeilen || []).forEach(function (z, i) {
      var grund = null;
      var g = gruppe(z);
      if (g && istService(z) && !grps[g].haupt) {
        grund = GRUND.GRUPPE_OHNE_HAUPT;
      } else if (!g && istService(z)) {
        grund = GRUND.SERVICE_OHNE_GRUPPE;
      } else if ((istFlaechenware(z) || istWunschmass(z)) && !hatMass(z)) {
        grund = GRUND.OHNE_MASS;
      }
      if (grund) out.push({ index: i, key: z.key, grund: grund, text: TEXT[grund] });
    });
    return out;
  }

  function checkoutGesperrt(zeilen) {
    return waisen(zeilen).length > 0;
  }

  // Alle Keys, die beim Loeschen einer Zeile mitgehen (die Zeile selbst
  // eingeschlossen). Ohne Gruppe nur die Zeile selbst.
  function zuEntfernen(zeile, zeilen) {
    var g = gruppe(zeile);
    if (!g) return zeile && zeile.key ? [zeile.key] : [];
    var keys = [];
    (zeilen || []).forEach(function (z) {
      if (gruppe(z) === g && z.key && keys.indexOf(z.key) < 0) keys.push(z.key);
    });
    if (zeile && zeile.key && keys.indexOf(zeile.key) < 0) keys.push(zeile.key);
    return keys;
  }

  // /cart/update.js-Body fuer eine Gruppe.
  function updateBody(keys) {
    var updates = {};
    (keys || []).forEach(function (k) { updates[k] = 0; });
    return { updates: updates };
  }

  root.TPCartGruppen = {
    GRUND: GRUND,
    TEXT: TEXT,
    gruppe: gruppe,
    istFlaechenware: istFlaechenware,
    istWunschmass: istWunschmass,
    istServiceTyp: istServiceTyp,
    istService: istService,
    istBerechnet: istBerechnet,
    hatMass: hatMass,
    kundeneinheit: kundeneinheit,
    gruppen: gruppen,
    hauptzeile: hauptzeile,
    gruppenHinweis: gruppenHinweis,
    waisen: waisen,
    checkoutGesperrt: checkoutGesperrt,
    zuEntfernen: zuEntfernen,
    updateBody: updateBody
  };
})(typeof window !== 'undefined' ? window : globalThis);
