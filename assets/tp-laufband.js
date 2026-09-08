/* tp-laufband: startet die Laufschrift nur, wenn der Text breiter ist als das
   Feld. Kurze Texte bleiben statisch. Bei prefers-reduced-motion passiert
   nichts, das CSS zeigt den Text dann ohne Bewegung an. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var GAP = 32; // px Abstand zwischen Textende und naechstem Durchlauf, identisch zu CSS

  function setup(el) {
    var track = el.querySelector('.tp-laufband__track');
    var item = el.querySelector('.tp-laufband__item');
    if (!track || !item) return;

    // Klon entfernen und Zustand zuruecksetzen, damit ein Resize sauber neu misst
    var clone = track.querySelector('.tp-laufband__item--clone');
    if (clone) clone.remove();
    el.classList.remove('is-scrolling');
    track.style.removeProperty('--tp-laufband-distance');
    track.style.removeProperty('--tp-laufband-duration');

    if (reduceMotion.matches) return;

    var viewport = el.querySelector(".tp-laufband__viewport") || el;
    var inner = viewport.clientWidth;
    var textWidth = item.scrollWidth;
    if (textWidth <= inner + 1) return;

    clone = item.cloneNode(true);
    clone.classList.add('tp-laufband__item--clone');
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);

    var distance = textWidth + GAP;
    var speed = parseFloat(el.getAttribute('data-tp-laufband-speed')) || 28;
    track.style.setProperty('--tp-laufband-distance', distance + 'px');
    track.style.setProperty('--tp-laufband-duration', (distance / speed).toFixed(2) + 's');
    el.classList.add('is-scrolling');
  }

  function setupAll() {
    document.querySelectorAll('[data-tp-laufband]').forEach(setup);
  }

  var timer;
  function onResize() {
    clearTimeout(timer);
    timer = setTimeout(setupAll, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAll);
  } else {
    setupAll();
  }
  // Nach dem Laden der Schriften kann sich die Textbreite noch aendern
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(setupAll);
  window.addEventListener('resize', onResize);
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', setupAll);
  document.addEventListener('shopify:section:load', setupAll);
})();
