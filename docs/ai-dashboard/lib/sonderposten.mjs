/**
 * Rueckmeldung nach "Im Laden verkauft" - Browser UND Tests (kein DOM, kein fetch).
 *
 * Grundsatz: Die Oberflaeche sagt nur, was belegt ist. "Nichts gebucht" steht nur
 * da, wo der Server das sicher weiss (Shopify hat abgelehnt oder gar nicht erst
 * die Mutation bekommen). Kam keine Antwort an - vom Dashboard oder von Shopify -,
 * kann die Buchung trotzdem passiert sein: dann heisst es "unklar, Liste neu
 * laden und Bestand pruefen" (Codex-Review 2026-10-09). Doppelt gebucht wird
 * dabei nie: der Server prueft vor jeder Buchung frisch Bestand 1 und bucht mit
 * changeFromQuantity: 1.
 */

export const TEXT_ERFOLG = 'Als im Laden verkauft gebucht – online nicht mehr bestellbar';

export const TEXT_OHNE_ANTWORT = 'Keine Antwort vom Dashboard am Mac. Ob der Verkauf gebucht wurde, ist unklar – '
  + 'bitte die Liste neu laden und den Bestand prüfen, bevor Sie noch einmal buchen.';

/**
 * @param {object} antwort
 *   { verbindung: false }                      fetch ist gescheitert (keine Antwort)
 *   { ok: false, status, grund, text }        der Server hat mit einem Fehler geantwortet
 *   { ok: true, ergebnis }                    der Server hat gebucht (ergebnis aus verkaufeImLaden)
 * @returns {{ erfolg: boolean, klasse: 'warn'|'crit'|null, text: string, neuLaden: boolean }}
 */
export function meldungNachBuchung(antwort) {
  if (!antwort || antwort.verbindung === false) {
    return { erfolg: false, klasse: 'warn', text: TEXT_OHNE_ANTWORT, neuLaden: true };
  }
  if (antwort.ok) {
    const er = antwort.ergebnis || {};
    if (er.gebucht !== true) {
      // 200 ohne lesbares Ergebnis: der Server hat gebucht oder nicht - unbelegt.
      return { erfolg: false, klasse: 'warn', text: 'Die Antwort des Dashboards war unvollständig. Ob der Verkauf gebucht wurde, ist unklar – bitte die Liste neu laden und den Bestand prüfen.', neuLaden: true };
    }
    if (er.ok && !er.felderFehler) return { erfolg: true, klasse: null, text: TEXT_ERFOLG, neuLaden: true };
    if (er.gegenprobe === 'fehlgeschlagen') {
      return { erfolg: false, klasse: 'warn', text: 'Shopify hat die Buchung angenommen (Bestand 1 → 0). Die Gegenprobe konnte Shopify danach nicht lesen – bitte die Liste neu laden und prüfen, dass das Stück als verkauft erscheint.', neuLaden: true };
    }
    if (er.bestandNachher !== 0) {
      return { erfolg: false, klasse: 'warn', text: `Shopify zeigt nach dem Buchen Bestand ${er.bestandNachher ?? 'unbekannt'} statt 0. Bitte in der Shopify-App prüfen und dort auf 0 setzen.`, neuLaden: true };
    }
    if (er.onlineGesperrt === false) {
      return { erfolg: false, klasse: 'warn', text: 'Bestand ist 0, aber in Shopify ist „Verkauf bei Nichtverfügbarkeit fortsetzen“ eingeschaltet – online weiter bestellbar. Bitte dort ausschalten.', neuLaden: true };
    }
    return { erfolg: false, klasse: 'warn', text: `Bestand ist auf 0 – online nicht mehr bestellbar. Datum und Name des Verkaufs konnten aber nicht gespeichert werden (${er.felderFehler}). Bitte Ahmet Bescheid geben.`, neuLaden: true };
  }
  const status = Number(antwort.status) || 0;
  if (status === 401) return { erfolg: false, klasse: 'crit', text: 'Die Anmeldung ist abgelaufen – bitte neu anmelden. Gebucht wurde nichts.', neuLaden: false };
  if (antwort.grund === 'recht-fehlt') return { erfolg: false, klasse: 'warn', text: antwort.text, neuLaden: false };
  if (antwort.grund === 'unklar') return { erfolg: false, klasse: 'warn', text: antwort.text, neuLaden: true };
  if (status === 409) return { erfolg: false, klasse: 'crit', text: antwort.text, neuLaden: true };
  if (status >= 500 && !antwort.text) {
    // Fehlerantwort ohne Text (z. B. von einem Proxy unterwegs): Ausgang offen.
    return { erfolg: false, klasse: 'warn', text: TEXT_OHNE_ANTWORT, neuLaden: true };
  }
  return { erfolg: false, klasse: 'crit', text: antwort.text || 'Das hat nicht geklappt. Bitte die Liste neu laden und den Bestand prüfen.', neuLaden: status >= 500 };
}
