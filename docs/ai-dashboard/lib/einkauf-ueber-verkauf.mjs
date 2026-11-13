/**
 * Einkauf ueber Verkauf (Benutzer 2026-11-13, Anlass #1144): nennt eine Auftragsbestaetigung oder
 * Rechnung fuer einen Artikel mehr, als der Kunde netto dafuer bezahlt hat, steht die Position rot im
 * Control Center - mit fertigem Text an den Vertreter, der einen Preis fuer uns hinterlegen kann.
 *
 * Nur ein Hinweis: Hier wird nichts gesendet und kein Shop-Preis geaendert. Die Einkaufspreise liest
 * der Postfach-Lauf aus dem PDF (operations/lib/lieferbelege.mjs, preiseAusText) nach `beleg.preise`.
 *
 * shortcut: verglichen wird nur, wo die Artikelnummer des Lieferanten unsere SKU ist und er in Stueck
 * berechnet (Bauchemie, Kleber, Werkzeug). Meterware braucht die Zuordnung Artikelnummer -> Position
 * und eine Umrechnung der Einheit - erst bauen, wenn dort der erste Fall auftritt.
 */

const TAG_MS = 86400000;
/** Ohne Zuordnung gilt ein Beleg fuer Bestellungen, die hoechstens so lange vor ihm eingingen. */
export const FENSTER_TAGE = 21;

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const gleich = s => String(s ?? '').trim().toUpperCase();
const eur = n => `${Number(n).toFixed(2).replace('.', ',')} €`;
const BELEG_WORT = { ab: 'Auftragsbestätigung', rechnung: 'Rechnung' };

/**
 * @param {object} p
 * @param {object[]} p.belege      Belege mit `preise.positionen` und `zuordnung` (ordneAlleZu)
 * @param {object[]} p.kandidaten  kandidatenAus() - Positionen mit sku, nettoGesamt, mengeBestellt
 * @returns {object[]} Abweichungen der Art `einkauf_ueber_verkauf` (rot), eine je Bestellposition
 */
export function einkaufUeberVerkauf({ belege = [], kandidaten = [] } = {}) {
  // Je Position zaehlt der juengste Beleg: eine geaenderte AB mit dem richtigen Preis hebt die Warnung auf.
  const juengster = new Map();
  for (const b of [...belege].sort((x, y) => String(x.datum).localeCompare(String(y.datum)))) {
    const zeilen = (b.preise?.positionen || []).filter(z => z.einheit === 'STK' && z.menge > 0 && z.netto > 0);
    if (!zeilen.length) continue;
    const t = Date.parse(b.datum);
    const fest = ['sicher', 'bestaetigt'].includes(b.zuordnung?.stufe) ? b.zuordnung.orderIds : null;
    for (const k of kandidaten) {
      const bestellt = Date.parse(k.datum);
      if (fest ? !fest.includes(k.orderId) : !(bestellt <= t + TAG_MS && bestellt >= t - FENSTER_TAGE * TAG_MS)) continue;
      for (const p of k.positionen) {
        const z = p.sku && !p.istMuster && !p.eigenleistung ? zeilen.find(x => gleich(x.artikel) === gleich(p.sku)) : null;
        // Verschenkte Positionen (0 €) sind Absicht, kein Preisfehler.
        if (!z || !(p.mengeBestellt > 0) || !(p.nettoGesamt > 0)) continue;
        juengster.set(`${k.orderId}::${p.lineItemId}`, { b, k, p, einkauf: r2(z.netto / z.menge * p.mengeBestellt) });
      }
    }
  }
  return [...juengster.values()]
    .filter(({ b, k, p, einkauf }) => einkauf >= p.nettoGesamt && !b.erledigt && !b.quittiert?.[k.orderId])
    .map(({ b, k, p, einkauf }) => ({
      id: `preis:${b.id}:${k.orderId}:${p.lineItemId}`, art: 'einkauf_ueber_verkauf', ton: 'crit',
      orderId: k.orderId, orderName: k.orderName, kundenname: k.kundenname, lieferant: b.lieferant || p.lieferant || null,
      belegId: b.id, belegArt: b.art, belegnummer: b.refs?.belegnummer || null, datum: b.datum,
      lineItemId: p.lineItemId, titel: p.titel, sku: p.sku, stueck: p.mengeBestellt,
      einkauf, verkauf: p.nettoGesamt, differenz: r2(einkauf - p.nettoGesamt),
    }));
}

/** "Einkauf 60,00 € netto · Verkauf 50,00 € netto · 10,00 € darüber · Auftragsbestätigung 4711" - ohne Betraege nur der Beleg. */
export function preisZeile(w) {
  const beleg = `${BELEG_WORT[w.belegArt] || 'Beleg'}${w.belegnummer ? ` ${w.belegnummer}` : ''}`;
  if (typeof w.einkauf !== 'number') return `${beleg} · Beträge sieht nur der Inhaber – bitte Ahmet zeigen`;
  return `Einkauf ${eur(w.einkauf)} netto · Verkauf ${eur(w.verkauf)} netto · ${w.differenz > 0 ? `${eur(w.differenz)} darüber` : 'kein Ertrag'} · ${beleg}`;
}

/** Fassung fuer alle ausser dem Inhaber: Einkaufspreise sieht nur er (wie bestellwarnung.mjs, 2026-11-05). */
export function ohneBetraege({ einkauf, verkauf, differenz, entwurf, ...rest }) {
  return rest;
}

/**
 * Fertiger Text an den Vertreter: Preis fuer uns hinterlegen, Beleg aendern. Gesendet wird von Hand.
 * @param {object} w  Abweichung aus einkaufUeberVerkauf()
 * @param {{vertreter?: {name?: string, mail?: string, duzen?: boolean}, absender?: string[]}} o  aus den privaten Stammdaten
 */
export function vertreterNachricht(w, { vertreter = null, absender = [] } = {}) {
  const beleg = BELEG_WORT[w.belegArt] || 'Beleg';
  const nummer = w.belegnummer ? ` ${w.belegnummer}` : '';
  const du = vertreter?.duzen === true;
  const name = String(vertreter?.name || '').trim();
  const anrede = du ? `Hallo${name ? ` ${name.split(/\s+/)[0]}` : ''},` : `Guten Tag${name ? ` ${name}` : ''},`;
  const text = [
    anrede, '',
    `in der ${beleg}${nummer} steht Artikel ${w.sku} (${w.titel}) mit ${eur(w.einkauf)} netto für ${w.stueck} Stück. Wir verkaufen ${w.stueck === 1 ? 'ihn' : 'sie'} für ${eur(w.verkauf)} netto und liegen damit unter unserem Einkauf.`, '',
    du ? `Kannst du bitte einen Preis für uns hinterlegen und die ${beleg} ändern?` : `Können Sie bitte einen Preis für uns hinterlegen und die ${beleg} ändern?`, '',
    du ? 'Danke dir und viele Grüße' : 'Vielen Dank und freundliche Grüße',
    ...(absender.filter(Boolean).length ? absender.filter(Boolean) : ['Teppich Paradies Oranienburg']),
  ].join('\n');
  return { an: vertreter?.mail || null, betreff: `Preis zu ${beleg}${nummer}, Artikel ${w.sku}`, text };
}
