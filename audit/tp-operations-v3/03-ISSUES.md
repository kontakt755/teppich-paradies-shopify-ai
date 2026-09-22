# 03 – Befunde

Prioritaet: P0 blockiert das Ziel · P1 muss vor Ads-Start · P2 sollte · P3 kann. Keine Ueberschneidung mit TP-001…TP-017 aus `audit/ISSUES.md`.

| ID | P | Bereich | Befund | Beleg | Folge |
|---|---|---|---|---|---|
| OPS-001 | P0 | Shopify | Kein Codepfad liest Bestellungen; kein Token mit `read_orders` ausserhalb GitHub Actions; #34 wartet auf `shpat_` | `08-SHOPIFY-INTEGRATION.md` | Auftragsband unmoeglich |
| OPS-002 | P0 | Daten | Beschaffungsdaten in drei Generationen, keine eindeutige Beschaffungs-ID; `grosshandel.sku` ist Freitext mit mehreren SKUs | live-Stichprobe 2026-09-22 | Kein automatisches Erkennen von Lieferant/Art.-Nr. |
| OPS-003 | P1 | Daten | `lieferant.*` bei Vinyl-Rollenware leer, bei Fliesen nur eigene SKU; Rollenware-Teppich 52 Produkte gefuellt | live-Stichprobe | Ampel waere fuer > 80 % rot |
| OPS-004 | P1 | Fulfillment | Interne Bestellmail (Grosshaendler-ID, Masspruefung) fertig, aber nicht im Admin eingesetzt | `domains/shopify/benachrichtigungen/README.md:85-96` | Sicherheitsnetz fehlt |
| OPS-005 | P1 | Ads | 225/225 Feedprodukte `awaiting_review`, 0 GTIN, Versandrichtlinie 404, keine Conversion-Aktionen | `11-ADS-READINESS.md` | Kein Shopping/PMax moeglich |
| OPS-006 | P1 | Beratung | Kein Beratungs-/Rueckruf-Feld im Cart/Checkout | `snippets/cart-summary.liquid:41-92` | §45 nicht erfuellbar |
| OPS-007 | P1 | Rollen | Kein Mitarbeiter-Rechtemodell; lokaler Server ohne Login | `docs/control-center/ARCHITEKTUR.md:89-93` | Rollen-UI §9 nicht moeglich |
| OPS-008 | P1 | Lieferanten | Bestellwege, Direktversand, Mindestabnahmen, Musterversand je Lieferant ungeklaert (`dropshipping_available: null`) | `domains/lieferanten/kleinmengen-dropshipping-2026-09-10.md:154-165` | Routen §36–40 nicht belegbar |
| OPS-009 | P2 | Muster | Muster↔Quelle nur ueber Properties und Optionsnamen; Fallback verliert Struktur | `assets/tp-sample-checkout-core.js:82-125` | Musterrouten unsicher |
| OPS-010 | P2 | Sync | `sync-grosshandel.mjs`: keine Paginierung > 250, Preis-Check vergleicht falsches Feld, Update ist TODO | `workflow/sync-grosshandel.mjs:110-142,198,317` | Nachtjob laeuft ins Leere |
| OPS-011 | P2 | Sync | `sync-orchestrator.mjs` nicht ausfuehrbar; `bulk-update-vendor.mjs` eigener Auth-Pfad ohne Dry-Run | `:62`; `scripts/bulk-update-vendor.mjs:29-37` | Altlast, Fehlrisiko |
| OPS-012 | P2 | Lieferschein | Lieferschein kennt `line_item.properties` nicht; Masse fehlen dort | `domains/shopify/benachrichtigungen/bestelldokumente.md:13-31` | Lager sieht keine Masse |
| OPS-013 | P2 | Leak | Lieferant-A-Name in 63 SKUs / Suche / `/products/*.js`; Inhaberentscheidung 2026-09-15: SKU bleibt | `domains/lieferanten/services/HANDOFF.md:93-104` | Geschlossen, aber fuer §39 relevant |
| OPS-014 | P2 | Orchestrator | `securityReviewer` nie aufgerufen; `QUICK_START.md` Modelltabelle falsch; Parallel-Router in `automation/core` | `workflow/model-matrix.mjs` vs. `automation/core/cli-agent-cycle.mjs:699-715` | Klasse D ohne Security-Review |
| OPS-015 | P3 | Tests | `npm test` startet `automation:test`, `workflow:test`, `control:center:test` nicht | `package.json:4` | Regressionen unbemerkt |
| OPS-016 | P3 | Repo | Doppelungen: `RISK_MAP.yaml`, `run-syncpath-guard.mjs`, `.claude/worktrees/altdateien-raus/`, ~70 Status-Markdown im Root | `01-CURRENT-ARCHITECTURE.md` §5 | Wartbarkeit |
| OPS-017 | P2 | Daten | 8 SKUs doppelt an 16 Produkten, 41 Klebevinyl ohne SKU | `docs/google/tracking-und-feed-validierung-2026-09-11.md:17-18` | Beschaffungs-ID kollidiert |
| OPS-018 | P2 | Versand | Spedition-Hinweis nur nach Metafeld; Route je Variante fehlt; Teilversand-Logik nicht vorhanden | `snippets/cart-summary.liquid:230-245` | §43–44 offen |
| OPS-019 | P3 | Masterprompt | Prompt bricht bei §60 ab | – | Wareneingang/Versand/Probleme/Reklamation nur abgeleitet |
