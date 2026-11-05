/**
 * Preisklassen-Kacheln beim Filtern ohne Neuladen aktuell halten (PR-Review #1905).
 *
 * Horizon rendert bei einem Filterwechsel nur die Produktsection neu. Trefferzahlen,
 * Aktivzustand und Links der Kacheln kommen aber aus collection.filters und waeren
 * danach veraltet: ein Tipp auf eine Kachel fuehrte zu einer URL ohne die gerade
 * gesetzten Filter. Deshalb rendert sich die Section bei filter:update selbst mit.
 * filter:update feuert erst nach dem pushState (assets/facets.js), die aktuelle
 * Adresse traegt also schon die neue Auswahl.
 */
import { ThemeEvents } from '@theme/events';
import { sectionRenderer } from '@theme/section-renderer';

class TpPreisklassen extends HTMLElement {
  /** Nur der neueste Lauf raeumt auf; renderSection verwirft aeltere Morphs selbst. */
  #lauf = 0;

  connectedCallback() {
    document.addEventListener(ThemeEvents.FilterUpdate, this.#aktualisiere);
    this.addEventListener('click', this.#sperreWaehrendLaden);
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.FilterUpdate, this.#aktualisiere);
    this.removeEventListener('click', this.#sperreWaehrendLaden);
  }

  #aktualisiere = () => {
    const sectionId = this.getAttribute('section-id');
    if (!sectionId) return;
    const lauf = ++this.#lauf;
    const adresse = window.location.href;
    this.setAttribute('aria-busy', 'true');
    return sectionRenderer.renderSection(sectionId)
      .catch((error) => {
        // Wie renderFacetsSection: ohne frische Kacheln die gewaehlte Adresse normal laden,
        // sonst fuehrt der naechste Tipp wieder zu einer Adresse ohne die Filter.
        if (error?.name !== 'AbortError' && window.location.href === adresse) window.location.replace(adresse);
      })
      .finally(() => {
        if (lauf === this.#lauf) this.removeAttribute('aria-busy');
      });
  };

  /** Bis die Antwort da ist, tragen die Links noch die alte Auswahl: nicht folgen. */
  #sperreWaehrendLaden = (event) => {
    if (this.hasAttribute('aria-busy') && event.target?.closest?.('a')) event.preventDefault();
  };
}

if (!customElements.get('tp-preisklassen')) {
  customElements.define('tp-preisklassen', TpPreisklassen);
}
