import { Component } from '@theme/component';
import { onAnimationEnd } from '@theme/utilities';
import { ThemeEvents, CartUpdateEvent } from '@theme/events';
import { artikelzahlFuer } from '@theme/tp-cart-artikelzahl';

/**
 * A custom element that displays a cart icon.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} cartBubble - The cart bubble element.
 * @property {HTMLElement} cartBubbleText - The cart bubble text element.
 * @property {HTMLElement} cartBubbleCount - The cart bubble count element.
 *
 * @extends {Component<Refs>}
 */
class CartIcon extends Component {
  requiredRefs = ['cartBubble', 'cartBubbleText', 'cartBubbleCount'];

  /** Zaehlt cart:update-Ereignisse, damit eine spaete Antwort keine neuere ueberschreibt. */
  #artikelzahlLauf = 0;

  /** @type {number} */
  get currentCartCount() {
    return parseInt(this.refs.cartBubbleCount.textContent ?? '0', 10);
  }

  set currentCartCount(value) {
    this.refs.cartBubbleCount.textContent = value < 100 ? String(value) : '';
  }

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.cartUpdate, this.onCartUpdate);
    window.addEventListener('pageshow', this.onPageShow);
    this.ensureCartBubbleIsCorrect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.cartUpdate, this.onCartUpdate);
    window.removeEventListener('pageshow', this.onPageShow);
  }

  /**
   * Handles the page show event when the page is restored from cache.
   * @param {PageTransitionEvent} event - The page show event.
   */
  onPageShow = (event) => {
    if (event.persisted) {
      this.ensureCartBubbleIsCorrect();
    }
  };

  /**
   * Handles the cart update event.
   * @param {CartUpdateEvent} event - The cart update event.
   */
  onCartUpdate = async (event) => {
    const itemCount = event.detail.data?.itemCount ?? 0;
    const comingFromProductForm = event.detail.data?.source === 'product-form-component';

    // Artikelzahl vom Server: Eine Zeile Flaechenware zaehlt als 1, nicht als
    // ihre Menge in 0,01 m² (assets/tp-cart-artikelzahl.js). Nur wenn sie
    // nicht zu bekommen ist, bleibt es beim Horizon-Verhalten mit der Menge
    // des Senders.
    const lauf = ++this.#artikelzahlLauf;
    const artikelzahl = await artikelzahlFuer(event);

    if (artikelzahl === null) {
      this.renderCartBubble(itemCount, comingFromProductForm);
      return;
    }

    // Eine neuere Warenkorbaenderung ist schon unterwegs und bringt die
    // aktuellere Zahl mit.
    if (lauf !== this.#artikelzahlLauf) return;

    this.renderCartBubble(artikelzahl, false);
  };

  /**
   * Renders the cart bubble.
   * @param {number} itemCount - The number of items in the cart.
   * @param {boolean} comingFromProductForm - Whether the cart update is coming from the product form.
   */
  renderCartBubble = async (itemCount, comingFromProductForm, animate = true) => {
    // If the cart update is coming from the product form, we add to the current cart count, otherwise we set the new cart count

    this.refs.cartBubbleCount.classList.toggle('hidden', itemCount === 0);
    this.refs.cartBubble.classList.toggle('visually-hidden', itemCount === 0);

    this.currentCartCount = comingFromProductForm ? this.currentCartCount + itemCount : itemCount;

    this.classList.toggle('header-actions__cart-icon--has-cart', itemCount > 0);

    sessionStorage.setItem(
      'cart-count',
      JSON.stringify({
        value: String(this.currentCartCount),
        timestamp: Date.now(),
      })
    );

    if (!animate || itemCount === 0) return;

    // Ensure element is visible before starting animation
    // Use requestAnimationFrame to ensure the browser sees the state change
    await new Promise((resolve) => requestAnimationFrame(resolve));

    this.refs.cartBubble.classList.add('cart-bubble--animating');
    await onAnimationEnd(this.refs.cartBubbleText);

    this.refs.cartBubble.classList.remove('cart-bubble--animating');
  };

  /**
   * Checks if the cart count is correct.
   */
  ensureCartBubbleIsCorrect = () => {
    // Ensure refs are available
    if (!this.refs.cartBubbleCount) return;

    const sessionStorageCount = sessionStorage.getItem('cart-count');

    // If no session storage data, nothing to check
    if (sessionStorageCount === null) return;

    const visibleCount = this.refs.cartBubbleCount.textContent;

    try {
      const { value, timestamp } = JSON.parse(sessionStorageCount);

      // Check if the stored count matches what's visible
      if (value === visibleCount) return;

      // Only update if timestamp is recent (within 10 seconds)
      if (Date.now() - timestamp < 10000) {
        const count = parseInt(value, 10);

        if (count >= 0) {
          this.renderCartBubble(count, false, false);
        }
      }
    } catch (_) {
      // no-op
    }
  };
}

if (!customElements.get('cart-icon')) {
  customElements.define('cart-icon', CartIcon);
}
