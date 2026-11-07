/**
 * Kundenschluessel fuer Links. Der Schluessel einer Kundenakte enthaelt die E-Mail, die Telefonnummer
 * oder den Namen (operations/lib/kundensuche.mjs). In der Adresszeile landet er im Browserverlauf und
 * in geteilten Links, deshalb steht dort nur dieser Kurzwert; der Dienst loest ihn zurueck auf.
 * Kein Geheimnis: Wer eine Adresse schon kennt, kann den Wert nachrechnen. Lesbar ist er nicht.
 * Synchron, weil Links beim Zeichnen entstehen und crypto.subtle nicht ueberall verfuegbar ist.
 */
const FNV_START = 0xcbf29ce484222325n, FNV_FAKTOR = 0x100000001b3n, MASKE = (1n << 64n) - 1n;

export const istKundenLinkWert = wert => /^k-[0-9a-f]{16}$/.test(String(wert || ''));

/** Bereits umgestellte Werte bleiben, wie sie sind; leere Werte bleiben leer. */
export function kundenLinkWert(schluessel) {
  const text = String(schluessel ?? '');
  if (!text || istKundenLinkWert(text)) return text;
  let h = FNV_START;
  for (const byte of new TextEncoder().encode(text)) h = ((h ^ BigInt(byte)) * FNV_FAKTOR) & MASKE;
  return `k-${h.toString(16).padStart(16, '0')}`;
}

/** Link- oder alter Klarwert → Schluessel aus der Liste; null, wenn der Kunde nicht (mehr) da ist. */
export function kundenSchluesselZu(wert, schluessel) {
  if (!istKundenLinkWert(wert)) return wert;
  for (const s of schluessel) if (kundenLinkWert(s) === wert) return s;
  return null;
}
