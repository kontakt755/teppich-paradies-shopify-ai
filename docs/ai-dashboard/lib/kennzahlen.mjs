/**
 * Shop-Kennzahlen fuer "Heute" - Rechnungen ohne DOM (Browser und Tests).
 */

/**
 * Durchschnitt nur ueber Bestellungen mit Betrag. Kostenlose Musterbestellungen sind oft die
 * Mehrheit und drueckten den Schnitt auf einen Bruchteil dessen, was ein zahlender Kunde
 * ausgibt. Gerechnet wird aus Umsatz, Bestellungen und `kostenlos`, damit auch ein Export von
 * vor dieser Regel stimmt; neuere Exporte (operations/lib/kennzahlen.mjs) liefern `mitBetrag`.
 * Seit dem Musterversand (4,99 €, ab 01.12.2026) zaehlt `mitBetrag` reine Musterbestellungen nicht
 * mehr mit; ihre Einnahmen (`muster.versandEinnahmen`) gehen deshalb vom Umsatz ab.
 *
 * @param {{umsatz:number, bestellungen:number, kostenlos?:number, mitBetrag?:number, durchschnitt?:number}} z
 * @returns {number|null} Betrag; 0 = keine Bestellung mit Betrag; null = Zeitraum fehlt
 */
export function schnittJeBezahlter(z) {
  if (!z || typeof z.umsatz !== 'number') return null;
  const mit = typeof z.mitBetrag === 'number' ? z.mitBetrag
    : typeof z.kostenlos === 'number' && typeof z.bestellungen === 'number' ? z.bestellungen - z.kostenlos : null;
  // Ganz alter Export ohne `kostenlos`: der gelieferte Schnitt ist das Beste, was es gibt.
  if (mit === null) return z.bestellungen ? (z.durchschnitt ?? null) : 0;
  const umsatz = z.umsatz - (typeof z.mitBetrag === 'number' ? z.muster?.versandEinnahmen ?? 0 : 0);
  return mit > 0 ? Math.round((umsatz / mit) * 100) / 100 : 0;
}
