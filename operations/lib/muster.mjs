/**
 * Muster-Erkennung - eine Regel fuer alle Node-Module.
 *
 * Vor dieser Datei entschied jedes Modul fuer sich, was ein Muster ist:
 * bestelluebersicht.mjs pruefte TP-MUSTER plus Handle-Regex, resolve.mjs
 * M- plus Property, ampel.mjs M- plus muster_quelle. Drei Regelsaetze im
 * selben Modulverbund, mit unterschiedlichen Ergebnissen fuer dieselbe
 * Position.
 *
 * Wortgleich in snippets/tp-muster-position.liquid (Theme/Warenkorb).
 * Aendert sich hier etwas, muss es dort mitgeaendert werden -
 * qa/tests/tp-cart-beratung.test.mjs prueft, dass beide Seiten dieselben
 * vier Merkmale nennen.
 *
 * Bewusst nicht Teil der Regel:
 * - Preis 0,00: Aktionsware und Zugaben waeren sonst Muster.
 * - Der Produkt-Handle: "Muster" heisst auf Deutsch auch Dessin. Echte
 *   Bodenbelaege tragen Tags wie "muster: fischgraet"; die alte Regex
 *   /(^|-)muster(-|$)/ in bestelluebersicht.mjs war ein Falsch-Positiv-Risiko,
 *   das keine andere Stelle hatte.
 * - Der Variantentitel: er traegt die Farbe
 *   (domains/shopify/benachrichtigungen/musterartikel.md).
 */

const leer = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * @param {object} position
 * @param {string|null} [position.sku]        Varianten-SKU
 * @param {string|null} [position.musterId]   Property _Muster_ID
 * @param {string|null} [position.produktTyp] product.type / productType
 * @param {object}      [position.properties] Line-Item-Properties (Rohform)
 * @returns {boolean}
 */
export function istMusterPosition(position = {}) {
  const musterId = leer(position.musterId) ? position.properties?.['_Muster_ID'] : position.musterId;
  if (!leer(musterId)) return true;

  const sku = String(position.sku ?? '').trim().toUpperCase();
  if (sku.startsWith('M-')) return true;
  if (sku.startsWith('TP-MUSTER')) return true;

  return String(position.produktTyp ?? '').trim().toLowerCase() === 'musterservice';
}

/**
 * Reine Musterbestellung: mindestens eine Position, und jede davon ein Muster.
 * Ein leerer Warenkorb ist keine Musterbestellung.
 *
 * @param {object[]} positionen
 * @returns {boolean}
 */
export function istNurMusterBestellung(positionen = []) {
  const liste = Array.isArray(positionen) ? positionen : [];
  if (liste.length === 0) return false;
  return liste.every((p) => istMusterPosition(p));
}

export const MUSTER_MERKMALE = Object.freeze(['_Muster_ID', 'M-', 'TP-MUSTER', 'Musterservice']);
