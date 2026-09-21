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

  // Masseingabe des Kunden -> ganze Zentimeter. Der Kunde darf in cm oder m
  // tippen, mit Komma oder Punkt, mit oder ohne Einheit ("350", "350 cm",
  // "3,5", "3.50 m"). Eine Einheit im Text schlaegt den Umschalter; ohne
  // Einheit gilt der Umschalter (Standard cm). Bewusst KEINE Heuristik
  // "kleine Zahl = Meter" - die erzeugt Fehlbestellungen.
  //
  // Gerechnet wird auf den Ziffern, nicht mit Gleitkomma: Meter werden durch
  // Verschieben des Kommas um zwei Stellen zu cm (3.55 m -> 355, nicht
  // 354,99999). Ein Rest unter einem Zentimeter wird wie bisher aufgerundet -
  // die fuer den Kunden sichere Richtung.
  //
  // Ergebnis: { cm, fehler, einheit }. fehler: '' = gueltig (cm >= 0, ganz),
  // 'leer', 'negativ', 'zu_gross', 'ungueltig'. Bei jedem Fehler ist cm null -
  // nie wird eine unklare Eingabe still umgedeutet.
  var MASS = /^(\d+(?:[.,]\d+)?|[.,]\d+)\s*(cm|zentimeter|m|meter)?\.?$/i;
  function parseMass(text, einheit) {
    var std = einheit === 'm' ? 'm' : 'cm';
    var t = String(text == null ? '' : text).replace(/\u00a0/g, ' ').trim();
    if (!t) return { cm: null, fehler: 'leer', einheit: std };
    if (/^[-\u2212\u2013]/.test(t)) return { cm: null, fehler: 'negativ', einheit: std };
    var m = MASS.exec(t);
    if (!m) return { cm: null, fehler: 'ungueltig', einheit: std };
    var unit = m[2] ? (/^m/i.test(m[2]) ? 'm' : 'cm') : std;
    var teile = m[1].replace(',', '.').split('.');
    var ganz = (teile[0] || '0').replace(/^0+(?=\d)/, '');
    var bruch = teile[1] || '';
    if (unit === 'm') {
      var b = (bruch + '00');
      ganz = (ganz + b.slice(0, 2)).replace(/^0+(?=\d)/, '');
      bruch = b.slice(2);
    }
    if (ganz.length > 7) return { cm: null, fehler: 'zu_gross', einheit: unit };
    var cm = parseInt(ganz, 10);
    if (/[1-9]/.test(bruch)) cm += 1;
    return { cm: cm, fehler: '', einheit: unit };
  }

  // Gegenprobe und Feldwert: dieselben ganzen cm in beiden Einheiten.
  function massAlsM(cm) {
    var n = Math.round(cm);
    var s = String(Math.abs(n));
    while (s.length < 3) s = '0' + s;
    return (n < 0 ? '-' : '') + s.slice(0, -2) + ',' + s.slice(-2);
  }
  function massWert(cm, einheit) {
    return einheit === 'm' ? massAlsM(cm) : String(Math.round(cm));
  }
  function massGegenprobe(cm) {
    return '= ' + Math.round(cm) + ' cm = ' + massAlsM(cm) + ' m';
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

  // Beim Zuschnitt beim Lieferanten kommt keine gerade Kante heraus - der
  // Kettler schneidet nach. Deshalb wird um diese Zugabe breiter bestellt,
  // und die Rolle muss Breite plus Zugabe fassen (Inhaber, 2026-09-12:
  // "der Kunde will 250, wir bestellen 255").
  var ZUGABE_CM = 5;

  // Kleinste Rolle, aus der die Breite samt Zugabe geschnitten werden kann.
  function rolleFuer(wCm, widths, zugabe) {
    var z = typeof zugabe === 'number' ? zugabe : ZUGABE_CM;
    var list = (widths || []).slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < list.length; i++) {
      if (list[i] + EPS >= wCm + z) return list[i];
    }
    return 0;
  }

  // Groesste Breite, die eine Farbe im Raummass hergibt: groesste Rolle
  // minus Zugabe. Volle Rollenbreite ist Meterware, kein Raummass.
  function maxRaumBreite(widths, zugabe) {
    var z = typeof zugabe === 'number' ? zugabe : ZUGABE_CM;
    var m = 0;
    (widths || []).forEach(function (w) { if (w > m) m = w; });
    return m > z ? m - z : 0;
  }

  // '' = gueltig, 'leer' = noch nichts eingegeben, sonst der Grund als Text.
  function pruefeBreite(wCm, minCm, maxCm) {
    if (!(wCm > 0)) return 'leer';
    if (wCm < minCm) return 'Breite mindestens ' + minCm + ' cm.';
    if (wCm > maxCm + EPS) return 'Breiter als ' + maxCm + ' cm geht nicht aus einem Stück – bitte beraten lassen.';
    return '';
  }

  // Vergleich, den der Kunde sonst nicht sehen wuerde: kostet dasselbe Stueck
  // als Meterware weniger als im Raummass? Geprueft werden ALLE Rollen, die
  // mindestens so breit sind wie das Stueck - Meterware braucht keine Zugabe,
  // weil die Rolle nicht nachgeschnitten wird. Genannt wird die guenstigste
  // (399 x 500 -> 400er-Rolle, nicht die 500er, aus der das Raummass kaeme).
  // Beide Betraege werden aus den echten Variantenpreisen gerechnet (EUR je
  // m²), nicht aus einem Faktor. rateMeter ist eine Funktion widthCm -> EUR je
  // m² (0 = keine Variante fuer diese Rolle).
  // bill: Flaeche -> abgerechnete Flaeche (volle m² oder 0,01 m²), damit der
  // Hinweis dieselben Betraege nennt wie die Preisbox. Ohne bill: exakt.
  function meterwareGuenstiger(wCm, lenCm, rateRaum, widths, rateMeter, bill) {
    if (!(wCm > 0) || !(lenCm > 0) || !(rateRaum > 0)) return null;
    var b = typeof bill === 'function' ? bill : function (a) { return a; };
    var beste = null;
    (widths || []).forEach(function (rolle) {
      if (!(rolle + EPS >= wCm)) return;
      var rm = rateMeter(rolle);
      if (!(rm > 0)) return;
      var total = b(rolle * lenCm / 10000) * rm;
      if (!beste || total + EPS < beste.totalMeter) beste = { rolle: rolle, totalMeter: total };
    });
    if (!beste) return null;
    var totalRaum = b(wCm * lenCm / 10000) * rateRaum;
    return {
      rolle: beste.rolle,
      totalRaum: totalRaum,
      totalMeter: beste.totalMeter,
      guenstiger: beste.totalMeter + EPS < totalRaum
    };
  }

  root.TPRollwareArt = {
    isWunsch: isWunsch,
    isBreite: isBreite,
    toCm: toCm,
    parseMass: parseMass,
    massWert: massWert,
    massGegenprobe: massGegenprobe,
    findWidthOption: findWidthOption,
    numericWidths: numericWidths,
    wunschOk: wunschOk,
    rolleFuer: rolleFuer,
    maxRaumBreite: maxRaumBreite,
    ZUGABE_CM: ZUGABE_CM,
    pruefeBreite: pruefeBreite,
    meterwareGuenstiger: meterwareGuenstiger
  };
})(typeof window !== 'undefined' ? window : globalThis);
