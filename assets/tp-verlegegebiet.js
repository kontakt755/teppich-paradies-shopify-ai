/*
 * Ortspruefung fuer die Sektion "TP Verlegegebiet".
 *
 * Prueft offline gegen assets/tp-verlegegebiet-orte.json - kein Geocoding-
 * Dienst, kein API-Schluessel, keine Kosten, kein Request an Dritte. Die
 * Tabelle wird erst beim ersten Absenden geladen, damit die Sektion beim
 * Seitenaufbau nichts kostet.
 *
 * Die Entfernungen sind Luftlinien. Fuer Postleitzahlen wie fuer Ortsnamen
 * steht eine Spanne in der Tabelle: Berlin reicht von 11 bis 47 km, und eine
 * Postleitzahl kann mehrere Doerfer umfassen. Liegt die Spanne auf beiden
 * Seiten der Grenze, sagt die Pruefung das auch so.
 *
 * Ortsnamen sind mehrdeutig - es gibt vier Werder und drei Bernau. Die Tabelle
 * kennzeichnet Namen, zu denen mehrere Orte gehoeren; liegen die auf
 * verschiedenen Seiten der Grenze, fragt die Pruefung nach der Postleitzahl,
 * statt dem nahen Ort stumm den Vorzug zu geben.
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

  // Steht die Sektion zweimal auf einer Seite, wird auch das Skript zweimal
  // eingebunden. Die Horcher am Dokument gehoeren nur einmal hin.
  if (window.tpVerlegegebietGeladen) return;
  window.tpVerlegegebietGeladen = true;

  var TEXTE = {
    innen: function (was, entfernung) {
      return was + ' liegt in unserem üblichen Verlegegebiet – ' + entfernung + ' von Oranienburg entfernt.';
    },
    rand: function (was) {
      return was + ' reicht über die Grenze unseres üblichen Gebiets hinaus. Geben Sie am besten Ihre Postleitzahl ein – oder fragen Sie uns direkt.';
    },
    randPlz: function (code) {
      return code + ' liegt am Rand unseres Verlegegebiets. Fragen Sie uns einfach an – wir sagen Ihnen, ob wir zu Ihnen kommen.';
    },
    mehrdeutig: function (was) {
      return 'Den Ortsnamen „' + was + '“ gibt es mehrfach. Bitte geben Sie Ihre Postleitzahl ein, dann können wir es genau sagen.';
    },
    plzUnbekannt: function (code) {
      return 'Die Postleitzahl ' + code + ' kennen wir nicht. Bitte prüfen Sie die Eingabe.';
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
      sektion._tpVgDaten = fetch(sektion.dataset.orte, { credentials: 'omit' })
        .then(function (antwort) {
          if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
          return antwort.json();
        })
        .catch(function (fehler) {
          // Ein Fehlschlag darf nicht haengen bleiben - sonst meldet jede
          // weitere Pruefung "gerade nicht moeglich", bis jemand neu laedt.
          sektion._tpVgDaten = null;
          throw fehler;
        });
    }
    return sektion._tpVgDaten;
  }

  function entfernung(spanne) {
    var von = Math.round(spanne[0]);
    var bis = Math.round(spanne[1]);
    if (bis - von > 5) return 'je nach Lage ' + von + ' bis ' + bis + ' km';
    return 'rund ' + Math.round((spanne[0] + spanne[1]) / 2) + ' km';
  }

  function gueltigePlz(code, daten) {
    var praefixe = daten.praefixe;
    if (!praefixe) return true;
    if (!daten._praefixe) {
      daten._praefixe = {};
      for (var i = 0; i < praefixe.length; i += 3) daten._praefixe[praefixe.substr(i, 3)] = true;
    }
    return daten._praefixe[code.slice(0, 3)] === true;
  }

  /* Eine Spanne [naechster, entferntester] gegen den Radius. Eine angehaengte 1
     heisst: mehrere Orte dieses Namens. */
  function einordnen(was, spanne, radius, istPlz) {
    if (spanne[1] <= radius) return { status: 'innen', text: TEXTE.innen(was, entfernung(spanne)) };
    if (spanne[0] > radius) return { status: 'aussen', text: TEXTE.aussen(was) };
    if (spanne[2] === 1) return { status: 'mehrdeutig', text: TEXTE.mehrdeutig(was) };
    return { status: 'rand', text: istPlz ? TEXTE.randPlz(was) : TEXTE.rand(was) };
  }

  /* Liefert {status, text} - die Entscheidung steckt hier, nicht in der Ausgabe. */
  function bewerten(eingabe, daten, radius) {
    var roh = eingabe.trim();
    if (!roh) return { status: '', text: TEXTE.leer };

    var plz = roh.match(/\b(\d{5})\b/);
    if (plz) {
      var code = plz[1];
      var spanne = daten.plz[code];
      if (typeof spanne === 'number') spanne = [spanne, spanne];
      if (spanne) return einordnen(code, spanne, radius, true);
      // Nicht in der Tabelle: entweder weit weg oder gar keine Postleitzahl.
      return gueltigePlz(code, daten)
        ? { status: 'aussen', text: TEXTE.aussen(code) }
        : { status: 'unbekannt', text: TEXTE.plzUnbekannt(code) };
    }

    var eintrag = daten.orte[normalisieren(roh)];
    if (!eintrag) return { status: 'unbekannt', text: TEXTE.unbekannt };
    return einordnen(roh.replace(/\s+/g, ' '), eintrag, radius, false);
  }

  function anzeigen(feld, status, text) {
    feld.setAttribute('data-status', status);
    feld.textContent = text;
  }

  /* Je Ergebnis ein anderer Weg: im Gebiet und am Rand zur Anfrage - am Rand
     sagt der Text ohnehin "fragen Sie uns" -, ausserhalb in den Shop. Bei
     einem mehrdeutigen oder unverstandenen Namen keiner: dort ist noch nichts
     entschieden, und ein Angebot waere geraten. */
  function wegAnzeigen(feld, formular, status) {
    var anfragen = status === 'innen' || status === 'rand';
    var ziel = anfragen ? formular.dataset.ctaUrl : formular.dataset.versandUrl;
    var text = anfragen ? formular.dataset.ctaText : formular.dataset.versandText;
    if ((!anfragen && status !== 'aussen') || !ziel || !text) {
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
    // Der Theme-Editor meldet eine Sektion auch mehrfach neu an.
    if (formular.dataset.tpVgBereit) return;
    formular.dataset.tpVgBereit = '1';
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
