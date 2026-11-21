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

/**
 * Erstattungsregel Musterversand (Inhaber 19.11.2026): fehlt ein bestelltes Muster, erstattet ein
 * Mensch die Versandkosten; die lieferbaren Muster gehen trotzdem raus. Shopify meldet die Bestellung
 * dann als erstattet. Sie bleibt in Bearbeitung, solange sie nur aus Mustern besteht und
 * keine Position entfernt oder erstattet wurde (currentQuantity = quantity). Storno bleibt Storno.
 * Eine Teilerstattung bleibt wie bisher ein Fall fuer "Restumfang pruefen" (Packstation).
 *
 * @param {object} order  Bestellung aus dem Admin-API-Export (lineItems als Liste oder { nodes })
 * @returns {boolean}
 */
export function nurMusterversandErstattet(order) {
  if (order?.cancelledAt || order?.displayFinancialStatus !== 'REFUNDED') return false;
  const zeilen = Array.isArray(order.lineItems) ? order.lineItems : order.lineItems?.nodes;
  if (!Array.isArray(zeilen) || !zeilen.length || order.lineItems?.pageInfo?.hasNextPage) return false;
  return zeilen.every((li) => Number(li?.quantity) > 0 && Number(li.currentQuantity ?? li.quantity) === Number(li.quantity)
    && istMusterPosition({
      sku: li.sku ?? li.variant?.sku,
      properties: Object.fromEntries((li.customAttributes ?? []).map((a) => [a.key, a.value])),
      produktTyp: li.variant?.product?.productType,
    }));
}

export const MUSTER_MERKMALE = Object.freeze(['_Muster_ID', 'M-', 'TP-MUSTER', 'Musterservice']);
