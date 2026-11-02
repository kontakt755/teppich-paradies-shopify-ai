/**
 * Wartezeiten in Kalendertagen (Berlin), nicht in vollen 24 Stunden: eine Bestellung vom 19.10.
 * nachmittags wartet am 28.10. mittags 9 Tage, nicht 8 (Rueckmeldung Inhaber 28.10.).
 */
const TAG_MS = 86_400_000;
const berlin = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' });
const tagesbeginn = d => Date.parse(`${berlin.format(d)}T00:00:00Z`);

/** Kalendertag in Berlin als "JJJJ-MM-TT" (Date, ISO-Text oder ms); leer bei fehlendem/ungueltigem Datum. */
export function kalendertag(d) {
  if (d === null || d === undefined || d === '') return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : berlin.format(x);
}

/** Kalendertage von `von` bis `bis` (Date, ISO-Text oder ms); null bei fehlendem/ungueltigem Datum, nie negativ. */
export function kalendertage(von, bis = new Date()) {
  if (von === null || von === undefined || von === '') return null;
  const a = new Date(von), b = new Date(bis);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((tagesbeginn(b) - tagesbeginn(a)) / TAG_MS));
}
