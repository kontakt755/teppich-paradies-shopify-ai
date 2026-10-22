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

const TAG_MS = 24 * 60 * 60 * 1000;
const BEZAHLT = new Set(['PAID', 'PARTIALLY_REFUNDED']);
// Nur Versand fehlt: das ist Stufe 2 (alles unterwegs), kein "es fehlt etwas".
const NUR_VERSAND = new Set(['Noch nicht versendet']);

/**
 * Wichtigkeit einer Bestellzeile (Kunden › Bestellungen, Inhaber 22.10.):
 *   1 bezahlt, offen, und es fehlt etwas (nicht bestellt, Rueckruf, Mass, ID)
 *   2 bezahlt, offen, alles unterwegs (wartet auf Lieferung/Versand)
 *   3 noch nicht bezahlt
 *   4 erledigt, schon an den Kunden raus oder storniert
 * `grund` sagt in einer Zeile, warum die Bestellung dort steht.
 */
export function wichtigkeit(z, jetzt = new Date()) {
  const tage = z.datum ? Math.max(0, Math.floor((jetzt - new Date(z.datum)) / TAG_MS)) : null;
  const seit = tage === null ? '' : tage === 0 ? 'seit heute' : `wartet seit ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
  const mit = (rang, text) => ({ rang, tage, grund: [seit, text].filter(Boolean).join(' · ') });
  if (z.storniert) return { rang: 4, tage, grund: 'storniert' };
  if (z.fertig || z.testbestellung) return { rang: 4, tage, grund: 'erledigt' };
  if (!BEZAHLT.has(String(z.zahlungsstatus))) return mit(3, 'noch nicht bezahlt');
  const fehlt = (z.wasFehlt || []).filter(g => !NUR_VERSAND.has(g) && g !== 'Noch nicht bezahlt');
  if ((z.fortschritt?.minStufe ?? 0) === 0 && !z.fortschritt?.unklar) fehlt.unshift(z.fortschritt?.text && z.fortschritt.text !== 'Offen' ? z.fortschritt.text.toLowerCase() : 'noch nicht bestellt');
  else if (z.fortschritt?.unklar) fehlt.unshift('nicht nachverfolgbar');
  if (fehlt.length) return mit(1, fehlt.join(', '));
  // Schon an den Kunden raus (Stufe 3 von 4): es fehlt nur der Haken "erledigt" - unten einsortieren.
  if ((z.fortschritt?.minStufe ?? 0) >= 3) return { rang: 4, tage, grund: 'an Kunden raus' };
  return mit(2, z.fortschritt?.text ? z.fortschritt.text.replace(/\s*\(.*\)$/, '') : 'unterwegs');
}

/**
 * Sortiert nach Wichtigkeit, Bestellungen eines Kunden bleiben beieinander: der Kunde steht so weit
 * oben wie seine dringendste Bestellung (bei gleichem Rang: die aelteste zuerst).
 */
export function sortiereNachWichtigkeit(zeilen, jetzt = new Date()) {
  const w = new Map(zeilen.map(z => [z, wichtigkeit(z, jetzt)]));
  const kunde = new Map();
  for (const z of zeilen) {
    const key = bestellKundenKey(z), r = w.get(z);
    const alt = kunde.get(key);
    const datum = String(z.datum || '');
    if (!alt || r.rang < alt.rang || (r.rang === alt.rang && datum < alt.datum)) kunde.set(key, { rang: r.rang, datum });
  }
  return [...zeilen].sort((a, b) => {
    const ka = kunde.get(bestellKundenKey(a)), kb = kunde.get(bestellKundenKey(b));
    return ka.rang - kb.rang || ka.datum.localeCompare(kb.datum)
      || bestellKundenKey(a).localeCompare(bestellKundenKey(b))
      || w.get(a).rang - w.get(b).rang || String(a.datum || '').localeCompare(String(b.datum || ''));
  }).map(z => ({ ...z, wichtigkeit: w.get(z) }));
}
