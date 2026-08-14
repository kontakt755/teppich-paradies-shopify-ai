export const SHOP_ORIGIN = 'https://www.teppich-paradies.net';
export const LOGIN_CALLBACK_PATH = '/services/login_with_shop/buyer/callback';
export const LOGIN_CALLBACK_X_FRAME_MESSAGE = "Invalid 'X-Frame-Options' header encountered when loading 'https://www.teppich-paradies.net/': 'ALLOW-FROM https://www.teppich-paradies.net' is not a recognized directive. The header will be ignored.";

export function redactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return rawUrl;
  }
}

export function isKnownShopifyLoginCallback({ type, message, url }) {
  if (type !== 'console.error' || message !== LOGIN_CALLBACK_X_FRAME_MESSAGE) return false;
  try {
    const location = new URL(url);
    return location.origin === SHOP_ORIGIN && location.pathname === LOGIN_CALLBACK_PATH;
  } catch {
    return false;
  }
}

export function classifyConsoleError(entry) {
  const sanitized = { ...entry, url: redactUrl(entry.url) };
  return isKnownShopifyLoginCallback(entry)
    ? { kind: 'external-platform-noise', entry: sanitized }
    : { kind: 'error', entry: sanitized };
}

export function isBrowserClosedError(error) {
  return /target (?:page, context or browser|context|page|browser) has been closed|browser has been closed/i.test(error?.message || String(error));
}

export function classifyBrowserClosure(error, platformNoiseSeen) {
  if (!isBrowserClosedError(error)) return null;
  return platformNoiseSeen
    ? { severity: 'warning', message: 'Browserkontext nach exakt erkanntem externen Shopify Login-Callback geschlossen; Restlauf kontrolliert beendet' }
    : { severity: 'error', message: `Browserkontext unerwartet geschlossen: ${error.message}` };
}
