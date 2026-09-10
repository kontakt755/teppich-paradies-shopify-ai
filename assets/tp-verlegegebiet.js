/*
 * Ortspruefung fuer die Sektion "TP Verlegegebiet".
 *
 * Prueft offline gegen assets/tp-verlegegebiet-orte.json - kein Geocoding-
 * Dienst, kein API-Schluessel, keine Kosten, kein Request an Dritte. Die
 * Tabelle wird erst beim ersten Absenden geladen, damit die Sektion beim
 * Seitenaufbau nichts kostet.
 *
 * Die Entfernungen sind Luftlinien zum Mittelpunkt der jeweiligen PLZ. Fuer
 * Ortsnamen steht eine Spanne in der Tabelle: Berlin reicht ueber viele
 * Postleitzahlen, "Berlin liegt im Gebiet" waere sonst eine Behauptung, die
 * fuer den entfernten Rand nicht mehr stimmt.
 *
 * Ohne JavaScript bleibt das Formular verborgen (hidden im Markup), damit
 * kein totes Eingabefeld dasteht. Ueberschrift, Karte, Hinweis und die
 * Kontaktwege stehen unabhaengig davon.
 *
 * Jede Antwort fuehrt weiter, keine endet in einer Absage. Wer im Gebiet
 * wohnt, sieht den Weg zur Anfrage. Wer ausserhalb wohnt, sieht den Weg in
 * den Shop: der Verlegeservice endet bei 50 km, der Versand nicht - das
 * Sortiment geht deutschlandweit. Ohne diesen zweiten Weg waere die Pruefung
 * fuer jeden ausserhalb eine Absage, obwohl er bestellen koennte.
 *
 * Jede Abfrage traegt eine laufende Nummer. Die Tabelle wird beim ersten
 * Absenden geladen, das kann dauern; wer in der Zwischenzeit weitertippt oder
 * erneut absendet, bekaeme sonst die Antwort auf seine alte Eingabe - im
 * schlimmsten Fall eine Zusage fuer eine Postleitzahl, die er gar nicht mehr
 * im Feld stehen hat. Nur die jeweils letzte Abfrage darf anzeigen.
 */
(function () {
  'use strict';

  var TEXTE = {
    innen: function (was, km) {
      return was + ' liegt in unserem üblichen Verlegegebiet – rund ' + km + ' km von Oranienburg entfernt.';
    },
    rand: function (was) {
      return was + ' reicht über die Grenze unseres üblichen Gebiets hinaus. Geben Sie am besten Ihre Postleitzahl ein – oder fragen Sie uns direkt.';
    },
    aussen: function (was) {
      return was + ' liegt außerhalb unseres Verlegegebiets. Ihren Boden liefern wir trotzdem – deutschlandweit. Für eine Verlegung fragen Sie uns gern an.';
    },
    leer: 'Bitte geben Sie eine Postleitzahl oder einen Ort ein.',
    unbekannt: 'Diesen Ort kennen wir nicht. Bitte geben Sie Ihre Postleitzahl ein – oder fragen Sie uns einfach direkt an.',
    fehler: 'Die Prüfung ist gerade nicht möglich. Fragen Sie uns einfach direkt an – wir sagen Ihnen, ob wir zu Ihnen kommen.'
  };

  function normalisieren(wert) {
    return wert
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .normalize('NFKD')
      .replace(/[^a-z0-9]/g, '');
  }

  function tabelleLaden(sektion) {
    if (!sektion._tpVgDaten) {
      sektion._tpVgDaten = fetch(sektion.dataset.orte, { credentials: 'omit' }).then(function (antwort) {
        if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
        return antwort.json();
      });
    }
    return sektion._tpVgDaten;
  }

  /* Liefert {status, text} - die Entscheidung steckt hier, nicht in der Ausgabe. */
  function bewerten(eingabe, daten, radius) {
    var roh = eingabe.trim();
    if (!roh) return { status: '', text: TEXTE.leer };

    var plz = roh.match(/\b(\d{5})\b/);
    if (plz) {
      var km = daten.plz[plz[1]];
      if (typeof km !== 'number') {
        // Ausserhalb des Tabellenradius, also weit jenseits des Verlegegebiets.
        return { status: 'aussen', text: TEXTE.aussen(plz[1]) };
      }
      return km <= radius
        ? { status: 'innen', text: TEXTE.innen(plz[1], Math.round(km)) }
        : { status: 'aussen', text: TEXTE.aussen(plz[1]) };
    }

    var spanne = daten.orte[normalisieren(roh)];
    if (!spanne) return { status: 'unbekannt', text: TEXTE.unbekannt };

    var ort = roh.replace(/\s+/g, ' ');
    if (spanne[1] <= radius) return { status: 'innen', text: TEXTE.innen(ort, Math.round(spanne[0])) };
    if (spanne[0] <= radius) return { status: 'rand', text: TEXTE.rand(ort) };
    return { status: 'aussen', text: TEXTE.aussen(ort) };
  }

  function anzeigen(feld, status, text) {
    feld.setAttribute('data-status', status);
    feld.textContent = text;
  }

  /* Je Ergebnis ein anderer Weg: im Gebiet zur Anfrage, ausserhalb in den
     Shop. Bei einer unverstandenen Eingabe keiner - dort ist noch nichts
     entschieden, und ein Angebot waere geraten. */
  function wegAnzeigen(feld, formular, status) {
    var innen = status === 'innen';
    var ziel = innen ? formular.dataset.ctaUrl : formular.dataset.versandUrl;
    var text = innen ? formular.dataset.ctaText : formular.dataset.versandText;
    if ((status !== 'innen' && status !== 'aussen') || !ziel || !text) {
      feld.hidden = true;
      feld.textContent = '';
      return;
    }
    var link = document.createElement('a');
    link.href = ziel;
    link.textContent = text + ' \u2192';
    feld.textContent = '';
    feld.appendChild(link);
    feld.hidden = false;
  }

  function verdrahten(formular) {
    var sektion = formular.closest('[data-radius]');
    var eingabe = formular.querySelector('[data-tp-verlegegebiet-input]');
    var ausgabe = formular.querySelector('[data-tp-verlegegebiet-result]');
    if (!sektion || !eingabe || !ausgabe) return;

    var weg = formular.querySelector('[data-tp-verlegegebiet-cta]');
    var radius = parseFloat(sektion.dataset.radius) || 50;
    var lauf = 0;
    formular.hidden = false;

    formular.addEventListener('submit', function (ereignis) {
      ereignis.preventDefault();
      var wert = eingabe.value;
      var meine = (lauf += 1);
      if (!wert.trim()) {
        anzeigen(ausgabe, '', TEXTE.leer);
        if (weg) wegAnzeigen(weg, formular, '');
        return;
      }
      tabelleLaden(sektion).then(
        function (daten) {
          if (meine !== lauf) return;
          var ergebnis = bewerten(wert, daten, radius);
          anzeigen(ausgabe, ergebnis.status, ergebnis.text);
          if (weg) wegAnzeigen(weg, formular, ergebnis.status);
        },
        function () {
          if (meine !== lauf) return;
          anzeigen(ausgabe, 'unbekannt', TEXTE.fehler);
          if (weg) wegAnzeigen(weg, formular, 'unbekannt');
        }
      );
    });

    eingabe.addEventListener('input', function () {
      // Auch ohne sichtbares Ergebnis hochzaehlen: eine noch laufende Abfrage
      // gehoert zur alten Eingabe und darf nicht mehr anzeigen.
      lauf += 1;
      if (!ausgabe.textContent && (!weg || weg.hidden)) return;
      anzeigen(ausgabe, '', '');
      if (weg) wegAnzeigen(weg, formular, '');
    });
  }

  function start(wurzel) {
    var ziel = wurzel || document;
    ziel.querySelectorAll('[data-tp-verlegegebiet-form]').forEach(verdrahten);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      start();
    });
  } else {
    start();
  }

  // Der Theme-Editor tauscht Sektionen aus, ohne die Seite neu zu laden.
  document.addEventListener('shopify:section:load', function (ereignis) {
    start(ereignis.target);
  });
})();
