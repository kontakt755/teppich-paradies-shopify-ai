const THEME_PATH = /^(assets|blocks|config|layout|locales|sections|snippets|templates)\//i;
const GLOBAL_UI = /^(layout\/|assets\/(?:base|theme|global|component|styles?)[^/]*\.(?:css|js)$)|\/(?:header|footer|navigation|menu)[^/]*\./i;

const isProduct = page => /product/i.test(page.type) || /PDP/i.test(page.name);
const isCollection = page => /collection/i.test(page.type) || /Collection|Vinylboden|Teppichboden/i.test(page.name);

function affected(page, file) {
  if (GLOBAL_UI.test(file)) return true;
  if (/(?:compare|comparison|vergleich)/i.test(file)) return isProduct(page) || isCollection(page);
  if (/(?:cart|drawer|quantity|calculator|package|paket|verschnitt)/i.test(file)) return page.type === 'cart' || isProduct(page);
  if (/(?:product|price|variant|buy-button|sample|muster)/i.test(file)) return isProduct(page) || isCollection(page);
  if (/(?:collection|card|filter|facet|search)/i.test(file)) return isCollection(page) || page.type === 'search';
  if (/(?:shipping|delivery|versand|liefer|service|verleg)/i.test(file)) return /versand|liefer/i.test(`${page.name} ${page.path}`);
  if (THEME_PATH.test(file)) return true;
  return false;
}

export function selectImpactedPages(pages, changedFiles = []) {
  if (!Array.isArray(changedFiles) || !changedFiles.length) return [...pages];
  const files = changedFiles.map(file => String(file).replaceAll('\\', '/').replace(/^\.\//, ''));
  return pages.filter(page => files.some(file => affected(page, file)));
}

export function qaImpactSummary(pages, selectedPages, changedFiles) {
  return {
    mode: changedFiles.length ? 'TARGETED' : 'FULL',
    changedFiles,
    selectedPages: selectedPages.map(page => page.name),
    totalConfiguredPages: pages.length,
  };
}
