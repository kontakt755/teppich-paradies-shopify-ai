# 07 – Tests

## Durchgefuehrt (Phase 1)

| Test | Ergebnis |
|---|---|
| Live-Query Shop/Orders/Locations/Metafeld-Definitionen (read-only) | 9 Bestellungen (alle Test), 1 Standort, 0 Order-Metafelder, 0 Webhooks |
| Stichprobe 100 aktive Produkte: `grosshandel.sku`, `lieferant.*`, `custom.farbcode` | Rollenware-Vinyl: `lieferant.*` leer; Fliesen: `lieferant_a_artikelnummer` = SKU; `grosshandel.sku` Freitext mit mehreren SKUs |
| Regel-8-Pruefung dieses Ordners (Lieferantennamen) | siehe `13-FINAL-REPORT.md` |

## Bestehende Suiten, die V3 wiederverwendet

- `qa/tests/bestellmail-masspruefung.test.mjs` – 12 ehrliche / 16 manipulierte Bestellungen (Masspruefung).
- `qa/tests/masstepich-*.test.mjs`, `cart-mengensperre.test.mjs`, `cart-gruppen.test.mjs` – Mengen- und Gruppenlogik.
- `qa/tests/versandschwelle.test.mjs` – eine Quelle fuer die Versandschwelle.
- `docs/ai-dashboard/tests/*` – Server-/API-Muster fuer neue Endpunkte.
- `workflow/tests/graphql-proxy.test.mjs` – Token-Guard.

## Geplante Tests (Phase 3)

| Modul | Test | Fixture |
|---|---|---|
| `operations/sync/orders.mjs` | Paginierung, Delta ab `updated_at`, Properties-Parsing | die 9 Testbestellungen als anonymisierte JSON-Fixtures (Namen/Adressen ersetzt) |
| `operations/lib/resolve.mjs` | Position → procurement_item; fehlende Felder → `UNGEKLAERT`, nie geraten | Varianten mit/ohne `einkauf.*` |
| `operations/lib/umrechnung.mjs` | Rollen (32 m² / 5 m → 6,40 lfm), Paket (34,20 / 2,18 → 16), Leisten (38 lfm / stangenlaenge) | Werte aus Masterprompt §32–34 |
| `operations/lib/route.mjs` | Standard, Override, Fallback bei `neutralversand != VERIFIED`, Mischbestellung → Gruppen | – |
| `operations/lib/einkauf.mjs` | Gruppierung je Lieferant/Ziel, keine Mischung von Direktversandadressen | 25 Auftraege → 5 Gruppen |
| `operations/auth` | Rolle sieht nur erlaubte Views/Endpunkte; Keyboard ENTER loest nichts ohne offenen Auftrag aus | – |
| Ampel | PROCUREMENT_READY je Gruppe | – |

Kein Test darf echte Kundendaten enthalten.
