/** Beobachtete Muster-/Kaufverlaeufe aus dem privaten Betriebsbestand. Keine Ein-/Ausgabe. */
import { istMusterPosition } from './muster.mjs';
import { istTestbestellung } from './testbestellung.mjs';
import { istEigenleistung } from './bestelluebersicht.mjs';
import { ladeBestellungen } from './kennzahlen.mjs';

const TAG = 864e5;
const gesetzt = v => typeof v === 'string' && v.trim() && !['–', '-', 'UNGEKLAERT'].includes(v.trim());
const email = v => gesetzt(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : null;
const zeit = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
const geld = v => v?.shopMoney?.amount !== null && v?.shopMoney?.amount !== undefined && String(v.shopMoney.amount).trim() !== '' && Number.isFinite(Number(v.shopMoney.amount)) && Number(v.shopMoney.amount) >= 0 ? Number(v.shopMoney.amount) : null;
const menge = p => Number(p.currentQuantity ?? p.quantity);
const median = werte => {
  if (!werte.length) return null;
  const sortiert = [...werte].sort((a, b) => a - b), mitte = Math.floor(sortiert.length / 2);
  return Math.round((sortiert.length % 2 ? sortiert[mitte] : (sortiert[mitte - 1] + sortiert[mitte]) / 2) * 10) / 10;
};
const positionen = o => Array.isArray(o?.lineItems?.nodes) ? o.lineItems.nodes : Array.isArray(o?.lineItems) ? o.lineItems : null;
const kundeId = o => gesetzt(o?.customer?.id) ? o.customer.id.trim() : null;
const kundeMails = o => [...new Set([email(o?.customer?.email), email(o?.email)].filter(Boolean))];

function istMuster(p) {
  const properties = Array.isArray(p.customAttributes)
    ? Object.fromEntries(p.customAttributes.map(a => [a.key, a.value])) : p.properties || {};
  return istMusterPosition({ sku: p.sku || p.variant?.sku, properties,
    produktTyp: p.variant?.product?.productType || p.variant?.product?.type || p.productType });
}
function istWare(p) {
  if (istMuster(p) || istEigenleistung(p) || p.isGiftCard || p.variant?.product?.isGiftCard) return false;
  const typ = String(p.variant?.product?.productType || '').trim().toLowerCase();
  return !['gift card', 'giftcard', 'gutschein'].includes(typ);
}

// Nur der vollstaendige Auftragsstatus erlaubt eine Zuordnung zu allen enthaltenen Mustern.
// Der Export begrenzt Sendungen auf zehn: am Limit ist Vollstaendigkeit nicht belegt.
function versandbelege(o, bis) {
  const versand = o.displayFulfillmentStatus === 'FULFILLED';
  const sendungen = Array.isArray(o.fulfillments) ? o.fulfillments : null;
  const aktiv = sendungen?.filter(f => f?.status !== 'CANCELLED');
  const zugestellt = versand && sendungen?.length > 0 && sendungen.length < 10
    && aktiv.length > 0 && aktiv.every(f => f?.status === 'SUCCESS' && f.displayStatus === 'DELIVERED'
      && zeit(f.createdAt) !== null && zeit(f.createdAt) >= zeit(o.createdAt) && zeit(f.createdAt) <= bis);
  return { versand, zugestellt: Boolean(zugestellt) };
}

/**
 * Input: bestehender Export {orders, exportiertAm}. Ausgabe ausschliesslich Aggregate ohne Kennungen.
 * Fehlende Historie und fehlende rabattbereinigte Warenwerte werden niemals zu einem negativen Kaufbeleg.
 */
export function musterwirkung(daten, { jetzt = new Date(), beobachtungTage = 30 } = {}) {
  const nun = new Date(jetzt).getTime();
  if (!Number.isFinite(nun) || !Number.isFinite(beobachtungTage) || beobachtungTage <= 0) throw new Error('Ungueltiger Beobachtungszeitraum');
  let quelle, roh;
  try {
    quelle = typeof daten === 'string' ? JSON.parse(daten) : daten;
    roh = ladeBestellungen(quelle);
  } catch {
    return { verfuegbar: false, fehler: true, hinweis: 'Bestelldaten fehlen oder haben kein lesbares Bestellformat. Bitte den Export erneut prüfen.' };
  }
  // Eine leere, gueltige Liste ist erlaubt; defekte Datensaetze sind kein Nachweis von null Kauefen.
  if (!Array.isArray(roh) || roh.some(o => !o || typeof o !== 'object' || Array.isArray(o)
      || !gesetzt(o.id) || zeit(o.createdAt) === null || !gesetzt(o.displayFinancialStatus)
      || !positionen(o) || positionen(o).some(p => !p || typeof p !== 'object' || Array.isArray(p)))) {
    return { verfuegbar: false, fehler: true, hinweis: 'Der Bestellexport enthält unvollständige Bestell- oder Positionsdaten. Die Musterwirkung kann damit nicht zuverlässig berechnet werden.' };
  }
  const exportZeit = zeit(quelle?.exportiertAm);
  const bis = exportZeit === null ? nun : Math.min(nun, exportZeit);
  const qualitaet = {
    testbestellungen: 0, stornierteBestellungen: 0, vollErstatteteBestellungen: 0,
    doppelteBestellungen: 0, widerspruechlicheBestellungen: 0, fehlendeBestellkennung: 0,
    ungueltigeZeitpunkte: 0, fehlendePositionsdaten: 0, ungueltigeMengen: 0,
    ohneSichereIdentitaet: 0, widerspruechlicheKontaktangaben: 0, mehrdeutigeEmails: 0, mehrdeutigeGastbestellungen: 0,
    unklareRabattwerte: 0, unklareErstattungswerte: 0, unklareWarenzuordnung: 0,
    unbezahlteBestellungen: 0, gemischteBestellungen: 0,
  };
  // Pro Bestellkennung genau ein Stand; gleich alte Widersprueche werden ausgeschlossen.
  const jeId = new Map(), widerspruch = new Set();
  for (const o of roh) {
    if (!gesetzt(o?.id)) { qualitaet.fehlendeBestellkennung++; continue; }
    const alt = jeId.get(o.id);
    if (!alt) { jeId.set(o.id, o); continue; }
    qualitaet.doppelteBestellungen++;
    if (JSON.stringify(alt) === JSON.stringify(o)) continue;
    const a = zeit(alt.updatedAt), b = zeit(o.updatedAt);
    if (a !== null && b !== null && a !== b) { if (b > a) jeId.set(o.id, o); }
    else widerspruch.add(o.id);
  }
  qualitaet.widerspruechlicheBestellungen = widerspruch.size;
  const identitaetsbelege = [...jeId.values()].filter(o => !widerspruch.has(o.id));
  const orders = identitaetsbelege.filter(o => {
    if (istTestbestellung(o)) { qualitaet.testbestellungen++; return false; }
    if (o.cancelledAt) { qualitaet.stornierteBestellungen++; return false; }
    if (o.displayFinancialStatus === 'REFUNDED') { qualitaet.vollErstatteteBestellungen++; return false; }
    return true;
  });
  // Identitaetsbelege gelten auch bei Storno/Erstattung: deren Ausschluss darf eine geteilte Mail nicht eindeutig machen.
  const mailIds = new Map();
  for (const o of identitaetsbelege) {
    const id = kundeId(o);
    if (id) for (const mail of kundeMails(o)) { if (!mailIds.has(mail)) mailIds.set(mail, new Set()); mailIds.get(mail).add(id); }
  }
  qualitaet.mehrdeutigeEmails = [...mailIds.values()].filter(ids => ids.size > 1).length;
  const kunden = new Map();
  for (const o of orders) {
    const id = kundeId(o), mails = kundeMails(o), mail = mails[0], ids = mailIds.get(mail);
    if (!id && mails.length > 1) { qualitaet.widerspruechlicheKontaktangaben++; qualitaet.ohneSichereIdentitaet++; continue; }
    const mehrdeutig = !id && ids?.size > 1;
    const key = id ? `id:${id}` : mehrdeutig ? null : mail ? (ids?.size === 1 ? `id:${[...ids][0]}` : `mail:${mail}`) : null;
    if (!key) { qualitaet.ohneSichereIdentitaet++; if (mehrdeutig) qualitaet.mehrdeutigeGastbestellungen++; continue; }
    const datum = zeit(o.createdAt);
    if (datum === null || datum > bis) { qualitaet.ungueltigeZeitpunkte++; continue; }
    const alle = positionen(o);
    if (!alle || o.lineItems?.pageInfo?.hasNextPage) { qualitaet.fehlendePositionsdaten++; continue; }
    if (alle.some(p => !p || !Number.isInteger(menge(p)) || menge(p) < 0)) { qualitaet.ungueltigeMengen++; continue; }
    const aktiv = alle.filter(p => menge(p) > 0);
    const muster = aktiv.filter(istMuster), ware = aktiv.filter(istWare);
    const bezahlt = ['PAID', 'PARTIALLY_REFUNDED'].includes(o.displayFinancialStatus);
    if (!bezahlt) { qualitaet.unbezahlteBestellungen++; continue; }
    if (muster.length && ware.length) qualitaet.gemischteBestellungen++;
    let kauf = false, kaufUnklar = false;
    if (ware.length) {
      const fehlenderWert = ware.some(p => geld(p.priceAfterAllDiscountsBeforeTaxesSet) === null);
      const positiveWare = ware.some(p => (geld(p.priceAfterAllDiscountsBeforeTaxesSet) ?? 0) > 0);
      const unklareZuordnung = ware.some(p => !p.variant?.product);
      if (fehlenderWert) qualitaet.unklareRabattwerte++;
      if (unklareZuordnung) qualitaet.unklareWarenzuordnung++;
      if (o.displayFinancialStatus === 'PARTIALLY_REFUNDED') qualitaet.unklareErstattungswerte++;
      const gesamt = geld(o.currentTotalPriceSet ?? o.totalPriceSet);
      kauf = o.displayFinancialStatus === 'PAID' && positiveWare && gesamt !== null && gesamt > 0 && !unklareZuordnung;
      kaufUnklar = !kauf && (fehlenderWert || unklareZuordnung || o.displayFinancialStatus === 'PARTIALLY_REFUNDED' || gesamt === null);
    }
    if (!kunden.has(key)) kunden.set(key, []);
    kunden.get(key).push({ ...versandbelege(o, bis), datum, muster: muster.length > 0, stuecke: muster.reduce((n, p) => n + menge(p), 0), kauf, kaufUnklar });
  }
  const zahlen = {
    musterkunden: 0, musterkundenMitVersandbuchung: 0, musterkundenOhneVersandbuchung: 0, musterkundenMitZustellnachweis: 0, musterbestellungen: 0, musterstuecke: 0, musterkundenMitWarenkauf: 0,
    warenkaeuferOhneBeobachtetesMuster: 0, wiederholungsmusterkunden: 0, weitereMusterbestellungen: 0,
    nochJungeMusterkunden: 0, ausgereifteMusterkundenOhneBeobachtetenKauf: 0,
    musterkundenMitUnklaremWarenkauf: 0, beobachtungsdauerUnklar: 0, musterkundenMitLueckenhafterHistorie: 0,
    musterkundenMitVorherigemWarenkauf: 0, kaufabstandMedianTage: null,
  };
  const abstaende = [];
  for (const eintraege of kunden.values()) {
    eintraege.sort((a, b) => a.datum - b.datum);
    const muster = eintraege.filter(e => e.muster), kaeufer = eintraege.filter(e => e.kauf);
    if (kaeufer.length && !muster.some(e => e.datum <= kaeufer[0].datum)) zahlen.warenkaeuferOhneBeobachtetesMuster++;
    if (!muster.length) continue;
    zahlen.musterkunden++;
    if (muster.some(e => e.versand)) zahlen.musterkundenMitVersandbuchung++;
    else zahlen.musterkundenOhneVersandbuchung++;
    if (muster.some(e => e.zugestellt)) zahlen.musterkundenMitZustellnachweis++;
    zahlen.musterbestellungen += muster.length;
    zahlen.musterstuecke += muster.reduce((n, e) => n + e.stuecke, 0);
    if (muster.length > 1) { zahlen.wiederholungsmusterkunden++; zahlen.weitereMusterbestellungen += muster.length - 1; }
    const erst = muster[0].datum;
    if (kaeufer.some(e => e.datum < erst)) zahlen.musterkundenMitVorherigemWarenkauf++;
    const folge = kaeufer.find(e => e.datum > erst);
    if (folge) { zahlen.musterkundenMitWarenkauf++; abstaende.push((folge.datum - erst) / TAG); }
    else if (eintraege.some(e => e.kaufUnklar && e.datum > erst)) zahlen.musterkundenMitUnklaremWarenkauf++;
    else if (exportZeit === null) zahlen.beobachtungsdauerUnklar++;
    // Alte offene Auftraege koennen ueber das Fenster hinausragen; abgeschlossene Zwischenkaeufe fehlen dann moeglicherweise.
    else if (erst < bis - 90 * TAG) zahlen.musterkundenMitLueckenhafterHistorie++;
    else if ((bis - erst) / TAG < beobachtungTage) zahlen.nochJungeMusterkunden++;
    else zahlen.ausgereifteMusterkundenOhneBeobachtetenKauf++;
  }
  zahlen.kaufabstandMedianTage = median(abstaende);
  return {
    verfuegbar: true, erstellt: new Date(nun).toISOString(), zahlen, qualitaet,
    abdeckung: { typ: 'betriebsfenster', vollarchiv: false, exportiertAm: exportZeit === null ? null : new Date(exportZeit).toISOString(),
      beobachtungTage, bestellungenImExport: roh.length, beruecksichtigteKunden: kunden.size,
      hinweise: ['Betriebsbestand: letzte 90 Tage und ältere offene Versand-/Zahlungsfälle; kein vollständiges Bestellarchiv.',
        'Ohne beobachtetes Muster bedeutet nicht: hat noch nie Muster bestellt.',
        'Musterbestellungen vor dem 90-Tage-Fenster belegen keine lückenlos beobachtete Zwischenzeit. Ohne späteren Kaufbeleg stehen diese Fälle gesondert.',
        ...(exportZeit === null ? ['Exportzeitpunkt fehlt; Beobachtungsdauer bleibt unbekannt.'] : [])] },
    hinweise: ['Die Produktübereinstimmung zwischen Muster und späterem Warenkauf wurde nicht geprüft.',
      'Versandbuchung bedeutet vollständig als erfüllt gebuchten Auftrag, keinen physischen Empfang. Zustellnachweise benötigen vollständige erfolgreiche Sendungen mit DELIVERED; fehlende Belege bedeuten nicht sicher: unversandt oder nie erhalten.',
      'Beobachtete zeitliche Abfolge, kein Beweis, dass Muster den Kauf verursacht haben.',
      'Nur bezahlte, nicht stornierte Bestellungen; bestätigte Warenkäufe benötigen einen positiven Betrag nach allen Rabatten.',
      'Gemischte Muster-/Warenbestellungen sind kein späterer Kauf; gleiche Zeitpunkte werden nicht künstlich geordnet.',
      'Junge Musterkunden sind kein Misserfolg. Die Altersgrenze ist kein Nachweis vollständiger Beobachtung; fehlender Kauf heißt nur: im Export nicht belegt.',
      'Musteranzahl ist bestellte verbleibende Menge, kein Nachweis von Versand, Arbeitszeit oder Kosten. Kosten und Margen fehlen; keine Rentabilitätsrechnung.'],
  };
}
