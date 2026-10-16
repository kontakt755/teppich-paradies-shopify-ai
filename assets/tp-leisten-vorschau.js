/*
  Farbvorschau fuer Leisten (blocks/tp-leisten-vorschau.liquid).

  Horizon rendert beim Variantenwechsel nur den Variantenwaehler neu und
  feuert danach `variant:update` mit dem komplett geladenen Dokument der neuen
  Variante (event.detail.data.html). Dieser Block steht darin bereits fertig
  gerendert - mit Bild, Art und Beschriftung fuer genau diese Farbe. Die
  Vorschau uebernimmt daraus nur die Stellen, die sich aendern: Art, Foto
  (das img gibt es nur bei Art "foto"), Farbmuster und Beschriftung. Es gibt
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

      this.fotoUebernehmen(neu);

      // Farbmuster im Schema: ohne Muster steht kein href (statt eines leeren).
      var bildAlt = this.querySelector('[data-tp-vorschau-bild]');
      var bildNeu = neu.querySelector('[data-tp-vorschau-bild]');
      if (bildAlt && bildNeu) {
        var href = bildNeu.getAttribute('href');
        if (!href) bildAlt.removeAttribute('href');
        else if (bildAlt.getAttribute('href') !== href) bildAlt.setAttribute('href', href);
      }

      ['[data-tp-vorschau-art]', '[data-tp-vorschau-name]'].forEach(function (sel) {
        var alt = this.querySelector(sel);
        var frisch = neu.querySelector(sel);
        if (alt && frisch && alt.textContent !== frisch.textContent) alt.textContent = frisch.textContent;
      }, this);
    }

    /**
     * Das Foto-img steht nur im HTML, wenn die Farbe ein eigenes Foto hat
     * (Art "foto"). Hat die neue Farbe eins, wird es angeglichen oder aus der
     * Antwort uebernommen; hat sie keins, faellt das alte weg. So steht nie ein
     * img ohne src im Dokument.
     *
     * @param {Element} neu - frisch gerenderter Block der neuen Variante
     */
    fotoUebernehmen(neu) {
      var fotoAlt = this.querySelector('[data-tp-vorschau-foto]');
      var fotoNeu = neu.querySelector('[data-tp-vorschau-foto]');

      if (!fotoNeu || !fotoNeu.getAttribute('src')) {
        if (fotoAlt) fotoAlt.remove();
        return;
      }

      if (fotoAlt) {
        ['src', 'alt'].forEach(function (attr) {
          var wert = fotoNeu.getAttribute(attr) || '';
          if (fotoAlt.getAttribute(attr) !== wert) fotoAlt.setAttribute(attr, wert);
        });
        return;
      }

      var rahmen = this.querySelector('.tp-lv__frame');
      if (rahmen) rahmen.insertBefore(document.importNode(fotoNeu, true), rahmen.firstChild);
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
