/* Referenzgalerie "Unsere Arbeit": Filter, Nachladen, Lightbox, Vorher/Nachher.
   Kein Framework, keine externe Bibliothek. Laeuft erst, wenn die Section im DOM ist. */
(function () {
  'use strict';

  /* ---------- gemeinsame Helfer ---------- */

  // Shopify-CDN-URLs tragen bereits ?v=..., deshalb wird width mit & angehaengt.
  function mitBreite(url, breite) {
    if (!url) return '';
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'width=' + breite;
  }

  function srcsetBauen(url, breiten) {
    return breiten.map(function (b) { return mitBreite(url, b) + ' ' + b + 'w'; }).join(', ');
  }

  /* ---------- Galerie: Filter und Nachladen ---------- */

  function galerieStarten(wurzel) {
    var chips = Array.prototype.slice.call(wurzel.querySelectorAll('[data-tp-chip]'));
    var zellen = Array.prototype.slice.call(wurzel.querySelectorAll('[data-tp-zelle]'));
    var mehr = wurzel.querySelector('[data-tp-mehr]');
    var leer = wurzel.querySelector('[data-tp-leer]');
    var schritt = parseInt(wurzel.getAttribute('data-tp-schritt'), 10) || 9;
    var aktiv = wurzel.getAttribute('data-tp-start') || 'alle';
    var sichtbar = schritt;

    function passt(zelle) {
      return aktiv === 'alle' || zelle.getAttribute('data-tp-slug') === aktiv;
    }

    function zeichnen() {
      var gezeigt = 0;
      var treffer = 0;
      zellen.forEach(function (zelle) {
        if (!passt(zelle)) { zelle.hidden = true; return; }
        treffer++;
        if (gezeigt < sichtbar) { zelle.hidden = false; gezeigt++; }
        else { zelle.hidden = true; }
      });
      if (mehr) {
        var rest = treffer - gezeigt;
        mehr.hidden = rest <= 0;
        mehr.textContent = 'Weitere ' + Math.min(rest, schritt) + ' Arbeiten anzeigen';
      }
      if (leer) leer.hidden = treffer > 0;
      chips.forEach(function (chip) {
        var an = chip.getAttribute('data-tp-chip') === aktiv;
        chip.setAttribute('aria-pressed', an ? 'true' : 'false');
        chip.classList.toggle('is-aktiv', an);
      });
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        aktiv = chip.getAttribute('data-tp-chip');
        sichtbar = schritt;
        zeichnen();
        // Adresszeile mitfuehren, damit ein gefilterter Stand teilbar ist.
        var ziel = aktiv === 'alle'
          ? location.pathname
          : location.pathname + '?kategorie=' + encodeURIComponent(aktiv);
        history.replaceState(null, '', ziel);
        var kopf = wurzel.querySelector('[data-tp-filterleiste]');
        if (kopf && kopf.getBoundingClientRect().top < 0) {
          kopf.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    if (mehr) {
      mehr.addEventListener('click', function () {
        var vorher = zellen.filter(function (z) { return !z.hidden; }).length;
        sichtbar += schritt;
        zeichnen();
        // Fokus auf die erste neu erschienene Karte, damit die Tastatur nicht springt.
        var neue = zellen.filter(function (z) { return !z.hidden; })[vorher];
        if (neue) {
          var knopf = neue.querySelector('button, a');
          if (knopf) knopf.focus({ preventScroll: true });
        }
      });
    }

    // Tiefer Link von der Startseite: ?kategorie=treppen
    var ausUrl = new URLSearchParams(location.search).get('kategorie');
    if (ausUrl && chips.some(function (c) { return c.getAttribute('data-tp-chip') === ausUrl; })) {
      aktiv = ausUrl;
    }
    zeichnen();
  }

  /* ---------- Lightbox ---------- */

  function lightboxStarten(wurzel) {
    var dialog = wurzel.querySelector('[data-tp-lightbox]');
    var datenKnoten = wurzel.querySelector('[data-tp-daten]');
    if (!dialog || !datenKnoten || typeof dialog.showModal !== 'function') return;

    var projekte;
    try { projekte = JSON.parse(datenKnoten.textContent); } catch (e) { return; }

    var bild = dialog.querySelector('[data-tp-lb-bild]');
    var titel = dialog.querySelector('[data-tp-lb-titel]');
    var fakten = dialog.querySelector('[data-tp-lb-fakten]');
    var text = dialog.querySelector('[data-tp-lb-text]');
    var zaehler = dialog.querySelector('[data-tp-lb-zaehler]');
    var thumbs = dialog.querySelector('[data-tp-lb-thumbs]');
    var prev = dialog.querySelector('[data-tp-lb-prev]');
    var next = dialog.querySelector('[data-tp-lb-next]');

    var pIdx = 0;
    var bIdx = 0;
    var ausloeser = null;

    function bilderVon(p) { return p.b || []; }

    function bildZeigen() {
      var p = projekte[pIdx];
      var liste = bilderVon(p);
      var b = liste[bIdx];
      if (!b) return;
      // Die kleine Fassung liegt meist schon aus dem Raster im Cache. Sie steht
      // als Hintergrund sofort, das grosse Bild legt sich darueber, sobald es da ist.
      bild.style.backgroundImage = 'url("' + mitBreite(b.u, 400) + '")';
      bild.src = mitBreite(b.u, 1400);
      bild.srcset = srcsetBauen(b.u, [600, 900, 1400, 1800]);
      bild.sizes = '(max-width: 899px) 100vw, 62vw';
      bild.width = b.w || 1400;
      bild.height = b.h || 1050;
      bild.alt = b.a || p.t;
      zaehler.textContent = liste.length > 1 ? (bIdx + 1) + ' von ' + liste.length : '';
      var mehrfach = liste.length > 1;
      prev.hidden = !mehrfach;
      next.hidden = !mehrfach;
      Array.prototype.forEach.call(thumbs.children, function (el, i) {
        el.classList.toggle('is-aktiv', i === bIdx);
        el.setAttribute('aria-current', i === bIdx ? 'true' : 'false');
      });
    }

    function projektZeigen(index) {
      pIdx = index;
      bIdx = 0;
      var p = projekte[pIdx];
      titel.textContent = p.t;
      var teile = [];
      if (p.k) teile.push(p.k);
      if (p.bl) teile.push(p.bl);
      if (p.o) teile.push(p.o);
      if (p.j) teile.push(p.j);
      fakten.textContent = teile.join(' · ');
      text.textContent = p.d || '';
      text.hidden = !p.d;

      thumbs.innerHTML = '';
      var liste = bilderVon(p);
      if (liste.length > 1) {
        liste.forEach(function (b, i) {
          var knopf = document.createElement('button');
          knopf.type = 'button';
          knopf.className = 'tp-lb__thumb';
          knopf.setAttribute('aria-label', 'Bild ' + (i + 1) + ' von ' + liste.length);
          var mini = document.createElement('img');
          mini.src = mitBreite(b.u, 160);
          mini.alt = '';
          mini.loading = 'lazy';
          mini.width = 80;
          mini.height = 60;
          knopf.appendChild(mini);
          knopf.addEventListener('click', function () { bIdx = i; bildZeigen(); });
          thumbs.appendChild(knopf);
        });
        thumbs.hidden = false;
      } else {
        thumbs.hidden = true;
      }
      bildZeigen();
    }

    function blaettern(richtung) {
      var liste = bilderVon(projekte[pIdx]);
      if (liste.length < 2) return;
      bIdx = (bIdx + richtung + liste.length) % liste.length;
      bildZeigen();
    }

    wurzel.querySelectorAll('[data-tp-oeffnen]').forEach(function (knopf) {
      knopf.addEventListener('click', function () {
        ausloeser = knopf;
        projektZeigen(parseInt(knopf.getAttribute('data-tp-oeffnen'), 10) || 0);
        dialog.showModal();
        document.documentElement.style.overflow = 'hidden';
      });
    });

    prev.addEventListener('click', function () { blaettern(-1); });
    next.addEventListener('click', function () { blaettern(1); });
    dialog.querySelector('[data-tp-lb-zu]').addEventListener('click', function () { dialog.close(); });

    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); blaettern(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); blaettern(1); }
    });

    // Klick auf die Flaeche neben dem Inhalt schliesst - der Inhalt selbst nicht.
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

    dialog.addEventListener('close', function () {
      document.documentElement.style.overflow = '';
      if (ausloeser) ausloeser.focus({ preventScroll: true });
    });

    // Wischen auf dem Telefon
    var startX = 0;
    var startY = 0;
    var flaeche = dialog.querySelector('[data-tp-lb-flaeche]');
    flaeche.addEventListener('touchstart', function (e) {
      startX = e.changedTouches[0].clientX;
      startY = e.changedTouches[0].clientY;
    }, { passive: true });
    flaeche.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) blaettern(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /* ---------- Vorher/Nachher ---------- */

  function vergleichStarten(wurzel) {
    wurzel.querySelectorAll('[data-tp-vergleich]').forEach(function (box) {
      var regler = box.querySelector('input[type="range"]');
      if (!regler) return;
      function setzen() {
        box.style.setProperty('--tp-pos', regler.value + '%');
        // Screenreader hoeren den Anteil, nicht nur eine nackte Zahl.
        regler.setAttribute('aria-valuetext', regler.value + ' Prozent Vorher-Bild');
      }
      regler.addEventListener('input', setzen);
      setzen();
    });
  }

  /* ---------- Start ---------- */

  function start() {
    document.querySelectorAll('[data-tp-arbeiten]').forEach(function (wurzel) {
      if (wurzel.dataset.tpBereit) return;
      wurzel.dataset.tpBereit = '1';
      galerieStarten(wurzel);
      lightboxStarten(wurzel);
    });
    document.querySelectorAll('[data-tp-vergleiche]').forEach(function (wurzel) {
      if (wurzel.dataset.tpBereit) return;
      wurzel.dataset.tpBereit = '1';
      vergleichStarten(wurzel);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  // Im Theme-Editor werden Sections neu geladen, ohne dass die Seite neu laedt.
  document.addEventListener('shopify:section:load', start);
})();
