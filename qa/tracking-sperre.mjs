/**
 * QA-Laeufe sollen die Shop-Kennzahlen nicht verfaelschen (Werkbank w-008):
 * Jeder Browserlauf gegen die Live-Storefront erzeugte Sitzungen, Warenkoerbe
 * und Checkout-Starts in GA4, Meta und Shopify Analytics - "Warenkoerbe aus
 * Berlin", die niemand bestellt hat.
 *
 * Die Messanfragen werden deshalb im QA-Browser mit 204 beantwortet statt
 * abgebrochen: Ein Abbruch erschiene als requestfailed in der Diagnose der
 * Laeufe und muesste dort wieder als bekanntes Rauschen herausgefiltert werden.
 * Die Seite selbst, Warenkorb und Checkout bleiben unberuehrt.
 */

export const TRACKING_MUSTER = Object.freeze([
  /^https?:\/\/([a-z0-9-]+\.)*google-analytics\.com\//i,
  /^https?:\/\/([a-z0-9-]+\.)*analytics\.google\.com\//i,
  /^https?:\/\/([a-z0-9-]+\.)*googletagmanager\.com\//i,
  /^https?:\/\/([a-z0-9-]+\.)*googleadservices\.com\//i,
  /^https?:\/\/([a-z0-9-]+\.)*doubleclick\.net\//i,
  /^https?:\/\/([a-z0-9-]+\.)*google\.com\/(pagead|ccm|rmkt)\//i,
  /^https?:\/\/connect\.facebook\.net\//i,
  /^https?:\/\/([a-z0-9-]+\.)*facebook\.com\/tr/i,
  /^https?:\/\/monorail-edge\.shopifysvc\.com\//i,
  /^https?:\/\/[^/]+\/\.well-known\/shopify\/monorail\//i,
  /^https?:\/\/[^/]+\/api\/collect/i,
  /^https?:\/\/([a-z0-9-]+\.)*clarity\.ms\//i,
]);

export function istTrackingAnfrage(url) {
  return TRACKING_MUSTER.some((muster) => muster.test(String(url ?? '')));
}

/**
 * Haengt die Sperre an einen Playwright-BrowserContext (gilt auch fuer
 * iframes, also die Sandbox der Shopify-Web-Pixel).
 * @returns {Promise<{gesperrt: () => number}>}
 */
export async function sperreTracking(context) {
  let anzahl = 0;
  await context.route(istTrackingAnfrage, (route) => {
    anzahl += 1;
    return route.fulfill({ status: 204, body: '' });
  });
  return { gesperrt: () => anzahl };
}
