# 06 – Aenderungen

| Datum | Datei(en) | Aenderung | Warum |
|---|---|---|---|
| 2026-09-22 | `audit/tp-operations-v3/00…13` | Ordner angelegt, 14 Dokumente | Masterprompt V3 §4 |

| 2026-09-22 | Shopify Admin (Metafeld-Definitionen) | Metaobjekte `tp_lieferant` (+ Eintraege lieferant-a, lieferant-b), `tp_einkauf`; 20 Varianten-Metafelder `einkauf.*`; 8 Order-Metafelder `ops.*`; alle Storefront NONE | D2, Inhaberfreigabe „uneingeschraenkt“ |
| 2026-09-22 | `domains/shopify/einkauf-metafelder.json` | Registry des neuen Schemas | Nachvollziehbarkeit |
| 2026-09-22 | Theme (UNPUBLISHED) | Zwei fremde Dateien aus #454 per `push --only` entfernt, damit der Livegang #455 der Nachbarsitzung nicht an PREVIEW_DIFF scheitert; MAIN unberuehrt, Rollen vorher per API geprueft | Deploy-Abstimmung |
| 2026-09-22 | `operations/` | Neues Modul (Umrechnung, Aufloesung, Ampel, Routen, Einkauf, Status, Order-Sync) mit Tests | Phase 3a |

Nicht geaendert: Theme in `main`, Preise, SKUs, Varianten, bestehende Metafelder (`lieferant.*`, `grosshandel.*`, `custom.*`), Dashboard-Code, Benachrichtigungsvorlagen (Aktualisierung abgelehnt, siehe OPS-004).
