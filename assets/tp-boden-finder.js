/*
  Boden-Finder (sections/tp-boden-finder.liquid): gefuehrte Beratung in
  hoechstens vier Fragen bis zu drei Vorschlaegen.

  Wird erst geladen, wenn jemand den Einstieg anklickt (Lader in der Section),
  zusammen mit assets/tp-rollware-art.js und assets/tp-boden-finder.css.

  Daten: Die Kollektion der Bodenart liefert ueber zwei Ansichten ohne Layout
  (sections/tp-boden-finder-daten.liquid) Filterwerte mit Trefferzahl und
  die ersten Treffer mit Variantenpreisen und fertiger Produktkarte. Shopify
  filtert und sortiert; hier wird nur ausgewaehlt und angezeigt.

  Preise: Der Variantenpreis von Teppichboden ist der Preis je m² (bei
  custom.preis_pro_001_qm je 0,01 m²). Fuer "Budget fuer meinen Raum" rechnet
  raumAngebot() den guenstigsten Weg mit den Regeln des Rollenware-Rechners
  (TPRollwareArt): Breitenoption, Rollenbreiten, Raummass nur ueber eine
  erlaubte Wunschmass-Variante und nur bis Rolle minus Zugabe, Mindestlaenge,
  Abrechnung auf volle m². Das Ergebnis ist ausdruecklich ein ca.-Preis -
  abgerechnet wird wie immer im Warenkorb.

  Paketware (Klick-, Klebevinyl; Bodenart mit Budget "rechnen"): Der
  Variantenpreis ist der Paketpreis, ein Preisfilter je m² ginge also an
  Shopify vorbei. Die Ansicht ?view=boden-finder-preise liefert je Produkt den
  Preis je m² wie auf der Karte (Paketpreis / custom.qm_pro_paket); das Budget
  filtert imBudget() hier im Browser. Den Raumpreis rechnet paketAngebot() wie
  der Paketrechner (blocks/paket-auswahl.liquid): 5 % Verschnitt, auf volle
  Pakete aufgerundet. Rollenware derselben Kollektion (Vinyl von der Rolle)
  laeuft weiter ueber raumAngebot().

  Reine Funktionen stehen oben und laufen ohne DOM in den Tests
  (qa/tests/boden-finder.test.mjs).
*/
(function (root) {
  'use strict';

  var ART = root.TPRollwareArt;
  var FARBFILTER = 'filter.v.t.shopify.color-pattern';
  var PREISFILTER = 'filter.v.price.lte';
  var EPS = 1e-9;
  // Vorausgewaehlter Verschnitt des Paketrechners (WASTE_FACTOR in
  // blocks/paket-auswahl.liquid). Der Test vergleicht beide Werte.
  var PAKET_VERSCHNITT = 1.05;
  var STUFEN = [20, 30, 45, 70];

  // ---------------------------------------------------------------------
  // Reine Funktionen
  // ---------------------------------------------------------------------

  // Raummass in Metern ("4", "4,5", "4.50 m") oder mit Einheit ("450 cm") ->
  // ganze cm. null, wenn unklar oder ueber 50 m (dann war die Einheit falsch).
  function raumMass(text) {
    var r = ART.parseMass(text, 'm');
    if (r.fehler || !(r.cm > 0) || r.cm > 5000) return null;
    return r.cm;
  }

  // Geldbetrag: "500", "500,50", "1.200", "1.200,50 €". null, wenn unklar.
  function betrag(text) {
    var t = String(text == null ? '' : text).replace(/ /g, '').replace(/\s|€|euro?/gi, '');
    if (!t) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '');
    t = t.replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    var n = parseFloat(t);
    return n > 0 ? n : null;
  }

  // Budget je m² aus Gesamtbetrag und Raumflaeche, auf Cent abgerundet.
  function proQm(gesamt, aCm, bCm) {
    if (!(gesamt > 0) || !(aCm > 0) || !(bCm > 0)) return null;
    return Math.floor((gesamt / ((aCm * bCm) / 10000)) * 100 + EPS) / 100;
  }

  // Guenstigster Weg, einen Raum aCm x bCm aus diesem Produkt zu decken.
  // Beide Lagen werden probiert (Raumbreite quer zur Rolle oder die Laenge).
  // Ergebnis: { art: 'meterware'|'raummass', rolle, quer, laenge, qm, betrag,
  // naht, bahnen } oder null, wenn das Produkt keine Rollenbreiten hat.
  function raumAngebot(produkt, aCm, bCm) {
    if (!produkt || !(aCm > 0) || !(bCm > 0)) return null;
    var vars = (produkt.variants || []).filter(function (v) { return v && v.available === true; });
    var wIdx = ART.findWidthOption(produkt.options);
    if (wIdx < 0) return null;
    var cmExact = produkt.cm_exact === true;
    // Variantenpreis kommt in Cent; bei cm-genauer Abrechnung je 0,01 m².
    function qmPreis(v) {
      var euro = Number(v.price) / 100;
      return cmExact ? euro * 100 : euro;
    }
    function abgerechnet(qm) {
      return cmExact ? Math.round(qm * 100 + EPS) / 100 : Math.ceil(qm - EPS);
    }
    var breiten = ART.numericWidths(vars, wIdx);
    function rate(rolle) {
      var best = 0;
      vars.forEach(function (v) {
        if (Math.abs(ART.toCm(v.options[wIdx]) - rolle) > EPS) return;
        var r = qmPreis(v);
        if (r > 0 && (!best || r < best)) best = r;
      });
      return best;
    }
    var wunsch = 0;
    vars.forEach(function (v) {
      if (!ART.wunschOk(v, wIdx)) return;
      var r = qmPreis(v);
      if (r > 0 && (!wunsch || r < wunsch)) wunsch = r;
    });
    var lagen = [[aCm, bCm], [bCm, aCm]];
    var kandidaten = [];
    lagen.forEach(function (lage) {
      var quer = lage[0];
      var laenge = ART.mitMindestlaenge(lage[1], produkt.min_cm).cm;
      breiten.forEach(function (rolle) {
        if (rolle + EPS < quer) return;
        var r = rate(rolle);
        if (!(r > 0)) return;
        var qm = abgerechnet((rolle * laenge) / 10000);
        kandidaten.push({ art: 'meterware', rolle: rolle, quer: quer, laenge: laenge, qm: qm, betrag: qm * r, naht: false, bahnen: 1 });
      });
      if (wunsch > 0 && quer <= ART.maxRaumBreite(breiten) + EPS) {
        var qmRaum = abgerechnet((quer * laenge) / 10000);
        kandidaten.push({ art: 'raummass', rolle: ART.rolleFuer(quer, breiten), quer: quer, laenge: laenge, qm: qmRaum, betrag: qmRaum * wunsch, naht: false, bahnen: 1 });
      }
    });
    // Breiter als jede Rolle: Bahnen nebeneinander, mit Naht - grobe Naeherung.
    if (!kandidaten.length && breiten.length) {
      var rmax = breiten[breiten.length - 1];
      var rm = rate(rmax);
      if (rm > 0) {
        lagen.forEach(function (lage) {
          var bahnen = Math.ceil(lage[0] / rmax - EPS);
          var laenge = ART.mitMindestlaenge(lage[1], produkt.min_cm).cm;
          var qm = bahnen * abgerechnet((rmax * laenge) / 10000);
          kandidaten.push({ art: 'meterware', rolle: rmax, quer: lage[0], laenge: laenge, qm: qm, betrag: qm * rm, naht: true, bahnen: bahnen });
        });
      }
    }
    kandidaten.sort(function (x, y) { return x.betrag - y.betrag || x.qm - y.qm; });
    return kandidaten[0] || null;
  }

  // Paketware: Raum aCm x bCm mit dem Verschnitt des Paketrechners auf volle
  // Pakete aufgerundet - dieselbe Formel wie computePackagesFor() in
  // blocks/paket-auswahl.liquid. paketpreis in Euro.
  function paketRechnung(qmPaket, paketpreis, aCm, bCm) {
    if (!(qmPaket > 0) || !(paketpreis > 0) || !(aCm > 0) || !(bCm > 0)) return null;
    var flaeche = (aCm * bCm) / 10000;
    var pakete = Math.max(1, Math.ceil((flaeche * PAKET_VERSCHNITT) / qmPaket - EPS));
    return {
      art: 'paket', pakete: pakete, qmPaket: qmPaket, qm: pakete * qmPaket, flaeche: flaeche,
      betrag: Math.round(pakete * paketpreis * 100) / 100
    };
  }

  // Paketangebot aus den Varianten der Treffer-Ansicht (guenstigstes
  // verfuegbares Paket). null, wenn das Produkt keine Paketware ist.
  function paketAngebot(produkt, aCm, bCm) {
    var qmPaket = Number(produkt && produkt.qm_paket);
    if (!(qmPaket > 0)) return null;
    var preis = 0;
    (produkt.variants || []).forEach(function (v) {
      if (!v || v.available !== true) return;
      var p = Number(v.price) / 100;
      if (p > 0 && (!preis || p < preis)) preis = p;
    });
    return paketRechnung(qmPaket, preis, aCm, bCm);
  }

  // Raumpreis fuer jede Warenart: Paketware in ganzen Paketen, sonst Rolle.
  function angebot(produkt, aCm, bCm) {
    return Number(produkt && produkt.qm_paket) > 0 ? paketAngebot(produkt, aCm, bCm) : raumAngebot(produkt, aCm, bCm);
  }

  // Guenstigster Preis je m²: Meterware (Rollenbreiten, ohne Wunschmass) oder
  // Paketpreis / m² je Paket, auf Cent gerundet wie die Produktkarte.
  function abPreisQm(produkt) {
    var qmPaket = Number(produkt && produkt.qm_paket);
    var wIdx = qmPaket > 0 ? -1 : ART.findWidthOption(produkt && produkt.options);
    var best = 0;
    ((produkt && produkt.variants) || []).forEach(function (v) {
      if (!v || v.available !== true) return;
      if (wIdx >= 0 && !ART.isBreite(v.options[wIdx])) return;
      var r = qmPaket > 0
        ? Math.round(Number(v.price) / qmPaket) / 100
        : (Number(v.price) / 100) * (produkt.cm_exact === true ? 100 : 1);
      if (r > 0 && (!best || r < best)) best = r;
    });
    return best || null;
  }

  // Ansicht boden-finder-preise: [Handle, Cent je m², m² je Paket, Cent,
  // Auslauf] je Produkt -> Eintraege; pos = Stelle in der Kollektion.
  function preisEintraege(roh) {
    return (roh || []).filter(Array.isArray).map(function (e, i) {
      return {
        handle: e[0],
        qm: Number(e[1]) > 0 ? Number(e[1]) / 100 : null,
        paket: Number(e[2]) > 0 ? Number(e[2]) : 0,
        preis: Number(e[3]) > 0 ? Number(e[3]) / 100 : null,
        auslauf: e[4] === 1,
        pos: i
      };
    });
  }

  // Was ins Budget passt: Preis je m² hoechstens qmBudget; bei Paketware mit
  // Raum und Gesamtbudget zaehlen die ganzen Pakete. Rollenware pruefen erst
  // die Varianten der Treffer-Ansicht (raumAngebot).
  function imBudget(liste, qmBudget, raum, gesamt) {
    return (liste || []).filter(function (e) {
      if (!(e.qm > 0) || e.qm > qmBudget + 0.005) return false;
      if (raum && gesamt > 0 && e.paket > 0) {
        var a = paketRechnung(e.paket, e.preis, raum.laenge, raum.breite);
        return !!a && a.betrag <= gesamt + 0.005;
      }
      return true;
    });
  }

  // Regulaere Ware vor Auslaufkollektionen, sonst Shop-Reihenfolge.
  function regulaerZuerst(liste, istAuslauf) {
    return liste.filter(function (x) { return !istAuslauf(x); })
      .concat(liste.filter(function (x) { return istAuslauf(x); }));
  }

  // Seite der Treffer-Ansicht (ab 1), auf der das Produkt an Stelle pos steht.
  function kartenSeite(pos, proSeite) {
    return Math.floor(pos / proSeite) + 1;
  }

  // "25, 35, 45, 60" -> [25, 35, 45, 60]; ohne Angabe die Teppichboden-Stufen.
  function budgetStufen(text) {
    var werte = String(text || '').split(/[,;\s]+/).map(function (w) { return betrag(w); })
      .filter(function (w, i, alle) { return w && alle.indexOf(w) === i; });
    return werte.length ? werte.slice(0, 6) : STUFEN.slice();
  }

  // "Bis 5 mm = Kurzflor | flach und ruhig" je Zeile -> Namen je Filterwert.
  // stufe = Zeilennummer (1 = niedrigste Optik), fuer das Bildchen. Ein
  // drittes Feld waehlt statt der Florhoehe ein Dekorbild (holz, stein,
  // fliese, punkte): "Holzdekore = Holzoptik | Dielen | holz".
  function optikNamen(text) {
    var namen = {};
    String(text || '').split(/\r?\n/).forEach(function (zeile, i) {
      var teile = zeile.split('=');
      if (teile.length < 2) return;
      var schluessel = teile[0].trim().toLowerCase();
      var rest = teile.slice(1).join('=').split('|');
      if (!schluessel) return;
      namen[schluessel] = {
        name: (rest[0] || '').trim(),
        text: (rest[1] || '').trim(),
        stufe: i + 1,
        bild: (rest[2] || '').trim().toLowerCase()
      };
    });
    return namen;
  }

  // Filterwerte in der Reihenfolge der Optik-Namen (Shopify liefert sie
  // alphabetisch); Werte ohne Namen dahinter in Shopify-Reihenfolge.
  function optikReihenfolge(werte, namen) {
    var rang = function (w) {
      var n = namen[String(w.label || '').trim().toLowerCase()];
      return n ? n.stufe : 1000;
    };
    return werte.map(function (w, i) { return { w: w, i: i }; })
      .sort(function (x, y) { return rang(x.w) - rang(y.w) || x.i - y.i; })
      .map(function (x) { return x.w; });
  }

  // Adresse einer gefilterten Kollektion. auswahl: { farbe, optikFilter,
  // optik, raumFilter, zimmer[] }; extra: { view, preisBis, sort }.
  function filterUrl(basis, auswahl, extra) {
    var p = new URLSearchParams();
    var a = auswahl || {};
    var x = extra || {};
    if (x.view) p.set('view', x.view);
    if (a.farbe) p.append(FARBFILTER, a.farbe);
    if (a.optikFilter && a.optik) p.append(a.optikFilter, a.optik);
    if (a.raumFilter) (a.zimmer || []).forEach(function (z) { p.append(a.raumFilter, z); });
    if (x.preisBis > 0) p.set(PREISFILTER, (Math.floor(x.preisBis * 100 + EPS) / 100).toFixed(2));
    if (x.sort) p.set('sort_by', x.sort);
    if (x.seite > 1) p.set('page', String(x.seite));
    var q = p.toString();
    return basis + (q ? '?' + q : '');
  }

  function zahl(n, stellen) {
    return Number(n).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  }
  function meter(cm) {
    return zahl(cm / 100, 2);
  }
  // Ganze Euro fuer ca.-Betraege, Cent nur unter 100 EUR mit Nachkommastellen.
  function euro(n) {
    if (n >= 100) return zahl(Math.round(n), 0) + ' €';
    return zahl(n, Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2) + ' €';
  }
  // Flaeche mit zwei, bei Bedarf drei Nachkommastellen wie im Paketrechner.
  function qmZahl(n) {
    return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  }

  // Wie der Raum gedeckt wird, als eine Zeile unter dem Raumpreis.
  function angebotText(a) {
    if (a.art === 'paket') {
      return a.pakete + (a.pakete === 1 ? ' Paket' : ' Pakete') + ' à ' + qmZahl(a.qmPaket) + ' m² = ' + qmZahl(a.qm) +
        ' m² (inkl. ' + zahl((PAKET_VERSCHNITT - 1) * 100, 0) + ' % Verschnitt)';
    }
    if (a.naht) return a.bahnen + ' Bahnen à ' + a.rolle + ' cm, mit Naht – bitte beraten lassen';
    if (a.art === 'raummass') return 'Raummaß ' + meter(a.quer) + ' × ' + meter(a.laenge) + ' m = ' + zahl(a.qm, a.qm % 1 ? 2 : 0) + ' m²';
    return 'Rolle ' + a.rolle + ' cm × ' + meter(a.laenge) + ' m = ' + zahl(a.qm, a.qm % 1 ? 2 : 0) + ' m²';
  }

  var logik = {
    raumMass: raumMass,
    betrag: betrag,
    proQm: proQm,
    raumAngebot: raumAngebot,
    paketRechnung: paketRechnung,
    paketAngebot: paketAngebot,
    angebot: angebot,
    angebotText: angebotText,
    abPreisQm: abPreisQm,
    preisEintraege: preisEintraege,
    imBudget: imBudget,
    regulaerZuerst: regulaerZuerst,
    kartenSeite: kartenSeite,
    budgetStufen: budgetStufen,
    optikNamen: optikNamen,
    optikReihenfolge: optikReihenfolge,
    filterUrl: filterUrl,
    euro: euro,
    meter: meter,
    PAKET_VERSCHNITT: PAKET_VERSCHNITT
  };

  if (typeof document === 'undefined') {
    root.TPBodenFinder = { logik: logik };
    return;
  }

  // ---------------------------------------------------------------------
  // Oberflaeche
  // ---------------------------------------------------------------------

  var cache = {};
  function holen(url) {
    if (!cache[url]) {
      cache[url] = fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
        .then(function (antwort) {
          if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
          return antwort.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var skript = doc.querySelector('script[data-bf-daten]');
          if (!skript) throw new Error('keine Finder-Daten');
          var daten = JSON.parse(skript.textContent);
          daten.produkte = (daten.produkte || []).filter(Boolean).map(function (p) {
            p.variants = (p.variants || []).filter(Boolean);
            return p;
          });
          daten.karten = {};
          doc.querySelectorAll('[data-bf-karten] > [data-handle]').forEach(function (el) {
            daten.karten[el.getAttribute('data-handle')] = el;
          });
          return daten;
        });
      cache[url].catch(function () { delete cache[url]; });
    }
    return cache[url];
  }

  function melden(name, daten) {
    var eintrag = { page: window.location.pathname };
    Object.keys(daten || {}).forEach(function (k) { eintrag[k] = daten[k]; });
    try {
      if (window.Shopify && window.Shopify.analytics && typeof window.Shopify.analytics.publish === 'function') {
        window.Shopify.analytics.publish(name, eintrag);
      }
    } catch (e) {}
    try {
      window.dataLayer = window.dataLayer || [];
      var dl = { event: name };
      Object.keys(eintrag).forEach(function (k) { dl[k] = eintrag[k]; });
      window.dataLayer.push(dl);
    } catch (e) {}
  }

  function el(tag, klasse, text) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  // Bildchen fuer die Optik: Fasern in drei Hoehen.
  function optikBild(stufe) {
    var hoehe = [7, 15, 25][Math.min(Math.max(stufe || 2, 1), 3) - 1];
    var linien = '';
    for (var i = 0; i < 9; i++) {
      var x = 8 + i * 6;
      var neigung = stufe >= 3 ? (i % 2 ? 2 : -2) : 0;
      linien += '<path d="M' + x + ' 34 L' + (x + neigung) + ' ' + (34 - hoehe) + '"/>';
    }
    return '<svg viewBox="0 0 66 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">' + linien + '<rect x="3" y="34" width="60" height="4" rx="1.5" fill="currentColor" stroke="none"/></svg>';
  }

  // Bildchen fuer Dekore (Vinyl): Dielen, grosse Platten, Fliesen, Sprenkel.
  var DEKORE = {
    holz: '<path d="M3 14.7h60M3 25.3h60M25 4v10.7M47 14.7v10.6M15 25.3V36M41 25.3V36"/>' +
      '<path d="M8 9.5c5-1.4 9 1 14-.2M30 9.2c6 1.3 10-1 15 .4M51 9.6c3-.8 6 .5 9 0M8 20.2c7 1.2 12-1 20 .3M33 20c5-1 9 .9 11 0M52 20.3c3 .8 6-.4 8 0M20 30.8c6-1.2 11 .9 18-.2M46 30.6c5 1 9-.6 14 .2" stroke-width="1.2" opacity=".55"/>',
    stein: '<path d="M33 4v16M3 20h60M18 20v16M48 20v16"/>' +
      '<path d="M9 9c5 2 9-1 14 2M39 13c6-2 11 1 18-1M25 28c4 1.5 8-.5 12 1" stroke-width="1.2" opacity=".55"/>',
    fliese: '<path d="M18 4v32M33 4v32M48 4v32M3 14.7h60M3 25.3h60"/>' +
      '<path d="M3 4h15v10.7H3zM33 4h15v10.7H33zM18 14.7h15v10.6H18zM48 14.7h15v10.6H48zM3 25.3h15V36H3zM33 25.3h15V36H33z" fill="currentColor" stroke="none" opacity=".3"/>',
    punkte: '<g fill="currentColor" stroke="none">' +
      [[9, 10], [17, 22], [24, 8], [30, 29], [38, 15], [45, 25], [52, 9], [57, 30], [12, 30], [27, 18], [48, 33], [58, 18], [36, 6], [20, 13]].map(function (q, i) {
        return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (i % 3 ? 1.3 : 2) + '"/>';
      }).join('') + '</g>'
  };
  function dekorBild(name) {
    if (!DEKORE[name]) return '';
    return '<svg viewBox="0 0 66 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="4" width="60" height="32" rx="2"/>' + DEKORE[name] + '</svg>';
  }

  function Finder(wurzel) {
    this.wurzel = wurzel;
    this.dlg = wurzel.querySelector('[data-bf-dialog]');
    var cfg = {};
    try { cfg = JSON.parse(wurzel.querySelector('script[data-bf-config]').textContent); } catch (e) {}
    this.cfg = cfg;
    this.arten = (cfg.arten || []).filter(Boolean);
    this.s = { art: null, farbe: null, optik: null, zimmer: [], modus: 'raum', qm: '', laenge: '', breite: '', gesamt: '', ohneBudget: false, herkunft: 'bequem' };
    this.verlauf = [];
    this.aktuell = null;
    this.zaehlNr = 0;
    if (cfg.vorwahl) this.s.art = this.artFuer(cfg.vorwahl);
    this.verbinden();
  }

  Finder.prototype.q = function (sel) { return this.dlg.querySelector(sel); };
  Finder.prototype.qa = function (sel) { return Array.prototype.slice.call(this.dlg.querySelectorAll(sel)); };

  Finder.prototype.artFuer = function (handle) {
    for (var i = 0; i < this.arten.length; i++) if (this.arten[i].handle === handle) return this.arten[i];
    return null;
  };

  Finder.prototype.schritte = function () {
    var liste = this.cfg.vorwahl ? [] : ['art'];
    return liste.concat(['farbe', 'optik', 'budget']);
  };

  Finder.prototype.auswahl = function () {
    var a = this.s.art || {};
    return {
      farbe: this.s.farbe && this.s.farbe.value,
      optikFilter: a.optik_filter,
      optik: this.s.optik && this.s.optik.value,
      raumFilter: a.raum_filter,
      zimmer: this.s.zimmer.map(function (z) { return z.value; })
    };
  };

  // Budget je m² fuer Filter und Anzeige, null = ohne Budget.
  Finder.prototype.budgetQm = function () {
    if (this.s.ohneBudget) return null;
    if (this.s.modus === 'qm') return betrag(this.s.qm);
    return proQm(betrag(this.s.gesamt), raumMass(this.s.laenge), raumMass(this.s.breite));
  };

  // Bodenart, deren Budget je m² der Finder selbst rechnet (Paketware).
  Finder.prototype.rechnet = function () {
    return !!(this.s.art && this.s.art.preis === 'rechnen');
  };

  // Budget fuer den ganzen Raum in Euro, null ohne.
  Finder.prototype.gesamtBudget = function () {
    return this.s.modus === 'raum' && !this.s.ohneBudget ? betrag(this.s.gesamt) : null;
  };

  // Preise je m² aller Produkte der Auswahl (Ansicht boden-finder-preise):
  // erst Seite 1, dann die uebrigen Seiten gleichzeitig.
  Finder.prototype.preisListe = function () {
    var a = this.s.art;
    var auswahl = this.auswahl();
    var url = function (seite) { return filterUrl(a.url, auswahl, { view: 'boden-finder-preise', seite: seite }); };
    return holen(url(1)).then(function (erste) {
      var proSeite = erste.pro_seite || 250;
      var seiten = Math.min(Math.ceil((erste.anzahl || 0) / proSeite), 20);
      var weitere = [];
      for (var s = 2; s <= seiten; s++) weitere.push(holen(url(s)));
      return Promise.all(weitere).then(function (rest) {
        var roh = [erste].concat(rest).reduce(function (alle, d) { return alle.concat(d.preise || []); }, []);
        return { anzahl: erste.anzahl, liste: preisEintraege(roh) };
      });
    });
  };

  // Trefferzahl fuer Frage 4: Shopify filtert den Preis je m² selbst, bei
  // Paketware zaehlt der Finder aus der Preisliste.
  Finder.prototype.budgetZaehlen = function (qmBudget) {
    var self = this;
    if (!this.rechnet() || !qmBudget) return this.zaehlen({ preisBis: this.rechnet() ? null : qmBudget });
    return this.preisListe().then(function (d) {
      return { anzahl: imBudget(d.liste, qmBudget, self.raum(), self.gesamtBudget()).length };
    });
  };

  Finder.prototype.raum = function () {
    if (this.s.modus !== 'raum') return null;
    var l = raumMass(this.s.laenge);
    var b = raumMass(this.s.breite);
    return l && b ? { laenge: l, breite: b } : null;
  };

  Finder.prototype.oeffnen = function (modus) {
    if (!this.dlg.open) {
      this.dlg.showModal();
      document.documentElement.classList.add('tp-bf-offen');
    }
    if (modus === 'anfrage') {
      if (this.aktuell !== 'anfrage') {
        if (this.aktuell) this.verlauf.push(this.aktuell);
        this.zeige('anfrage');
      }
      return;
    }
    if (this.aktuell && this.aktuell !== 'anfrage') {
      this.zeige(this.aktuell, true);
    } else {
      this.verlauf = [];
      this.zeige(this.schritte()[0]);
    }
    melden('tp_finder_start', { art: this.s.art ? this.s.art.handle : '' });
  };

  Finder.prototype.schliessen = function () {
    if (this.dlg.open) this.dlg.close();
  };

  Finder.prototype.weiter = function (schritt) {
    if (this.aktuell) this.verlauf.push(this.aktuell);
    this.zeige(schritt);
  };

  Finder.prototype.zurueck = function () {
    var ziel = this.verlauf.pop();
    if (!ziel) ziel = this.aktuell === 'anfrage' ? this.schritte()[0] : null;
    if (ziel) this.zeige(ziel, true);
  };

  Finder.prototype.zeige = function (schritt, zurueck) {
    var self = this;
    this.aktuell = schritt;
    this.qa('[data-bf-schritt]').forEach(function (s) { s.hidden = s.getAttribute('data-bf-schritt') !== schritt; });
    var liste = this.schritte();
    var nr = liste.indexOf(schritt);
    var fortschritt = this.q('[data-bf-fortschritt]');
    var balken = this.q('[data-bf-balken]');
    if (nr >= 0) {
      fortschritt.textContent = 'Frage ' + (nr + 1) + ' von ' + liste.length;
      balken.style.width = Math.round(((nr + 0.5) / (liste.length + 1)) * 100) + '%';
    } else {
      fortschritt.textContent = schritt === 'ergebnis' ? 'Ihre Vorschläge' : 'Persönlich';
      balken.style.width = '100%';
    }
    this.q('[data-bf-zurueck]').hidden = !(this.verlauf.length || (schritt === 'anfrage'));
    var inhalt = this.q('[data-bf-inhalt]');
    if (inhalt) inhalt.scrollTop = 0;
    var aufbau = {
      art: this.zeigeArt,
      farbe: this.zeigeFarbe,
      optik: this.zeigeOptik,
      budget: this.zeigeBudget,
      ergebnis: this.zeigeErgebnis,
      anfrage: this.zeigeAnfrage
    }[schritt];
    if (aufbau) aufbau.call(this, zurueck);
    var frage = this.q('[data-bf-schritt="' + schritt + '"] .tp-bf-frage');
    if (frage) window.requestAnimationFrame(function () { frage.focus({ preventScroll: true }); });
    self.waLinks();
  };

  Finder.prototype.zaehlen = function (extra) {
    var a = this.s.art;
    return holen(filterUrl(a.url, extra && extra.ohneAuswahl ? {} : this.auswahl(), {
      view: 'boden-finder',
      preisBis: extra && extra.preisBis
    }));
  };

  Finder.prototype.fehlerZeigen = function (ziel, nochmal) {
    ziel.textContent = '';
    ziel.removeAttribute('aria-busy');
    var p = el('p', 'tp-bf-ladefehler', 'Das hat gerade nicht geklappt. ');
    var knopf = el('button', 'tp-bf-egal', 'Erneut versuchen');
    knopf.type = 'button';
    knopf.addEventListener('click', nochmal);
    p.appendChild(knopf);
    ziel.appendChild(p);
  };

  // --- Frage 1: Bodenart -------------------------------------------------
  Finder.prototype.zeigeArt = function () {
    var self = this;
    this.qa('[data-bf-art]').forEach(function (k) {
      k.setAttribute('aria-pressed', self.s.art && self.s.art.handle === k.getAttribute('data-bf-art') ? 'true' : 'false');
    });
  };

  // --- Frage 2: Farbe ----------------------------------------------------
  Finder.prototype.zeigeFarbe = function () {
    var self = this;
    var ziel = this.q('[data-bf-farben]');
    ziel.setAttribute('aria-busy', 'true');
    ziel.textContent = '';
    this.zaehlen({ ohneAuswahl: true }).then(function (daten) {
      ziel.removeAttribute('aria-busy');
      var f = daten.filter[FARBFILTER];
      var werte = f ? f.werte.filter(function (w) { return w.count > 0; }) : [];
      if (!werte.length) {
        // Bodenart ohne Farbfilter: Frage ueberspringen.
        self.s.farbe = null;
        self.zeige('optik');
        return;
      }
      werte.forEach(function (w) {
        var knopf = el('button', 'tp-bf-farbe');
        knopf.type = 'button';
        knopf.setAttribute('aria-pressed', self.s.farbe && self.s.farbe.value === w.value ? 'true' : 'false');
        var feld = el('span', 'tp-bf-farbe__feld');
        if (w.bild) feld.style.backgroundImage = 'url("' + w.bild + '")';
        else if (w.farbe) feld.style.background = w.farbe;
        if (/^weiß|^weiss|^creme/i.test(w.label)) feld.classList.add('tp-bf-farbe__feld--hell');
        knopf.appendChild(feld);
        knopf.appendChild(el('span', 'tp-bf-farbe__name', w.label));
        knopf.appendChild(el('span', 'tp-bf-farbe__zahl', '(' + w.count + ')'));
        knopf.setAttribute('aria-label', w.label + ', ' + w.count + ' ' + (self.s.art.wort || 'Produkte'));
        knopf.addEventListener('click', function () {
          if (!self.s.farbe || self.s.farbe.value !== w.value) {
            self.s.optik = null;
            self.s.zimmer = [];
          }
          self.s.farbe = { value: w.value, label: w.label };
          self.weiter('optik');
        });
        ziel.appendChild(knopf);
      });
    }, function () {
      self.fehlerZeigen(ziel, function () { self.zeigeFarbe(); });
    });
  };

  // --- Frage 3: Optik und Raum -------------------------------------------
  Finder.prototype.zeigeOptik = function () {
    var self = this;
    var art = this.s.art;
    var ziel = this.q('[data-bf-optiken]');
    var zimmerBox = this.q('[data-bf-zimmer-box]');
    var zimmerZiel = this.q('[data-bf-zimmer]');
    var weiterKnopf = this.q('[data-bf-weiter]');
    this.q('[data-bf-optik-frage]').textContent = art.optik_frage || 'Welche Optik soll es sein?';
    this.q('[data-bf-zimmer-frage]').textContent = art.raum_frage || 'Für welchen Raum?';
    ziel.setAttribute('aria-busy', 'true');
    ziel.textContent = '';
    zimmerZiel.textContent = '';
    weiterKnopf.disabled = !this.s.optik;
    // Zaehlen nur mit der Farbe: die Optik-Zahlen sollen nicht von der
    // eigenen Auswahl abhaengen, die Raum-Zahlen nicht vom Raum.
    holen(filterUrl(art.url, { farbe: this.s.farbe && this.s.farbe.value }, { view: 'boden-finder' })).then(function (daten) {
      ziel.removeAttribute('aria-busy');
      var namen = optikNamen(art.optik_namen);
      var f = daten.filter[art.optik_filter];
      var werte = optikReihenfolge(f ? f.werte.filter(function (w) { return w.count > 0; }) : [], namen);
      if (!werte.length) {
        self.s.optik = null;
        self.zeige('budget');
        return;
      }
      ziel.classList.toggle('tp-bf-optiken--vier', werte.length === 4);
      werte.forEach(function (w, i) {
        var n = namen[w.label.trim().toLowerCase()] || { name: w.label, text: '', stufe: i + 1 };
        var knopf = el('button', 'tp-bf-optik');
        knopf.type = 'button';
        knopf.setAttribute('aria-pressed', self.s.optik && self.s.optik.value === w.value ? 'true' : 'false');
        var bild = el('span', 'tp-bf-optik__bild');
        bild.innerHTML = dekorBild(n.bild) || optikBild(n.stufe);
        knopf.appendChild(bild);
        var text = el('span', 'tp-bf-optik__text');
        text.appendChild(el('span', 'tp-bf-optik__name', n.name || w.label));
        if (n.name && n.name !== w.label) text.appendChild(el('span', 'tp-bf-optik__wert', w.label));
        if (n.text) text.appendChild(el('span', 'tp-bf-optik__zeile', n.text));
        knopf.appendChild(text);
        knopf.appendChild(el('span', 'tp-bf-optik__zahl', w.count + ' ' + (art.wort || 'Produkte')));
        knopf.addEventListener('click', function () {
          self.s.optik = { value: w.value, label: n.name || w.label };
          ziel.querySelectorAll('.tp-bf-optik').forEach(function (k) { k.setAttribute('aria-pressed', k === knopf ? 'true' : 'false'); });
          weiterKnopf.disabled = false;
        });
        ziel.appendChild(knopf);
      });
      var r = art.raum_filter && daten.filter[art.raum_filter];
      var zimmer = r ? r.werte.filter(function (w) { return w.count > 0; }) : [];
      self.s.zimmerName = (r && r.label) || 'Raum';
      zimmerBox.hidden = !zimmer.length;
      zimmer.forEach(function (w) {
        var chip = el('button', 'tp-bf-chip', w.label);
        chip.type = 'button';
        var an = self.s.zimmer.some(function (z) { return z.value === w.value; });
        chip.setAttribute('aria-pressed', an ? 'true' : 'false');
        chip.addEventListener('click', function () {
          var jetzt = chip.getAttribute('aria-pressed') !== 'true';
          chip.setAttribute('aria-pressed', jetzt ? 'true' : 'false');
          self.s.zimmer = self.s.zimmer.filter(function (z) { return z.value !== w.value; });
          if (jetzt) self.s.zimmer.push({ value: w.value, label: w.label });
        });
        zimmerZiel.appendChild(chip);
      });
    }, function () {
      self.fehlerZeigen(ziel, function () { self.zeigeOptik(); });
    });
  };

  // --- Frage 4: Budget ---------------------------------------------------
  Finder.prototype.zeigeBudget = function () {
    var art = this.s.art;
    var chips = this.q('[data-bf-qm-chips]');
    var stufen = budgetStufen(art.stufen);
    chips.textContent = '';
    this.q('[data-bf-qm]').placeholder = 'z. B. ' + zahl(stufen[0], stufen[0] % 1 ? 2 : 0);
    stufen.forEach(function (wert) {
      var k = el('button', 'tp-bf-chip', 'bis ' + zahl(wert, wert % 1 ? 2 : 0) + ' €');
      k.type = 'button';
      k.setAttribute('aria-pressed', 'false');
      k.setAttribute('data-bf-qm-wert', String(wert));
      chips.appendChild(k);
    });
    var hinweis = this.q('[data-bf-raum-hinweis]');
    if (!hinweis.hasAttribute('data-standard')) hinweis.setAttribute('data-standard', hinweis.textContent);
    hinweis.textContent = art.raum_hinweis || hinweis.getAttribute('data-standard');
    this.modusSetzen(this.s.modus);
    this.q('[data-bf-qm]').value = this.s.qm;
    this.q('[data-bf-laenge]').value = this.s.laenge;
    this.q('[data-bf-breite]').value = this.s.breite;
    this.q('[data-bf-gesamt]').value = this.s.gesamt;
    this.budgetAktualisieren(true);
  };

  Finder.prototype.modusSetzen = function (modus) {
    this.s.modus = modus;
    this.qa('[data-bf-modus]').forEach(function (k) {
      k.setAttribute('aria-checked', k.getAttribute('data-bf-modus') === modus ? 'true' : 'false');
    });
    this.qa('[data-bf-feld]').forEach(function (f) { f.hidden = f.getAttribute('data-bf-feld') !== modus; });
  };

  Finder.prototype.beschreibung = function () {
    var teile = [];
    if (this.s.farbe) teile.push(this.s.farbe.label);
    if (this.s.optik) teile.push(this.s.optik.label);
    return teile.join(' · ');
  };

  Finder.prototype.budgetAktualisieren = function (sofort) {
    var self = this;
    var qmWert = betrag(this.s.qm);
    this.qa('[data-bf-qm-wert]').forEach(function (k) {
      k.setAttribute('aria-pressed', qmWert === Number(k.getAttribute('data-bf-qm-wert')) ? 'true' : 'false');
    });
    var umrechnung = this.q('[data-bf-umrechnung]');
    var zaehler = this.q('[data-bf-zaehler]');
    var raum = this.raum();
    var qmBudget = this.budgetQm();
    if (this.s.modus === 'raum') {
      var text = '';
      if (raum) {
        var flaeche = (raum.laenge * raum.breite) / 10000;
        text = meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m = ' + zahl(flaeche, 1) + ' m²';
        if (qmBudget) text += ' → ca. ' + zahl(Math.floor(qmBudget + EPS), 0) + ' €/m²';
      } else if (this.s.laenge || this.s.breite) {
        text = 'Bitte Länge und Breite in Metern angeben, z. B. 4,5.';
      }
      umrechnung.textContent = text;
    }
    window.clearTimeout(this.zaehlTimer);
    var nr = ++this.zaehlNr;
    var los = function () {
      self.budgetZaehlen(qmBudget).then(function (daten) {
        if (nr !== self.zaehlNr) return;
        var wort = self.s.art.wort || 'Produkte';
        var was = self.beschreibung();
        zaehler.classList.toggle('tp-bf-zaehler--leer', !daten.anzahl);
        if (qmBudget) {
          zaehler.textContent = daten.anzahl
            ? daten.anzahl + ' ' + wort + (was ? ' in ' + was : '') + ' bis ca. ' + zahl(Math.floor(qmBudget + EPS), 0) + ' €/m²'
            : 'Bis ca. ' + zahl(Math.floor(qmBudget + EPS), 0) + ' €/m² ist online nichts dabei – im nächsten Schritt zeigen wir Ihnen Alternativen.';
        } else {
          zaehler.textContent = daten.anzahl + ' ' + wort + (was ? ' in ' + was : '') + ' passen bisher zu Ihren Angaben.';
        }
      }, function () {
        if (nr === self.zaehlNr) zaehler.textContent = '';
      });
    };
    if (sofort) los(); else this.zaehlTimer = window.setTimeout(los, 350);
  };

  Finder.prototype.budgetPruefen = function () {
    var meldung = '';
    if (this.s.modus === 'qm') {
      if (!betrag(this.s.qm)) meldung = 'Bitte einen Betrag pro m² eingeben – oder „Ohne Budget anzeigen“ wählen.';
    } else {
      var hatMass = this.s.laenge || this.s.breite;
      if (hatMass && !this.raum()) meldung = 'Bitte Länge und Breite in Metern angeben, z. B. 4,5.';
      else if (!this.raum() && betrag(this.s.gesamt)) meldung = 'Für den Raumpreis brauchen wir Länge und Breite.';
      else if (!this.raum()) meldung = 'Bitte Raummaße und Budget eingeben – oder „Ohne Budget anzeigen“ wählen.';
      else if (this.s.gesamt && !betrag(this.s.gesamt)) meldung = 'Bitte das Budget als Zahl eingeben, z. B. 500.';
    }
    this.q('[data-bf-zaehler]').textContent = meldung || this.q('[data-bf-zaehler]').textContent;
    if (meldung) this.q('[data-bf-zaehler]').classList.add('tp-bf-zaehler--fehler');
    else this.q('[data-bf-zaehler]').classList.remove('tp-bf-zaehler--fehler');
    return !meldung;
  };

  // --- Ergebnis ----------------------------------------------------------
  Finder.prototype.zeigeErgebnis = function () {
    var self = this;
    var art = this.s.art;
    var ziel = this.q('[data-bf-treffer]');
    var status = this.q('[data-bf-status]');
    var alle = this.q('[data-bf-alle]');
    var sonder = this.q('[data-bf-sonder]');
    var titel = this.q('[data-bf-ergebnis-titel]');
    var raum = this.raum();
    var qmBudget = this.budgetQm();
    var gesamt = this.gesamtBudget();
    this.zusammenfassungZeigen();
    ziel.textContent = '';
    ziel.setAttribute('aria-busy', 'true');
    alle.hidden = true;
    this.q('[data-bf-mehr]').hidden = true;
    sonder.hidden = true;
    // Grundstellung: Laden-Hinweis unter den Karten.
    this.q('.tp-bf-alle-zeile').after(sonder);
    titel.textContent = 'Unsere Vorschläge für Sie';
    status.textContent = 'Vorschläge werden geladen …';
    var auswahl = this.auswahl();
    if (this.rechnet() && qmBudget) {
      this.ergebnisGerechnet(qmBudget, gesamt).catch(function () {
        ziel.removeAttribute('aria-busy');
        status.textContent = '';
        self.fehlerZeigen(ziel, function () { self.zeigeErgebnis(); });
      });
      return;
    }
    holen(filterUrl(art.url, auswahl, { view: 'boden-finder-treffer', preisBis: qmBudget })).then(function (daten) {
      var liste = daten.produkte.map(function (p) {
        var a = raum ? angebot(p, raum.laenge, raum.breite) : null;
        return { p: p, angebot: a, passt: !gesamt || !a || a.betrag <= gesamt + 0.005 };
      });
      var passend = regulaerZuerst(liste.filter(function (t) { return t.passt; }), function (t) { return t.p.auslauf; });
      var zeigen = passend.slice(0, 3);
      var link = filterUrl(art.url, auswahl, { preisBis: qmBudget });
      if (daten.anzahl > zeigen.length) {
        alle.href = link;
        alle.textContent = 'Alle ' + daten.anzahl + ' Treffer ansehen' + (qmBudget ? ' (bis ca. ' + zahl(Math.floor(qmBudget + EPS), 0) + ' €/m²)' : '');
        alle.hidden = false;
      }
      if (zeigen.length) {
        status.textContent = self.statusText(daten.anzahl, zeigen.length, qmBudget);
        self.kartenZeigen(ziel, zeigen, daten, gesamt, false);
        sonder.hidden = zeigen.length >= 3 || !qmBudget;
        self.ergebnisMelden(daten.anzahl, zeigen.length);
        return null;
      }
      // Nichts im Budget: zuerst der Laden (Reste, Sonderposten), dann die
      // guenstigsten Treffer ohne Budget.
      sonder.hidden = false;
      status.before(sonder);
      titel.textContent = 'In Ihrem Budget ist online nichts dabei';
      return holen(filterUrl(art.url, auswahl, { view: 'boden-finder-treffer', sort: 'price-ascending' })).then(function (ohne) {
        var guenstig = ohne.produkte.slice(0, 3).map(function (p) {
          return { p: p, angebot: raum ? angebot(p, raum.laenge, raum.breite) : null, passt: false };
        });
        var ab = '';
        if (guenstig.length && raum && guenstig[0].angebot) ab = ' – für Ihren Raum ab ca. ' + euro(guenstig[0].angebot.betrag);
        else if (guenstig.length && abPreisQm(guenstig[0].p)) ab = ' – ab ' + euro(abPreisQm(guenstig[0].p)) + '/m²';
        status.textContent = guenstig.length
          ? 'Online liegen die günstigsten passenden ' + (art.wort || 'Produkte') + ' über Ihrem Budget' + ab + ':'
          : 'Zu Ihrer Auswahl haben wir online gerade nichts.';
        self.kartenZeigen(ziel, guenstig, ohne, gesamt, true);
        if (ohne.anzahl > guenstig.length) {
          alle.href = filterUrl(art.url, auswahl, { sort: 'price-ascending' });
          alle.textContent = 'Alle ' + ohne.anzahl + ' ' + (art.wort || 'Produkte') + ' in Ihrer Auswahl ansehen';
          alle.hidden = false;
        }
        self.ergebnisMelden(0, guenstig.length);
      });
    }).catch(function () {
      ziel.removeAttribute('aria-busy');
      status.textContent = '';
      self.fehlerZeigen(ziel, function () { self.zeigeErgebnis(); });
    });
  };

  // Ergebnis mit Budget fuer Paketware: Die Preisliste entscheidet, was ins
  // Budget passt; die Karten kommen von den Seiten der Treffer-Ansicht, auf
  // denen diese Produkte stehen (gleiche Filter, gleiche Reihenfolge). Die
  // Kategorie selbst kann nicht nach Preis je m² filtern - weitere Treffer
  // im Budget zeigt deshalb der Knopf "Weitere Vorschlaege" hier im Finder.
  Finder.prototype.ergebnisGerechnet = function (qmBudget, gesamt) {
    var self = this;
    var art = this.s.art;
    var wort = art.wort || 'Produkte';
    var ziel = this.q('[data-bf-treffer]');
    var status = this.q('[data-bf-status]');
    var alle = this.q('[data-bf-alle]');
    var sonder = this.q('[data-bf-sonder]');
    var titel = this.q('[data-bf-ergebnis-titel]');
    var raum = this.raum();
    var auswahl = this.auswahl();
    var trefferUrl = function (seite) { return filterUrl(art.url, auswahl, { view: 'boden-finder-treffer', seite: seite }); };
    var imRaumBudget = function (t) { return !gesamt || !t.angebot || t.angebot.betrag <= gesamt + 0.005; };
    return Promise.all([this.preisListe(), holen(trefferUrl(1))]).then(function (r) {
      var liste = r[0].liste;
      var proSeite = r[1].pro_seite || 8;
      var passend = regulaerZuerst(imBudget(liste, qmBudget, raum, gesamt), function (e) { return e.auslauf; });
      var linkZeigen = function (gezeigt) {
        if (liste.length <= gezeigt) return;
        alle.href = filterUrl(art.url, auswahl, {});
        alle.textContent = 'Alle ' + liste.length + ' ' + wort + ' in Ihrer Auswahl ansehen (ohne Budget)';
        alle.hidden = false;
      };
      return self.kartenLaden(passend, 0, proSeite, trefferUrl, imRaumBudget).then(function (gefunden) {
        if (gefunden.zeigen.length) {
          gefunden.zeigen.forEach(function (t) { t.passt = true; });
          var budget = ' bis ca. ' + zahl(Math.floor(qmBudget + EPS), 0) + ' €/m²';
          status.textContent = passend.length <= gefunden.zeigen.length
            ? 'Passend zu Ihren Angaben' + budget + ':'
            : passend.length + ' ' + wort + ' passen' + budget + '. Hier die ersten ' + gefunden.zeigen.length + ':';
          self.kartenZeigen(ziel, gefunden.zeigen, gefunden, gesamt, false);
          self.mehrAnbieten(passend, gefunden.naechster, proSeite, trefferUrl, imRaumBudget, gesamt);
          linkZeigen(passend.length);
          sonder.hidden = gefunden.zeigen.length >= 3;
          self.ergebnisMelden(passend.length, gefunden.zeigen.length);
          return null;
        }
        // Nichts im Budget: der Laden zuerst, dann die guenstigsten je m².
        sonder.hidden = false;
        status.before(sonder);
        titel.textContent = 'In Ihrem Budget ist online nichts dabei';
        var guenstig = liste.filter(function (e) { return e.qm > 0; })
          .sort(function (x, y) { return x.qm - y.qm || x.pos - y.pos; });
        return self.kartenLaden(guenstig, 0, proSeite, trefferUrl, function () { return true; }).then(function (ohne) {
          var erster = ohne.zeigen[0];
          var ab = '';
          if (erster && raum && erster.angebot) ab = ' – für Ihren Raum ab ca. ' + euro(erster.angebot.betrag);
          else if (erster && abPreisQm(erster.p)) ab = ' – ab ' + euro(abPreisQm(erster.p)) + '/m²';
          status.textContent = ohne.zeigen.length
            ? 'Online liegen die günstigsten passenden ' + wort + ' über Ihrem Budget' + ab + ':'
            : 'Zu Ihrer Auswahl haben wir online gerade nichts.';
          self.kartenZeigen(ziel, ohne.zeigen, ohne, gesamt, true);
          linkZeigen(ohne.zeigen.length);
          self.ergebnisMelden(0, ohne.zeigen.length);
        });
      });
    });
  };

  // "Weitere Vorschlaege": die naechsten drei Treffer im Budget anhaengen.
  Finder.prototype.mehrAnbieten = function (eintraege, ab, proSeite, url, nehmen, gesamt) {
    var self = this;
    var mehr = this.q('[data-bf-mehr]');
    var ziel = this.q('[data-bf-treffer]');
    mehr.hidden = ab >= eintraege.length;
    mehr.onclick = function () {
      mehr.disabled = true;
      self.kartenLaden(eintraege, ab, proSeite, url, nehmen).then(function (weitere) {
        mehr.disabled = false;
        weitere.zeigen.forEach(function (t) { t.passt = true; });
        var erste = ziel.children.length;
        self.kartenZeigen(ziel, weitere.zeigen, weitere, gesamt, false, true);
        // Fokus auf die erste neue Karte: die Links der Karte sind
        // display: contents und damit nicht fokussierbar.
        var neu = ziel.children[erste];
        if (neu) {
          neu.setAttribute('tabindex', '-1');
          neu.focus({ preventScroll: true });
          neu.scrollIntoView({ block: 'nearest', inline: 'start' });
        }
        self.mehrAnbieten(eintraege, weitere.naechster, proSeite, url, nehmen, gesamt);
      }, function () {
        mehr.disabled = false;
      });
    };
  };

  // Bis zu drei Karten fuer die Eintraege der Preisliste ab Stelle start, in
  // deren Reihenfolge. Laedt nur die Seiten der Treffer-Ansicht, auf denen
  // sie stehen; nehmen() kann einen Treffer verwerfen (Rolle ueber dem
  // Raumbudget), dann rueckt der naechste nach. Hoechstens vier Runden.
  // naechster = erster noch nicht gepruefter Eintrag.
  Finder.prototype.kartenLaden = function (eintraege, start, proSeite, url, nehmen) {
    var raum = this.raum();
    var zeigen = [];
    var karten = {};
    var produkte = {};
    var i = start;
    var runden = 0;
    function runde() {
      var stapel = eintraege.slice(i, i + (3 - zeigen.length) + 2);
      var seiten = [];
      runden++;
      stapel.forEach(function (e) {
        var s = kartenSeite(e.pos, proSeite);
        if (seiten.indexOf(s) < 0) seiten.push(s);
      });
      return Promise.all(seiten.map(function (s) { return holen(url(s)); })).then(function (antworten) {
        antworten.forEach(function (d) {
          d.produkte.forEach(function (p) { produkte[p.handle] = p; });
          Object.keys(d.karten).forEach(function (h) { karten[h] = d.karten[h]; });
        });
        for (var k = 0; k < stapel.length && zeigen.length < 3; k++) {
          var e = stapel[k];
          var p = produkte[e.handle];
          i++;
          // Fehlt das Produkt auf seiner Seite (Daten zwischendurch
          // geaendert), wird es uebersprungen statt falsch gezeigt.
          if (!p || !karten[e.handle]) continue;
          var t = { p: p, angebot: raum ? angebot(p, raum.laenge, raum.breite) : null, passt: false };
          if (nehmen(t)) zeigen.push(t);
        }
        if (zeigen.length < 3 && i < eintraege.length && runden < 4) return runde();
        return { zeigen: zeigen, karten: karten, naechster: i };
      });
    }
    return i < eintraege.length ? runde() : Promise.resolve({ zeigen: zeigen, karten: karten, naechster: i });
  };

  Finder.prototype.statusText = function (anzahl, gezeigt, qmBudget) {
    var wort = this.s.art.wort || 'Produkte';
    var budget = qmBudget ? ' bis ca. ' + zahl(Math.floor(qmBudget + EPS), 0) + ' €/m²' : '';
    if (anzahl <= gezeigt) return 'Passend zu Ihren Angaben' + budget + ':';
    return anzahl + ' ' + wort + ' passen' + budget + '. Hier die ersten ' + gezeigt + ' – alle finden Sie über den Link darunter.';
  };

  Finder.prototype.ergebnisMelden = function (anzahl, gezeigt) {
    melden('tp_finder_ergebnis', {
      art: this.s.art.handle,
      farbe: this.s.farbe ? this.s.farbe.label : '',
      optik: this.s.optik ? this.s.optik.label : '',
      budget_modus: this.s.ohneBudget ? 'ohne' : this.s.modus,
      treffer: anzahl,
      gezeigt: gezeigt
    });
  };

  // anhaengen: weitere Karten hinter die vorhandenen ("Weitere Vorschlaege").
  Finder.prototype.kartenZeigen = function (ziel, treffer, daten, gesamt, ueber, anhaengen) {
    var self = this;
    if (!anhaengen) {
      ziel.textContent = '';
      this.gezeigt = [];
    }
    ziel.removeAttribute('aria-busy');
    var raum = this.raum();
    treffer.forEach(function (t) {
      var vorlage = daten.karten[t.p.handle];
      if (!vorlage) return;
      self.gezeigt.push(t.p.titel);
      var item = el('div', 'tp-bf-treffer__item');
      item.appendChild(document.importNode(vorlage, true));
      if (raum && t.angebot) {
        var a = t.angebot;
        var box = el('p', 'tp-bf-raumpreis' + (gesamt && a.betrag > gesamt + 0.005 ? ' tp-bf-raumpreis--ueber' : ''));
        box.appendChild(el('span', 'tp-bf-raumpreis__kopf', 'Ihr Raum ' + meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m:'));
        var b = el('strong', 'tp-bf-raumpreis__betrag', 'ca. ' + euro(a.betrag));
        box.appendChild(b);
        box.appendChild(el('span', 'tp-bf-raumpreis__wie', angebotText(a)));
        if (gesamt && a.betrag > gesamt + 0.005) box.appendChild(el('span', 'tp-bf-raumpreis__ueber', 'über Ihrem Budget'));
        item.appendChild(box);
      }
      ziel.appendChild(item);
    });
    ziel.classList.toggle('tp-bf-treffer--ueber', !!ueber);
    this.waLinks();
  };

  Finder.prototype.zusammenfassungZeigen = function () {
    var self = this;
    var ziel = this.q('[data-bf-auswahl]');
    ziel.textContent = '';
    var eintraege = [];
    if (this.s.art && !this.cfg.vorwahl) eintraege.push([this.s.art.titel, 'art']);
    eintraege.push([this.s.farbe ? this.s.farbe.label : 'jede Farbe', 'farbe']);
    eintraege.push([this.s.optik ? this.s.optik.label : 'jede Optik', 'optik']);
    if (this.s.zimmer.length) eintraege.push([this.s.zimmer.map(function (z) { return z.label; }).join(', '), 'optik']);
    eintraege.push([this.budgetText() || 'ohne Budget', 'budget']);
    eintraege.forEach(function (e) {
      var li = el('li');
      var knopf = el('button', 'tp-bf-chip tp-bf-chip--aendern', e[0]);
      knopf.type = 'button';
      knopf.setAttribute('aria-label', e[0] + ' – ändern');
      knopf.addEventListener('click', function () {
        // Zurueck zur Frage; der Verlauf endet dort.
        var liste = self.schritte();
        self.verlauf = liste.slice(0, liste.indexOf(e[1]));
        self.zeige(e[1], true);
      });
      li.appendChild(knopf);
      ziel.appendChild(li);
    });
  };

  Finder.prototype.budgetText = function () {
    if (this.s.ohneBudget) return '';
    var raum = this.raum();
    if (this.s.modus === 'raum') {
      var g = betrag(this.s.gesamt);
      if (raum && g) return euro(g) + ' für ' + meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m';
      if (raum) return 'Raum ' + meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m';
      return '';
    }
    var q = betrag(this.s.qm);
    return q ? 'bis ' + euro(q) + '/m²' : '';
  };

  // Text fuer E-Mail und WhatsApp: alles, was der Kunde angegeben hat.
  Finder.prototype.zusammenfassung = function () {
    var z = [];
    if (this.s.art) z.push('Bodenart: ' + this.s.art.titel);
    z.push('Farbe: ' + (this.s.farbe ? this.s.farbe.label : 'egal'));
    z.push('Optik: ' + (this.s.optik ? this.s.optik.label : 'egal'));
    if (this.s.zimmer.length) z.push((this.s.zimmerName || 'Raum') + ': ' + this.s.zimmer.map(function (w) { return w.label; }).join(', '));
    var raum = this.raum();
    if (raum) z.push('Raummaße: ' + meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m');
    var b = this.budgetText();
    if (b) {
      var q = this.budgetQm();
      z.push('Budget: ' + b + (this.s.modus === 'raum' && q ? ' (ca. ' + zahl(Math.floor(q + EPS), 0) + ' €/m²)' : ''));
    } else {
      z.push('Budget: offen');
    }
    if (this.gezeigt && this.gezeigt.length) z.push('Im Finder gezeigt: ' + this.gezeigt.join('; '));
    return z.join('\n');
  };

  Finder.prototype.waText = function (herkunft) {
    var text = 'Hallo, ich suche ' + (this.s.art ? this.s.art.titel : 'einen Boden');
    if (this.s.farbe) text += ' in ' + this.s.farbe.label;
    if (this.s.optik) text += ', ' + this.s.optik.label;
    var raum = this.raum();
    if (raum) text += ' für einen Raum von ca. ' + meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m';
    var b = this.budgetText();
    if (b && this.s.modus === 'raum' && betrag(this.s.gesamt)) text += ', Budget ca. ' + euro(betrag(this.s.gesamt));
    else if (b && this.s.modus === 'qm') text += ', Budget ' + b;
    text += '. ';
    text += (herkunft || this.s.herkunft) === 'sonder'
      ? 'Haben Sie passende Reste oder Sonderposten? Gern mit Fotos und Preisen.'
      : 'Können Sie mir passende Angebote schicken?';
    return text;
  };

  Finder.prototype.waLinks = function () {
    var nummer = this.cfg.wa;
    if (!nummer) return;
    var self = this;
    this.qa('[data-bf-wa]').forEach(function (a) {
      a.href = 'https://wa.me/' + nummer + '?text=' + encodeURIComponent(self.waText(a.getAttribute('data-bf-wa')));
    });
  };

  // --- Persoenliche Vorschlaege -----------------------------------------
  Finder.prototype.zeigeAnfrage = function () {
    var form = this.q('.tp-bf-form');
    var sonder = this.s.herkunft === 'sonder';
    this.q('[data-bf-betreff]').value = sonder ? 'Boden-Finder: Reste und Sonderposten – Fotos und Preise' : 'Boden-Finder: persönliche Vorschläge';
    this.q('[data-bf-schritt="anfrage"] .tp-bf-frage').textContent = sonder ? 'Fotos und Preise anfragen' : 'Persönliche Vorschläge anfordern';
    this.q('.tp-bf-form [type="submit"]').textContent = sonder ? 'Anfrage senden' : 'Vorschläge anfordern';
    this.q('[data-bf-anfrage-text]').textContent = sonder
      ? 'Wir schauen im Laden nach passenden Resten und Sonderposten und schicken Ihnen Fotos und Preise.'
      : 'Wir suchen Ihnen 3 passende Angebote heraus – auch aus Resten und Sonderposten im Laden – und melden uns persönlich bei Ihnen.';
    var masse = this.q('[data-bf-masse]');
    var raum = this.raum();
    if (raum && !masse.value) masse.value = meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m';
    var hinweis = this.q('[data-bf-uebernahme]');
    var hatAngaben = this.s.art && (this.s.farbe || this.s.optik || this.budgetText());
    hinweis.hidden = !hatAngaben;
    if (hatAngaben) {
      hinweis.textContent = 'Ihre Angaben aus dem Finder schicken wir mit: ' + this.zusammenfassung().split('\n').join(' · ');
    }
    if (form) this.wegAktualisieren();
  };

  Finder.prototype.wegAktualisieren = function () {
    var gewaehlt = this.q('[data-bf-weg]:checked');
    var weg = gewaehlt ? gewaehlt.value : '';
    var tel = this.q('[data-bf-tel]');
    var pflicht = weg === 'Anruf' || weg === 'WhatsApp';
    tel.required = pflicht;
    this.q('[data-bf-tel-optional]').hidden = pflicht;
  };

  // --- Ereignisse --------------------------------------------------------
  Finder.prototype.verbinden = function () {
    var self = this;
    var dlg = this.dlg;
    dlg.addEventListener('close', function () {
      document.documentElement.classList.remove('tp-bf-offen');
    });
    // Klick auf den abgedunkelten Rand schliesst.
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) self.schliessen();
    });
    this.q('[data-bf-zu]').addEventListener('click', function () { self.schliessen(); });
    this.q('[data-bf-zurueck]').addEventListener('click', function () { self.zurueck(); });

    this.qa('[data-bf-art]').forEach(function (k) {
      k.addEventListener('click', function () {
        var art = self.artFuer(k.getAttribute('data-bf-art'));
        if (!art) return;
        if (!self.s.art || self.s.art.handle !== art.handle) {
          self.s.farbe = null;
          self.s.optik = null;
          self.s.zimmer = [];
        }
        self.s.art = art;
        self.weiter('farbe');
      });
    });
    this.q('[data-bf-egal="farbe"]').addEventListener('click', function () {
      self.s.farbe = null;
      self.s.optik = null;
      self.s.zimmer = [];
      self.weiter('optik');
    });
    this.q('[data-bf-egal="optik"]').addEventListener('click', function () {
      self.s.optik = null;
      self.weiter('budget');
    });
    this.q('[data-bf-weiter]').addEventListener('click', function () { self.weiter('budget'); });

    this.qa('[data-bf-modus]').forEach(function (k) {
      k.addEventListener('click', function () {
        self.modusSetzen(k.getAttribute('data-bf-modus'));
        self.budgetAktualisieren(true);
      });
      k.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        var andere = self.qa('[data-bf-modus]').filter(function (x) { return x !== k; })[0];
        andere.click();
        andere.focus();
      });
    });
    var felder = { qm: '[data-bf-qm]', laenge: '[data-bf-laenge]', breite: '[data-bf-breite]', gesamt: '[data-bf-gesamt]' };
    Object.keys(felder).forEach(function (name) {
      var feld = self.q(felder[name]);
      feld.addEventListener('input', function () {
        self.s[name] = feld.value;
        self.s.ohneBudget = false;
        self.q('[data-bf-zaehler]').classList.remove('tp-bf-zaehler--fehler');
        self.budgetAktualisieren(false);
      });
      feld.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); self.q('[data-bf-zeigen]').click(); }
      });
    });
    this.q('[data-bf-qm-chips]').addEventListener('click', function (e) {
      var k = e.target.closest('[data-bf-qm-wert]');
      if (!k) return;
      var feld = self.q('[data-bf-qm]');
      feld.value = k.getAttribute('data-bf-qm-wert').replace('.', ',');
      self.s.qm = feld.value;
      self.s.ohneBudget = false;
      self.budgetAktualisieren(true);
    });
    this.q('[data-bf-zeigen]').addEventListener('click', function () {
      self.s.ohneBudget = false;
      if (!self.budgetPruefen()) return;
      self.weiter('ergebnis');
    });
    this.q('[data-bf-ohne-budget]').addEventListener('click', function () {
      self.s.ohneBudget = true;
      self.weiter('ergebnis');
    });
    this.qa('[data-bf-zur-anfrage]').forEach(function (k) {
      k.addEventListener('click', function () {
        self.s.herkunft = k.getAttribute('data-bf-zur-anfrage');
        self.weiter('anfrage');
      });
    });

    var form = this.q('.tp-bf-form');
    if (form) {
      this.qa('[data-bf-weg]').forEach(function (r) {
        r.addEventListener('change', function () { self.wegAktualisieren(); });
      });
      form.addEventListener('submit', function () {
        // Kommt nur nach bestandener Pruefung des Browsers an.
        self.q('[data-bf-zusammenfassung]').value = self.zusammenfassung();
        try { sessionStorage.setItem('tp_bf_gesendet', self.wurzel.id); } catch (e) {}
        var weg = self.q('[data-bf-weg]:checked');
        melden('tp_finder_anfrage', { art: self.s.art ? self.s.art.handle : '', weg: weg ? weg.value : '', herkunft: self.s.herkunft });
      });
    }
  };

  var instanzen = [];
  function oeffnen(wurzel, modus) {
    var finder = null;
    instanzen.forEach(function (f) { if (f.wurzel === wurzel) finder = f; });
    if (!finder) {
      finder = new Finder(wurzel);
      instanzen.push(finder);
    }
    if (modus === 'anfrage' && !finder.s.art && finder.arten.length === 1) finder.s.art = finder.arten[0];
    finder.oeffnen(modus);
  }

  root.TPBodenFinder = { oeffnen: oeffnen, logik: logik };
})(typeof window !== 'undefined' ? window : globalThis);
