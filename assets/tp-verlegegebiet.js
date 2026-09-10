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
      return was + ' liegt etwas außerhalb unseres üblichen Radius. Fragen Sie uns trotzdem an – abhängig vom Auftragsumfang fahren wir auch weiter.';
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

  function verdrahten(formular) {
    var sektion = formular.closest('[data-radius]');
    var eingabe = formular.querySelector('[data-tp-verlegegebiet-input]');
    var ausgabe = formular.querySelector('[data-tp-verlegegebiet-result]');
    if (!sektion || !eingabe || !ausgabe) return;

    var radius = parseFloat(sektion.dataset.radius) || 50;
    formular.hidden = false;

    formular.addEventListener('submit', function (ereignis) {
      ereignis.preventDefault();
      var wert = eingabe.value;
      if (!wert.trim()) {
        anzeigen(ausgabe, '', TEXTE.leer);
        return;
      }
      tabelleLaden(sektion).then(
        function (daten) {
          var ergebnis = bewerten(wert, daten, radius);
          anzeigen(ausgabe, ergebnis.status, ergebnis.text);
        },
        function () {
          anzeigen(ausgabe, 'unbekannt', TEXTE.fehler);
        }
      );
    });

    eingabe.addEventListener('input', function () {
      if (ausgabe.textContent) anzeigen(ausgabe, '', '');
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
