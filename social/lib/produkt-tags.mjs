/**
 * Produkt-Tags fuer Instagram: Wer im Reel oder Bild auf das Produkt tippt,
 * landet auf der Produktseite im Shop.
 *
 * Voraussetzung ist Instagram Shopping: Meta muss das Konto fuer Produkt-Tags
 * freigeschaltet und ihm einen Katalog zugeordnet haben (Commerce Manager,
 * social/META-EINRICHTUNG.md). Solange das fehlt, bleibt die Liste leer und
 * der Beitrag geht ohne Tags raus. Ein Tag ist nie ein Grund, nicht zu
 * veroeffentlichen.
 *
 * Zuordnung: Die Shopify-App "Facebook & Instagram" traegt die Shopify-Produkt-ID
 * in die Katalog-ID ein (z. B. shopify_DE_<produkt>_<variante>). Zum Handle holen
 * wir Titel und ID aus dem Shop, suchen im Katalog nach dem Titel und nehmen nur
 * einen Treffer, dessen Katalog-ID genau diese Produkt-ID enthaelt. Gleich
 * benannte Produkte koennen so nicht verwechselt werden.
 *
 * Storys bekommen keine Tags: die Graph API setzt dort weder Produkt-Tags noch
 * Link-Sticker.
 */

import { BETRIEB } from './konfig.mjs';

/** Instagram erlaubt bei Reels hoechstens fuenf Produkt-Tags; mehr waere auch im Bild unruhig. */
export const TAGS_JE_BEITRAG = 5;

/** Gehoert der Katalogeintrag zu genau diesem Shopify-Produkt? */
export function passtZuProdukt(eintrag, produktId) {
  const id = String(produktId);
  const teile = String(eintrag?.retailer_id ?? '').split(/[_\W]+/);
  if (!teile.includes(id)) return false;
  return !['rejected', 'outdated'].includes(String(eintrag?.review_status ?? '').toLowerCase());
}

/**
 * Sucht zu den Handles die Meta-Produkt-IDs.
 * @returns {{ tags: string[], hinweis: string|null }}
 */
export async function produktTagsSuchen(client, handles, { holen = globalThis.fetch, shop = BETRIEB.shop } = {}) {
  const liste = [...new Set((handles ?? []).filter(Boolean))].slice(0, TAGS_JE_BEITRAG);
  if (!liste.length) return { tags: [], hinweis: null };
  if (typeof client?.igShopping !== 'function') return { tags: [], hinweis: null };
  const shopping = await client.igShopping();
  if (!shopping.bereit) return { tags: [], hinweis: shopping.grund };

  const tags = []; const fehlend = [];
  for (const handle of liste) {
    const antwort = await holen(`${shop}/products/${handle}.js`, { headers: { Accept: 'application/json' } });
    if (!antwort.ok) { fehlend.push(handle); continue; }
    const produkt = await antwort.json();
    const treffer = await client.igProduktSuchen(shopping.katalogId, produkt.title);
    const passend = treffer.find(e => passtZuProdukt(e, produkt.id));
    if (passend?.product_id && !tags.includes(String(passend.product_id))) tags.push(String(passend.product_id));
    else fehlend.push(handle);
  }
  return { tags, hinweis: fehlend.length ? `Nicht im Instagram-Katalog gefunden: ${fehlend.join(', ')}` : null };
}
