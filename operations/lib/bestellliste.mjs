/**
 * Vollwertige Bestelluebersicht wie die Shopify-Bestellliste, nur uebersichtlicher -
 * eine Zeile je Bestellung mit allem, was am Telefon gebraucht wird. Baut auf dem
 * vorhandenen Bestellmodell (operations/lib/bestelluebersicht.mjs) auf, keine eigene
 * Shopify-Abfrage.
 *
 * Fehlt ein Feld in orders.json (z. B. Kunden-ID, Kanal, Telefon), zeigt diese Datei
 * "nicht hinterlegt" statt zu raten - siehe operations/sync/orders.mjs (ORDERS_QUERY)
 * fuer die Quelle jedes Feldes.
 */

import { kundenSchluessel } from './kundensuche.mjs';

const NICHT_HINTERLEGT = null;

function wertOderNichtHinterlegt(v) {
  if (v === undefined || v === null || v === '' || v === '–') return NICHT_HINTERLEGT;
  return v;
}

/** Tags nach den bekannten Praefixen gruppiert (BERATUNG-*, TYP-*, TESTBESTELLUNG, sonstige). */
function tagGruppen(tags) {
  const liste = Array.isArray(tags) ? tags : [];
  return {
    beratung: liste.filter(t => /^BERATUNG-/i.test(t)),
    typ: liste.filter(t => /^TYP-/i.test(t)),
    test: liste.some(t => /^TESTBESTELLUNG$/i.test(t)),
    sonstige: liste.filter(t => !/^(BERATUNG-|TYP-)/i.test(t) && !/^TESTBESTELLUNG$/i.test(t)),
  };
}

/** Eine Zeile je Bestellung - flach, fuer Sortierung/Filter/Suche in der Tabelle. */
export function bestellzeile(auftrag) {
  const d = auftrag.details || {};
  const tags = tagGruppen(d.tags);
  const beratungOffen = auftrag.checks?.beratung === 'Ja';
  return {
    orderId: auftrag.id,
    orderName: auftrag.name,
    datum: auftrag.datum,
    kundenname: wertOderNichtHinterlegt(d.kunde?.name),
    email: wertOderNichtHinterlegt(d.kunde?.email),
    telefon: wertOderNichtHinterlegt(d.kunde?.telefon),
    kundenId: wertOderNichtHinterlegt(d.kunde?.kundennummer),
    kundenSchluessel: kundenSchluessel(auftrag),
    gesamtbetrag: d.summen?.gesamt?.betrag ?? null,
    waehrung: d.summen?.gesamt?.waehrung ?? 'EUR',
    zahlungsstatus: wertOderNichtHinterlegt(auftrag.bezahlt),
    fulfillmentstatus: wertOderNichtHinterlegt(auftrag.erfuellt),
    kanal: wertOderNichtHinterlegt(d.kanal),
    zustellmethode: wertOderNichtHinterlegt(d.versandart),
    anzahlArtikel: d.anzahlArtikel ?? (auftrag.positionen || []).length,
    tags: tags,
    testbestellung: !!auftrag.testbestellung,
    storniert: !!auftrag.storniert,
    offen: !!auftrag.offen,
    beratungOffen,
    status: auftrag.status,
    ampel: auftrag.ampel,
    adminUrl: auftrag.adminUrl,
    auftrag,
  };
}

export function bestellliste(modell) {
  const alle = [...(modell?.auftraege ?? []), ...(modell?.testauftraege ?? [])];
  return alle.map(bestellzeile).sort((a, b) => String(b.datum ?? '').localeCompare(String(a.datum ?? '')));
}

const SORTIERBAR = {
  datum: z => z.datum ?? '',
  orderName: z => z.orderName ?? '',
  kundenname: z => (z.kundenname ?? '').toLowerCase(),
  gesamtbetrag: z => z.gesamtbetrag ?? -Infinity,
  zahlungsstatus: z => z.zahlungsstatus ?? '',
  fulfillmentstatus: z => z.fulfillmentstatus ?? '',
  anzahlArtikel: z => z.anzahlArtikel ?? 0,
};

export function sortiere(zeilen, feld, richtung = 'desc') {
  const key = SORTIERBAR[feld] ? feld : 'datum';
  const cmp = SORTIERBAR[key];
  const vorzeichen = richtung === 'asc' ? 1 : -1;
  return [...zeilen].sort((a, b) => {
    const av = cmp(a); const bv = cmp(b);
    if (av < bv) return -1 * vorzeichen;
    if (av > bv) return 1 * vorzeichen;
    return 0;
  });
}

export const FILTERCHIPS = Object.freeze(['offen', 'bezahlt', 'unerfuellt', 'storniert', 'beratung', 'muster', 'test']);

export function wendeFilterAn(zeilen, filter) {
  switch (filter) {
    case 'offen': return zeilen.filter(z => z.offen && !z.testbestellung);
    case 'bezahlt': return zeilen.filter(z => z.zahlungsstatus === 'PAID');
    case 'unerfuellt': return zeilen.filter(z => ['UNFULFILLED', 'PARTIALLY_FULFILLED', null].includes(z.fulfillmentstatus));
    case 'storniert': return zeilen.filter(z => z.storniert);
    case 'beratung': return zeilen.filter(z => z.beratungOffen);
    case 'muster': return zeilen.filter(z => z.tags.typ.some(t => /muster/i.test(t)) || (z.auftrag?.positionen || []).some(p => p.istMuster));
    case 'test': return zeilen.filter(z => z.testbestellung);
    default: return zeilen.filter(z => !z.testbestellung);
  }
}

function feldTreffer(felder, q) {
  return felder.some(f => typeof f === 'string' && f.toLowerCase().includes(q));
}

export function sucheInListe(zeilen, suchtext) {
  const q = String(suchtext ?? '').trim().toLowerCase();
  if (!q) return zeilen;
  return zeilen.filter(z => feldTreffer([
    z.orderName, z.kundenname, z.email, z.telefon, z.kundenId, z.kanal, z.zustellmethode,
    z.zahlungsstatus, z.fulfillmentstatus, ...(z.tags.beratung), ...(z.tags.typ), ...(z.tags.sonstige),
  ], q));
}
