# 05 – Entscheidungen

Status: **vorgeschlagen** = vom Orchestrator festgelegt, ausfuehrbar · **Freigabe noetig** = Inhaber (Ahmet) entscheidet.

| ID | Entscheidung | Begruendung | Verworfen | Status |
|---|---|---|---|---|
| D1 | Operations-Modul als eigenes Verzeichnis `operations/` (Node, gleicher Stack wie Control Center), Oberflaeche nur im lokalen/privaten Modus, **nie** unter `docs/` und nie auf GitHub Pages | Repo ist oeffentlich; Kundendaten duerfen nicht in `docs/`, `issues.json` oder Issues (`README.md:83-84`) | Kundenbereich direkt in `docs/ai-dashboard/` | vorgeschlagen |
| D2 | Beschaffungsstammdaten als Varianten-Metafelder `einkauf.*` + Metaobjekt `tp_lieferant`; Shopify bleibt Master, keine zweite Stammdaten-DB | Metafelder sind im Admin sichtbar, per MCP schreibbar, ueberleben Repo-Umbauten; `lieferant.*` bleibt unangetastet (Keys unveraenderlich) | SQLite als Stammdaten-DB; Umbenennen von `lieferant.*` | **Freigabe noetig** (Schema `02-DATA-MODEL.md` §2) |
| D3 | Ein `shpat_`-Token mit `read_orders`, `write_orders`, `read_customers`, `read_products`, `write_products`, `read_fulfillments`, `write_fulfillments` nur in `.env.local` des Betriebs-Macs bzw. privaten Hosts | Ohne Order-Scope kein Auftragsband; MCP-Session ist nicht fuer Dauerbetrieb geeignet | Weiter nur MCP | **Freigabe noetig** (#34) |
| D4 | Auftragszustand als Order-Metafelder `ops.*` + Tags; lokales JSONL nur als Audit-Log | Zustand in Shopify sichtbar, mehrere Rechner konsistent, keine Sync-Konflikte | Zustand nur lokal | vorgeschlagen |
| D5 | Kein Shopify Flow, keine kostenpflichtige App, kein Webhook-Endpunkt in Phase 3a; Bestellungen per Polling (60 s) ueber `orders(query:"updated_at:>…")` | Volumen heute 0–3 Bestellungen/Monat; Webhooks brauchen oeffentlichen Endpunkt und Secret-Handling | App-basierte Auftragsverwaltung | vorgeschlagen |
| D6 | `workflow/graphql-proxy.mjs` als einziger Admin-Client; `bulk-update-vendor.mjs` stilllegen; `sync-orchestrator.mjs` loeschen oder als Doku markieren | Drei Auth-Pfade sind der belegte Grund fuer #34 | – | vorgeschlagen |
| D7 | Mengenumrechnung als reine Funktion mit den bestehenden Rechnerregeln; Lieferantenschritte (lfm-Raster, Mindestabnahme) bis zur Klaerung als `UNGEKLAERT` sichtbar, nie geraten | Masterprompt §35, Regel „keine Rundungsregeln erfinden" | Pauschale 0,1-m-Schritte | vorgeschlagen |
| D8 | Einkauf zum Start nie automatisch senden: System bereitet PDF/Mail-Entwurf vor, Mitarbeiter drueckt BESTELLUNG SENDEN | Masterprompt §59 | Auto-Mail | vorgeschlagen |
| D9 | Beratungspflichtfeld als Cart-Attribute im Warenkorb (Theme), nicht im Checkout | Kein Shopify Plus, Checkout nicht anpassbar | Checkout-Extension | **Freigabe noetig** (Theme-Aenderung sichtbar fuer Kunden) |
| D10 | Muster beidseitig referenzieren (`einkauf.muster_variante` / `einkauf.quellvariante`); Properties bleiben Kundensicht | Fallback verliert Struktur (OPS-009) | Nur Properties | vorgeschlagen |
| D11 | Rollen als lokale Benutzerliste (Datei ausserhalb Repo, gehashte Passwoerter, Rollen Leitung/Verkauf/Einkauf/Lager/Kundenservice), serverseitig in `createApi()` geprueft; Oberflaeche reduziert sich nach Rolle | Lagerpersonal hat keine GitHub-Konten; GitHub-Collaborator-Rollen passen nur fuer Aufgaben | GitHub-Collaborator-Rollen fuer alle | **Freigabe noetig** |
| D12 | Der laufende Frontend-Audit `audit/` bleibt unberuehrt; Theme-Aenderungen aus V3 (Beratungsfeld, Musterreferenz) laufen ueber normale PRs mit Guards | Trennung Analyse vs. Umsetzung | – | vorgeschlagen |

## Abgelehnte Vorschlaege des Masterprompts (mit Begruendung)

- **Routing-Prioritaet §42 unveraendert uebernehmen:** Reihenfolge ist plausibel, aber Punkt 4 „vorhandener Eigenbestand" ist nicht pruefbar – Shopify fuehrt keinen Bestand (`tracksInventory: false`, ein Standort). Erst Bestandsfuehrung klaeren.
- **Beispiel-ID mit Lieferanten-Klarname §22:** Klarname im Format verstoesst gegen Regel 8; Format nutzt Pseudonym-Kuerzel.
- **Sockelleisten pauschal 2,5 m §34:** Stangenlaenge ist je Artikel belegt (2,4 / 2,5 / 4,0 / 5,15 m); Regel kommt aus `custom.stangenlaenge`.
