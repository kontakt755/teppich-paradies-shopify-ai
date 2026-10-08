/**
 * Zuletzt angesehen (Werkbank w-025).
 *
 * Liest die vom Theme bereits gefuehrte Liste angesehener Produkte
 * (assets/recently-viewed-products.js, localStorage "viewedProducts") und holt
 * die zugehoerigen Produktkarten ueber die Section Rendering API: dieselbe
 * Section wird auf einer Suche id:123 OR id:456 gerendert und liefert die
 * Karten mit dem statischen Kartenblock aus sections/tp-zuletzt-group.json.
 * Titelkuerzung, EUR/m2 bei Paketware sowie Muster und Vergleich stammen
 * damit aus denselben Bloecken wie in jedem Raster - hier steckt keine eigene
 * Karten- oder Preislogik.
 *
 * Die Huelle (sections/tp-zuletzt-angesehen.liquid) bleibt versteckt, bis
 * mindestens eine Karte da ist: ohne Verlauf entsteht weder Leerraum noch ein
 * Netzwerkaufruf, und es verschiebt sich nichts.
 *
 * Der Speicher wird nur gelesen. Schreiben tut weiterhin allein
 * snippets/scripts.liquid auf Produktseiten (RecentlyViewed.addProduct).
 */
import { RecentlyViewed } from '@theme/recently-viewed-products';

/** Das Theme speichert hoechstens so viele Produkte (inklusive des aktuellen). */
export const MAX_GESPEICHERT = 4;

/** Tracking-Parameter, die Shopify an Links in Suchergebnissen anhaengt. */
export const SUCH_PARAMETER = ['_pos', '_sid', '_ss'];

/**
 * Produkt-IDs fuer die Anzeige: Reihenfolge des Verlaufs (neueste zuerst),
 * ohne das aktuelle Produkt, ohne Doppelte und Unbrauchbares.
 *
 * @param {unknown} gespeichert - Inhalt des Verlaufs, normalerweise ein Array von ID-Strings.
 * @param {string} aktuell - ID des Produkts der aktuellen Seite, sonst leer.
 * @param {number} maximum - hoechstens so viele IDs.
 * @returns {string[]}
 */
export function verlaufsIds(gespeichert, aktuell, maximum) {
  if (!Array.isArray(gespeichert)) return [];

  const grenze = Math.min(Number(maximum) || MAX_GESPEICHERT, MAX_GESPEICHERT);

  /** @type {string[]} */
  const ids = [];
  for (const wert of gespeichert) {
    const id = String(wert);
    if (!/^\d+$/.test(id) || id === aktuell || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= grenze) break;
  }
  return ids;
}

/**
 * Link ohne die Such-Tracking-Parameter von Shopify. Hier wurde nichts gesucht:
 * ohne sie bleiben die Links sauber, und die Suchstatistik bucht keine Klicks
 * auf eine "Suche" nach IDs. Pfad, uebrige Parameter und Anker bleiben erhalten.
 *
 * @param {string} href
 * @param {string} origin
 * @returns {string}
 */
export function linkOhneSuchParameter(href, origin) {
  try {
    const ziel = new URL(href, origin);
    for (const name of SUCH_PARAMETER) ziel.searchParams.delete(name);
    return `${ziel.pathname}${ziel.search}${ziel.hash}`;
  } catch {
    return href;
  }
}

class TpZuletztAngesehen extends HTMLElement {
  /** @type {AbortController | null} */
  #abbruch = null;

  connectedCallback() {
    // Nach dem Aufbau der Seite und ohne den Hauptthread zu blockieren.
    const start = () => {
      this.#laden().catch(() => {
        // Ein Fehler hier darf nur eines bewirken: Der Abschnitt bleibt unsichtbar.
      });
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(start, { timeout: 2000 });
    } else {
      window.setTimeout(start, 200);
    }
  }

  disconnectedCallback() {
    this.#abbruch?.abort();
  }

  /** @returns {string[]} */
  #ids() {
    /** @type {unknown} */
    let gespeichert;
    try {
      gespeichert = RecentlyViewed.getProducts();
    } catch {
      // localStorage gesperrt (privates Fenster, Einstellungen) oder Inhalt kaputt.
      return [];
    }
    return verlaufsIds(gespeichert, this.dataset.currentProductId || '', Number(this.dataset.max));
  }

  async #laden() {
    const ids = this.#ids();
    if (ids.length === 0) return;

    const { sectionId, searchUrl } = this.dataset;
    const liste = this.querySelector('.tp-za__liste');
    if (!sectionId || !liste) return;

    this.#abbruch?.abort();
    this.#abbruch = new AbortController();

    const url = new URL(searchUrl || '/search', window.location.origin);
    url.searchParams.set('q', ids.map((id) => `id:${id}`).join(' OR '));
    url.searchParams.set('type', 'product');
    url.searchParams.set('section_id', sectionId);

    const antwort = await fetch(url, { signal: this.#abbruch.signal, headers: { Accept: 'text/html' } });
    if (!antwort.ok) return;

    const dokument = new DOMParser().parseFromString(await antwort.text(), 'text/html');

    /** @type {Map<string, Element>} */
    const kartenNachId = new Map();
    for (const eintrag of dokument.querySelectorAll('[data-tp-za-karten] > li[data-product-id]')) {
      kartenNachId.set(/** @type {HTMLElement} */ (eintrag).dataset.productId ?? '', eintrag);
    }

    // Reihenfolge des Verlaufs, nicht die der Suche. Produkte, die es nicht mehr
    // gibt oder die nicht verkauft werden, fehlen in der Antwort und entfallen.
    const karten = ids.map((id) => kartenNachId.get(id)).filter((eintrag) => eintrag !== undefined);
    if (karten.length === 0) return;

    for (const link of karten.flatMap((eintrag) => [...eintrag.querySelectorAll('a[href]')])) {
      link.setAttribute('href', linkOhneSuchParameter(link.getAttribute('href') ?? '', window.location.origin));
    }

    // Die Kartenstile liegen hier in compiled_assets/styles.css und stehen auf
    // jeder Seite bereit (gemessen: die Antwort enthaelt kein eigenes <style>).
    // Falls Shopify einmal ein <style data-section-stylesheet> mitliefert - wie
    // product-recommendations.js es einsammelt -, wird es uebernommen.
    const stil = dokument.querySelector('style[data-section-stylesheet]');
    if (stil && !this.querySelector('style[data-section-stylesheet]')) this.prepend(stil);

    liste.replaceChildren(...karten);
    this.hidden = false;
  }
}

if (!customElements.get('tp-zuletzt-angesehen')) {
  customElements.define('tp-zuletzt-angesehen', TpZuletztAngesehen);
}
