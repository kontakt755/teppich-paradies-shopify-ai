export function configuredBaseUrl(defaultUrl) {
  const candidate = process.env.WORKFLOW_BASE_URL || defaultUrl;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('WORKFLOW_BASE_URL muss HTTP(S) verwenden');
  return url.href;
}

export function targetUrl(pathname, baseUrl) {
  const base = new URL(baseUrl);
  const target = new URL(pathname, base);
  const previewThemeId = base.searchParams.get('preview_theme_id');
  if (previewThemeId) target.searchParams.set('preview_theme_id', previewThemeId);
  return target.href;
}

/**
 * Prueft anhand der tatsaechlich rendernden Theme-ID, ob die Evidence vom
 * freigegebenen Preview-Theme stammt.
 *
 * Warum nicht ueber die URL: Shopify leitet eine Preview-URL auf die
 * Hauptdomain um und verwirft dabei den Parameter preview_theme_id - die
 * Vorschau haengt danach am Cookie. Der Parameter "geht verloren", obwohl
 * alles korrekt laeuft. window.Shopify.theme.id sagt dagegen direkt, welches
 * Theme die Seite gerendert hat, und ist damit das belastbarere Signal.
 *
 * Die Pruefung bleibt streng: ohne passende Theme-ID gibt es kein PASS.
 */
export function validatePreviewTheme(baseUrl, actualThemeId) {
  const expected = new URL(baseUrl).searchParams.get('preview_theme_id');
  if (!expected) return { status: 'PASS', expected: null, actual: actualThemeId ?? null };
  if (actualThemeId === null || actualThemeId === undefined || actualThemeId === '') {
    return { status: 'FAIL', expected, actual: null, reason: 'Rendernde Theme-ID war nicht auslesbar' };
  }
  if (String(actualThemeId) !== String(expected)) {
    return { status: 'FAIL', expected, actual: String(actualThemeId), reason: 'Gerendert hat ein anderes Theme als das freigegebene Preview-Theme' };
  }
  return { status: 'PASS', expected, actual: String(actualThemeId) };
}

export function validatePreviewContext(baseUrl, finalUrl) {
  const expected = new URL(baseUrl).searchParams.get('preview_theme_id');
  const actual = new URL(finalUrl).searchParams.get('preview_theme_id');
  if (!expected && !actual) return { status: 'PASS', expected: null, actual: null };
  if (!expected && actual) return { status: 'FAIL', expected: null, actual, reason: 'Unerwarteter Theme-Preview-Parameter' };
  if (expected !== actual) return {
    status: 'FAIL', expected, actual,
    reason: actual ? 'Preview-Theme-ID stimmt nicht mit dem freigegebenen Ziel überein' : 'Freigegebener Theme-Preview-Parameter ging verloren'
  };
  return { status: 'PASS', expected, actual };
}
