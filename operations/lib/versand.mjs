/**
 * Versand in Shopify buchen, wenn im Control Center Positionen auf "An Kunden raus"
 * gesetzt werden (Inhaber 2026-10-13, Werkbank w-079): Shopify bucht die Erfuellung
 * (fulfillmentCreate) und schickt dem Kunden die Versandmail.
 *
 * Gebucht werden nur die Positionen, die in diesem Schritt raus sind (Teillieferung),
 * je Position die volle in Shopify noch offene Menge. Feste Reihenfolge:
 *   1. Bestellung frisch lesen (Fulfillment Orders). Nie dem Browser glauben, was offen ist.
 *   2. Je Position einordnen: offen und buchbar, schon erfuellt, zurueckgehalten, nicht buchbar.
 *      Ist nichts mehr offen, wird nichts geschrieben ("bereits") - ein zweiter Klick bucht
 *      deshalb nie doppelt; der Aufrufer reiht Buchungen derselben Bestellung hintereinander.
 *   3. Zurueckhaltung "Bestand fehlt" (INVENTORY_OUT_OF_STOCK) setzt Shopify selbst, wenn ein
 *      Artikel online keinen Bestand hat - bei Mustern der Normalfall. Ist die Ware raus, ist
 *      der Grund hinfaellig: genau diese Zurueckhaltungen werden aufgehoben (nach ID). Andere
 *      Gruende (Zahlung, Betrugsverdacht, Adresse, von Hand) bleiben unangetastet.
 *   4. Eine Buchung je Standort (Shopify verlangt das), mit notifyCustomer und Sendungsnummer.
 *   5. Antwortverlust: kommt keine Antwort, entscheidet erneutes Lesen (jetzt erfuellt =
 *      gebucht, unveraendert = nicht angekommen, sonst unklar) - nie "nichts gebucht" auf
 *      Verdacht.
 *   6. Gegenprobe: erneut lesen. userErrors: [] allein ist kein Beleg.
 * Protokoll und Ablage schreibt der Aufrufer (scripts/dashboard-api.mjs).
 */

import { positionKey } from './auftragsstatus.mjs';

export const STAND_QUERY = `
query VersandStand($id: ID!) {
  order(id: $id) {
    id name test cancelledAt displayFulfillmentStatus
    fulfillmentOrders(first: 20) {
      nodes {
        id status
        assignedLocation { location { id } }
        supportedActions { action }
        fulfillmentHolds { id reason displayReason }
        lineItems(first: 100) { nodes { id remainingQuantity totalQuantity lineItem { id } } }
      }
    }
  }
}`;

export const BUCHEN_MUTATION = `
mutation VersandBuchen($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id status trackingInfo { number company url } }
    userErrors { field message }
  }
}`;

export const FREIGEBEN_MUTATION = `
mutation VersandFreigeben($id: ID!, $holdIds: [ID!]) {
  fulfillmentOrderReleaseHold(id: $id, holdIds: $holdIds) {
    fulfillmentOrder { id status }
    userErrors { field message code }
  }
}`;

/** Schreibrechte fuer die Buchung (gleiche Namen wie in sync/zugang.mjs, SCHREIB_BEREICHE). */
export const VERSAND_BEREICHE = Object.freeze(['write_fulfillments', 'write_merchant_managed_fulfillment_orders']);

/** Versanddienste fuer die Sendungsnummer - Namen so, wie Shopify sie kennt (dann baut Shopify den Verfolgungslink). */
export const VERSANDDIENSTE = Object.freeze(['GLS', 'DHL', 'DPD', 'Hermes', 'UPS', 'Deutsche Post (DE)', 'Spedition']);

/** Zurueckhaltungen, die das Control Center bei "raus" selbst aufhebt (siehe Kopf, Schritt 3). */
const SELBST_AUFHEBBAR = new Set(['INVENTORY_OUT_OF_STOCK']);

const BUCHBAR = new Set(['OPEN', 'IN_PROGRESS']);

export const RECHT_FEHLT_VERSAND = 'Versand nicht in Shopify gebucht: dem Control Center fehlt das Shopify-Recht '
  + 'write_merchant_managed_fulfillment_orders (Inhaber schaltet es im Dev Dashboard frei). '
  + 'Bis dahin in Shopify die Bestellung öffnen und „Artikel versenden“ wählen.';

export const ERGEBNIS_UNKLAR_VERSAND = 'Ob der Versand in Shopify gebucht wurde, ist unklar: Shopify hat nicht geantwortet. '
  + 'Bitte die Bestellung in Shopify ansehen, bevor noch einmal gebucht wird.';

/** Fehler mit `grund`, damit Aufrufer und Oberflaeche die Faelle unterscheiden. Nichts gebucht, ausser grund "unklar". */
export class VersandFehler extends Error {
  constructor(grund, message, extra = {}) { super(message); this.grund = grund; this.extra = extra; }
}

/** Fehlt dem Zugang ein Recht? Shopify meldet das als "Access denied ..." (ACCESS_DENIED) oder HTTP 403. */
export function istZugriffVerweigert(err) {
  return /access denied|ACCESS_DENIED|HTTP 403|required access/i.test(String(err?.message || err));
}

/** Welche Versand-Rechte fehlen in der von Shopify gemeldeten Liste? Ohne Liste (fester Token) nichts behaupten. */
export function fehlendeVersandBereiche(scope) {
  if (scope === null || scope === undefined) return [];
  const erteilt = new Set(String(scope).split(',').map(s => s.trim()).filter(Boolean));
  return VERSAND_BEREICHE.filter(b => !erteilt.has(b));
}

function knoten(conn) {
  return Array.isArray(conn?.nodes) ? conn.nodes : [];
}

/**
 * Ordnet die gewuenschten Positionen dem frisch gelesenen Stand zu. Rein, ohne Shopify.
 * Liefert je Position eine Klasse:
 *   buchbar        - offene Menge in einer buchbaren Fulfillment Order (zeilen: FO-Zeilen mit Menge)
 *   aufhebbar      - offen, aber nur wegen "Bestand fehlt" zurueckgehalten
 *   gehalten       - offen, aber aus anderem Grund zurueckgehalten (meldung: Shopify-Grund)
 *   nicht_buchbar  - offen, aber Shopify bietet keine Buchung an (z. B. geplant)
 *   bereits        - in Shopify nichts mehr offen
 *   unbekannt      - Position gehoert in Shopify nicht (mehr) zu dieser Bestellung
 */
export function ordneZu(order, lineItemIds) {
  const fos = knoten(order?.fulfillmentOrders);
  const ergebnis = [];
  for (const lineItemId of lineItemIds) {
    const treffer = [];
    for (const fo of fos) {
      for (const z of knoten(fo.lineItems)) {
        if (z?.lineItem?.id === lineItemId) treffer.push({ fo, zeile: z });
      }
    }
    if (!treffer.length) { ergebnis.push({ lineItemId, klasse: 'unbekannt' }); continue; }
    const offen = treffer.filter(t => Number(t.zeile.remainingQuantity) > 0);
    if (!offen.length) { ergebnis.push({ lineItemId, klasse: 'bereits' }); continue; }
    const buchbar = [];
    const aufhebbar = [];
    const gehalten = [];
    const sonst = [];
    for (const t of offen) {
      const aktionen = new Set((t.fo.supportedActions ?? []).map(a => a?.action));
      const holds = t.fo.fulfillmentHolds ?? [];
      if (BUCHBAR.has(t.fo.status) && aktionen.has('CREATE_FULFILLMENT')) buchbar.push(t);
      else if (t.fo.status === 'ON_HOLD' && holds.length && holds.every(h => SELBST_AUFHEBBAR.has(h?.reason))) aufhebbar.push(t);
      else if (t.fo.status === 'ON_HOLD') gehalten.push(t);
      else sonst.push(t);
    }
    // Eine Position steht fast immer in genau einer Fulfillment Order. Liegt sie verteilt,
    // entscheidet der ungünstigste Teil - halb buchen hiesse, die Versandmail nennt nur einen Teil.
    if (gehalten.length) {
      const gruende = [...new Set(gehalten.flatMap(t => (t.fo.fulfillmentHolds ?? []).map(h => h?.displayReason || h?.reason)).filter(Boolean))];
      ergebnis.push({ lineItemId, klasse: 'gehalten', meldung: gruende.join(', ') || 'zurückgehalten' });
    } else if (sonst.length) {
      ergebnis.push({ lineItemId, klasse: 'nicht_buchbar', meldung: [...new Set(sonst.map(t => t.fo.status))].join(', ') });
    } else if (aufhebbar.length) {
      ergebnis.push({ lineItemId, klasse: 'aufhebbar', zeilen: aufhebbar });
    } else {
      ergebnis.push({ lineItemId, klasse: 'buchbar', zeilen: buchbar });
    }
  }
  return ergebnis;
}

/** Offene Menge je Position (Summe ueber alle Fulfillment Orders) - fuer Antwortverlust und Gegenprobe. */
export function offeneMengen(order, lineItemIds) {
  const m = new Map(lineItemIds.map(id => [id, 0]));
  for (const fo of knoten(order?.fulfillmentOrders)) {
    for (const z of knoten(fo.lineItems)) {
      const id = z?.lineItem?.id;
      if (m.has(id)) m.set(id, m.get(id) + Math.max(0, Number(z.remainingQuantity) || 0));
    }
  }
  return m;
}

/**
 * Eingabe fuer fulfillmentCreate: je Fulfillment Order genau die Zeilen dieser Positionen
 * mit ihrer offenen Menge - ohne fulfillmentOrderLineItems wuerde Shopify die ganze
 * Fulfillment Order buchen, also auch Positionen, die noch gar nicht raus sind.
 */
export function buchungsEingaben(zuordnung, { benachrichtigen = true, sendungsnummer = null, versanddienst = null } = {}) {
  const jeStandort = new Map();
  for (const z of zuordnung.filter(x => x.klasse === 'buchbar')) {
    for (const { fo, zeile } of z.zeilen) {
      const ort = fo.assignedLocation?.location?.id || 'unbekannt';
      if (!jeStandort.has(ort)) jeStandort.set(ort, { fos: new Map(), lineItemIds: new Set() });
      const s = jeStandort.get(ort);
      if (!s.fos.has(fo.id)) s.fos.set(fo.id, []);
      s.fos.get(fo.id).push({ id: zeile.id, quantity: Number(zeile.remainingQuantity) });
      s.lineItemIds.add(z.lineItemId);
    }
  }
  const nummer = String(sendungsnummer ?? '').trim();
  const dienst = String(versanddienst ?? '').trim();
  return [...jeStandort.entries()].map(([standort, s]) => {
    const fulfillment = {
      notifyCustomer: Boolean(benachrichtigen),
      lineItemsByFulfillmentOrder: [...s.fos.entries()].map(([fulfillmentOrderId, fulfillmentOrderLineItems]) => ({ fulfillmentOrderId, fulfillmentOrderLineItems })),
    };
    // "Spedition" ist kein Paketdienst mit Verfolgungslink - dann nur die Nummer.
    if (nummer) fulfillment.trackingInfo = dienst && dienst !== 'Spedition' ? { number: nummer, company: dienst } : { number: nummer };
    return { standort, fulfillment, lineItemIds: [...s.lineItemIds] };
  });
}

async function lese(proxy, orderId) {
  let data;
  try {
    data = await proxy.execute(STAND_QUERY, { id: orderId });
  } catch (err) {
    if (istZugriffVerweigert(err)) throw new VersandFehler('recht-fehlt', RECHT_FEHLT_VERSAND);
    throw new VersandFehler('nicht-erreichbar', 'Shopify war nicht lesbar – Versand nicht gebucht. Bitte noch einmal versuchen.', { detail: String(err?.message || err).slice(0, 200) });
  }
  if (data === null) throw new VersandFehler('kein-zugang', 'Kein Zugang zu Shopify eingerichtet – Versand nicht gebucht.');
  if (!data?.order) throw new VersandFehler('nicht-gefunden', 'Diese Bestellung gibt es in Shopify nicht (mehr) – Versand nicht gebucht.');
  return data.order;
}

async function leseOderNull(proxy, orderId) {
  try { return await lese(proxy, orderId); } catch { return null; }
}

/** Hebt die "Bestand fehlt"-Zurueckhaltungen der betroffenen Fulfillment Orders auf. Gibt die Zahl zurueck. */
async function hebeAuf(proxy, zuordnung) {
  const fos = new Map();
  for (const z of zuordnung.filter(x => x.klasse === 'aufhebbar')) {
    for (const { fo } of z.zeilen) fos.set(fo.id, (fo.fulfillmentHolds ?? []).map(h => h.id));
  }
  let anzahl = 0;
  for (const [id, holdIds] of fos) {
    let antwort;
    try {
      // eslint-disable-next-line no-await-in-loop -- meist eine einzige Fulfillment Order.
      antwort = await proxy.execute(FREIGEBEN_MUTATION, { id, holdIds });
    } catch (err) {
      if (istZugriffVerweigert(err)) throw new VersandFehler('recht-fehlt', RECHT_FEHLT_VERSAND);
      // Ob die Freigabe angekommen ist, klaert das erneute Lesen danach.
      continue;
    }
    if ((antwort?.fulfillmentOrderReleaseHold?.userErrors ?? []).length === 0) anzahl += 1;
  }
  return anzahl;
}

/**
 * Bucht den Versand der Positionen in Shopify. Wirft VersandFehler, wenn sicher nichts
 * gebucht wurde (oder der Ausgang unklar ist, grund "unklar"); sonst ein Ergebnis.
 *
 * @param {object}   proxy                GraphQLProxy (oder Attrappe mit execute())
 * @param {object}   p
 * @param {string}   p.orderId            gid://shopify/Order/...
 * @param {string[]} p.lineItemIds        Positionen, die in diesem Schritt raus sind
 * @param {boolean}  [p.benachrichtigen]  Versandmail an den Kunden (Standard: ja)
 * @param {string}   [p.sendungsnummer]
 * @param {string}   [p.versanddienst]    einer aus VERSANDDIENSTE oder leer
 * @param {string}   [p.scope]            von Shopify gemeldete Rechte (null = unbekannt)
 * @returns {Promise<{status: 'gebucht'|'teilweise'|'bereits', gebucht: string[], bereits: string[],
 *   nichtGebucht: {lineItemId: string, grund: string, meldung: string}[], fulfillmentIds: string[],
 *   kundeBenachrichtigt: boolean, aufgehoben: number, antwortVerloren: boolean, gegenprobe: string}>}
 */
export async function bucheVersand(proxy, { orderId, lineItemIds, benachrichtigen = true, sendungsnummer = null, versanddienst = null, scope = null } = {}) {
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(String(orderId || ''))) throw new VersandFehler('eingabe', 'Ungültige Bestell-ID – Versand nicht gebucht.');
  const ids = [...new Set((lineItemIds || []).map(String))].filter(id => /^gid:\/\/shopify\/LineItem\/\d+$/.test(id));
  if (!ids.length) throw new VersandFehler('eingabe', 'Keine Position angegeben – Versand nicht gebucht.');
  if (fehlendeVersandBereiche(scope).length) throw new VersandFehler('recht-fehlt', RECHT_FEHLT_VERSAND);
  const nummer = String(sendungsnummer ?? '').replace(/\s+/g, '').slice(0, 60) || null;
  const dienst = VERSANDDIENSTE.includes(versanddienst) ? versanddienst : null;

  // 1./2. Frisch lesen und einordnen.
  let order = await lese(proxy, orderId);
  if (order.cancelledAt) throw new VersandFehler('storniert', 'Die Bestellung ist in Shopify storniert – Versand nicht gebucht.');
  let zuordnung = ordneZu(order, ids);

  // 3. "Bestand fehlt" aufheben, dann neu lesen - der Stand nach der Freigabe zaehlt.
  let aufgehoben = 0;
  if (zuordnung.some(z => z.klasse === 'aufhebbar')) {
    aufgehoben = await hebeAuf(proxy, zuordnung);
    order = await lese(proxy, orderId);
    zuordnung = ordneZu(order, ids).map(z => (z.klasse === 'aufhebbar'
      ? { lineItemId: z.lineItemId, klasse: 'gehalten', meldung: 'Zurückhaltung „Bestand fehlt“ ließ sich nicht aufheben' }
      : z));
  }

  const bereits = zuordnung.filter(z => z.klasse === 'bereits').map(z => z.lineItemId);
  const nichtGebucht = zuordnung.filter(z => ['gehalten', 'nicht_buchbar', 'unbekannt'].includes(z.klasse)).map(z => ({
    lineItemId: z.lineItemId,
    grund: z.klasse,
    meldung: z.klasse === 'gehalten' ? `In Shopify zurückgehalten (${z.meldung}) – dort prüfen und freigeben`
      : z.klasse === 'unbekannt' ? 'Artikel steht in Shopify nicht (mehr) in der Bestellung'
        : `Shopify bietet für diesen Artikel keine Buchung an (${z.meldung})`,
  }));
  const zuBuchen = zuordnung.filter(z => z.klasse === 'buchbar').map(z => z.lineItemId);

  if (!zuBuchen.length) {
    if (nichtGebucht.length) {
      throw new VersandFehler(nichtGebucht[0].grund === 'gehalten' ? 'zurueckgehalten' : 'nicht-buchbar', `Versand nicht in Shopify gebucht: ${nichtGebucht[0].meldung}.`, { nichtGebucht, bereits });
    }
    return { status: 'bereits', gebucht: [], bereits, nichtGebucht: [], fulfillmentIds: [], kundeBenachrichtigt: false, aufgehoben, antwortVerloren: false, gegenprobe: 'ok' };
  }

  // 4. Buchen, eine Buchung je Standort (praktisch immer genau einer). Scheitert eine
  // Buchung, nachdem eine andere schon durch ist, wird das als Teilergebnis gemeldet
  // statt als Fehler - sonst ginge die erfolgte Buchung in der Meldung unter.
  const vorher = offeneMengen(order, zuBuchen);
  const fulfillmentIds = [];
  const gebucht = [];
  let antwortVerloren = false;
  const scheitern = (grund, meldung, teil) => {
    if (!gebucht.length) throw new VersandFehler(grund, meldung, { bereits });
    for (const lineItemId of teil) nichtGebucht.push({ lineItemId, grund, meldung });
  };
  for (const { fulfillment, lineItemIds: teil } of buchungsEingaben(zuordnung, { benachrichtigen, sendungsnummer: nummer, versanddienst: dienst })) {
    let antwort;
    try {
      // eslint-disable-next-line no-await-in-loop -- ein Standort im Normalfall; Reihenfolge ist egal.
      antwort = await proxy.execute(BUCHEN_MUTATION, { fulfillment });
    } catch (err) {
      if (istZugriffVerweigert(err)) { scheitern('recht-fehlt', RECHT_FEHLT_VERSAND, teil); continue; }
      // 5. Antwortverlust: erneut lesen statt "nicht gebucht" zu behaupten. Gezaehlt wird je
      // Position - nach einer Buchung verschiebt Shopify Zeilen gern in neue Fulfillment Orders.
      // eslint-disable-next-line no-await-in-loop
      const pruef = await leseOderNull(proxy, orderId);
      const offen = pruef ? offeneMengen(pruef, teil) : null;
      if (offen && teil.every(id => offen.get(id) === 0)) { antwortVerloren = true; gebucht.push(...teil); continue; }
      if (offen && teil.every(id => offen.get(id) === vorher.get(id))) {
        scheitern('nicht-angekommen', 'Shopify hat die Buchung nicht bestätigt; laut erneutem Lesen ist noch nichts versendet. Bitte noch einmal versuchen.', teil);
        continue;
      }
      scheitern('unklar', ERGEBNIS_UNKLAR_VERSAND, teil);
      continue;
    }
    const fehler = antwort?.fulfillmentCreate?.userErrors ?? [];
    if (fehler.length) {
      // Gleichzeitig von anderer Stelle gebucht? Dann ist es "bereits", kein Fehler.
      // eslint-disable-next-line no-await-in-loop
      const pruef = await leseOderNull(proxy, orderId);
      const offen = pruef ? offeneMengen(pruef, teil) : null;
      if (offen && teil.every(id => offen.get(id) === 0)) { bereits.push(...teil); continue; }
      scheitern('abgelehnt', `Shopify hat die Versandbuchung abgelehnt: ${fehler.map(e => e.message).join('; ')}`.slice(0, 400), teil);
      continue;
    }
    const id = antwort?.fulfillmentCreate?.fulfillment?.id;
    if (id) fulfillmentIds.push(id);
    gebucht.push(...teil);
  }
  if (!gebucht.length) {
    return { status: 'bereits', gebucht: [], bereits, nichtGebucht, fulfillmentIds, kundeBenachrichtigt: false, aufgehoben, antwortVerloren: false, gegenprobe: 'ok' };
  }

  // 6. Gegenprobe. Scheitert nur das Lesen, ist trotzdem gebucht.
  const nachher = await leseOderNull(proxy, orderId);
  let gegenprobe = 'fehlgeschlagen';
  if (nachher) {
    const offen = offeneMengen(nachher, gebucht);
    gegenprobe = gebucht.every(id => offen.get(id) === 0) ? 'ok' : 'abweichung';
  }
  return {
    status: nichtGebucht.length ? 'teilweise' : 'gebucht',
    gebucht,
    bereits,
    nichtGebucht,
    fulfillmentIds,
    kundeBenachrichtigt: Boolean(benachrichtigen),
    sendungsnummer: nummer,
    versanddienst: nummer ? dienst : null,
    aufgehoben,
    antwortVerloren,
    gegenprobe,
  };
}

/** Vermerke der Versandbuchung an den Positionen eines Auftrags (aus auftragsstatus.json). */
export function versandVermerke(auftrag, statusAlle = {}) {
  return (auftrag?.positionen ?? [])
    .filter(p => p?.lineItemId)
    .map(p => statusAlle?.[positionKey(auftrag.id, p.lineItemId)])
    .filter(e => e?.shopifyVersand);
}

/**
 * Positionen, die raus sind, deren Versandbuchung aber scheiterte oder unklar blieb - die
 * kann das Control Center nachholen. Positionen ohne Vermerk (vor dem 13.10. raus) zaehlen
 * nie: sie werden nicht nachtraeglich gebucht. null = nichts nachzuholen.
 */
export function versandNachzuholen(auftrag, statusAlle = {}) {
  const offen = versandVermerke(auftrag, statusAlle)
    .filter(e => ['raus', 'erledigt'].includes(e.status) && ['fehler', 'unklar'].includes(e.shopifyVersand.status));
  if (!offen.length) return null;
  const letzte = offen.reduce((a, b) => (String(b.shopifyVersand.am) > String(a.shopifyVersand.am) ? b : a));
  return {
    anzahl: offen.length,
    unklar: offen.some(e => e.shopifyVersand.status === 'unklar'),
    grund: letzte.shopifyVersand.grund || null,
    meldung: letzte.shopifyVersand.meldung || 'Versand nicht in Shopify gebucht.',
    lineItemIds: offen.map(e => e.lineItemId),
  };
}

/** Sind alle Positionen ab "raus" laut Vermerk in Shopify gebucht (oder waren es schon)? */
export function versandGebucht(auftrag, statusAlle = {}) {
  const ab = (auftrag?.positionen ?? []).filter(p => p?.lineItemId)
    .map(p => statusAlle?.[positionKey(auftrag.id, p.lineItemId)])
    .filter(e => ['raus', 'erledigt'].includes(e?.status));
  return ab.length > 0 && ab.every(e => ['gebucht', 'bereits'].includes(e.shopifyVersand?.status));
}
