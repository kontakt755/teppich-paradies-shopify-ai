/**
 * Updates the recently viewed products in sessionStorage.
 *
 * Teppich Paradies (Inhaber 19.10.2026, Rechtstexte w-083 Frage 8B): "Zuletzt
 * angesehen" gilt nur fuer den aktuellen Besuch. Horizon speichert die Liste im
 * localStorage (bleibt nach dem Schliessen des Browsers und auch nach "Ablehnen"
 * im Cookie-Banner). Hier im sessionStorage; ein alter localStorage-Eintrag wird
 * beim ersten Zugriff einmalig geloescht.
 */
export class RecentlyViewed {
  /** @static @constant {string} The key used to store the viewed products in session storage */
  static #STORAGE_KEY = 'viewedProducts';
  /** @static @constant {number} The maximum number of products to store */
  static #MAX_PRODUCTS = 4;
  /** @static {boolean} Ob der alte, dauerhafte Eintrag schon entfernt wurde */
  static #altBereinigt = false;

  /**
   * Speicher dieses Besuchs; null, wenn der Browser ihn sperrt.
   * @returns {Storage | null}
   */
  static #speicher() {
    if (!this.#altBereinigt) {
      this.#altBereinigt = true;
      try {
        localStorage.removeItem(this.#STORAGE_KEY);
      } catch (e) {
        // Speicher gesperrt (z. B. privates Fenster) - nichts zu bereinigen
      }
    }
    try {
      return sessionStorage;
    } catch (e) {
      return null;
    }
  }

  /**
   * Adds a product to the recently viewed products list.
   * @param {string} productId - The ID of the product to add.
   */
  static addProduct(productId) {
    const speicher = this.#speicher();
    if (!speicher) return;

    let viewedProducts = this.getProducts();

    viewedProducts = viewedProducts.filter((/** @type {string} */ id) => id !== productId);
    viewedProducts.unshift(productId);
    viewedProducts = viewedProducts.slice(0, this.#MAX_PRODUCTS);

    try {
      speicher.setItem(this.#STORAGE_KEY, JSON.stringify(viewedProducts));
    } catch (e) {
      // Speicher voll oder gesperrt - Funktion entfaellt still
    }
  }

  static clearProducts() {
    const speicher = this.#speicher();
    if (!speicher) return;
    try {
      speicher.removeItem(this.#STORAGE_KEY);
    } catch (e) {
      // gesperrt - nichts zu tun
    }
  }

  /**
   * Retrieves the list of recently viewed products from session storage.
   * @returns {string[]} The list of viewed products.
   */
  static getProducts() {
    const speicher = this.#speicher();
    if (!speicher) return [];
    try {
      const liste = JSON.parse(speicher.getItem(this.#STORAGE_KEY) || '[]');
      return Array.isArray(liste) ? liste : [];
    } catch (e) {
      return [];
    }
  }
}
