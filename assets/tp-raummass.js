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
    Rolle passen, gewinnt die kleinste Bestellflaeche (wie tp-boden-rechner).
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

  // Beste Meterware-Variante fuer Raum b x l mit Zugabe z auf die Laenge.
  function meterware(b, l, rollen, z) {
    var best = null;
    (rollen || []).forEach(function (rolle) {
      [[b, l, false], [l, b, true]].forEach(function (o) {
        var quer = o[0];
        var laenge = o[1] + z;
        if (quer > rolle) return;
        var flaeche = rolle * laenge;
        if (!best || flaeche < best._f || (flaeche === best._f && !o[2] && best.gedreht)) {
          best = { art: 'meter', breite: rolle, laenge: laenge, gedreht: o[2], _f: flaeche };
        }
      });
    });
    if (best) { best.m2 = m2(best.breite, best.laenge); delete best._f; }
    return best;
  }

  // Raummass b x l, Zugabe z auf beide Seiten. Kuerzere Seite quer, wenn sie
  // passt, sonst die laengere.
  function raummass(b, l, maxRaum, z) {
    if (!(maxRaum > 0)) return null;
    var kurz = Math.min(b, l);
    var lang = Math.max(b, l);
    var opts = [[kurz, lang], [lang, kurz]];
    for (var i = 0; i < opts.length; i++) {
      var quer = opts[i][0] + z;
      if (quer <= maxRaum) {
        var laenge = opts[i][1] + z;
        return { art: 'raum', breite: quer, laenge: laenge, gedreht: opts[i][0] !== b, m2: m2(quer, laenge) };
      }
    }
    return null;
  }

  // Vorschlaege fuer die Rollenware-Seite.
  // eingabe: { breite, laenge, rollen: [400, 500], raum: bool, maxRaum }
  // -> { empfohlen, genau, naht } (empfohlen/genau koennen null sein)
  function rolleVorschlag(eingabe) {
    var b = eingabe.breite;
    var l = eingabe.laenge;
    var rollen = (eingabe.rollen || []).filter(function (w) { return w > 0; }).sort(function (a, c) { return a - c; });
    var z = typeof eingabe.zugabe === 'number' ? eingabe.zugabe : ZUGABE_CM;
    var empfohlen = null;
    var genau = null;
    if (eingabe.raum) {
      empfohlen = raummass(b, l, eingabe.maxRaum, z);
      genau = raummass(b, l, eingabe.maxRaum, 0);
    }
    // Ohne Raummass (oder Raum zu breit dafuer) ist Meterware der Weg. Bei
    // Meterware heisst "ohne Zugabe": volle Rolle, Laenge exakt wie gemessen.
    if (!empfohlen) empfohlen = meterware(b, l, rollen, z);
    if (!genau) genau = meterware(b, l, rollen, 0);
    return { empfohlen: empfohlen, genau: genau, naht: !empfohlen && !genau, raumM2: m2(b, l) };
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

    function uebernehmen(v) {
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
      box.removeAttribute('open');
      var ziel = rechner.querySelector('.tp-rwc-masse') || len;
      if (ziel && ziel.scrollIntoView) ziel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function zeile(titel, v, text, primaer) {
      var div = document.createElement('div');
      div.className = 'tp-rm__vorschlag' + (primaer ? ' tp-rm__vorschlag--empfohlen' : '');
      var kopf = document.createElement('p');
      kopf.className = 'tp-rm__titel';
      kopf.textContent = titel;
      var mass = document.createElement('p');
      mass.className = 'tp-rm__mass';
      mass.textContent = (v.art === 'meter' ? 'Meterware ' : 'Raummaß ') + RM.fmtZahl(v.breite, 0) + ' × ' + RM.fmtZahl(v.laenge, 0) + ' cm · ' + RM.fmtZahl(v.m2, 2) + ' m²';
      var info = document.createElement('p');
      info.className = 'tp-rm__info';
      info.textContent = text + (v.gedreht ? ' Breite und Länge sind dafür getauscht.' : '');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tp-rm__knopf' + (primaer ? ' tp-rm__knopf--primaer' : '');
      btn.textContent = primaer ? 'Dieses Maß übernehmen' : 'Ohne Zugabe übernehmen';
      btn.addEventListener('click', function () { uebernehmen(v); });
      div.appendChild(kopf);
      div.appendChild(mass);
      div.appendChild(info);
      div.appendChild(btn);
      return div;
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
      var v = RM.rolleVorschlag({ breite: b.cm, laenge: l.cm, rollen: r, raum: raumMoeglich(), maxRaum: maxRaum(r) });
      if (v.naht) {
        var p = document.createElement('p');
        p.className = 'tp-rm__info';
        p.textContent = 'Ihr Raum ist auf beiden Seiten breiter als die breiteste Rolle (' + RM.fmtZahl(Math.max.apply(null, r), 0) + ' cm). Dann braucht es zwei Bahnen mit Naht – rufen Sie uns an, wir planen die Aufteilung mit Ihnen.';
        aus.appendChild(p);
        return;
      }
      var z = RM.ZUGABE_CM;
      if (v.empfohlen) {
        aus.appendChild(zeile('Empfohlen – mit Zugabe', v.empfohlen,
          v.empfohlen.art === 'meter'
            ? 'Volle Rollenbreite, ' + z + ' cm Zugabe auf die Länge zum Anpassen an die Wand.'
            : 'Je ' + z + ' cm Zugabe auf Breite und Länge – Wände sind selten ganz gerade.', true));
      }
      if (v.genau && !(v.empfohlen && v.genau.breite === v.empfohlen.breite && v.genau.laenge === v.empfohlen.laenge)) {
        aus.appendChild(zeile('Zentimetergenau – ohne Zugabe', v.genau,
          v.genau.art === 'meter'
            ? 'Volle Rollenbreite, Länge genau wie gemessen.'
            : 'Genau Ihre Maße – nur, wenn Sie sehr exakt gemessen haben.', false));
      }
      var raum = document.createElement('p');
      raum.className = 'tp-rm__raum';
      raum.textContent = 'Raumfläche: ' + RM.fmtZahl(v.raumM2, 2) + ' m²';
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
