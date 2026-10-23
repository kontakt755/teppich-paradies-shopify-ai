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

// -- Restrollen ---------------------------------------------------------------

const zahlDe = n => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** "3,5", "3.5", "3,5 m", " 12 " -> Zahl; alles andere -> null. */
export function leseMeter(text) {
  const t = String(text ?? '').trim().replace(/\s*m$/i, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/**
 * Rechnung im Dialog "Von der Rolle verkauft". Gleiche Regel wie der Server
 * (operations/lib/sonderposten.mjs, qmFuerLaenge): Laenge x volle Rollenbreite,
 * ganzzahlig in cm, auf ganze m2 aufgerundet. Der Server rechnet selbst noch
 * einmal - diese Rechnung ist nur die Anzeige vor dem Klick.
 *
 * @returns {{ ok: boolean, leer?: boolean, fehler?: string, laengeM?: number, qm?: number,
 *             flaecheText?: string, restQm?: number, restM?: number, text?: string }}
 */
export function rollenRechnung(eingabe, breiteM, bestandQm) {
  if (String(eingabe ?? '').trim() === '') return { ok: false, leer: true, fehler: '' };
  const laenge = leseMeter(eingabe);
  if (laenge === null || laenge <= 0) return { ok: false, fehler: 'Bitte die Länge in Metern eingeben, z. B. 3,5.' };
  const laengeCm = Math.round(laenge * 100);
  if (Math.abs(laenge * 100 - laengeCm) > 1e-6) return { ok: false, fehler: 'Höchstens zwei Nachkommastellen – auf den Zentimeter genau.' };
  const breiteCm = Math.round(Number(breiteM) * 100);
  if (!(breiteCm > 0)) return { ok: false, fehler: 'Für diese Rolle fehlt in Shopify die Rollenbreite.' };
  const flaecheCm2 = laengeCm * breiteCm;
  const qm = Math.ceil(flaecheCm2 / 10000);
  const bestand = Number(bestandQm) || 0;
  if (qm > bestand) {
    const restM = Math.floor((bestand * 10000) / breiteCm) / 100;
    return { ok: false, fehler: `So viel ist nicht mehr da: ${zahlDe(laenge)} m ergeben ${qm} m², auf der Rolle sind nur noch ${bestand} m² (${zahlDe(restM)} m).` };
  }
  const restQm = bestand - qm;
  const restM = Math.floor((restQm * 10000) / breiteCm) / 100;
  const exakt = flaecheCm2 % 10000 === 0;
  const flaecheText = exakt ? `${qm} m²` : `${zahlDe(flaecheCm2 / 10000)} m², aufgerundet ${qm} m²`;
  return {
    ok: true, laengeM: laenge, qm, restQm, restM, flaecheText,
    text: `${zahlDe(laenge)} m × ${zahlDe(breiteCm / 100)} m = ${flaecheText} · danach noch ${restQm} m² (${zahlDe(restM)} m)`,
  };
}

/** Inventur: nie mehr volle m2 anbieten als tatsaechlich gemessen wurden. */
export function inventurRechnung(eingabe, breiteM) {
  if (String(eingabe ?? '').trim() === '') return { ok: false, leer: true, fehler: '' };
  const laengeM = leseMeter(eingabe);
  if (laengeM === null || !Number.isFinite(laengeM) || laengeM < 0 || laengeM > 100 || Math.abs(laengeM * 100 - Math.round(laengeM * 100)) > 1e-6) return { ok: false, fehler: 'Bitte 0 bis 100 m mit höchstens zwei Nachkommastellen eingeben.' };
  const breiteCm = Math.round(Number(breiteM) * 100);
  if (!(breiteCm > 0) || breiteCm > 1000 || Math.abs(Number(breiteM) * 100 - breiteCm) > 1e-6) return { ok: false, fehler: 'Die Rollenbreite fehlt oder ist nicht eindeutig.' };
  const flaeche = Math.round(laengeM * 100) * breiteCm;
  const qm = Math.floor(flaeche / 10000);
  const verfuegbarM = Math.floor(qm * 10000 / breiteCm) / 100;
  return { ok: true, laengeM, qm, verfuegbarM, text: `${zahlDe(laengeM)} m × ${zahlDe(breiteCm / 100)} m = ${zahlDe(flaeche / 10000)} m²${flaeche % 10000 ? `, sicher abgerundet auf ${qm} m²` : ''} · ohne gebundene Ware danach ${zahlDe(verfuegbarM)} m online verfügbar` };
}

/** Inventur kann durch eine zeitgleiche Onlinebestellung weniger frei als physisch vorhanden haben. */
export function meldungNachInventur(antwort) {
  if (!antwort?.ok) {
    const m = meldungNachBuchung(antwort);
    if (antwort?.verbindung === false || !antwort) m.text = 'Keine Antwort vom Dashboard. Ob die Restlänge gespeichert wurde, ist unklar – bitte neu laden und den Bestand prüfen.';
    return m;
  }
  const er = antwort.ergebnis || {};
  if (er.gebucht !== true || !er.ok || er.gegenprobe !== 'ok') return { erfolg: false, klasse: 'warn', neuLaden: true, text: 'Die Bestandskorrektur wurde gesendet. Die Gegenprobe ist nicht eindeutig – bitte neu laden und den Bestand in Shopify prüfen.' };
  return { erfolg: true, klasse: null, neuLaden: true, text: `Restlänge gespeichert: physisch ${er.bestandNachher} m² · jetzt ${zahlDe(er.restLaengeM)} m (${er.verfuegbarNachher} m²) frei verfügbar.` };
}

/** Rueckmeldung nach einer gebuchten Laenge (ergebnis aus verkaufeVonRolle). */
function meldungRolle(er) {
  if (er.gegenprobe === 'fehlgeschlagen') {
    return { erfolg: false, klasse: 'warn', text: `Shopify hat die Buchung angenommen (${er.bestandVorher} → ${er.bestandErwartet} m²). Die Gegenprobe konnte Shopify danach nicht lesen – bitte die Liste neu laden und den Bestand prüfen.`, neuLaden: true };
  }
  if (!er.ok) {
    return { erfolg: false, klasse: 'warn', text: `Gebucht, aber Shopify zeigt danach ${er.bestandNachher ?? 'unbekannt'} m² statt ${er.bestandErwartet} m² – vielleicht wurde gleichzeitig online gekauft. Bitte in der Shopify-App prüfen.`, neuLaden: true };
  }
  const text = er.bestandNachher === 0
    ? `${er.qm} m² abgebucht – die Rolle ist jetzt leer und online nicht mehr bestellbar`
    : `${er.qm} m² abgebucht – noch ${zahlDe(er.restLaengeM)} m (${er.bestandNachher} m²) auf der Rolle`;
  return { erfolg: true, klasse: null, text, neuLaden: true };
}

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
    if (er.typ === 'rolle' && er.gebucht === true) return meldungRolle(er);
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
