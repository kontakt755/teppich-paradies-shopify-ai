# Sicherung vor der Weiterentwicklung (2026-10-08)

Stand, bevor im Rahmen von `SHOPIFY_WEITERENTWICKLUNG.md` irgendetwas an Shopify-Daten
geaendert wird. Nur lesend erhoben.

| Datei / Ort | Inhalt | Wiederherstellen |
|---|---|---|
| `2026-10-08-kollektionen-aktionen.json` | alle 46 Smart-Kollektionen mit Regeln und Vorlagen-Suffix (Shopify CLI `store execute`) | Regeln per `collectionUpdate(input:{id, ruleSet})` zuruecksetzen |
| `2026-10-08-hauptmenue.json` | `main-menu` vollstaendig mit allen MenuItem-IDs (Admin API ueber MCP; der CLI-Token darf keine Menues lesen) | `menuUpdate` mit dem **ganzen** Baum und den IDs, Gegenprobe: identische ID-Menge (`docs/lessons/tote-menuelinks.md`) |
| Theme `entwicklung` (`domains/shopify/live-theme.json`) | vollstaendige Kopie des Live-Themes per `themeDuplicate` inkl. `config/settings_data.json` | ist selbst die Sicherung des Theme-Stands vom 2026-10-08 |
| `~/teppich-paradies-analyse/sicherungen/2026-10-08-weiterentwicklung/` (nur lokal) | `config/settings_data.json`, `sections/header-group.json`, `sections/footer-group.json` des Live-Themes | `shopify theme push --only <datei>` in ein **unveroeffentlichtes** Theme, nie direkt live |

Metaobjekt `tp_aktion`: ein Eintrag (`test-anzeige-2026-09-22`, `aktiv=false`). Der CLI-Token
liest keine Metaobjekte; der Stand stammt aus der Admin API (MCP).
