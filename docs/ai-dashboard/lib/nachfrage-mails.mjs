/**
 * Wo die automatischen Nachfrage-Mails (Muster nachfassen per E-Mail) im Control Center stehen.
 * Seit 07.11.2026 (Inhaber, w-284) unter Kunden › Kunden nach Produkt fragen, Karte aufgeklappt -
 * vorher auf Heute (#/heute?mn=1). Gilt in Browser und Server (operations/lib/auftragsverlauf.mjs
 * setzt den Link am naechsten Schritt). Alte Links #/heute?mn=1 leitet kern/router.mjs hierher um.
 */
export const NACHFRAGE_MAILS_HREF = '#/kunden?tab=anrufe&mn=1';

/** Frueheres Ziel - nur noch fuer Umleitung und Zeitleisten, die der Server vor dem Neustart rechnet. */
export const NACHFRAGE_MAILS_HREF_ALT = '#/heute?mn=1';
