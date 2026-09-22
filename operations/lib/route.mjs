/**
 * Fulfillment-Routen (10-FULFILLMENT.md).
 *
 * Prioritaet (Masterprompt Abschnitt 42 ohne Punkt 4 "Eigenbestand" - Shopify
 * fuehrt keinen Bestand, siehe 05-DECISIONS.md):
 *   1. auftragsspezifischer Override (Sonder/Projekt) - mit grund und von
 *   2. Verlegeservice -> SUPPLIER_TO_SITE
 *   3. Abholung -> SUPPLIER_TO_TP
 *   4. verifizierter Direktversand (einkauf.neutralversand === VERIFIED)
 *   5. SUPPLIER_TO_TP
 * SUPPLIER_DIRECT ohne VERIFIED faellt auf route_fallback (Default SUPPLIER_TO_TP).
 */

import { UNGEKLAERT } from './umrechnung.mjs';

export const ROUTE = Object.freeze({
  OWN_STOCK: 'OWN_STOCK',
  SUPPLIER_TO_TP: 'SUPPLIER_TO_TP',
  SUPPLIER_DIRECT: 'SUPPLIER_DIRECT',
  SUPPLIER_TO_SITE: 'SUPPLIER_TO_SITE',
  SAMPLE_STOCK: 'SAMPLE_STOCK',
  SAMPLE_SUPPLIER: 'SAMPLE_SUPPLIER',
  SAMPLE_CUT: 'SAMPLE_CUT',
  NO_PROCUREMENT: 'NO_PROCUREMENT',
});

export const ROUTEN = Object.freeze(Object.values(ROUTE));

export const NEUTRALVERSAND = Object.freeze({ VERIFIED: 'VERIFIED', UNKNOWN: 'UNKNOWN', NOT_ALLOWED: 'NOT_ALLOWED' });

export const DEFAULT_FALLBACK = ROUTE.SUPPLIER_TO_TP;

export function istRoute(wert) {
  return ROUTEN.includes(wert);
}

const MUSTER_ROUTEN = new Set([ROUTE.SAMPLE_STOCK, ROUTE.SAMPLE_SUPPLIER, ROUTE.SAMPLE_CUT]);

function fallbackFuer(einkauf) {
  const f = einkauf?.route_fallback;
  return istRoute(f) ? f : DEFAULT_FALLBACK;
}

/**
 * @param {object} p
 * @param {object} p.item           resolved item (einkauf.route, route_fallback, neutralversand)
 * @param {object} [p.override]     {route, grund, von} - Sonder/Projekt
 * @param {boolean} [p.verlegeservice]
 * @param {boolean} [p.abholung]
 * @returns {{route:string, quelle:string, hinweise:string[], override?:object}}
 */
export function routeFor({ item, override, verlegeservice = false, abholung = false } = {}) {
  const einkauf = item?.einkauf || {};
  const hinweise = [];

  // 1. Override - nur vollstaendig protokolliert.
  if (override) {
    if (!istRoute(override.route)) throw new Error(`routeFor: Override-Route ungueltig: ${override.route}`);
    if (!override.grund || !override.von) throw new Error('routeFor: Override braucht grund und von');
    if (override.route === ROUTE.SUPPLIER_DIRECT && einkauf.neutralversand !== NEUTRALVERSAND.VERIFIED) {
      hinweise.push('Override SUPPLIER_DIRECT ohne neutralversand=VERIFIED - Neutralversand vor Bestellung pruefen');
    }
    return {
      route: override.route,
      quelle: 'OVERRIDE',
      hinweise,
      override: { route: override.route, grund: override.grund, von: override.von, am: override.am ?? new Date().toISOString() },
    };
  }

  const standard = einkauf.route;

  // Muster und Dienstleistung folgen ihrer Stammroute, unabhaengig von Service/Abholung.
  if (standard === ROUTE.NO_PROCUREMENT) return { route: standard, quelle: 'STANDARD', hinweise };
  if (MUSTER_ROUTEN.has(standard)) return { route: standard, quelle: 'STANDARD', hinweise };

  // 2. Verlegeservice
  if (verlegeservice) return { route: ROUTE.SUPPLIER_TO_SITE, quelle: 'VERLEGESERVICE', hinweise };

  // 3. Abholung
  if (abholung) return { route: ROUTE.SUPPLIER_TO_TP, quelle: 'ABHOLUNG', hinweise };

  // 4. verifizierter Direktversand
  if (standard === ROUTE.SUPPLIER_DIRECT) {
    if (einkauf.neutralversand === NEUTRALVERSAND.VERIFIED) {
      return { route: ROUTE.SUPPLIER_DIRECT, quelle: 'STANDARD', hinweise };
    }
    const fb = fallbackFuer(einkauf);
    hinweise.push(`SUPPLIER_DIRECT nicht moeglich: neutralversand ist ${einkauf.neutralversand ?? NEUTRALVERSAND.UNKNOWN}, nicht VERIFIED - Fallback ${fb}`);
    return { route: fb, quelle: 'FALLBACK', hinweise };
  }

  // OWN_STOCK ist nicht pruefbar: kein Bestand gefuehrt.
  if (standard === ROUTE.OWN_STOCK) {
    const fb = fallbackFuer(einkauf);
    hinweise.push(`OWN_STOCK nicht beruecksichtigt (kein Bestand gefuehrt) - Fallback ${fb}`);
    return { route: fb, quelle: 'FALLBACK', hinweise };
  }

  if (standard === ROUTE.SUPPLIER_TO_SITE || standard === ROUTE.SUPPLIER_TO_TP) {
    return { route: standard, quelle: 'STANDARD', hinweise };
  }

  // 5. Route fehlt oder ist unbekannt -> SUPPLIER_TO_TP, sichtbar markiert.
  hinweise.push(`einkauf.route ${standard === undefined ? UNGEKLAERT : standard} - Standard ${DEFAULT_FALLBACK}`);
  return { route: DEFAULT_FALLBACK, quelle: 'FALLBACK', hinweise, stammroute: UNGEKLAERT };
}
