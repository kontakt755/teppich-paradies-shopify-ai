/**
 * Feste Angaben des Control Centers: Repository, Datenquelle, Takt der stillen Aktualisierung.
 */

export const CONFIG = {
  owner: 'kontakt755',
  repo: 'teppich-paradies-shopify-ai',
  dataUrl: './issues.json',
  refreshMs: 120_000,
};
export const REPO_URL = `https://github.com/${CONFIG.owner}/${CONFIG.repo}`;
