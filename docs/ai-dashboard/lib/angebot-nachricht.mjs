/**
 * Antwort auf eine Bestellanfrage per WhatsApp: fertiger Text aus einem offenen Angebot
 * (Shopify-Entwurf), mit Summe und Kontodaten. Rein rechnend, damit Browser und Server dasselbe
 * pruefen. Verschickt wird nichts: der Link oeffnet WhatsApp, abschicken tut der Mitarbeiter.
 * Kontodaten stehen nur im Privatordner, nie im Repository.
 */
const SHOP = 'https://www.teppich-paradies.net';
const SHOPIFY_ADMIN = 'https://admin.shopify.com/store/sjjyq1-6w';
const TELEFON = '03301 573 37 20';
// wa.me schneidet sehr lange Links nicht verlaesslich; darueber bleibt nur "Text kopieren".
export const LINK_MAX = 2000;

const text = v => (v === null || v === undefined ? '' : String(v).trim());

/** Pruefsumme nach ISO 13616: faengt Tippfehler ab, bevor jemand auf ein falsches Konto ueberweist. */
export function ibanGueltig(iban) {
  const s = text(iban).replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith('DE') && s.length !== 22) return false;
  const zahl = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const ziffer of zahl) rest = (rest * 10 + Number(ziffer)) % 97;
  return rest === 1;
}

/** Kontodaten aus der Privatdatei, oder null, wenn etwas fehlt oder die IBAN nicht stimmt. */
export function kontodatenPruefen(roh) {
  const kontoinhaber = text(roh?.kontoinhaber);
  const iban = text(roh?.iban).replace(/\s+/g, '').toUpperCase();
  if (!kontoinhaber || !ibanGueltig(iban)) return null;
  return { kontoinhaber, iban: iban.replace(/(.{4})(?=.)/g, '$1 ') };
}

const geld = (betrag, waehrung) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: waehrung || 'EUR' })
  .format(betrag).replace(/ /g, ' ');

/** Ein Angebot taugt nur mit Positionen und Betrag; ohne das gaebe es nichts zu ueberweisen. */
export function angebotVollstaendig(a) {
  return Number(a?.betrag) > 0 && Array.isArray(a?.positionen) && a.positionen.length > 0;
}

/** Fertiger Text fuer die Antwort, oder null, wenn Kontodaten oder Angebot unvollstaendig sind. */
export function angebotNachricht(a, konto) {
  if (!konto || !angebotVollstaendig(a)) return null;
  const nummer = text(a.nummer).replace(/^#/, '');
  const kunde = text(a.kunde);
  const anrede = kunde && !kunde.includes('@') ? `Guten Tag ${kunde},` : 'Guten Tag,';
  const positionen = a.positionen.map(p => `${p.menge}× ${text(p.titel)}${p.variante ? ` (${text(p.variante)})` : ''}`);
  return [
    anrede,
    '',
    `vielen Dank für Ihre Nachricht. Hier ist Ihr persönliches Angebot ${nummer}:`,
    '',
    ...positionen,
    '',
    `Gesamtbetrag inkl. MwSt.${a.versandEingetragen ? ' und Versand' : ''}: ${geld(Number(a.betrag), a.waehrung)}`,
    '',
    'Wenn es für Sie passt, überweisen Sie den Betrag bitte an:',
    konto.kontoinhaber,
    `IBAN ${konto.iban}`,
    `Verwendungszweck: Angebot ${nummer}`,
    '',
    'Nach Zahlungseingang geben wir Ihre Bestellung in Auftrag und senden Ihnen die Rechnung.',
    '',
    `Widerrufsbelehrung: ${SHOP}/policies/refund-policy`,
    `AGB: ${SHOP}/policies/terms-of-service`,
    '',
    `Fragen beantworten wir gern unter ${TELEFON}.`,
    '',
    'Ihr Team von Teppich Paradies',
  ].join('\n');
}

/** Rufnummer fuer wa.me: nur Ziffern mit Laendervorwahl. Deutsche Nummern ohne Vorwahl bekommen 49. */
export function whatsappNummer(telefon) {
  const roh = text(telefon);
  if (!roh) return null;
  const ziffern = roh.replace(/\D/g, '');
  const nummer = roh.startsWith('+') ? ziffern
    : ziffern.startsWith('00') ? ziffern.slice(2)
    : ziffern.startsWith('0') ? `49${ziffern.slice(1)}`
    : null;
  return nummer && /^[1-9]\d{7,14}$/.test(nummer) ? nummer : null;
}

/** Link, der WhatsApp mit dem Text oeffnet; null ohne brauchbare Nummer oder bei zu langem Text. */
export function whatsappLink(telefon, nachricht) {
  const nummer = whatsappNummer(telefon);
  if (!nummer || !nachricht) return null;
  const link = `https://wa.me/${nummer}?text=${encodeURIComponent(nachricht)}`;
  return link.length <= LINK_MAX ? link : null;
}

/** Der Entwurf im Shopify-Admin: dort wird er nach dem Geldeingang als bezahlt markiert. */
export function angebotAdminLink(id) {
  const nummer = text(id).match(/\/DraftOrder\/(\d+)$/)?.[1];
  return nummer ? `${SHOPIFY_ADMIN}/draft_orders/${nummer}` : null;
}
