/**
 * Zwei-Wege-Abgleich der Bestellungen zwischen Control Center und Shopify (Inhaber 2026-10-19:
 * "alles in unserem Dashboard immer mit Shopify abgleichen, was Bestellungen angeht - dort
 * synchron arbeiten und abhaken").
 *
 * Konfliktregel: "Versendet" gewinnt in beide Richtungen - wer zuerst erfuellt, gilt. Nichts
 * wird automatisch zurueckgenommen, weder hier noch in Shopify.
 *
 *   Shopify -> Control Center (uebernimmAusShopify): ist eine Position in Shopify vollstaendig
 *     erfuellt, steht sie lokal mindestens auf "raus" - mit Vermerk "aus Shopify uebernommen".
 *     Nie herabstufen, nie "erledigt" anfassen. Stornierte Bestellungen werden lokal erledigt
 *     (keine offene Arbeit mehr). Hat jemand die Position NACH der Erfuellung bzw. Stornierung
 *     von Hand zurueckgesetzt oder wieder geoeffnet, gilt seine Entscheidung.
 *   Control Center -> Shopify: "Erledigt" bucht den Versand ueber operations/lib/versand.mjs
 *     (scripts/dashboard-api.mjs). Was trotzdem auseinanderlaeuft (Altfaelle vor dem 13.10.,
 *     gescheiterte Buchungen), zeigt abweichungen() als Liste mit "In Shopify nachbuchen".
 *
 * Rein, ohne Datei und ohne Shopify: Eingabe sind die Positionen aus auftragsstatus.json und
 * die Bestellungen aus bestelluebersicht/orders.json. Geschrieben wird beim Aufrufer - und nur
 * dort, wo auch alle anderen Schritte geschrieben werden (der Dashboard-Dienst), damit die
 * Ablage genau einen Schreiber hat.
 */

import { STATUS_ORDER, positionKey } from './auftragsstatus.mjs';
import { istTestbestellung } from './testbestellung.mjs';

/** Wer in der Ablage als handelnd steht, wenn der Abgleich eine Position hebt. */
export const ABGLEICH_VON = 'Shopify';
export const UEBERNOMMEN_NOTIZ = 'aus Shopify übernommen';
export const STORNIERT_NOTIZ = 'In Shopify storniert – aus Shopify übernommen';

// Eine Buchung aus dem Control Center steht im Export erst nach dem naechsten Sync-Lauf (alle
// 10 Minuten, der Lauf selbst dauert). So lange gilt ein frischer Vermerk "gebucht" als Beleg.
export const EXPORT_NACHLAUF_MS = 30 * 60_000;

const STUFE_RAUS = STATUS_ORDER.indexOf('raus');
const stufe = s => STATUS_ORDER.indexOf(s ?? '');

function knoten(conn) {
  if (Array.isArray(conn)) return conn;
  if (Array.isArray(conn?.nodes)) return conn.nodes;
  if (Array.isArray(conn?.edges)) return conn.edges.map(e => e?.node).filter(Boolean);
  return [];
}

const zahl = v => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Stand jeder Position laut Shopify-Export.
 * - erfuellt: bestellt (aktuelle Menge) > 0 und nichts mehr offen
 * - offen:    bestellt > 0 und noch etwas offen
 * Fehlt eine Menge (alter Export), ist beides false - dann wird nichts entschieden.
 * Eine aus der Bestellung entfernte Zeile (aktuelle Menge 0) ist weder erfuellt noch offen,
 * sondern `entfernt` (bestellt war mehr als 0).
 */
export function shopifyPositionen(orders = []) {
  const stand = new Map();
  for (const o of orders || []) {
    if (!o?.id) continue;
    const erfuelltAm = knoten(o.fulfillments)
      .filter(f => !/CANCEL|FAIL|ERROR/i.test(String(f?.status ?? '')))
      .map(f => f?.createdAt).filter(Boolean).sort().at(-1) || null;
    const test = istTestbestellung(o);
    for (const li of knoten(o.lineItems)) {
      if (!li?.id) continue;
      const bestellt = zahl(li.currentQuantity ?? li.quantity);
      const offenMenge = zahl(li.unfulfilledQuantity);
      const bekannt = bestellt !== null && offenMenge !== null && bestellt > 0;
      stand.set(positionKey(o.id, li.id), {
        orderId: o.id,
        orderName: o.name || null,
        lineItemId: li.id,
        storniert: Boolean(o.cancelledAt),
        storniertAm: o.cancelledAt || null,
        test,
        erfuellt: bekannt && offenMenge === 0,
        offen: bekannt && offenMenge > 0,
        entfernt: li.currentQuantity !== undefined && li.currentQuantity !== null && bestellt === 0 && zahl(li.quantity) > 0,
        erfuelltAm,
      });
    }
  }
  return stand;
}

/** Spaetester Zeitpunkt, zu dem jemand die Position von Hand zurueckgenommen hat. */
function letzteRuecknahme(e) {
  return [e?.zurueckGesetztAm, e?.wiederGeoeffnetAm].filter(Boolean).sort().at(-1) || null;
}

/**
 * Hat ein Mensch nach dem Shopify-Ereignis zurueckgesetzt? Dann gilt seine Entscheidung - sonst
 * hoebe jeder Sync-Lauf die Position wieder an. Ohne Zeitpunkt aus Shopify zaehlt jede Ruecknahme.
 */
function vonHandZurueck(e, shopifyAm) {
  const zurueck = letzteRuecknahme(e);
  return Boolean(zurueck) && (!shopifyAm || zurueck >= shopifyAm);
}

/**
 * Shopify -> Control Center. Gibt eine neue Positionsliste zurueck (die Eingabe bleibt
 * unveraendert) und was sich geaendert hat. Idempotent: ein zweiter Lauf mit demselben Export
 * aendert nichts.
 *
 * @param {object} positionen  "orderId::lineItemId" -> Eintrag (auftragsstatus.mjs leseAlle)
 * @param {object[]} orders    Bestellungen aus orders.json
 * @param {object} [o]
 * @param {Date}   [o.jetzt]
 * @returns {{ positionen: object, gehoben: object[], storniert: object[], vermerkt: object[] }}
 *   gehoben:   lokal auf "raus" gehoben (war offen, bestellt oder geliefert)
 *   storniert: lokal erledigt, weil die Bestellung in Shopify storniert ist
 *   vermerkt:  stand schon auf raus/erledigt; der Versandvermerk sagt jetzt "in Shopify versendet"
 */
export function uebernimmAusShopify(positionen = {}, orders = [], { jetzt = new Date() } = {}) {
  const zeit = jetzt.toISOString();
  const neu = { ...positionen };
  const gehoben = [];
  const storniert = [];
  const vermerkt = [];
  const bezug = (s, e) => ({ orderId: s.orderId, orderName: s.orderName, lineItemId: s.lineItemId, vonStatus: e?.status || null });

  for (const [key, s] of shopifyPositionen(orders)) {
    const e = positionen[key];

    if (s.storniert) {
      // Nur Positionen, an denen schon gearbeitet wurde: ohne Stand ist eine stornierte
      // Bestellung ohnehin keine offene Arbeit (bestelluebersicht.istOffen).
      if (!e?.status || e.status === 'erledigt' || vonHandZurueck(e, s.storniertAm)) continue;
      neu[key] = {
        ...e,
        status: 'erledigt',
        aktualisiertAm: zeit,
        aktualisiertVon: ABGLEICH_VON,
        erledigtAm: zeit,
        erledigtVon: ABGLEICH_VON,
        erledigtNotiz: STORNIERT_NOTIZ,
        ausShopify: { am: zeit, grund: 'storniert', vonStatus: e.status, shopifyAm: s.storniertAm },
      };
      storniert.push(bezug(s, e));
      continue;
    }

    if (!s.erfuellt) continue;
    const vermerk = { status: 'bereits', grund: 'aus-shopify', meldung: 'In Shopify als versendet gebucht.', am: zeit, fulfillmentId: null, kundeBenachrichtigt: null };

    if (stufe(e?.status) < STUFE_RAUS) {
      if (vonHandZurueck(e, s.erfuelltAm)) continue;
      // Zeitpunkt des Versands: wann Shopify erfuellt hat (spaeteste Sendung der Bestellung),
      // nie in der Zukunft; sonst der Zeitpunkt der Uebernahme.
      const am = s.erfuelltAm && s.erfuelltAm <= zeit ? s.erfuelltAm : zeit;
      neu[key] = {
        ...(e || {}),
        orderId: String(s.orderId),
        lineItemId: String(s.lineItemId),
        status: 'raus',
        aktualisiertAm: zeit,
        aktualisiertVon: ABGLEICH_VON,
        rausAm: am,
        rausVon: ABGLEICH_VON,
        rausNotiz: UEBERNOMMEN_NOTIZ,
        shopifyVersand: vermerk,
        ausShopify: { am: zeit, grund: 'erfuellt', vonStatus: e?.status || null, shopifyAm: s.erfuelltAm },
      };
      gehoben.push(bezug(s, e));
      continue;
    }

    // Schon raus oder erledigt: Schritt bleibt. Nur ein Vermerk "nicht gebucht", "unklar",
    // "ausstehend" oder gar keiner (vor dem 13.10.) wird richtiggestellt - Shopify hat versendet.
    if (!['gebucht', 'bereits', 'uebersprungen'].includes(e.shopifyVersand?.status)) {
      neu[key] = { ...e, shopifyVersand: vermerk };
      vermerkt.push(bezug(s, e));
    }
  }
  return { positionen: neu, gehoben, storniert, vermerkt };
}

/**
 * Control Center -> Shopify: Positionen, die im Dashboard abgehakt sind (raus/erledigt), in
 * Shopify aber noch offen - je Bestellung eine Zeile. Nicht dabei: stornierte Bestellungen,
 * Testbestellungen, Positionen mit Vermerk "uebersprungen" (endgueltig) und frische Buchungen,
 * die der Export noch nicht kennen kann (EXPORT_NACHLAUF_MS).
 *
 * @param {object} positionen
 * @param {object[]} orders
 * @param {object} [o]
 * @param {string|null} [o.exportiertAm]  Zeitpunkt des Exports (orders.json)
 * @returns {{ orderId, orderName, kunde, lineItemIds: string[], positionen: object[], seit: string|null }[]}
 *   aelteste zuerst
 */
export function abweichungen(positionen = {}, orders = [], { exportiertAm = null } = {}) {
  const grenze = exportiertAm ? new Date(Date.parse(exportiertAm) - EXPORT_NACHLAUF_MS).toISOString() : null;
  const jeAuftrag = new Map();
  const kopf = new Map((orders || []).filter(o => o?.id).map(o => [o.id, o]));
  for (const [key, s] of shopifyPositionen(orders)) {
    const e = positionen[key];
    if (!s.offen || s.storniert || s.test) continue;
    if (stufe(e?.status) < STUFE_RAUS) continue;
    const v = e.shopifyVersand;
    if (v?.status === 'uebersprungen') continue;
    // Gerade erst gebucht: der Export ist aelter als die Buchung (oder knapp davor gelaufen).
    if (['gebucht', 'bereits'].includes(v?.status) && (!grenze || String(v.am || '') > grenze)) continue;
    if (!jeAuftrag.has(s.orderId)) {
      const o = kopf.get(s.orderId);
      jeAuftrag.set(s.orderId, { orderId: s.orderId, orderName: s.orderName, kunde: o?.shippingAddress?.name || o?.customer?.displayName || null, lineItemIds: [], positionen: [], seit: null });
    }
    const z = jeAuftrag.get(s.orderId);
    const am = e[`${e.status}Am`] || e.aktualisiertAm || null;
    z.lineItemIds.push(s.lineItemId);
    z.positionen.push({ lineItemId: s.lineItemId, status: e.status, am, versand: v?.status || null });
    if (am && (!z.seit || am < z.seit)) z.seit = am;
  }
  return [...jeAuftrag.values()].sort((a, b) => String(a.seit || '').localeCompare(String(b.seit || '')));
}

/**
 * Aus der Kundenbestellung entfernt, beim Lieferanten aber bestellt (Fehlersuche 28.10.2026,
 * #1056: drei Positionen nach dem Vermerk "bestellt" aus der Bestellung genommen, Menge 0 -
 * im Dashboard still, weil Positionen mit Menge 0 ueberall herausfallen). Kommt die Ware, braucht
 * sie kein Kunde: die Lieferantenbestellung stornieren. Je Bestellung eine Zeile, aelteste
 * zuerst; nicht dabei: stornierte Bestellungen (die erledigt uebernimmAusShopify) und Tests.
 *
 * @returns {{ orderId, orderName, kunde, lineItemIds: string[], positionen: object[], seit: string|null }[]}
 */
export function entfernteBestellt(positionen = {}, orders = []) {
  const jeAuftrag = new Map();
  const kopf = new Map((orders || []).filter(o => o?.id).map(o => [o.id, o]));
  for (const [key, s] of shopifyPositionen(orders)) {
    const e = positionen[key];
    if (!s.entfernt || s.storniert || s.test || e?.status !== 'bestellt') continue;
    if (!jeAuftrag.has(s.orderId)) {
      const o = kopf.get(s.orderId);
      jeAuftrag.set(s.orderId, { orderId: s.orderId, orderName: s.orderName, kunde: o?.shippingAddress?.name || o?.customer?.displayName || null, lineItemIds: [], positionen: [], seit: null });
    }
    const z = jeAuftrag.get(s.orderId);
    const am = e.bestelltAm || e.aktualisiertAm || null;
    z.lineItemIds.push(s.lineItemId);
    z.positionen.push({ lineItemId: s.lineItemId, bestelltAm: am, lieferantBestellnummer: e.lieferantBestellnummer || null });
    if (am && (!z.seit || am < z.seit)) z.seit = am;
  }
  return [...jeAuftrag.values()].sort((a, b) => String(a.seit || '').localeCompare(String(b.seit || '')));
}
