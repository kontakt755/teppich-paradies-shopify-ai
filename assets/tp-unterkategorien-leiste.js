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
        var sanft = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        liste.scrollBy({ left: schritt, behavior: sanft ? 'smooth' : 'auto' });
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
