/*
  Bedienung und Vorschau fuer blocks/tp-einfass-konfigurator.liquid.
  Gerechnet wird ausschliesslich mit window.TPMass
  (assets/tp-masstepich-rechnung.js). Fail closed: fehlen Daten, Rechenkern
  oder eine gueltige Variante, bleibt der Warenkorb-Knopf verborgen.
*/
(function () {
  'use strict';

  var ART = { cover: 'Cover', ketteln: 'Gekettelt', einfassband: 'Einfassband', paspelband: 'Paspelband' };
  var FORM = { rechteck: 'Rechteckig', rund: 'Rund', oval: 'Oval', schablone: 'Nach Schablone', skizze: 'Nach Skizze' };
  var ANFRAGE = {
    schablone: {
      titel: 'Teppich nach Schablone',
      text: 'Beschreiben Sie kurz die Form und schicken Sie uns ein Foto Ihrer Schablone mit den wichtigsten Maßen. Wir prüfen sie und melden uns mit einem Angebot.'
    },
    skizze: {
      titel: 'Teppich nach Skizze',
      text: 'Zeichnen Sie die Form mit allen Maßen auf und schicken Sie uns ein Foto davon. Wir prüfen die Skizze und melden uns mit einem Angebot.'
    }
  };
  var BAND_CM = { einfassband: 3, paspelband: 1 };
  var BEISPIEL = { w: 200, l: 300 };
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var zaehler = 0;

  function fmt(n, d) {
    var s = d == null ? 2 : d;
    return Number(n).toLocaleString('de-DE', { minimumFractionDigits: s, maximumFractionDigits: s });
  }
  function euro(cent) { return fmt(cent / 100) + ' €'; }

  function svgEl(name, attrs, parent) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }

  function init(root) {
    if (root.getAttribute('data-tp-ek-bereit')) return;
    root.setAttribute('data-tp-ek-bereit', '1');
    var M = window.TPMass;
    var datenEl = root.querySelector('[data-tp-ek-daten]');
    if (!M || !datenEl) return;

    var d;
    try { d = JSON.parse(datenEl.textContent); } catch (e) { return; }
    var art = d.art;
    var varianten = (d.varianten || []).filter(Boolean);
    if (!ART[art] || !varianten.length || !(d.max_breite_cm > 0) || !(d.max_laenge_cm > 0)) return;

    var uid = 'tp-ek-' + (++zaehler);
    var maxW = d.max_breite_cm;
    var maxL = d.max_laenge_cm;
    var mindestCent = parseInt(d.mindestpreis_cent, 10) || 0;
    var mitBand = !!BAND_CM[art];
    var baender = mitBand ? (d.baender || []).filter(function (b) { return b && b.art === art && /^#[0-9a-f]{6}$/i.test(b.hex); }) : [];
    if (mitBand && !baender.length) return;

    var q = function (s) { return root.querySelector(s); };
    var konfig = q('[data-konfig]');
    var anfrage = q('[data-anfrage]');
    var inBreite = q('[data-breite]');
    var inLaenge = q('[data-laenge]');
    var feldLaenge = q('[data-feld-laenge]');
    var labelBreite = q('[data-label-breite]');
    var grenzen = q('[data-grenzen]');
    var fehler = q('[data-fehler]');
    var vorschau = q('[data-vorschau]');
    var svg = q('[data-svg]');
    var legende = q('[data-legende]');
    var rechnung = q('[data-rechnung]');
    var cta = q('[data-cta]');
    var warenkorb = q('[data-warenkorb]');
    var band = null;
    var target = null;
    var stand = null;

    function form() {
      var c = root.querySelector('input[name^="tp-ek-form-"]:checked');
      return c ? c.value : 'rechteck';
    }

    // Nur Varianten aus der Freigabeliste; eine fremde ?variant= fuehrt zu
    // keiner Auswahl statt zu einer geratenen.
    function aktuelleVariante() {
      var id = new URLSearchParams(window.location.search).get('variant') || String(d.selected_id || '');
      var v = varianten.filter(function (x) { return String(x.id) === String(id); })[0];
      if (v) return v;
      if (new URLSearchParams(window.location.search).get('variant')) return null;
      return varianten.filter(function (x) { return x.available; })[0] || null;
    }

    function nummerieren() {
      var n = 2;
      root.querySelectorAll('[data-schritt]').forEach(function (s) {
        if (s.hidden || (s.closest('[data-konfig]') && konfig.hidden)) return;
        var num = s.querySelector('.tp-step-heading__number');
        if (num) num.textContent = String(n++);
      });
    }

    function baenderAufbauen() {
      var box = q('[data-baender]');
      if (!box) return;
      baender.forEach(function (b) {
        var label = document.createElement('label');
        label.className = 'tp-ek__band';
        label.title = b.nr + ' · ' + b.name;
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = uid + '-band';
        input.value = b.nr;
        input.setAttribute('aria-label', b.nr + ' ' + b.name);
        var dot = document.createElement('span');
        dot.style.background = b.hex;
        label.appendChild(input);
        label.appendChild(dot);
        box.appendChild(label);
        input.addEventListener('change', function () {
          band = b;
          var name = q('[data-band-name]');
          if (name) name.textContent = 'Bandfarbe ' + b.nr + ' · ' + b.name;
          rechnen();
        });
      });
    }

    function lesen(input) {
      if (!input) return { wert: 0, komma: false };
      var komma = !!(input.validity && input.validity.badInput);
      var roh = parseFloat(input.value);
      return { wert: roh > 0 ? Math.ceil(roh) : 0, komma: komma };
    }

    function zeichnen(f, w, l, beispiel) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var horiz = f === 'rund' ? w : l;
      var vert = w;
      var boxW = 290;
      var boxH = 180;
      var s = Math.min(boxW / horiz, boxH / vert);
      var pw = horiz * s;
      var ph = vert * s;
      var x = 50 + (boxW - pw) / 2;
      var y = 50 + (boxH - ph) / 2;

      var defs = svgEl('defs', {}, svg);
      var fuellung = '#d9d4cb';
      if (target && target.bild) {
        var pat = svgEl('pattern', { id: uid + '-muster', patternUnits: 'userSpaceOnUse', width: 110, height: 110 }, defs);
        var img = svgEl('image', { width: 110, height: 110, preserveAspectRatio: 'xMidYMid slice' }, pat);
        img.setAttribute('href', target.bild);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', target.bild);
        fuellung = 'url(#' + uid + '-muster)';
      }

      function umriss(extra) {
        var a = extra || {};
        if (f === 'rund') return svgEl('circle', Object.assign({ cx: x + pw / 2, cy: y + ph / 2, r: pw / 2 }, a), svg);
        if (f === 'oval') return svgEl('ellipse', Object.assign({ cx: x + pw / 2, cy: y + ph / 2, rx: pw / 2, ry: ph / 2 }, a), svg);
        return svgEl('rect', Object.assign({ x: x, y: y, width: pw, height: ph, rx: 2 }, a), svg);
      }

      umriss({ fill: fuellung, class: 'tp-ek-form', opacity: beispiel ? 0.45 : 1 });
      if (art === 'cover') {
        umriss({ fill: 'none', stroke: fuellung, 'stroke-width': 9 });
        umriss({ fill: 'none', stroke: 'rgba(0,0,0,.22)', 'stroke-width': 9 });
        umriss({ fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 1, transform: 'translate(0 0)' });
      } else if (art === 'ketteln') {
        umriss({ fill: 'none', stroke: 'rgba(0,0,0,.38)', 'stroke-width': 4, 'stroke-dasharray': '1.4 1.4' });
      } else {
        var px = Math.max(art === 'einfassband' ? 6 : 3, BAND_CM[art] * s * 2);
        umriss(band
          ? { fill: 'none', stroke: band.hex, 'stroke-width': px }
          : { fill: 'none', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 2, 'stroke-dasharray': '6 4' });
      }

      var farbe = 'currentColor';
      var oben = f === 'rund' ? 'Ø ' + w + ' cm' : 'Länge ' + l + ' cm';
      svgEl('line', { x1: x, y1: 32, x2: x + pw, y2: 32, stroke: farbe, 'stroke-width': 1 }, svg);
      svgEl('line', { x1: x, y1: 27, x2: x, y2: 37, stroke: farbe, 'stroke-width': 1 }, svg);
      svgEl('line', { x1: x + pw, y1: 27, x2: x + pw, y2: 37, stroke: farbe, 'stroke-width': 1 }, svg);
      var t1 = svgEl('text', { x: x + pw / 2, y: 22, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, fill: farbe }, svg);
      t1.textContent = oben;
      if (f !== 'rund') {
        svgEl('line', { x1: 32, y1: y, x2: 32, y2: y + ph, stroke: farbe, 'stroke-width': 1 }, svg);
        svgEl('line', { x1: 27, y1: y, x2: 37, y2: y, stroke: farbe, 'stroke-width': 1 }, svg);
        svgEl('line', { x1: 27, y1: y + ph, x2: 37, y2: y + ph, stroke: farbe, 'stroke-width': 1 }, svg);
        var t2 = svgEl('text', { x: 20, y: y + ph / 2, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, fill: farbe, transform: 'rotate(-90 20 ' + (y + ph / 2) + ')' }, svg);
        t2.textContent = 'Breite ' + w + ' cm';
      }
      if (beispiel) {
        var tb = svgEl('text', { x: 50 + boxW / 2, y: 50 + boxH / 2 + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: farbe }, svg);
        tb.textContent = 'Beispiel – Maße eingeben';
      }

      var teile = [];
      if (target && target.farbe) teile.push('Farbe ' + target.farbe);
      if (band) teile.push('Band ' + band.nr + ' ' + band.name);
      teile.push('Farben am Bildschirm können abweichen');
      legende.textContent = teile.join(' · ');
      vorschau.hidden = false;
    }

    function anfrageZeigen(f) {
      var istAnfrage = !!ANFRAGE[f];
      konfig.hidden = istAnfrage;
      if (anfrage) anfrage.hidden = !istAnfrage;
      if (!istAnfrage || !anfrage) return;
      q('[data-anfrage-titel]').textContent = ANFRAGE[f].titel;
      q('[data-anfrage-text]').textContent = ANFRAGE[f].text;
      var farbe = target ? [target.farbe, target.farbnummer].filter(Boolean).join(' ') : '';
      q('[data-anfrage-form]').value = FORM[f] + ' · ' + ART[art];
      q('[data-anfrage-farbe]').value = farbe;
      var wa = q('[data-whatsapp]');
      if (wa) {
        var text = 'Hallo, ich interessiere mich für „' + d.produkt + '“' + (farbe ? ' in Farbe ' + farbe : '') +
          ' (' + FORM[f] + '). Ein Foto meiner ' + (f === 'skizze' ? 'Skizze' : 'Schablone') + ' schicke ich mit.';
        wa.href = 'https://wa.me/' + encodeURIComponent(wa.getAttribute('data-wa')) + '?text=' + encodeURIComponent(text);
      }
    }

    function rechnen() {
      target = aktuelleVariante();
      var f = form();
      anfrageZeigen(f);
      nummerieren();
      if (ANFRAGE[f]) { stand = null; return; }

      var rund = f === 'rund';
      feldLaenge.hidden = rund;
      labelBreite.textContent = rund ? 'Durchmesser' : 'Breite';
      grenzen.textContent = rund
        ? 'Durchmesser 50 bis ' + maxW + ' cm.'
        : 'Eine Seite 50 bis ' + maxW + ' cm, die andere bis ' + maxL + ' cm.';

      var b = lesen(inBreite);
      var l = rund ? { wert: b.wert, komma: false } : lesen(inLaenge);
      var fehlerListe = [];
      if (b.komma || l.komma) fehlerListe.push('Bitte ganze Zentimeter ohne Komma eingeben, zum Beispiel 250.');
      var eingegeben = b.wert > 0 && (rund || l.wert > 0);
      if (eingegeben && !fehlerListe.length) {
        fehlerListe = M.pruefeMasse({ form: f, w: b.wert, l: l.wert, maxW: maxW, maxL: maxL });
      }
      if (!target) fehlerListe.push('Diese Farbe gibt es nicht als Teppich nach Maß – bitte eine andere Farbe wählen.');
      else if (!target.available) fehlerListe.push('Diese Farbe ist derzeit nicht lieferbar.');
      fehler.textContent = fehlerListe.join(' ');
      fehler.hidden = !fehlerListe.length || (!eingegeben && !!target && target.available);

      var gueltig = eingegeben && !fehlerListe.length && !!target && target.available && parseInt(target.price, 10) > 0;
      zeichnen(f, gueltig ? b.wert : BEISPIEL.w, gueltig ? l.wert : (rund ? BEISPIEL.w : BEISPIEL.l), !gueltig);

      var bandFehlt = mitBand && !band;
      if (!gueltig) {
        stand = null;
        rechnung.hidden = true;
        cta.hidden = true;
        cta.disabled = true;
        return;
      }

      var flaeche = M.abrechnungsflaecheM2(f, b.wert, l.wert);
      var preis = parseInt(target.price, 10);
      var menge = M.mengeMitMindestpreis(flaeche, preis, mindestCent);
      var summe = menge * preis;
      var kante = M.umfangM(f, b.wert, l.wert);
      var mindest = menge > M.mengeHundertstelM2(flaeche);
      var masse = rund ? 'Ø ' + b.wert + ' cm' : b.wert + ' × ' + l.wert + ' cm';

      q('[data-masse]').textContent = masse;
      q('[data-flaeche]').textContent = fmt(flaeche) + ' m²';
      q('[data-kante]').textContent = fmt(kante) + ' m';
      q('[data-m2preis]').textContent = euro(preis * 100);
      q('[data-rund-hinweis]').hidden = !(f === 'rund' || f === 'oval');
      var mh = q('[data-mindest-hinweis]');
      mh.hidden = !mindest;
      if (mindest) mh.textContent = 'Mindestpreis für einen Teppich nach Maß: ' + euro(mindestCent) + '.';
      q('[data-summe]').textContent = euro(summe);
      rechnung.hidden = false;

      stand = { form: f, w: b.wert, l: l.wert, flaeche: flaeche, menge: menge, kante: kante, masse: masse, mindest: mindest };
      cta.hidden = false;
      cta.disabled = bandFehlt;
      cta.textContent = bandFehlt ? 'Bitte Bandfarbe wählen' : 'In den Warenkorb – ' + euro(summe);
    }

    function hinzufuegen() {
      if (!stand || !target || !target.available || (mitBand && !band)) return;
      var p = {
        'Einfassung': ART[art],
        'Form': FORM[stand.form],
        'Maße': stand.masse,
        'Fläche (abgerechnet)': fmt(stand.flaeche) + ' m²',
        'Kante umlaufend': fmt(stand.kante) + ' m'
      };
      if (target.farbnummer) p['Farbnummer'] = target.farbnummer;
      if (mitBand) p['Bandfarbe'] = band.nr + ' ' + band.name;
      if (art === 'ketteln') p['Garn'] = 'Ton in Ton';
      if (art === 'cover') p['Vlies'] = 'inklusive';
      if (stand.mindest) p['Mindestpreis'] = 'angewendet';

      var menge = stand.menge;
      var vorher = cta.textContent;
      cta.disabled = true;
      cta.textContent = 'Wird hinzugefügt …';
      warenkorb.hidden = true;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: target.id, quantity: menge, properties: p })
      })
        .then(function (r) { if (!r.ok) throw new Error('add'); return r.json(); })
        .then(function (item) {
          cta.textContent = 'Im Warenkorb';
          cta.classList.add('is-done');
          warenkorb.hidden = false;
          document.dispatchEvent(new CustomEvent('cart:update', {
            bubbles: true,
            detail: { resource: item, sourceId: root.id, data: { itemCount: menge, source: 'product-form-component' } }
          }));
          var drawer = document.querySelector('cart-drawer-component');
          if (drawer && typeof drawer.open === 'function') drawer.open();
          setTimeout(function () { cta.classList.remove('is-done'); cta.textContent = vorher; cta.disabled = false; }, 3000);
        })
        .catch(function () {
          cta.textContent = 'Nicht hinzugefügt – erneut versuchen';
          cta.classList.add('is-error');
          setTimeout(function () { cta.classList.remove('is-error'); cta.textContent = vorher; cta.disabled = false; }, 3000);
        });
    }

    baenderAufbauen();
    root.addEventListener('change', function (e) {
      if (e.target && e.target.name && e.target.name.indexOf('tp-ek-form-') === 0) rechnen();
    });
    [inBreite, inLaenge].forEach(function (i) { if (i) i.addEventListener('input', rechnen); });
    cta.addEventListener('click', hinzufuegen);
    // Farbwahl schreibt ?variant= in die URL, ohne neu zu laden.
    document.addEventListener('change', function (e) {
      if (!root.contains(e.target)) setTimeout(rechnen, 120);
    });
    document.addEventListener('variant:update', function () { setTimeout(rechnen, 60); });
    window.addEventListener('popstate', rechnen);

    // Nach dem Absenden des Anfrageformulars laedt die Seite neu - die
    // Erfolgs- oder Fehlermeldung steht im Anfragebereich, also dorthin.
    if (root.querySelector('[data-anfrage-status]')) {
      var r = root.querySelector('input[name^="tp-ek-form-"][value="skizze"]') ||
              root.querySelector('input[name^="tp-ek-form-"][value="schablone"]');
      if (r) r.checked = true;
    }
    rechnen();
  }

  function alle() { document.querySelectorAll('[data-tp-ek]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alle);
  else alle();
  document.addEventListener('shopify:block:select', alle);
  document.addEventListener('shopify:section:load', alle);
})();
