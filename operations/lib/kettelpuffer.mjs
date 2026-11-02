/**
 * Zuschnittpuffer fuer Ware, die unser Kettler kettelt (Inhaber 2026-10-25, #1684): Laenge
 * und Breite je EINMAL +3 cm, nicht je Kante - 180 × 250 wird 183 × 253 cm, je Stueck.
 * Kettelt der Lieferant selbst oder wird gar nicht gekettelt, bleibt es beim Fertigmass.
 *
 * Eigenes Modul, weil Bestellmail (lieferanten.mjs) und Kopierliste (bestelluebersicht.mjs)
 * dasselbe Mass brauchen und lieferanten.mjs nicht in bestelluebersicht.mjs gehoert.
 */
export const KETTEL_PUFFER_CM = 3;

/**
 * Nur echtes Ketteln: der Konfigurator schreibt auch "Einfassung: ohne Einfassung" (Raummass),
 * "Zugeschnitten" (Matten), "Fertig eingefasst" (der Hersteller fasst ein) und Baender.
 * Dasselbe Kriterium wie kettelPosition() in kettelversand.mjs.
 */
export const wirdGekettelt = (ausfuehrung = []) => ausfuehrung.some(z => /^Einfassung:/.test(z) && /gekettelt/i.test(z));

const ZAHL = '(\\d+(?:[.,]\\d+)?)';
// "180 × 250 cm", "180x250 cm", "Ø 200 cm" - alles andere (Meter, ein einzelnes Mass ohne Ø)
// gilt als unlesbar und wird geklaert statt geraten.
const MASS_RE = new RegExp(`^(Ø)?\\s*${ZAHL}(?:\\s*[×x]\\s*${ZAHL})?\\s*cm$`, 'iu');
const zahl = t => Number(String(t).replace(',', '.'));
const cm = n => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Zuschnittmass aus der Fertigmass-Zeile ("Fertigmaß: 180 × 250 cm (Rechteck)"). Gerechnet wird
 * immer vom Fertigmass aus - wie oft die Mail auch neu entsteht, der Puffer kommt genau einmal
 * dazu. null, wenn kein Fertigmass da oder es nicht eindeutig lesbar ist.
 */
export function kettelZuschnitt(ausfuehrung = []) {
  const zeile = ausfuehrung.find(z => z.startsWith('Fertigmaß:'));
  if (!zeile) return null;
  const teile = zeile.slice('Fertigmaß:'.length).replace(/\s+/g, ' ').trim().match(/^(.*?)(?:\s*\(([^()]*)\))?$/u);
  const m = teile?.[1].match(MASS_RE);
  if (!m) return null;
  const rund = Boolean(m[1]);
  if (rund === Boolean(m[3])) return null;
  const w = zahl(m[2]);
  const l = rund ? w : zahl(m[3]);
  if (!(w > 0) || !(l > 0)) return null;
  const breiteCm = w + KETTEL_PUFFER_CM;
  const laengeCm = l + KETTEL_PUFFER_CM;
  return {
    fertig: rund ? `Ø ${cm(w)} cm` : `${cm(w)} × ${cm(l)} cm`,
    zuschnitt: rund ? `Ø ${cm(breiteCm)} cm` : `${cm(breiteCm)} × ${cm(laengeCm)} cm`,
    form: teile[2] ?? null, breiteCm, laengeCm,
  };
}
