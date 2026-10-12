/**
 * Kampagnen-Links fuer Social Media, Newsletter und Aufsteller (Ansicht "Social Media").
 *
 * Reine Funktion ohne DOM, damit Browser und Tests dieselbe Regel benutzen.
 * Die UTM-Werte landen in Google Analytics; deshalb immer klein, ohne
 * Umlaute und Leerzeichen - sonst zaehlt "Fruehjahr" und "frühjahr" doppelt.
 */

export const SHOP = 'https://www.teppich-paradies.net';

export const ZIELE = Object.freeze([
  { wert: '/', text: 'Startseite' },
  { wert: '/pages/liefer-verlegeservice', text: 'Liefer- und Verlegeservice' },
  { wert: '/pages/unsere-arbeit', text: 'Unsere Arbeit' },
  { wert: '/pages/muster', text: 'Muster bestellen' },
]);

// Kanal -> Quelle und Medium, so wie GA4 die Standardkanaele erkennt.
export const KANAELE = Object.freeze({
  instagram: { text: 'Instagram', source: 'instagram', medium: 'social' },
  facebook: { text: 'Facebook', source: 'facebook', medium: 'social' },
  whatsapp: { text: 'WhatsApp', source: 'whatsapp', medium: 'social' },
  newsletter: { text: 'Newsletter', source: 'newsletter', medium: 'email' },
  aufsteller: { text: 'Aufsteller / QR-Code', source: 'aufsteller', medium: 'print' },
});

export const ARTEN = Object.freeze({
  bio: 'Link in der Bio',
  story: 'Story',
  beitrag: 'Beitrag',
  reel: 'Reel',
  anzeige: 'Bezahlte Anzeige',
});

/** "Frühjahr Aktion 2027!" -> "fruehjahr-aktion-2027" */
export function kampagnenName(roh) {
  return String(roh || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Nur der eigene Shop: ein Kampagnenlink auf eine fremde Seite waere ein Fehler. */
export function zielAdresse(roh) {
  const t = String(roh || '').trim();
  if (!t) return { fehler: 'Bitte ein Ziel wählen oder eine Shop-Adresse einfügen.' };
  let url;
  try { url = new URL(t.startsWith('/') ? SHOP + t : (/^https?:\/\//i.test(t) ? t : `https://${t}`)); }
  catch { return { fehler: 'Das ist keine gültige Adresse.' }; }
  const host = url.hostname.toLowerCase();
  if (host !== 'teppich-paradies.net' && host !== 'www.teppich-paradies.net') {
    return { fehler: 'Nur Adressen von teppich-paradies.net sind erlaubt.' };
  }
  url.protocol = 'https:';
  url.hostname = 'www.teppich-paradies.net';
  url.port = '';
  url.hash = '';
  return { url };
}

export function kampagnenLink({ ziel = '/', kanal = 'instagram', art = 'beitrag', kampagne = '' } = {}) {
  const z = zielAdresse(ziel);
  if (z.fehler) return { fehler: z.fehler };
  const k = KANAELE[kanal];
  if (!k) return { fehler: 'Unbekannter Kanal.' };
  if (!ARTEN[art]) return { fehler: 'Unbekannte Art.' };
  const name = kampagnenName(kampagne);
  if (!name) return { fehler: 'Bitte einen Kampagnennamen eintragen, z. B. „herbst-2026“.' };
  const url = z.url;
  // Vorhandene utm_* aus einer kopierten Adresse ersetzen, nicht verdoppeln.
  for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
  url.searchParams.set('utm_source', k.source);
  url.searchParams.set('utm_medium', art === 'anzeige' ? 'paid' : k.medium);
  url.searchParams.set('utm_campaign', name);
  url.searchParams.set('utm_content', art);
  return { link: url.toString(), kampagne: name };
}
