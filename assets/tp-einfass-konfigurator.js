/*
  Bedienung und Vorschau fuer blocks/tp-einfass-konfigurator.liquid.
  Gerechnet wird ausschliesslich mit window.TPMass
  (assets/tp-masstepich-rechnung.js). Fail closed: fehlen Daten, Rechenkern
  oder eine gueltige Variante, bleibt der Warenkorb-Knopf verborgen.
*/
(function () {
  'use strict';

  var ART = { cover: 'Cover', ketteln: 'Gekettelt', einfassband: 'Einfassband', paspelband: 'Paspelband' };
  var KANTE = {
    cover: 'Kante umgeschlagen, mit Vlies',
    ketteln: 'Garn Ton in Ton',
    einfassband: 'ca. 3 cm breit',
    paspelband: 'ca. 1 cm breit'
  };
  var FORM = { rechteck: 'Rechteck', rund: 'Rund', oval: 'Oval', schablone: 'Schablone', skizze: 'Skizze' };
  var ANFRAGE = {
    schablone: {
      titel: 'Teppich nach Schablone', wort: 'Schablone',
      text: 'Schicken Sie uns ein Foto Ihrer Schablone mit den wichtigsten Maßen. Wir melden uns mit einem Angebot.'
    },
    skizze: {
      titel: 'Teppich nach Skizze', wort: 'Skizze',
      text: 'Zeichnen Sie die Form mit Maßen auf und schicken Sie uns ein Foto. Wir melden uns mit einem Angebot.'
    }
  };
  // Beliebte Groessen als Abkuerzung - nur, was in die Grenzen des Produkts passt.
  var GROESSEN = { eckig: [[160, 230], [200, 300], [250, 350], [300, 400]], rund: [160, 200, 240] };
  var BAND_CM = { einfassband: 3, paspelband: 1 };
  var BEISPIEL = { w: 200, l: 300 };
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var zaehler = 0;

  function fmt(n, d) {
    var s = d == null ? 2 : d;
    return Number(n).toLocaleString('de-DE', { minimumFractionDigits: s, maximumFractionDigits: s });
  }
  function euro(cent) { return fmt(cent / 100) + ' €'; }
  function leeren(node) { while (node.firstChild) node.removeChild(node.firstChild); }
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
    var laengeTeile = root.querySelectorAll('[data-feld-laenge]');
    var labelBreite = q('[data-label-breite]');
    var groessen = q('[data-groessen]');
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
    var gewaehlt = null;
    var groessenForm = null;
    var formSchritt = q('[data-schritt="form"]');
    var formSchrittAus = formSchritt ? formSchritt.hidden : true;

    // Regel 1/5: Farben ohne freigegebene Variante gar nicht erst anbieten. Die
    // Farbwahl ist ein eigener Theme-Block und kennt die Freigabe nicht.
    if (varianten.some(function (v) { return Array.isArray(v.optionen); })) {
      var erlaubt = {};
      varianten.forEach(function (v) { (v.optionen || []).forEach(function (o) { erlaubt[String(o)] = true; }); });
      document.querySelectorAll('input[name^="color-swatch-"]').forEach(function (input) {
        if (erlaubt[input.value]) return;
        var label = input.closest('label');
        if (label) label.style.display = 'none';
        input.disabled = true;
      });
    }

    function form() {
      var c = root.querySelector('input[name^="tp-ek-form-"]:checked');
      return c ? c.value : 'rechteck';
    }

    // Nur Varianten aus der Freigabeliste. Die Farbwahl meldet ihre Variante
    // per tp:farbe-wechsel; sonst gilt ?variant= - eine fremde ID fuehrt zu
    // keiner Auswahl statt zu einer geratenen.
    function aktuelleVariante() {
      var ausUrl = new URLSearchParams(window.location.search).get('variant');
      var id = gewaehlt || ausUrl || String(d.selected_id || '');
      var v = varianten.filter(function (x) { return String(x.id) === String(id); })[0];
      if (v) return v;
      if (gewaehlt || ausUrl) return null;
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

    function groessenAufbauen(f) {
      if (!groessen || groessenForm === f) return;
      groessenForm = f;
      leeren(groessen);
      var liste = f === 'rund'
        ? GROESSEN.rund.filter(function (x) { return x <= maxW; }).map(function (x) { return [x, x]; })
        : GROESSEN.eckig.filter(function (p) { return Math.min(p[0], p[1]) <= maxW && Math.max(p[0], p[1]) <= maxL; });
      liste.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tp-ek__groesse';
        b.textContent = f === 'rund' ? 'Ø ' + p[0] : p[0] + ' × ' + p[1];
        b.setAttribute('data-w', p[0]);
        b.setAttribute('data-l', p[1]);
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () {
          inBreite.value = p[0];
          if (inLaenge) inLaenge.value = p[1];
          rechnen();
        });
        groessen.appendChild(b);
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
        var punkt = document.createElement('span');
        punkt.style.background = b.hex;
        label.appendChild(input);
        label.appendChild(punkt);
        box.appendChild(label);
        input.addEventListener('change', function () {
          band = b;
          var name = q('[data-band-name]');
          if (name) name.textContent = b.nr + ' · ' + b.name;
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

    function muster(defs, id, groesse) {
      if (!target || !target.bild) return '#d9d4cb';
      var pat = svgEl('pattern', { id: id, patternUnits: 'userSpaceOnUse', width: groesse, height: groesse }, defs);
      var img = svgEl('image', { width: groesse, height: groesse, preserveAspectRatio: 'xMidYMid slice' }, pat);
      img.setAttribute('href', target.bild);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', target.bild);
      return 'url(#' + id + ')';
    }

    function masslinie(x1, y1, x2, y2, text) {
      var ink = 'currentColor';
      var senkrecht = x1 === x2;
      svgEl('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: ink, 'stroke-width': 1 }, svg);
      if (senkrecht) {
        svgEl('line', { x1: x1 - 5, y1: y1, x2: x1 + 5, y2: y1, stroke: ink, 'stroke-width': 1 }, svg);
        svgEl('line', { x1: x1 - 5, y1: y2, x2: x1 + 5, y2: y2, stroke: ink, 'stroke-width': 1 }, svg);
        var ym = (y1 + y2) / 2;
        var t = svgEl('text', { x: x1 - 11, y: ym, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 600, fill: ink, transform: 'rotate(-90 ' + (x1 - 11) + ' ' + ym + ')' }, svg);
        t.textContent = text;
      } else {
        svgEl('line', { x1: x1, y1: y1 - 5, x2: x1, y2: y1 + 5, stroke: ink, 'stroke-width': 1 }, svg);
        svgEl('line', { x1: x2, y1: y1 - 5, x2: x2, y2: y1 + 5, stroke: ink, 'stroke-width': 1 }, svg);
        var t2 = svgEl('text', { x: (x1 + x2) / 2, y: y1 - 9, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 600, fill: ink }, svg);
        t2.textContent = text;
      }
    }

    // Lupe unten rechts: die Kante in Nahaufnahme.
    function lupe(defs) {
      var lx = 314, ly = 204, r = 36, ky = ly + 8;
      var clip = svgEl('clipPath', { id: uid + '-lupe' }, defs);
      svgEl('circle', { cx: lx, cy: ly, r: r }, clip);
      var g = svgEl('g', { 'clip-path': 'url(#' + uid + '-lupe)' }, svg);
      svgEl('rect', { x: lx - r, y: ly - r, width: 2 * r, height: 2 * r, fill: '#efece6' }, g);
      svgEl('rect', { x: lx - r, y: ly - r, width: 2 * r, height: ky - (ly - r), fill: muster(defs, uid + '-gross', 240) }, g);
      if (art === 'cover') {
        svgEl('rect', { x: lx - r, y: ky - 12, width: 2 * r, height: 12, fill: 'rgba(0,0,0,.22)' }, g);
        svgEl('line', { x1: lx - r, y1: ky - 12, x2: lx + r, y2: ky - 12, stroke: 'rgba(255,255,255,.7)', 'stroke-width': 1.2 }, g);
        svgEl('rect', { x: lx - r, y: ky, width: 2 * r, height: 3, fill: 'rgba(0,0,0,.18)' }, g);
      } else if (art === 'ketteln') {
        for (var x = lx - r; x < lx + r; x += 4) {
          svgEl('line', { x1: x, y1: ky - 7, x2: x + 3, y2: ky, stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1.4 }, g);
        }
      } else {
        var hoehe = art === 'einfassband' ? 11 : 4;
        svgEl('rect', { x: lx - r, y: ky - hoehe, width: 2 * r, height: hoehe, fill: band ? band.hex : 'rgba(255,255,255,.65)' }, g);
        if (!band) svgEl('rect', { x: lx - r, y: ky - hoehe, width: 2 * r, height: hoehe, fill: 'none', stroke: 'rgba(0,0,0,.35)', 'stroke-dasharray': '4 3' }, g);
        if (art === 'einfassband') svgEl('line', { x1: lx - r, y1: ky - hoehe + 2, x2: lx + r, y2: ky - hoehe + 2, stroke: 'rgba(255,255,255,.55)', 'stroke-dasharray': '3 2' }, g);
      }
      svgEl('circle', { cx: lx, cy: ly, r: r, fill: 'none', stroke: '#fff', 'stroke-width': 4 }, svg);
      svgEl('circle', { cx: lx, cy: ly, r: r + 2, fill: 'none', stroke: 'rgba(0,0,0,.18)', 'stroke-width': 1 }, svg);
    }

    function zeichnen(f, w, l, beispiel) {
      leeren(svg);
      var horiz = f === 'rund' ? w : l;
      var s = Math.min(270 / horiz, 170 / w);
      var pw = horiz * s, ph = w * s;
      var x = 46 + (270 - pw) / 2, y = 44 + (170 - ph) / 2;
      var defs = svgEl('defs', {}, svg);
      var fuellung = muster(defs, uid + '-muster', 110);

      function umriss(extra) {
        var a = extra || {};
        if (f === 'rund') return svgEl('circle', Object.assign({ cx: x + pw / 2, cy: y + ph / 2, r: pw / 2 }, a), svg);
        if (f === 'oval') return svgEl('ellipse', Object.assign({ cx: x + pw / 2, cy: y + ph / 2, rx: pw / 2, ry: ph / 2 }, a), svg);
        return svgEl('rect', Object.assign({ x: x, y: y, width: pw, height: ph, rx: 2 }, a), svg);
      }

      umriss({ fill: fuellung, opacity: beispiel ? 0.4 : 1 });
      if (art === 'cover') {
        umriss({ fill: 'none', stroke: fuellung, 'stroke-width': 9 });
        umriss({ fill: 'none', stroke: 'rgba(0,0,0,.22)', 'stroke-width': 9 });
        umriss({ fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 1 });
      } else if (art === 'ketteln') {
        umriss({ fill: 'none', stroke: 'rgba(0,0,0,.38)', 'stroke-width': 4, 'stroke-dasharray': '1.4 1.4' });
      } else {
        var px = Math.max(art === 'einfassband' ? 6 : 3, BAND_CM[art] * s * 2);
        umriss(band
          ? { fill: 'none', stroke: band.hex, 'stroke-width': px }
          : { fill: 'none', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 2, 'stroke-dasharray': '6 4' });
      }

      masslinie(x, 28, x + pw, 28, f === 'rund' ? 'Ø ' + w + ' cm' : l + ' cm');
      if (f !== 'rund') masslinie(28, y, 28, y + ph, w + ' cm');
      if (beispiel) {
        var tb = svgEl('text', { x: x + pw / 2, y: y + ph / 2 + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: 'currentColor' }, svg);
        tb.textContent = 'Maße eingeben';
      } else {
        lupe(defs);
      }

      legende.textContent = ART[art] + (band ? ' ' + band.nr + ' ' + band.name : '') + ' · ' + KANTE[art];
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
          ' (' + FORM[f] + '). Ein Foto meiner ' + ANFRAGE[f].wort + ' schicke ich mit.';
        wa.href = 'https://wa.me/' + encodeURIComponent(wa.getAttribute('data-wa')) + '?text=' + encodeURIComponent(text);
      }
    }

    function rechnen() {
      target = aktuelleVariante();
      var f = form();
      // Fail closed: fremde oder nicht freigegebene Variante - weder Angebot noch Anfrage.
      if (formSchritt) formSchritt.hidden = !target || formSchrittAus;
      if (!target) {
        konfig.hidden = true;
        if (anfrage) anfrage.hidden = true;
        stand = null;
        return;
      }
      anfrageZeigen(f);
      nummerieren();
      if (ANFRAGE[f]) { stand = null; return; }

      var rund = f === 'rund';
      laengeTeile.forEach(function (el) { el.hidden = rund; });
      labelBreite.textContent = rund ? 'Durchmesser' : 'Breite';
      grenzen.textContent = rund ? 'Möglich: Ø 50 bis ' + maxW + ' cm' : 'Möglich: bis ' + maxW + ' × ' + maxL + ' cm';
      groessenAufbauen(rund ? 'rund' : 'eckig');

      var b = lesen(inBreite);
      var l = rund ? { wert: b.wert, komma: false } : lesen(inLaenge);
      if (groessen) {
        groessen.querySelectorAll('button').forEach(function (btn) {
          var aktiv = +btn.getAttribute('data-w') === b.wert && (rund || +btn.getAttribute('data-l') === l.wert);
          btn.setAttribute('aria-pressed', aktiv ? 'true' : 'false');
        });
      }
      var fehlerListe = [];
      if (b.komma || l.komma) fehlerListe.push('Bitte ganze Zentimeter ohne Komma eingeben, zum Beispiel 250.');
      var eingegeben = b.wert > 0 && (rund || l.wert > 0);
      if (eingegeben && !fehlerListe.length) {
        fehlerListe = M.pruefeMasse({ form: f, w: b.wert, l: l.wert, maxW: maxW, maxL: maxL });
      }
      if (!target.available) fehlerListe.push('Diese Farbe ist derzeit nicht lieferbar.');
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
      // Angezeigt und in den Warenkorb geschrieben wird, was abgerechnet wird:
      // die Flaeche aufgerundet auf 0,01 m2 (201 x 301 cm -> 6,06 m2).
      var abgerechnet = M.mengeHundertstelM2(flaeche) / 100;
      var preis = parseInt(target.price, 10);
      var menge = M.mengeMitMindestpreis(flaeche, preis, mindestCent);
      var summe = menge * preis;
      var kante = M.umfangM(f, b.wert, l.wert);
      var mindest = menge > M.mengeHundertstelM2(flaeche);
      var masse = rund ? 'Ø ' + b.wert + ' cm' : b.wert + ' × ' + l.wert + ' cm';

      q('[data-masse]').textContent = masse;
      q('[data-flaeche]').textContent = fmt(abgerechnet) + ' m²';
      q('[data-kante]').textContent = 'Kante ' + fmt(kante) + ' m';
      q('[data-m2preis]').textContent = euro(preis * 100);
      q('[data-rund-hinweis]').hidden = !(f === 'rund' || f === 'oval');
      var mh = q('[data-mindest-hinweis]');
      mh.hidden = !mindest;
      if (mindest) mh.textContent = 'Mindestpreis ' + euro(mindestCent) + ' für kleine Teppiche.';
      q('[data-summe]').textContent = euro(summe);
      rechnung.hidden = false;

      stand = { form: f, w: b.wert, l: l.wert, flaeche: abgerechnet, menge: menge, kante: kante, masse: masse, mindest: mindest };
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
    document.addEventListener('tp:farbe-wechsel', function (e) {
      gewaehlt = e.detail && e.detail.variantId ? String(e.detail.variantId) : null;
      rechnen();
    });
    // Farbwahlen ohne eigenes Event schreiben nur ?variant= in die URL.
    document.addEventListener('change', function (e) {
      if (!root.contains(e.target)) setTimeout(rechnen, 120);
    });
    document.addEventListener('variant:update', function () { setTimeout(rechnen, 60); });
    window.addEventListener('popstate', function () { gewaehlt = null; rechnen(); });

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
