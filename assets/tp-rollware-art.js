/*
  Art-Wahl fuer Rollenware: Meterware (volle Rollenbreite) oder Raummass
  (eigene Breite aus einer "Wunschmaß"-Variante).

  Reine Funktionen ohne DOM. Dieselbe Datei laeuft im Shop
  (blocks/tp-rollware-rechner.liquid) und in den Tests
  (qa/tests/rollware-art.test.mjs). Preise kommen nie von hier - abgerechnet
  wird immer Variantenpreis x Menge durch Shopify. Hier wird nur entschieden,
  welche Variante ueberhaupt in Frage kommt und ob der Kunde mit Meterware
  guenstiger faehrt.

  Fail closed: Raummass gibt es nur ueber eine Variante, deren Breitenwert
  exakt "Wunschmaß" heisst, die bestellbar ist, einen Preis hat und deren
  Bezugsquelle den Dienst nicht ausdruecklich ausschliesst
  (lieferant.wunschmass == false). Fehlt eine davon, gibt es nur Meterware.
*/
(function (root) {
  'use strict';

  var WUNSCH = /^wunschma(ß|ss)$/i;
  var BREITE = /^\d+([.,]\d+)?\s?cm$/i;
  var EPS = 1e-9;

  function isWunsch(val) {
    return WUNSCH.test(String(val == null ? '' : val).trim());
  }

  function isBreite(val) {
    return BREITE.test(String(val == null ? '' : val).trim());
  }

  function toCm(val) {
    var n = parseFloat(String(val == null ? '' : val).replace(',', '.'));
    return isNaN(n) ? NaN : n;
  }

  // Index der Breitenoption: alle Werte sind "NNN cm" oder "Wunschmaß",
  // und mindestens einer ist eine echte Breite. Eine Option, die nur aus
  // "Wunschmaß" besteht, ist keine Breitenoption.
  function findWidthOption(options) {
    var idx = -1;
    (options || []).forEach(function (opt, i) {
      var vals = (opt && opt.values) || [];
      var breiten = vals.filter(isBreite).length;
      var wunsch = vals.filter(isWunsch).length;
      if (breiten > 0 && breiten + wunsch === vals.length) idx = i;
    });
    return idx;
  }

  // Sortierte, doppelte-freie Rollenbreiten in cm - "Wunschmaß" faellt raus.
  function numericWidths(variants, wIdx) {
    var seen = {};
    (variants || []).forEach(function (v) {
      if (!v || wIdx < 0 || !v.options) return;
      var n = toCm(v.options[wIdx]);
      if (!isNaN(n)) seen[n] = true;
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  function wunschOk(v, wIdx) {
    if (!v || wIdx < 0 || !v.options) return false;
    if (!isWunsch(v.options[wIdx])) return false;
    if (v.available !== true) return false;
    if (!(parseFloat(v.price) > 0)) return false;
    if (v.wunschmass === false) return false;
    return true;
  }

  // Kleinste Rolle, aus der die Breite geschnitten werden kann.
  function rolleFuer(wCm, widths) {
    var list = (widths || []).slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < list.length; i++) {
      if (list[i] + EPS >= wCm) return list[i];
    }
    return 0;
  }

  // '' = gueltig, 'leer' = noch nichts eingegeben, sonst der Grund als Text.
  function pruefeBreite(wCm, minCm, maxCm) {
    if (!(wCm > 0)) return 'leer';
    if (wCm < minCm) return 'Breite mindestens ' + minCm + ' cm.';
    if (wCm > maxCm + EPS) return 'Breiter als ' + maxCm + ' cm geht nicht aus einem Stück – bitte beraten lassen.';
    return '';
  }

  // Vergleich, den der Kunde sonst nicht sehen wuerde: kostet dasselbe Stueck
  // als Meterware der naechsten Rolle weniger als im Raummass? Beide Betraege
  // werden aus den echten Variantenpreisen gerechnet (EUR je m²), nicht aus
  // einem Faktor. rateMeter ist eine Funktion widthCm -> EUR je m² (0 = keine
  // Variante fuer diese Rolle).
  // bill: Flaeche -> abgerechnete Flaeche (volle m² oder 0,01 m²), damit der
  // Hinweis dieselben Betraege nennt wie die Preisbox. Ohne bill: exakt.
  function meterwareGuenstiger(wCm, lenCm, rateRaum, widths, rateMeter, bill) {
    var rolle = rolleFuer(wCm, widths);
    if (!rolle || !(lenCm > 0) || !(rateRaum > 0)) return null;
    var rm = rateMeter(rolle);
    if (!(rm > 0)) return null;
    var b = typeof bill === 'function' ? bill : function (a) { return a; };
    var totalRaum = b(wCm * lenCm / 10000) * rateRaum;
    var totalMeter = b(rolle * lenCm / 10000) * rm;
    return {
      rolle: rolle,
      totalRaum: totalRaum,
      totalMeter: totalMeter,
      guenstiger: totalMeter + EPS < totalRaum
    };
  }

  root.TPRollwareArt = {
    isWunsch: isWunsch,
    isBreite: isBreite,
    toCm: toCm,
    findWidthOption: findWidthOption,
    numericWidths: numericWidths,
    wunschOk: wunschOk,
    rolleFuer: rolleFuer,
    pruefeBreite: pruefeBreite,
    meterwareGuenstiger: meterwareGuenstiger
  };
})(typeof window !== 'undefined' ? window : globalThis);
