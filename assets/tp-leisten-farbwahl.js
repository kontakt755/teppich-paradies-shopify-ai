/*
  Bildbasierte Farbwahl fuer Leisten (blocks/tp-leisten-farbwahl.liquid).

  Die Kacheln sind nur eine Oberflaeche ueber dem Horizon-Variantenwaehler:
  Ein Klick setzt den passenden Radio-Button, alles Weitere (Preis, Galerie,
  Warenkorb-Formular, URL) erledigt Horizon wie bisher.

  Aufbau als Custom Element, weil Horizon beim Variantenwechsel den Waehler
  per Morph neu rendert: Die Radios sind danach neue Knoten, dieses Element
  bleibt stehen. Deshalb liest sync() die Radios jedes Mal frisch, und es
  gibt genau einen Listener am document fuer alle Instanzen - kein Listener
  wird beim Neu-Rendern doppelt registriert.
*/
(function () {
  'use strict';

  if (customElements.get('tp-leisten-farbwahl')) return;

  var instanzen = new Set();

  class TpLeistenFarbwahl extends HTMLElement {
    constructor() {
      super();
      this.onClick = this.onClick.bind(this);
    }

    connectedCallback() {
      instanzen.add(this);
      if (!this.tpGebunden) {
        this.tpGebunden = true;
        this.addEventListener('click', this.onClick);
      }
      this.aktivieren();
    }

    disconnectedCallback() {
      instanzen.delete(this);
      if (this.tpBeobachter) {
        this.tpBeobachter.disconnect();
        this.tpBeobachter = null;
      }
    }

    picker() {
      var eltern = this.parentElement;
      var p = eltern ? eltern.querySelector('variant-picker') : null;
      if (p) return p;
      var bereich = this.closest('.shopify-section, main') || document;
      return bereich.querySelector('variant-picker');
    }

    radios() {
      var p = this.picker();
      if (!p) return [];
      return Array.prototype.slice.call(p.querySelectorAll('input[type="radio"]'));
    }

    tiles() {
      return Array.prototype.slice.call(this.querySelectorAll('[data-tp-farbwahl-id]'));
    }

    // Ohne erreichbare Radios bleibt der Block verborgen und der normale
    // Variantenwaehler sichtbar - besser als eine Auswahl, die nichts tut.
    aktivieren() {
      if (!this.radios().length) {
        this.hidden = true;
        return;
      }
      this.hidden = false;
      this.beobachten();
      this.sync();
    }

    radioFuer(tile) {
      var id = tile.getAttribute('data-tp-farbwahl-id');
      var wert = tile.getAttribute('data-tp-farbwahl-value');
      var alle = this.radios();
      var treffer = alle.filter(function (r) { return id && r.getAttribute('data-option-value-id') === id; })[0];
      if (treffer) return treffer;
      return alle.filter(function (r) { return r.value === wert; })[0] || null;
    }

    // Gedrueckten Zustand und Namen aus den Radios uebernehmen - die sind
    // nach jedem Variantenwechsel die einzige Wahrheit.
    sync() {
      var checked = this.radios().filter(function (r) { return r.checked; })[0];
      if (!checked) return;
      var id = checked.getAttribute('data-option-value-id') || '';
      var wert = checked.value;
      var aktiv = null;
      this.tiles().forEach(function (t) {
        var trifft = (id && t.getAttribute('data-tp-farbwahl-id') === id) || t.getAttribute('data-tp-farbwahl-value') === wert;
        t.setAttribute('aria-pressed', trifft ? 'true' : 'false');
        if (trifft) aktiv = t;
      });
      // Zeile ueber dem Raster und Dropdown-Knopf tragen beide den Namen
      if (aktiv) {
        var name = aktiv.getAttribute('data-tp-farbwahl-name') || wert;
        this.querySelectorAll('[data-tp-farbwahl-current]').forEach(function (el) { el.textContent = name; });
      }
      // Dropdown: Bild der aktiven Kachel in den Knopf spiegeln - dieselbe
      // Quelle wie im Raster, damit die Bildregeln der Kachel gelten.
      var ddBild = this.querySelector('[data-tp-farbwahl-dd-bild]');
      if (ddBild && aktiv) {
        var quelle = aktiv.querySelector('.tp-lfw__bild');
        ddBild.innerHTML = '';
        if (quelle && quelle.firstElementChild) ddBild.appendChild(quelle.firstElementChild.cloneNode(true));
      }
      if (this.istDropdown()) return;
      // Liegt die gewaehlte Farbe im eingeklappten Teil, aufklappen - sonst
      // steht der aktive Zustand unsichtbar hinter dem "Alle anzeigen"-Knopf.
      if (aktiv && aktiv.hidden) this.umschalten(true);
    }

    istDropdown() {
      return !!this.querySelector('[data-tp-farbwahl-dd]');
    }

    // Dropdown auf/zu. Im Dropdown sind immer alle Farben in der Liste - das
    // Einklappen des Rasters ("Alle anzeigen") gibt es dort nicht.
    oeffnen(auf) {
      var knopf = this.querySelector('[data-tp-farbwahl-dd]');
      if (!knopf) return;
      this.classList.toggle('tp-lfw--offen', auf);
      knopf.setAttribute('aria-expanded', auf ? 'true' : 'false');
      if (!auf) return;
      this.tiles().forEach(function (t) { t.hidden = false; });
      var liste = this.querySelector('.tp-lfw__grid');
      var platz = window.innerHeight - knopf.getBoundingClientRect().bottom - 16;
      if (liste) liste.style.maxHeight = Math.max(200, Math.min(platz, 420)) + 'px';
      var aktiv = this.querySelector('[data-tp-farbwahl-id][aria-pressed="true"]');
      if (aktiv) {
        aktiv.focus({ preventScroll: true });
        if (liste) liste.scrollTop = Math.max(0, aktiv.offsetTop - 60);
      }
      if (liste && liste.getBoundingClientRect().bottom > window.innerHeight) {
        liste.scrollIntoView({ block: 'nearest' });
      }
    }

    klappbar() {
      if (this.istDropdown()) return false;
      return !!this.querySelector('[data-tp-farbwahl-mehr]');
    }

    // Eingeklappt bleiben drei volle Reihen sichtbar. Die Spaltenzahl kommt
    // aus dem gerenderten Grid, damit keine angerissene Reihe stehen bleibt;
    // ohne Layout (noch nicht sichtbar) gilt die serverseitige Grenze.
    limit() {
      var server = parseInt(this.getAttribute('data-tp-farbwahl-limit') || '0', 10);
      var grid = this.querySelector('.tp-lfw__grid');
      if (!grid || !grid.offsetWidth) return server;
      var spalten = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      return spalten > 1 ? spalten * 3 : server;
    }

    umschalten(auf) {
      if (!this.klappbar()) return;
      var limit = this.limit();
      var knopf = this.querySelector('[data-tp-farbwahl-mehr]');
      if (typeof auf !== 'boolean') auf = !this.classList.contains('tp-lfw--auf');
      this.classList.toggle('tp-lfw--auf', auf);
      if (knopf) knopf.setAttribute('aria-expanded', auf ? 'true' : 'false');
      this.tiles().forEach(function (t, i) {
        t.hidden = !auf && limit > 0 && i >= limit;
      });
    }

    // Beim Aendern der Breite (Drehen des Geraets) die Reihen neu schneiden.
    beobachten() {
      if (this.tpBeobachter || typeof ResizeObserver !== 'function' || !this.klappbar()) return;
      var self = this;
      var breite = 0;
      this.tpBeobachter = new ResizeObserver(function (eintraege) {
        var neu = eintraege[0] ? Math.round(eintraege[0].contentRect.width) : 0;
        if (neu === breite) return;
        breite = neu;
        if (!self.classList.contains('tp-lfw--auf')) self.umschalten(false);
      });
      this.tpBeobachter.observe(this);
    }

    onClick(event) {
      var ziel = event.target instanceof Element ? event.target : null;
      if (!ziel) return;
      var dd = ziel.closest('[data-tp-farbwahl-dd]');
      if (dd) {
        this.oeffnen(!this.classList.contains('tp-lfw--offen'));
        return;
      }
      var tile = ziel.closest('[data-tp-farbwahl-id]');
      if (tile) {
        var radio = this.radioFuer(tile);
        if (radio && !radio.checked) radio.click();
        this.sync();
        if (this.istDropdown()) {
          this.oeffnen(false);
          var knopf = this.querySelector('[data-tp-farbwahl-dd]');
          if (knopf) knopf.focus({ preventScroll: true });
        }
        return;
      }
      var mehr = ziel.closest('[data-tp-farbwahl-mehr]');
      if (mehr) {
        this.umschalten();
        if (!this.classList.contains('tp-lfw--auf')) {
          // Nach dem Einklappen den Knopf im Blick behalten, statt ins Leere zu springen.
          mehr.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  }

  customElements.define('tp-leisten-farbwahl', TpLeistenFarbwahl);

  function alleSync() {
    instanzen.forEach(function (el) { el.sync(); });
  }

  // Horizon feuert variant:update nach dem Morph des Waehlers; das change-
  // Event deckt den direkten Klick auf ein (sichtbares) Radio ohne JS-Kacheln ab.
  document.addEventListener('variant:update', alleSync);

  // Offenes Dropdown schliessen: Klick ausserhalb oder Escape.
  document.addEventListener('click', function (event) {
    instanzen.forEach(function (el) {
      if (el.classList.contains('tp-lfw--offen') && !el.contains(event.target)) el.oeffnen(false);
    });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    instanzen.forEach(function (el) {
      if (!el.classList.contains('tp-lfw--offen')) return;
      el.oeffnen(false);
      var knopf = el.querySelector('[data-tp-farbwahl-dd]');
      if (knopf) knopf.focus({ preventScroll: true });
    });
  });
  document.addEventListener('change', function (event) {
    var t = event.target;
    if (t instanceof HTMLInputElement && t.type === 'radio' && t.closest('variant-picker')) alleSync();
  });
})();
