/** Kundenidentität statt Anzeigename: gleichnamige Personen bleiben getrennt. */
export const bestellKundenKey = z => String(z.kundenSchluessel || (z.email ? `email:${z.email.toLocaleLowerCase('de')}` : `auftrag:${z.orderId}`));

/** Anreden beeinflussen die alphabetische Reihenfolge im Arbeitsalltag nicht. */
export const sortKundenname = name => String(name || '').trim().replace(/^(?:frau|herr)\s+/i, '');

/** Erwartet nach Kunde sortierte Bestellungen und bündelt nur benachbarte Aufträge. */
export function gruppiereBestellzeilenNachKunde(zeilen) {
  const gruppen = [];
  for (const z of zeilen) {
    const key = bestellKundenKey(z);
    let gruppe = gruppen.at(-1);
    if (!gruppe || gruppe.key !== key) {
      gruppe = { key, name: z.kundenname || 'Kunde nicht hinterlegt', zeilen: [] };
      gruppen.push(gruppe);
    }
    gruppe.zeilen.push(z);
  }
  return gruppen;
}
