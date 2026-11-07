export const SHOP_LOGIN_X_FRAME_MESSAGE = "Invalid 'X-Frame-Options' header encountered when loading 'https://www.teppich-paradies.net/': 'ALLOW-FROM https://www.teppich-paradies.net' is not a recognized directive. The header will be ignored.";
export const SHOP_LOGIN_CALLBACK_PATH = '/services/login_with_shop/buyer/callback';

export function isKnownShopifyLoginXFrameWarning(event, baseUrl = 'https://www.teppich-paradies.net') {
  if (event?.type !== 'console.error' || String(event?.message || '').trim() !== SHOP_LOGIN_X_FRAME_MESSAGE) return false;
  try {
    const expectedOrigin = new URL(baseUrl).origin;
    const source = new URL(event.url);
    return source.origin === expectedOrigin && source.pathname === SHOP_LOGIN_CALLBACK_PATH;
  } catch {
    return false;
  }
}


/**
 * Horizon laedt den Kopf auf jeder Seite per Section Rendering nach
 * (sections/header.liquid -> assets/section-hydration.js, Abruf der aktuellen URL
 * mit section_id). Auf einem unveroeffentlichten Preview-Theme verwirft Shopify
 * dabei die Vorschau (302 ohne preview_theme_id) und rendert das Live-Theme, das
 * die Kopfgruppe des Preview-Themes nicht kennt (404). section-renderer.js wirft
 * dann diesen Fehler. Im Livebetrieb gibt es nur ein Theme, dort kann er so nicht
 * entstehen und bleibt ein echter Fehler (Preview-Laeufe 07.11.2026, w-289).
 */
export const PREVIEW_HEADER_HYDRATION_PATTERN = /^Section sections--\d+__header_section not found in the section rendering response$/;

export function isPreviewHeaderHydrationArtifact(event, baseUrl) {
  if (event?.type !== 'pageerror') return false;
  if (!PREVIEW_HEADER_HYDRATION_PATTERN.test(String(event?.message || '').trim())) return false;
  try {
    return Boolean(new URL(baseUrl).searchParams.get('preview_theme_id'));
  } catch {
    return false;
  }
}
