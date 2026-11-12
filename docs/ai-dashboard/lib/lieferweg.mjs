/**
 * Lieferweg einer Warenposition: wer bringt die Ware zum Kunden? Reine Regel ohne DOM und ohne
 * Dateizugriff - laeuft im Browser und im Server (wie lib/beschaffung.mjs).
 *
 * Fuenf Wege, ein Wort je Weg (docs/control-center/BEGRIFFE.md):
 *   hersteller  "Hersteller → Kunde"     der Lieferant schickt direkt an den Kunden
 *   baustelle   "Hersteller → Baustelle" der Lieferant liefert auf die Baustelle
 *   uns         "über uns"               die Ware kommt zu uns und geht von hier raus
 *   kettler     "über Kettler"           die Ware geht erst an unseren Kettelservice
 *   lager       "aus Lager"              wir schneiden aus eigener Lagerrolle und verschicken selbst
 *
 * Reihenfolge (Inhaber 06.11.2026, #1995): was beim Bestellen vermerkt wurde (eintrag.ueber) >
 * Lagerware nach der privaten Regeldatei (position.lagerware, vom Server gesetzt) > vor dem Bestellen
 * der Vorschlag der Bestellnachricht (position.wegVorschlag, 12.11.2026) > Stammroute (einkauf.route). `belegt` ist false, wenn der Weg nur aus der Stammroute abgeleitet ist: Ware mit
 * Route "an uns" geht nach der Regel vom 14.10. meist trotzdem direkt an den Kunden - die
 * Plakette sagt dann "nicht vermerkt".
 *
 * Zwei Grenzen (Pruefung 06.11.2026):
 * - Ein Vermerk zaehlt nur, solange die Position einen Schritt hat. "Zurueck auf offen" laesst ihn
 *   stehen; ein alter Vermerk "direkt an Kunden" machte sonst Lagerware wieder bestellbar.
 * - Die Regeldatei gilt nur fuer Ware, die noch nicht vom Lieferanten gekommen ist (offen oder der
 *   Altfall "bestellt" wie #1119). Was ohne Vermerk "aus Lager" schon geliefert, raus oder erledigt
 *   ist, kam vor der Regel ueber den Lieferanten zu uns (#1104) - der Weg folgt dann der Stammroute.
 * Die Stammroute OWN_STOCK ist kein Lieferweg: routeFor (operations/lib/route.mjs) bestellt sie
 * beim Lieferanten, weil Shopify keinen Bestand fuehrt. Lagerware steht nur in der Regeldatei.
 *
 * Muster und Eigenleistungen haben keinen Lieferweg: Muster laufen ueber die Packstation,
 * eine Eigenleistung (Kettelservice) reist nicht.
 */

export const WEGE = Object.freeze(['hersteller', 'baustelle', 'uns', 'kettler', 'lager']);

export const LIEFERWEG_WORT = Object.freeze({
  hersteller: 'Hersteller → Kunde',
  baustelle: 'Hersteller → Baustelle',
  uns: 'über uns',
  kettler: 'über Kettler',
  lager: 'aus Lager',
});

/** Vermerk beim Bestellen (operations/lib/auftragsstatus.mjs UEBER_WERTE) -> Weg. */
const VERMERK_WEG = Object.freeze({ kunde: 'hersteller', kettler: 'kettler', laden: 'uns', lager: 'lager' });
/** Stammroute (domains/shopify/einkauf-metafelder.json) -> Weg; alles andere "über uns" (auch OWN_STOCK, siehe oben). */
const ROUTE_WEG = Object.freeze({ SUPPLIER_DIRECT: 'hersteller', SUPPLIER_TO_SITE: 'baustelle' });
/** Ab hier ist die Ware nicht mehr "beim Lieferanten" - die Regeldatei sagt dann nichts mehr. */
const SCHON_DA = new Set(['geliefert', 'raus', 'erledigt']);

/** Schritte, die wir bei Ware selbst abhaken, bevor sie raus geht (eintrag.selbstversand). */
export const SELBST_SCHRITTE = Object.freeze(['zugeschnitten', 'gepackt']);

/**
 * Passende Regel der privaten Datei lieferanten/lagerware.json ({ skuPraefix, hinweis }) oder null.
 * Gross-/Kleinschreibung zaehlt nicht; ein leerer Praefix passt nie.
 */
export function lagerRegelFuer(sku, regeln = []) {
  const s = String(sku ?? '').trim().toUpperCase();
  if (!s) return null;
  return (regeln || []).find(r => {
    const praefix = String(r?.skuPraefix ?? '').trim().toUpperCase();
    return praefix && s.startsWith(praefix);
  }) || null;
}

const wegErgebnis = (weg, belegt) => ({ weg, wort: LIEFERWEG_WORT[weg], belegt });

/**
 * Lieferweg einer Position.
 * @param {object} p        Position der Bestelluebersicht (istMuster, eigenleistung, route, sku, lagerware)
 * @param {object} [eintrag] Auftragsfluss-Eintrag (ueber, status)
 * @param {object} [ctx]
 * @param {object[]} [ctx.regeln]  Lagerware-Regeln, falls die Position noch nicht markiert ist (Server)
 * @returns {{weg:string, wort:string, belegt:boolean, vorschlag?:boolean}|null}  null fuer Muster und Eigenleistung
 */
export function lieferwegVon(p, eintrag = null, ctx = {}) {
  if (!p || p.istMuster || p.eigenleistung) return null;
  const status = eintrag?.status || null;
  const vermerk = status ? VERMERK_WEG[eintrag.ueber] : null;
  // "Lieferant liefert direkt" auf eine Baustelle bleibt "Baustelle" - der Vermerk sagt nur "nicht zu uns".
  if (vermerk) return wegErgebnis(vermerk === 'hersteller' && p.route === 'SUPPLIER_TO_SITE' ? 'baustelle' : vermerk, true);
  const regel = p.lagerware === true || (p.lagerware === undefined && Array.isArray(ctx.regeln) && Boolean(lagerRegelFuer(p.sku, ctx.regeln)));
  if (regel && !SCHON_DA.has(status)) return wegErgebnis('lager', true);
  // Noch kein Schritt: der Weg, den die Bestellnachricht ohne Wahl im Dialog nimmt (p.wegVorschlag, vom
  // Server gesetzt: Standardweg des Lieferanten, Kettler-Regel). Sonst zeigte die Plakette vor dem Bestellen
  // "über uns", waehrend die Nachricht direkt an den Kunden bestellt (12.11.2026). Nur ein Vorschlag:
  // wer Tatsachen prueft (Server: "Ware ist angekommen", "Gepackt"), ruft mit ctx.vorschlag === false.
  if (!status && ctx.vorschlag !== false && WEGE.includes(p.wegVorschlag)) return { ...wegErgebnis(p.wegVorschlag, false), vorschlag: true };
  return wegErgebnis(ROUTE_WEG[p.route] || 'uns', false);
}

/**
 * Lagerware darf nie beim Lieferanten bestellt werden. Dieselbe Regel wie lieferwegVon (Weg "aus
 * Lager") - sonst galt eine schon mit Vermerk bestellte Position zugleich als "Hersteller → Kunde"
 * und als Lagerware und fiel aus jeder Arbeitsliste.
 */
export function istLagerware(p, eintrag = null) {
  return lieferwegVon(p, eintrag)?.weg === 'lager';
}

/**
 * Was ist an dieser Position fuer uns zu tun, bevor sie raus geht? null = nichts (Hersteller
 * schickt, schon raus, noch nicht da). Sonst 'zuschneiden', 'packen' oder 'versand'.
 *   lager: leer (oder Altfall "bestellt") -> zuschneiden, geliefert -> packen/versand
 *   uns:   geliefert (bei uns eingetroffen) -> packen/versand
 */
export function selbstStand(p, eintrag = null) {
  const lw = lieferwegVon(p, eintrag);
  if (!lw) return null;
  const s = eintrag?.status || null;
  if (s === 'raus' || s === 'erledigt') return null;
  const nachPacken = eintrag?.selbstversand?.gepackt ? 'versand' : 'packen';
  if (lw.weg === 'lager') return s === 'geliefert' ? nachPacken : 'zuschneiden';
  if (lw.weg === 'uns' && s === 'geliefert') return nachPacken;
  return null;
}

/**
 * Klartext je Stand - "noch zuschneiden", "zugeschnitten – noch packen", "gepackt – wartet auf Versand".
 * "zugeschnitten" nur, wenn "Zugeschnitten" wirklich abgehakt ist (eintrag.selbstversand), sonst
 * hiesse es, die Rolle sei schon geschnitten.
 */
export function selbstStandText(stand, weg, eintrag = null) {
  if (stand === 'zuschneiden') return 'noch zuschneiden';
  if (stand === 'packen') return weg === 'lager' && eintrag?.selbstversand?.zugeschnitten ? 'zugeschnitten – noch packen' : 'eingetroffen – noch packen';
  if (stand === 'versand') return 'gepackt – wartet auf Versand';
  return '';
}

/**
 * Wege eines Auftrags in fester Reihenfolge, je Weg die Zahl der Positionen.
 * @param {object[]} positionen
 * @param {(p:object)=>object|null} [eintragVon]
 * @returns {{weg:string, wort:string, anzahl:number, belegt:boolean}[]}  belegt: alle Positionen dieses Wegs belegt
 */
export function wegeImAuftrag(positionen = [], eintragVon = () => null, ctx = {}) {
  const je = new Map();
  for (const p of positionen || []) {
    if ((p?.menge ?? 1) <= 0) continue;
    const lw = lieferwegVon(p, eintragVon(p), ctx);
    if (!lw) continue;
    const bisher = je.get(lw.weg) || { weg: lw.weg, wort: lw.wort, anzahl: 0, belegt: true };
    bisher.anzahl += 1;
    bisher.belegt = bisher.belegt && lw.belegt;
    bisher.vorschlag = (bisher.vorschlag ?? true) && lw.vorschlag === true;
    je.set(lw.weg, bisher);
  }
  return WEGE.filter(w => je.has(w)).map(w => je.get(w));
}

/** Eine Zeile fuer den Auftrag: "1 × Hersteller → Kunde · 1 × aus Lager"; leer ohne Warenposition. */
export function lieferwegKurz(positionen = [], eintragVon = () => null, ctx = {}) {
  return wegeImAuftrag(positionen, eintragVon, ctx).map(w => `${w.anzahl} × ${w.wort}`).join(' · ');
}
