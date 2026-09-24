/**
 * Rueckruf-/Beratungs-Arbeitsliste: alle Auftraege, bei denen der Kunde beim
 * Bestellen "Beratung" oder "Maßprüfung" mit Ja beantwortet hat. Baut auf dem
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

/** Ja bei Beratung oder Maßprüfung = Kandidat für die Rückrufliste. */
export function istRueckrufKandidat(auftrag) {
  const c = auftrag?.checks || {};
  return c.beratung === 'Ja' || c.masspruefung === 'Ja';
}

export function rueckrufZeile(auftrag) {
  const b = auftrag?.details?.beratungsangaben || {};
  const themaKey = ersteWert(b, k => /thema/i.test(k)) ?? null;
  const zeit = ersteWert(b, k => /zeit|wann|uhrzeit/i.test(k));
  const telefonAngabe = b['Telefon'] ?? ersteWert(b, k => /telefon/i.test(k));
  const kundeTelefon = auftrag?.details?.kunde?.telefon;
  const telefon = !kundeTelefon || kundeTelefon === '–' ? (telefonAngabe || null) : kundeTelefon;
  const c = auftrag?.checks || {};
  const themen = [];
  if (c.beratung === 'Ja') themen.push(themaKey ? String(themaKey) : 'Beratung gewünscht');
  if (c.masspruefung === 'Ja') themen.push('Maßprüfung');
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

/** Aelteste zuerst (laengstes Warten zuerst abarbeiten). */
export function rueckrufliste(modell) {
  const alle = [...(modell?.auftraege ?? []), ...(modell?.testauftraege ?? [])];
  return alle
    .filter(istRueckrufKandidat)
    .map(rueckrufZeile)
    .sort((a, b) => String(a.datum ?? '').localeCompare(String(b.datum ?? '')));
}
