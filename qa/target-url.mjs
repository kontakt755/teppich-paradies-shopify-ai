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
