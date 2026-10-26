// Derselbe ausstehende Zahlungsumfang wie im Betriebs-Export; "offen" am Auftrag meint Versand.
const ZAHLUNG_OFFEN = new Set(['PENDING', 'AUTHORIZED', 'PARTIALLY_PAID']);

/** Gemeinsame Zahlungsfilter-Regel fuer Bestellliste im Browser und Backend. */
export function bestellZahlungOffen(z = {}) {
  return !z.testbestellung && !z.storniert && ZAHLUNG_OFFEN.has(z.zahlungsstatus);
}

// Voll erstattet bzw. Zahlung verworfen: es gibt nichts mehr zu liefern.
const ZAHLUNG_ABGESCHLOSSEN = new Set(['REFUNDED', 'VOIDED']);

/**
 * Belegt fertig laut Shopify (#1698): in Shopify archiviert (so hakt der Inhaber Abholung und
 * Ladenverkauf ab, 2026-10-21) oder voll erstattet. Solche Bestellungen fallen ohne Klick aus der
 * Arbeitsliste. null = kein Beleg. Storniert und versendet regeln die Aufrufer wie bisher selbst.
 */
export function belegtFertigGrund(z = {}) {
  if (z.storniert) return null;
  if (z.archiviert) return 'In Shopify archiviert';
  if (ZAHLUNG_ABGESCHLOSSEN.has(z.zahlungsstatus)) return 'Vollständig erstattet';
  return null;
}

/** Lesbarer Arbeitsstand aus vorhandenen Quellen; aendert keine Buchung. */
export function bestellArbeitsstand(z = {}) {
  if (z.storniert) return { stand: 'Storniert', naechstes: 'Bei Bedarf Rückabwicklung prüfen' };
  if (z.fortschritt?.unklar) return { stand: 'Zu prüfen', naechstes: z.fortschritt.text || 'Nicht alle Artikel sind eindeutig nachverfolgbar' };
  if (z.fertig) return { stand: 'Abgeschlossen', naechstes: 'Nichts mehr zu tun' };
  const beleg = belegtFertigGrund(z);
  if (beleg) return { stand: beleg, naechstes: 'Nichts mehr zu tun' };
  const raus = z.fulfillmentstatus === 'FULFILLED' || (z.fortschritt?.minStufe || 0) >= 3;
  if (z.abgehakt && !raus) return { stand: 'Manuell abgehakt', naechstes: 'Versand wurde dadurch nicht gebucht' };
  const n = z.naechsterSchritt;
  const stand = raus ? 'Versandt' : z.fortschritt?.stufe === 'geliefert' ? 'Ware eingetroffen' : z.fortschritt?.stufe === 'bestellt' ? 'Beim Lieferanten bestellt' : 'In Bearbeitung';
  const probleme = (z.wasFehlt || []).filter(t => t !== 'Noch nicht versendet');
  return { stand, naechstes: n?.text || (probleme.length ? probleme.join(' · ') : raus ? 'Zustellung / Abschluss prüfen' : 'Bestellstand prüfen') };
}
export function bestellungAusgeblendet(z = {}) {
  return Boolean(z.abgehakt || z.fertig || z.fulfillmentstatus === 'FULFILLED' || belegtFertigGrund(z));
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
