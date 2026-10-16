/*
  Boden-Finder (sections/tp-boden-finder.liquid): gefuehrte Beratung in
  hoechstens vier Fragen bis zu drei Vorschlaegen.

  Wird erst geladen, wenn jemand den Einstieg anklickt (Lader in der Section),
  zusammen mit assets/tp-rollware-art.js und assets/tp-boden-finder.css.

  Daten: Die Kollektion der Bodenart liefert ueber zwei Ansichten ohne Layout
  (sections/tp-boden-finder-daten.liquid) Filterwerte mit Trefferzahl und
  die ersten Treffer mit Variantenpreisen und fertiger Produktkarte. Shopify
  filtert und sortiert; hier wird nur ausgewaehlt und angezeigt.

  Auswahl: Farben, Optiken und Raeume sind Mehrfachauswahl. Mehrere Werte
  desselben Filters verknuepft Shopify mit "oder", verschiedene Filter mit
  "und".

  Preise: Der Variantenpreis von Teppichboden ist der Preis je m² (bei
  custom.preis_pro_001_qm je 0,01 m²). Der Preisrahmen ist eine Stufe je m²
  (Shopify-Preisfilter, wie der Preis auf den Karten). Mit Raumgroesse rechnet
  raumWege() beide Wege mit den Regeln des Rollenware-Rechners
  (TPRollwareArt): von der Rolle (volle Rollenbreite, Rest schneidet der
  Kunde ab) und genau zugeschnitten (Raummass nur ueber eine erlaubte
  Wunschmass-Variante und nur bis Rolle minus Zugabe), Mindestlaenge,
  Abrechnung auf volle m². Das Ergebnis ist ausdruecklich ein ca.-Preis -
  abgerechnet wird wie immer im Warenkorb.

  Paketware (Klick-, Klebevinyl; Bodenart mit Preis je m² "rechnen"): Der
  Variantenpreis ist der Paketpreis, der Shopify-Preisfilter ginge also am
  Preis je m² vorbei. Die Ansicht ?view=boden-finder-preise liefert je Produkt
  den Preis je m² wie auf der Karte (Paketpreis / custom.qm_pro_paket); die
  Preisstufen zaehlt und filtert imBudget() hier im Browser. Den Raumpreis
  rechnet paketRechnung() wie der Paketrechner (blocks/paket-auswahl.liquid):
  5 % Verschnitt, auf volle Pakete aufgerundet. Rollenware derselben
  Kollektion (Vinyl von der Rolle) laeuft weiter ueber raumWege(). Den
  ca.-Betrag an der Stufe setzt stufenMaximum() auf den teuersten Raumpreis
  darin - ganze Pakete kosten oft mehr als Flaeche x Stufe, Rollen nur in 2 m
  Breite (Bahnen mit Naht), mit Mindestlaenge oder ohne 5-m-Rolle auch. Dafuer
  liefert die Preisliste je Rolle Breiten, Preise und Mindestlaenge.

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

  // ---------------------------------------------------------------------
  // Reine Funktionen
  // ---------------------------------------------------------------------

  // Raummass in Metern oder Zentimetern -> { cm, einheit }. Mit Einheit gilt
  // die Einheit ("4,5 m", "450 cm"). Ohne Einheit sind Zahlen unter 30 Meter
  // ("4", "4,5") und ab 30 Zentimeter ("450") - 30 m misst kein Raum, 4 cm
  // auch nicht. null, wenn unklar, unter 10 cm oder ueber 50 m.
  function raumMassInfo(text) {
    var t = String(text == null ? '' : text).trim();
    var r = ART.parseMass(t, 'm');
    if (r.fehler || !(r.cm > 0)) return null;
    var einheit = r.einheit;
    if (!/[a-z]/i.test(t) && r.cm >= 3000) {
      r = ART.parseMass(t, 'cm');
      einheit = 'cm';
    }
    if (r.fehler || r.cm < 10 || r.cm > 5000) return null;
    return { cm: r.cm, einheit: einheit };
  }
  function raumMass(text) {
    var r = raumMassInfo(text);
    return r ? r.cm : null;
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

  // Raumflaeche in m² ("18", "18,5", "18 m²"). null, wenn unklar oder ueber
  // 2000 m².
  function qmFlaeche(text) {
    var n = betrag(String(text == null ? '' : text).replace(/m²|m2|qm/gi, ''));
    return n && n <= 2000 ? n : null;
  }

  // Preisstufen je m² aus der Block-Einstellung ("20, 30, 45, 70" oder
  // "19,90; 29,90"). Komma ohne Leerzeichen ist ein Dezimalkomma.
  function preisStufen(text) {
    var stufen = [];
    String(text || '').split(/[;\s]+/).forEach(function (teil) {
      var n = betrag(teil.replace(/,$/, ''));
      if (n && stufen.indexOf(n) < 0) stufen.push(n);
    });
    return stufen.sort(function (a, b) { return a - b; });
  }

  // Ungefaehr abgerechnete Flaeche fuer einen Raum aCm x bCm von der Rolle:
  // die schmalste uebliche Rolle (4 oder 5 m), die quer passt, mal die andere
  // Seite. Breiter als 5 m: die Raumflaeche (dann mit Naht). Nur fuer den
  // ca.-Betrag am Preisrahmen; je Produkt rechnet raumWege() genau.
  function rollenFlaeche(aCm, bCm) {
    if (!(aCm > 0) || !(bCm > 0)) return null;
    var best = 0;
    [[aCm, bCm], [bCm, aCm]].forEach(function (lage) {
      [400, 500].forEach(function (rolle) {
        if (rolle + EPS < lage[0]) return;
        var qm = (rolle * lage[1]) / 10000;
        if (!best || qm < best) best = qm;
      });
    });
    return best || (aCm * bCm) / 10000;
  }

  // ca.-Betrag fuer eine Preisstufe und eine Flaeche, auf 10 EUR gerundet.
  function stufenBetrag(proQmEuro, qm) {
    if (!(proQmEuro > 0) || !(qm > 0)) return null;
    return Math.round((proQmEuro * qm) / 10) * 10;
  }

  // Alle Wege, einen Raum aCm x bCm aus diesem Produkt zu decken. Beide Lagen
  // werden probiert (Raumbreite quer zur Rolle oder die Laenge). Je Weg:
  // { art: 'meterware'|'raummass', rolle, quer, laenge, qm, betrag, naht,
  // bahnen }. Leer, wenn das Produkt keine Rollenbreiten hat.
  function raumKandidaten(produkt, aCm, bCm) {
    if (!produkt || !(aCm > 0) || !(bCm > 0)) return [];
    var vars = (produkt.variants || []).filter(function (v) { return v && v.available === true; });
    var wIdx = ART.findWidthOption(produkt.options);
    if (wIdx < 0) return [];
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
    return kandidaten;
  }

  // Guenstigster Weg oder null.
  function raumAngebot(produkt, aCm, bCm) {
    return raumKandidaten(produkt, aCm, bCm)[0] || null;
  }

  // Je Zuschnittart der guenstigste Weg: { meterware, raummass } (je null,
  // wenn es den Weg nicht gibt) - so stehen im Ergebnis beide Preise.
  function raumWege(produkt, aCm, bCm) {
    var wege = { meterware: null, raummass: null };
    raumKandidaten(produkt, aCm, bCm).forEach(function (k) {
      if (!wege[k.art]) wege[k.art] = k;
    });
    return wege;
  }

  // Paketware: Flaeche in m² mit dem Verschnitt des Paketrechners auf volle
  // Pakete aufgerundet - dieselbe Formel wie computePackagesFor() in
  // blocks/paket-auswahl.liquid. paketpreis in Euro.
  function paketRechnung(qmPaket, paketpreis, flaeche) {
    if (!(qmPaket > 0) || !(paketpreis > 0) || !(flaeche > 0)) return null;
    var pakete = Math.max(1, Math.ceil((flaeche * PAKET_VERSCHNITT) / qmPaket - EPS));
    return {
      pakete: pakete, qmPaket: qmPaket, qm: pakete * qmPaket, flaeche: flaeche,
      betrag: Math.round(pakete * paketpreis * 100) / 100
    };
  }

  // Paketrechnung mit dem guenstigsten lieferbaren Paket aus den Varianten der
  // Treffer-Ansicht. null, wenn das Produkt keine Paketware ist.
  function paketAngebot(produkt, flaeche) {
    var qmPaket = Number(produkt && produkt.qm_paket);
    if (!(qmPaket > 0)) return null;
    var preis = 0;
    (produkt.variants || []).forEach(function (v) {
      if (!v || v.available !== true) return;
      var p = Number(v.price) / 100;
      if (p > 0 && (!preis || p < preis)) preis = p;
    });
    return paketRechnung(qmPaket, preis, flaeche);
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

  // Rollenware aus der Preisliste: [[Breite, Cent], ...], Mindestlaenge in cm,
  // Preis je 0,01 m² 1/0 -> Produkt fuer raumKandidaten() wie aus der
  // Treffer-Ansicht, nur mit lieferbaren Rollenbreiten. Wunschmass bleibt weg:
  // ohne ihn ist der guenstigste Weg hoechstens teurer, der Betrag der Stufe
  // also nie zu niedrig. null ohne Rollenbreiten.
  function rollenProdukt(paare, minCm, cmExact) {
    var vars = (paare || []).filter(function (p) { return Array.isArray(p) && ART.isBreite(p[0]) && Number(p[1]) > 0; })
      .map(function (p) { return { options: [p[0]], price: Number(p[1]), available: true }; });
    if (!vars.length) return null;
    return {
      cm_exact: cmExact === 1,
      min_cm: Number(minCm) > 0 ? Number(minCm) : 0,
      options: [{ name: 'Breite', values: vars.map(function (v) { return v.options[0]; }) }],
      variants: vars
    };
  }

  // Ansicht boden-finder-preise: [Handle, Cent je m², m² je Paket, Cent,
  // Auslauf, bei Rollenware Breiten, Mindestlaenge, je 0,01 m²] je Produkt ->
  // Eintraege; pos = Stelle in der Kollektion.
  function preisEintraege(roh) {
    return (roh || []).filter(Array.isArray).map(function (e, i) {
      return {
        handle: e[0],
        qm: Number(e[1]) > 0 ? Number(e[1]) / 100 : null,
        paket: Number(e[2]) > 0 ? Number(e[2]) : 0,
        preis: Number(e[3]) > 0 ? Number(e[3]) / 100 : null,
        auslauf: e[4] === 1,
        rolle: Number(e[2]) > 0 ? null : rollenProdukt(e[5], e[6], e[7]),
        pos: i
      };
    });
  }

  // Eintraege mit einem Preis je m² von hoechstens qmStufe.
  function imBudget(liste, qmStufe) {
    return (liste || []).filter(function (e) { return e.qm > 0 && e.qm <= qmStufe + 0.005; });
  }

  // ca.-Betrag einer Preisstufe bei Paketware: der teuerste Raumpreis unter
  // den Eintraegen der Stufe, damit kein Vorschlag darueber liegt. Pakete in
  // ganzen Paketen wie paketRechnung() fuer die Raumflaeche. Rollenware mit
  // Laenge und Breite (raum in cm) wie die Karte: guenstigster Weg aus
  // raumAngebot(), auch Bahnen mit Naht und Mindestlaenge; sonst Preis je m²
  // x qmRolle (wie stufenBetrag). Auf volle 10 EUR aufgerundet, nie
  // abgerundet; null ohne Raumgroesse oder ohne Treffer.
  function stufenMaximum(liste, qmStufe, flaeche, qmRolle, raum) {
    var max = 0;
    imBudget(liste, qmStufe).forEach(function (e) {
      var b = 0;
      if (e.paket > 0) {
        var a = paketRechnung(e.paket, e.preis, flaeche);
        if (a) b = a.betrag;
      } else {
        var weg = e.rolle && raum ? raumAngebot(e.rolle, raum.laenge, raum.breite) : null;
        if (weg) b = weg.betrag;
        else if (qmRolle > 0) b = e.qm * qmRolle;
      }
      if (b > max) max = b;
    });
    return max > 0 ? Math.ceil(max / 10 - EPS) * 10 : null;
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

  // Adresse einer gefilterten Kollektion. auswahl: { farben[], optikFilter,
  // optiken[], raumFilter, zimmer[] } (einzeln auch farbe / optik); extra:
  // { view, preisBis, sort, seite }. Mehrere Werte eines Filters = "oder".
  function liste(mehrere, einer) {
    if (mehrere && mehrere.length) return mehrere;
    return einer ? [einer] : [];
  }
  function filterUrl(basis, auswahl, extra) {
    var p = new URLSearchParams();
    var a = auswahl || {};
    var x = extra || {};
    if (x.view) p.set('view', x.view);
    liste(a.farben, a.farbe).forEach(function (f) { p.append(FARBFILTER, f); });
    if (a.optikFilter) liste(a.optiken, a.optik).forEach(function (o) { p.append(a.optikFilter, o); });
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

  // Paketrechnung als Zeile unter dem Raumpreis.
  function paketText(a) {
    return a.pakete + (a.pakete === 1 ? ' Paket' : ' Pakete') + ' à ' + qmZahl(a.qmPaket) + ' m² = ' + qmZahl(a.qm) +
      ' m², inkl. ' + zahl((PAKET_VERSCHNITT - 1) * 100, 0) + ' % Verschnitt';
  }

  // "Beige", "Beige oder Grau", "Beige, Grau oder Blau".
  function oderListe(namen) {
    if (namen.length < 2) return namen.join('');
    return namen.slice(0, -1).join(', ') + ' oder ' + namen[namen.length - 1];
  }

  var logik = {
    raumMass: raumMass,
    raumMassInfo: raumMassInfo,
    qmFlaeche: qmFlaeche,
    preisStufen: preisStufen,
    rollenFlaeche: rollenFlaeche,
    stufenBetrag: stufenBetrag,
    betrag: betrag,
    raumAngebot: raumAngebot,
    raumWege: raumWege,
    PAKET_VERSCHNITT: PAKET_VERSCHNITT,
    paketRechnung: paketRechnung,
    paketAngebot: paketAngebot,
    paketText: paketText,
    abPreisQm: abPreisQm,
    preisEintraege: preisEintraege,
    imBudget: imBudget,
    stufenMaximum: stufenMaximum,
    regulaerZuerst: regulaerZuerst,
    kartenSeite: kartenSeite,
    optikNamen: optikNamen,
    optikReihenfolge: optikReihenfolge,
    filterUrl: filterUrl,
    oderListe: oderListe,
    euro: euro,
    meter: meter
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

  function werteVon(liste) { return liste.map(function (x) { return x.value; }); }
  function namenVon(liste) { return liste.map(function (x) { return x.label; }); }
  function enthaelt(liste, wert) { return liste.some(function (x) { return x.value === wert; }); }
  function umschalten(liste, eintrag) {
    if (enthaelt(liste, eintrag.value)) return liste.filter(function (x) { return x.value !== eintrag.value; });
    return liste.concat([eintrag]);
  }
  function qmText(qm) {
    var n = Math.round(qm * 10) / 10;
    return zahl(n, n % 1 ? 1 : 0) + ' m²';
  }
  function stufeText(n) {
    return zahl(n, n % 1 ? 2 : 0) + ' €/m²';
  }
  // Rollenbreite kurz: 400 -> "4", 450 -> "4,50".
  function rolleText(cm) {
    return zahl(cm / 100, cm % 100 ? 2 : 0);
  }

  function Finder(wurzel) {
    this.wurzel = wurzel;
    this.dlg = wurzel.querySelector('[data-bf-dialog]');
    var cfg = {};
    try { cfg = JSON.parse(wurzel.querySelector('script[data-bf-config]').textContent); } catch (e) {}
    this.cfg = cfg;
    this.arten = (cfg.arten || []).filter(Boolean);
    // preis: null (nichts gewaehlt), 'egal' oder Stufe in EUR/m².
    this.s = { art: null, farben: [], optiken: [], zimmer: [], massModus: 'lb', laenge: '', breite: '', flaeche: '', preis: null, herkunft: 'bequem' };
    this.verlauf = [];
    this.aktuell = null;
    this.zaehlNr = 0;
    this.preisNr = 0;
    // Preisliste der Paketware aus preiseZeigen() fuer preiseBetraege().
    this.preisDaten = null;
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
      farben: werteVon(this.s.farben),
      optikFilter: a.optik_filter,
      optiken: werteVon(this.s.optiken),
      raumFilter: a.raum_filter,
      zimmer: werteVon(this.s.zimmer)
    };
  };

  // Preis je m² fuer Filter und Anzeige, null = Preis egal.
  Finder.prototype.budgetQm = function () {
    return typeof this.s.preis === 'number' ? this.s.preis : null;
  };

  // Bodenart, deren Preis je m² der Finder selbst rechnet (Paketware).
  Finder.prototype.rechnet = function () {
    return !!(this.s.art && this.s.art.preis === 'rechnen');
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

  // Raum aus Laenge und Breite (cm) oder null.
  Finder.prototype.raum = function () {
    if (this.s.massModus !== 'lb') return null;
    var l = raumMass(this.s.laenge);
    var b = raumMass(this.s.breite);
    return l && b ? { laenge: l, breite: b } : null;
  };

  // Raumflaeche in m²: aus Laenge x Breite oder direkt eingegeben.
  Finder.prototype.flaeche = function () {
    var r = this.raum();
    if (r) return (r.laenge * r.breite) / 10000;
    return this.s.massModus === 'qm' ? qmFlaeche(this.s.flaeche) : null;
  };

  // Flaeche fuer den ca.-Betrag am Preisrahmen: bei Laenge und Breite mit der
  // Rollenbreite gerundet, sonst die eingegebene Flaeche. Paketware rechnet
  // stufenMaximum() mit ganzen Paketen aus der Raumflaeche.
  Finder.prototype.preisFlaeche = function () {
    var r = this.raum();
    return r ? rollenFlaeche(r.laenge, r.breite) : this.flaeche();
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

  // Filter- und Zaehldaten der Kollektion zu einer Auswahl.
  Finder.prototype.daten = function (auswahl, preisBis) {
    return holen(filterUrl(this.s.art.url, auswahl, { view: 'boden-finder', preisBis: preisBis }));
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

  // Gruene Zeile ueber "Weiter": wie viele passen zur Auswahl bis hier.
  Finder.prototype.zaehlerZeigen = function (schritt) {
    var self = this;
    var ziel = this.q('[data-bf-schritt="' + schritt + '"] [data-bf-zaehler]');
    if (!ziel) return;
    var nr = ++this.zaehlNr;
    var auswahl = schritt === 'farbe' ? { farben: werteVon(this.s.farben) } : this.auswahl();
    var leer = schritt === 'farbe' ? !this.s.farben.length : !this.s.optiken.length && !this.s.zimmer.length;
    if (leer) {
      ziel.textContent = '';
      return;
    }
    var wort = this.s.art.wort || 'Produkte';
    this.daten(auswahl).then(function (d) {
      if (nr !== self.zaehlNr) return;
      ziel.classList.toggle('tp-bf-zaehler--leer', !d.anzahl);
      ziel.textContent = d.anzahl
        ? d.anzahl + ' ' + wort + ' passen zu Ihrer Auswahl.'
        : 'Zu dieser Auswahl haben wir online gerade nichts.';
    }, function () {
      if (nr === self.zaehlNr) ziel.textContent = '';
    });
  };

  // --- Frage 1: Bodenart -------------------------------------------------
  Finder.prototype.zeigeArt = function () {
    var self = this;
    this.qa('[data-bf-art]').forEach(function (k) {
      k.setAttribute('aria-pressed', self.s.art && self.s.art.handle === k.getAttribute('data-bf-art') ? 'true' : 'false');
    });
  };

  // --- Frage 2: Farbe (mehrere moeglich) ---------------------------------
  Finder.prototype.zeigeFarbe = function () {
    var self = this;
    var ziel = this.q('[data-bf-farben]');
    var weiterKnopf = this.q('[data-bf-weiter="farbe"]');
    ziel.setAttribute('aria-busy', 'true');
    ziel.textContent = '';
    weiterKnopf.disabled = !this.s.farben.length;
    this.daten({}).then(function (daten) {
      ziel.removeAttribute('aria-busy');
      var f = daten.filter[FARBFILTER];
      var werte = f ? f.werte.filter(function (w) { return w.count > 0; }) : [];
      if (!werte.length) {
        // Bodenart ohne Farbfilter: Frage ueberspringen.
        self.s.farben = [];
        self.zeige('optik');
        return;
      }
      self.s.farben = self.s.farben.filter(function (x) { return werte.some(function (w) { return w.value === x.value; }); });
      werte.forEach(function (w) {
        var knopf = el('button', 'tp-bf-farbe');
        knopf.type = 'button';
        knopf.setAttribute('aria-pressed', enthaelt(self.s.farben, w.value) ? 'true' : 'false');
        var feld = el('span', 'tp-bf-farbe__feld');
        if (w.bild) feld.style.backgroundImage = 'url("' + w.bild + '")';
        else if (w.farbe) feld.style.background = w.farbe;
        if (/^weiß|^weiss|^creme/i.test(w.label)) feld.classList.add('tp-bf-farbe__feld--hell');
        knopf.appendChild(feld);
        knopf.appendChild(el('span', 'tp-bf-farbe__name', w.label));
        knopf.appendChild(el('span', 'tp-bf-farbe__zahl', '(' + w.count + ')'));
        knopf.setAttribute('aria-label', w.label + ', ' + w.count + ' ' + (self.s.art.wort || 'Produkte'));
        knopf.addEventListener('click', function () {
          self.s.farben = umschalten(self.s.farben, { value: w.value, label: w.label });
          knopf.setAttribute('aria-pressed', enthaelt(self.s.farben, w.value) ? 'true' : 'false');
          weiterKnopf.disabled = !self.s.farben.length;
          self.zaehlerZeigen('farbe');
        });
        ziel.appendChild(knopf);
      });
      weiterKnopf.disabled = !self.s.farben.length;
      self.zaehlerZeigen('farbe');
    }, function () {
      self.fehlerZeigen(ziel, function () { self.zeigeFarbe(); });
    });
  };

  // --- Frage 3: Optik (mehrere moeglich) und optional Raum ---------------
  Finder.prototype.zeigeOptik = function () {
    var self = this;
    var art = this.s.art;
    var ziel = this.q('[data-bf-optiken]');
    var zimmerBox = this.q('[data-bf-zimmer-box]');
    var zimmerZiel = this.q('[data-bf-zimmer]');
    var weiterKnopf = this.q('[data-bf-weiter="optik"]');
    this.q('[data-bf-optik-frage]').textContent = art.optik_frage || 'Welche Optik soll es sein?';
    this.q('[data-bf-zimmer-frage]').textContent = art.raum_frage || 'Für welchen Raum?';
    ziel.setAttribute('aria-busy', 'true');
    ziel.textContent = '';
    zimmerZiel.textContent = '';
    weiterKnopf.disabled = !this.s.optiken.length;
    // Zaehlen nur mit den Farben: die Optik-Zahlen sollen nicht von der
    // eigenen Auswahl abhaengen, die Raum-Zahlen nicht vom Raum.
    this.daten({ farben: werteVon(this.s.farben) }).then(function (daten) {
      ziel.removeAttribute('aria-busy');
      var namen = optikNamen(art.optik_namen);
      var f = daten.filter[art.optik_filter];
      var werte = optikReihenfolge(f ? f.werte.filter(function (w) { return w.count > 0; }) : [], namen);
      var r = art.raum_filter && daten.filter[art.raum_filter];
      var zimmer = r ? r.werte.filter(function (w) { return w.count > 0; }) : [];
      self.s.zimmerName = (r && r.label) || 'Raum';
      // Gewaehlte Werte, die es zu den Farben nicht gibt, fallen weg.
      self.s.optiken = self.s.optiken.filter(function (x) { return werte.some(function (w) { return w.value === x.value; }); });
      self.s.zimmer = self.s.zimmer.filter(function (x) { return zimmer.some(function (w) { return w.value === x.value; }); });
      if (!werte.length) {
        self.zeige('budget');
        return;
      }
      ziel.classList.toggle('tp-bf-optiken--vier', werte.length === 4);
      werte.forEach(function (w, i) {
        var n = namen[w.label.trim().toLowerCase()] || { name: w.label, text: '', stufe: i + 1 };
        var knopf = el('button', 'tp-bf-optik');
        knopf.type = 'button';
        knopf.setAttribute('aria-pressed', enthaelt(self.s.optiken, w.value) ? 'true' : 'false');
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
          self.s.optiken = umschalten(self.s.optiken, { value: w.value, label: n.name || w.label });
          knopf.setAttribute('aria-pressed', enthaelt(self.s.optiken, w.value) ? 'true' : 'false');
          weiterKnopf.disabled = !self.s.optiken.length;
          self.zaehlerZeigen('optik');
        });
        ziel.appendChild(knopf);
      });
      weiterKnopf.disabled = !self.s.optiken.length;
      zimmerBox.hidden = !zimmer.length;
      zimmer.forEach(function (w) {
        var chip = el('button', 'tp-bf-chip', w.label);
        chip.type = 'button';
        chip.setAttribute('aria-pressed', enthaelt(self.s.zimmer, w.value) ? 'true' : 'false');
        chip.addEventListener('click', function () {
          self.s.zimmer = umschalten(self.s.zimmer, { value: w.value, label: w.label });
          chip.setAttribute('aria-pressed', enthaelt(self.s.zimmer, w.value) ? 'true' : 'false');
          self.zaehlerZeigen('optik');
        });
        zimmerZiel.appendChild(chip);
      });
      self.zaehlerZeigen('optik');
    }, function () {
      self.fehlerZeigen(ziel, function () { self.zeigeOptik(); });
    });
  };

  // --- Frage 4: Raum und Preis -------------------------------------------
  Finder.prototype.zeigeBudget = function () {
    this.q('[data-bf-laenge]').value = this.s.laenge;
    this.q('[data-bf-breite]').value = this.s.breite;
    this.q('[data-bf-flaeche]').value = this.s.flaeche;
    this.massModusSetzen(this.s.massModus);
    this.massAktualisieren();
    this.preiseZeigen();
  };

  Finder.prototype.massModusSetzen = function (modus) {
    this.s.massModus = modus;
    this.qa('[data-bf-feld]').forEach(function (f) { f.hidden = f.getAttribute('data-bf-feld') !== modus; });
    this.q('[data-bf-massmodus]').textContent = modus === 'qm'
      ? 'Lieber Länge und Breite angeben'
      : 'Nur die Fläche bekannt? In m² angeben';
  };

  // Einheit neben dem Feld (m oder cm, wie erkannt), Raumflaeche und die
  // ca.-Betraege am Preisrahmen.
  Finder.prototype.massAktualisieren = function () {
    var self = this;
    ['laenge', 'breite'].forEach(function (name) {
      var info = raumMassInfo(self.s[name]);
      self.q('[data-bf-einheit="' + name + '"]').textContent = info ? info.einheit : 'm';
    });
    var ziel = this.q('[data-bf-umrechnung]');
    ziel.classList.remove('tp-bf-umrechnung--fehler');
    var r = this.raum();
    ziel.textContent = r ? 'Ihr Raum: ' + meter(r.laenge) + ' × ' + meter(r.breite) + ' m = ' + qmText((r.laenge * r.breite) / 10000) : '';
    this.preiseBetraege();
  };

  Finder.prototype.massPruefen = function () {
    var meldung = '';
    if (this.s.massModus === 'lb') {
      var l = String(this.s.laenge).trim();
      var b = String(this.s.breite).trim();
      if ((l || b) && !this.raum()) {
        meldung = !l || !b
          ? 'Bitte Länge und Breite angeben – oder beide Felder leer lassen.'
          : 'Bitte die Maße in Metern (z. B. 4,5) oder Zentimetern (z. B. 450) angeben.';
      }
    } else if (String(this.s.flaeche).trim() && !qmFlaeche(this.s.flaeche)) {
      meldung = 'Bitte die Fläche als Zahl in m² angeben, z. B. 18.';
    }
    if (meldung) {
      var ziel = this.q('[data-bf-umrechnung]');
      ziel.textContent = meldung;
      ziel.classList.add('tp-bf-umrechnung--fehler');
    }
    return !meldung;
  };

  // Preisrahmen: Stufen je m² mit Trefferzahl. Angeboten werden nur Stufen,
  // die etwas, aber nicht schon alles enthalten; dazu immer "Preis egal".
  // Gezaehlt wird mit dem Shopify-Preisfilter, bei Paketware aus der
  // Preisliste (Preis je m² statt Paketpreis).
  Finder.prototype.preiseZeigen = function () {
    var self = this;
    var art = this.s.art;
    var ziel = this.q('[data-bf-preise]');
    var stufen = preisStufen(art.preis_stufen || '20, 30, 45, 70');
    var auswahl = this.auswahl();
    var nr = ++this.preisNr;
    ziel.setAttribute('aria-busy', 'true');
    ziel.textContent = '';
    this.preisDaten = null;
    var zaehlen = this.rechnet()
      ? this.preisListe().then(function (d) {
        if (nr === self.preisNr) self.preisDaten = d.liste;
        return [d.anzahl].concat(stufen.map(function (st) { return imBudget(d.liste, st).length; }));
      })
      : Promise.all([this.daten(auswahl)].concat(stufen.map(function (st) { return self.daten(auswahl, st); })))
        .then(function (antworten) { return antworten.map(function (d) { return d.anzahl; }); });
    zaehlen.then(function (zahlen) {
      if (nr !== self.preisNr) return;
      ziel.removeAttribute('aria-busy');
      var gesamt = zahlen[0];
      var wort = art.wort || 'Produkte';
      var karten = [];
      stufen.forEach(function (st, i) {
        var n = zahlen[i + 1];
        if (n > 0 && n < gesamt) karten.push({ stufe: st, anzahl: n });
      });
      if (typeof self.s.preis === 'number' && !karten.some(function (k) { return k.stufe === self.s.preis; })) self.s.preis = null;
      karten.push({ stufe: 'egal', anzahl: gesamt });
      karten.forEach(function (k) {
        var knopf = el('button', 'tp-bf-preis');
        knopf.type = 'button';
        knopf.setAttribute('data-bf-stufe', String(k.stufe));
        knopf.setAttribute('aria-pressed', self.s.preis === k.stufe ? 'true' : 'false');
        knopf.appendChild(el('span', 'tp-bf-preis__stufe', k.stufe === 'egal' ? 'Preis egal' : 'bis ' + stufeText(k.stufe)));
        knopf.appendChild(el('span', 'tp-bf-preis__raum'));
        knopf.appendChild(el('span', 'tp-bf-preis__zahl', (k.stufe === 'egal' ? 'alle ' : '') + k.anzahl + ' ' + wort));
        knopf.addEventListener('click', function () {
          self.s.preis = self.s.preis === k.stufe ? null : k.stufe;
          ziel.querySelectorAll('.tp-bf-preis').forEach(function (x) {
            x.setAttribute('aria-pressed', x === knopf && self.s.preis !== null ? 'true' : 'false');
          });
        });
        ziel.appendChild(knopf);
      });
      self.preiseBetraege();
    }, function () {
      if (nr === self.preisNr) self.fehlerZeigen(ziel, function () { self.preiseZeigen(); });
    });
  };

  // ca.-Betrag fuer den Raum je Preisstufe, sobald die Raumgroesse bekannt ist.
  // Paketware: der teuerste Raumpreis der Stufe aus der Preisliste.
  Finder.prototype.preiseBetraege = function () {
    var qm = this.preisFlaeche();
    var paket = this.rechnet();
    var liste = this.preisDaten;
    var flaeche = this.flaeche();
    var raum = this.raum();
    this.qa('.tp-bf-preis').forEach(function (k) {
      var stufe = Number(k.getAttribute('data-bf-stufe'));
      var b = null;
      if (stufe > 0) b = paket ? stufenMaximum(liste, stufe, flaeche, qm, raum) : stufenBetrag(stufe, qm);
      var ziel = k.querySelector('.tp-bf-preis__raum');
      ziel.textContent = b ? 'Ihr Raum: bis ca. ' + euro(b) : '';
      ziel.hidden = !b;
    });
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
      this.ergebnisGerechnet(qmBudget).catch(function () {
        ziel.removeAttribute('aria-busy');
        status.textContent = '';
        self.fehlerZeigen(ziel, function () { self.zeigeErgebnis(); });
      });
      return;
    }
    holen(filterUrl(art.url, auswahl, { view: 'boden-finder-treffer', preisBis: qmBudget })).then(function (daten) {
      // Regulaere Ware vor Auslaufkollektionen, sonst Shop-Reihenfolge.
      var zeigen = daten.produkte.filter(function (p) { return !p.auslauf; })
        .concat(daten.produkte.filter(function (p) { return p.auslauf; }))
        .slice(0, 3);
      if (daten.anzahl > zeigen.length) {
        alle.href = filterUrl(art.url, auswahl, { preisBis: qmBudget });
        alle.textContent = 'Alle ' + daten.anzahl + ' Treffer ansehen' + (qmBudget ? ' (bis ' + stufeText(qmBudget) + ')' : '');
        alle.hidden = false;
      }
      if (zeigen.length) {
        status.textContent = self.statusText(daten.anzahl, zeigen.length, qmBudget);
        self.kartenZeigen(ziel, zeigen, daten, false);
        sonder.hidden = zeigen.length >= 3 || !qmBudget;
        self.ergebnisMelden(daten.anzahl, zeigen.length);
        return null;
      }
      // Nichts im Preisrahmen: zuerst der Laden (Reste, Sonderposten), dann
      // die guenstigsten Treffer ohne Preisgrenze.
      sonder.hidden = false;
      status.before(sonder);
      titel.textContent = 'In Ihrem Preisrahmen ist online nichts dabei';
      return holen(filterUrl(art.url, auswahl, { view: 'boden-finder-treffer', sort: 'price-ascending' })).then(function (ohne) {
        var guenstig = ohne.produkte.slice(0, 3);
        var ab = '';
        var erstes = guenstig[0];
        var angebot = erstes && raum ? raumAngebot(erstes, raum.laenge, raum.breite) : null;
        if (angebot) ab = ' – für Ihren Raum ab ca. ' + euro(angebot.betrag);
        else if (erstes && abPreisQm(erstes)) ab = ' – ab ' + euro(abPreisQm(erstes)) + '/m²';
        status.textContent = guenstig.length
          ? 'Online liegen die günstigsten passenden ' + (art.wort || 'Produkte') + ' darüber' + ab + ':'
          : 'Zu Ihrer Auswahl haben wir online gerade nichts.';
        self.kartenZeigen(ziel, guenstig, ohne, true);
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

  // Ergebnis mit Preisstufe fuer Paketware: Die Preisliste entscheidet, was
  // in die Stufe passt; die Karten kommen von den Seiten der Treffer-Ansicht,
  // auf denen diese Produkte stehen (gleiche Filter, gleiche Reihenfolge).
  // Die Kategorie selbst kann nicht nach Preis je m² filtern - weitere
  // Treffer zeigt deshalb der Knopf "Weitere Vorschlaege" hier im Finder.
  Finder.prototype.ergebnisGerechnet = function (qmBudget) {
    var self = this;
    var art = this.s.art;
    var wort = art.wort || 'Produkte';
    var ziel = this.q('[data-bf-treffer]');
    var status = this.q('[data-bf-status]');
    var alle = this.q('[data-bf-alle]');
    var sonder = this.q('[data-bf-sonder]');
    var titel = this.q('[data-bf-ergebnis-titel]');
    var auswahl = this.auswahl();
    var trefferUrl = function (seite) { return filterUrl(art.url, auswahl, { view: 'boden-finder-treffer', seite: seite }); };
    return Promise.all([this.preisListe(), holen(trefferUrl(1))]).then(function (r) {
      var anzahl = r[0].anzahl;
      var liste = r[0].liste;
      var proSeite = r[1].pro_seite || 8;
      var passend = regulaerZuerst(imBudget(liste, qmBudget), function (e) { return e.auslauf; });
      // Die Kategorie zeigt alle Treffer der Auswahl, ohne Preisgrenze.
      var linkZeigen = function (gezeigt) {
        if (anzahl <= gezeigt) return;
        alle.href = filterUrl(art.url, auswahl, {});
        alle.textContent = 'Alle ' + anzahl + ' ' + wort + ' in Ihrer Auswahl ansehen (ohne Preisgrenze)';
        alle.hidden = false;
      };
      return self.kartenLaden(passend, 0, proSeite, trefferUrl).then(function (gefunden) {
        if (gefunden.zeigen.length) {
          status.textContent = passend.length <= gefunden.zeigen.length
            ? 'Passend zu Ihren Angaben bis ' + stufeText(qmBudget) + ':'
            : passend.length + ' ' + wort + ' passen bis ' + stufeText(qmBudget) + '. Hier die ersten ' + gefunden.zeigen.length + ':';
          self.kartenZeigen(ziel, gefunden.zeigen, gefunden, false);
          self.mehrAnbieten(passend, gefunden.naechster, proSeite, trefferUrl);
          linkZeigen(passend.length);
          sonder.hidden = gefunden.zeigen.length >= 3;
          self.ergebnisMelden(passend.length, gefunden.zeigen.length);
          return null;
        }
        // Nichts im Preisrahmen: der Laden zuerst, dann die guenstigsten je m².
        sonder.hidden = false;
        status.before(sonder);
        titel.textContent = 'In Ihrem Preisrahmen ist online nichts dabei';
        var guenstig = liste.filter(function (e) { return e.qm > 0; })
          .sort(function (x, y) { return x.qm - y.qm || x.pos - y.pos; });
        return self.kartenLaden(guenstig, 0, proSeite, trefferUrl).then(function (ohne) {
          status.textContent = ohne.zeigen.length
            ? 'Online liegen die günstigsten passenden ' + wort + ' darüber' + self.abText(ohne.zeigen[0]) + ':'
            : 'Zu Ihrer Auswahl haben wir online gerade nichts.';
          self.kartenZeigen(ziel, ohne.zeigen, ohne, true);
          linkZeigen(ohne.zeigen.length);
          self.ergebnisMelden(0, ohne.zeigen.length);
        });
      });
    });
  };

  // " – für Ihren Raum ab ca. 359 €" oder " – ab 16 €/m²" zum guenstigsten
  // Vorschlag ueber dem Preisrahmen.
  Finder.prototype.abText = function (p) {
    var raum = this.raum();
    var qm = this.flaeche();
    var a = qm ? paketAngebot(p, qm) : null;
    if (!a && raum) a = raumAngebot(p, raum.laenge, raum.breite);
    if (a) return ' – für Ihren Raum ab ca. ' + euro(a.betrag);
    return abPreisQm(p) ? ' – ab ' + euro(abPreisQm(p)) + '/m²' : '';
  };

  // "Weitere Vorschlaege": die naechsten drei Treffer anhaengen.
  Finder.prototype.mehrAnbieten = function (eintraege, ab, proSeite, url) {
    var self = this;
    var mehr = this.q('[data-bf-mehr]');
    var ziel = this.q('[data-bf-treffer]');
    mehr.hidden = ab >= eintraege.length;
    mehr.onclick = function () {
      mehr.disabled = true;
      self.kartenLaden(eintraege, ab, proSeite, url).then(function (weitere) {
        mehr.disabled = false;
        var erste = ziel.children.length;
        self.kartenZeigen(ziel, weitere.zeigen, weitere, false, true);
        // Fokus auf die erste neue Karte: die Links der Karte sind
        // display: contents und damit nicht fokussierbar.
        var neu = ziel.children[erste];
        if (neu) {
          neu.setAttribute('tabindex', '-1');
          neu.focus({ preventScroll: true });
          neu.scrollIntoView({ block: 'nearest', inline: 'start' });
        }
        self.mehrAnbieten(eintraege, weitere.naechster, proSeite, url);
      }, function () {
        mehr.disabled = false;
      });
    };
  };

  // Bis zu drei Produkte fuer die Eintraege der Preisliste ab Stelle start,
  // in deren Reihenfolge. Laedt nur die Seiten der Treffer-Ansicht, auf denen
  // sie stehen. Fehlt ein Produkt auf seiner Seite (Daten zwischendurch
  // geaendert), rueckt der naechste nach; hoechstens vier Runden.
  // naechster = erster noch nicht gepruefter Eintrag.
  Finder.prototype.kartenLaden = function (eintraege, start, proSeite, url) {
    var zeigen = [];
    var karten = {};
    var produkte = {};
    var i = start;
    var runden = 0;
    function runde() {
      var stapel = eintraege.slice(i, i + 3 - zeigen.length);
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
        stapel.forEach(function (e) {
          i++;
          if (produkte[e.handle] && karten[e.handle]) zeigen.push(produkte[e.handle]);
        });
        if (zeigen.length < 3 && i < eintraege.length && runden < 4) return runde();
        return { zeigen: zeigen, karten: karten, naechster: i };
      });
    }
    return i < eintraege.length ? runde() : Promise.resolve({ zeigen: zeigen, karten: karten, naechster: i });
  };

  Finder.prototype.statusText = function (anzahl, gezeigt, qmBudget) {
    var wort = this.s.art.wort || 'Produkte';
    var budget = qmBudget ? ' bis ' + stufeText(qmBudget) : '';
    if (anzahl <= gezeigt) return 'Passend zu Ihren Angaben' + budget + ':';
    return anzahl + ' ' + wort + ' passen' + budget + '. Hier die ersten ' + gezeigt + ' – alle finden Sie über den Link darunter.';
  };

  Finder.prototype.ergebnisMelden = function (anzahl, gezeigt) {
    melden('tp_finder_ergebnis', {
      art: this.s.art.handle,
      farbe: namenVon(this.s.farben).join(', '),
      optik: namenVon(this.s.optiken).join(', '),
      budget_modus: this.budgetQm() ? 'qm' : 'ohne',
      raum_angabe: this.raum() ? 'masse' : (this.flaeche() ? 'flaeche' : 'keine'),
      treffer: anzahl,
      gezeigt: gezeigt
    });
  };

  // anhaengen: weitere Karten hinter die vorhandenen ("Weitere Vorschlaege").
  Finder.prototype.kartenZeigen = function (ziel, produkte, daten, ueber, anhaengen) {
    var self = this;
    if (!anhaengen) {
      ziel.textContent = '';
      this.gezeigt = [];
    }
    ziel.removeAttribute('aria-busy');
    produkte.forEach(function (p) {
      var vorlage = daten.karten[p.handle];
      if (!vorlage) return;
      self.gezeigt.push(p.titel);
      var item = el('div', 'tp-bf-treffer__item');
      item.appendChild(document.importNode(vorlage, true));
      var box = self.raumpreisBox(p);
      if (box) item.appendChild(box);
      ziel.appendChild(item);
    });
    ziel.classList.toggle('tp-bf-treffer--ueber', !!ueber);
    this.waLinks();
  };

  // Preis fuer den Raum unter der Karte. Mit Laenge und Breite beide
  // Zuschnittarten, die guenstigere zuerst: genau zugeschnitten (Raummass)
  // und von der Rolle (volle Rollenbreite, der Rest ist Verschnitt). Nur mit
  // der Flaeche: ab-Preis ohne Verschnitt. Paketware: ganze Pakete wie im
  // Paketrechner, mit Laenge und Breite oder nur der Flaeche.
  Finder.prototype.raumpreisBox = function (p) {
    var raum = this.raum();
    var box = el('div', 'tp-bf-raumpreis');
    function zeile(name, wie, betrag, best) {
      var z = el('div', 'tp-bf-raumpreis__zeile' + (best ? ' tp-bf-raumpreis__zeile--best' : ''));
      z.appendChild(el('span', 'tp-bf-raumpreis__name', name));
      z.appendChild(el('strong', 'tp-bf-raumpreis__betrag', betrag));
      if (wie) z.appendChild(el('span', 'tp-bf-raumpreis__wie', wie));
      box.appendChild(z);
    }
    if (Number(p.qm_paket) > 0) {
      var qmRaum = this.flaeche();
      var pa = qmRaum ? paketAngebot(p, qmRaum) : null;
      if (!pa) return null;
      box.appendChild(el('p', 'tp-bf-raumpreis__kopf', raum ? 'Für Ihren Raum ' + meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m' : 'Für ca. ' + qmText(qmRaum)));
      zeile('In ganzen Paketen', paketText(pa), 'ca. ' + euro(pa.betrag), false);
      return box;
    }
    if (raum) {
      var wege = raumWege(p, raum.laenge, raum.breite);
      var liste = [wege.raummass, wege.meterware].filter(Boolean).sort(function (x, y) { return x.betrag - y.betrag; });
      if (!liste.length) return null;
      box.appendChild(el('p', 'tp-bf-raumpreis__kopf', 'Für Ihren Raum ' + meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m'));
      liste.forEach(function (w, i) {
        var best = i === 0 && liste.length > 1;
        if (w.naht) {
          zeile(w.bahnen + ' Bahnen mit Naht', 'je ' + rolleText(w.rolle) + ' m breit – bitte beraten lassen', 'ca. ' + euro(w.betrag), best);
        } else if (w.art === 'raummass') {
          zeile('Genau zugeschnitten', meter(w.quer) + ' × ' + meter(w.laenge) + ' m', 'ca. ' + euro(w.betrag), best);
        } else {
          var rest = w.rolle - w.quer;
          zeile('Von der Rolle', meter(w.rolle) + ' × ' + meter(w.laenge) + ' m' + (rest > 0 ? ' – ' + rest + ' cm Verschnitt' : ''), 'ca. ' + euro(w.betrag), best);
        }
      });
      return box;
    }
    var qm = this.flaeche();
    var ab = abPreisQm(p);
    if (!qm || !ab) return null;
    box.appendChild(el('p', 'tp-bf-raumpreis__kopf', 'Für ca. ' + qmText(qm)));
    zeile('Von der Rolle', 'zzgl. Verschnitt – genauer mit Länge und Breite', 'ab ca. ' + euro(ab * qm), false);
    return box;
  };

  Finder.prototype.zusammenfassungZeigen = function () {
    var self = this;
    var ziel = this.q('[data-bf-auswahl]');
    ziel.textContent = '';
    var eintraege = [];
    if (this.s.art && !this.cfg.vorwahl) eintraege.push([this.s.art.titel, 'art']);
    eintraege.push([this.s.farben.length ? namenVon(this.s.farben).join(', ') : 'jede Farbe', 'farbe']);
    eintraege.push([this.s.optiken.length ? namenVon(this.s.optiken).join(', ') : 'jede Optik', 'optik']);
    if (this.s.zimmer.length) eintraege.push([namenVon(this.s.zimmer).join(', '), 'optik']);
    if (this.raumText()) eintraege.push(['Raum ' + this.raumText(), 'budget']);
    eintraege.push([this.preisText() || 'Preis egal', 'budget']);
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

  // "4,50 × 3,20 m" oder "ca. 18 m²"; leer ohne Raumgroesse.
  Finder.prototype.raumText = function () {
    var raum = this.raum();
    if (raum) return meter(raum.laenge) + ' × ' + meter(raum.breite) + ' m';
    var qm = this.flaeche();
    return qm ? 'ca. ' + qmText(qm) : '';
  };

  Finder.prototype.preisText = function () {
    var q = this.budgetQm();
    return q ? 'bis ' + stufeText(q) : '';
  };

  // Text fuer E-Mail und WhatsApp: alles, was der Kunde angegeben hat.
  Finder.prototype.zusammenfassung = function () {
    var z = [];
    if (this.s.art) z.push('Bodenart: ' + this.s.art.titel);
    z.push('Farbe: ' + (this.s.farben.length ? oderListe(namenVon(this.s.farben)) : 'egal'));
    z.push('Optik: ' + (this.s.optiken.length ? oderListe(namenVon(this.s.optiken)) : 'egal'));
    if (this.s.zimmer.length) z.push((this.s.zimmerName || 'Raum') + ': ' + namenVon(this.s.zimmer).join(', '));
    if (this.raumText()) z.push('Raumgröße: ' + this.raumText());
    z.push('Preis: ' + (this.preisText() || 'egal'));
    if (this.gezeigt && this.gezeigt.length) z.push('Im Finder gezeigt: ' + this.gezeigt.join('; '));
    return z.join('\n');
  };

  Finder.prototype.waText = function (herkunft) {
    var text = 'Hallo, ich suche ' + (this.s.art ? this.s.art.titel : 'einen Boden');
    if (this.s.farben.length) text += ' in ' + oderListe(namenVon(this.s.farben));
    if (this.s.optiken.length) text += ', ' + oderListe(namenVon(this.s.optiken));
    if (this.raum()) text += ' für einen Raum von ca. ' + this.raumText();
    else if (this.raumText()) text += ' für ' + this.raumText();
    if (this.preisText()) text += ', ' + this.preisText();
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
    if (this.raumText() && !masse.value) masse.value = this.raumText();
    var hinweis = this.q('[data-bf-uebernahme]');
    var hatAngaben = this.s.art && (this.s.farben.length || this.s.optiken.length || this.preisText() || this.raumText());
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
          self.s.farben = [];
          self.s.optiken = [];
          self.s.zimmer = [];
          self.s.preis = null;
        }
        self.s.art = art;
        self.weiter('farbe');
      });
    });
    this.q('[data-bf-egal="farbe"]').addEventListener('click', function () {
      self.s.farben = [];
      self.weiter('optik');
    });
    this.q('[data-bf-weiter="farbe"]').addEventListener('click', function () { self.weiter('optik'); });
    this.q('[data-bf-egal="optik"]').addEventListener('click', function () {
      self.s.optiken = [];
      self.weiter('budget');
    });
    this.q('[data-bf-weiter="optik"]').addEventListener('click', function () { self.weiter('budget'); });

    var felder = { laenge: '[data-bf-laenge]', breite: '[data-bf-breite]', flaeche: '[data-bf-flaeche]' };
    Object.keys(felder).forEach(function (name) {
      var feld = self.q(felder[name]);
      feld.addEventListener('input', function () {
        self.s[name] = feld.value;
        self.massAktualisieren();
      });
      feld.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); self.q('[data-bf-zeigen]').click(); }
      });
    });
    this.q('[data-bf-massmodus]').addEventListener('click', function () {
      self.massModusSetzen(self.s.massModus === 'qm' ? 'lb' : 'qm');
      self.massAktualisieren();
      self.q(self.s.massModus === 'qm' ? '[data-bf-flaeche]' : '[data-bf-laenge]').focus();
    });
    this.q('[data-bf-zeigen]').addEventListener('click', function () {
      if (!self.massPruefen()) return;
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
