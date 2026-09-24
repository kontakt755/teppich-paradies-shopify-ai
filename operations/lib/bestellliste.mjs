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
import { positionKey, STATUS_ORDER, STATUS_LABEL } from './auftragsstatus.mjs';

const NICHT_HINTERLEGT = null;

/**
 * Fortschritt einer Bestellung aus dem Auftragsfluss-Status ihrer Positionen
 * (operations/lib/auftragsstatus.mjs) - der SCHWAECHSTE Schritt aller
 * Positionen bestimmt den Gesamtstatus. Eine einzige nicht bestellte Position
 * haelt die ganze Bestellung auf "offen" bzw. auf der niedrigsten Stufe.
 *
 * Stufen: 0 = noch nichts, 1..4 = STATUS_ORDER (bestellt..erledigt).
 */
export function fortschritt(auftrag, statusAlle = {}) {
  const alle = auftrag?.positionen ?? [];
  const positionen = alle.filter(p => p.lineItemId);
  const gesamt = positionen.length;
  if (!gesamt) {
    // Positionen ohne lineItemId lassen sich nicht nachverfolgen. Sie einfach
    // als "fertig" durchzuwinken versteckte Bestellungen vor dem Filter
    // "In Arbeit" - deshalb hier ehrlich als unklar melden.
    if (alle.length) {
      return { stufe: 'unklar', text: `Nicht nachverfolgbar (${alle.length} Position(en) ohne Kennung)`, erledigt: 0, gesamt: 0, minStufe: 0, unklar: true };
    }
    return { stufe: 'keine', text: 'Keine Positionen', erledigt: 0, gesamt: 0, minStufe: 0 };
  }

  const stufen = positionen.map(p => {
    const key = positionKey(auftrag.id, p.lineItemId);
    const eintrag = key ? statusAlle[key] : null;
    const i = eintrag ? STATUS_ORDER.indexOf(eintrag.status) : -1;
    return i >= 0 ? i + 1 : 0;
  });
  const erledigt = stufen.filter(s => s === 4).length;
  const minStufe = Math.min(...stufen);

  let stufe, text;
  if (minStufe === 4) { stufe = 'erledigt'; text = 'Erledigt'; }
  else if (minStufe === 0) { stufe = 'offen'; text = erledigt === 0 ? 'Offen' : `Teilweise bestellt (${erledigt} von ${gesamt} erledigt)`; }
  else { stufe = STATUS_ORDER[minStufe - 1]; text = `${STATUS_LABEL[stufe]} (${erledigt} von ${gesamt} erledigt)`; }
  return { stufe, text, erledigt, gesamt, minStufe };
}

/** "fertig" heisst: alle Positionen erledigt (oder gar keine Positionen mit Auftragsfluss). */
export function istFertig(auftrag, statusAlle = {}) {
  const f = fortschritt(auftrag, statusAlle);
  if (f.unklar) return false;
  return f.stufe === 'erledigt' || f.gesamt === 0;
}

/** Was fehlt noch - Klartext-Liste zum Abarbeiten, leer = nichts offen. */
export function wasFehlt(auftrag, rueckrufStatus) {
  const gruende = [];
  const c = auftrag?.checks || {};
  const ohneId = (auftrag?.positionen ?? []).filter(p => p.grosshaendlerId === 'UNGEKLAERT' || p.idGrund).length;
  const massProbleme = (auftrag?.positionen ?? []).filter(p => ['abweichung', 'unlesbar', 'waise'].includes(p.masspruefung?.status)).length;
  if (c.beratung === 'Ja' && c.telefon === 'fehlt') gruende.push('Telefon fehlt trotz Beratung');
  else if (c.beratung === 'Ja' && rueckrufStatus && rueckrufStatus !== 'erledigt') gruende.push('Rückruf offen');
  if (massProbleme) gruende.push(`Maßprüfung offen (${massProbleme})`);
  if (ohneId) gruende.push(`${ohneId} Position${ohneId === 1 ? '' : 'en'} ohne Großhändler-ID`);
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(String(auftrag.bezahlt))) gruende.push('Noch nicht bezahlt');
  if (auftrag.offen && String(auftrag.erfuellt).toUpperCase() === 'UNFULFILLED') gruende.push('Noch nicht versendet');
  return gruende;
}

/**
 * Fortschritt ueber ALLE (echten) Bestellungen eines Kunden - fuer die
 * Kundenansicht ("wo steht dieser Kunde" auf einen Blick). Testbestellungen
 * zaehlen nicht mit.
 */
export function kundenFortschritt(auftraege, statusAlle = {}) {
  const echte = (auftraege || []).filter(a => !a.testbestellung);
  if (!echte.length) return { text: 'Keine Bestellungen', fertig: true, offene: 0, gesamt: 0 };
  const einzeln = echte.map(a => fortschritt(a, statusAlle));
  const offene = einzeln.filter(f => f.stufe !== 'erledigt' && f.gesamt > 0).length;
  const fertig = offene === 0;
  return {
    text: fertig ? 'Alle Bestellungen erledigt' : `${offene} von ${echte.length} Bestellung${echte.length === 1 ? '' : 'en'} offen`,
    fertig, offene, gesamt: echte.length,
  };
}

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
export function bestellzeile(auftrag, { statusAlle = {}, rueckrufeAlle = {} } = {}) {
  const d = auftrag.details || {};
  const tags = tagGruppen(d.tags);
  const beratungOffen = auftrag.checks?.beratung === 'Ja';
  const f = fortschritt(auftrag, statusAlle);
  const rueckruf = rueckrufeAlle[auftrag.id];
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
    fortschritt: f,
    fertig: f.stufe === 'erledigt' || f.gesamt === 0,
    wasFehlt: wasFehlt(auftrag, rueckruf?.status),
    auftrag,
  };
}

/**
 * @param {object} modell        Rueckgabe von bestelluebersicht.aufbereiten()
 * @param {object} [opts]
 * @param {object} [opts.statusAlle]     Auftragsfluss je "orderId::lineItemId" (auftragsstatus.mjs)
 * @param {object} [opts.rueckrufeAlle]  Rueckruf-Status je orderId (rueckrufe.mjs)
 */
export function bestellliste(modell, { statusAlle = {}, rueckrufeAlle = {} } = {}) {
  const alle = [...(modell?.auftraege ?? []), ...(modell?.testauftraege ?? [])];
  return alle.map(a => bestellzeile(a, { statusAlle, rueckrufeAlle })).sort((a, b) => String(b.datum ?? '').localeCompare(String(a.datum ?? '')));
}

const SORTIERBAR = {
  datum: z => z.datum ?? '',
  orderName: z => z.orderName ?? '',
  kundenname: z => (z.kundenname ?? '').toLowerCase(),
  gesamtbetrag: z => z.gesamtbetrag ?? -Infinity,
  zahlungsstatus: z => z.zahlungsstatus ?? '',
  fulfillmentstatus: z => z.fulfillmentstatus ?? '',
  anzahlArtikel: z => z.anzahlArtikel ?? 0,
  fortschritt: z => z.fortschritt?.minStufe ?? 0,
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

// "nicht_fertig" steht an erster Stelle: Voreinstellung der Tabelle ist "nicht
// fertige zuerst" (Inhabervorgabe) - ohne Auswahl gilt trotzdem weiterhin
// "alles ausser Testbestellungen" (siehe default-Zweig unten).
export const FILTERCHIPS = Object.freeze(['nicht_fertig', 'fertig', 'offen', 'bezahlt', 'unerfuellt', 'storniert', 'beratung', 'muster', 'test']);

export function wendeFilterAn(zeilen, filter) {
  switch (filter) {
    case 'nicht_fertig': return zeilen.filter(z => !z.fertig && !z.testbestellung);
    case 'fertig': return zeilen.filter(z => z.fertig && !z.testbestellung);
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
