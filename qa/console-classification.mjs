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

