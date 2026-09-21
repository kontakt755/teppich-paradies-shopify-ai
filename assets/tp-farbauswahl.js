/*
  Zentrale Farbauswahl (snippets/tp-farbauswahl.liquid).

  Dieses Skript kennt keine Varianten. Eine Auswahl klickt das Radio-Feld mit
  demselben Wert im Wirtselement an - Preis, Galerie, URL und Warenkorb
  erledigt, wer das Radio-Feld besitzt (Horizon-Variantenwaehler oder
  blocks/color-swatch-picker.liquid). Der eigene Zustand wird nie gemerkt,
  sondern nach jedem Wechsel frisch aus den Radio-Feldern gelesen.

  Ohne JavaScript oder ohne erreichbare Radio-Felder bleibt das Element
  hidden und die bisherige Auswahl des Wirts sichtbar.
*/
(function () {
  if (customElements.get('tp-farbauswahl')) return;

  class TpFarbauswahl extends HTMLElement {
    connectedCallback() {
      if (this.bereit) return;
      this.host = this.dataset.host ? document.querySelector(this.dataset.host) : null;
      if (!this.host || !this.radios().length) return;
      this.bereit = true;

      this.optionen = Array.from(this.querySelectorAll('[data-tp-fa-option]'));
      this.liste = this.querySelector('[data-tp-fa-liste]');
      this.suche = this.querySelector('[data-tp-fa-suche]');
      this.leer = this.querySelector('[data-tp-fa-leer]');
      this.dialogKomponente = this.querySelector('dialog-component');
      this.ausloeser = this.querySelector('[data-tp-fa-ausloeser]');
      this.musterLink = this.querySelector('[data-tp-fa-muster]');
      this.musterBasis = this.musterLink ? this.musterLink.getAttribute('href') : '';

      this.addEventListener('click', (e) => {
        const option = e.target.closest('[data-tp-fa-option]');
        if (option && this.contains(option)) this.waehle(option);
      });

      if (this.liste) this.liste.addEventListener('keydown', (e) => this.tasten(e));
      if (this.suche) {
        this.suche.addEventListener('input', () => this.filtere());
        this.suche.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowDown') return;
          e.preventDefault();
          const erste = this.sichtbare()[0];
          if (erste) erste.focus();
        });
      }

      // Die Farbbilder im geschlossenen Dialog laedt der Browser nicht (lazy,
      // unsichtbar). Beim ersten Beruehren des Ausloesers anstossen, damit das
      // Sheet nicht mit leeren Flaechen aufgeht - und die Seite trotzdem nicht
      // beim Laden 40 Bilder holt.
      if (this.ausloeser) {
        const vorladen = () => {
          this.querySelectorAll('[data-tp-fa-liste] img[loading="lazy"]').forEach((img) => {
            img.loading = 'eager';
          });
        };
        ['pointerdown', 'touchstart', 'focus', 'mouseenter'].forEach((typ) => {
          this.ausloeser.addEventListener(typ, vorladen, { once: true, passive: true });
        });
      }

      if (this.dialogKomponente) {
        this.dialogKomponente.addEventListener('dialog:open', () => this.geoeffnet());
        this.dialogKomponente.addEventListener('dialog:close', () => this.geschlossen());
      }

      // Der Wirt meldet jeden Wechsel als change auf seinem Radio-Feld; nach
      // einem Morph des Variantenwaehlers sind die Radio-Felder neue Knoten,
      // deshalb wird immer neu gelesen statt Referenzen zu halten.
      this.beiWechsel = () => this.sync();
      document.addEventListener('change', this.beiWechsel);
      document.addEventListener('variant:update', this.beiWechsel);

      this.host.setAttribute('data-tp-fa-aktiv', '');
      this.hidden = false;
      this.sync();
    }

    disconnectedCallback() {
      if (!this.beiWechsel) return;
      document.removeEventListener('change', this.beiWechsel);
      document.removeEventListener('variant:update', this.beiWechsel);
    }

    radios() {
      // Nur Radio-Felder, deren Wert eine der Farben ist: im Horizon-Waehler
      // stehen daneben die Felder anderer Optionen (Laenge, Breite).
      if (!this.host) return [];
      if (!this.werte) {
        this.werte = Array.from(this.querySelectorAll('[data-tp-fa-option]')).map((o) => o.dataset.wert);
      }
      return Array.from(this.host.querySelectorAll('input[type="radio"]')).filter(
        (r) => this.werte.indexOf(r.value) !== -1
      );
    }

    aktuellerWert() {
      const radio = this.radios().find((r) => r.checked);
      return radio ? radio.value : null;
    }

    sync() {
      const wert = this.aktuellerWert();
      if (wert === null) return;
      let aktiv = null;
      this.optionen.forEach((option) => {
        const ist = option.dataset.wert === wert;
        option.setAttribute('aria-selected', ist ? 'true' : 'false');
        if (ist) aktiv = option;
      });
      if (!aktiv) return;

      const name = this.querySelector('[data-tp-fa-aktuell-name]');
      const bild = this.querySelector('[data-tp-fa-aktuell-bild]');
      if (name) name.textContent = wert;
      if (bild) {
        const quelle = aktiv.querySelector('[data-tp-fa-bild]');
        bild.innerHTML = quelle ? quelle.innerHTML : '';
        // Das Bild im Ausloeser steht im sichtbaren Bereich - nicht lazy.
        const img = bild.querySelector('img');
        if (img) img.loading = 'eager';
      }
      if (this.musterLink && this.musterBasis) {
        const trenner = this.musterBasis.indexOf('?') === -1 ? '?' : '&';
        this.musterLink.href = this.musterBasis + trenner + 'farbe=' + encodeURIComponent(wert);
      }
    }

    waehle(option) {
      const radio = this.radios().find((r) => r.value === option.dataset.wert);
      if (radio && !radio.checked) radio.click();
      this.sync();
      if (this.dialogKomponente && typeof this.dialogKomponente.closeDialog === 'function') {
        this.dialogKomponente.closeDialog();
      }
    }

    sichtbare() {
      return this.optionen.filter((o) => !o.parentElement.hidden);
    }

    tasten(e) {
      const tasten = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (tasten.indexOf(e.key) === -1) return;
      const liste = this.sichtbare();
      if (!liste.length) return;
      e.preventDefault();
      const idx = liste.indexOf(document.activeElement);
      let ziel = idx;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') ziel = Math.min(idx + 1, liste.length - 1);
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ziel = Math.max(idx - 1, 0);
      if (e.key === 'Home') ziel = 0;
      if (e.key === 'End') ziel = liste.length - 1;
      if (ziel === -1) ziel = 0;
      liste[ziel].focus();
    }

    filtere() {
      const q = this.suche.value.trim().toLowerCase();
      let treffer = 0;
      this.optionen.forEach((option) => {
        const passt = !q || (option.dataset.suchtext || '').indexOf(q) !== -1;
        option.parentElement.hidden = !passt;
        if (passt) treffer += 1;
      });
      if (this.leer) this.leer.hidden = treffer > 0;
    }

    geoeffnet() {
      if (this.ausloeser) this.ausloeser.setAttribute('aria-expanded', 'true');
      const aktiv = this.querySelector('[data-tp-fa-option][aria-selected="true"]');
      if (!aktiv) return;
      aktiv.scrollIntoView({ block: 'center' });
      // Am Telefon kein Fokus ins Suchfeld: die Tastatur wuerde das Sheet verdecken.
      aktiv.focus({ preventScroll: true });
    }

    geschlossen() {
      if (this.ausloeser) {
        this.ausloeser.setAttribute('aria-expanded', 'false');
        this.ausloeser.focus({ preventScroll: true });
      }
      if (this.suche && this.suche.value) {
        this.suche.value = '';
        this.filtere();
      }
    }
  }

  customElements.define('tp-farbauswahl', TpFarbauswahl);
})();
