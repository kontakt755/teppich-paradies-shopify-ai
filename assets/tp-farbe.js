/**
 * Farbverwaltung: haelt Farbnummer-Properties und Farbanzeige beim
 * Variantenwechsel aktuell.
 *
 * Horizon rendert bei einem Variantenwechsel nur den Variantenwaehler neu und
 * feuert danach `variant:update` (siehe assets/variant-picker.js). Das
 * Produktformular und andere Bloecke bleiben stehen - deshalb tragen die
 * Elemente hier eine JSON-Karte aller Varianten und schreiben sich selbst um.
 *
 * Karte (snippets/tp-farbe-properties.liquid, blocks/tp-farbanzeige.liquid):
 *   { "<variantId>": { "name": "Rot", "nummer": "1111", "intern": "Rot – 1111", "bild": "..." } }
 */

const VARIANT_UPDATE = 'variant:update';
// Eigenes Event des Farb-Swatch-Pickers (blocks/color-swatch-picker.liquid), Rollenware ohne nativen Variantenwaehler.
const FARBE_WECHSEL = 'tp:farbe-wechsel';

/**
 * @param {HTMLElement} host
 * @returns {Record<string, {name?: string, nummer?: string, intern?: string, bild?: string, swatch?: string}>}
 */
function readMap(host) {
  const script = host.querySelector('script[data-tp-farbe-map]');
  if (!script?.textContent) return {};
  try {
    return JSON.parse(script.textContent);
  } catch (error) {
    console.warn('[tp-farbe] Farbkarte unlesbar', error);
    return {};
  }
}

/**
 * @param {HTMLElement} host
 * @returns {Element | Document}
 */
function eventTarget(host) {
  return host.closest('.shopify-section, dialog, product-card') ?? document;
}

/**
 * @param {Event} event
 * @param {HTMLElement} host
 * @returns {string | null}
 */
function variantIdFromEvent(event, host) {
  const detail = /** @type {CustomEvent} */ (event).detail;
  if (event.type === FARBE_WECHSEL) return detail?.variantId ? String(detail.variantId) : null;
  if (!detail?.resource?.id) return null;
  const productId = detail.data?.newProduct?.id ?? detail.data?.productId;
  if (productId && host.dataset.productId && String(productId) !== String(host.dataset.productId)) {
    return null;
  }
  return String(detail.resource.id);
}

/**
 * @param {HTMLInputElement | null} input
 * @param {string | undefined} value
 */
function setInput(input, value) {
  if (!input) return;
  const text = (value ?? '').trim();
  input.value = text;
  input.disabled = text === '';
}

class TpFarbeProperties extends HTMLElement {
  #abort = new AbortController();

  connectedCallback() {
    this.map = readMap(this);
    eventTarget(this).addEventListener(VARIANT_UPDATE, this.#onVariantUpdate, { signal: this.#abort.signal });
    document.addEventListener(FARBE_WECHSEL, this.#onVariantUpdate, { signal: this.#abort.signal });
  }

  disconnectedCallback() {
    this.#abort.abort();
  }

  #onVariantUpdate = (event) => {
    const id = variantIdFromEvent(event, this);
    if (!id) return;
    const entry = this.map?.[id] ?? {};
    setInput(this.querySelector('input[data-tp-farbe-nummer]'), entry.nummer);
    setInput(this.querySelector('input[data-tp-farbe-intern]'), entry.intern);
  };
}

class TpFarbeAnzeige extends HTMLElement {
  #abort = new AbortController();

  connectedCallback() {
    this.map = readMap(this);
    eventTarget(this).addEventListener(VARIANT_UPDATE, this.#onVariantUpdate, { signal: this.#abort.signal });
    document.addEventListener(FARBE_WECHSEL, this.#onVariantUpdate, { signal: this.#abort.signal });
  }

  disconnectedCallback() {
    this.#abort.abort();
  }

  #onVariantUpdate = (event) => {
    const id = variantIdFromEvent(event, this);
    if (!id) return;
    const entry = this.map?.[id];
    if (!entry) return;

    const name = this.querySelector('[data-tp-farbe-name]');
    if (name) name.textContent = entry.name ?? '';

    const nummer = this.querySelector('[data-tp-farbe-nummer]');
    if (nummer) {
      nummer.textContent = entry.nummer ?? '';
      nummer.hidden = !entry.nummer;
    }

    // Nicht jede Farbe hat ein eigenes Foto. Ohne Foto zeigt die Galerie das
    // Hauptbild des Produkts, also eine andere Farbe - dann muss der Hinweis
    // sichtbar sein.
    const hinweis = /** @type {HTMLElement | null} */ (this.querySelector('[data-tp-farbe-hinweis]'));
    if (hinweis) hinweis.hidden = Boolean(entry.bild);

    const swatch = /** @type {HTMLElement | null} */ (this.querySelector('[data-tp-farbe-swatch]'));
    if (swatch) {
      if (entry.bild) {
        swatch.style.setProperty('--tp-farbe-swatch', `url(${entry.bild})`);
        swatch.classList.remove('tp-farbanzeige__swatch--leer');
      } else if (entry.swatch) {
        swatch.style.setProperty('--tp-farbe-swatch', entry.swatch);
        swatch.classList.remove('tp-farbanzeige__swatch--leer');
      } else {
        swatch.style.removeProperty('--tp-farbe-swatch');
        swatch.classList.add('tp-farbanzeige__swatch--leer');
      }
    }

    this.hidden = !entry.name && !entry.nummer;
  };
}

if (!customElements.get('tp-farbe-properties')) {
  customElements.define('tp-farbe-properties', TpFarbeProperties);
}
if (!customElements.get('tp-farbe-anzeige')) {
  customElements.define('tp-farbe-anzeige', TpFarbeAnzeige);
}
