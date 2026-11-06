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
  const basis = `Restlänge gespeichert: physisch ${er.bestandNachher} m² · jetzt ${zahlDe(er.restLaengeM)} m (${er.verfuegbarNachher} m²) frei verfügbar.`;
  if (er.sofortkauf === 'fehlgeschlagen') return { erfolg: false, klasse: 'warn', neuLaden: true, text: `${basis} Die Rolle steht aber noch auf „Anfrage“ – bitte in Shopify die Vorlage „rolle“ wählen.` };
  if (er.sofortkauf === 'unklar') return { erfolg: false, klasse: 'warn', neuLaden: true, text: `${basis} Ob die Rolle von „Anfrage“ auf Sofortkauf umgestellt wurde, ist unklar – bitte neu laden und in Shopify prüfen, ob die Vorlage „rolle“ eingestellt ist.` };
  if (er.sofortkauf === 'freigeschaltet') {
    // Bestellbar ist nur ein aktives Produkt; die Vorlage sagt darueber nichts.
    if (er.produktStatus === 'ACTIVE') return { erfolg: true, klasse: null, neuLaden: true, text: `${basis} Online ist sie jetzt wieder sofort bestellbar.` };
    const stand = er.produktStatus === 'DRAFT' ? 'Das Produkt ist noch Entwurf' : 'Das Produkt ist in Shopify nicht als aktiv bestätigt';
    return { erfolg: true, klasse: null, neuLaden: true, text: `${basis} Die Vorlage steht jetzt auf Sofortkauf. ${stand} – online bestellbar erst, wenn es dort aktiv ist.` };
  }
  return { erfolg: true, klasse: null, neuLaden: true, text: basis };
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
  // Rolle ohne Recht (z. B. Mitarbeiter bei "Restlänge eintragen"): der Server lehnt vor jedem
  // Shopify-Aufruf ab, also ist sicher nichts geaendert. Seit 06.11. sehen Mitarbeiter die Seite.
  if (status === 403) return { erfolg: false, klasse: 'crit', text: `${antwort.text || 'Dafür fehlt dir die Berechtigung.'} Am Bestand wurde nichts geändert.`, neuLaden: false };
  if (status === 409) return { erfolg: false, klasse: 'crit', text: antwort.text, neuLaden: true };
  if (status >= 500 && !antwort.text) {
    // Fehlerantwort ohne Text (z. B. von einem Proxy unterwegs): Ausgang offen.
    return { erfolg: false, klasse: 'warn', text: TEXT_OHNE_ANTWORT, neuLaden: true };
  }
  return { erfolg: false, klasse: 'crit', text: antwort.text || 'Das hat nicht geklappt. Bitte die Liste neu laden und den Bestand prüfen.', neuLaden: status >= 500 };
}

/** "gid://shopify/Product/123" -> "123" (Kennung im QR-Link, kurz und ohne Sonderzeichen). */
export function rollenNummer(gid) {
  return String(gid ?? '').match(/(\d+)$/)?.[1] || '';
}

const LOKAL = /^(127\.0\.0\.1|localhost|\[::1\])$/i;

/**
 * Adresse, die der QR-Code an der Rolle traegt: #/sonderposten?rolle=<nummer>. Basis ist die
 * Adresse, unter der das Dashboard gerade offen ist - ausser am Mac selbst (127.0.0.1), denn
 * die erreicht kein Handy; dann die Netzadresse vom Server. Ohne beide: ''.
 */
export function rollenLink(gid, { netzAdresse = null, ort = null } = {}) {
  const nr = rollenNummer(gid);
  if (!nr) return '';
  let basis = '';
  if (ort?.origin && ort?.hostname && !LOKAL.test(ort.hostname)) basis = ort.origin;
  else if (netzAdresse && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(netzAdresse)) basis = netzAdresse;
  return basis ? `${basis}/#/sonderposten?rolle=${nr}` : '';
}

/**
 * Text des QR-Etiketts: "RESTROLLE", Name ohne Zusatz ("Antigua 40 grün – Restposten, 400 cm"
 * -> "Antigua 40 grün"), Breite und was der Code tut. Je Zeile eine Zeile auf dem Aufkleber.
 */
export function rollenEtikettText(e) {
  return rollenEtikett(e).text;
}

/**
 * Text und feste Schrift je Zeile (mm, zeilenSchluessel "0:<zeile>" aus lib/freie-etiketten.mjs):
 * der Name bleibt automatisch und damit am groessten, die anderen Zeilen klein und gleich.
 */
export function rollenEtikett(e) {
  const name = String(e?.titel ?? '').split(/\s+[–-]\s+/)[0].trim() || 'Restrolle';
  const breite = Number(e?.breiteM);
  const zeilen = [['RESTROLLE', 4], [name, 0], [Number.isFinite(breite) && breite > 0 ? `${String(breite).replace('.', ',')} m breit` : '', 4], ['Verkauf: scannen + buchen', 3]]
    .filter(([t]) => t);
  const zeilenSchrift = {};
  zeilen.forEach(([, mm], i) => { if (mm) zeilenSchrift[`0:${i}`] = mm; });
  return { text: zeilen.map(([t]) => t).join('\n'), zeilenSchrift };
}

const zahl1 = n => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const tagMonat = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`; };

/** Zahlen fuer die Zeile "Restrollen" auf Heute; null, wenn es keine verkaufbare Rolle gibt oder die Liste fehlt. */
export function restrollenStand(d) {
  if (!d?.verfuegbar || !Array.isArray(d.eintraege)) return null;
  const rollen = d.eintraege.filter(e => e.typ === 'rolle' && e.verkaufbar);
  if (!rollen.length) return null;
  const qm = rollen.reduce((s, e) => s + (Number(e.bestand) || 0), 0);
  const meter = rollen.reduce((s, e) => s + (Number(e.laengeM) || 0), 0);
  return { anzahl: rollen.length, qm, meter, laden: d.ladenStand || null };
}

/** Text und Ton der Zeile: Bernstein nur, wenn das Nachmessen faellig ist. */
export function restrollenText(st) {
  const teile = [`${st.anzahl} ${st.anzahl === 1 ? 'Rolle' : 'Rollen'} · noch ${zahl1(st.meter)} m (${zahl1(st.qm)} m²)`];
  const l = st.laden;
  let warn = false;
  if (l) {
    teile.push(l.letzteBuchung ? `Ladenbuchungen 30 Tage: ${l.buchungen30} (zuletzt ${tagMonat(l.letzteBuchung)})` : 'im Laden noch nie gebucht');
    if (l.nachmessenFaellig) {
      warn = true;
      teile.push(l.letzteInventur ? `nachmessen fällig (zuletzt ${tagMonat(l.letzteInventur)})` : 'nachmessen fällig');
    } else if (l.nachmessenAb) teile.push(`nachmessen ab ${tagMonat(l.nachmessenAb)}`);
  }
  return { text: teile.join(' · '), warn };
}
