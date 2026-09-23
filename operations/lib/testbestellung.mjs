/**
 * Testbestellung-Erkennung - einzige Quelle fuer die Regel, damit
 * Bestelluebersicht, Kennzahlen und Dashboard nie auseinanderlaufen.
 *
 * Regel (Inhabervorgabe 2026-09-23): Tag "TESTBESTELLUNG" (case-insensitive)
 * ODER Shopify-Feld order.test === true => Testbestellung. Testbestellungen
 * zaehlen in KEINER Kennzahl (Auftragsampel, Einkauf, Shop-Zahlen).
 */

export function istTestbestellung(order) {
  if (order?.test === true) return true;
  const tags = order?.tags;
  const liste = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  return liste.some((t) => String(t ?? '').trim().toLowerCase() === 'testbestellung');
}
