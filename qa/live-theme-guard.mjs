/**
 * Regeln fuer den Live-Theme-Guard.
 *
 * Hintergrund: Die Live-Theme-ID stand als Prosa-Fakt in CLAUDE.md, AGENTS.md
 * und der Roadmap. Als das Theme gewechselt wurde, blieb die alte ID stehen -
 * niemand und nichts hat es bemerkt, und Agenten haben ein Theme, das es in der
 * Admin API gar nicht mehr gibt, weiter als Live-Stand genannt.
 *
 * Konsequenz: Theme-IDs gehoeren in domains/shopify/live-theme.json, sonst
 * nirgends. Anweisungsdateien duerfen nur die aktuelle Live- und Fallback-ID
 * nennen; historische Reports behalten ihre alten IDs, denn sie beschreiben
 * korrekt, was zum Zeitpunkt des Reports galt.
 */

/** Shopify-Theme-IDs sind zwoelfstellig; kuerzere Zahlen sind hier nie gemeint. */
const THEME_ID = /\b\d{12}\b/g;

export function themeIdsIn(text) {
  return [...new Set(text.match(THEME_ID) ?? [])];
}

/**
 * @param {object} args
 * @param {{name: string, text: string}[]} args.sources  Anweisungsdateien (nicht: Reports)
 * @param {object} args.registry                          Inhalt von live-theme.json
 * @param {Record<string, string>} args.protectedResources risk-map protectedResources
 */
export function analyze({ sources, registry, protectedResources = {} }) {
  const findings = [];
  const live = registry.live?.themeId;
  const fallback = registry.fallback?.themeId;
  const current = new Set([live, fallback].filter(Boolean));
  const retired = new Map((registry.retired ?? []).map(entry => [entry.themeId, entry.name]));

  if (!live) {
    findings.push({
      severity: 'error',
      rule: 'registry-incomplete',
      message: 'live-theme.json nennt keine live.themeId.'
    });
  }

  for (const { name, text } of sources) {
    for (const id of themeIdsIn(text)) {
      if (current.has(id)) continue;
      const retiredName = retired.get(id);
      findings.push({
        severity: 'error',
        rule: 'stale-theme-id',
        message: retiredName
          ? `${name} nennt die stillgelegte Theme-ID ${id} (${retiredName}). Anweisungsdateien duerfen nur das aktuelle Live-Theme ${live} nennen - oder auf domains/shopify/live-theme.json verweisen.`
          : `${name} nennt die unbekannte Theme-ID ${id}. Entweder in domains/shopify/live-theme.json eintragen oder aus der Anweisungsdatei entfernen.`
      });
    }
  }

  // Der Risk-Guard stuft ein Theme ohne Eintrag nur als MEDIUM ein. Faellt das
  // Live-Theme aus protectedResources heraus, verliert genau das Theme seinen
  // Schutz, das am meisten Schutz braucht.
  for (const [role, id] of [['Live', live], ['Fallback', fallback]]) {
    if (!id) continue;
    if (!protectedResources[`theme:${id}`]) {
      findings.push({
        severity: 'error',
        rule: 'unprotected-theme',
        message: `${role}-Theme ${id} fehlt in domains/shopify/risk-map.json unter protectedResources - der Risk-Guard wuerde es nur als MEDIUM behandeln.`
      });
    }
  }

  return findings;
}
