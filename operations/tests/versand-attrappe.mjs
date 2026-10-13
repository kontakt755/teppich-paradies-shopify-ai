// Attrappe der Shopify Admin API fuer die Versand-Tests (operations/tests und
// docs/ai-dashboard/tests). Kein Test spricht echtes Shopify. Die Attrappe fuehrt
// Fulfillment Orders mit offener Menge, bucht wie Shopify (Menge runter, Status
// CLOSED/IN_PROGRESS) und merkt sich jeden Aufruf - so belegt ein Test auch, was
// NICHT geschrieben wurde. Nur erfundene IDs, keine echten Bestellungen.

export const BESTELLUNG = 'gid://shopify/Order/5001';
export const STANDORT = 'gid://shopify/Location/1';
export const li = n => `gid://shopify/LineItem/${n}`;

/**
 * Eine Fulfillment Order.
 * @param {string} id          Kurzname, wird zu gid://shopify/FulfillmentOrder/<id>
 * @param {object[]} zeilen    [{ n, menge, offen? }] - n = LineItem-Nummer
 * @param {object} [o]
 * @param {string} [o.status='OPEN']
 * @param {object[]} [o.holds] [{ reason, displayReason? }]
 */
export function fo(id, zeilen, { status = 'OPEN', holds = [], standort = STANDORT } = {}) {
  return {
    id: `gid://shopify/FulfillmentOrder/${id}`,
    status,
    standort,
    holds: holds.map((h, i) => ({ id: `gid://shopify/FulfillmentHold/${id}${i}`, reason: h.reason, displayReason: h.displayReason || h.reason })),
    zeilen: zeilen.map(z => ({ id: `gid://shopify/FulfillmentOrderLineItem/${id}${z.n}`, lineItemId: li(z.n), total: z.menge ?? 1, offen: z.offen ?? z.menge ?? 1 })),
  };
}

function aktionen(f) {
  if (f.status === 'ON_HOLD') return ['RELEASE_HOLD'];
  if (['OPEN', 'IN_PROGRESS'].includes(f.status)) return ['CREATE_FULFILLMENT', 'HOLD'];
  return [];
}

/**
 * @param {object} [o]
 * @param {object[]} [o.fos]           Fulfillment Orders (fo())
 * @param {boolean} [o.storniert]
 * @param {boolean} [o.test]                     Shopify-Testbestellung
 * @param {'lesen'|'buchen'|null} [o.verweigert]  wo Shopify "Access denied" meldet
 * @param {'vor'|'nach'|null} [o.antwortWeg]      Buchung ohne Antwort: 'nach' = Shopify hat gebucht, 'vor' = nie angekommen
 * @param {number[]} [o.lesenScheitert]            Nummern der Lesungen (1 = erste), die mit Netzfehler enden
 * @param {string[]|null} [o.userErrors]           fulfillmentCreate meldet diese Fehler, ohne zu buchen
 * @param {boolean} [o.gleichzeitigGebucht]        mit userErrors: jemand anders hat in dem Moment gebucht
 * @param {number} [o.verzoegerung]                ms je Aufruf (fuer gleichzeitige Klicks)
 * @param {number} [o.buchenVerzoegerung]          ms nur fuer die Buchung (Zeitlimit; gebucht wird danach trotzdem)
 * @param {boolean} [o.mehrSeiten]                 Shopify meldet weitere Seiten Fulfillment Orders
 */
export function versandAttrappe({ fos = [fo('1', [{ n: 1 }, { n: 2 }])], storniert = false, test = false, verweigert = null, antwortWeg = null, lesenScheitert = [], userErrors = null, gleichzeitigGebucht = false, verzoegerung = 0, buchenVerzoegerung = 0, mehrSeiten = false } = {}) {
  const zustand = { fos: structuredClone(fos), fulfillments: [] };
  const aufrufe = [];
  let lesungen = 0;
  const warte = () => (verzoegerung ? new Promise(r => setTimeout(r, verzoegerung)) : Promise.resolve());

  const order = () => ({
    id: BESTELLUNG, name: '#T5001', test, cancelledAt: storniert ? '2026-10-01T00:00:00Z' : null, displayFulfillmentStatus: 'UNFULFILLED',
    fulfillmentOrders: { pageInfo: { hasNextPage: mehrSeiten }, nodes: zustand.fos.map(f => ({
      id: f.id, status: f.status,
      assignedLocation: { location: { id: f.standort } },
      supportedActions: aktionen(f).map(action => ({ action })),
      fulfillmentHolds: f.holds.map(h => ({ id: h.id, reason: h.reason, displayReason: h.displayReason })),
      lineItems: { nodes: f.zeilen.map(z => ({ id: z.id, remainingQuantity: z.offen, totalQuantity: z.total, lineItem: { id: z.lineItemId } })) },
    })) },
  });

  function buche(eingabe) {
    for (const g of eingabe.lineItemsByFulfillmentOrder) {
      const f = zustand.fos.find(x => x.id === g.fulfillmentOrderId);
      if (!f || !['OPEN', 'IN_PROGRESS'].includes(f.status)) return [{ field: ['fulfillment'], message: 'Fulfillment order is not in a fulfillable state.' }];
      for (const z of g.fulfillmentOrderLineItems ?? f.zeilen.map(x => ({ id: x.id, quantity: x.offen }))) {
        const zeile = f.zeilen.find(x => x.id === z.id);
        if (!zeile || zeile.offen < z.quantity) return [{ field: ['fulfillment'], message: 'Invalid fulfillment order line item quantity requested.' }];
      }
    }
    for (const g of eingabe.lineItemsByFulfillmentOrder) {
      const f = zustand.fos.find(x => x.id === g.fulfillmentOrderId);
      for (const z of g.fulfillmentOrderLineItems) f.zeilen.find(x => x.id === z.id).offen -= z.quantity;
      f.status = f.zeilen.every(x => x.offen === 0) ? 'CLOSED' : 'IN_PROGRESS';
    }
    const id = `gid://shopify/Fulfillment/${900 + zustand.fulfillments.length}`;
    zustand.fulfillments.push({ id, eingabe });
    return id;
  }

  const proxy = {
    live: true,
    async execute(query, variables = {}) {
      const name = query.match(/(query|mutation)\s+(\w+)/)?.[2];
      aufrufe.push({ name, variables: structuredClone(variables) });
      await warte();
      if (name === 'VersandStand') {
        lesungen += 1;
        if (verweigert === 'lesen') throw new Error('Shopify GraphQL: Access denied for fulfillmentOrders field. Required access: `read_merchant_managed_fulfillment_orders` access scope.');
        if (lesenScheitert.includes(lesungen)) throw new Error('Shopify Admin API: fetch failed (ECONNRESET)');
        return { order: variables.id === BESTELLUNG ? order() : null };
      }
      if (name === 'VersandFreigeben') {
        const f = zustand.fos.find(x => x.id === variables.id);
        f.holds = f.holds.filter(h => !(variables.holdIds || []).includes(h.id));
        if (!f.holds.length) f.status = 'OPEN';
        return { fulfillmentOrderReleaseHold: { fulfillmentOrder: { id: f.id, status: f.status }, userErrors: [] } };
      }
      if (name === 'VersandBuchen') {
        if (verweigert === 'buchen') throw new Error('Shopify GraphQL: Access denied for fulfillmentCreate field. Required access: `write_merchant_managed_fulfillment_orders` access scope.');
        if (antwortWeg === 'vor') throw new Error('Shopify Admin API: fetch failed (ECONNREFUSED)');
        if (buchenVerzoegerung) await new Promise(r => setTimeout(r, buchenVerzoegerung));
        if (userErrors) {
          if (gleichzeitigGebucht) buche(variables.fulfillment);
          return { fulfillmentCreate: { fulfillment: null, userErrors: userErrors.map(message => ({ field: ['fulfillment'], message })) } };
        }
        const ergebnis = buche(variables.fulfillment);
        if (Array.isArray(ergebnis)) return { fulfillmentCreate: { fulfillment: null, userErrors: ergebnis } };
        if (antwortWeg === 'nach') throw new Error('Shopify Admin API: fetch failed (ECONNRESET)');
        const t = variables.fulfillment.trackingInfo;
        return { fulfillmentCreate: { fulfillment: { id: ergebnis, status: 'SUCCESS', trackingInfo: t ? [{ number: t.number, company: t.company ?? null, url: null }] : [] }, userErrors: [] } };
      }
      throw new Error(`Attrappe kennt ${name} nicht`);
    },
  };
  return {
    proxy,
    aufrufe,
    zustand,
    buchungen: () => aufrufe.filter(a => a.name === 'VersandBuchen'),
    schreibend: () => aufrufe.filter(a => a.name !== 'VersandStand'),
  };
}
