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

/**
 * GitHub-Konten in Klartext. Im Laden kennt niemand den Login "kontakt755" - gemeint ist der
 * Inhaber. Unbekannte Logins bleiben, wie sie sind.
 */
const ANZEIGENAMEN = Object.freeze({ [CONFIG.owner]: 'Inhaber', 'tobiaski737-coder': 'Tobias' });
export const personName = login => (login ? ANZEIGENAMEN[login] || login : '');
