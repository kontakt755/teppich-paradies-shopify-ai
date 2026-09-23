# 04 – Fortschritt

Legende: ⬜ OFFEN · 🟡 IN ARBEIT · 🧪 TEST · 🟠 BLOCKIERT · ✅ ERLEDIGT · ❌ FEHLER

| Bereich | Aufgabe | Status | Zustaendig | Dateien | Test | Ergebnis |
|---|---|---|---|---|---|---|
| Analyse | Repo/Dashboard/Sync/Datenmodell/Bestellabwicklung/Orchestrator analysieren (5 parallele Reviewer, 1 Writer) | ✅ | Fable (Orchestrator) | `audit/tp-operations-v3/*` | Belege je Befund | 19 Befunde OPS-001–019 |
| Analyse | Live-Shopify-Stand (Orders, Metafelder, Webhooks, Locations) lesen | ✅ | Fable | `01-CURRENT-ARCHITECTURE.md` §2 | MCP read-only | 9 Testbestellungen, 0 Webhooks, 0 Order-Metafelder |
| Architektur | Entscheidungen D1–D12 formulieren | ✅ | Fable | `05-DECISIONS.md` | – | 3 brauchen Inhaber-Freigabe |
| Shopify | `shpat_`-Token mit `read_orders`/`write_orders`/`read_customers` bereitstellen (#34) | 🟠 | Ahmet (nur Inhaber kann Token anlegen) | `.env.local` (nie Repo) | `router:status` | Blocker fuer alles Weitere |
| Shopify | Order-Leseweg `operations/sync/orders.mjs` auf Basis `graphql-proxy.mjs` | 🟡 | Fable | `operations/` | `operations/tests/orders.test.mjs` | – |
| Daten | Metafeld-Definitionen `einkauf.*` (20), Metaobjekte `tp_lieferant` (Eintraege A, B), `tp_einkauf`, Order-Namespace `ops` (8) anlegen | ✅ | Fable via MCP | `domains/shopify/einkauf-metafelder.json` | Definitionen per Query gegengelesen: 20/20 und 8/8 vorhanden | 2026-09-22, Freigabe „uneingeschraenkt“ vom Inhaber |
| Daten | `grosshandel.sku` halbautomatisch in `einkauf.*` zerlegen, Rest `UNGEKLAERT` | ⬜ | Fable | Skript + Report | Stichprobe 50 | – |
| Daten | Produktampel + Ansicht „Produkte unvollstaendig" | ⬜ | Fable | `operations/lib/ampel.mjs` | Unit | – |
| Fulfillment | Interne Bestellmail im Admin auf Repo-Stand bringen (Block ersetzen, Testbenachrichtigung) | 🟠 | Ahmet (Admin) | `domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid` | Testbenachrichtigung | Admin enthaelt alte Fassung; Automation abgelehnt |
| Auftraege | Auftragsband: EIN Kunde, FREIGEBEN/SPAETER/PROBLEM, Keyboard-Mode | ⬜ | Fable | `operations/ui/` | Dashboard-Tests | – |
| Auftraege | Globale Suche ueber Kunde/Auftrag/SKU/Farbnr/Tracking | ⬜ | Fable | `operations/api/search.mjs` | Unit | – |
| Beratung | Pflichtfeld Cart-Attribute + BERATUNG-Kachel | ⬜ | Fable (Theme Klasse B) | `snippets/cart-summary.liquid`, `blocks/tp-beratung.liquid` | `qa/tests/` | nach D9 |
| Einkauf | Gruppierung je Lieferant/Lieferziel, Einkaufs-ID, Vorschau, manuelles Senden | ⬜ | Fable | `operations/lib/einkauf.mjs` | Unit + Fixture-Bestellungen | – |
| Einkauf | Mengenumrechnung Rollen/Paket/Leisten aus vorhandenen Regeln | ⬜ | Fable | `operations/lib/umrechnung.mjs` | gegen `qa/tests/masstepich-*` | Lieferantenschritte UNGEKLAERT |
| Muster | Musterrouten (Lager/Schneiden/Lieferant), beidseitige Referenz | ⬜ | Fable | Theme + Metafelder | Unit | – |
| Versand | Routen, Fallback, Mischbestellung, Teilversand, Tracking-Rueckfluss | ⬜ | Fable | `operations/lib/route.mjs` | Unit | Neutralversand je Lieferant UNGEKLAERT |
| Rollen | Login + Rollen (Leitung/Verkauf/Einkauf/Lager/Kundenservice) lokal | ⬜ | Fable | `operations/auth/` | Server-Tests | nach D11 |
| Ads | Merchant-Center-Blocker (Versandrichtlinie, GTIN/custom_product, Conversions) | 🟠 | Ahmet + Fable | `11-ADS-READINESS.md` | Merchant-Diagnose | Inhaberhandlungen |
| Repo | Sync-Bugs OPS-010/011 beheben oder Skripte stilllegen | ✅ | Opus 5 | `workflow/sync-grosshandel.mjs`, D6-Loeschungen, `.github/workflows/grosshandel-sync.yml` | `workflow:test` 89 gruen | Paginierung, tote Preissperre und irrefuehrender Erfolgsbericht behoben; zwei Auth-Pfade entfernt; Nachtlauf ausgesetzt bis #34 |
