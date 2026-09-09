/*
  Farbvorschau fuer Leisten (blocks/tp-leisten-vorschau.liquid).

  Horizon rendert beim Variantenwechsel nur den Variantenwaehler neu und
  feuert danach `variant:update` mit dem komplett geladenen Dokument der neuen
  Variante (event.detail.data.html). Dieser Block steht darin bereits fertig
  gerendert - mit Bild, Art und Beschriftung fuer genau diese Farbe. Die
  Vorschau uebernimmt daraus nur die vier Stellen, die sich aendern. Es gibt
  keine zweite Bildzuordnung im Browser; die Entscheidung trifft allein das
  Liquid.

  Genau ein Listener am document fuer alle Instanzen, damit beim Neu-Rendern
  von Sections (Theme Editor, Section Rendering) nichts doppelt haengt.
*/
(function () {
  'use strict';

  if (customElements.get('tp-leisten-vorschau')) return;

  var instanzen = new Set();

  class TpLeistenVorschau extends HTMLElement {
    connectedCallback() {
      instanzen.add(this);
    }

    disconnectedCallback() {
      instanzen.delete(this);
    }

    /**
     * @param {Document | Element | null | undefined} html - Dokument der neuen Variante
     */
    uebernehmen(html) {
      if (!html || !this.id || typeof html.querySelector !== 'function') return;
      var neu = html.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(this.id) : this.id));
      if (!neu || neu === this) return;

      var art = neu.getAttribute('data-tp-vorschau-art') || 'ohne';
      this.setAttribute('data-tp-vorschau-art', art);
      this.classList.remove('tp-lv--ohne', 'tp-lv--foto', 'tp-lv--muster');
      this.classList.add('tp-lv--' + art);

      var paare = [
        ['[data-tp-vorschau-foto]', 'src'],
        ['[data-tp-vorschau-foto]', 'alt'],
        ['[data-tp-vorschau-bild]', 'href']
      ];
      paare.forEach(function (paar) {
        var alt = this.querySelector(paar[0]);
        var frisch = neu.querySelector(paar[0]);
        if (!alt || !frisch) return;
        var wert = frisch.getAttribute(paar[1]);
        if (wert === null || wert === '') {
          if (paar[1] === 'href') alt.setAttribute('href', '');
          else alt.removeAttribute(paar[1]);
        } else if (alt.getAttribute(paar[1]) !== wert) {
          alt.setAttribute(paar[1], wert);
        }
      }, this);

      ['[data-tp-vorschau-art]', '[data-tp-vorschau-name]'].forEach(function (sel) {
        var alt = this.querySelector(sel);
        var frisch = neu.querySelector(sel);
        if (alt && frisch && alt.textContent !== frisch.textContent) alt.textContent = frisch.textContent;
      }, this);
    }
  }

  customElements.define('tp-leisten-vorschau', TpLeistenVorschau);

  document.addEventListener('variant:update', function (event) {
    var detail = event && event.detail;
    var html = detail && detail.data ? detail.data.html : null;
    if (!html) return;
    instanzen.forEach(function (el) { el.uebernehmen(html); });
  });
})();
