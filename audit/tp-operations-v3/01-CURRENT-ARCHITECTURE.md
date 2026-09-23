# 01 – Ist-Architektur

Stand 2026-09-22. Belege als `Datei:Zeile`.

## 1. Drei Oberflaechen, keine Datenbank, keine Rollen

| Verzeichnis | Start / Port | Rolle | Auth | Schreibt |
|---|---|---|---|---|
| `docs/ai-dashboard/` + `scripts/serve-dashboard.mjs` + `scripts/dashboard-api.mjs` | `npm run dashboard`, 8001, nur 127.0.0.1 | **das** Control Center (GitHub Pages + lokaler Modus) | keine; Identitaet = `gh`-Konto im Keychain (`dashboard-api.mjs:71-75`) | Labels, Assignee, Kommentare auf GitHub Issues |
| `automation/dashboard/` | `npm run automation:dashboard`, 4310 | KI-Steuerzentrale (Agentenzyklus), aeltester Strang | Shared-Secret-Token + Session-Cookie (`server.mjs:40-52,133-136`) | Issues, Kommentare |
| `control-center/` | `npm run control:center`, 4177 | read-only Pipeline-Monitor | keine, 405 auf alles ausser GET/HEAD | nichts |

Stack: Vanilla ES-Module, kein Framework, kein Build, Node ≥ 20. Persistenz: **ausschliesslich GitHub Issues und JSON-Dateien** (`issues.json` Schema 2, `.router/*.jsonl`, `~/Library/Application Support/TP AI Dashboard/`). Keine SQLite, kein Postgres.

Grenzen sind dreifach dokumentiert: keine Kundendaten, Umsaetze oder Zugangsdaten in Issues oder `docs/` (`docs/ai-dashboard/README.md:83-84`, `docs/control-center/ARCHITEKTUR.md:68,111-114`). Insights hat eine bewusst leere Kachel „Kennzahlen aus Shop, Ads und Analytics – noch nicht verbunden" (`app.js:507-509`).

Views heute: Heute · Arbeit · Freigaben · Bereiche · Insights · Aktivitaet (`index.html:28-35`, `app.js:749`). Alles bezieht sich auf **Aufgaben** (Issues), nichts auf Kunden oder Bestellungen.

## 2. Shopify-Anbindung

- `workflow/graphql-proxy.mjs`: Admin-GraphQL-Client, `SHOPIFY_ADMIN_TOKEN`, API `2026-07`, Store hart codiert, atkn_-Guard (`:36-40`), Sammelmodus ohne Token. **Einziger wiederverwendbarer Client.**
- `workflow/sync-grosshandel.mjs`: Produkt-Sync fuer 7 Leistenartikel aus `data/grosshandel-catalog.json`. Bugs: keine Paginierung ueber 250 Produkte (`:110-142`), Preis-Check vergleicht falsches Feld (`:198-199`), Update-Funktion ist TODO (`:317`).
- `scripts/bulk-update-vendor.mjs`: zweiter Auth-Pfad mit eigenen Env-Namen und API `2024-07`, ohne Dry-Run. Altlast.
- `workflow/sync-orchestrator.mjs`: Attrappe, macht nichts (`:62`).
- Shopify-MCP: der dokumentierte Sollweg fuer Schreibzugriffe (`CLAUDE.md`, „Shopify-Schreibzugriff").
- **Orders/Customers/Fulfillment: kein Code.** Kein Webhook-Empfaenger, Shopify Flow nicht installiert, Lexware nur als Doku (`domains/lexware/api-funktionsumfang.md:19` „Heute: nichts").

Live-Stand (per MCP 2026-09-22): 690 Produkte, **9 Bestellungen (alle Testbestellungen, `note` „Darf storniert werden")**, 1 Standort, 0 Webhook-Subscriptions, 0 Order-/Customer-Metafeld-Definitionen, kein Shopify Plus.

## 3. Theme (Horizon) – was fuer Operations relevant ist

- Klassifizierung je Produkt: `snippets/tp-verkaufseinheit.liquid` → `paket | rolle | stueck | einzel`.
- Rechner erzeugen Line-Item-Properties (Masse, Flaeche, Farbnummer, `_Gruppe`) und Cart-Attribute `Zuschnitt <Gruppe>` – die einzige Stelle, an der Bestellmengen-Semantik heute entsteht (`02-DATA-MODEL.md` §3).
- Muster: eigenes Musterprodukt je Qualitaet, SKU `M-<Quell-SKU>`, Bezug zum Ursprung nur ueber Properties `_Quellprodukt_ID`/`_Quellvariante_ID`.
- Beratung: **kein** Feld im Cart/Checkout; nur Kontaktformulare mit `contact[Anliegen]` (Rueckruf u. a.) und Lead-Events.
- Versand: Schwelle als Theme-Setting `tp_versand_frei_ab`, Profile DE 4,99 €/ab 50 € frei, Muster 0 €. Versandrichtlinie `/policies/shipping-policy` = **404**.

## 4. Orchestrator und Guards

- Klassifikation A–D nur in `workflow/router.mjs`; Modelle in `workflow/model-matrix.mjs`. Diese Aufgabe: Klasse C (fable/high, Review astra, Zweitblick sol).
- Parallelsystem `automation/core/task-router.mjs` + `provider-router.mjs` (eigenes Rollen-/Modellschema); `QUICK_START.md:7-12` mit veralteter Modelltabelle.
- `securityReviewer` aus der Matrix wird **nirgends aufgerufen** – Klasse-D-Security-Review existiert nur auf dem Papier.
- Harte Grenzen: `.claude/hooks/git-gh-guard.mjs` (deny, fail-closed), `theme-delete-guard.mjs`, `deploy-command-guard.mjs`, `model-gate.mjs`.
- Rechtemodell fuer Mitarbeiter: **nicht vorhanden**; nur Stufenplan in `docs/control-center/ARCHITEKTUR.md:89-93`.

## 5. Doppelungen (Bereinigungskandidaten, nicht Teil dieses Vorhabens)

`RISK_MAP.yaml` — **2026-09-23 geprueft: keine Kopie**, der Inhalt weicht vom YAML-Block in `RISK_MODEL_SPEC.md` ab und `CLAUDE.md` nennt die Datei als Quelle; bleibt; `qa/run-sync-path-guard.mjs` vs. `run-syncpath-guard.mjs` (letzterer tot); `EXTEND_SYNC_SYSTEM.md`/`GROSSHANDEL_SYNC.md` beschreiben dasselbe; fuenf Python-Skripte fuer dieselbe `metafieldsSet`-Mutation; `automation/dashboard/` abgeloest; `.claude/worktrees/altdateien-raus/` komplette Repo-Kopie; `npm test` startet drei von sechs Suiten nicht.

## 6. Andockpunkte (sauber, ohne Umbau)

1. Neuer View im flachen `VIEWS`-Objekt (`app.js:749`) + Link in `index.html:28-35`.
2. Neue Route-Zweige in der Regex `serve-dashboard.mjs:74`; Schutz (POST+JSON+Same-Origin+127.0.0.1) gilt automatisch.
3. `capabilities()` (`dashboard-api.mjs:106-115`) um `operations: true|false` erweitern → im statischen Pages-Modus automatisch ausgeblendet (Muster `agentRuns`).
4. Datenquelle: `workflow/graphql-proxy.mjs` importieren, keinen zweiten Client bauen.
5. Rollenpruefung in `createApi()` (`dashboard-api.mjs:59`), dort liegen `currentUser()` und das Audit-Log.

Nicht anfassen: `lib/model.mjs` (Aufgabe ≠ Auftrag → eigenes Modul), `build-dashboard-data.mjs` (erzeugt oeffentliche Datei), `control-center/server.mjs`.
