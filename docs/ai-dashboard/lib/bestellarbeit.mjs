// Derselbe ausstehende Zahlungsumfang wie im Betriebs-Export; "offen" am Auftrag meint Versand.
const ZAHLUNG_OFFEN = new Set(['PENDING', 'AUTHORIZED', 'PARTIALLY_PAID']);

/** Gemeinsame Zahlungsfilter-Regel fuer Bestellliste im Browser und Backend. */
export function bestellZahlungOffen(z = {}) {
  return !z.testbestellung && !z.storniert && ZAHLUNG_OFFEN.has(z.zahlungsstatus);
}

/** Lesbarer Arbeitsstand aus vorhandenen Quellen; aendert keine Buchung. */
export function bestellArbeitsstand(z = {}) {
  if (z.storniert) return { stand: 'Storniert', naechstes: 'Bei Bedarf Rückabwicklung prüfen' };
  if (z.fortschritt?.unklar) return { stand: 'Zu prüfen', naechstes: z.fortschritt.text || 'Nicht alle Artikel sind eindeutig nachverfolgbar' };
  if (z.fertig) return { stand: 'Abgeschlossen', naechstes: 'Nichts mehr zu tun' };
  const raus = z.fulfillmentstatus === 'FULFILLED' || (z.fortschritt?.minStufe || 0) >= 3;
  if (z.abgehakt && !raus) return { stand: 'Manuell abgehakt', naechstes: 'Versand wurde dadurch nicht gebucht' };
  const n = z.naechsterSchritt;
  const stand = raus ? 'Versandt' : z.fortschritt?.stufe === 'geliefert' ? 'Ware eingetroffen' : z.fortschritt?.stufe === 'bestellt' ? 'Beim Lieferanten bestellt' : 'In Bearbeitung';
  const probleme = (z.wasFehlt || []).filter(t => t !== 'Noch nicht versendet');
  return { stand, naechstes: n?.text || (probleme.length ? probleme.join(' · ') : raus ? 'Zustellung / Abschluss prüfen' : 'Bestellstand prüfen') };
}
export function bestellungAusgeblendet(z = {}) {
  return Boolean(z.abgehakt || z.fertig || z.fulfillmentstatus === 'FULFILLED');
}

/** Auch aus der Arbeitsliste genommene Faelle bleiben gezielt kontrollierbar. */
export function bestellPruefgruende(z = {}) {
  if (z.testbestellung || z.storniert) return [];
  const gruende = [];
  if (z.fortschritt?.unklar) gruende.push('Artikel nicht vollständig nachverfolgbar');
  if (z.abgehakt && !z.fertig && z.fulfillmentstatus !== 'FULFILLED' && !(z.fortschritt?.minStufe >= 3)) gruende.push('Manuell abgehakt, Versand noch offen');
  if (z.shopifyVersandVermerk === 'nachholen' || z.versandHinweis) gruende.push('Versandbuchung prüfen');
  return gruende;
}
