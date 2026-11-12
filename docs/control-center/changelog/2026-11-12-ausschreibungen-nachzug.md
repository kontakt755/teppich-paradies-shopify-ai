## 2026-11-12 · Ausschreibungen: Bodenleger, Eröffnungstermin, höflicher Abruf

- **Geaendert:** Titel mit „Bodenleger…“ zählen als Treffer (Berlin: „Maler- und Bodenlegerarbeiten“). Nennt der Berliner Feed nur einen Eröffnungstermin, gilt er als Frist; solche Treffer bleiben damit auch nach dem Verschwinden aus dem Feed stehen. Die RSS-Abrufe tragen eine eigene Kennung, zwischen den Abrufen bei service.bund.de liegen 30 Sekunden (Crawl-delay der Seite).
- **Getestet:** `operations/tests/ausschreibungen.test.mjs` (neuer Fall Eröffnungstermin), `npm run -s pruefen`, Probelauf `npm run ausschreibungen:pruefen -- --tage 14`.
- **Risiken/Annahmen:** Der Lauf dauert rund 3,5 Minuten länger. Die robots.txt von service.bund.de schließt den Suchpfad für Roboter aus; der Abruf bleibt auf Entscheidung des Benutzers (12.11.) beim offiziellen RSS-Export, wöchentlich und mit Abstand.
- **Nächste Stufe:** Lauf zweimal je Woche, falls Berliner Treffer fehlen.
