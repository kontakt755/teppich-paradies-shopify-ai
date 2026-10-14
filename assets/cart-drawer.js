import { DialogComponent, DialogOpenEvent, DialogCloseEvent } from '@theme/dialog';
import { CartAddEvent } from '@theme/events';
import { isMobileBreakpoint } from '@theme/utilities';
import { artikelzahlFuer } from '@theme/tp-cart-artikelzahl';

/**
 * A custom element that manages a cart drawer.
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog - The dialog element.
 * @property {HTMLElement} [liveRegion] - The live region for cart announcements when dialog is open.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  /** @type {number} */
  #summaryThreshold = 0.5;

  /** @type {AbortController | null} */
  #historyAbortController = null;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.addEventListener(DialogOpenEvent.eventName, this.#updateStickyState);
    this.addEventListener(DialogOpenEvent.eventName, this.#handleHistoryOpen);
    this.addEventListener(DialogCloseEvent.eventName, this.#handleHistoryClose);

    if (history.state?.cartDrawerOpen) {
      history.replaceState(null, '');
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.removeEventListener(DialogOpenEvent.eventName, this.#updateStickyState);
    this.removeEventListener(DialogOpenEvent.eventName, this.#handleHistoryOpen);
    this.removeEventListener(DialogCloseEvent.eventName, this.#handleHistoryClose);
    this.#historyAbortController?.abort();
  }

  #handleHistoryOpen = () => {
    if (!isMobileBreakpoint()) return;

    if (!history.state?.cartDrawerOpen) {
      // Der Scroll-Lock hat die Seite hier schon auf 0 gesetzt; diese 0 merkt
      // sich der Browser fuer den Eintrag, den pushState verlaesst. Beim
      // Schliessen stellte history.back() sie wieder her und zog die Seite
      // eine Sekunde spaeter weich nach oben - Taps in dieser Zeit trafen
      // etwas anderes. Der Modus gilt je Eintrag und muss deshalb vor
      // pushState stehen; nach der Rueckkehr wieder wie vorher.
      const restoration = history.scrollRestoration;
      history.scrollRestoration = 'manual';
      window.addEventListener(
        'popstate',
        () => {
          setTimeout(() => {
            history.scrollRestoration = restoration;
          }, 500);
        },
        { once: true }
      );
      history.pushState({ cartDrawerOpen: true }, '');
    }

    this.#historyAbortController = new AbortController();
    window.addEventListener('popstate', this.#handlePopState, { signal: this.#historyAbortController.signal });
  };

  #handleHistoryClose = () => {
    this.#historyAbortController?.abort();
    if (history.state?.cartDrawerOpen) {
      history.back();
    }
  };

  #handlePopState = async () => {
    if (this.refs.dialog?.open) {
      this.refs.dialog.style.setProperty('--dialog-drawer-closing-animation', 'none');
      await this.closeDialog();
      this.refs.dialog.style.removeProperty('--dialog-drawer-closing-animation');
    }
  };

  /**
   * Handles cart add events - opens drawer if auto-open and announces count when open.
   * @param {CustomEvent<{ resource?: { item_count?: number } }>} event
   */
  #handleCartAdd = async (event) => {
    // Nur bei echtem Hinzufuegen oeffnen: der Zuschnitt-Abgleich beim Seitenladen
    // meldet ebenfalls cart:update und oeffnete sonst einen (leeren) Warenkorb.
    const quelle = event.detail?.data?.source;
    if (this.hasAttribute('auto-open') && quelle !== 'tp-zuschnitt-abgleich') {
      this.showDialog();
    }

    const shopifyCount = event.detail.resource?.item_count;
    if (shopifyCount === undefined) return;

    // Dieselbe Zahl wie die Header-Blase (Flaechenware je Zeile 1) statt
    // Shopifys Mengensumme, siehe assets/tp-cart-artikelzahl.js.
    this.#announceCartCount((await artikelzahlFuer(event)) ?? shopifyCount);
  };

  /**
   * Announces cart count to screen readers when dialog is open.
   * @param {number | undefined} cartCount
   */
  #announceCartCount(cartCount) {
    const liveRegion = /** @type {HTMLElement | undefined} */ (this.refs.liveRegion);
    if (!this.refs.dialog?.open || !liveRegion || cartCount === undefined) return;

    liveRegion.textContent = `${Theme.translations.cart_count}: ${cartCount}`;
  }

  open() {
    this.showDialog();

    /**
     * Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
     */
    customElements.whenDefined('shopify-payment-terms').then(() => {
      const installmentsContent = document.querySelector('shopify-payment-terms')?.shadowRoot;
      const cta = installmentsContent?.querySelector('#shopify-installments-cta');
      cta?.addEventListener('click', this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }

  #updateStickyState() {
    const { dialog } = /** @type {Refs} */ (this.refs);
    if (!dialog) return;

    // Refs do not cross nested `*-component` boundaries (e.g., `cart-items-component`), so we query within the dialog.
    const content = dialog.querySelector('.cart-drawer__content');
    const summary = dialog.querySelector('.cart-drawer__summary');

    if (!content || !summary) {
      // Ensure the dialog doesn't get stuck in "unsticky" mode when summary disappears (e.g., empty cart).
      dialog.setAttribute('cart-summary-sticky', 'false');
      return;
    }

    const drawerHeight = dialog.getBoundingClientRect().height;
    const summaryHeight = summary.getBoundingClientRect().height;
    const ratio = summaryHeight / drawerHeight;
    dialog.setAttribute('cart-summary-sticky', ratio > this.#summaryThreshold ? 'false' : 'true');
  }
}

if (!customElements.get('cart-drawer-component')) {
  customElements.define('cart-drawer-component', CartDrawerComponent);
}
