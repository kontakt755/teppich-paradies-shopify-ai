# 13 – Abschlussbericht Phase 1 (Analyse)

Datum: 2026-09-22 · Klasse C (fable/high) · Keine Shop-, Theme- oder Dashboard-Aenderung.

## Ergebnis

Das Ziel „Auftrag → pruefen → Knopf → naechster" ist mit dem Bestehenden **nicht erreichbar**, weil die Kette an drei Stellen unterbrochen ist:

1. **Bestellungen kommen nirgends an.** Kein Order-Leseweg, kein Token mit Order-Scope, keine Webhooks, kein Flow. (OPS-001)
2. **Produkte kennen ihren Lieferanten nicht maschinenlesbar.** `grosshandel.sku` ist Freitext, `lieferant.*` ist bei Rollenware leer und bei Fliesen redundant, eine Beschaffungs-ID fehlt. (OPS-002/003)
3. **Es gibt keinen Mitarbeiterbegriff.** Dashboard = GitHub-Issue-Board, oeffentlich, ohne Rollen, ohne Kundendaten – bewusst. (OPS-007)

Gleichzeitig ist viel **fertig und wiederverwendbar**: GraphQL-Client mit Token-Guard, Mengen- und Gruppenlogik der Rechner samt Tests, Masspruefung in der Bestellmail, Musterprodukte mit Quellreferenz, Versandprofile, Verlegeservice, Farbregister, Guards und Hooks, ein sauber erweiterbares Dashboard mit Capability-Gate.

## Empfehlung

Reihenfolge `00-MASTER-PLAN.md`: erst Token (#34) und Schema `einkauf.*` freigeben, dann Order-Leseweg + Ampel, dann Auftragsband, dann Beratung/Muster, dann Einkauf. Ads erst, wenn 3a–3c stabil sind und die Feedprodukte gruene Ampel haben.

Keine neue App, kein Flow, keine zweite Datenbank. Kundendaten bleiben lokal/privat, nie unter `docs/`.

## Belege

Live-Stand per Shopify-MCP (read-only): 690 Produkte, 9 Testbestellungen, 1 Standort, 0 Webhooks, 0 Order-Metafelder. Alle weiteren Belege als `Datei:Zeile` in 01, 02, 03, 08–11.

## Regel-8-Pruefung

Dieser Ordner nennt Lieferanten nur als A–D. Rohdaten und Klarnamen bleiben unter `~/teppich-paradies-analyse/lieferantendaten/`.
