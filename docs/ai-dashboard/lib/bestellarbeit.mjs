/** Lesbarer Arbeitsstand aus vorhandenen Quellen; aendert keine Buchung. */
export function bestellArbeitsstand(z = {}) {
  if (z.storniert) return { stand: 'Storniert', naechstes: 'Bei Bedarf Rückabwicklung prüfen' };
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
