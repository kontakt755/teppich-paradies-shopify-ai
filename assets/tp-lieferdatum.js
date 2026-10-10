/*
  Voraussichtliches Lieferdatum aus einer Werktage-Spanne (Issue #165).

  Rechenkern ohne DOM (UMD an globalThis.TPLieferdatum) plus ein kleiner
  Aufwerter fuer [data-tp-lieferdatum]-Elemente aus snippets/tp-lieferzeit.
  Dieselbe Datei rechnet im Shop und in qa/tests/lieferdatum.test.mjs.

  Regeln:
  - Gerechnet wird im Browser, nicht in Liquid: Shopify liefert Seiten aus dem
    Cache, ein serverseitig eingesetztes Datum waere nach Mitternacht falsch.
    Ohne JavaScript bleibt die Werktage-Angabe aus dem Liquid stehen.
  - "Heute" ist der Kalendertag in Europe/Berlin, unabhaengig von der Zeitzone
    des Kunden.
  - Werktage sind Montag bis Freitag ohne bundeseinheitliche Feiertage und ohne
    die Feiertage in Brandenburg (Sitz des Geschaefts).
  - Der Bestelltag zaehlt nie mit: "2 Werktage" ist der zweite Werktag nach
    dem Bestelltag.
  - Annahmeschluss (Theme-Einstellung, optional): Bestellungen ab dieser
    Uhrzeit (Berlin) zaehlen, als waeren sie am Folgetag eingegangen. Leer =
    kein Annahmeschluss.
  - Nur Angaben in Werktagen werden umgerechnet ("2–5 Werktage",
    "ca. 5–8 Werktage inkl. Ketteln"). Kalendertage ("ca. 14 Tage") und
    freie Texte bleiben unveraendert stehen.
*/
(function (root) {
  'use strict';

  var TAG_MS = 86400000;
  var WOCHENTAGE = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  var MAX_WERKTAGE = 30;

  function utc(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d));
  }

  function plusTage(datum, n) {
    return new Date(datum.getTime() + n * TAG_MS);
  }

  function schluessel(datum) {
    return datum.toISOString().slice(0, 10);
  }

  // Ostersonntag nach dem gregorianischen Algorithmus (Meeus/Jones/Butcher).
  function ostersonntag(jahr) {
    var a = jahr % 19;
    var b = Math.floor(jahr / 100);
    var c = jahr % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var monat = Math.floor((h + l - 7 * m + 114) / 31);
    var tag = ((h + l - 7 * m + 114) % 31) + 1;
    return utc(jahr, monat, tag);
  }

  var feiertagCache = {};

  // Bundeseinheitliche Feiertage plus Brandenburg (Ostersonntag,
  // Pfingstsonntag, Reformationstag). Schluessel 'JJJJ-MM-TT' -> Name.
  function feiertage(jahr) {
    if (feiertagCache[jahr]) return feiertagCache[jahr];
    var ostern = ostersonntag(jahr);
    var liste = [
      [utc(jahr, 1, 1), 'Neujahr'],
      [plusTage(ostern, -2), 'Karfreitag'],
      [ostern, 'Ostersonntag'],
      [plusTage(ostern, 1), 'Ostermontag'],
      [utc(jahr, 5, 1), 'Tag der Arbeit'],
      [plusTage(ostern, 39), 'Christi Himmelfahrt'],
      [plusTage(ostern, 49), 'Pfingstsonntag'],
      [plusTage(ostern, 50), 'Pfingstmontag'],
      [utc(jahr, 10, 3), 'Tag der Deutschen Einheit'],
      [utc(jahr, 10, 31), 'Reformationstag'],
      [utc(jahr, 12, 25), '1. Weihnachtstag'],
      [utc(jahr, 12, 26), '2. Weihnachtstag']
    ];
    var map = {};
    for (var n = 0; n < liste.length; n++) map[schluessel(liste[n][0])] = liste[n][1];
    feiertagCache[jahr] = map;
    return map;
  }

  function istFeiertag(datum) {
    return Object.prototype.hasOwnProperty.call(feiertage(datum.getUTCFullYear()), schluessel(datum));
  }

  function istWerktag(datum) {
    var wt = datum.getUTCDay();
    return wt !== 0 && wt !== 6 && !istFeiertag(datum);
  }

  // n-ter Werktag nach dem Tag "datum" (datum selbst zaehlt nicht).
  function plusWerktage(datum, n) {
    var d = datum;
    var gezaehlt = 0;
    while (gezaehlt < n) {
      d = plusTage(d, 1);
      if (istWerktag(d)) gezaehlt++;
    }
    return d;
  }

  // Kalendertag und Uhrzeit in Berlin fuer einen Zeitpunkt.
  function berlin(jetzt) {
    var teile = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(jetzt);
    var w = {};
    for (var n = 0; n < teile.length; n++) w[teile[n].type] = teile[n].value;
    return {
      datum: utc(Number(w.year), Number(w.month), Number(w.day)),
      minuten: (Number(w.hour) % 24) * 60 + Number(w.minute)
    };
  }

  // "14:00", "14.00", "14" -> Minuten seit Mitternacht; sonst null.
  function leseAnnahmeschluss(wert) {
    var t = String(wert == null ? '' : wert).trim();
    var m = /^(\d{1,2})(?:[:.](\d{2}))?(?:\s*Uhr)?$/i.exec(t);
    if (!m) return null;
    var h = Number(m[1]);
    var min = m[2] ? Number(m[2]) : 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  // "2–5 Werktage", "ca. 5-8 Werktage inkl. Ketteln", "3 bis 5 Werktage",
  // "4 Werktage" -> {min, max}; alles ohne "Werktag" -> null.
  function leseWerktage(text) {
    var t = String(text == null ? '' : text);
    var spanne = /(\d{1,2})\s*(?:[–—‒-]|bis)\s*(\d{1,2})\s*Werktag/i.exec(t);
    var min;
    var max;
    if (spanne) {
      min = Number(spanne[1]);
      max = Number(spanne[2]);
    } else {
      var einzeln = /(\d{1,2})\s*Werktag/i.exec(t);
      if (!einzeln) return null;
      min = max = Number(einzeln[1]);
    }
    if (min > max) {
      var tmp = min;
      min = max;
      max = tmp;
    }
    if (min < 1 || max > MAX_WERKTAGE) return null;
    return { min: min, max: max };
  }

  // {von, bis} als UTC-Kalendertage oder null.
  function lieferspanne(optionen) {
    var w = leseWerktage(optionen.text);
    if (!w) return null;
    var jetzt = berlin(optionen.jetzt || new Date());
    var basis = jetzt.datum;
    var schluss = leseAnnahmeschluss(optionen.annahmeschluss);
    if (schluss !== null && jetzt.minuten >= schluss) basis = plusTage(basis, 1);
    return { von: plusWerktage(basis, w.min), bis: plusWerktage(basis, w.max), werktage: w };
  }

  function zweistellig(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // "Di., 14.10."
  function formatiere(datum) {
    return WOCHENTAGE[datum.getUTCDay()] + ', ' + zweistellig(datum.getUTCDate()) + '.' + zweistellig(datum.getUTCMonth() + 1) + '.';
  }

  // Kundensichtbare Teile oder null, wenn nicht umgerechnet werden kann.
  function lieferText(optionen) {
    var spanne = lieferspanne(optionen);
    if (!spanne) return null;
    var gleich = spanne.von.getTime() === spanne.bis.getTime();
    var datum = gleich ? formatiere(spanne.von) : formatiere(spanne.von) + ' – ' + formatiere(spanne.bis);
    var basis = String(optionen.text).trim().replace(/\s+/g, ' ').replace(/\.$/, '');
    if (!/^ca\./i.test(basis)) basis = 'ca. ' + basis;
    return { datum: datum, zusatz: '(' + basis + ')', von: spanne.von, bis: spanne.bis };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (z) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z];
    });
  }

  // HTML fuer ein [data-tp-lieferdatum]-Element oder null.
  function markup(el, jetzt) {
    var teile = lieferText({
      text: el.getAttribute('data-text'),
      annahmeschluss: el.getAttribute('data-annahmeschluss'),
      jetzt: jetzt
    });
    if (!teile) return null;
    var label = el.getAttribute('data-label') || 'Lieferung voraussichtlich';
    var fett = el.getAttribute('data-fett') === '1';
    var html = (fett ? '<strong>' + escapeHtml(label) + '</strong>' : escapeHtml(label)) + ' ' + escapeHtml(teile.datum);
    if (el.getAttribute('data-zusatz') !== '0') {
      html += ' <span class="tp-lieferdatum__zusatz">' + escapeHtml(teile.zusatz) + '</span>';
    }
    return html;
  }

  function aufwerten(wurzel) {
    var liste = (wurzel || document).querySelectorAll('[data-tp-lieferdatum]');
    var jetzt = new Date();
    for (var n = 0; n < liste.length; n++) {
      var el = liste[n];
      // Ein Morph von Horizon (Variantenwechsel) setzt den Liquid-Text zurueck:
      // dann neu rechnen, sonst nichts anfassen.
      if (el.__tpLieferdatum && el.innerHTML === el.__tpLieferdatum) continue;
      var html = markup(el, jetzt);
      if (html === null) continue;
      el.innerHTML = html;
      el.__tpLieferdatum = el.innerHTML;
      el.hidden = false;
      el.setAttribute('data-tp-lieferdatum-fertig', '');
    }
  }

  var api = {
    ostersonntag: ostersonntag,
    feiertage: feiertage,
    istWerktag: istWerktag,
    plusWerktage: plusWerktage,
    berlin: berlin,
    leseAnnahmeschluss: leseAnnahmeschluss,
    leseWerktage: leseWerktage,
    lieferspanne: lieferspanne,
    formatiere: formatiere,
    lieferText: lieferText,
    aufwerten: aufwerten
  };

  if (root.TPLieferdatum && root.TPLieferdatum.gestartet) return;
  root.TPLieferdatum = api;

  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  api.gestartet = true;

  function start() {
    aufwerten(document);
    if (typeof MutationObserver === 'undefined') return;
    var geplant = false;
    new MutationObserver(function () {
      if (geplant) return;
      geplant = true;
      (root.requestAnimationFrame || setTimeout)(function () {
        geplant = false;
        aufwerten(document);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
