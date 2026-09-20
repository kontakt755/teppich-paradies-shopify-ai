/**
 * Artikelzahl des Warenkorbs nach einem cart:update.
 *
 * Flaechenware (Metafeld custom.preis_pro_001_qm) wird in 0,01-m²-Einheiten
 * verkauft - ein Teppich mit 10 m² hat die Menge 1000. Eine solche Zeile
 * zaehlt als ein Artikel, jede andere nach Menge. Die Regel steht genau
 * einmal, in snippets/tp-cart-artikelzahl.liquid.
 *
 * Das Metafeld steht nicht im Warenkorb-JSON. Die Zahl wird hier deshalb nie
 * aus Mengen addiert, sondern aus Server-HTML mit der Marke
 * data-tp-artikelzahl gelesen:
 *   1. aus den Sections, die das Ereignis mitbringt (Drawer und
 *      Warenkorbseite, snippets/cart-products.liquid),
 *   2. sonst von sections/tp-cart-artikelzahl.liquid ueber die Section
 *      Rendering API.
 * Das itemCount der Sender - bei den Konfiguratoren die Menge der
 * hinzugefuegten Zeile, also 1000 fuer 10 m² - wird dafuer nicht gebraucht.
 */

export const ARTIKELZAHL_SECTION = 'tp-cart-artikelzahl';

const MARKE = /data-tp-artikelzahl="(\d+)"/;

/**
 * @param {unknown} html
 * @returns {number | null}
 */
export function artikelzahlAusHtml(html) {
  if (typeof html !== 'string') return null;
  const treffer = MARKE.exec(html);
  return treffer ? Number(treffer[1]) : null;
}

/**
 * Die Zahl, die ein cart:update schon vom Server mitbringt.
 *
 * @param {{ data?: { sections?: Record<string, string>, source?: string, itemCount?: number } }} [detail]
 * @returns {number | null} null, wenn sie nachgeladen werden muss
 */
export function artikelzahlAusEreignis(detail) {
  const data = detail?.data;
  for (const html of Object.values(data?.sections ?? {})) {
    const zahl = artikelzahlAusHtml(html);
    if (zahl !== null) return zahl;
  }
  // component-cart-items.js liest itemCount aus [ref="cartItemCount"], also
  // aus derselben Liquid-Zaehlung. Das deckt den leeren Warenkorb ab, dessen
  // Section keine Zeilen und damit keine Marke mehr hat.
  if (data?.source === 'cart-items-component' && Number.isInteger(data.itemCount)) return data.itemCount;
  return null;
}

/**
 * @param {string} basis - absolute Adresse, auf der die Section gerendert wird
 * @returns {string}
 */
export function artikelzahlUrl(basis) {
  const url = new URL(basis);
  url.hash = '';
  url.searchParams.set('section_id', ARTIKELZAHL_SECTION);
  return url.toString();
}

function warenkorbAdresse() {
  const pfad = globalThis.Theme?.routes?.cart_url ?? '/cart';
  return new URL(pfad, globalThis.location.href).toString();
}

/**
 * @param {typeof fetch} [holen]
 * @param {string} [basis] - Standard: Warenkorb-Route der aktuellen Sprache
 * @returns {Promise<number | null>} null bei Netz- oder Serverfehler
 */
export async function ladeArtikelzahl(holen = globalThis.fetch, basis) {
  try {
    const adresse = artikelzahlUrl(basis ?? warenkorbAdresse());
    const antwort = await holen(adresse, { cache: 'no-store', headers: { Accept: 'text/html' } });
    if (!antwort.ok) return null;
    return artikelzahlAusHtml(await antwort.text());
  } catch {
    return null;
  }
}

/** @type {WeakMap<object, Promise<number | null>>} */
const anfragen = new WeakMap();

/**
 * Artikelzahl zu einem cart:update. Header-Blase und Screenreader-Ansagen
 * hoeren auf dasselbe Ereignis und teilen sich eine Anfrage; jedes neue
 * Ereignis fragt neu, weil sich der Warenkorb seitdem geaendert hat.
 *
 * @param {Event & { detail?: any }} event
 * @param {() => Promise<number | null>} [laden]
 * @returns {Promise<number | null>}
 */
export function artikelzahlFuer(event, laden = ladeArtikelzahl) {
  const mitgebracht = artikelzahlAusEreignis(event?.detail);
  if (mitgebracht !== null) return Promise.resolve(mitgebracht);
  if (typeof event !== 'object' || event === null) return laden();

  let anfrage = anfragen.get(event);
  if (!anfrage) {
    anfrage = laden();
    anfragen.set(event, anfrage);
  }
  return anfrage;
}
