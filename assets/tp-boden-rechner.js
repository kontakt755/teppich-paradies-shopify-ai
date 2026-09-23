/*
  Teppichboden-Bedarfsrechner mit Rollenbreite (Bodenwissen, Rechner L5,
  sections/tp-boden-rechner.liquid). Zwei Teile in einer Datei:

  1. Reine Rechenfunktionen ohne DOM, angehaengt an root.TPBodenRechner -
     dieselbe Datei rechnet im Browser UND in den Tests
     (qa/tests/boden-rechner.test.mjs, per createRequire geladen). Das ist
     dasselbe Muster wie assets/tp-masstepich-rechnung.js /
     qa/tests/masstepich-rechnung.test.mjs: EINE Quelle, keine Kopie.
  2. DOM-Anbindung, nur wenn ein document existiert (Browser) - unter Node
     wuerde sie sofort auf ein fehlendes document treffen.

  Jede Rechenregel stammt aus zwei freigegebenen Ratgeber-Artikeln, nicht
  aus dieser Datei - Herkunft je Regel steht in docs/bodenwissen/RECHNER.md:
  - content/ratgeber/teppichboden/teppichboden-richtig-ausmessen.html
    (breiteste/laengste Stelle messen, 10-20 cm Zugabe auf die Laenge)
  - content/ratgeber/teppichboden/rollenbreite-und-bahnen-planen.html
    (beide Ausrichtungen vergleichen, die mit weniger Verschnitt gewinnt;
    passt keine Ausrichtung, entsteht eine Naht)

  Keine Preise. Der bestehende Produkt-Rechner
  (blocks/tp-rollware-rechner.liquid, assets/tp-masstepich-rechnung.js)
  bleibt unangetastet.
*/
(function (root) {
  'use strict';

  var MIN_CM = 10;
  var MAX_CM = 2000;

  /** Rollenlaenge wird auf volle 10 cm aufgerundet - keine krumme Bestellung. */
  function rundeAufZehn(cm) {
    return Math.ceil(cm / 10) * 10;
  }

  /** Flaechen ehrlich auf zwei Nachkommastellen runden. */
  function rundeM2(m2) {
    return Math.round(m2 * 100) / 100;
  }

  /**
   * Eine Ausrichtung pruefen: "quer" liegt gegen die Rollenbreite, "laeng"
   * bekommt die Zugabe. Passt die Rolle die Breite nicht in einem Stueck ab,
   * gibt es keine sinnvolle Bestelllaenge - nur die Zahl der Bahnen.
   */
  function ausrichtung(quer, laeng, zugabeCm, rollenbreiteCm) {
    if (quer <= rollenbreiteCm) {
      var benoetigteLaengeCm = rundeAufZehn(laeng + zugabeCm);
      return {
        passt: true,
        benoetigteLaengeCm: benoetigteLaengeCm,
        bestellflaecheM2: rundeM2((rollenbreiteCm / 100) * (benoetigteLaengeCm / 100))
      };
    }
    return { passt: false, bahnenAnzahl: Math.ceil(quer / rollenbreiteCm) };
  }

  function zeileAusPasst(rollenbreiteCm, raumflaecheM2, ergebnis, gedreht) {
    var verschnittM2 = rundeM2(ergebnis.bestellflaecheM2 - raumflaecheM2);
    var verschnittProzent = raumflaecheM2 > 0
      ? Math.round((verschnittM2 / raumflaecheM2) * 1000) / 10
      : 0;
    return {
      rollenbreiteCm: rollenbreiteCm,
      passt: true,
      gedreht: gedreht,
      benoetigteLaengeCm: ergebnis.benoetigteLaengeCm,
      bestellflaecheM2: ergebnis.bestellflaecheM2,
      verschnittM2: verschnittM2,
      verschnittProzent: verschnittProzent
    };
  }

  /**
   * Materialbedarf je verfuegbarer Rollenbreite, beide Ausrichtungen
   * geprueft (Breite/Laenge getauscht). Wirft RangeError bei ungueltigen
   * Eingaben - der Aufrufer entscheidet, wie er das anzeigt.
   *
   * @param {{breite:number, laenge:number, zugabe:number, rollenbreiten:number[]}} eingabe
   * @returns {{
   *   raumBreiteCm:number, raumLaengeCm:number, zugabeCm:number,
   *   raumflaecheM2:number,
   *   ergebnisse: Array<{
   *     rollenbreiteCm:number, passt:boolean, gedreht:boolean,
   *     benoetigteLaengeCm?:number, bestellflaecheM2?:number,
   *     verschnittM2?:number, verschnittProzent?:number, bahnenAnzahl?:number
   *   }>,
   *   empfehlungRollenbreiteCm: number|null
   * }}
   */
  function bedarf(eingabe) {
    var raumBreiteCm = Number(eingabe && eingabe.breite);
    var raumLaengeCm = Number(eingabe && eingabe.laenge);
    var zugabeCm = Number(eingabe && eingabe.zugabe);

    if (!isFinite(raumBreiteCm) || raumBreiteCm < MIN_CM || raumBreiteCm > MAX_CM) {
      throw new RangeError('Raumbreite muss zwischen ' + MIN_CM + ' und ' + MAX_CM + ' cm liegen.');
    }
    if (!isFinite(raumLaengeCm) || raumLaengeCm < MIN_CM || raumLaengeCm > MAX_CM) {
      throw new RangeError('Raumlänge muss zwischen ' + MIN_CM + ' und ' + MAX_CM + ' cm liegen.');
    }
    if (zugabeCm !== 10 && zugabeCm !== 20) {
      throw new RangeError('Zugabe muss 10 oder 20 cm sein.');
    }

    var breitenRoh = (eingabe && eingabe.rollenbreiten) || [];
    var breiten = [];
    var i;
    for (i = 0; i < breitenRoh.length; i++) {
      var w = Number(breitenRoh[i]);
      if (isFinite(w) && w > 0) breiten.push(w);
    }
    if (breiten.length === 0) {
      throw new RangeError('Mindestens eine Rollenbreite nötig.');
    }

    var raumflaecheM2 = rundeM2((raumBreiteCm / 100) * (raumLaengeCm / 100));

    var ergebnisse = [];
    for (i = 0; i < breiten.length; i++) {
      var rollenbreiteCm = breiten[i];
      var standard = ausrichtung(raumBreiteCm, raumLaengeCm, zugabeCm, rollenbreiteCm);
      var gedreht = ausrichtung(raumLaengeCm, raumBreiteCm, zugabeCm, rollenbreiteCm);

      if (standard.passt && gedreht.passt) {
        // Beide Ausrichtungen passen in eine Bahn: die mit weniger
        // Verschnitt gewinnt (kleinere Bestellflaeche - die Raumflaeche
        // ist in beiden Faellen gleich).
        if (gedreht.bestellflaecheM2 < standard.bestellflaecheM2) {
          ergebnisse.push(zeileAusPasst(rollenbreiteCm, raumflaecheM2, gedreht, true));
        } else {
          ergebnisse.push(zeileAusPasst(rollenbreiteCm, raumflaecheM2, standard, false));
        }
      } else if (standard.passt) {
        ergebnisse.push(zeileAusPasst(rollenbreiteCm, raumflaecheM2, standard, false));
      } else if (gedreht.passt) {
        ergebnisse.push(zeileAusPasst(rollenbreiteCm, raumflaecheM2, gedreht, true));
      } else {
        // Weder noch passt in eine Bahn: die Ausrichtung mit weniger Bahnen
        // gewinnt - weniger Naht, weniger Material.
        var gedrehtGewinnt = gedreht.bahnenAnzahl < standard.bahnenAnzahl;
        var gewinner = gedrehtGewinnt ? gedreht : standard;
        ergebnisse.push({
          rollenbreiteCm: rollenbreiteCm,
          passt: false,
          gedreht: gedrehtGewinnt,
          bahnenAnzahl: gewinner.bahnenAnzahl
        });
      }
    }

    var empfehlungRollenbreiteCm = null;
    var besterVerschnitt = null;
    for (i = 0; i < ergebnisse.length; i++) {
      if (!ergebnisse[i].passt) continue;
      if (besterVerschnitt === null || ergebnisse[i].verschnittM2 < besterVerschnitt) {
        besterVerschnitt = ergebnisse[i].verschnittM2;
        empfehlungRollenbreiteCm = ergebnisse[i].rollenbreiteCm;
      }
    }

    return {
      raumBreiteCm: raumBreiteCm,
      raumLaengeCm: raumLaengeCm,
      zugabeCm: zugabeCm,
      raumflaecheM2: raumflaecheM2,
      ergebnisse: ergebnisse,
      empfehlungRollenbreiteCm: empfehlungRollenbreiteCm
    };
  }

  root.TPBodenRechner = {
    MIN_CM: MIN_CM,
    MAX_CM: MAX_CM,
    rundeAufZehn: rundeAufZehn,
    rundeM2: rundeM2,
    bedarf: bedarf
  };
})(typeof window !== 'undefined' ? window : globalThis);

// DOM-Anbindung - nur im Browser. Unter Node (Tests) endet die Datei hier,
// weil kein document existiert.
if (typeof document !== 'undefined') {
  (function () {
    'use strict';

    function fmt(n, stellen) {
      var s = typeof stellen === 'number' ? stellen : 2;
      return Number(n).toLocaleString('de-DE', { minimumFractionDigits: s, maximumFractionDigits: s });
    }

    function leseConfig(root) {
      var script = root.querySelector('[data-tp-br-config]');
      if (!script) return { rollenbreiten: [] };
      try {
        return JSON.parse(script.textContent);
      } catch (e) {
        return { rollenbreiten: [] };
      }
    }

    function parseCm(feld) {
      var roh = (feld.value || '').trim().replace(',', '.');
      if (roh === '') return NaN;
      return Number(roh);
    }

    function init(root) {
      if (root.getAttribute('data-tp-br-init') === '1') return;
      root.setAttribute('data-tp-br-init', '1');

      var config = leseConfig(root);
      var breiteInput = root.querySelector('[data-breite-input]');
      var laengeInput = root.querySelector('[data-laenge-input]');
      var button = root.querySelector('[data-berechnen]');
      var fehler = root.querySelector('[data-fehler]');
      var status = root.querySelector('[data-status]');
      var liste = root.querySelector('[data-ergebnisse]');
      var vorlage = root.querySelector('[data-karte-vorlage]');
      var ctaBox = root.querySelector('[data-cta-box]');

      if (!breiteInput || !laengeInput || !button || !liste || !vorlage) return;

      function gewaehlteZugabe() {
        var checked = root.querySelector('[data-zugabe-radio]:checked');
        return checked ? Number(checked.value) : 20;
      }

      function zeigeFehler(text) {
        if (fehler) {
          fehler.hidden = false;
          fehler.textContent = text;
        }
        liste.hidden = true;
        liste.innerHTML = '';
        if (status) status.hidden = true;
        if (ctaBox) ctaBox.hidden = true;
      }

      function render(ergebnis) {
        if (fehler) fehler.hidden = true;
        liste.innerHTML = '';

        ergebnis.ergebnisse.forEach(function (zeile) {
          var knoten = vorlage.content.firstElementChild.cloneNode(true);
          var breiteEl = knoten.querySelector('[data-karte-breite]');
          if (breiteEl) breiteEl.textContent = fmt(zeile.rollenbreiteCm, 0) + ' cm';

          var badge = knoten.querySelector('[data-karte-empfehlung]');
          if (badge && zeile.passt && ergebnis.empfehlungRollenbreiteCm === zeile.rollenbreiteCm) {
            badge.hidden = false;
          }

          var statusEl = knoten.querySelector('[data-karte-status]');
          var werteEl = knoten.querySelector('[data-karte-werte]');
          var nahtEl = knoten.querySelector('[data-karte-naht]');

          if (zeile.passt) {
            if (statusEl) {
              statusEl.textContent = zeile.gedreht
                ? 'Passt in eine Bahn - gedreht verlegt (Breite und Länge getauscht).'
                : 'Passt in eine Bahn.';
            }
            if (werteEl) {
              werteEl.hidden = false;
              var laengeEl = werteEl.querySelector('[data-karte-laenge]');
              var flaecheEl = werteEl.querySelector('[data-karte-flaeche]');
              var verschnittEl = werteEl.querySelector('[data-karte-verschnitt]');
              if (laengeEl) {
                laengeEl.textContent = fmt(zeile.benoetigteLaengeCm, 0) + ' cm ('
                  + fmt(zeile.benoetigteLaengeCm / 100) + ' m)';
              }
              if (flaecheEl) flaecheEl.textContent = fmt(zeile.bestellflaecheM2) + ' m²';
              if (verschnittEl) {
                verschnittEl.textContent = fmt(zeile.verschnittM2) + ' m² ('
                  + fmt(zeile.verschnittProzent, 1) + ' %)';
              }
            }
          } else {
            if (statusEl) statusEl.textContent = 'Passt nicht in eine Bahn.';
            if (nahtEl) {
              nahtEl.hidden = false;
              var anzahlEl = nahtEl.querySelector('[data-naht-anzahl]');
              if (anzahlEl) anzahlEl.textContent = String(zeile.bahnenAnzahl);
            }
          }

          liste.appendChild(knoten);
        });

        liste.hidden = false;
        if (ctaBox) ctaBox.hidden = false;
        if (status) {
          status.hidden = false;
          status.textContent = 'Ergebnis für Raumbreite ' + fmt(ergebnis.raumBreiteCm, 0) + ' cm und Raumlänge '
            + fmt(ergebnis.raumLaengeCm, 0) + ' cm, Raumfläche ' + fmt(ergebnis.raumflaecheM2) + ' m².';
        }
      }

      function berechnen() {
        var breite = parseCm(breiteInput);
        var laenge = parseCm(laengeInput);

        if (!isFinite(breite) || !isFinite(laenge)) {
          zeigeFehler('Bitte Raumbreite und Raumlänge eingeben.');
          return;
        }

        try {
          var ergebnis = TPBodenRechner.bedarf({
            breite: breite,
            laenge: laenge,
            zugabe: gewaehlteZugabe(),
            rollenbreiten: config.rollenbreiten
          });
          render(ergebnis);
        } catch (err) {
          zeigeFehler(err && err.message ? err.message : 'Bitte Maße prüfen.');
        }
      }

      button.addEventListener('click', berechnen);
      [breiteInput, laengeInput].forEach(function (feld) {
        feld.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            berechnen();
          }
        });
      });
    }

    function alle() {
      var knoten = document.querySelectorAll('[data-tp-br]');
      for (var i = 0; i < knoten.length; i++) init(knoten[i]);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', alle);
    } else {
      alle();
    }
    // Theme-Editor: neu einbauen oder ausgewaehlten Block anzeigen loest
    // kein DOMContentLoaded mehr aus.
    document.addEventListener('shopify:section:load', alle);
    document.addEventListener('shopify:block:select', alle);
  })();
}
