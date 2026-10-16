/**
 * Versand-Dialog "An Kunden raus" - Regeln ohne DOM (Browser und Tests).
 *
 * Seit 2026-10-13 bucht "raus" die Sendung in Shopify, und der Kunde bekommt die
 * Versandmail (Inhaber, Werkbank w-079). Der Dialog fragt deshalb, welche Artikel
 * in diesem Paket sind (Teillieferung), nimmt die Sendungsnummer mit und sagt, ob
 * eine Mail rausgeht. Gebucht wird serverseitig (operations/lib/versand.mjs).
 */

/** Gleiche Liste wie VERSANDDIENSTE in operations/lib/versand.mjs - ein Test haelt beide gleich. */
export const VERSANDDIENSTE = Object.freeze(['GLS', 'DHL', 'DPD', 'Hermes', 'UPS', 'Deutsche Post (DE)', 'Spedition']);

const SCHRITTE = ['bestellt', 'geliefert', 'raus', 'erledigt'];
const stufe = s => SCHRITTE.indexOf(s ?? '');

/**
 * Artikel eines Auftrags, die noch nicht raus sind - nur die kann der Dialog anbieten.
 * @param {object} auftrag         Auftrag mit positionen[] (lineItemId, titel, farbe, eigenleistung ...)
 * @param {object} statusPositionen "orderId::lineItemId" -> Stand (GET /api/einkauf/auftragsstatus)
 */
export function versandKandidaten(auftrag, statusPositionen = {}) {
  return (auftrag?.positionen ?? [])
    .filter(p => p?.lineItemId && stufe(statusPositionen?.[`${auftrag.id}::${p.lineItemId}`]?.status) < stufe('raus'));
}

/**
 * Was ist vorab angekreuzt?
 * - Ohne angeklickte Position (ganzer Auftrag, Zeitleiste): alles, was noch nicht raus ist -
 *   das war bisher das Verhalten des Knopfs.
 * - Mit angeklickter Position (Einkauf): nur diese. Eigenleistungen (Kettelservice o. ae.) gehen
 *   mit der letzten Ware raus - sonst bliebe die Bestellung in Shopify ewig "teilweise versendet".
 *   Ist die angeklickte Position ein Muster, gehen die Muster aus eigenem Bestand (Musterlager,
 *   "haben wir da") mit ins Paket: gemischte Musterbestellungen gehen zusammen raus (Inhaber 2026-10-15).
 *   Ebenso alle Muster, die schon bei uns angekommen sind (`status`: lineItemId -> Auftragsfluss-Status).
 */
export function vorauswahl(kandidaten, { geklickt = null, status = {} } = {}) {
  if (!geklickt) return new Set(kandidaten.map(p => p.lineItemId));
  const ids = new Set([geklickt]);
  if (kandidaten.find(p => p.lineItemId === geklickt)?.istMuster) {
    // Alle Muster, die fertig zum Verschicken sind, gleich mit ankreuzen (Innendienst 15.10.:
    // "nicht fuer jedes Muster einzeln klicken"): Lagermuster und alle, die bei uns angekommen sind.
    for (const p of kandidaten) if (p.istMuster && (p.musterHerkunft === 'eigen_versand' || status[p.lineItemId] === 'geliefert')) ids.add(p.lineItemId);
  }
  const restWare = kandidaten.filter(p => !p.eigenleistung && p.lineItemId !== geklickt);
  if (!restWare.length) for (const p of kandidaten) if (p.eigenleistung) ids.add(p.lineItemId);
  return ids;
}

/** Bringen wir diese Muster persoenlich vorbei? Dann ist "raus" eine Uebergabe, kein Paket. */
export function istUebergabe(positionen) {
  return positionen.length > 0 && positionen.every(p => p.musterHerkunft === 'eigen_vorbei');
}

/**
 * Rueckmeldung nach dem Klick: was im Control Center steht und was Shopify daraus gemacht hat.
 * `ton` "crit", wenn die Buchung in Shopify nicht (sicher) geklappt hat - dann muss jemand handeln.
 * @param {string} basis      z. B. "Als verschickt eingetragen"
 * @param {object|null} shopify  Feld `shopify` der Antwort (fehlt bei alten Servern)
 */
export function versandRueckmeldung(basis, shopify) {
  if (!shopify) return { text: basis, ton: '' };
  const m = shopify.meldung ? ` · ${shopify.meldung}` : '';
  if (['gebucht', 'bereits'].includes(shopify.status)) return { text: `${basis}${m}`, ton: '' };
  if (shopify.status === 'uebersprungen') return { text: `${basis}${m}`, ton: '' };
  return { text: `${basis} – aber${m.replace(/^ · /, ' ')}`, ton: 'crit' };
}
