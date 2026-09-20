/*
  Bedienung und Vorschau fuer blocks/tp-einfass-konfigurator.liquid.
  Gerechnet wird ausschliesslich mit window.TPMass
  (assets/tp-masstepich-rechnung.js). Fail closed: fehlen Daten, Rechenkern
  oder eine gueltige Variante, bleibt der Warenkorb-Knopf verborgen.
*/
(function () {
  'use strict';

  var ART = { cover: 'Cover', ketteln: 'Gekettelt', einfassband: 'Einfassband', paspelband: 'Paspelband' };
  // Vergroesserung in der Kantenlupe und Rand, damit die Kachel auch die
  // aussen liegende Cover-Kontur (stroke-width 9) noch mit abdeckt.
  var LUPE_ZOOM = 3.4;
  var MUSTER_RAND = 12;
  /*
    Produktfotos zeigen den Belag nicht randlos: sie haben weissen Hintergrund,
    einen Schlagschatten und oft die sichtbare Kante des fotografierten Stuecks.
    Voll eingepasst entsteht daraus ein Teppich im Teppich - der fremde Rahmen
    laeuft mitten durch die Flaeche des Kunden. Deshalb wird nur die Mitte des
    Fotos genommen: das Bild wird ueber die Flaeche hinaus vergroessert und
    zentriert, der Rand faellt heraus. Uebrig bleibt reines Material.
  */
  var MATERIAL_ZOOM = 1.9;
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
    // Groesste Breite: je Farbe aus den Rollenbreiten des Teppichbodens (Liquid liefert
    // sie an der Variante), sonst der Wert ueber alle Farben. Wird in rechnen() nach der
    // Variantenwahl neu gesetzt.
    var maxW = d.max_breite_cm;
    var groessenMaxW = null;
    var maxL = d.max_laenge_cm;
    var mindestCent = parseInt(d.mindestpreis_cent, 10) || 0;
    // Preis je 0,01 laufendem Meter Kante. Ohne Service-Produkt wird die Kante
    // nicht getrennt berechnet - die Bandarten rechnen alles ueber den m2-Preis.
    var kettel = (d.kettel && d.kettel.id && parseInt(d.kettel.price, 10) > 0) ? d.kettel : null;
    // TP-005: true nur, wenn der Merchant ein Kettelservice-Produkt
    // konfiguriert hat, dessen Variante aber gerade nicht verfuegbar/bepreist
    // ist - anders als "kein Service konfiguriert" (kettel bleibt dann null,
    // legitimer Inklusivpreis). Sperrt unten den Kauf statt den Teppich
    // stillschweigend ohne die gewaehlte Kettelung anzubieten.
    var kettelServiceFailed = !!d.kettel_service_failed;
    // Rollenbreiten der Meterware in cm, nur fuer die interne Warenkorbzeile.
    var rollen = (d.rollen || []).map(Number).filter(function (n) { return n > 0; });
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
    var buehne = q('[data-buehne]');
    var raumbild = q('[data-raumbild]');
    var kulisse = q('[data-kulisse]');
    var bodenEbene = q('[data-boden]');
    var teppich = q('[data-teppich]');
    var raeumeBox = q('[data-raeume]');
    var ansichtBox = root.querySelector('.tp-ek__ansicht');
    var legende = q('[data-legende]');
    var rechnung = q('[data-rechnung]');
    var cta = q('[data-cta]');
    var warenkorb = q('[data-warenkorb]');
    var band = null;
    var target = null;
    var stand = null;
    // Waehrend der Warenkorb-Aufruf laeuft, darf rechnen() den Knopf nicht
    // wieder freigeben - sonst legt ein zweiter Klick eine zweite Zeile an.
    var inFlight = false;
    var gewaehlt = null;
    var groessenForm = null;
    // Raumansicht: Liste aus dem Block, Massstab aus den Einstellungen.
    var raeume = (d.raeume || []).filter(Boolean);
    var raum = raeume.length ? raeume[0].key : null;
    var ansicht = raeume.length ? 'raum' : 'plan';
    var bodenProzent = Number(d.boden_prozent) > 0 ? Number(d.boden_prozent) : 34;
    var raumBreiteCm = Number(d.raum_breite_cm) > 0 ? Number(d.raum_breite_cm) : 420;
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
      if (!groessen || (groessenForm === f && groessenMaxW === maxW)) return;
      groessenForm = f;
      groessenMaxW = maxW;
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

    // wert: ganze cm (aufgerundet), 0 = nichts Brauchbares. komma: "250,5" in
    // einem number-Feld (badInput). ungueltig: etwas eingegeben, aber keine
    // positive Zahl ("0", "-5") - das ist keine leere Eingabe und bekommt eine
    // Meldung statt eines stillen, verborgenen Knopfs.
    function lesen(input) {
      if (!input) return { wert: 0, komma: false, ungueltig: false };
      var komma = !!(input.validity && input.validity.badInput);
      var roh = parseFloat(input.value);
      var leer = String(input.value || '').trim() === '';
      return { wert: roh > 0 ? Math.ceil(roh) : 0, komma: komma, ungueltig: !komma && !leer && !(roh > 0) };
    }

    /*
      Eine Kachel, nie mehrere. patternUnits userSpaceOnUse wiederholt die Kachel,
      sobald die gefuellte Flaeche groesser ist als width/height - genau so entstand
      das Kachelraster statt einer zusammenhaengenden Teppichflaeche. Deshalb wird
      die Kachel hier auf den Bereich gelegt, den sie fuellen soll (x/y/w/h), und ist
      damit deckungsgleich mit ihm. 'slice' skaliert das Bild seitenverhaeltnistreu
      auf, schneidet den Ueberstand ab und verzerrt dadurch nichts.

      Fuer die Lupe wird bewusst eine groessere Kachel auf den kleinen Kreisbereich
      gelegt: auch das ist genau eine Kachel, nur staerker vergroessert.
    */
    function muster(defs, id, x, y, breite, hoehe, zoom) {
      if (!target || !target.bild) return '#d9d4cb';
      // Groesser rendern und auf die Flaeche zentrieren: der Ausschnitt bleibt
      // die Bildmitte, die Kachel selbst bleibt genau eine.
      var z = zoom || 1;
      var bw = breite * z, bh = hoehe * z;
      var pat = svgEl('pattern', {
        id: id, patternUnits: 'userSpaceOnUse',
        x: x - (bw - breite) / 2, y: y - (bh - hoehe) / 2, width: bw, height: bh
      }, defs);
      var img = svgEl('image', {
        x: 0, y: 0, width: bw, height: bh,
        preserveAspectRatio: 'xMidYMid slice'
      }, pat);
      img.setAttribute('href', target.bild);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', target.bild);
      return 'url(#' + id + ')';
    }

    // Weicher Schlagschatten: laesst den Zuschnitt auf dem Boden liegen statt
    // als Flaeche im Nichts zu schweben.
    function schatten(defs) {
      var f = svgEl('filter', { id: uid + '-schatten', x: '-20%', y: '-20%', width: '140%', height: '150%' }, defs);
      svgEl('feDropShadow', { dx: 0, dy: 4, stdDeviation: 5, 'flood-color': '#2b2622', 'flood-opacity': 0.24 }, f);
      return 'url(#' + uid + '-schatten)';
    }

    /*
      Bemassung wie in einer technischen Zeichnung: duenne Hilfslinien, kurze
      Anschlagstriche, die Zahl auf der Linie und in normaler Staerke. Die
      fette Beschriftung von vorher zog den Blick vom Produkt weg - gemessen
      wird hier der Teppich, nicht der Text.
    */
    function masslinie(x1, y1, x2, y2, text) {
      var ink = 'currentColor';
      var senkrecht = x1 === x2;
      var g = svgEl('g', { opacity: 0.62 }, svg);
      svgEl('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: ink, 'stroke-width': 0.9 }, g);
      if (senkrecht) {
        svgEl('line', { x1: x1 - 3.5, y1: y1, x2: x1 + 3.5, y2: y1, stroke: ink, 'stroke-width': 0.9 }, g);
        svgEl('line', { x1: x1 - 3.5, y1: y2, x2: x1 + 3.5, y2: y2, stroke: ink, 'stroke-width': 0.9 }, g);
        var ym = (y1 + y2) / 2;
        var t = svgEl('text', { x: x1 - 9, y: ym, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 500, 'letter-spacing': 0.2, fill: ink, transform: 'rotate(-90 ' + (x1 - 9) + ' ' + ym + ')' }, g);
        t.textContent = text;
      } else {
        svgEl('line', { x1: x1, y1: y1 - 3.5, x2: x1, y2: y1 + 3.5, stroke: ink, 'stroke-width': 0.9 }, g);
        svgEl('line', { x1: x2, y1: y1 - 3.5, x2: x2, y2: y1 + 3.5, stroke: ink, 'stroke-width': 0.9 }, g);
        var t2 = svgEl('text', { x: (x1 + x2) / 2, y: y1 - 7, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 500, 'letter-spacing': 0.2, fill: ink }, g);
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
      svgEl('rect', { x: lx - r, y: ly - r, width: 2 * r, height: ky - (ly - r), fill: muster(defs, uid + '-gross', lx - r, ly - r, 2 * r, 2 * r, LUPE_ZOOM) }, g);
      if (art === 'cover') {
        svgEl('rect', { x: lx - r, y: ky - 12, width: 2 * r, height: 12, fill: 'rgba(0,0,0,.22)' }, g);
        svgEl('line', { x1: lx - r, y1: ky - 12, x2: lx + r, y2: ky - 12, stroke: 'rgba(255,255,255,.7)', 'stroke-width': 1.2 }, g);
        svgEl('rect', { x: lx - r, y: ky, width: 2 * r, height: 3, fill: 'rgba(0,0,0,.18)' }, g);
      } else if (art === 'ketteln') {
        // Nahaufnahme der Wicklung: dicht stehende Garnschlingen ueber der
        // Materialkante, in derselben Handschrift wie die Kante in der Flaeche.
        svgEl('rect', { x: lx - r, y: ky - 8, width: 2 * r, height: 8, fill: 'rgba(0,0,0,.10)' }, g);
        for (var x = lx - r; x < lx + r; x += 3) {
          svgEl('line', { x1: x, y1: ky - 8, x2: x + 1.6, y2: ky, stroke: 'rgba(0,0,0,.34)', 'stroke-width': 1.7, 'stroke-linecap': 'round' }, g);
        }
        svgEl('line', { x1: lx - r, y1: ky, x2: lx + r, y2: ky, stroke: 'rgba(0,0,0,.30)', 'stroke-width': 0.9 }, g);
      } else {
        var hoehe = art === 'einfassband' ? 11 : 4;
        svgEl('rect', { x: lx - r, y: ky - hoehe, width: 2 * r, height: hoehe, fill: band ? band.hex : 'rgba(255,255,255,.65)' }, g);
        if (!band) svgEl('rect', { x: lx - r, y: ky - hoehe, width: 2 * r, height: hoehe, fill: 'none', stroke: 'rgba(0,0,0,.35)', 'stroke-dasharray': '4 3' }, g);
        if (art === 'einfassband') svgEl('line', { x1: lx - r, y1: ky - hoehe + 2, x2: lx + r, y2: ky - hoehe + 2, stroke: 'rgba(255,255,255,.55)', 'stroke-dasharray': '3 2' }, g);
      }
      svgEl('circle', { cx: lx, cy: ly, r: r, fill: 'none', stroke: '#fff', 'stroke-width': 2.5 }, svg);
      svgEl('circle', { cx: lx, cy: ly, r: r + 1.25, fill: 'none', stroke: 'rgba(0,0,0,.14)', 'stroke-width': 0.9 }, svg);
    }

    /*
      Raumansicht. Das Foto (oder ersatzweise eine gezeichnete Kulisse) liefert
      nur die Umgebung; der Teppich selbst wird aus der aktuellen Auswahl
      aufgebaut - Textur der Variante, Mass aus den Feldern, Kante aus der Art.
      Damit gilt die Ansicht fuer jedes Produkt, das diesen Block verwendet,
      ohne ein einziges fertiges Raumbild je Farbe.
    */
    function raumDaten() {
      for (var i = 0; i < raeume.length; i++) if (raeume[i].key === raum) return raeume[i];
      return null;
    }

    function kulisseZeichnen() {
      if (!kulisse) return;
      leeren(kulisse);
      var hy = 240 * (bodenProzent / 100);
      svgEl('rect', { x: 0, y: 0, width: 360, height: 240, fill: raum === 'kinderzimmer' ? '#f8f1e7' : '#efe9df' }, kulisse);
      svgEl('rect', { x: 0, y: hy, width: 360, height: 240 - hy, fill: '#e3d8c8' }, kulisse);
      // Dielen laufen auf den Fluchtpunkt zu und machen die Tiefe lesbar.
      for (var px = -120; px < 480; px += 40) {
        svgEl('line', { x1: px, y1: 240, x2: 180 + (px - 180) * 0.34, y2: hy, stroke: 'rgba(132,91,47,.18)', 'stroke-width': 1 }, kulisse);
      }
      svgEl('line', { x1: 0, y1: hy, x2: 360, y2: hy, stroke: 'rgba(132,91,47,.28)', 'stroke-width': 1.2 }, kulisse);
      if (raum === 'esszimmer') {
        svgEl('ellipse', { cx: 180, cy: hy + 6, rx: 78, ry: 17, fill: '#9a704c' }, kulisse);
        svgEl('rect', { x: 118, y: hy - 22, width: 20, height: 28, rx: 4, fill: '#b88c63' }, kulisse);
        svgEl('rect', { x: 222, y: hy - 22, width: 20, height: 28, rx: 4, fill: '#b88c63' }, kulisse);
      } else if (raum === 'schlafzimmer') {
        svgEl('rect', { x: 76, y: hy - 48, width: 208, height: 48, rx: 5, fill: '#dce1df' }, kulisse);
        svgEl('rect', { x: 89, y: hy - 38, width: 74, height: 20, rx: 4, fill: '#f5f3ee' }, kulisse);
        svgEl('rect', { x: 197, y: hy - 38, width: 74, height: 20, rx: 4, fill: '#f5f3ee' }, kulisse);
      } else if (raum === 'kinderzimmer') {
        svgEl('circle', { cx: 86, cy: hy - 28, r: 18, fill: '#e8c76b' }, kulisse);
        svgEl('rect', { x: 196, y: hy - 40, width: 84, height: 40, rx: 6, fill: '#a8c8c2' }, kulisse);
      } else if (raum === 'flur') {
        svgEl('rect', { x: 112, y: hy - 62, width: 136, height: 62, rx: 3, fill: '#e2dbd0' }, kulisse);
        svgEl('rect', { x: 128, y: hy - 52, width: 104, height: 52, fill: '#d0c1af' }, kulisse);
      } else {
        svgEl('rect', { x: 44, y: hy - 46, width: 272, height: 46, rx: 10, fill: '#e8e1d5' }, kulisse);
        svgEl('rect', { x: 58, y: hy - 33, width: 90, height: 33, rx: 8, fill: '#d6cbbd' }, kulisse);
        svgEl('rect', { x: 212, y: hy - 33, width: 90, height: 33, rx: 8, fill: '#d6cbbd' }, kulisse);
      }
    }

    function raumZeichnen(f, w, l) {
      if (!buehne || !teppich || !raum) return;
      var r = raumDaten();
      var foto = r && r.bild;
      if (raumbild) {
        if (foto) { raumbild.src = foto; raumbild.alt = 'Beispielraum ' + r.label; }
        raumbild.hidden = !foto;
      }
      if (kulisse) kulisse.style.display = foto ? 'none' : '';
      if (!foto) kulisseZeichnen();

      if (bodenEbene) bodenEbene.style.setProperty('--tp-ek-horizont', bodenProzent + '%');
      // Waagerechte Ausdehnung im Raum ist die lange Seite, wie in der Zeichnung.
      var quer = f === 'rund' ? w : l;
      var tief = w;
      var breiteProzent = Math.max(8, Math.min(86, (quer / raumBreiteCm) * 100));
      teppich.style.setProperty('--tp-ek-breite', breiteProzent.toFixed(2) + '%');
      teppich.style.setProperty('--tp-ek-seiten', (quer / tief).toFixed(3));
      teppich.style.setProperty('--tp-ek-liegt', (bodenProzent + (100 - bodenProzent) * 0.52).toFixed(1) + '%');
      teppich.style.setProperty('--tp-ek-radius', f === 'rund' || f === 'oval' ? '50%' : '2px');
      teppich.style.setProperty('--tp-ek-textur', target && target.bild ? 'url("' + target.bild + '")' : 'none');

      if (BAND_CM[art]) {
        // Bandbreite im gleichen Massstab wie der Teppich, Untergrenze fuer Sichtbarkeit.
        var proCm = (buehne.clientWidth || 360) / raumBreiteCm;
        teppich.setAttribute('data-tp-kante', 'band');
        teppich.style.setProperty('--tp-ek-bandbreite', Math.max(2, BAND_CM[art] * proCm).toFixed(1) + 'px');
        teppich.style.setProperty('--tp-ek-bandfarbe', band ? band.hex : 'rgba(255,255,255,.75)');
      } else {
        teppich.setAttribute('data-tp-kante', art);
        teppich.style.removeProperty('--tp-ek-bandbreite');
        teppich.style.removeProperty('--tp-ek-bandfarbe');
      }
    }

    function ansichtSetzen(wahl) {
      ansicht = raeume.length ? wahl : 'plan';
      if (ansichtBox) {
        ansichtBox.hidden = !raeume.length;
        ansichtBox.querySelectorAll('button').forEach(function (b) {
          b.setAttribute('aria-pressed', b.getAttribute('data-ansicht') === ansicht ? 'true' : 'false');
        });
      }
      // Umschalten ueber eine eigene Klasse: das hidden-Attribut verliert gegen
      // die display-Regeln des Themes, die Ansicht bliebe dann stumm leer.
      if (buehne) buehne.classList.toggle('is-aus', ansicht !== 'raum');
      if (raeumeBox) raeumeBox.classList.toggle('is-aus', ansicht !== 'raum');
      if (svg) svg.classList.toggle('is-aus', ansicht === 'raum');
    }

    function raeumeAufbauen() {
      if (!raeumeBox || !raeume.length) return;
      raeume.forEach(function (r) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = r.label;
        b.setAttribute('aria-pressed', r.key === raum ? 'true' : 'false');
        b.addEventListener('click', function () {
          raum = r.key;
          raeumeBox.querySelectorAll('button').forEach(function (el) {
            el.setAttribute('aria-pressed', el === b ? 'true' : 'false');
          });
          rechnen();
        });
        raeumeBox.appendChild(b);
      });
      if (ansichtBox) {
        ansichtBox.querySelectorAll('button').forEach(function (b) {
          b.addEventListener('click', function () { ansichtSetzen(b.getAttribute('data-ansicht')); });
        });
      }
    }

    function zeichnen(f, w, l, beispiel) {
      leeren(svg);
      var horiz = f === 'rund' ? w : l;
      var s = Math.min(270 / horiz, 170 / w);
      var pw = horiz * s, ph = w * s;
      var x = 46 + (270 - pw) / 2, y = 44 + (170 - ph) / 2;
      var defs = svgEl('defs', {}, svg);
      var fuellung = muster(defs, uid + '-muster',
        x - MUSTER_RAND, y - MUSTER_RAND, pw + 2 * MUSTER_RAND, ph + 2 * MUSTER_RAND,
        MATERIAL_ZOOM);

      function umriss(extra) {
        var a = extra || {};
        if (f === 'rund') return svgEl('circle', Object.assign({ cx: x + pw / 2, cy: y + ph / 2, r: pw / 2 }, a), svg);
        if (f === 'oval') return svgEl('ellipse', Object.assign({ cx: x + pw / 2, cy: y + ph / 2, rx: pw / 2, ry: ph / 2 }, a), svg);
        return svgEl('rect', Object.assign({ x: x, y: y, width: pw, height: ph, rx: 2 }, a), svg);
      }

      /*
        Das Produkt ist immer zu sehen, auch bevor Masse eingegeben sind: der
        Kunde soll den Belag beurteilen koennen, nicht eine blasse Platzhalter-
        flaeche. Frueher lag der Beispielzustand auf 40 % Deckkraft und sah
        nach Fehler aus. Was fehlt, sagt jetzt der Hinweis unter der Flaeche.
      */
      /*
        Die Kante darf nicht breiter wirken als sie ist. Bei einem Laeufer
        80 x 2000 cm ist die kurze Seite nur rund 30 px hoch - eine feste
        Naht von 4,5 px entspraeche dort etwa 15 cm Kettelrand. Deshalb an der
        schmalen Seite mitskalieren, mit einer Untergrenze, damit die Kante
        bei grossen Teppichen nicht verschwindet.
      */
      var schmal = Math.min(pw, ph);
      function kantePx(basis) {
        return Math.max(1.6, Math.min(basis, schmal * 0.13));
      }

      umriss({ fill: fuellung, filter: schatten(defs) });
      if (art === 'cover') {
        umriss({ fill: 'none', stroke: fuellung, 'stroke-width': kantePx(9) });
        umriss({ fill: 'none', stroke: 'rgba(0,0,0,.22)', 'stroke-width': kantePx(9) });
        umriss({ fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 1 });
      } else if (art === 'ketteln') {
        /*
          Kettelung ist kein Strichrand, sondern Garn, das dicht um die Kante
          gewickelt ist - Ton in Ton mit dem Belag. Deshalb erst ein Streifen
          aus dem Material selbst, darauf die feine Wicklung und aussen eine
          duenne Abgrenzung. Die grobe gestrichelte Linie von vorher las sich
          wie eine Schnittmarkierung, nicht wie eine fertige Kante.
        */
        var kn = kantePx(4.5);
        umriss({ fill: 'none', stroke: fuellung, 'stroke-width': kn });
        umriss({ fill: 'none', stroke: 'rgba(0,0,0,.17)', 'stroke-width': kn, 'stroke-dasharray': '0.9 1.7', 'stroke-linecap': 'butt' });
        umriss({ fill: 'none', stroke: 'rgba(255,255,255,.28)', 'stroke-width': kn * 0.31, 'stroke-dasharray': '0.9 1.7' });
        umriss({ fill: 'none', stroke: 'rgba(0,0,0,.26)', 'stroke-width': 0.8 });
      } else {
        var px = Math.min(kantePx(art === 'einfassband' ? 11 : 5), Math.max(art === 'einfassband' ? 6 : 3, BAND_CM[art] * s * 2));
        umriss(band
          ? { fill: 'none', stroke: band.hex, 'stroke-width': px }
          : { fill: 'none', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 2, 'stroke-dasharray': '6 4' });
      }

      masslinie(x, 28, x + pw, 28, f === 'rund' ? 'Ø ' + w + ' cm' : l + ' cm');
      if (f !== 'rund') masslinie(28, y, 28, y + ph, w + ' cm');
      // Der Chip benennt, was gerade zu sehen ist - eigenes Mass oder Beispiel.
      var tw = beispiel ? 104 : 88, tx = x + pw / 2 - tw / 2, ty = y + 8;
      svgEl('rect', { x: tx, y: ty, width: tw, height: 21, rx: 10.5, fill: 'rgba(255,255,255,.90)' }, svg);
      var tb = svgEl('text', { x: x + pw / 2, y: ty + 14.5, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 600, fill: beispiel ? '#3b3733' : '#244d31' }, svg);
      tb.textContent = beispiel ? 'Beispielmaß' : 'Dein Maß';
      if (!beispiel) lupe(defs);

      /*
        Die Legende beantwortet, was der Kunde gerade konfiguriert: welches
        Produkt, welche Farbe, welches Mass, welche Kante. Vorher stand dort
        nur die Kantenart - das Produkt selbst kam gar nicht vor.
      */
      var teile = [];
      if (d.produkt) teile.push(d.produkt);
      var farbe = target ? [target.farbnummer, target.farbe].filter(Boolean).join(' ') : '';
      if (farbe) teile.push(farbe);
      teile.push(f === 'rund' ? 'Ø ' + w + ' cm' : w + ' × ' + l + ' cm');
      teile.push(ART[art] + (band ? ' ' + band.nr + ' ' + band.name : '') + ' (' + KANTE[art] + ')');
      legende.textContent = teile.join(' · ');
      raumZeichnen(f, w, l);
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
      maxW = (target && Number(target.max_breite_cm) > 0) ? Number(target.max_breite_cm) : d.max_breite_cm;
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
      var l = rund ? { wert: b.wert, komma: false, ungueltig: false } : lesen(inLaenge);
      if (groessen) {
        groessen.querySelectorAll('button').forEach(function (btn) {
          var aktiv = +btn.getAttribute('data-w') === b.wert && (rund || +btn.getAttribute('data-l') === l.wert);
          btn.setAttribute('aria-pressed', aktiv ? 'true' : 'false');
        });
      }
      var fehlerListe = [];
      if (b.komma || l.komma) fehlerListe.push('Bitte ganze Zentimeter ohne Komma eingeben, zum Beispiel 250.');
      if (b.ungueltig) fehlerListe.push((rund ? 'Durchmesser' : 'Breite') + ' mindestens 50 cm.');
      if (l.ungueltig) fehlerListe.push('Länge mindestens 50 cm.');
      var eingabeFehler = fehlerListe.length > 0;
      var eingegeben = b.wert > 0 && (rund || l.wert > 0);
      if (eingegeben && !fehlerListe.length) {
        fehlerListe = M.pruefeMasse({ form: f, w: b.wert, l: l.wert, maxW: maxW, maxL: maxL });
      }
      if (!target.available) fehlerListe.push('Diese Farbe ist derzeit nicht lieferbar.');
      // TP-005: unabhaengig von Mass-/Farbzustand sichtbar - ein ausgefallener
      // konfigurierter Service ist kein Eingabefehler des Kunden.
      if (kettelServiceFailed) fehlerListe.push('Die Kettelung ist aktuell nicht verfügbar. Bitte kurz bei uns melden.');
      fehler.textContent = fehlerListe.join(' ');
      // Vor der ersten Eingabe keine Meldung - ausser die Eingabe selbst ist
      // das Problem (Komma, 0, negativ) oder der Kettelservice ist ausgefallen.
      fehler.hidden = !fehlerListe.length || (!eingegeben && !eingabeFehler && !!target && target.available && !kettelServiceFailed);

      // TP-005: ein ausgefallener konfigurierter Kettelservice macht die
      // Konfiguration ungueltig - stand bleibt null (unten), rechnung/cta
      // bleiben verborgen, hinzufuegen() kann also nicht auslösen.
      var gueltig = eingegeben && !fehlerListe.length && !!target && target.available &&
        parseInt(target.price, 10) > 0 && !kettelServiceFailed;
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
      var kante = M.umfangM(f, b.wert, l.wert);
      // Die Kante wird zentimetergenau abgerechnet: Preis je 0,01 lfm mal
      // Kantenlaenge in 0,01-lfm-Einheiten, als eigene Warenkorbzeile.
      var kantenEinheiten = kettel ? M.kanteEinheiten(kante) : 0;
      var kettelCent = kantenEinheiten * (kettel ? parseInt(kettel.price, 10) : 0);
      // Der Mindestpreis gilt fuer den Auftrag, nicht je Zeile: die Kante zaehlt
      // mit, nur der Rest hebt die Materialmenge an.
      var menge = M.mengeMitMindestpreis(flaeche, preis, Math.max(0, mindestCent - kettelCent));
      var materialCent = menge * preis;
      var summe = materialCent + kettelCent;
      var mindest = menge > M.mengeHundertstelM2(flaeche);
      var masse = rund ? 'Ø ' + b.wert + ' cm' : b.wert + ' × ' + l.wert + ' cm';

      // Die Kundenansicht zeigt nur den Endpreis; die Aufschluesselung ist entfernt.
      var rh = q('[data-rund-hinweis]');
      if (rh) rh.hidden = !(f === 'rund' || f === 'oval');
      var mh = q('[data-mindest-hinweis]');
      if (mh) {
        mh.hidden = !mindest;
        if (mindest) mh.textContent = 'Mindestpreis ' + euro(mindestCent) + ' für kleine Teppiche.';
      }
      q('[data-summe]').textContent = euro(summe);
      // Aktion: derselbe Teppich zum alten Variantenpreis, dieselbe Rechnung. Liquid liefert
      // compare_at_price nur bei aktiver Aktion. Greift beim alten Preis der Mindestpreis,
      // gibt es keinen Streichpreis - die Rundung ergaebe sonst einen Cent-"Rabatt".
      var summeAlt = q('[data-summe-alt]');
      if (summeAlt) {
        var preisAlt = parseInt(target.compare_at_price, 10);
        var zeigen = false;
        if (preisAlt > preis) {
          var mengeAlt = M.mengeMitMindestpreis(flaeche, preisAlt, Math.max(0, mindestCent - kettelCent));
          var altSumme = mengeAlt * preisAlt + kettelCent;
          if (mengeAlt === M.mengeHundertstelM2(flaeche) && altSumme > summe) {
            summeAlt.textContent = euro(altSumme);
            summeAlt.setAttribute('aria-label', 'statt ' + euro(altSumme));
            zeigen = true;
          }
        }
        summeAlt.hidden = !zeigen;
      }
      rechnung.hidden = false;

      stand = {
        form: f, w: b.wert, l: l.wert, flaeche: abgerechnet, menge: menge,
        kante: kante, kantenEinheiten: kantenEinheiten, masse: masse, mindest: mindest
      };
      cta.hidden = false;
      cta.disabled = inFlight || bandFehlt;
      // Der Preis steht direkt darueber unter "Ihr Preis" - im Knopf waere er doppelt (Inhaber 2026-09-20).
      if (!inFlight) cta.textContent = bandFehlt ? 'Bitte Bandfarbe wählen' : 'In den Warenkorb';
    }

    // Der Lieferschein kennt line_item.properties nicht - das Feld ist dort NIL
    // (belegt am 2026-09-16, siehe domains/shopify/benachrichtigungen/
    // bestelldokumente.md). Was mit ins Paket soll, muss Auftragsdaten sein:
    // order.attributes. Die Zeile traegt ihre Zuschnittangabe selbst
    // (_Zuschnitt unter ihrer _Gruppe); assets/tp-zuschnitt-abgleich.js macht
    // daraus genau ein Attribut "Zuschnitt <Gruppe>" je Zeile und raeumt
    // Attribute entfernter Zeilen ab. Solange beides nicht passt, sperrt
    // snippets/tp-cart-gruppe.liquid den Checkout. Die Rollenbreite bleibt
    // bewusst draussen - sie ist eine interne Angabe fuer die Werkstatt.
    function zuschnittAbgleichen() {
      if (window.TPZuschnitt) return window.TPZuschnitt.abgleichen();
      return Promise.reject(new Error('Abgleich-Skript fehlt'));
    }

    function zuschnittText(p) {
      var teile = [d.produkt];
      if (target && target.farbe) teile.push(target.farbe);
      if (p['Maße']) teile.push(p['Maße']);
      if (p['Einfassung']) teile.push(p['Einfassung']);
      if (p['Bandfarbe']) teile.push('Band ' + p['Bandfarbe']);
      if (p['Fläche (abgerechnet)']) teile.push(p['Fläche (abgerechnet)']);
      return teile.filter(Boolean).join(' · ');
    }

    function hinzufuegen() {
      if (inFlight) return;
      if (!stand || !target || !target.available || (mitBand && !band)) return;
      var p = {
        'Einfassung': ART[art],
        'Form': FORM[stand.form],
        'Maße': stand.masse,
        // Bei angewandtem Mindestpreis ist die Warenkorbmenge groesser als die
        // gewuenschte Flaeche - die Property nennt beides, damit Admin-Menge
        // und Zeile zusammenpassen (50 x 50: 0,69 m² statt 0,25 m²).
        'Fläche (abgerechnet)': stand.mindest
          ? fmt(stand.menge / 100) + ' m² (Mindestpreis, gewünscht ' + fmt(stand.flaeche) + ' m²)'
          : fmt(stand.flaeche) + ' m²',
        'Kante umlaufend': fmt(stand.kante) + ' m'
      };
      if (target.farbnummer) p['Farbnummer'] = target.farbnummer;
      if (mitBand) p['Bandfarbe'] = band.nr + ' ' + band.name;
      if (art === 'ketteln') p['Garn'] = 'Ton in Ton';
      if (art === 'cover') p['Vlies'] = 'inklusive';
      if (stand.mindest) p['Mindestpreis'] = 'angewendet';

      var menge = stand.menge;

      // Intern fuer die Werkstatt: aus welcher Rollenbreite zugeschnitten wird.
      // Die kuerzere Seite muss in die Rolle passen, der Kunde sieht das nicht.
      var kurzeSeite = stand.form === 'rund' ? stand.w : Math.min(stand.w, stand.l);
      var rolle = rollen.length ? M.rolleFuer(kurzeSeite, rollen) : null;
      if (rolle) p['_Zuschnitt aus Rolle'] = rolle + ' cm';

      // Jede Konfiguration bekommt eine eigene Gruppenkennung; an ihr haengt
      // das Zuschnitt-Attribut. Mit Kettelung teilen sich Teppich und Kante
      // die Kennung, bleiben im Warenkorb aber zwei nachvollziehbare Zeilen.
      var gruppe = 'K' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      p['_Gruppe'] = gruppe;
      p['_Zuschnitt'] = zuschnittText(p);
      var koerper = { id: target.id, quantity: menge, properties: p };
      var gesamtMenge = menge;
      if (kettel && stand.kantenEinheiten > 0) {
        koerper = {
          items: [
            { id: target.id, quantity: menge, properties: p },
            {
              id: kettel.id,
              quantity: stand.kantenEinheiten,
              properties: {
                'Zu Teppich': d.produkt,
                'Farbe': target.farbe || '',
                'Kante umlaufend': fmt(stand.kante) + ' m',
                '_Gruppe': gruppe
              }
            }
          ]
        };
        gesamtMenge = menge + stand.kantenEinheiten;
      }

      inFlight = true;
      cta.disabled = true;
      cta.textContent = 'Wird hinzugefügt …';
      warenkorb.hidden = true;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(koerper)
      })
        .then(function (r) { if (!r.ok) throw new Error('add'); return r.json(); })
        .then(function (item) {
          // Erst wenn das Zuschnitt-Attribut nachweislich steht, geht der
          // Warenkorb auf. Schlaegt es fehl, bleibt der Artikel im Warenkorb,
          // der Checkout ist serverseitig gesperrt und der Kunde sieht es.
          return zuschnittAbgleichen().then(
            function () { return { item: item, ok: true }; },
            function () { return { item: item, ok: false }; }
          );
        })
        .then(function (erg) {
          var item = erg.item;
          inFlight = false;
          if (!erg.ok) {
            cta.textContent = 'Im Warenkorb – Zuschnittangabe nicht gespeichert, bitte im Warenkorb erneut abgleichen';
            cta.classList.add('is-error');
          } else {
            cta.textContent = 'Im Warenkorb';
            cta.classList.add('is-done');
          }
          warenkorb.hidden = false;
          document.dispatchEvent(new CustomEvent('cart:update', {
            bubbles: true,
            detail: { resource: item, sourceId: root.id, data: { itemCount: gesamtMenge, source: 'product-form-component' } }
          }));
          var drawer = document.querySelector('cart-drawer-component');
          if (drawer && typeof drawer.open === 'function') drawer.open();
          // Neu rechnen statt alten Text zurueck: Eingaben koennen sich
          // inzwischen geaendert haben. Die Fehlermeldung bleibt laenger stehen.
          setTimeout(function () { cta.classList.remove('is-done', 'is-error'); rechnen(); }, erg.ok ? 3000 : 8000);
        })
        .catch(function () {
          inFlight = false;
          cta.textContent = 'Nicht hinzugefügt – erneut versuchen';
          cta.classList.add('is-error');
          setTimeout(function () { cta.classList.remove('is-error'); rechnen(); }, 3000);
        });
    }

    raeumeAufbauen();
    ansichtSetzen(ansicht);
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
