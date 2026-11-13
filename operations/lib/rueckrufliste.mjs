/**
 * Rueckruf-/Beratungs-Arbeitsliste: alle Auftraege, bei denen der Kunde beim
 * Bestellen "Beratung" oder "Maßprüfung" mit Ja beantwortet oder bei "Verlegung"
 * "Angefragt" gewaehlt hat (Interesse an Aufmass/Verlegung). Baut auf dem
 * vorhandenen Bestellmodell (operations/lib/bestelluebersicht.mjs,
 * `auftrag.checks` und `auftrag.details.beratungsangaben`) auf - keine eigene
 * Datenabfrage.
 *
 * Die Namen der Bestellattribute an der Kasse sind nicht global fest verdrahtet:
 * `beratungsangaben` sammelt bereits jedes Attribut, dessen Name auf
 * beratung/telefon/rückruf/beratungsthema/maßprüfung/verlegung passt (siehe
 * dort). Diese Datei sucht darin nach einem Thema- und einem Zeit-Feld, statt
 * einen exakten Feldnamen vorauszusetzen - falls der Shop das Attribut anders
 * benennt, bleibt die Zeile trotzdem nutzbar (mit "–" statt Absturz).
 */

function ersteWert(beratungsangaben, testFn) {
  const key = Object.keys(beratungsangaben || {}).find(testFn);
  return key ? beratungsangaben[key] : null;
}

/**
 * Ja bei Beratung oder Maßprüfung = Kandidat für die Rückrufliste. Dazu
 * "Verlegung: Angefragt": Die interne Bestellmail schreibt dafuer „bitte beim
 * Rückruf ansprechen". Bis 2026-10-13 rief der Laden diese Kunden ueber die
 * Auftrags-App zurueck; seitdem fasst das Control Center Muster und Rueckrufe
 * nach (Inhaber, Werkbank w-078), die Laden-Ansicht zeigt nur noch die Zahl.
 */
export function istRueckrufKandidat(auftrag) {
  const c = auftrag?.checks || {};
  return c.beratung === 'Ja' || c.masspruefung === 'Ja' || c.verlegung === 'Angefragt';
}

/** Von Hand an der Bestellung angelegt ("Falsch geliefert – Kunde anrufen", rueckrufe.mjs `thema`). */
export const istManuell = eintrag => eintrag?.quelle === 'manuell' && Boolean(eintrag.thema);

export function rueckrufZeile(auftrag, eintrag = null) {
  const b = auftrag?.details?.beratungsangaben || {};
  const themaKey = ersteWert(b, k => /thema/i.test(k)) ?? null;
  const zeit = ersteWert(b, k => /zeit|wann|uhrzeit/i.test(k));
  const telefonAngabe = b['Telefon'] ?? ersteWert(b, k => /telefon/i.test(k));
  const kundeTelefon = auftrag?.details?.kunde?.telefon;
  // Viele Kunden tragen die Nummer nur in der Lieferadresse ein - sonst stuende hier "keine Telefonnummer".
  const adressTelefon = [auftrag?.details?.lieferadresse?.telefon, auftrag?.details?.rechnungsadresse?.telefon].find(t => t && t !== '–');
  const telefon = !kundeTelefon || kundeTelefon === '–' ? (telefonAngabe || adressTelefon || null) : kundeTelefon;
  const c = auftrag?.checks || {};
  const themen = [];
  if (istManuell(eintrag)) themen.push(eintrag.thema);
  if (c.beratung === 'Ja') themen.push(themaKey ? String(themaKey) : 'Beratung gewünscht');
  if (c.masspruefung === 'Ja') themen.push('Maßprüfung');
  if (c.verlegung === 'Angefragt') themen.push('Interesse an Aufmaß/Verlegung');
  return {
    orderId: auftrag.id,
    orderName: auftrag.name,
    datum: auftrag.datum,
    kundenname: auftrag?.details?.kunde?.name ?? '–',
    telefon: telefon || null,
    thema: themen.join(' · ') || 'Beratung',
    wunschzeit: zeit || null,
    adminUrl: auftrag.adminUrl,
    testbestellung: !!auftrag.testbestellung,
  };
}

/**
 * Rueckrufwuensche ohne Bestellung (Musterberatung im Warenkorb, aus dem Postfach-Lauf in
 * rueckrufe.json angelegt, operations/lib/rueckrufe.mjs). Gleiche Zeilenform wie oben, damit
 * Liste, Zaehler und "Heute" sie ohne Sonderweg zeigen; `datum` ist der Mail-Eingang.
 */
export function mailRueckrufZeilen(statusAlle = {}) {
  return Object.values(statusAlle || {})
    .filter(e => e?.quelle === 'mail' && e.orderId)
    .map(e => ({
      orderId: e.orderId,
      orderName: null,
      datum: e.eingangAm || e.erstelltAm || null,
      kundenname: e.kundenname || '–',
      telefon: e.telefon || null,
      email: e.email || null,
      thema: e.thema || 'Musterberatung',
      wunschzeit: null,
      quelle: 'mail',
      muster: Array.isArray(e.muster) ? e.muster : [],
      nachricht: e.nachricht || null,
      // Zweite Musterberatung derselben Person wird hier zusammengefasst (rueckrufe.mjs).
      anfragen: 1 + (Array.isArray(e.weitereMailIds) ? e.weitereMailIds.length : 0),
      zuletztAm: e.zuletztAm || null,
      testbestellung: false,
    }));
}

/** Aelteste zuerst (laengstes Warten zuerst abarbeiten). Mit `statusAlle` auch die Rueckrufe aus Mails. */
export function rueckrufliste(modell, statusAlle = null) {
  const alle = [...(modell?.auftraege ?? []), ...(modell?.testauftraege ?? [])];
  return [...alle.filter(a => istRueckrufKandidat(a) || istManuell(statusAlle?.[a.id])).map(a => rueckrufZeile(a, statusAlle?.[a.id])), ...mailRueckrufZeilen(statusAlle)]
    .sort((a, b) => String(a.datum ?? '').localeCompare(String(b.datum ?? '')));
}
