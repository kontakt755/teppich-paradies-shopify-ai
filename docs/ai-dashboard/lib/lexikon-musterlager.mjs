/** Musterlager im Lexikon: welche Lagereintraege gehoeren zu den Farben dieses Produkts? Rein rechnend. */

/**
 * Zuordnung ueber die Artikelnummern (schluessel), nicht ueber den Titel: Teppichboden, Teppich nach
 * Mass und Muster derselben Farbe teilen sich einen Eintrag.
 * @returns {object[]} passende Eintraege, Farbe alphabetisch
 */
export function lagerEintraegeFuerFarben(eintraege = [], farben = []) {
  const keys = new Set(farben.flatMap(f => f.schluessel || []));
  return eintraege
    .filter(e => !e.leer && (e.schluessel || []).some(k => keys.has(k)))
    .sort((a, b) => String(a.farbe || '').localeCompare(String(b.farbe || ''), 'de'));
}

/** Noch da: bei zaehlbaren Mustern der Rest, sonst die eingetragene Anzahl. */
export function lagerMenge(e) {
  return e?.stand?.rest ?? e?.anzahl ?? 0;
}
