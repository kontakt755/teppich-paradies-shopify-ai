/**
 * Wisch-Hinweis fuer die Unterkategorien-Leiste.
 *
 * Setzt data-mehr-links / data-mehr-rechts am nav, sobald links oder rechts
 * noch Pillen ausserhalb des sichtbaren Bereichs stehen. CSS haengt daran den
 * Randverlauf und den Pfeil. Steht alles nebeneinander - der Normalfall auf
 * dem Desktop und bei zwei, drei Unterkategorien -, bleibt beides weg: ein
 * Pfeil, der nirgendwohin fuehrt, ist schlechter als keiner.
 *
 * Bewusst ohne ResizeObserver-Polyfill und ohne Abhaengigkeit: die Leiste
 * liegt im ersten Bildschirm, das Skript laeuft per defer.
 */
(function () {
  'use strict';

  // Toleranz gegen halbe Pixel: Ein Zoomfaktor oder eine krumme
  // Geraetepixeldichte laesst scrollWidth und clientWidth um Bruchteile
  // auseinanderliegen, obwohl nichts zu scrollen ist. Ohne die Toleranz
  // stuende der Pfeil dauerhaft an einer vollstaendig sichtbaren Leiste.
  var RAND = 2;

  function zustand(nav) {
    var liste = nav.querySelector('.tp-uk__list');
    if (!liste) return;

    var maxScroll = liste.scrollWidth - liste.clientWidth;
    var scrollbar = maxScroll > RAND;
    var links = scrollbar && liste.scrollLeft > RAND;
    var rechts = scrollbar && liste.scrollLeft < maxScroll - RAND;

    nav.setAttribute('data-mehr-links', links ? 'true' : 'false');
    nav.setAttribute('data-mehr-rechts', rechts ? 'true' : 'false');
  }

  function init(nav) {
    if (nav.hasAttribute('data-tp-uk-bereit')) return;
    nav.setAttribute('data-tp-uk-bereit', '1');

    var liste = nav.querySelector('.tp-uk__list');
    if (!liste) return;

    zustand(nav);
    liste.addEventListener('scroll', function () { zustand(nav); }, { passive: true });

    if (typeof ResizeObserver === 'function') {
      // Beobachtet wird die Liste selbst, nicht window: die Leiste steckt in
      // hero_split auch in einer Spalte, die sich ohne Fensterwechsel aendert.
      new ResizeObserver(function () { zustand(nav); }).observe(liste);
    } else {
      window.addEventListener('resize', function () { zustand(nav); });
    }

    var weiter = nav.querySelector('[data-tp-uk-weiter]');
    if (weiter) {
      weiter.addEventListener('click', function () {
        // Knapp eine Bildschirmbreite weiter, damit die angeschnittene Pille
        // am Rand nicht uebersprungen wird.
        var schritt = Math.max(liste.clientWidth - 64, 120);

        // Auf das verbleibende Stueck begrenzen - ein Ziel hinter dem Ende
        // braucht niemand.
        var maxScroll = liste.scrollWidth - liste.clientWidth;
        var ziel = Math.min(liste.scrollLeft + schritt, maxScroll);

        // Bewusst ohne behavior: 'smooth'. Auf diesem Container (scroll-snap-type
        // x mit scroll-snap-align: start je Pille) macht Chromium jede
        // programmatische sanfte Bewegung rueckgaengig: die Snap-Neuausrichtung
        // zieht den Container waehrend der Animation auf den Ausgangspunkt
        // zurueck. Am 2026-09-15 auf dem Tablet-Viewport gemessen - scrollTo und
        // scrollBy mit 'smooth' landeten beide wieder bei 0, mit 'auto' sauber
        // am Ziel. Ein Pfeil, der nichts tut, ist schlechter als einer, der
        // hart springt; durch das Snapping landet der Sprung ohnehin genau auf
        // einer Pillenkante und sieht dadurch gewollt aus.
        liste.scrollTo({ left: ziel, behavior: 'auto' });

        // Zustand sofort selbst nachziehen, statt auf das scroll-Ereignis zu
        // warten. Beim Wischen liefert es der Browser, nach einem
        // programmatischen Sprung aber nicht verlaesslich - in der Messung vom
        // 2026-09-15 kam es gar nicht an, und Pfeil und Randverlauf blieben
        // stehen, obwohl die Leiste schon am Ende war.
        zustand(nav);
      });
    }
  }

  function alle() {
    document.querySelectorAll('[data-tp-uk]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', alle);
  } else {
    alle();
  }

  // Der Theme-Editor baut Sections neu auf, ohne die Seite zu laden.
  document.addEventListener('shopify:section:load', alle);
})();
