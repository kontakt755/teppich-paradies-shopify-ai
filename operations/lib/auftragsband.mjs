/**
 * Auftragsband (Phase 3b): ein Auftrag gross auf dem Schirm statt einer Tabelle.
 *
 * Reine Aufbereitung. Grosshaendler-ID, Umrechnung, Route, Ampel und Status
 * kommen ausschliesslich aus lib/bestelluebersicht.mjs (das seinerseits
 * resolve/umrechnung/route/einkauf/ampel/status benutzt). Hier steht keine
 * zweite Implementierung davon.
 *
 * Fehlendes heisst UNGEKLAERT und wird nie geraten.
 */

import { aufbereiten, adminLink } from './bestelluebersicht.mjs';
import { UNGEKLAERT } from './umrechnung.mjs';
import { AUFTRAG_STATUS } from './status.mjs';
import { routeFor } from './route.mjs';

/** Reihenfolge der Stationen im Statusband. */
export const BAND_STATIONEN = Object.freeze(['Bestellung', 'Pruefung', 'Beratung', 'Einkauf', 'Wareneingang', 'Versand', 'abgeschlossen']);

/** Rang eines Status auf dem Band. Hoeherer Rang = weiter vorne im Ablauf. */
const RANG = Object.freeze({
  NEU: 1,
  PRUEFUNG: 1,
  BERATUNG_OFFEN: 1,
  MASS_PRUEFUNG_OFFEN: 1,
  SPAETER: 1,
  PROBLEM: 1,
  FREIGEGEBEN: 2,
  EINKAUF: 3,
  WARENEINGANG: 4,
  VERSAND: 5,
  ABGESCHLOSSEN: 6,
});

const OFFEN_ENDE = new Set([AUFTRAG_STATUS.ABGESCHLOSSEN]);

function leer(wert) {
  return wert === null || wert === undefined || String(wert).trim() === '';
}

function oderUngeklaert(wert) {
  return leer(wert) ? UNGEKLAERT : String(wert).trim();
}

/** Der wirksame Status: lokaler Zustandseintrag schlaegt die Ableitung. */
export function effektiverStatus(auftrag, staende) {
  const e = staende instanceof Map ? staende.get(auftrag.name) : staende?.[auftrag.name];
  return e?.status || auftrag.status;
}

/**
 * Offene Auftraege in Bearbeitungsreihenfolge.
 * PROBLEM zuletzt, SPAETER nach hinten, sonst aelteste zuerst.
 *
 * @param {object} daten   {orders:[...], quellvarianten?:[...]} oder Array von Orders
 * @param {Map|object} [staende]  Ergebnis von state/speicher alleStaende()
 * @param {object} [opt]
 * @param {string} [opt.rolle]  Stufe 1 filtert die Warteschlange nicht, die
 *   Rolle steuert nur die Endpunkte (server.mjs). Feld bleibt fuer D11.
 */
export function warteschlange(daten, staende = new Map(), { rolle = null } = {}) {
  const modell = aufbereiten(daten);
  const offen = modell.auftraege.filter(a => a.offen);
  const bewertet = offen.map(a => {
    const status = effektiverStatus(a, staende);
    return { ...a, status, rolle: rolle || null };
  }).filter(a => !OFFEN_ENDE.has(a.status));

  const gewicht = s => (s === AUFTRAG_STATUS.PROBLEM ? 2 : s === AUFTRAG_STATUS.SPAETER ? 1 : 0);
  return bewertet.sort((a, b) => {
    const g = gewicht(a.status) - gewicht(b.status);
    if (g !== 0) return g;
    const da = Date.parse(a.datum) || 0;
    const db = Date.parse(b.datum) || 0;
    if (da !== db) return da - db;
    return String(a.name).localeCompare(String(b.name));
  });
}

/** Kundenblock. Was die Order-Abfrage nicht liefert, bleibt UNGEKLAERT. */
export function kundenblock(order) {
  const k = order?.customer || {};
  const liefer = order?.shippingAddress || null;
  const rechnung = order?.billingAddress || null;
  const name = [k.firstName, k.lastName].filter(Boolean).join(' ').trim()
    || liefer?.name || order?.customerName || '';
  return {
    name: oderUngeklaert(name),
    telefon: oderUngeklaert(k.phone || order?.phone || liefer?.phone),
    email: oderUngeklaert(k.email || order?.email),
    lieferadresse: adresse(liefer),
    rechnungsadresse: adresse(rechnung),
  };
}

function adresse(a) {
  if (!a) return { text: UNGEKLAERT, zeilen: [] };
  const zeilen = [a.name, a.company, a.address1, a.address2, [a.zip, a.city].filter(Boolean).join(' '), a.country || a.countryCodeV2]
    .map(z => (leer(z) ? null : String(z).trim())).filter(Boolean);
  return zeilen.length ? { text: zeilen.join('\n'), zeilen } : { text: UNGEKLAERT, zeilen: [] };
}

/**
 * Statusband: sieben Stationen mit gruen/gelb/rot/grau.
 * gruen = erledigt, gelb = jetzt dran, rot = blockiert, grau = noch nicht.
 */
export function statusband(auftrag, status) {
  const rang = RANG[status] ?? 1;
  const problem = status === AUFTRAG_STATUS.PROBLEM;
  const beratungGewuenscht = auftrag.checks?.beratung === 'Ja';
  const massProblem = auftrag.checks?.masspruefung === 'Problem';

  const farbe = (station, eigenerRang) => {
    if (station === 'Bestellung') return 'gruen';
    if (station === 'Beratung' && !beratungGewuenscht) return rang > 1 ? 'gruen' : 'grau';
    if (rang > eigenerRang) return 'gruen';
    if (rang < eigenerRang) return 'grau';
    if (problem) return 'rot';
    if (station === 'Pruefung' && (massProblem || auftrag.ampel === 'rot')) return 'rot';
    return 'gelb';
  };

  return [
    { station: 'Bestellung', farbe: 'gruen' },
    { station: 'Pruefung', farbe: farbe('Pruefung', 1) },
    { station: 'Beratung', farbe: farbe('Beratung', 1) },
    { station: 'Einkauf', farbe: farbe('Einkauf', 3) },
    { station: 'Wareneingang', farbe: farbe('Wareneingang', 4) },
    { station: 'Versand', farbe: farbe('Versand', 5) },
    { station: 'abgeschlossen', farbe: farbe('abgeschlossen', 6) },
  ];
}

function bildZu(order, lineItemId) {
  const zeilen = order?.lineItems?.nodes ?? order?.lineItems ?? [];
  const li = (Array.isArray(zeilen) ? zeilen : []).find(z => z?.id === lineItemId);
  return li?.variant?.image?.url || li?.image?.url || li?.variant?.product?.featuredImage?.url || null;
}

function routeAnzeige(pos) {
  try {
    const r = routeFor({ item: { einkauf: pos.einkauf } });
    return { route: r.route, quelle: r.quelle, hinweise: r.hinweise };
  } catch (err) {
    return { route: UNGEKLAERT, quelle: UNGEKLAERT, hinweise: [err.message] };
  }
}

/**
 * Genau EIN Auftrag als reines Datenobjekt fuer die Oberflaeche.
 *
 * @param {object} order  rohe Order (Form wie ORDERS_QUERY in sync/orders.mjs)
 * @param {object} [opt]
 * @param {Map|object} [opt.staende]
 * @param {Array} [opt.quellvarianten]
 */
export function auftragskarte(order, { staende = new Map(), quellvarianten = [] } = {}) {
  if (!order) throw new Error('auftragskarte: order fehlt');
  const modell = aufbereiten({ orders: [order], quellvarianten });
  const a = modell.auftraege[0];
  if (!a) throw new Error('auftragskarte: Bestellung liess sich nicht aufbereiten');
  const status = effektiverStatus(a, staende);
  const eintrag = staende instanceof Map ? staende.get(a.name) : staende?.[a.name];

  const positionen = a.positionen.map(p => ({
    lineItemId: p.lineItemId,
    titel: p.titel,
    farbe: p.farbe,
    farbnummer: oderUngeklaert(p.einkauf?.farbnummer === UNGEKLAERT ? null : p.einkauf?.farbnummer),
    sku: p.sku,
    bild: bildZu(order, p.lineItemId),
    grosshaendlerId: p.grosshaendlerId,
    grosshaendlerIdQuelle: p.grosshaendlerIdQuelle,
    idGrund: p.idGrund,
    lieferant: p.lieferant,
    menge: p.menge,
    kundenmenge: p.kundenmenge,
    einkaufsmenge: p.bestellmenge,
    route: routeAnzeige(p),
    ampel: p.grosshaendlerId === UNGEKLAERT ? 'rot' : p.bestellmenge?.menge === UNGEKLAERT && !p.istMuster ? 'gelb' : 'gruen',
    masspruefung: p.masspruefung,
    istMuster: p.istMuster,
    musterId: p.musterQuelle?.quellvariante ?? null,
  }));

  return {
    name: a.name,
    id: a.id,
    adminUrl: a.adminUrl ?? adminLink(a.id),
    datum: a.datum,
    bestellwert: bestellwert(order),
    zahlung: a.bezahlt,
    versandstatus: a.erfuellt,
    offen: a.offen,
    storniert: a.storniert,
    status,
    statusQuelle: eintrag ? 'lokaler Zustandsspeicher' : 'abgeleitet',
    ampel: a.ampel,
    hinweise: a.hinweise,
    checks: a.checks,
    beratung: {
      gewuenscht: a.checks?.beratung ?? UNGEKLAERT,
      telefon: a.checks?.telefon ?? UNGEKLAERT,
      verlegung: a.checks?.verlegung ?? UNGEKLAERT,
    },
    kunde: kundenblock(order),
    statusband: statusband(a, status),
    positionen,
  };
}

function bestellwert(order) {
  const s = order?.totalPriceSet?.shopMoney || order?.currentTotalPriceSet?.shopMoney;
  if (!s || leer(s.amount)) return { betrag: UNGEKLAERT, waehrung: UNGEKLAERT, text: UNGEKLAERT };
  const betrag = Number(s.amount);
  const waehrung = s.currencyCode || 'EUR';
  if (!Number.isFinite(betrag)) return { betrag: UNGEKLAERT, waehrung, text: UNGEKLAERT };
  return { betrag, waehrung, text: `${betrag.toFixed(2).replace('.', ',')} ${waehrung}` };
}

/** Trackingnummern, soweit die Abfrage Fulfillments mitliefert. */
function trackings(order) {
  const f = order?.fulfillments;
  const liste = Array.isArray(f) ? f : Array.isArray(f?.nodes) ? f.nodes : [];
  const nummern = [];
  for (const ff of liste) {
    const t = Array.isArray(ff?.trackingInfo) ? ff.trackingInfo : [];
    for (const ti of t) if (!leer(ti?.number)) nummern.push(String(ti.number));
  }
  return nummern;
}

/**
 * Globale Suche ueber Kundenname, Telefon, E-Mail, Bestellnummer, SKU,
 * Grosshaendler-ID, Farbnummer, Trackingnummer und Muster-ID.
 *
 * @returns {Array<{name:string, treffer:string[], auftrag:object}>}
 */
export function suche(daten, begriff) {
  const q = String(begriff ?? '').trim().toLowerCase();
  if (!q) return [];
  const orders = Array.isArray(daten) ? daten : (daten?.orders ?? []);
  const quellvarianten = Array.isArray(daten) ? [] : (daten?.quellvarianten ?? []);
  const ergebnis = [];

  for (const order of orders) {
    let karte;
    try { karte = auftragskarte(order, { quellvarianten }); } catch { continue; }
    const treffer = [];
    const pruefe = (feldname, wert) => {
      if (leer(wert) || wert === UNGEKLAERT) return;
      if (String(wert).toLowerCase().includes(q)) treffer.push(`${feldname}: ${wert}`);
    };
    pruefe('Bestellnummer', karte.name);
    pruefe('Kunde', karte.kunde.name);
    pruefe('Telefon', karte.kunde.telefon);
    pruefe('E-Mail', karte.kunde.email);
    for (const t of trackings(order)) pruefe('Tracking', t);
    for (const p of karte.positionen) {
      pruefe('SKU', p.sku);
      pruefe('Grosshaendler-ID', p.grosshaendlerId);
      pruefe('Farbnummer', p.farbnummer);
      if (p.istMuster) pruefe('Muster-ID', p.musterId);
    }
    if (treffer.length) ergebnis.push({ name: karte.name, treffer, auftrag: karte });
  }
  return ergebnis;
}
