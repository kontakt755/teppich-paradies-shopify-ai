/** Musterlager im Lexikon: welche Lagereintraege gehoeren zu den Farben dieses Produkts? Rein rechnend. */

/**
 * Zuordnung ueber die Artikelnummern (schluessel), nicht ueber den Titel: Teppichboden, Teppich nach
 * Mass und Muster derselben Farbe teilen sich einen Eintrag. Leere Eintraege bleiben stehen: von hier
 * aus laesst sich "Ist leer" auch wieder aufheben. Produkte ohne Farbe im Lexikon haben keine Schluessel,
 * ihre Probestuecke finden sich dann ueber den Handle des Eintrags.
 * @returns {object[]} passende Eintraege, Farbe alphabetisch, darin nach Art
 */
export function lagerEintraegeFuerFarben(eintraege = [], farben = [], handle = null) {
  const keys = new Set(farben.flatMap(f => f.schluessel || []));
  return eintraege
    .filter(e => (handle && e.handle === handle) || (e.schluessel || []).some(k => keys.has(k)))
    .sort((a, b) => String(a.farbe || '').localeCompare(String(b.farbe || ''), 'de') || String(a.art || '').localeCompare(String(b.art || '')));
}
