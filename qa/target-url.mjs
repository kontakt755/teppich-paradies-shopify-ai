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
