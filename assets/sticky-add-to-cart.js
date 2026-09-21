import { Component } from '@theme/component';
import { ThemeEvents, QuantitySelectorUpdateEvent } from '@theme/events';
import { morph } from '@theme/morph';
import { onAnimationEnd } from '@theme/utilities';

/**
 * @typedef {Object} ProductVariant
 * @property {string|number} [id] - Variant ID
 * @property {string} [title] - Variant title
 * @property {string} [name] - Variant name
 * @property {boolean} [available] - Whether variant is available
 * @property {Object} [featured_media] - Featured media object
 * @property {Object} [featured_media.preview_image] - Preview image data
 * @property {string} [featured_media.preview_image.src] - Image source URL
 * @property {string} [featured_media.alt] - Alt text for the image
 */

/**
 * @typedef {HTMLElement & {
 *   source: Element,
 *   destination: Element,
 *   useSourceSize: string | boolean
 * }} FlyToCart
 */

/**
 * @typedef {Object} StickyAddToCartRefs
 * @property {HTMLElement} stickyBar - The floating bar container
 * @property {HTMLButtonElement} addToCartButton - Sticky bar's button
 * @property {HTMLElement} quantityDisplay - Quantity display container
 * @property {HTMLElement} quantityNumber - Quantity number element
 * @property {HTMLImageElement} productImage - Product image element
 */

/**
 * A custom element that manages a sticky add-to-cart bar.
 * Shows when the main buy buttons scroll out of view.
 *
 * @extends {Component<StickyAddToCartRefs>}
 */
class StickyAddToCartComponent extends Component {
  requiredRefs = ['stickyBar', 'addToCartButton', 'quantityDisplay', 'quantityNumber'];

  /** @type {IntersectionObserver | null} */
  #buyButtonsIntersectionObserver = null;

  /** @type {IntersectionObserver | null} */
  #mainBottomObserver = null;

  /** @type {number | undefined} */
  #resetTimeout;

  /** @type {boolean} */
  #isStuck = false;

  /** @type {number | null} */
  #animationTimeout = null;

  /** @type {AbortController} */
  #abortController = new AbortController();

  /** @type {HTMLButtonElement | null} */
  #targetAddToCartButton = null;

  /** @type {number} */
  #currentQuantity = 1;

  /** @type {boolean} */
  #hiddenByBottom = false;

  /** @type {MutationObserver | null} */
  #targetStateObserver = null;

  /**
   * Der Kaufweg-Anker (Kaufblock, Paket-Rechner oder .tp-kaufweg), an dem sich
   * das Ein- und Ausblenden orientiert.
   * @type {Element | null}
   */
  #anchorElement = null;

  /**
   * false, solange der Rechner seinen Kaufbutton verbirgt (keine gueltige
   * Laenge bzw. keine gueltigen Masse). Dann bleibt auch die Leiste aus.
   * @type {boolean}
   */
  #targetUsable = true;

  connectedCallback() {
    super.connectedCallback();

    this.#setupIntersectionObserver();

    const { signal } = this.#abortController;
    const target = this.closest('.shopify-section');
    target?.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });
    target?.addEventListener(ThemeEvents.variantSelected, this.#handleVariantSelected, { signal });
    // Rechner-Seiten haben keinen variant-picker: der Farbwaehler meldet den
    // Wechsel ueber tp:farbe-wechsel (blocks/color-swatch-picker.liquid).
    document.addEventListener('tp:farbe-wechsel', () => this.#syncTargetState(), { signal });

    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartAddComplete, { signal });
    document.addEventListener(ThemeEvents.cartError, this.#handleCartAddComplete, { signal });
    document.addEventListener(ThemeEvents.quantitySelectorUpdate, this.#handleQuantityUpdate, { signal });

    this.#getInitialQuantity();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#buyButtonsIntersectionObserver?.disconnect();
    this.#mainBottomObserver?.disconnect();
    this.#targetStateObserver?.disconnect();
    this.#abortController.abort();
    if (this.#animationTimeout) {
      clearTimeout(this.#animationTimeout);
    }
  }

  /**
   * Sets up the IntersectionObserver to watch the buy buttons visibility
   */
  #setupIntersectionObserver() {
    // Paketprodukte rendern keinen Standard-Kaufblock mehr, weil dort der
    // Paket-Rechner der einzige Kaufweg ist (siehe blocks/buy-buttons.liquid).
    // Er uebernimmt deshalb beide Rollen des Kaufblocks: Scroll-Anker fuer das
    // Ein- und Ausblenden der Leiste und Ziel des Sticky-Buttons. Ohne diesen
    // Rueckfall bliebe die Sticky-Leiste auf genau den Produkten aus, auf
    // denen sie mobil am meisten traegt.
    // Dritter Fall (Rollenware-Rechner, Einfass-Konfigurator): Root .tp-kaufweg
    // mit Button [data-add-to-cart]. Dort ist der Kaufblock im Template
    // deaktiviert, der Rechner ist der einzige Kaufweg.
    const productForm = this.#getProductForm();
    const buyButtonsBlock =
      productForm?.closest('.buy-buttons-block') ?? this.#getPackageSelector() ?? this.#getKaufweg();
    if (!buyButtonsBlock) return;
    this.#anchorElement = buyButtonsBlock;

    // In themes migrated from 2.0, the footer element doesn't exist
    const footer = document.querySelector('footer') ?? document.querySelector('[class*="footer-group"]');
    if (!footer) return;

    // Observer for buy buttons visibility
    this.#buyButtonsIntersectionObserver = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry) return;

      // Only show sticky bar if buy buttons have been scrolled past (above viewport)
      if (!entry.isIntersecting && !this.#isStuck) {
        // Check if the element is above the viewport (scrolled past) or below (not yet reached)
        const rect = entry.target.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top < 0) {
          // Element is above viewport - show sticky bar
          this.#showStickyBar();
        }
        // If rect.top >= 0, element is below viewport - don't show sticky bar yet
      } else if (entry.isIntersecting && this.#isStuck) {
        this.#hiddenByBottom = false;
        this.#hideStickyBar();
      }
    });

    // Observer for footer visibility - hides sticky bar at page bottom
    this.#mainBottomObserver = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;

        if (entry.isIntersecting && this.#isStuck) {
          this.#hiddenByBottom = true;
          this.#hideStickyBar();
        } else if (!entry.isIntersecting && this.#hiddenByBottom) {
          // Footer out of view - check if we should show sticky bar again
          const rect = buyButtonsBlock.getBoundingClientRect();
          // Only show if buy buttons are above the viewport (scrolled past)
          if (rect.bottom < 0 || rect.top < 0) {
            this.#hiddenByBottom = false;
            this.#showStickyBar();
          }
        }
      },
      {
        rootMargin: '200px 0px 0px 0px',
      }
    );

    this.#buyButtonsIntersectionObserver.observe(buyButtonsBlock);
    this.#mainBottomObserver.observe(footer);
    this.#setTargetAddToCartButton(this.#getTargetAddToCartButton());
  }

  /**
   * Der Rechner-Kaufweg (Rollenware-Rechner, Einfass-Konfigurator), sofern die
   * Seite einen hat.
   * @returns {HTMLElement | null}
   */
  #getKaufweg() {
    const sectionElement = this.closest('.shopify-section');
    return sectionElement?.querySelector('.tp-kaufweg') ?? null;
  }

  /**
   * Merkt sich den Zielbutton und spiegelt bei Rechner-Buttons dessen
   * hidden/disabled-Zustand auf die Leiste. Der Rechner verbirgt seinen Button,
   * solange keine gueltige Laenge eingegeben ist, und sperrt ihn waehrend des
   * Warenkorb-Aufrufs (inFlight). Ohne Spiegelung wuerde die Leiste einen
   * Klick anbieten, den der Rechner stillschweigend verwirft.
   * @param {HTMLButtonElement | null} button
   */
  #setTargetAddToCartButton(button) {
    if (button === this.#targetAddToCartButton && this.#targetStateObserver) return;
    this.#targetAddToCartButton = button;
    this.#targetStateObserver?.disconnect();
    this.#targetStateObserver = null;
    this.#targetUsable = true;

    if (!button || !button.closest('.tp-kaufweg')) {
      this.#syncTargetState();
      return;
    }

    this.#targetStateObserver = new MutationObserver(() => this.#syncTargetState());
    this.#targetStateObserver.observe(button, {
      attributes: true,
      attributeFilter: ['hidden', 'disabled'],
      childList: true,
      characterData: true,
      subtree: true,
    });
    // Breite und Laenge aendern das Stueck, nicht zwingend den Button.
    const stueck = button.closest('.tp-kaufweg')?.querySelector('[data-stueck]');
    if (stueck) {
      this.#targetStateObserver.observe(stueck, {
        attributes: true,
        attributeFilter: ['hidden'],
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    this.#syncTargetState();
  }

  /**
   * Uebertraegt hidden/disabled und die Beschriftung des Rechner-Buttons auf
   * den Sticky-Button. Ist der Rechner-Button verborgen, verschwindet die
   * Leiste; sie kommt wieder, sobald eine gueltige Eingabe vorliegt und der
   * Kaufweg oberhalb des Viewports liegt.
   */
  #syncTargetState() {
    const target = this.#targetAddToCartButton;
    const { addToCartButton } = this.refs;
    if (!addToCartButton) return;

    if (!target || !target.closest('.tp-kaufweg')) {
      this.#targetUsable = true;
      return;
    }

    const usable = !target.hidden;
    addToCartButton.disabled = target.hidden || target.disabled;

    const label = addToCartButton.querySelector('.add-to-cart-text__content > span');
    if (label) {
      const text = (target.textContent || '').trim();
      if (usable && text) {
        label.textContent = text;
      } else {
        label.textContent = target.closest('[data-tp-ek]') ? 'Maße eingeben' : 'Länge eingeben';
      }
    }

    // Der Variantenpreis passt auf Rechner-Seiten nicht zur Bestellung: im
    // Raummass gilt die Wunschmass-Variante (89 €/m²), die Leiste nennt aber
    // die Rollenvariante (65,90 €/m²); der Einfass-Konfigurator fuehrt den
    // Preis je 0,01 m² (0,89 €), den snippets/price.liquid ausserhalb der
    // Produktkarte nicht umrechnet. Deshalb steht hier der Gesamtpreis des
    // Rechners ([data-total]); der Konfigurator traegt ihn schon im Button.
    const priceElement = this.querySelector('.sticky-add-to-cart__price');
    if (priceElement) {
      const kaufweg = target.closest('.tp-kaufweg');
      const total = kaufweg?.querySelector('[data-total]');
      const totalText = (total?.textContent || '').trim();
      if (target.closest('[data-tp-ek]') || !usable || !totalText || totalText === '–') {
        priceElement.style.display = 'none';
      } else {
        priceElement.textContent = totalText;
        priceElement.style.display = '';
      }
    }

    this.#syncRechnerVariantLine(target);

    this.#targetUsable = usable;
    if (!usable) {
      if (this.#isStuck) this.#hideStickyBar();
    } else if (!this.#isStuck && !this.#hiddenByBottom && this.#anchorElement) {
      const rect = this.#anchorElement.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top < 0) this.#showStickyBar();
    }

    this.#updateButtonText();
  }

  /**
   * Variantenzeile auf Seiten mit dem Rollenware-Rechner. Dort gibt es keinen
   * variant-picker und damit kein variant:update - die Zeile blieb auf der
   * Startvariante stehen. Farbe kommt aus dem Farbwaehler, das Mass aus der
   * Stueck-Zeile des Rechners; gerechnet wird hier nichts.
   * @param {HTMLElement} target - Kaufbutton des Rechners
   */
  #syncRechnerVariantLine(target) {
    const kaufweg = target.closest('.tp-kaufweg');
    if (!kaufweg) return;
    // Der Einfass-Konfigurator hat keine Stueck-Zeile - dort nur die Farbe.
    const mass = kaufweg.querySelector('[data-stueck-mass]');
    const variantElement = this.querySelector('.sticky-add-to-cart__variant');
    if (!variantElement) return;

    const section = this.closest('.shopify-section');
    const farbe = section?.querySelector('[data-farb-item] input:checked');
    const stueckBox = mass?.closest('[data-stueck]');
    const sichtbar = stueckBox instanceof HTMLElement && !stueckBox.hidden;
    const voll = sichtbar
      ? (mass?.textContent || '').replace(/^Ihr Stück:\s*/, '').replace(/\s*=\s*[^=]*$/, '').trim()
      : '';
    // Die Infospalte der Leiste ist schmal: "400 × 350 cm" statt der
    // ausgeschriebenen Zeile; die steht im Rechner und hier im title.
    const zahlen = voll.match(/Breite\s+(\d+)\s*cm.*?Länge\s+(\d+)\s*cm/);
    const massText = zahlen ? `${zahlen[1]} × ${zahlen[2]} cm` : '';
    const farbName = farbe instanceof HTMLInputElement ? farbe.value : '';
    // Mass zuerst: bei langen Farbnamen kuerzt die Ellipse nur das Namensende.
    const teile = [massText, farbName].filter(Boolean);
    if (!teile.length) return;
    variantElement.textContent = teile.join(' · ');
    variantElement.title = [farbName, voll].filter(Boolean).join(' · ');
    variantElement.style.whiteSpace = 'nowrap';
    variantElement.style.overflow = 'hidden';
    variantElement.style.textOverflow = 'ellipsis';
  }

  /**
   * Der Paket-Rechner der Paketprodukte, sofern die Seite einen hat.
   * @returns {HTMLElement | null}
   */
  #getPackageSelector() {
    const sectionElement = this.closest('.shopify-section');
    return sectionElement?.querySelector('.tp-paket-auswahl') ?? null;
  }

  /**
   * Der echte Kaufbutton, den der Sticky-Button stellvertretend klickt:
   * normalerweise der des Standard-Kaufblocks, bei Paketware der des
   * Paket-Rechners.
   * @returns {HTMLButtonElement | null}
   */
  #getTargetAddToCartButton() {
    const productForm = this.#getProductForm();
    const button = productForm
      ? productForm.querySelector('[ref="addToCartButton"]')
      : (this.#getPackageSelector() ?? this.#getKaufweg())?.querySelector('[data-add-to-cart]');

    return /** @type {HTMLButtonElement | null} */ (button ?? null);
  }

  // Public action handlers
  /**
   * Handles the add to cart button click in the sticky bar
   */
  handleAddToCartClick = async () => {
    const target = this.#targetAddToCartButton;
    if (!target) return;
    // Rechner-Buttons: verborgen oder gesperrt (keine gueltige Laenge, Aufruf
    // laeuft) heisst kein Klick - der Rechner wuerde ihn ohnehin verwerfen, die
    // Leiste zeigte aber die "Hinzugefuegt"-Animation.
    if (target.hidden || target.disabled) return;
    target.dataset.puppet = 'true';
    target.click();
    const cartIcon = document.querySelector('.header-actions__cart-icon');

    if (this.refs.addToCartButton.dataset.added !== 'true') {
      this.refs.addToCartButton.dataset.added = 'true';
    }

    if (this.#resetTimeout) clearTimeout(this.#resetTimeout);

    // Ohne Produktbild (z. B. Wunschmass-Varianten ohne Bild) gibt es nichts,
    // das zum Warenkorb fliegen koennte - dann nur die Button-Animation.
    if (!cartIcon || !this.refs.productImage) {
      await onAnimationEnd([this.refs.addToCartButton]);
      this.#resetTimeout = setTimeout(() => {
        this.refs.addToCartButton.removeAttribute('data-added');
      }, 800);
      return;
    }

    const flyToCartElement = /** @type {FlyToCart} */ (document.createElement('fly-to-cart'));
    const sourceStyles = getComputedStyle(this.refs.productImage);

    flyToCartElement.classList.add('fly-to-cart--sticky');
    flyToCartElement.style.setProperty('background-image', `url(${this.refs.productImage.src})`);
    flyToCartElement.useSourceSize = 'true';
    flyToCartElement.source = this.refs.productImage;
    flyToCartElement.destination = cartIcon;

    document.body.appendChild(flyToCartElement);

    await onAnimationEnd([this.refs.addToCartButton, flyToCartElement]);
    this.#resetTimeout = setTimeout(() => {
      this.refs.addToCartButton.removeAttribute('data-added');
    }, 800);
  };

  /**
   * Handles variant update events
   * @param {CustomEvent} event - The variant update event
   */
  #handleVariantUpdate = (event) => {
    if (event.detail.data.productId !== this.dataset.productId) return;

    const variant = event.detail.resource;

    // Get the new sticky add to cart HTML from the server response
    const newStickyAddToCart = event.detail.data.html.querySelector('sticky-add-to-cart');
    if (!newStickyAddToCart) return;

    const newStickyBar = newStickyAddToCart.querySelector('[ref="stickyBar"]');
    if (!newStickyBar) return;

    // Store current visibility state before morphing
    const currentStuck = this.refs.stickyBar.getAttribute('data-stuck') || 'false';
    const variantAvailable = newStickyAddToCart.dataset.variantAvailable;

    // Morph the entire sticky bar content
    morph(this.refs.stickyBar, newStickyBar, { childrenOnly: true });

    // Restore visibility state after morphing
    this.refs.stickyBar.setAttribute('data-stuck', currentStuck);
    this.dataset.variantAvailable = variantAvailable;

    // Update the dataset attributes with new variant info
    if (variant && variant.id) {
      this.dataset.currentVariantId = variant.id;
    }

    // Re-cache the target add to cart button after morphing
    const nextTarget = this.#getTargetAddToCartButton();
    if (nextTarget) {
      this.#setTargetAddToCartButton(nextTarget);
    }
    // Der Morph hat die Beschriftung des Sticky-Buttons auf den Serverstand
    // gesetzt - bei Rechner-Buttons den Rechnerstand erneut uebertragen.
    this.#syncTargetState();

    if (variant == null) {
      this.#handleVariantUnavailable();
    }
    // Restore the current quantity display if needed
    this.#updateButtonText();
  };

  /**
   * Handles variant selected events
   * @param {CustomEvent} event - The variant selected event
   */
  #handleVariantSelected = (event) => {
    // The variant update event will follow and handle all updates via morph
    // We just update the dataset here for tracking
    const variantId = event.detail.resource?.id;
    if (!variantId) return;
    this.dataset.currentVariantId = variantId;
  };

  /**
   * Updates the variant title based on selected options when the variant is unavailable
   */
  #handleVariantUnavailable = () => {
    this.dataset.currentVariantId = '';
    const variantTitleElement = this.querySelector('.sticky-add-to-cart__variant');
    const productId = this.dataset.productId;
    const variantPicker = document.querySelector(`variant-picker[data-product-id="${productId}"]`);
    if (!variantTitleElement || !variantPicker) return;

    const selectedOptions = Array.from(variantPicker.querySelectorAll('input:checked'))
      .map((option) => /** @type {HTMLInputElement} */ (option).value)
      .filter((value) => value !== '')
      .join(' / ');
    if (!selectedOptions) return;
    variantTitleElement.textContent = selectedOptions;
  };

  /**
   * Handles cart add complete (success or error) - resets puppet flag
   * @param {CustomEvent} _event - The cart event (unused)
   */
  #handleCartAddComplete = (_event) => {
    // Reset the puppet flag after cart operation
    if (this.#targetAddToCartButton) {
      this.#targetAddToCartButton.dataset.puppet = 'false';
    }
  };

  /**
   * Handles quantity selector update events
   * @param {QuantitySelectorUpdateEvent} event - The quantity update event
   */
  #handleQuantityUpdate = (event) => {
    // Only respond to product page quantity selector updates, not cart drawer
    if (event.detail.cartLine) return;

    this.#currentQuantity = event.detail.quantity;
    this.#updateButtonText();
  };

  /**
   * Shows the sticky bar with animation
   */
  #showStickyBar() {
    const { stickyBar } = this.refs;
    if (!this.#targetUsable) return;
    this.#isStuck = true;
    stickyBar.dataset.stuck = 'true';
  }

  /**
   * Hides the sticky bar with animation
   */
  #hideStickyBar() {
    const { stickyBar } = this.refs;
    this.#isStuck = false;
    stickyBar.dataset.stuck = 'false';
  }

  // Helper methods
  /**
   * Gets the product form element
   * @returns {HTMLElement | null}
   */
  #getProductForm() {
    const productId = this.dataset.productId;
    if (!productId) return null;

    const sectionElement = this.closest('.shopify-section');
    if (!sectionElement) return null;

    const sectionId = sectionElement.id.replace('shopify-section-', '');
    return document.querySelector(
      `#shopify-section-${sectionId} product-form-component[data-product-id="${productId}"]`
    );
  }

  /**
   * Gets the initial quantity from the data attribute
   */
  #getInitialQuantity() {
    this.#currentQuantity = parseInt(this.dataset.initialQuantity || '1') || 1;
    this.#updateButtonText();
  }

  /**
   * Updates the button text to include quantity
   */
  #updateButtonText() {
    const { addToCartButton, quantityDisplay, quantityNumber } = this.refs;

    const available = !addToCartButton.disabled;

    // Update the quantity number
    quantityNumber.textContent = this.#currentQuantity.toString();

    // Show/hide the quantity display based on availability and quantity
    if (available && this.#currentQuantity > 1) {
      quantityDisplay.style.display = 'inline';
    } else {
      quantityDisplay.style.display = 'none';
    }
  }
}

if (!customElements.get('sticky-add-to-cart')) {
  customElements.define('sticky-add-to-cart', StickyAddToCartComponent);
}
