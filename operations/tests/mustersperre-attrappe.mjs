// Attrappe der Shopify Admin API fuer die Mustersperre-Tests (operations/tests und
// docs/ai-dashboard/tests). Kein Test spricht echtes Shopify. Die Attrappe merkt sich jeden
// Aufruf, damit ein Test belegen kann, was NICHT geschrieben wurde.

import { STANDORT_ID } from '../lib/sonderposten.mjs';

let naechsteId = 100;

/**
 * Eine Mustervariante wie im Shop (Stand 16.10.: ohne Bestandsverfolgung, DENY, Bestand 0).
 * @param {string} sku
 * @param {object} [o]
 */
export function variante(sku, { tracked = false, policy = 'DENY', menge = 0, handle = 'muster-testteppich', level = true } = {}) {
  naechsteId += 1;
  return {
    id: `gid://shopify/ProductVariant/${naechsteId}`, sku, tracked, policy, menge, level,
    inventoryItemId: `gid://shopify/InventoryItem/${naechsteId}`,
    product: { id: `gid://shopify/Product/${handle === 'muster-testteppich' ? 500 : naechsteId}`, handle, title: `Muster ${handle}` },
  };
}

const verfuegbar = v => !v.tracked || v.policy === 'CONTINUE' || v.menge > 0;

/**
 * @param {object} o
 * @param {object[]} [o.varianten]      variante(...)
 * @param {string[]} [o.rechte]         erteilte Bereiche (Standard: beide Schreibrechte)
 * @param {boolean} [o.verweigert]      jede Mutation scheitert mit ACCESS_DENIED
 * @param {string|null} [o.antwortWeg]  Name einer Mutation, die ausgefuehrt wird, deren Antwort aber verloren geht
 * @param {string|null} [o.abgelehnt]   Name einer Mutation, die userErrors meldet
 */
export function attrappe({ varianten = [], rechte = ['write_inventory', 'write_products', 'read_products'], verweigert = false, antwortWeg = null, abgelehnt = null } = {}) {
  const aufrufe = [];
  const finde = gid => varianten.find(v => v.id === gid || v.inventoryItemId === gid);
  const knoten = v => ({
    id: v.id, sku: v.sku, inventoryPolicy: v.policy, availableForSale: verfuegbar(v), product: v.product,
    inventoryItem: { id: v.inventoryItemId, tracked: v.tracked, inventoryLevel: v.level ? { quantities: [{ name: 'available', quantity: v.menge }] } : null },
  });
  const proxy = {
    live: true,
    async execute(query, variables = {}) {
      const name = query.match(/(query|mutation)\s+(\w+)/)?.[2];
      aufrufe.push({ name, variables });
      if (name === 'MustersperreRechte') return { currentAppInstallation: { accessScopes: rechte.map(handle => ({ handle })) } };
      if (name === 'MustersperreVariante') {
        if (variables.locationId !== STANDORT_ID) throw new Error('falscher Standort');
        const sku = String(variables.q).match(/sku:"([^"]+)"/)?.[1];
        // Shopify sucht unscharf: auch Treffer mit anderer SKU kommen zurueck.
        return { productVariants: { nodes: varianten.filter(v => v.sku.startsWith(sku.slice(0, 4))).map(knoten) } };
      }
      if (name === 'MustersperreVariantenNachId') {
        if (variables.locationId !== STANDORT_ID) throw new Error('falscher Standort');
        // Wie Shopify: unbekannte (geloeschte) IDs kommen als null zurueck.
        return { nodes: variables.ids.map(id => varianten.find(v => v.id === id)).map(v => (v ? knoten(v) : null)) };
      }
      if (verweigert) throw new Error('Shopify GraphQL: Access denied for this field. Required access: `write_inventory` access scope.');
      const fertig = (feld, inhalt) => {
        if (abgelehnt === name) return { [feld]: { ...inhalt, userErrors: [{ field: ['x'], message: 'abgelehnt (Test)' }] } };
        return { [feld]: { ...inhalt, userErrors: [] } };
      };
      let antwort;
      if (name === 'MustersperreBestand') {
        const q = variables.input.quantities[0];
        const v = finde(q.inventoryItemId);
        if (abgelehnt !== name) {
          if (q.changeFromQuantity !== v.menge) return { inventorySetQuantities: { inventoryAdjustmentGroup: null, userErrors: [{ field: ['input'], message: 'stale', code: 'CHANGE_FROM_QUANTITY_STALE' }] } };
          v.menge = q.quantity;
        }
        antwort = fertig('inventorySetQuantities', { inventoryAdjustmentGroup: { id: 'gid://shopify/InventoryAdjustmentGroup/1' } });
      } else if (name === 'MustersperreRichtlinie') {
        const v = finde(variables.variants[0].id);
        if (abgelehnt !== name) v.policy = variables.variants[0].inventoryPolicy;
        antwort = fertig('productVariantsBulkUpdate', { productVariants: [{ id: v.id, inventoryPolicy: v.policy }] });
      } else if (name === 'MustersperreVerfolgung') {
        const v = finde(variables.id);
        if (abgelehnt !== name) v.tracked = variables.input.tracked;
        antwort = fertig('inventoryItemUpdate', { inventoryItem: { id: v.inventoryItemId, tracked: v.tracked } });
      } else throw new Error(`Unerwarteter Aufruf ${name}`);
      if (antwortWeg === name) throw new Error('Shopify Admin API: The operation was aborted due to timeout');
      return antwort;
    },
  };
  const mutationen = () => aufrufe.filter(a => ['MustersperreBestand', 'MustersperreRichtlinie', 'MustersperreVerfolgung'].includes(a.name));
  return { proxy, aufrufe, mutationen, varianten };
}
