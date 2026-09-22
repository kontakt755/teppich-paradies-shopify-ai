# 08 – Shopify-Integration

## Ist

| Bereich | Stand | Beleg |
|---|---|---|
| Admin-Client | `workflow/graphql-proxy.mjs` (`SHOPIFY_ADMIN_TOKEN`, API 2026-07, atkn_-Guard, Sammelmodus) | `:33-66` |
| Token | lokal keiner; Repository-Secret nur fuer `grosshandel-sync.yml`; `atkn_` ohne Admin-GraphQL; #34 wartet auf `shpat_` | `docs/lessons/shopify-schreibzugriff.md` |
| MCP | authentifiziert, Sollweg fuer Produkt-/Metafeld-Schreiben | `CLAUDE.md` |
| Orders | **kein Code**; einzige Verarbeitung im Liquid-Block der Mitarbeiterbenachrichtigung (noch nicht eingesetzt) | `domains/shopify/benachrichtigungen/` |
| Customers | kein Code | – |
| Fulfillment/Tracking | kein Code; 1 Standort, `fulfillsOnlineOrders: true`, kein Bestand (`tracksInventory: false`) | live |
| Webhooks | 0 Subscriptions; Flow nicht installiert | live, README:60-63 |
| Lexware | nur Doku; API kann Lieferschein/Rechnung anlegen + Webhooks; Auth Bearer-Key nur `.env.local` | `domains/lexware/api-funktionsumfang.md` |
| Metafelder | siehe `02-DATA-MODEL.md` | live |

## Soll (Phase 3a)

1. **Token (D3):** ein `shpat_` mit Scopes `read_orders write_orders read_customers read_products write_products read_fulfillments write_fulfillments read_merchant_managed_fulfillment_orders write_merchant_managed_fulfillment_orders`. Nur in `.env.local`; `router:status` meldet Vorhandensein ohne Wert.
2. **Order-Sync (Polling):** `orders(first:50, query:"updated_at:>=<letzter Lauf>", sortKey:UPDATED_AT)` mit `customAttributes`, `note`, `lineItems{sku quantity variant{id product{id}} customAttributes}`, `shippingAddress`, `displayFinancialStatus`, `displayFulfillmentStatus`, `metafields(namespace:"ops")`, `tags`. Paginierung Pflicht (Lehre aus OPS-010).
3. **Aufloesung je Position:** `variant.metafields(namespace:"einkauf")` → procurement_item; Muster ueber `_Quellvariante_ID` bzw. `einkauf.quellvariante`; Masse aus Properties (`Maße`, `Fläche`, `Aus Rolle`, `Gewünschte Länge`, `_bedarf_qm`, `_pakete`) – Masspruefung wie im Bestellmail-Block nachrechnen, nicht die Property `Fläche` glauben.
4. **Zustand schreiben:** `metafieldsSet` auf Order (`ops.*`) + `tagsAdd`/`tagsRemove`. Vor jedem Schreiben lesen, nach jedem Schreiben gegenpruefen (`userErrors: []` ist kein Beleg).
5. **Fulfillment (Phase 3e):** `fulfillmentCreateV2` mit Tracking; Teilversand ueber FulfillmentOrders je Gruppe. Direktversand: Tracking des Lieferanten manuell eintragen, Kunde bekommt Shopify-Versandmail von uns.
6. **Lexware (spaeter, HIGH-Risk, NEEDS_AHMET):** Lieferschein/Rechnung anlegen nach Freigabe; Rate-Limit 2 req/s.

## Verbote

- Keine Preise, SKUs, Varianten, Versand-, Steuer-, Checkout-Einstellungen ohne Freigabe (`AGENTS.md`).
- Kein zweiter GraphQL-Client. Kein Token im Repo, in Logs, in Issues.
- Keine Kundendaten in `docs/`, Issues, `issues.json`, Task-Notizen.
