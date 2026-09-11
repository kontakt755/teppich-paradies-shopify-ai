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
 * wohnt, sieht den Weg zur Anfrage. Wer ausserhalb wohnt, bekommt weder eine
 * Absage noch eine Zusage: zuerst den Weg zur Anfrage - wir pruefen den
 * Einzelfall -, dann den in den Shop, denn der Versand endet nicht an der
 * Grenze des Verlegegebiets.
 *
 * Auf Teppichboden-Seiten gibt die Sektion zusaetzlich die Stufen des
 * Rollenware-Service mit (data-basis, data-schwelle aus den
 * Theme-Einstellungen). Dann nennt ein Treffer im Gebiet, welche Stufe dort
 * gilt: bis zum Basisradius bei jedem Warenwert, dahinter ab der Schwelle.
 * Auf Vinyl- und Treppenseiten fehlen die Attribute - dort gilt der
 * Rollenware-Service nicht, und es wird nichts davon versprochen.
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
      return was + ' liegt außerhalb unseres regulären Liefer- und Verlegegebiets. Sprechen Sie uns gern an – wir prüfen individuell, was möglich ist. Ihren Boden liefern wir auch per Versand, deutschlandweit.';
    },
    stufeBasis: 'Lieferung und lose Verlegung Ihrer Rollenware sind hier bei jedem Warenwert inklusive.',
    stufePlus: function (schwelle) {
      return 'Lieferung und lose Verlegung Ihrer Rollenware sind hier ab ' + schwelle + ' € Warenwert inklusive – bei kleineren Aufträgen fragen Sie uns gern an.';
    },
    stufeOffen: function (schwelle) {
      return 'Ob Lieferung und lose Verlegung schon unter ' + schwelle + ' € Warenwert inklusive sind, hängt vom Ortsteil ab – mit Ihrer Postleitzahl sagen wir es genau.';
    },
    anfragen: 'Individuell anfragen',
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

  /* Die Stufe des Rollenware-Service fuer einen Abstand, als angehaengter
     Satz. nah/fern ist bei einer PLZ derselbe Wert, bei einem Ortsnamen die
     Spanne seiner Postleitzahlen. Reicht ein Ort ueber den Basisradius, wird
     keine Stufe zugesagt, sondern nach der PLZ gefragt. */
  function stufe(nah, fern, stufen) {
    if (!stufen) return '';
    if (fern <= stufen.basis) return ' ' + TEXTE.stufeBasis;
    if (nah > stufen.basis) return ' ' + TEXTE.stufePlus(stufen.schwelle);
    return ' ' + TEXTE.stufeOffen(stufen.schwelle);
  }

  /* Liefert {status, text} - die Entscheidung steckt hier, nicht in der Ausgabe. */
  function bewerten(eingabe, daten, radius, stufen) {
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
        ? { status: 'innen', text: TEXTE.innen(plz[1], Math.round(km)) + stufe(km, km, stufen) }
        : { status: 'aussen', text: TEXTE.aussen(plz[1]) };
    }

    var spanne = daten.orte[normalisieren(roh)];
    if (!spanne) return { status: 'unbekannt', text: TEXTE.unbekannt };

    var ort = roh.replace(/\s+/g, ' ');
    if (spanne[1] <= radius) {
      return { status: 'innen', text: TEXTE.innen(ort, Math.round(spanne[0])) + stufe(spanne[0], spanne[1], stufen) };
    }
    if (spanne[0] <= radius) return { status: 'rand', text: TEXTE.rand(ort) };
    return { status: 'aussen', text: TEXTE.aussen(ort) };
  }

  function anzeigen(feld, status, text) {
    feld.setAttribute('data-status', status);
    feld.textContent = text;
  }

  /* Je Ergebnis ein anderer Weg. Im Gebiet: zur Anfrage. Ausserhalb: erst
     die Anfrage - wir pruefen den Einzelfall -, dann der Shop. Bei einer
     unverstandenen Eingabe keiner: dort ist noch nichts entschieden, und ein
     Angebot waere geraten. */
  function wegAnzeigen(feld, formular, status) {
    var d = formular.dataset;
    var wege = [];
    if (status === 'innen' && d.ctaUrl && d.ctaText) wege.push([d.ctaUrl, d.ctaText]);
    if (status === 'aussen') {
      if (d.ctaUrl) wege.push([d.ctaUrl, TEXTE.anfragen]);
      if (d.versandUrl && d.versandText) wege.push([d.versandUrl, d.versandText]);
    }
    feld.textContent = '';
    feld.hidden = wege.length === 0;
    wege.forEach(function (weg) {
      var link = document.createElement('a');
      link.href = weg[0];
      link.textContent = weg[1] + ' →';
      feld.appendChild(link);
    });
  }

  function verdrahten(formular) {
    var sektion = formular.closest('[data-radius]');
    var eingabe = formular.querySelector('[data-tp-verlegegebiet-input]');
    var ausgabe = formular.querySelector('[data-tp-verlegegebiet-result]');
    if (!sektion || !eingabe || !ausgabe) return;

    var weg = formular.querySelector('[data-tp-verlegegebiet-cta]');
    var radius = parseFloat(sektion.dataset.radius) || 50;
    var basis = parseFloat(sektion.dataset.basis);
    var stufen = isFinite(basis) ? { basis: basis, schwelle: sektion.dataset.schwelle || '' } : null;
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
          var ergebnis = bewerten(wert, daten, radius, stufen);
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
