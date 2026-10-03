/*
  Raummass-Helfer auf der Produktseite (2026-10-02).

  Zwei kleine Helfer, die vor die bestehenden, getesteten Rechner gesetzt
  werden und nur deren Eingabefelder befuellen - sie rechnen keine Preise
  und legen nichts in den Warenkorb:

  - Rollenware (snippets/tp-raummass-rolle.liquid, im Block
    tp-rollware-rechner): Raumbreite und Raumlaenge eingeben, der Helfer
    schlaegt ein Bestellmass mit Zugabe vor (empfohlen) und eines
    zentimetergenau ohne Zugabe. "Uebernehmen" setzt Art, Rollenbreite bzw.
    Raumbreite und Laenge im Rechner.
  - Paketware (snippets/tp-raummass-paket.liquid, im Block paket-auswahl):
    mehrere Raeume (oder Teilflaechen) als Breite x Laenge, Summe in m²,
    "Uebernehmen" schreibt die Summe in das Flaechenfeld.

  Regeln:
  - Zugabe 10 cm je gemessener Seite - die untere Grenze der Spanne aus
    content/ratgeber/teppichboden/teppichboden-richtig-ausmessen.html. Bei
    Meterware kommt die Breite von der Rolle, die Zugabe gilt dort nur der
    Laenge.
  - Meterware: jede Rolle, jede der zwei Ausrichtungen; quer muss in die
    Rolle passen.
  - Empfohlen wird das guenstigste Stueck mit Zugabe, ueber die echten
    Variantenpreise der gewaehlten Farbe (Preisabfrage root.tpRwcPreis im
    Rollenware-Rechner, gleiche Abrechnung wie die Preisbox). Raummass lohnt
    sich nur, wenn (Breite + Zugabe) x Raummass-Preis unter Rollenbreite x
    Meterware-Preis liegt - bei schmalen Raeumen, nicht bei breiten.
  - Raummass: nur wenn die Farbe es anbietet; quer <= maxRaum (groesste Rolle
    minus Zuschnitt-Zugabe, kommt aus TPRollwareArt). Quer ist die kuerzere
    Seite, die noch passt.
  - Passt nichts in eine Bahn: keine Uebernahme, Hinweis auf Naht/Beratung.

  Reine Funktionen oben (Tests: qa/tests/raummass.test.mjs), DOM unten.
*/
(function (root) {
  'use strict';

  var ZUGABE_CM = 10;
  var MIN_CM = 50;
  var MAX_CM = 5000;

  // "350", "350 cm", "3,5 m", "3.5m" -> cm (ganze Zahl). Ohne Einheit gilt:
  // bis 20 sind Meter (niemand misst einen Raum mit 12 cm), sonst cm.
  function leseCm(text) {
    var s = String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, '');
    if (s === '') return { cm: 0, leer: true };
    var m = s.match(/^(\d+(?:[.,]\d+)?)(cm|m)?$/);
    if (!m) return { cm: 0, fehler: true };
    var n = parseFloat(m[1].replace(',', '.'));
    var einheit = m[2] || (n <= 20 ? 'm' : 'cm');
    var cm = Math.round(einheit === 'm' ? n * 100 : n);
    if (cm < MIN_CM || cm > MAX_CM) return { cm: cm, fehler: true, bereich: true };
    return { cm: cm };
  }

  function m2(breiteCm, laengeCm) {
    return Math.round(breiteCm * laengeCm / 100) / 100;
  }

  // Alle Meterware-Stuecke fuer Raum b x l: jede Rolle, beide Ausrichtungen,
  // quer muss in die Rolle passen. Zugabe z nur auf die Laenge - die Breite
  // kommt von der Rolle.
  function meterKandidaten(b, l, rollen, z) {
    var out = [];
    (rollen || []).forEach(function (rolle) {
      [[b, l, false], [l, b, true]].forEach(function (o) {
        if (o[0] > rolle) return;
        out.push({ art: 'meter', breite: rolle, laenge: o[1] + z, gedreht: o[2], m2: m2(rolle, o[1] + z) });
      });
    });
    return out;
  }

  // Raummass b x l, Zugabe z auf beide Seiten. Kuerzere Seite quer, wenn sie
  // passt, sonst die laengere. Die Flaeche ist in beiden Lagen gleich.
  // nurGedreht: true/false erzwingt die Lage (Musterrichtung), sonst frei.
  function raummass(b, l, maxRaum, z, nurGedreht) {
    if (!(maxRaum > 0)) return null;
    var kurz = Math.min(b, l);
    var lang = Math.max(b, l);
    var opts = typeof nurGedreht === 'boolean'
      ? [nurGedreht ? [l, b] : [b, l]]
      : [[kurz, lang], [lang, kurz]];
    for (var i = 0; i < opts.length; i++) {
      var quer = opts[i][0] + z;
      if (quer <= maxRaum) {
        var laenge = opts[i][1] + z;
        return { art: 'raum', breite: quer, laenge: laenge, gedreht: opts[i][0] !== b, m2: m2(quer, laenge) };
      }
    }
    return null;
  }

  // Kosten je Stueck: mit Preisabfrage der echte Betrag (0 = gibt es nicht),
  // ohne die Flaeche als Ersatz. Guenstigstes zuerst; bei Gleichstand
  // Meterware (kein Nachschnitt), dann die kleinere Flaeche.
  function bewerte(liste, preis) {
    return liste.filter(Boolean).map(function (k) {
      k.preis = typeof preis === 'function' ? preis(k.art, k.breite, k.laenge) : 0;
      k._kosten = typeof preis === 'function' ? k.preis : k.m2;
      return k;
    }).filter(function (k) { return k._kosten > 0; }).sort(function (x, y) {
      if (Math.abs(x._kosten - y._kosten) > 0.005) return x._kosten - y._kosten;
      if (x.art !== y.art) return x.art === 'meter' ? -1 : 1;
      return x.m2 - y.m2;
    });
  }

  // Raummass lohnt nur, wenn es spuerbar schmaler ist als eine Rolle, die den
  // Raum ohnehin abdeckt. Gibt der Kunde (fast) die volle Rollenbreite an
  // (400 x 500 oder 395 x 500 bei 400er-Rolle), ist Raummass sinnlos und
  // faellt weg (Inhaber 2026-10-02). Toleranz: ZUGABE_CM.
  function raumSinnvoll(k, z, rollen) {
    if (!k || k.art !== 'raum') return true;
    var quer = k.breite - z;
    return !(rollen || []).some(function (r) { return r >= quer && r <= k.breite + ZUGABE_CM; });
  }
  function nurSinnvoll(liste, z, rollen) {
    return liste.filter(function (k) { return raumSinnvoll(k, z, rollen); });
  }

  // Dasselbe Meterware-Stueck aus schmaleren Rollen: n Bahnen nebeneinander,
  // ohne mehr Material als das eine Stueck. Bestellt wird die schmale Rolle
  // in n-facher Laenge. Leichter zu tragen, dafuer mit Naht.
  function teilung(k, b, l, rollen, preis) {
    if (!k || k.art !== 'meter') return null;
    var quer = k.gedreht ? l : b;
    var schmal = (rollen || []).filter(function (w) { return w < k.breite; }).sort(function (x, y) { return y - x; });
    for (var i = 0; i < schmal.length; i++) {
      var w = schmal[i];
      var n = Math.ceil(quer / w);
      if (n >= 2 && n * w <= k.breite) {
        var t = { art: 'meter', breite: w, laenge: n * k.laenge, bahnen: n, bahnLaenge: k.laenge,
          gedreht: k.gedreht, m2: m2(w, n * k.laenge) };
        t.preis = typeof preis === 'function' ? preis('meter', t.breite, t.laenge) : 0;
        if (typeof preis === 'function' && !(t.preis > 0)) continue;
        return t;
      }
    }
    return null;
  }

  // Raum breiter als jede Rolle: guenstigste Loesung aus 2 Stuecken
  // nebeneinander (Inhaber 2026-10-03). Breiten duerfen verschieden sein
  // (400 + 200), bei gleichem Preis gewinnen gleiche Breiten - verschiedene
  // Rollen koennen aus verschiedenen Chargen kommen (Farbabweichung).
  // nurGedreht: true/false erzwingt die Lage (Dielenrichtung), sonst beide.
  // -> { stuecke: [{breite, laenge}, ...], gedreht, gemischt, m2, preis }
  function zweiStuecke(b, l, rollen, z, preis, nurGedreht) {
    var lagen = typeof nurGedreht === 'boolean' ? [nurGedreht] : [false, true];
    var best = null;
    var liste = (rollen || []).filter(function (w) { return w > 0; }).sort(function (x, y) { return y - x; });
    lagen.forEach(function (gedreht) {
      var quer = gedreht ? l : b;
      var entlang = (gedreht ? b : l) + z;
      for (var i = 0; i < liste.length; i++) {
        for (var j = i; j < liste.length; j++) {
          var w1 = liste[i], w2 = liste[j];
          if (w1 >= quer) continue;            // passt schon in ein Stueck
          if (w1 + w2 < quer) continue;
          var p1 = typeof preis === 'function' ? preis('meter', w1, entlang) : m2(w1, entlang);
          var p2 = typeof preis === 'function' ? preis('meter', w2, entlang) : m2(w2, entlang);
          if (!(p1 > 0) || !(p2 > 0)) continue;
          var k = {
            stuecke: [{ art: 'meter', breite: w1, laenge: entlang }, { art: 'meter', breite: w2, laenge: entlang }],
            gedreht: gedreht, gemischt: w1 !== w2, m2: m2(w1 + w2, entlang),
            preis: typeof preis === 'function' ? Math.round((p1 + p2) * 100) / 100 : 0,
            _k: p1 + p2
          };
          if (!best || k._k < best._k - 0.005 || (Math.abs(k._k - best._k) <= 0.005 && best.gemischt && !k.gemischt)) best = k;
        }
      }
    });
    if (best) {
      delete best._k;
      best.stuecke.forEach(function (st) { st.gedreht = best.gedreht; st.m2 = m2(st.breite, st.laenge); });
    }
    return best;
  }

  // Dielenrichtung, solange der Kunde nichts waehlt: entlang der laengeren
  // Raumseite - dann liegt die kuerzere quer und es reicht am ehesten ein Stueck.
  function autoRichtung(b, l) {
    return l >= b ? 'laenge' : 'breite';
  }

  function gleich(x, y) {
    return !!(x && y && x.art === y.art && x.breite === y.breite && x.laenge === y.laenge);
  }

  // Vorschlaege fuer die Rollenware-Seite (Inhaber 2026-10-02: nicht pauschal
  // Raummass, sondern den Weg, der fuer diesen Raum guenstiger ist).
  // eingabe: { breite, laenge, rollen: [400, 500], raum: bool, maxRaum,
  //            preis: function (art, breiteCm, laengeCm) -> EUR }
  // -> { empfohlen, alternative, genau, naht, raumM2 }
  //   empfohlen   - guenstigstes Stueck mit Zugabe (Meterware oder Raummass)
  //   alternative - guenstigstes Stueck der jeweils anderen Art, mit Zugabe
  //   genau       - zentimetergenau ohne Zugabe (Raummass, sonst Meterware
  //                 mit exakter Laenge), nur wenn es sich von beiden unterscheidet
  //
  // Mit eingabe.richtung ('laenge' | 'breite', Dielenoptik) wird nicht
  // gedreht: das Muster laeuft entlang der Rollenlaenge, also muss die
  // geschnittene Laenge in der gewuenschten Raumrichtung liegen. Dann gilt
  // die guenstigste Rolle in dieser Richtung; die guenstigste Loesung in der
  // anderen Richtung kommt als andereRichtung mit (ohne alternative).
  function rolleVorschlag(eingabe) {
    var b = eingabe.breite;
    var l = eingabe.laenge;
    var rollen = (eingabe.rollen || []).filter(function (w) { return w > 0; }).sort(function (a, c) { return a - c; });
    var z = typeof eingabe.zugabe === 'number' ? eingabe.zugabe : ZUGABE_CM;
    var preis = eingabe.preis;
    if (eingabe.richtung === 'laenge' || eingabe.richtung === 'breite') {
      return mitRichtung(b, l, rollen, z, preis, eingabe);
    }

    var mit = bewerte(meterKandidaten(b, l, rollen, z).concat(
      nurSinnvoll(eingabe.raum ? [raummass(b, l, eingabe.maxRaum, z)] : [], z, rollen)), preis);
    var empfohlen = mit[0] || null;
    var alternative = empfohlen ? mit.filter(function (k) { return k.art !== empfohlen.art; })[0] || null : null;

    var ohne = bewerte(nurSinnvoll(eingabe.raum ? [raummass(b, l, eingabe.maxRaum, 0)] : [], 0, rollen), preis)[0] ||
      bewerte(meterKandidaten(b, l, rollen, 0), preis)[0] || null;
    var genau = (gleich(ohne, empfohlen) || gleich(ohne, alternative)) ? null : ohne;

    [empfohlen, alternative, genau].forEach(function (k) { if (k) delete k._kosten; });
    return {
      empfohlen: empfohlen,
      alternative: alternative,
      genau: genau,
      teilung: teilung(empfohlen, b, l, rollen, preis),
      zwei: (!empfohlen && !ohne) ? zweiStuecke(b, l, rollen, z, preis) : null,
      naht: !empfohlen && !ohne,
      raumM2: m2(b, l)
    };
  }

  function inRichtung(b, l, rollen, z, preis, eingabe, gedreht) {
    var meter = meterKandidaten(b, l, rollen, z).filter(function (k) { return k.gedreht === gedreht; });
    var raum = nurSinnvoll(eingabe.raum ? [raummass(b, l, eingabe.maxRaum, z, gedreht)] : [], z, rollen);
    return bewerte(meter.concat(raum), preis);
  }

  function mitRichtung(b, l, rollen, z, preis, eingabe) {
    var gedreht = eingabe.richtung === 'breite';
    var hier = inRichtung(b, l, rollen, z, preis, eingabe, gedreht);
    var dort = inRichtung(b, l, rollen, z, preis, eingabe, !gedreht);
    var empfohlen = hier[0] || null;
    var ohne = inRichtung(b, l, rollen, 0, preis, eingabe, gedreht)[0] || null;
    var genau = gleich(ohne, empfohlen) ? null : ohne;
    var andere = dort[0] || null;
    [empfohlen, genau, andere].forEach(function (k) { if (k) delete k._kosten; });
    return {
      empfohlen: empfohlen,
      alternative: null,
      genau: genau,
      andereRichtung: andere,
      teilung: teilung(empfohlen || andere, b, l, rollen, preis),
      zwei: empfohlen ? null : zweiStuecke(b, l, rollen, z, preis, gedreht),
      richtung: eingabe.richtung,
      naht: !empfohlen,
      raumM2: m2(b, l)
    };
  }

  // Raumliste -> Summe m² (auf 0,01 gerundet). Leere Zeilen zaehlen nicht,
  // eine fehlerhafte Zeile macht die Summe ungueltig.
  function summeRaeume(zeilen) {
    var summe = 0;
    var gueltig = 0;
    var fehler = false;
    (zeilen || []).forEach(function (z) {
      var b = leseCm(z.breite);
      var l = leseCm(z.laenge);
      if (b.leer && l.leer) return;
      if (b.fehler || l.fehler || b.leer || l.leer) { fehler = true; return; }
      summe += b.cm * l.cm;
      gueltig++;
    });
    return { m2: Math.round(summe / 100) / 100, raeume: gueltig, fehler: fehler };
  }

  function fmtZahl(n, stellen) {
    return Number(n).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  }

  root.TPRaummass = {
    ZUGABE_CM: ZUGABE_CM,
    leseCm: leseCm,
    rolleVorschlag: rolleVorschlag,
    autoRichtung: autoRichtung,
    zweiStuecke: zweiStuecke,
    summeRaeume: summeRaeume,
    fmtZahl: fmtZahl
  };
})(typeof window !== 'undefined' ? window : globalThis);

// DOM-Anbindung - nur im Browser.
if (typeof document !== 'undefined') (function () {
  'use strict';
  var RM = window.TPRaummass;

  function feuer(el, typ) {
    el.dispatchEvent(new Event(typ, { bubbles: true }));
  }

  // ---- Rollenware -------------------------------------------------------
  function initRolle(box) {
    if (box.getAttribute('data-tp-rm-init') === '1') return;
    var rechner = box.closest('.tp-kaufweg');
    if (!rechner) return;
    box.setAttribute('data-tp-rm-init', '1');

    var bIn = box.querySelector('[data-rm-breite]');
    var lIn = box.querySelector('[data-rm-laenge]');
    var aus = box.querySelector('[data-rm-ergebnis]');
    var fehler = box.querySelector('[data-rm-fehler]');
    // Dielenoptik (snippet setzt data-rm-muster): der Kunde waehlt die
    // Laufrichtung ueber zwei kleine Bilder. Bis dahin gilt RM.autoRichtung -
    // entlang der laengeren Seite, die kuerzere liegt quer, ein Stueck reicht.
    var muster = box.hasAttribute('data-rm-muster');
    var richtungWahl = null;
    function richtung(b, l) {
      if (!muster) return null;
      return richtungWahl || RM.autoRichtung(b, l);
    }
    function richtungVon(v) { return v.gedreht ? 'Raumbreite' : 'Raumlänge'; }

    // Raum von oben (Breite waagerecht, Laenge senkrecht), darueber die Bahn
    // mit Dielen in Laufrichtung; der Ueberstand ist aufgehellt.
    var skizzeNr = 0;
    var NS = 'http://www.w3.org/2000/svg';
    function el(parent, name, attrs, text) {
      var n = document.createElementNS(NS, name);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text) n.textContent = text;
      parent.appendChild(n);
      return n;
    }
    // kompakt: kleines Auswahlbild ohne Beschriftung.
    function skizze(b, l, v, kompakt) {
      skizzeNr++;
      // Bahnen/Stuecke nebeneinander: gleiche Breiten (bahnen) oder eine Liste
      // verschiedener Breiten (stuecke, Zwei-Stuecke-Loesung).
      var breiten = [];
      if (v.stuecke) v.stuecke.forEach(function (st) { breiten.push(st.breite); });
      else for (var bi = 0; bi < (v.bahnen || 1); bi++) breiten.push(v.breite);
      var n = breiten.length;
      var entlang = v.stuecke ? v.stuecke[0].laenge : (v.bahnLaenge || v.laenge);
      var quer = breiten.reduce(function (a, c) { return a + c; }, 0);
      var bh = v.gedreht ? entlang : quer;         // Bahn waagerecht
      var bv = v.gedreht ? quer : entlang;         // Bahn senkrecht
      var W = kompakt ? 140 : 300;
      var s = kompakt ? Math.min(124 / Math.max(b, bh), 124 / Math.max(l, bv))
        : Math.min(230 / Math.max(b, bh), 170 / Math.max(l, bv));
      var H = Math.round(Math.max(l, bv) * s + (kompakt ? 16 : 50));
      var cx = kompakt ? W / 2 : 40 + 115;
      var cy = (kompakt ? 8 : 22) + Math.max(l, bv) * s / 2;
      var rx = cx - b * s / 2, ry = cy - l * s / 2, rw = b * s, rh = l * s;
      var bx = cx - bh * s / 2, by = cy - bv * s / 2, bw = bh * s, bhh = bv * s;
      var svg = el(document.createDocumentFragment(), 'svg', { 'class': 'tp-rm__skizze', viewBox: '0 0 ' + W + ' ' + H, role: 'img',
        'aria-label': 'Skizze: Raum ' + b + ' × ' + l + ' cm, ' + (n > 1 ? n + ' Stücke ' + breiten.join(' + ') + ' × ' + entlang : 'Bahn ' + v.breite + ' × ' + entlang) + ' cm' });
      var clipId = 'tp-rm-clip-' + skizzeNr;
      var defs = el(svg, 'defs', {});
      el(el(defs, 'clipPath', { id: clipId }), 'rect', { x: bx, y: by, width: bw, height: bhh });
      el(svg, 'rect', { x: bx, y: by, width: bw, height: bhh, fill: 'rgba(29,107,71,.10)' });
      var g = el(svg, 'g', { 'clip-path': 'url(#' + clipId + ')', stroke: 'rgba(29,107,71,.45)', 'stroke-width': 1 });
      var pw = Math.max(4, 20 * s);           // Dielenbreite ~20 cm
      var pl = 150 * s;                        // Dielenlaenge ~150 cm
      var senkrecht = !v.gedreht;              // Muster entlang der Schnittlaenge
      var i, j, off;
      var fischgrat = rechner.getAttribute('data-muster') === 'fischgrat';
      if (fischgrat) {
        // Zickzack-Spalten (Breite 2 Dielen) entlang der Laufrichtung.
        var sp = 2 * pw;
        var pfad = '';
        if (senkrecht) {
          for (i = 0; bx + i * sp < bx + bw; i++) {
            var x0 = bx + i * sp;
            el(g, 'line', { x1: x0, y1: by, x2: x0, y2: by + bhh });
            for (j = by - pw; j < by + bhh + pw; j += pw) pfad += 'M' + x0 + ' ' + j + 'L' + (x0 + pw) + ' ' + (j + pw) + 'L' + (x0 + sp) + ' ' + j;
          }
        } else {
          for (i = 0; by + i * sp < by + bhh; i++) {
            var y0 = by + i * sp;
            el(g, 'line', { x1: bx, y1: y0, x2: bx + bw, y2: y0 });
            for (j = bx - pw; j < bx + bw + pw; j += pw) pfad += 'M' + j + ' ' + y0 + 'L' + (j + pw) + ' ' + (y0 + pw) + 'L' + j + ' ' + (y0 + sp);
          }
        }
        el(g, 'path', { d: pfad, fill: 'none' });
      } else if (senkrecht) {
        for (i = 0; bx + i * pw <= bx + bw; i++) {
          el(g, 'line', { x1: bx + i * pw, y1: by, x2: bx + i * pw, y2: by + bhh });
          off = (i % 3) * pl / 3;
          for (j = by - off; j < by + bhh; j += pl) el(g, 'line', { x1: bx + i * pw, y1: j, x2: bx + (i + 1) * pw, y2: j });
        }
      } else {
        for (i = 0; by + i * pw <= by + bhh; i++) {
          el(g, 'line', { x1: bx, y1: by + i * pw, x2: bx + bw, y2: by + i * pw });
          off = (i % 3) * pl / 3;
          for (j = bx - off; j < bx + bw; j += pl) el(g, 'line', { x1: j, y1: by + i * pw, x2: j, y2: by + (i + 1) * pw });
        }
      }
      // Ueberstand aufhellen: Bahn minus Raum.
      el(svg, 'path', { d: 'M' + bx + ' ' + by + 'h' + bw + 'v' + bhh + 'h' + (-bw) + 'z M' + rx + ' ' + ry + 'v' + rh + 'h' + rw + 'v' + (-rh) + 'z',
        'fill-rule': 'evenodd', style: 'fill: var(--color-background, #fff); fill-opacity: .6' });
      el(svg, 'rect', { x: bx, y: by, width: bw, height: bhh, fill: 'none', stroke: '#1d6b47', 'stroke-width': 1.5, 'stroke-dasharray': '5 3' });
      var naht = 0;
      for (i = 1; i < n; i++) {
        naht += breiten[i - 1] * s;
        if (v.gedreht) el(svg, 'line', { x1: bx, y1: by + naht, x2: bx + bw, y2: by + naht, stroke: '#1d6b47', 'stroke-width': 2.5 });
        else el(svg, 'line', { x1: bx + naht, y1: by, x2: bx + naht, y2: by + bhh, stroke: '#1d6b47', 'stroke-width': 2.5 });
      }
      el(svg, 'rect', { x: rx, y: ry, width: rw, height: rh, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 });
      var halo = 'paint-order: stroke; stroke: var(--color-background, #fff); stroke-width: 4px; stroke-linejoin: round';
      // Bei mehreren Bahnen sitzt die Mitte auf der Naht - dann mittig in Bahn 1.
      var tx = cx, ty = cy;
      if (n > 1) {
        if (v.gedreht) ty = by + breiten[0] * s / 2; else tx = bx + breiten[0] * s / 2;
      }
      if (kompakt) return svg;
      el(svg, 'text', { x: tx, y: ty + 4, 'font-size': 12, 'font-weight': 700, fill: '#1d6b47', 'text-anchor': 'middle', style: halo },
        (senkrecht ? '↕' : '↔') + ' Laufrichtung');
      el(svg, 'text', { x: rx + rw / 2, y: Math.min(ry, by) - 6, 'font-size': 11, fill: 'currentColor', 'text-anchor': 'middle' }, 'Raumbreite ' + b + ' cm');
      var lx = Math.min(rx, bx) - 8;
      el(svg, 'text', { x: lx, y: ry + rh / 2, 'font-size': 11, fill: 'currentColor', 'text-anchor': 'middle',
        transform: 'rotate(-90 ' + lx + ' ' + (ry + rh / 2) + ')' }, 'Raumlänge ' + l + ' cm');
      el(svg, 'text', { x: cx, y: H - 6, 'font-size': 11, fill: 'currentColor', 'text-anchor': 'middle' },
        n > 1 ? breiten.join(' + ') + ' × ' + entlang + ' cm · Naht grün'
          : 'gestrichelt: Bahn ' + v.breite + ' × ' + entlang + ' cm, Überstand hell');
      return svg;
    }

    function rollen() {
      var r = [];
      rechner.querySelectorAll('input[name^="tp-rwc-width-"]').forEach(function (i) {
        if (!i.disabled && !i.hidden) r.push(parseFloat(i.value));
      });
      return r.filter(function (w) { return w > 0; });
    }
    function raumMoeglich() {
      var karte = rechner.querySelector('[data-art-card-raum]');
      var radio = rechner.querySelector('input[name^="tp-rwc-art-"][value="raum"]');
      return !!(karte && !karte.hidden && radio && !radio.disabled);
    }
    function maxRaum(r) {
      var ART = window.TPRollwareArt;
      return ART ? ART.maxRaumBreite(r) : 0;
    }

    function uebernehmen(v, offenLassen) {
      if (muster) richtungWahl = v.gedreht ? 'breite' : 'laenge';
      // Bahnen: der Rechner schreibt daraus den Vermerk "Zuschnitt" in die
      // Warenkorbzeile. Vor den Events setzen, damit er es gleich sieht.
      if (v.bahnen || v.zuschnittText) {
        rechner.setAttribute('data-bahnen', String(v.bahnen || 1));
        rechner.setAttribute('data-bahn-laenge', String(v.bahnLaenge || v.laenge));
        rechner.setAttribute('data-bahn-breite', String(v.breite));
        if (v.zuschnittText) rechner.setAttribute('data-zuschnitt-text', v.zuschnittText);
        else rechner.removeAttribute('data-zuschnitt-text');
      } else {
        rechner.removeAttribute('data-bahnen');
        rechner.removeAttribute('data-bahn-laenge');
        rechner.removeAttribute('data-bahn-breite');
        rechner.removeAttribute('data-zuschnitt-text');
      }
      var art = rechner.querySelector('input[name^="tp-rwc-art-"][value="' + v.art + '"]');
      if (art && !art.disabled) { art.checked = true; feuer(art, 'change'); }
      if (v.art === 'meter') {
        var chip = rechner.querySelector('input[name^="tp-rwc-width-"][value="' + v.breite + '"]');
        if (chip && !chip.disabled) { chip.checked = true; feuer(chip, 'change'); }
      } else {
        var wb = rechner.querySelector('[data-wunsch-input]');
        if (wb) { wb.value = String(v.breite); feuer(wb, 'input'); }
      }
      var len = rechner.querySelector('[data-length-input]');
      if (len) { len.value = String(v.laenge); feuer(len, 'input'); }
      if (!offenLassen) box.removeAttribute('open');
      var ziel = rechner.querySelector('.tp-rwc-masse') || len;
      if (ziel && ziel.scrollIntoView) ziel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function euro(n) { return RM.fmtZahl(n, 2) + ' €'; }

    // knopf: Beschriftung des Uebernehmen-Knopfs; primaer = Empfehlung.
    // raum: {b, l} -> Raumskizze mit Dielen (nur Dielenoptik).
    function zeile(titel, v, text, knopf, primaer, raum) {
      var div = document.createElement('div');
      div.className = 'tp-rm__vorschlag' + (primaer ? ' tp-rm__vorschlag--empfohlen' : '');
      var kopf = document.createElement('p');
      kopf.className = 'tp-rm__titel';
      kopf.textContent = titel;
      var mass = document.createElement('p');
      mass.className = 'tp-rm__mass';
      mass.textContent = (v.art === 'meter' ? 'Meterware ' : 'Raummaß ') + RM.fmtZahl(v.breite, 0) + ' × ' + RM.fmtZahl(v.laenge, 0) + ' cm';
      var preis = document.createElement('p');
      preis.className = 'tp-rm__preis';
      preis.textContent = RM.fmtZahl(v.m2, 2) + ' m²' + (v.preis > 0 ? ' · ' + euro(v.preis) : '');
      var info = document.createElement('p');
      info.className = 'tp-rm__info';
      info.textContent = text + (v.gedreht && !muster ? ' Quer zum Raum verlegt.' : '');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tp-rm__knopf' + (primaer ? ' tp-rm__knopf--primaer' : '');
      btn.textContent = knopf;
      btn.addEventListener('click', function () { uebernehmen(v); });
      div.appendChild(kopf);
      div.appendChild(mass);
      div.appendChild(preis);
      if (raum) div.appendChild(skizze(raum.b, raum.l, v));
      div.appendChild(info);
      div.appendChild(btn);
      return div;
    }

    function erklaerung(v, z) {
      return v.art === 'meter'
        ? 'Inkl. ' + z + ' cm Zugabe zum Anpassen an die Wand.'
        : 'Inkl. je ' + z + ' cm Zugabe an Breite und Länge.';
    }

    var mehrOffen = false;

    // Bahnen aus schmaleren Rollen (z. B. 2 x 200 statt 1 x 400): fuer Kunden,
    // die eine breite Rolle nicht ins Haus oder die Treppe hoch bekommen.
    function teilungsText(t) {
      return 'Wir liefern ' + t.bahnen + ' einzelne Rollen à ' + t.breite + ' × ' + t.bahnLaenge +
        ' cm – leichter zu tragen. Beim Verlegen entsteht eine Naht.';
    }
    function teilungsZeile(t) {
      return zeile(t.bahnen + ' schmale Rollen statt einer breiten', t, teilungsText(t), 'Diese Variante übernehmen', false);
    }

    function mehrBox(weitere) {
      if (!weitere.length) return;
      var mehr = document.createElement('details');
      mehr.className = 'tp-rm__mehr';
      mehr.open = mehrOffen;
      mehr.addEventListener('toggle', function () { mehrOffen = mehr.open; });
      var sum = document.createElement('summary');
      sum.innerHTML = '<span class="tp-rm__mehr-auf">Andere Möglichkeiten anzeigen</span><span class="tp-rm__mehr-zu">Andere Möglichkeiten ausblenden</span> (' + weitere.length + ') <span class="tp-rm__mehr-pfeil" aria-hidden="true">▾</span>';
      mehr.appendChild(sum);
      var liste = document.createElement('div');
      liste.className = 'tp-rm__mehr-liste';
      weitere.forEach(function (k) { liste.appendChild(k); });
      mehr.appendChild(liste);
      aus.appendChild(mehr);
    }

    function raumZeile(v) {
      var p = document.createElement('p');
      p.className = 'tp-rm__raum';
      p.textContent = 'Raumfläche: ' + RM.fmtZahl(v.raumM2, 2) + ' m². Preise für die gewählte Farbe, ohne Zubehör.';
      aus.appendChild(p);
    }

    // Raum breiter als jede Rolle: 2 Stuecke (Inhaber 2026-10-03).
    function zweiBlock(zw, b, l) {
      var div = document.createElement('div');
      div.className = 'tp-rm__vorschlag tp-rm__vorschlag--empfohlen';
      var t = function (cls, text, tag) {
        var n = document.createElement(tag || 'p'); n.className = cls; n.textContent = text; div.appendChild(n); return n;
      };
      t('tp-rm__titel', 'Ihr Bestellmaß – 2 Stücke');
      zw.stuecke.forEach(function (st, i) {
        t('tp-rm__mass tp-rm__mass--stueck', 'Stück ' + (i + 1) + ': ' + RM.fmtZahl(st.breite, 0) + ' × ' + RM.fmtZahl(st.laenge, 0) + ' cm');
      });
      t('tp-rm__preis', 'Zusammen ' + RM.fmtZahl(zw.m2, 2) + ' m²' + (zw.preis > 0 ? ' · ' + euro(zw.preis) : ''));
      div.appendChild(skizze(b, l, { stuecke: zw.stuecke, gedreht: zw.gedreht, breite: zw.stuecke[0].breite, laenge: zw.stuecke[0].laenge }));
      t('tp-rm__info', 'Ihr Raum ist breiter als die breiteste Rolle. Die Stücke werden nebeneinander verlegt, dazwischen entsteht eine Naht. Inkl. ' + RM.ZUGABE_CM + ' cm Zugabe.');
      if (zw.gemischt) {
        t('tp-rm__hinweis tp-rm__charge', 'Hinweis: Bei zwei verschiedenen Rollenbreiten kann es zu leichten Farbabweichungen (Charge) kommen.');
        var w1 = zw.stuecke[0], w2 = zw.stuecke[1];
        [w1, w2].forEach(function (st, i) {
          var anderes = i === 0 ? w2 : w1;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tp-rm__knopf' + (i === 0 ? ' tp-rm__knopf--primaer' : '');
          btn.textContent = 'Stück ' + (i + 1) + ' übernehmen';
          btn.addEventListener('click', function () {
            uebernehmen({ art: 'meter', breite: st.breite, laenge: st.laenge, gedreht: zw.gedreht,
              zuschnittText: 'Stück ' + (i + 1) + ' von 2 (zusammen mit ' + anderes.breite + ' × ' + anderes.laenge + ' cm)' }, true);
            btn.textContent = '✓ Stück ' + (i + 1) + ' im Rechner';
          });
          div.appendChild(btn);
        });
        t('tp-rm__info', 'Bitte beide Stücke nacheinander in den Warenkorb legen.');
      } else {
        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'tp-rm__knopf tp-rm__knopf--primaer';
        ok.textContent = 'Maß übernehmen';
        ok.addEventListener('click', function () {
          uebernehmen({ art: 'meter', breite: zw.stuecke[0].breite, laenge: 2 * zw.stuecke[0].laenge, bahnen: 2,
            bahnLaenge: zw.stuecke[0].laenge, gedreht: zw.gedreht });
        });
        div.appendChild(ok);
      }
      aus.appendChild(div);
    }

    // Dielenoptik: zwei kleine Bilder zur Wahl der Laufrichtung, darunter nur
    // das Bestellmass (Inhaber 2026-10-02: so einfach wie moeglich).
    function zeigeMuster(b, l, r, vorschlag) {
      var wahl = { laenge: vorschlag('laenge'), breite: vorschlag('breite') };
      var hat = function (ri) { return !!(wahl[ri].empfohlen || wahl[ri].zwei); };
      var aktiv = richtung(b, l);
      // Lieber die Richtung mit einem Stueck, solange der Kunde nicht gewaehlt hat.
      if (!richtungWahl && !wahl[aktiv].empfohlen && wahl[aktiv === 'laenge' ? 'breite' : 'laenge'].empfohlen) {
        aktiv = aktiv === 'laenge' ? 'breite' : 'laenge';
      }
      if (!hat(aktiv)) aktiv = aktiv === 'laenge' ? 'breite' : 'laenge';
      var v = wahl[aktiv];
      if (!hat(aktiv)) {
        var p = document.createElement('p');
        p.className = 'tp-rm__info tp-rm__hinweis';
        p.textContent = 'Ihr Raum ist auf beiden Seiten breiter als ' + RM.fmtZahl(Math.max.apply(null, r) / 100, 0) +
          ' m. Das geht nur mit Naht – rufen Sie uns an, wir planen das mit Ihnen.';
        aus.appendChild(p);
        return;
      }
      var frage = document.createElement('p');
      frage.className = 'tp-rm__frage';
      frage.textContent = 'Wie sollen die Dielen liegen?';
      aus.appendChild(frage);
      var leiste = document.createElement('div');
      leiste.className = 'tp-rm__wahl';
      ['laenge', 'breite'].forEach(function (ri) {
        var k = wahl[ri].empfohlen;
        var zw = !k ? wahl[ri].zwei : null;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tp-rm__wahlkarte' + (ri === aktiv ? ' is-aktiv' : '');
        btn.setAttribute('aria-pressed', ri === aktiv ? 'true' : 'false');
        var bild = k || (zw ? { stuecke: zw.stuecke, gedreht: zw.gedreht, breite: zw.stuecke[0].breite, laenge: zw.stuecke[0].laenge }
          : { art: 'meter', breite: Math.max.apply(null, r), laenge: (ri === 'laenge' ? l : b), gedreht: ri === 'breite' });
        btn.appendChild(skizze(b, l, bild, true));
        var t = document.createElement('span');
        t.className = 'tp-rm__wahl-text';
        t.textContent = ri === 'laenge' ? 'Dielen ↕' : 'Dielen ↔';
        var pr = document.createElement('span');
        pr.className = 'tp-rm__wahl-preis';
        pr.textContent = k ? (k.preis > 0 ? euro(k.preis) : RM.fmtZahl(k.m2, 2) + ' m²')
          : (zw ? '2 Stücke' + (zw.preis > 0 ? ' · ' + euro(zw.preis) : '') : 'nicht möglich');
        btn.appendChild(t);
        btn.appendChild(pr);
        if (!k && !zw) { btn.disabled = true; btn.className += ' is-aus'; }
        btn.addEventListener('click', function () { richtungWahl = ri; rechnen(); });
        leiste.appendChild(btn);
      });
      aus.appendChild(leiste);

      if (!v.empfohlen) { zweiBlock(v.zwei, b, l); return; }
      var e = v.empfohlen;
      var div = document.createElement('div');
      div.className = 'tp-rm__vorschlag tp-rm__vorschlag--empfohlen';
      var kopf = document.createElement('p');
      kopf.className = 'tp-rm__titel';
      kopf.textContent = 'Ihr Bestellmaß';
      var mass = document.createElement('p');
      mass.className = 'tp-rm__mass';
      mass.textContent = RM.fmtZahl(e.breite, 0) + ' × ' + RM.fmtZahl(e.laenge, 0) + ' cm';
      var preis = document.createElement('p');
      preis.className = 'tp-rm__preis';
      preis.textContent = RM.fmtZahl(e.m2, 2) + ' m²' + (e.preis > 0 ? ' · ' + euro(e.preis) : '');
      var info = document.createElement('p');
      info.className = 'tp-rm__info';
      info.textContent = 'Inkl. ' + RM.ZUGABE_CM + ' cm Zugabe zum Anpassen an die Wand.';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'tp-rm__knopf tp-rm__knopf--primaer';
      ok.textContent = 'Maß übernehmen';
      ok.addEventListener('click', function () { uebernehmen(e); });
      [kopf, mass, preis, info, ok].forEach(function (n) { div.appendChild(n); });
      aus.appendChild(div);

      if (v.teilung) {
        var t2 = document.createElement('p');
        t2.className = 'tp-rm__teilung';
        t2.appendChild(document.createTextNode('Lieber ' + v.teilung.bahnen + ' schmale Rollen à ' + v.teilung.breite +
          ' cm? Leichter zu tragen, mit Naht. '));
        var so = document.createElement('button');
        so.type = 'button';
        so.className = 'tp-rm__link';
        so.textContent = 'So bestellen';
        so.addEventListener('click', function () { uebernehmen(v.teilung); });
        t2.appendChild(so);
        aus.appendChild(t2);
      }
    }

    function rechnen() {
      var b = RM.leseCm(bIn.value);
      var l = RM.leseCm(lIn.value);
      aus.innerHTML = '';
      fehler.hidden = true;
      if (b.leer || l.leer) return;
      if (b.fehler || l.fehler) {
        fehler.textContent = 'Bitte Maße zwischen 50 und 5000 cm eingeben, zum Beispiel 350.';
        fehler.hidden = false;
        return;
      }
      var r = rollen();
      var basis = {
        breite: b.cm, laenge: l.cm, rollen: r, raum: raumMoeglich(), maxRaum: maxRaum(r),
        preis: typeof rechner.tpRwcPreis === 'function' ? rechner.tpRwcPreis : null
      };
      if (muster) {
        zeigeMuster(b.cm, l.cm, r, function (ri) {
          var e = {}; Object.keys(basis).forEach(function (k) { e[k] = basis[k]; });
          e.richtung = ri;
          return RM.rolleVorschlag(e);
        });
        return;
      }
      var v = RM.rolleVorschlag(basis);
      if (v.naht && v.zwei) { zweiBlock(v.zwei, b.cm, l.cm); return; }
      if (v.naht) {
        var p = document.createElement('p');
        p.className = 'tp-rm__info';
        p.textContent = 'Ihr Raum ist auf beiden Seiten breiter als die breiteste Rolle (' + RM.fmtZahl(Math.max.apply(null, r), 0) + ' cm). Dann braucht es zwei Bahnen mit Naht – rufen Sie uns an, wir planen die Aufteilung mit Ihnen.';
        aus.appendChild(p);
        return;
      }
      var z = RM.ZUGABE_CM;
      var e = v.empfohlen;
      var alt = v.alternative;
      if (e) {
        var warum = erklaerung(e, z);
        if (alt && alt.preis > 0 && e.preis > 0 && alt.preis - e.preis >= 0.01) {
          warum += ' ' + euro(alt.preis - e.preis) + ' günstiger als ' + (alt.art === 'meter' ? 'Meterware' : 'Raummaß') + '.';
        }
        aus.appendChild(zeile('Empfohlen – günstigster Weg', e, warum, 'Dieses Maß übernehmen', true));
      }
      // Nur die Empfehlung steht offen (Inhaber 2026-10-02: eine Entscheidung,
      // nicht drei). Alternative und zentimetergenau liegen aufklappbar
      // darunter; der Zustand bleibt beim Weitertippen erhalten.
      var weitere = [];
      if (alt) {
        weitere.push(zeile(alt.art === 'raum' ? 'Raummaß' : 'Meterware', alt,
          alt.art === 'raum' ? 'Nur so breit wie nötig, höherer m²-Preis.' : 'Volle Rollenbreite, günstigerer m²-Preis.',
          'Stattdessen übernehmen', false));
      }
      if (v.teilung) weitere.push(teilungsZeile(v.teilung));
      if (v.genau) {
        weitere.push(zeile('Zentimetergenau – ohne Zugabe', v.genau,
          'Genau Ihre Maße – nur, wenn Sie sehr exakt gemessen haben.', 'Ohne Zugabe übernehmen', false));
      }
      if (weitere.length) {
        var mehr = document.createElement('details');
        mehr.className = 'tp-rm__mehr';
        mehr.open = mehrOffen;
        mehr.addEventListener('toggle', function () { mehrOffen = mehr.open; });
        var sum = document.createElement('summary');
        sum.innerHTML = '<span class="tp-rm__mehr-auf">Andere Möglichkeiten anzeigen</span><span class="tp-rm__mehr-zu">Andere Möglichkeiten ausblenden</span> (' + weitere.length + ') <span class="tp-rm__mehr-pfeil" aria-hidden="true">▾</span>';
        mehr.appendChild(sum);
        var liste = document.createElement('div');
        liste.className = 'tp-rm__mehr-liste';
        weitere.forEach(function (k) { liste.appendChild(k); });
        mehr.appendChild(liste);
        aus.appendChild(mehr);
      }
      var raum = document.createElement('p');
      raum.className = 'tp-rm__raum';
      raum.textContent = 'Raumfläche: ' + RM.fmtZahl(v.raumM2, 2) + ' m². Preise für die gewählte Farbe, ohne Zubehör.';
      aus.appendChild(raum);
    }

    [bIn, lIn].forEach(function (f) { f.addEventListener('input', rechnen); });
    // Farbwechsel aendert Rollen und Raummass-Verfuegbarkeit.
    document.addEventListener('change', function (e) {
      if (e.target && e.target.name && e.target.name.indexOf('tp-rwc-') === 0) return;
      setTimeout(rechnen, 200);
    });
  }

  // ---- Paketware --------------------------------------------------------
  function initPaket(box) {
    if (box.getAttribute('data-tp-rm-init') === '1') return;
    var comp = box.closest('.tp-paket-auswahl');
    var sqm = comp && comp.querySelector('[data-sqm-input]');
    if (!sqm) return;
    box.setAttribute('data-tp-rm-init', '1');

    var liste = box.querySelector('[data-rm-liste]');
    var vorlage = box.querySelector('[data-rm-zeile-vorlage]');
    var add = box.querySelector('[data-rm-add]');
    var summeEl = box.querySelector('[data-rm-summe]');
    var fehler = box.querySelector('[data-rm-fehler]');
    var ok = box.querySelector('[data-rm-uebernehmen]');
    var nr = 0;

    function neueZeile() {
      nr++;
      var z = vorlage.content.firstElementChild.cloneNode(true);
      z.querySelectorAll('[data-rm-id]').forEach(function (el) {
        var basis = el.getAttribute('data-rm-id');
        el.id = basis + '-' + nr;
      });
      z.querySelectorAll('label[data-rm-for]').forEach(function (el) {
        el.setAttribute('for', el.getAttribute('data-rm-for') + '-' + nr);
      });
      var name = z.querySelector('[data-rm-name]');
      if (name) name.textContent = 'Raum ' + nr;
      var weg = z.querySelector('[data-rm-weg]');
      weg.addEventListener('click', function () {
        z.remove();
        if (!liste.children.length) neueZeile();
        rechnen();
      });
      z.querySelectorAll('input').forEach(function (i) { i.addEventListener('input', rechnen); });
      liste.appendChild(z);
      return z;
    }

    function zeilen() {
      var out = [];
      liste.querySelectorAll('[data-rm-zeile]').forEach(function (z) {
        out.push({ breite: z.querySelector('[data-rm-b]').value, laenge: z.querySelector('[data-rm-l]').value });
      });
      return out;
    }

    var letzte = null;
    function rechnen() {
      var s = RM.summeRaeume(zeilen());
      letzte = s;
      fehler.hidden = !s.fehler;
      if (s.fehler) fehler.textContent = 'Bitte jede Zeile mit Breite und Länge ausfüllen (z. B. 350 oder 3,5 m).';
      summeEl.textContent = s.raeume
        ? RM.fmtZahl(s.m2, 2) + ' m²' + (s.raeume > 1 ? ' aus ' + s.raeume + ' Flächen' : '')
        : '–';
      ok.disabled = s.fehler || !s.raeume;
    }

    add.addEventListener('click', function () {
      var z = neueZeile();
      var f = z.querySelector('input');
      if (f) f.focus();
      rechnen();
    });
    ok.addEventListener('click', function () {
      if (!letzte || letzte.fehler || !letzte.raeume) return;
      sqm.value = RM.fmtZahl(letzte.m2, 2);
      // input rechnet, blur normalisiert - dieselben Wege wie beim Tippen.
      feuer(sqm, 'input');
      sqm.dispatchEvent(new Event('blur'));
      box.removeAttribute('open');
      if (sqm.scrollIntoView) sqm.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

    neueZeile();
    rechnen();
  }

  function alle() {
    document.querySelectorAll('[data-tp-rm-rolle]').forEach(initRolle);
    document.querySelectorAll('[data-tp-rm-paket]').forEach(initPaket);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alle);
  else alle();
  document.addEventListener('shopify:section:load', alle);
  document.addEventListener('shopify:block:select', alle);
})();
